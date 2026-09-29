use crate::invite::{InviteError, PeerInvite};
use crate::models::{sha256, DeviceIdentity};
use crate::protocol::{
    self, Accept, Hello, PairingApproval, PairingOffer, ProtocolError, SyncBatch, SyncMessage,
    SyncReject, SyncRequest, CONNECTION_VERSION, MAX_PACKETS_PER_BATCH, MAX_SYNC_WINDOWS,
    SYNC_VERSION,
};
use crate::storage::{PairingRecord, PeerRecord, StorageError, Store};
use crate::transport::{self, TransportError};
use std::io;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const DESKTOP_PLATFORM: &str = "windows";
pub const DESKTOP_ROLE: &str = "computer";
pub const DESKTOP_CAPABILITIES: &[&str] = &["mycelium", "packet_ledger", "persistent_storage"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerSyncOutcome {
    Success,
    Failed,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerSyncStage {
    Connect,
    Hello,
    Accept,
    Pull,
    Import,
    ReverseSync,
    Complete,
}
impl std::fmt::Display for PeerSyncStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Connect => "connect",
                Self::Hello => "hello",
                Self::Accept => "accept",
                Self::Pull => "pull",
                Self::Import => "import",
                Self::ReverseSync => "reverse_sync",
                Self::Complete => "complete",
            }
        )
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerSyncErrorCategory {
    InvalidPeerConfig,
    Unreachable,
    Timeout,
    PairingMismatch,
    ProtocolMismatch,
    RemoteRejected,
    MalformedFrame,
    ValidationFailed,
    ImportFailed,
    Io,
    Unknown,
}
impl std::fmt::Display for PeerSyncErrorCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::InvalidPeerConfig => "invalid_peer_config",
                Self::Unreachable => "unreachable",
                Self::Timeout => "timeout",
                Self::PairingMismatch => "pairing_mismatch",
                Self::ProtocolMismatch => "protocol_mismatch",
                Self::RemoteRejected => "remote_rejected",
                Self::MalformedFrame => "malformed_frame",
                Self::ValidationFailed => "validation_failed",
                Self::ImportFailed => "import_failed",
                Self::Io => "io",
                Self::Unknown => "unknown",
            }
        )
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PeerSyncResult {
    pub remote_node_id: String,
    pub outcome: PeerSyncOutcome,
    pub stage: PeerSyncStage,
    pub error_category: Option<PeerSyncErrorCategory>,
    pub attempts: u8,
    pub imported_packets: usize,
    pub duplicate_packets: usize,
    pub exported_packets: Option<usize>,
    pub started_at: i64,
    pub finished_at: i64,
    pub message: Option<String>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerDiagnoseOutcome {
    Success,
    Failed,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerDiagnoseStage {
    Connect,
    Hello,
    Accept,
    Complete,
}
impl std::fmt::Display for PeerDiagnoseStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::Connect => "connect",
                Self::Hello => "hello",
                Self::Accept => "accept",
                Self::Complete => "complete",
            }
        )
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PeerDiagnoseErrorCategory {
    InvalidPeerConfig,
    Unreachable,
    Timeout,
    PairingMismatch,
    ProtocolMismatch,
    RemoteRejected,
    MalformedFrame,
    Io,
    Unknown,
}
impl std::fmt::Display for PeerDiagnoseErrorCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            match self {
                Self::InvalidPeerConfig => "invalid_peer_config",
                Self::Unreachable => "unreachable",
                Self::Timeout => "timeout",
                Self::PairingMismatch => "pairing_mismatch",
                Self::ProtocolMismatch => "protocol_mismatch",
                Self::RemoteRejected => "remote_rejected",
                Self::MalformedFrame => "malformed_frame",
                Self::Io => "io",
                Self::Unknown => "unknown",
            }
        )
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PeerDiagnoseResult {
    pub remote_node_id: String,
    pub outcome: PeerDiagnoseOutcome,
    pub stage: PeerDiagnoseStage,
    pub error_category: Option<PeerDiagnoseErrorCategory>,
    pub started_at: i64,
    pub finished_at: i64,
    pub latency_ms: Option<i64>,
    pub message: Option<String>,
}

pub fn peer_health(peer: &PeerRecord, now_seconds: i64) -> &'static str {
    match (peer.last_successful_contact_at, peer.last_failure_at) {
        (None, None) => "never_contacted",
        (None, Some(_)) => "error",
        (Some(success), Some(failure)) if failure > success => "error",
        (Some(success), _) if now_seconds - success > 86_400 => "stale",
        (Some(_), _) => "healthy",
    }
}

fn classify_error(error: &NodeError) -> (PeerSyncStage, PeerSyncErrorCategory) {
    match error {
        NodeError::Transport(TransportError::Io(io_error)) => {
            let category = match io_error.kind() {
                io::ErrorKind::TimedOut => PeerSyncErrorCategory::Timeout,
                io::ErrorKind::ConnectionRefused
                | io::ErrorKind::ConnectionAborted
                | io::ErrorKind::ConnectionReset
                | io::ErrorKind::NotFound
                | io::ErrorKind::AddrNotAvailable => PeerSyncErrorCategory::Unreachable,
                _ => PeerSyncErrorCategory::Io,
            };
            (PeerSyncStage::Connect, category)
        }
        NodeError::Transport(TransportError::Malformed(_)) => {
            (PeerSyncStage::Hello, PeerSyncErrorCategory::MalformedFrame)
        }
        NodeError::Protocol(protocol_error) => match protocol_error {
            ProtocolError::Json(_) => (PeerSyncStage::Hello, PeerSyncErrorCategory::MalformedFrame),
            ProtocolError::Packet(_) => (
                PeerSyncStage::Import,
                PeerSyncErrorCategory::ValidationFailed,
            ),
            ProtocolError::Invalid(message) => classify_invalid_message(message),
        },
        NodeError::Storage(storage_error) => match storage_error {
            StorageError::Packet(_) | StorageError::Protocol(_) => (
                PeerSyncStage::Import,
                PeerSyncErrorCategory::ValidationFailed,
            ),
            StorageError::Sql(_) => (PeerSyncStage::Import, PeerSyncErrorCategory::Io),
        },
        NodeError::Io(io_error) => {
            let category = if io_error.kind() == io::ErrorKind::TimedOut {
                PeerSyncErrorCategory::Timeout
            } else {
                PeerSyncErrorCategory::Io
            };
            (PeerSyncStage::Connect, category)
        }
        NodeError::Invalid(message) => classify_invalid_message(message),
        NodeError::Json(_) => (PeerSyncStage::Hello, PeerSyncErrorCategory::MalformedFrame),
        NodeError::Invite(_) => (
            PeerSyncStage::Accept,
            PeerSyncErrorCategory::InvalidPeerConfig,
        ),
    }
}

fn classify_invalid_message(message: &str) -> (PeerSyncStage, PeerSyncErrorCategory) {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("remote rejected") {
        return (PeerSyncStage::Accept, PeerSyncErrorCategory::RemoteRejected);
    }
    if normalized.contains("pairing") {
        return (
            PeerSyncStage::Accept,
            PeerSyncErrorCategory::PairingMismatch,
        );
    }
    if normalized.contains("incompatible_") || normalized.contains("unsupported") {
        return (
            PeerSyncStage::Hello,
            PeerSyncErrorCategory::ProtocolMismatch,
        );
    }
    if normalized.contains("cursor")
        || normalized.contains("packet")
        || normalized.contains("import")
    {
        return (
            PeerSyncStage::Import,
            PeerSyncErrorCategory::ValidationFailed,
        );
    }
    (PeerSyncStage::Hello, PeerSyncErrorCategory::Unknown)
}

fn classify_diagnose_reject(reason_code: &str) -> PeerDiagnoseErrorCategory {
    let reason = reason_code.to_ascii_lowercase();
    if reason.starts_with("pairing_") {
        PeerDiagnoseErrorCategory::PairingMismatch
    } else if matches!(
        reason.as_str(),
        "unsupported_connection_version"
            | "incompatible_connection_version"
            | "unsupported_packet_version"
            | "incompatible_packet_version"
    ) {
        PeerDiagnoseErrorCategory::ProtocolMismatch
    } else {
        PeerDiagnoseErrorCategory::RemoteRejected
    }
}

fn classify_diagnose_error(
    error: &NodeError,
    structured_reject_reason: Option<&str>,
) -> (PeerDiagnoseStage, PeerDiagnoseErrorCategory) {
    if let Some(reason_code) = structured_reject_reason {
        return (
            PeerDiagnoseStage::Accept,
            classify_diagnose_reject(reason_code),
        );
    }
    match error {
        NodeError::Transport(TransportError::Io(e)) | NodeError::Io(e) => {
            let c = match e.kind() {
                io::ErrorKind::TimedOut => PeerDiagnoseErrorCategory::Timeout,
                io::ErrorKind::ConnectionRefused
                | io::ErrorKind::ConnectionAborted
                | io::ErrorKind::ConnectionReset
                | io::ErrorKind::NotFound
                | io::ErrorKind::AddrNotAvailable => PeerDiagnoseErrorCategory::Unreachable,
                _ => PeerDiagnoseErrorCategory::Io,
            };
            (PeerDiagnoseStage::Connect, c)
        }
        NodeError::Transport(TransportError::Malformed(_)) | NodeError::Json(_) => (
            PeerDiagnoseStage::Accept,
            PeerDiagnoseErrorCategory::MalformedFrame,
        ),
        NodeError::Protocol(ProtocolError::Json(_)) => (
            PeerDiagnoseStage::Accept,
            PeerDiagnoseErrorCategory::MalformedFrame,
        ),
        NodeError::Protocol(ProtocolError::Invalid(message)) | NodeError::Invalid(message) => {
            let m = message.to_ascii_lowercase();
            if m.contains("remote rejected") {
                (
                    PeerDiagnoseStage::Accept,
                    PeerDiagnoseErrorCategory::RemoteRejected,
                )
            } else if m.contains("pairing") {
                (
                    PeerDiagnoseStage::Accept,
                    PeerDiagnoseErrorCategory::PairingMismatch,
                )
            } else if m.contains("incompatible") || m.contains("unsupported") {
                (
                    PeerDiagnoseStage::Accept,
                    PeerDiagnoseErrorCategory::ProtocolMismatch,
                )
            } else {
                (
                    PeerDiagnoseStage::Accept,
                    PeerDiagnoseErrorCategory::Unknown,
                )
            }
        }
        NodeError::Protocol(ProtocolError::Packet(_))
        | NodeError::Storage(_)
        | NodeError::Invite(_) => (
            PeerDiagnoseStage::Accept,
            PeerDiagnoseErrorCategory::Unknown,
        ),
    }
}

#[derive(Debug, Error)]
pub enum NodeError {
    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("storage: {0}")]
    Storage(#[from] StorageError),
    #[error("protocol: {0}")]
    Protocol(#[from] ProtocolError),
    #[error("transport: {0}")]
    Transport(#[from] TransportError),
    #[error("I/O: {0}")]
    Io(#[from] io::Error),
    #[error("invalid operation: {0}")]
    Invalid(String),
    #[error("invite: {0}")]
    Invite(#[from] InviteError),
}

pub struct DesktopNode {
    pub data_dir: PathBuf,
    pub store: Store,
}
impl DesktopNode {
    pub fn open(data_dir: impl AsRef<Path>) -> Result<Self, NodeError> {
        let data_dir = data_dir.as_ref().to_owned();
        std::fs::create_dir_all(&data_dir)?;
        let store = Store::open(data_dir.join("daovibe.sqlite3"))?;
        let node = Self { data_dir, store };
        node.ensure_identity()?;
        Ok(node)
    }
    pub fn ensure_identity(&self) -> Result<DeviceIdentity, NodeError> {
        if let Some(identity) = self.store.identity()? {
            return Ok(identity);
        }
        let created_at = now();
        let node_id = format!(
            "mycelium_node_{}",
            sha256(&format!(
                "desktop:{}:{}:{}",
                created_at,
                std::process::id(),
                std::env::current_dir().unwrap_or_default().display()
            ))[..32]
                .to_owned()
        );
        let identity = DeviceIdentity {
            node_id,
            display_name: "My DAOVibe Desktop".to_owned(),
            created_at,
            platform: DESKTOP_PLATFORM.to_owned(),
            role: DESKTOP_ROLE.to_owned(),
        };
        self.store.insert_identity(&identity)?;
        Ok(self.store.identity()?.expect("identity was inserted"))
    }
    pub fn set_name(&self, name: &str) -> Result<DeviceIdentity, NodeError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(NodeError::Invalid(
                "display name must not be empty".to_owned(),
            ));
        }
        self.store.set_display_name(name)?;
        self.store
            .identity()?
            .ok_or_else(|| NodeError::Invalid("identity is missing".to_owned()))
    }
    pub fn add_peer(
        &self,
        remote_node_id: &str,
        host: &str,
        port: u16,
        pairing_id: &str,
        display_name: Option<String>,
    ) -> Result<(), NodeError> {
        let identity = self.ensure_identity()?;
        if remote_node_id.trim().is_empty() || remote_node_id == identity.node_id {
            return Err(NodeError::Invalid(
                "peer node ID must be non-empty and must not be local node".to_owned(),
            ));
        }
        if host.trim().is_empty() || port == 0 {
            return Err(NodeError::Invalid(
                "peer host must be non-empty and port must be 1..65535".to_owned(),
            ));
        }
        if pairing_id.trim().is_empty() {
            return Err(NodeError::Invalid(
                "pairing ID must be non-empty".to_owned(),
            ));
        }
        self.store
            .upsert_peer(&PeerRecord {
                remote_node_id: remote_node_id.trim().to_owned(),
                display_name,
                host: host.trim().to_owned(),
                port,
                pairing_id: pairing_id.trim().to_owned(),
                last_successful_contact_at: None,
                last_error: None,
                updated_at: now(),
                last_failure_at: None,
                last_outcome: None,
                last_stage: None,
                last_error_category: None,
                last_attempts: None,
                last_imported_packets: None,
                last_duplicate_packets: None,
                last_exported_packets: None,
                last_sync_started_at: None,
                last_sync_finished_at: None,
                last_cursor: None,
                last_diagnostic_at: None,
                last_diagnostic_outcome: None,
                last_diagnostic_stage: None,
                last_diagnostic_error_category: None,
                last_diagnostic_message: None,
                last_diagnostic_latency_ms: None,
            })
            .map_err(Into::into)
    }

    pub fn create_peer_invite(
        &self,
        host: &str,
        port: u16,
        pairing_id: &str,
        expires_at: i64,
        note: Option<String>,
    ) -> Result<PeerInvite, NodeError> {
        let identity = self.ensure_identity()?;
        let pairing = self
            .store
            .pairing(pairing_id.trim())?
            .ok_or_else(|| NodeError::Invalid("approved pairing is missing".to_owned()))?;
        if pairing.status != "approved"
            || pairing.local_node_id != identity.node_id
            || pairing.pairing_id != pairing_id.trim()
        {
            return Err(NodeError::Invalid(
                "pairing is not an approved relationship for this local node".to_owned(),
            ));
        }
        let invite = PeerInvite {
            invite_version: crate::invite::INVITE_VERSION,
            source_node_id: identity.node_id,
            source_display_name: Some(identity.display_name),
            host: host.trim().to_owned(),
            port,
            pairing_id: pairing_id.trim().to_owned(),
            created_at: now(),
            expires_at,
            connection_version: crate::invite::CONNECTION_VERSION.to_owned(),
            packet_protocol_version: crate::models::LMP_VERSION.to_owned(),
            capabilities: Some(
                DESKTOP_CAPABILITIES
                    .iter()
                    .map(|value| (*value).to_owned())
                    .collect(),
            ),
            note,
        };
        invite.validate(now())?;
        Ok(invite)
    }

    pub fn import_peer_invite(&self, invite: &PeerInvite) -> Result<(), NodeError> {
        invite.validate(now())?;
        let identity = self.ensure_identity()?;
        if invite.source_node_id == identity.node_id {
            return Err(NodeError::Invalid(
                "local node invite cannot be imported".to_owned(),
            ));
        }
        self.add_peer(
            &invite.source_node_id,
            &invite.host,
            invite.port,
            &invite.pairing_id,
            invite.source_display_name.clone(),
        )
    }
    pub fn sync_peer(&self, remote_node_id: &str) -> Result<(usize, usize), NodeError> {
        let peer = self
            .store
            .peer(remote_node_id)?
            .ok_or_else(|| NodeError::Invalid("known peer configuration is missing".to_owned()))?;
        let identity = self.ensure_identity()?;
        let pairing = self
            .store
            .active_pairing_for_remote(&identity.node_id, remote_node_id)?
            .ok_or_else(|| NodeError::Invalid("approved pairing is missing".to_owned()))?;
        if pairing.pairing_id != peer.pairing_id {
            return Err(NodeError::Invalid(
                "peer pairing ID does not match approved pairing".to_owned(),
            ));
        }
        let mut stream = TcpStream::connect((&*peer.host, peer.port))?;
        transport::configure_stream(&stream)?;
        let session_id = format!(
            "session_{}",
            &sha256(&format!("{}:{}", now(), std::process::id()))[..32]
        );
        let hello = Hello {
            protocol_version: CONNECTION_VERSION.to_owned(),
            session_id: session_id.clone(),
            source_node_id: identity.node_id.clone(),
            target_node_id: remote_node_id.to_owned(),
            source_platform: identity.platform.clone(),
            source_role: identity.role.clone(),
            pairing_id: peer.pairing_id.clone(),
            created_at: now(),
            supported_connection_versions: vec![CONNECTION_VERSION.to_owned()],
            supported_packet_protocol_versions: vec![crate::models::LMP_VERSION.to_owned()],
            capabilities: DESKTOP_CAPABILITIES
                .iter()
                .map(|v| (*v).to_owned())
                .collect(),
        };
        transport::write_frame(&mut stream, &hello.canonical_json())?;
        let response: serde_json::Value =
            serde_json::from_str(&transport::read_frame(&mut stream)?)?;
        match protocol::decode_connection(&response)? {
            protocol::ConnectionMessage::Accept(_) => {}
            protocol::ConnectionMessage::Reject(reject) => {
                return Err(NodeError::Invalid(format!(
                    "remote rejected sync: {}",
                    reject.reason_code
                )))
            }
            protocol::ConnectionMessage::Hello(_) => {
                return Err(NodeError::Invalid("unexpected connection hello".to_owned()))
            }
        }
        let mut cursor = self
            .store
            .cursor_or_start_for_pairing(remote_node_id, &peer.pairing_id)?;
        let mut inserted = 0;
        let mut duplicates = 0;
        for _ in 0..MAX_SYNC_WINDOWS {
            let request = SyncRequest {
                protocol_version: SYNC_VERSION.to_owned(),
                session_id: session_id.clone(),
                source_node_id: identity.node_id.clone(),
                target_node_id: remote_node_id.to_owned(),
                pairing_id: peer.pairing_id.clone(),
                cursor: cursor.clone(),
                limit: MAX_PACKETS_PER_BATCH,
            };
            transport::write_frame(&mut stream, &request.canonical_json())?;
            let value: serde_json::Value =
                serde_json::from_str(&transport::read_frame(&mut stream)?)?;
            let batch = match protocol::decode_sync(&value)? {
                SyncMessage::Batch(batch) => batch,
                SyncMessage::Reject(reject) => {
                    return Err(NodeError::Invalid(format!(
                        "remote rejected sync: {}",
                        reject.reason_code
                    )))
                }
                SyncMessage::Request(_) => {
                    return Err(NodeError::Invalid("unexpected sync request".to_owned()))
                }
            };
            if batch.request_cursor != cursor {
                return Err(NodeError::Invalid("sync cursor mismatch".to_owned()));
            }
            let next = batch.next_cursor.clone();
            let more = batch.has_more;
            let (new_count, duplicate_count) = self.store.import_sync_batch_atomically(
                &batch,
                remote_node_id,
                &peer.pairing_id,
                now(),
            )?;
            inserted += new_count;
            duplicates += duplicate_count;
            cursor = next;
            if !more {
                break;
            }
        }
        // The responder now owns the reverse direction. Once our pull is
        // complete it sends SYNC_REQUEST frames and this side exports its
        // ordinary ledger packets in response. A second client pull would
        // only re-request the responder's ledger and could never propagate
        // A -> B -> C packets in the opposite direction.
        for window in 0..MAX_SYNC_WINDOWS {
            let value: serde_json::Value =
                serde_json::from_str(&transport::read_frame(&mut stream)?)?;
            let request = match protocol::decode_sync(&value)? {
                SyncMessage::Request(request) => request,
                SyncMessage::Reject(reject) => {
                    return Err(NodeError::Invalid(format!(
                        "remote rejected reverse sync: {}",
                        reject.reason_code
                    )))
                }
                SyncMessage::Batch(_) => {
                    return Err(NodeError::Invalid(
                        "expected reverse sync request".to_owned(),
                    ))
                }
            };
            if request.session_id != session_id
                || request.source_node_id != remote_node_id
                || request.target_node_id != identity.node_id
                || request.pairing_id != peer.pairing_id
            {
                return Err(NodeError::Invalid(
                    "invalid reverse sync request".to_owned(),
                ));
            }
            let batch = self.export_window(&request)?;
            let more = batch.has_more;
            transport::write_frame(&mut stream, &batch.canonical_json())?;
            if !more {
                break;
            }
            if window + 1 == MAX_SYNC_WINDOWS {
                return Err(NodeError::Invalid(
                    "maximum reverse sync windows exceeded".to_owned(),
                ));
            }
        }
        self.store.mark_peer_success(remote_node_id, now())?;
        Ok((inserted, duplicates))
    }

    pub fn diagnose_peer_result(&self, remote_node_id: &str) -> PeerDiagnoseResult {
        let started_at = now();
        let started_ms = std::time::Instant::now();
        let mut structured_reject_reason = None;
        let result = (|| -> Result<(), NodeError> {
            let peer = self.store.peer(remote_node_id)?.ok_or_else(|| {
                NodeError::Invalid("known peer configuration is missing".to_owned())
            })?;
            let identity = self.ensure_identity()?;
            let pairing = self
                .store
                .active_pairing_for_remote(&identity.node_id, remote_node_id)?
                .ok_or_else(|| NodeError::Invalid("approved pairing is missing".to_owned()))?;
            if pairing.pairing_id != peer.pairing_id {
                return Err(NodeError::Invalid(
                    "peer pairing ID does not match approved pairing".to_owned(),
                ));
            }
            let mut stream = TcpStream::connect((&*peer.host, peer.port))?;
            transport::configure_stream(&stream)?;
            let session_id = format!(
                "session_{}",
                &sha256(&format!("{}:{}", now(), std::process::id()))[..32]
            );
            let hello = Hello {
                protocol_version: CONNECTION_VERSION.to_owned(),
                session_id: session_id.clone(),
                source_node_id: identity.node_id.clone(),
                target_node_id: remote_node_id.to_owned(),
                source_platform: identity.platform.clone(),
                source_role: identity.role.clone(),
                pairing_id: peer.pairing_id.clone(),
                created_at: now(),
                supported_connection_versions: vec![CONNECTION_VERSION.to_owned()],
                supported_packet_protocol_versions: vec![crate::models::LMP_VERSION.to_owned()],
                capabilities: DESKTOP_CAPABILITIES
                    .iter()
                    .map(|v| (*v).to_owned())
                    .collect(),
            };
            transport::write_frame(&mut stream, &hello.canonical_json())?;
            let value: serde_json::Value =
                serde_json::from_str(&transport::read_frame(&mut stream)?)?;
            match protocol::decode_connection(&value)? {
                protocol::ConnectionMessage::Accept(accept) => {
                    accept.validate()?;
                    if accept.session_id != hello.session_id
                        || accept.source_node_id != remote_node_id
                        || accept.target_node_id != identity.node_id
                        || accept.pairing_id != peer.pairing_id
                    {
                        return Err(NodeError::Invalid(
                            "connection accept identity mismatch".to_owned(),
                        ));
                    }
                    Ok(())
                }
                protocol::ConnectionMessage::Reject(reject) => {
                    structured_reject_reason = Some(reject.reason_code.clone());
                    Err(NodeError::Invalid("remote rejected diagnose".to_owned()))
                }
                protocol::ConnectionMessage::Hello(_) => {
                    Err(NodeError::Invalid("unexpected connection hello".to_owned()))
                }
            }
        })();
        let finished_at = now();
        let latency_ms = Some(started_ms.elapsed().as_millis() as i64);
        let result = match result {
            Ok(()) => PeerDiagnoseResult {
                remote_node_id: remote_node_id.to_owned(),
                outcome: PeerDiagnoseOutcome::Success,
                stage: PeerDiagnoseStage::Complete,
                error_category: None,
                started_at,
                finished_at,
                latency_ms,
                message: None,
            },
            Err(error) => {
                let (stage, category) =
                    classify_diagnose_error(&error, structured_reject_reason.as_deref());
                PeerDiagnoseResult {
                    remote_node_id: remote_node_id.to_owned(),
                    outcome: PeerDiagnoseOutcome::Failed,
                    stage,
                    error_category: Some(category),
                    started_at,
                    finished_at,
                    latency_ms,
                    message: Some(error.to_string().chars().take(500).collect()),
                }
            }
        };
        let _ = self.store.record_peer_diagnose(&result);
        result
    }

    pub fn sync_peer_bounded(&self, remote_node_id: &str) -> Result<(usize, usize), NodeError> {
        let mut last_error = None;
        for attempt in 0..2 {
            match self.sync_peer(remote_node_id) {
                Ok(result) => return Ok(result),
                Err(error) => {
                    self.store
                        .mark_peer_failure(remote_node_id, now(), &error.to_string())?;
                    last_error = Some(error);
                    if attempt == 0 {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                    }
                }
            }
        }
        Err(last_error.expect("bounded sync attempts always run"))
    }

    pub fn sync_peer_result(&self, remote_node_id: &str) -> PeerSyncResult {
        let started_at = now();
        let mut final_result: Option<PeerSyncResult> = None;
        for attempt in 1..=2u8 {
            match self.sync_peer(remote_node_id) {
                Ok((inserted, duplicates)) => {
                    let cursor = self.store.sync_states().ok().and_then(|states| {
                        states
                            .into_iter()
                            .find(|(peer, _, _, _)| peer == remote_node_id)
                            .map(|(_, _, cursor, _)| cursor)
                    });
                    let result = PeerSyncResult {
                        remote_node_id: remote_node_id.to_owned(),
                        outcome: PeerSyncOutcome::Success,
                        stage: PeerSyncStage::Complete,
                        error_category: None,
                        attempts: attempt,
                        imported_packets: inserted,
                        duplicate_packets: duplicates,
                        exported_packets: None,
                        started_at,
                        finished_at: now(),
                        message: None,
                        cursor,
                    };
                    let _ = self.store.record_peer_success(&result);
                    return result;
                }
                Err(error) => {
                    let (stage, category) = classify_error(&error);
                    let result = PeerSyncResult {
                        remote_node_id: remote_node_id.to_owned(),
                        outcome: PeerSyncOutcome::Failed,
                        stage,
                        error_category: Some(category),
                        attempts: attempt,
                        imported_packets: 0,
                        duplicate_packets: 0,
                        exported_packets: None,
                        started_at,
                        finished_at: now(),
                        message: Some(error.to_string().chars().take(500).collect()),
                        cursor: None,
                    };
                    let _ = self.store.record_peer_failure(&result);
                    final_result = Some(result);
                    if attempt == 1 {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                    }
                }
            }
        }
        final_result.expect("bounded sync attempts always run")
    }
    pub fn create_approval(
        &self,
        offer: &PairingOffer,
        approved: bool,
    ) -> Result<PairingApproval, NodeError> {
        offer.validate()?;
        let identity = self.ensure_identity()?;
        if offer.source_node_id == identity.node_id {
            return Err(NodeError::Invalid(
                "desktop cannot pair with itself".to_owned(),
            ));
        }
        let approval = PairingApproval {
            protocol_version: protocol::PAIRING_VERSION.to_owned(),
            pairing_id: offer.pairing_id.clone(),
            approving_node_id: identity.node_id.clone(),
            approving_display_name: identity.display_name.clone(),
            approving_platform: identity.platform.clone(),
            approving_role: identity.role.clone(),
            target_node_id: offer.source_node_id.clone(),
            approved_at: now(),
            approval_state: if approved {
                "approved".to_owned()
            } else {
                "rejected".to_owned()
            },
            challenge_echo: offer.challenge.clone(),
        };
        approval.validate()?;
        let record = PairingRecord {
            pairing_id: approval.pairing_id.clone(),
            local_node_id: identity.node_id,
            remote_node_id: offer.source_node_id.clone(),
            remote_display_name: offer.source_display_name.clone(),
            remote_platform: offer.source_platform.clone(),
            remote_role: offer.source_role.clone(),
            status: approval.approval_state.clone(),
            created_at: offer.created_at,
            paired_at: (approved).then_some(approval.approved_at),
        };
        if approved {
            if let Some(existing) = self
                .store
                .active_pairing_for_remote(&record.local_node_id, &record.remote_node_id)?
            {
                if existing.pairing_id != record.pairing_id {
                    return Err(NodeError::Invalid(
                        "remote node is already paired".to_owned(),
                    ));
                }
            }
        }
        self.store.upsert_pairing(&record)?;
        Ok(approval)
    }
    pub fn listen(&self, host: &str, port: u16) -> Result<(), NodeError> {
        let listener = transport::bind(host, port)?;
        println!(
            "Listening on {} (desktop node {})",
            listener.local_addr()?,
            self.ensure_identity()?.node_id
        );
        for incoming in listener.incoming() {
            match incoming {
                Ok(mut stream) => {
                    if let Err(error) = transport::configure_stream(&stream).and_then(|_| {
                        self.serve_stream(&mut stream)
                            .map_err(|error| TransportError::Malformed(error.to_string()))
                    }) {
                        eprintln!("connection closed: {error}");
                    }
                }
                Err(error) => eprintln!("accept failed: {error}"),
            }
        }
        Ok(())
    }
    fn serve_stream(&self, stream: &mut TcpStream) -> Result<(), NodeError> {
        let hello_json = transport::read_frame(stream)?;
        let hello_value: serde_json::Value = serde_json::from_str(&hello_json)?;
        let hello = match Hello::decode(&hello_value) {
            Ok(value) => value,
            Err(error) => return Err(error.into()),
        };
        let identity = self.ensure_identity()?;
        let pairing = self.store.pairing(&hello.pairing_id)?;
        let accepted = self.validate_hello(&identity, &hello, pairing.as_ref());
        match accepted {
            Ok(()) => {
                let capabilities = hello
                    .capabilities
                    .iter()
                    .filter(|value| DESKTOP_CAPABILITIES.contains(&value.as_str()))
                    .cloned()
                    .collect::<Vec<_>>();
                let accept = Accept {
                    protocol_version: CONNECTION_VERSION.to_owned(),
                    session_id: hello.session_id.clone(),
                    source_node_id: identity.node_id.clone(),
                    target_node_id: hello.source_node_id.clone(),
                    pairing_id: hello.pairing_id.clone(),
                    accepted_at: now(),
                    negotiated_connection_version: CONNECTION_VERSION.to_owned(),
                    negotiated_packet_protocol_version: crate::models::LMP_VERSION.to_owned(),
                    capabilities,
                    state: "connected".to_owned(),
                };
                accept.validate()?;
                transport::write_frame(stream, &accept.canonical_json())?;
                match transport::read_frame_or_eof(stream)? {
                    None => return Ok(()),
                    Some(message_json) => {
                        self.serve_sync(stream, &identity, &hello, Some(message_json))?
                    }
                }
                Ok(())
            }
            Err(reason) => {
                let reject = protocol::make_reject(
                    hello.session_id,
                    identity.node_id,
                    hello.source_node_id,
                    hello.pairing_id,
                    &reason,
                    now(),
                );
                transport::write_frame(stream, &reject.canonical_json())?;
                Ok(())
            }
        }
    }
    fn validate_hello(
        &self,
        identity: &DeviceIdentity,
        hello: &Hello,
        pairing: Option<&PairingRecord>,
    ) -> Result<(), String> {
        if hello.target_node_id != identity.node_id {
            return Err("target_node_mismatch".to_owned());
        }
        let pairing = pairing.ok_or_else(|| "pairing_not_found".to_owned())?;
        if pairing.status != "approved" {
            return Err("pairing_inactive".to_owned());
        }
        if pairing.local_node_id != identity.node_id
            || pairing.remote_node_id != hello.source_node_id
        {
            return Err("pairing_peer_mismatch".to_owned());
        }
        if pairing.pairing_id != hello.pairing_id {
            return Err("pairing_peer_mismatch".to_owned());
        }
        if !hello
            .supported_connection_versions
            .iter()
            .any(|v| v == CONNECTION_VERSION)
        {
            return Err("incompatible_connection_version".to_owned());
        }
        if !hello
            .supported_packet_protocol_versions
            .iter()
            .any(|v| v == crate::models::LMP_VERSION)
        {
            return Err("incompatible_packet_version".to_owned());
        }
        Ok(())
    }
    fn serve_sync(
        &self,
        stream: &mut TcpStream,
        identity: &DeviceIdentity,
        hello: &Hello,
        mut first_message: Option<String>,
    ) -> Result<(), NodeError> {
        for window in 0..MAX_SYNC_WINDOWS {
            let message_json = match first_message.take() {
                Some(value) => value,
                None => transport::read_frame(stream)?,
            };
            let value: serde_json::Value = serde_json::from_str(&message_json)?;

            let request = match protocol::decode_sync(&value)? {
                SyncMessage::Request(value) => value,
                SyncMessage::Batch(_) | SyncMessage::Reject(_) => {
                    return Err(NodeError::Invalid("expected SYNC_REQUEST".to_owned()))
                }
            };

            if let Err(error) = self.validate_request(identity, hello, &request) {
                let reject = SyncReject {
                    protocol_version: SYNC_VERSION.to_owned(),
                    session_id: request.session_id.clone(),
                    source_node_id: identity.node_id.clone(),
                    target_node_id: request.source_node_id.clone(),
                    pairing_id: request.pairing_id.clone(),
                    reason_code: error,
                };

                transport::write_frame(stream, &reject.canonical_json())?;
                return Ok(());
            }

            let batch = self.export_window(&request)?;
            let more = batch.has_more;

            transport::write_frame(stream, &batch.canonical_json())?;

            if !more {
                return self.pull_from_remote(stream, identity, hello);
            }

            if window + 1 == MAX_SYNC_WINDOWS {
                return Err(NodeError::Invalid(
                    "maximum sync windows exceeded".to_owned(),
                ));
            }
        }

        Err(NodeError::Invalid(
            "maximum sync windows exceeded".to_owned(),
        ))
    }

    fn pull_from_remote(
        &self,
        stream: &mut TcpStream,
        identity: &DeviceIdentity,
        hello: &Hello,
    ) -> Result<(), NodeError> {
        let mut cursor = self
            .store
            .cursor_or_start_for_pairing(&hello.source_node_id, &hello.pairing_id)?;

        let mut imported_packets = 0usize;
        let mut duplicate_packets = 0usize;

        for window in 0..MAX_SYNC_WINDOWS {
            let request = SyncRequest {
                protocol_version: SYNC_VERSION.to_owned(),
                session_id: hello.session_id.clone(),
                source_node_id: identity.node_id.clone(),
                target_node_id: hello.source_node_id.clone(),
                pairing_id: hello.pairing_id.clone(),
                cursor: cursor.clone(),
                limit: MAX_PACKETS_PER_BATCH,
            };

            request.validate()?;
            transport::write_frame(stream, &request.canonical_json())?;

            let response_json = transport::read_frame(stream)?;
            let value: serde_json::Value = serde_json::from_str(&response_json)?;

            match protocol::decode_sync(&value)? {
                SyncMessage::Batch(batch) => {
                    if batch.session_id != hello.session_id {
                        return Err(NodeError::Invalid(
                            "reverse sync session mismatch".to_owned(),
                        ));
                    }

                    if batch.source_node_id != hello.source_node_id {
                        return Err(NodeError::Invalid(
                            "reverse sync source node mismatch".to_owned(),
                        ));
                    }

                    if batch.target_node_id != identity.node_id {
                        return Err(NodeError::Invalid(
                            "reverse sync target node mismatch".to_owned(),
                        ));
                    }

                    if batch.pairing_id != hello.pairing_id {
                        return Err(NodeError::Invalid(
                            "reverse sync pairing mismatch".to_owned(),
                        ));
                    }

                    if batch.request_cursor != cursor {
                        return Err(NodeError::Invalid(
                            "reverse sync cursor mismatch".to_owned(),
                        ));
                    }

                    if batch.has_more && batch.next_cursor == cursor {
                        return Err(NodeError::Invalid("reverse sync cursor stalled".to_owned()));
                    }

                    let next_cursor = batch.next_cursor.clone();
                    let has_more = batch.has_more;

                    let (inserted, duplicates) = self.store.import_sync_batch_atomically(
                        &batch,
                        &hello.source_node_id,
                        &hello.pairing_id,
                        now(),
                    )?;

                    imported_packets += inserted;
                    duplicate_packets += duplicates;
                    cursor = next_cursor;

                    if !has_more {
                        println!(
                            "Reverse sync complete: {} new packet(s), {} duplicate(s), cursor {}",
                            imported_packets, duplicate_packets, cursor
                        );

                        return Ok(());
                    }
                }

                SyncMessage::Reject(reject) => {
                    return Err(NodeError::Invalid(format!(
                        "remote reverse sync rejected: {}",
                        reject.reason_code
                    )));
                }

                SyncMessage::Request(_) => {
                    return Err(NodeError::Invalid(
                        "expected SYNC_BATCH or SYNC_REJECT".to_owned(),
                    ));
                }
            }

            if window + 1 == MAX_SYNC_WINDOWS {
                return Err(NodeError::Invalid(
                    "maximum reverse sync windows exceeded".to_owned(),
                ));
            }
        }

        Err(NodeError::Invalid(
            "maximum reverse sync windows exceeded".to_owned(),
        ))
    }
    fn validate_request(
        &self,
        identity: &DeviceIdentity,
        hello: &Hello,
        request: &SyncRequest,
    ) -> Result<(), String> {
        if request.protocol_version != SYNC_VERSION {
            return Err("invalid_message".to_owned());
        }
        if request.session_id != hello.session_id {
            return Err("session_mismatch".to_owned());
        }
        if request.source_node_id != hello.source_node_id {
            return Err("node_id_mismatch".to_owned());
        }
        if request.target_node_id != identity.node_id {
            return Err("target_node_mismatch".to_owned());
        }
        if request.pairing_id != hello.pairing_id {
            return Err("pairing_mismatch".to_owned());
        }
        if request.limit == 0 {
            return Err("invalid_limit".to_owned());
        }
        protocol::parse_cursor(&request.cursor).map_err(|_| "invalid_cursor".to_owned())?;
        Ok(())
    }
    fn export_window(&self, request: &SyncRequest) -> Result<SyncBatch, NodeError> {
        let (received_at, packet_id) = protocol::parse_cursor(&request.cursor)?;
        let candidates =
            self.store
                .packets_after(received_at, &packet_id, MAX_PACKETS_PER_BATCH + 1)?;
        let limit = request.limit.min(MAX_PACKETS_PER_BATCH);
        let mut packets = Vec::new();
        let mut next_cursor = request.cursor.clone();
        for (index, candidate) in candidates.iter().take(limit).enumerate() {
            let candidate_packets = packets
                .iter()
                .cloned()
                .chain(std::iter::once(candidate.packet.clone()))
                .collect::<Vec<_>>();
            let candidate_next =
                format!("{}:{}", candidate.received_at, candidate.packet.packet_id);
            let candidate_batch = SyncBatch {
                protocol_version: SYNC_VERSION.to_owned(),
                session_id: request.session_id.clone(),
                source_node_id: request.target_node_id.clone(),
                target_node_id: request.source_node_id.clone(),
                pairing_id: request.pairing_id.clone(),
                request_cursor: request.cursor.clone(),
                next_cursor: candidate_next.clone(),
                has_more: index + 1 < candidates.len(),
                packets: candidate_packets,
            };
            if candidate_batch.canonical_json().len() > crate::protocol::MAX_FRAME_BYTES {
                if packets.is_empty() {
                    return Err(NodeError::Invalid("packet_too_large".to_owned()));
                }
                break;
            }
            packets.push(candidate.packet.clone());
            next_cursor = candidate_next;
        }
        let has_more = candidates.len() > packets.len();
        let batch = SyncBatch {
            protocol_version: SYNC_VERSION.to_owned(),
            session_id: request.session_id.clone(),
            source_node_id: request.target_node_id.clone(),
            target_node_id: request.source_node_id.clone(),
            pairing_id: request.pairing_id.clone(),
            request_cursor: request.cursor.clone(),
            next_cursor,
            has_more,
            packets,
        };
        batch.validate()?;
        Ok(batch)
    }
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::canonical;
    use crate::models::{Packet, PacketPayload, PacketType};
    use crate::mycelium::MyceliumStateSnapshot;
    use std::fs;
    use std::net::{TcpListener, TcpStream};
    use std::path::Path;

    fn invite_for(source_node_id: String, pairing_id: &str) -> PeerInvite {
        PeerInvite {
            invite_version: crate::invite::INVITE_VERSION,
            source_node_id,
            source_display_name: Some("Remote".into()),
            host: "127.0.0.1".into(),
            port: 4242,
            pairing_id: pairing_id.into(),
            created_at: now(),
            expires_at: now() + 3600,
            connection_version: crate::invite::CONNECTION_VERSION.into(),
            packet_protocol_version: crate::models::LMP_VERSION.into(),
            capabilities: None,
            note: None,
        }
    }

    #[test]
    fn create_peer_invite_requires_approved_local_pairing() {
        let store = Store::open_in_memory().unwrap();
        let node = DesktopNode {
            data_dir: PathBuf::new(),
            store,
        };
        let identity = node.ensure_identity().unwrap();
        assert!(node
            .create_peer_invite("127.0.0.1", 4242, "unknown", now() + 3600, None)
            .is_err());
        node.store
            .upsert_pairing(&PairingRecord {
                pairing_id: "inactive".into(),
                local_node_id: identity.node_id.clone(),
                remote_node_id: "remote".into(),
                remote_display_name: "Remote".into(),
                remote_platform: "android".into(),
                remote_role: "phone".into(),
                status: "rejected".into(),
                created_at: now(),
                paired_at: None,
            })
            .unwrap();
        assert!(node
            .create_peer_invite("127.0.0.1", 4242, "inactive", now() + 3600, None)
            .is_err());
        node.store
            .upsert_pairing(&PairingRecord {
                pairing_id: "approved".into(),
                local_node_id: identity.node_id.clone(),
                remote_node_id: "remote".into(),
                remote_display_name: "Remote".into(),
                remote_platform: "android".into(),
                remote_role: "phone".into(),
                status: "approved".into(),
                created_at: now(),
                paired_at: Some(now()),
            })
            .unwrap();
        assert!(node
            .create_peer_invite("127.0.0.1", 4242, "approved", now() + 3600, None)
            .is_ok());
        node.store
            .upsert_pairing(&PairingRecord {
                pairing_id: "wrong-local".into(),
                local_node_id: "other-local".into(),
                remote_node_id: "remote".into(),
                remote_display_name: "Remote".into(),
                remote_platform: "android".into(),
                remote_role: "phone".into(),
                status: "approved".into(),
                created_at: now(),
                paired_at: Some(now()),
            })
            .unwrap();
        assert!(node
            .create_peer_invite("127.0.0.1", 4242, "wrong-local", now() + 3600, None)
            .is_err());
    }

    #[test]
    fn importing_peer_invite_leaves_ledger_and_semantic_fingerprint_unchanged() {
        let node = DesktopNode {
            data_dir: PathBuf::new(),
            store: Store::open_in_memory().unwrap(),
        };
        node.ensure_identity().unwrap();
        let before = MyceliumStateSnapshot::from_store(&node.store)
            .unwrap()
            .fingerprint();
        node.import_peer_invite(&invite_for("remote".into(), "pair"))
            .unwrap();
        let after = MyceliumStateSnapshot::from_store(&node.store)
            .unwrap()
            .fingerprint();
        assert_eq!(before, after);
        assert!(node.store.packets_for_replay().unwrap().is_empty());
        node.import_peer_invite(&invite_for("remote".into(), "pair"))
            .unwrap();
        assert_eq!(node.store.peers().unwrap().len(), 1);
    }
    #[test]
    fn identity_is_persistent_and_name_does_not_change_id() {
        let dir = std::env::temp_dir().join(format!("daovibe-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let first = DesktopNode::open(&dir).unwrap().ensure_identity().unwrap();
        let node = DesktopNode::open(&dir).unwrap();
        let second = node.ensure_identity().unwrap();
        assert_eq!(first.node_id, second.node_id);
        let renamed = node.set_name("Office").unwrap();
        assert_eq!(renamed.node_id, first.node_id);
        assert_eq!(renamed.display_name, "Office");
        let _ = PacketType::PhraseObserved;
        let _ = Packet {
            version: crate::models::LMP_VERSION.to_owned(),
            packet_id: String::new(),
            packet_type: PacketType::PhraseObserved,
            created_at: 1,
            expires_at: None,
            zone: "z".to_owned(),
            author: "a".to_owned(),
            parent: None,
            payload_hash: String::new(),
            payload: PacketPayload::PhraseObserved {
                phrase_id: "p".to_owned(),
                surface_text: None,
                phonetic_hint: None,
                language_hint: None,
                input_type: "text".to_owned(),
            },
            signature: String::new(),
        };
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn localhost_listener_accepts_handshake_and_sync_request() {
        let dir = std::env::temp_dir().join(format!("daovibe-interop-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let node = DesktopNode::open(&dir).unwrap();
        let identity = node.ensure_identity().unwrap();
        let offer = PairingOffer {
            protocol_version: protocol::PAIRING_VERSION.to_owned(),
            pairing_id: crate::models::pairing_id_for(
                "mycelium_node_phone",
                1_700_000_000,
                Some("challenge"),
            ),
            source_node_id: "mycelium_node_phone".to_owned(),
            source_display_name: "Pocket Node".to_owned(),
            source_platform: "android".to_owned(),
            source_role: "phone".to_owned(),
            created_at: 1_700_000_000,
            challenge: Some("challenge".to_owned()),
        };
        node.create_approval(&offer, true).unwrap();
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let worker_dir = dir.clone();
        let worker = std::thread::spawn(move || {
            let worker_node = DesktopNode::open(worker_dir).unwrap();
            let (mut stream, _) = listener.accept().unwrap();
            transport::configure_stream(&stream).unwrap();
            worker_node.serve_stream(&mut stream).unwrap();
        });
        let mut stream = TcpStream::connect(endpoint).unwrap();
        transport::configure_stream(&stream).unwrap();
        let session = "session_0123456789abcdef0123456789abcdef".to_owned();
        let hello = Hello {
            protocol_version: CONNECTION_VERSION.to_owned(),
            session_id: session.clone(),
            source_node_id: "mycelium_node_phone".to_owned(),
            target_node_id: identity.node_id.clone(),
            source_platform: "android".to_owned(),
            source_role: "phone".to_owned(),
            pairing_id: offer.pairing_id.clone(),
            created_at: 1_700_000_002,
            supported_connection_versions: vec![CONNECTION_VERSION.to_owned()],
            supported_packet_protocol_versions: vec![crate::models::LMP_VERSION.to_owned()],
            capabilities: vec!["mycelium".to_owned(), "packet_ledger".to_owned()],
        };
        transport::write_frame(&mut stream, &hello.canonical_json()).unwrap();
        let accept: serde_json::Value =
            serde_json::from_str(&transport::read_frame(&mut stream).unwrap()).unwrap();
        assert_eq!(accept["message_type"], "connection_accept");
        let request = SyncRequest {
            protocol_version: SYNC_VERSION.to_owned(),
            session_id: session,
            source_node_id: "mycelium_node_phone".to_owned(),
            target_node_id: identity.node_id.clone(),
            pairing_id: offer.pairing_id,
            cursor: protocol::START_CURSOR.to_owned(),
            limit: 50,
        };
        transport::write_frame(&mut stream, &request.canonical_json()).unwrap();
        let batch: serde_json::Value =
            serde_json::from_str(&transport::read_frame(&mut stream).unwrap()).unwrap();
        assert_eq!(batch["message_type"], "sync_batch");
        assert_eq!(batch["has_more"], false);

        let reverse_request_json = transport::read_frame(&mut stream).unwrap();
        let reverse_request_value: serde_json::Value =
            serde_json::from_str(&reverse_request_json).unwrap();

        let reverse_request = match protocol::decode_sync(&reverse_request_value).unwrap() {
            SyncMessage::Request(value) => value,
            _ => panic!("expected reverse sync request"),
        };

        assert_eq!(reverse_request.source_node_id, identity.node_id);
        assert_eq!(reverse_request.target_node_id, "mycelium_node_phone");

        let reverse_batch = SyncBatch {
            protocol_version: SYNC_VERSION.to_owned(),
            session_id: reverse_request.session_id.clone(),
            source_node_id: reverse_request.target_node_id.clone(),
            target_node_id: reverse_request.source_node_id.clone(),
            pairing_id: reverse_request.pairing_id.clone(),
            request_cursor: reverse_request.cursor.clone(),
            next_cursor: reverse_request.cursor.clone(),
            has_more: false,
            packets: Vec::new(),
        };

        transport::write_frame(&mut stream, &reverse_batch.canonical_json()).unwrap();

        worker.join().unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn diagnose_is_one_handshake_only_and_preserves_ledger_state() {
        let root = std::env::temp_dir().join(format!("daovibe-diagnose-{}", uuid::Uuid::new_v4()));
        let client_dir = root.join("client");
        let server_dir = root.join("server");
        let client = DesktopNode::open(&client_dir).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        let server = DesktopNode::open(&server_dir).unwrap();
        let client_identity = client.ensure_identity().unwrap();
        let server_identity = server.ensure_identity().unwrap();
        let pairing_id = pair_nodes(&client, &client_identity, &server, 1_700_200_000);
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        client
            .add_peer(
                &server_identity.node_id,
                "127.0.0.1",
                endpoint.port(),
                &pairing_id,
                Some("diagnose server".to_owned()),
            )
            .unwrap();
        let before_count = client.store.packet_count().unwrap();
        let before_fingerprint = MyceliumStateSnapshot::from_store(&client.store)
            .unwrap()
            .fingerprint();
        let before_cursor = client
            .store
            .cursor_or_start_for_pairing(&server_identity.node_id, &pairing_id)
            .unwrap();
        let worker_dir = server_dir.clone();
        let worker = std::thread::spawn(move || {
            let worker_node = DesktopNode::open(worker_dir).unwrap();
            let (mut stream, _) = listener.accept().unwrap();
            transport::configure_stream(&stream).unwrap();
            let hello_json = transport::read_frame(&mut stream).unwrap();
            let hello_value: serde_json::Value = serde_json::from_str(&hello_json).unwrap();
            let hello = Hello::decode(&hello_value).unwrap();
            let identity = worker_node.ensure_identity().unwrap();
            let accept = Accept {
                protocol_version: CONNECTION_VERSION.to_owned(),
                session_id: hello.session_id.clone(),
                source_node_id: identity.node_id,
                target_node_id: hello.source_node_id,
                pairing_id: hello.pairing_id,
                accepted_at: now(),
                negotiated_connection_version: CONNECTION_VERSION.to_owned(),
                negotiated_packet_protocol_version: crate::models::LMP_VERSION.to_owned(),
                capabilities: hello.capabilities,
                state: "connected".to_owned(),
            };
            transport::write_frame(&mut stream, &accept.canonical_json()).unwrap();
            assert!(transport::read_frame_or_eof(&mut stream).unwrap().is_none());
        });

        let result = client.diagnose_peer_result(&server_identity.node_id);
        worker.join().unwrap();

        assert_eq!(result.outcome, PeerDiagnoseOutcome::Success);
        assert_eq!(result.stage, PeerDiagnoseStage::Complete);
        assert_eq!(client.store.packet_count().unwrap(), before_count);
        assert_eq!(
            MyceliumStateSnapshot::from_store(&client.store)
                .unwrap()
                .fingerprint(),
            before_fingerprint
        );
        assert_eq!(
            client
                .store
                .cursor_or_start_for_pairing(&server_identity.node_id, &pairing_id)
                .unwrap(),
            before_cursor
        );
        let peer = client
            .store
            .peer(&server_identity.node_id)
            .unwrap()
            .unwrap();
        assert_eq!(peer.last_diagnostic_outcome.as_deref(), Some("success"));
        assert_eq!(peer.last_outcome, None);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn diagnose_structured_rejects_use_reason_code_categories() {
        for (reason, expected) in [
            (
                "pairing_not_found",
                PeerDiagnoseErrorCategory::PairingMismatch,
            ),
            (
                "incompatible_connection_version",
                PeerDiagnoseErrorCategory::ProtocolMismatch,
            ),
            ("invalid_message", PeerDiagnoseErrorCategory::RemoteRejected),
        ] {
            let root = std::env::temp_dir()
                .join(format!("daovibe-diagnose-reject-{}", uuid::Uuid::new_v4()));
            let client_dir = root.join("client");
            let server_dir = root.join("server");
            let client = DesktopNode::open(&client_dir).unwrap();
            std::thread::sleep(std::time::Duration::from_secs(1));
            let server = DesktopNode::open(&server_dir).unwrap();
            let client_identity = client.ensure_identity().unwrap();
            let server_identity = server.ensure_identity().unwrap();
            let pairing_id = pair_nodes(&client, &client_identity, &server, 1_700_210_000);
            let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
            let endpoint = listener.local_addr().unwrap();
            client
                .add_peer(
                    &server_identity.node_id,
                    "127.0.0.1",
                    endpoint.port(),
                    &pairing_id,
                    None,
                )
                .unwrap();
            let worker = std::thread::spawn(move || {
                let worker_node = DesktopNode::open(server_dir).unwrap();
                let (mut stream, _) = listener.accept().unwrap();
                transport::configure_stream(&stream).unwrap();
                let hello_json = transport::read_frame(&mut stream).unwrap();
                let hello_value: serde_json::Value = serde_json::from_str(&hello_json).unwrap();
                let hello = Hello::decode(&hello_value).unwrap();
                let identity = worker_node.ensure_identity().unwrap();
                let reject = protocol::make_reject(
                    hello.session_id,
                    identity.node_id,
                    hello.source_node_id,
                    hello.pairing_id,
                    reason,
                    now(),
                );
                transport::write_frame(&mut stream, &reject.canonical_json()).unwrap();
            });
            let result = client.diagnose_peer_result(&server_identity.node_id);
            worker.join().unwrap();
            assert_eq!(result.error_category, Some(expected));
            assert_eq!(result.outcome, PeerDiagnoseOutcome::Failed);
            let _ = fs::remove_dir_all(&root);
        }
    }

    #[test]
    fn three_node_production_sync_converges_bidirectionally_without_direct_a_c_pairing() {
        let root =
            std::env::temp_dir().join(format!("daovibe-three-node-sync-{}", uuid::Uuid::new_v4()));
        let a_dir = root.join("a");
        let b_dir = root.join("b");
        let c_dir = root.join("c");
        let a = DesktopNode::open(&a_dir).unwrap();
        // The development identity generator includes creation seconds; keep
        // the independent test stores on distinct identity timestamps.
        std::thread::sleep(std::time::Duration::from_secs(1));
        let b = DesktopNode::open(&b_dir).unwrap();
        std::thread::sleep(std::time::Duration::from_secs(1));
        let c = DesktopNode::open(&c_dir).unwrap();
        let a_identity = a.ensure_identity().unwrap();
        let b_identity = b.ensure_identity().unwrap();
        let c_identity = c.ensure_identity().unwrap();
        let ab_pairing = pair_nodes(&a, &a_identity, &b, 1_700_100_000);
        let bc_pairing = pair_nodes(&b, &b_identity, &c, 1_700_100_001);

        let packet_from_a = phrase_packet(&a_identity.node_id, "phrase_from_a", 1_700_100_001);
        assert!(a
            .store
            .insert_packet(&packet_from_a, 1_700_100_001)
            .unwrap());

        sync_once(&a, &b_identity.node_id, &ab_pairing, &b_dir);
        assert_original_packet(&b, &packet_from_a, 1);
        sync_once(&b, &c_identity.node_id, &bc_pairing, &c_dir);
        assert_original_packet(&c, &packet_from_a, 1);

        // Repeating the same A -> B -> C propagation must not add a wrapper
        // packet or duplicate the ordinary ledger entry.
        sync_once(&a, &b_identity.node_id, &ab_pairing, &b_dir);
        sync_once(&b, &c_identity.node_id, &bc_pairing, &c_dir);
        assert_original_packet(&b, &packet_from_a, 1);
        assert_original_packet(&c, &packet_from_a, 1);

        let packet_from_c = phrase_packet(&c_identity.node_id, "phrase_from_c", 1_700_100_002);
        let b_c_cursor = b
            .store
            .cursor_or_start_for_pairing(&c_identity.node_id, &bc_pairing)
            .unwrap();
        let (b_c_received_at, _) = protocol::parse_cursor(&b_c_cursor).unwrap();
        let c_packet_received_at = b_c_received_at + 1;
        assert!(c
            .store
            .insert_packet(&packet_from_c, c_packet_received_at)
            .unwrap());
        assert!(c_packet_received_at > b_c_received_at);

        let a_b_cursor = a
            .store
            .cursor_or_start_for_pairing(&b_identity.node_id, &ab_pairing)
            .unwrap();
        let (a_b_received_at, _) = protocol::parse_cursor(&a_b_cursor).unwrap();
        for _ in 0..40 {
            if now() > a_b_received_at {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert!(now() > a_b_received_at);
        sync_once(&c, &b_identity.node_id, &bc_pairing, &b_dir);
        assert_original_packet(&b, &packet_from_c, 2);
        sync_once(&b, &a_identity.node_id, &ab_pairing, &a_dir);
        assert_original_packet(&a, &packet_from_c, 2);

        // The reverse C -> B -> A propagation is likewise idempotent.
        sync_once(&c, &b_identity.node_id, &bc_pairing, &b_dir);
        sync_once(&b, &a_identity.node_id, &ab_pairing, &a_dir);
        assert_original_packet(&a, &packet_from_a, 2);
        assert_original_packet(&a, &packet_from_c, 2);
        assert_original_packet(&b, &packet_from_a, 2);
        assert_original_packet(&b, &packet_from_c, 2);
        assert_original_packet(&c, &packet_from_a, 2);
        assert_original_packet(&c, &packet_from_c, 2);

        let a_fingerprint = MyceliumStateSnapshot::from_store(&a.store)
            .unwrap()
            .fingerprint();
        let b_fingerprint = MyceliumStateSnapshot::from_store(&b.store)
            .unwrap()
            .fingerprint();
        let c_fingerprint = MyceliumStateSnapshot::from_store(&c.store)
            .unwrap()
            .fingerprint();
        assert_eq!(a_fingerprint, b_fingerprint);
        assert_eq!(a_fingerprint, c_fingerprint);

        let _ = fs::remove_dir_all(&root);
    }

    fn pair_nodes(
        initiator: &DesktopNode,
        initiator_identity: &DeviceIdentity,
        accepter: &DesktopNode,
        created_at: i64,
    ) -> String {
        let pairing_id =
            crate::models::pairing_id_for(&initiator_identity.node_id, created_at, None);
        let offer = PairingOffer {
            protocol_version: protocol::PAIRING_VERSION.to_owned(),
            pairing_id: pairing_id.clone(),
            source_node_id: initiator_identity.node_id.clone(),
            source_display_name: initiator_identity.display_name.clone(),
            source_platform: initiator_identity.platform.clone(),
            source_role: initiator_identity.role.clone(),
            created_at,
            challenge: None,
        };
        let approval = accepter.create_approval(&offer, true).unwrap();
        initiator
            .store
            .upsert_pairing(&PairingRecord::from(&approval))
            .unwrap();
        pairing_id
    }

    fn sync_once(client: &DesktopNode, remote_node_id: &str, pairing_id: &str, server_dir: &Path) {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        client
            .add_peer(
                remote_node_id,
                "127.0.0.1",
                endpoint.port(),
                pairing_id,
                Some("three-node test peer".to_owned()),
            )
            .unwrap();
        let server_dir = server_dir.to_owned();
        let worker = std::thread::spawn(move || {
            let server = DesktopNode::open(server_dir).unwrap();
            let (mut stream, _) = listener.accept().unwrap();
            transport::configure_stream(&stream).unwrap();
            server.serve_stream(&mut stream).unwrap();
        });
        client.sync_peer(remote_node_id).unwrap();
        worker.join().unwrap();
    }

    fn assert_original_packet(node: &DesktopNode, original: &Packet, expected_count: i64) {
        let packets = node.store.packets_for_replay().unwrap();
        assert_eq!(packets.len() as i64, expected_count);
        let replicated = packets
            .into_iter()
            .find(|packet| packet.packet_id == original.packet_id)
            .expect("original packet must be present");
        assert_eq!(replicated.packet_id, original.packet_id);
        assert_eq!(replicated.author, original.author);
        assert_eq!(replicated.canonical_json(), original.canonical_json());
    }

    fn phrase_packet(author: &str, phrase_id: &str, created_at: i64) -> Packet {
        let payload = PacketPayload::PhraseObserved {
            phrase_id: phrase_id.to_owned(),
            surface_text: Some(format!("ordinary packet from {author}")),
            phonetic_hint: None,
            language_hint: Some("en".to_owned()),
            input_type: "text".to_owned(),
        };
        let payload_hash = sha256(&canonical::stringify(&payload.to_value()));
        let hash_input = serde_json::json!({
            "version": crate::models::LMP_VERSION,
            "packet_type": PacketType::PhraseObserved.wire(),
            "created_at": created_at,
            "zone": "three_node_sync_test",
            "author": author,
            "payload_hash": payload_hash,
            "payload": payload.to_value(),
        });
        let packet_id = sha256(&canonical::stringify(&hash_input));
        let packet = Packet {
            version: crate::models::LMP_VERSION.to_owned(),
            packet_id: packet_id.clone(),
            packet_type: PacketType::PhraseObserved,
            created_at,
            expires_at: None,
            zone: "three_node_sync_test".to_owned(),
            author: author.to_owned(),
            parent: None,
            payload_hash,
            payload,
            signature: format!(
                "{}:{}:{}",
                crate::models::DEV_SIGNATURE_PREFIX,
                author,
                packet_id
            ),
        };
        packet.validate().unwrap();
        packet
    }
}
