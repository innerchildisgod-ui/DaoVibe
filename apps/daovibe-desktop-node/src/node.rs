use crate::models::{sha256, DeviceIdentity};
use crate::protocol::{
    self, Accept, Hello, PairingApproval, PairingOffer, ProtocolError, SyncBatch, SyncMessage,
    SyncReject, SyncRequest, CONNECTION_VERSION, MAX_PACKETS_PER_BATCH, MAX_SYNC_WINDOWS,
    SYNC_VERSION,
};
use crate::storage::{PairingRecord, StorageError, Store};
use crate::transport::{self, TransportError};
use std::io;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub const DESKTOP_PLATFORM: &str = "windows";
pub const DESKTOP_ROLE: &str = "computer";
pub const DESKTOP_CAPABILITIES: &[&str] = &["mycelium", "packet_ledger", "persistent_storage"];

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
                self.serve_sync(stream, &identity, &hello)?;
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
    ) -> Result<(), NodeError> {
        for window in 0..MAX_SYNC_WINDOWS {
            let message_json = transport::read_frame(stream)?;
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
                return Ok(());
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
    use crate::models::{Packet, PacketPayload, PacketType};
    use std::fs;
    use std::net::{TcpListener, TcpStream};
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
        worker.join().unwrap();
        let _ = fs::remove_dir_all(&dir);
    }
}
