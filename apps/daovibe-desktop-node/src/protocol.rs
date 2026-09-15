use crate::canonical;
use crate::models::{pairing_id_for, Packet, PacketError, LMP_VERSION};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use thiserror::Error;
use uuid::Uuid;

pub const PAIRING_VERSION: &str = "daovibe-pairing-v1";
pub const CONNECTION_VERSION: &str = "daovibe-connection-v1";
pub const SYNC_VERSION: &str = "daovibe-sync-v1";
pub const MAX_FRAME_BYTES: usize = 64 * 1024;
pub const MAX_PACKETS_PER_BATCH: usize = 50;
pub const MAX_SYNC_WINDOWS: usize = 20;
pub const START_CURSOR: &str = "0:";

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid protocol message: {0}")]
    Invalid(String),
    #[error("invalid packet: {0}")]
    Packet(#[from] PacketError),
}

#[derive(Clone, Debug, PartialEq)]
pub struct PairingOffer {
    pub protocol_version: String,
    pub pairing_id: String,
    pub source_node_id: String,
    pub source_display_name: String,
    pub source_platform: String,
    pub source_role: String,
    pub created_at: i64,
    pub challenge: Option<String>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct PairingApproval {
    pub protocol_version: String,
    pub pairing_id: String,
    pub approving_node_id: String,
    pub approving_display_name: String,
    pub approving_platform: String,
    pub approving_role: String,
    pub target_node_id: String,
    pub approved_at: i64,
    pub approval_state: String,
    pub challenge_echo: Option<String>,
}

impl PairingOffer {
    pub fn to_value(&self) -> Value {
        object([
            ("protocol_version", json!(self.protocol_version)),
            ("pairing_id", json!(self.pairing_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("source_display_name", json!(self.source_display_name)),
            ("source_platform", json!(self.source_platform)),
            ("source_role", json!(self.source_role)),
            ("created_at", json!(self.created_at)),
            ("challenge", optional(&self.challenge)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn decode(value: &Value) -> Result<Self, ProtocolError> {
        let result = Self {
            protocol_version: text(value, "protocol_version")?,
            pairing_id: text(value, "pairing_id")?,
            source_node_id: text(value, "source_node_id")?,
            source_display_name: text(value, "source_display_name")?,
            source_platform: text(value, "source_platform")?,
            source_role: text(value, "source_role")?,
            created_at: integer(value, "created_at")?,
            challenge: optional_text(value, "challenge"),
        };
        result.validate()?;
        Ok(result)
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        require(
            self.protocol_version == PAIRING_VERSION,
            "unsupported pairing protocol version",
        )?;
        require_nonempty(&self.pairing_id, "pairing_id")?;
        require_nonempty(&self.source_node_id, "source_node_id")?;
        require_nonempty(&self.source_display_name, "source_display_name")?;
        require_nonempty(&self.source_platform, "source_platform")?;
        require_nonempty(&self.source_role, "source_role")?;
        require(self.created_at > 0, "created_at must be positive")?;
        if self.pairing_id
            != pairing_id_for(
                &self.source_node_id,
                self.created_at,
                self.challenge.as_deref(),
            )
        {
            return Err(ProtocolError::Invalid(
                "pairing_id does not match offer identity".to_owned(),
            ));
        }
        Ok(())
    }
}
impl PairingApproval {
    pub fn to_value(&self) -> Value {
        object([
            ("protocol_version", json!(self.protocol_version)),
            ("pairing_id", json!(self.pairing_id)),
            ("approving_node_id", json!(self.approving_node_id)),
            ("approving_display_name", json!(self.approving_display_name)),
            ("approving_platform", json!(self.approving_platform)),
            ("approving_role", json!(self.approving_role)),
            ("target_node_id", json!(self.target_node_id)),
            ("approved_at", json!(self.approved_at)),
            ("approval_state", json!(self.approval_state)),
            ("challenge_echo", optional(&self.challenge_echo)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn decode(value: &Value) -> Result<Self, ProtocolError> {
        let result = Self {
            protocol_version: text(value, "protocol_version")?,
            pairing_id: text(value, "pairing_id")?,
            approving_node_id: text(value, "approving_node_id")?,
            approving_display_name: text(value, "approving_display_name")?,
            approving_platform: text(value, "approving_platform")?,
            approving_role: text(value, "approving_role")?,
            target_node_id: text(value, "target_node_id")?,
            approved_at: integer(value, "approved_at")?,
            approval_state: text(value, "approval_state")?,
            challenge_echo: optional_text(value, "challenge_echo"),
        };
        result.validate()?;
        Ok(result)
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        require(
            self.protocol_version == PAIRING_VERSION,
            "unsupported pairing protocol version",
        )?;
        for (value, name) in [
            (&self.pairing_id, "pairing_id"),
            (&self.approving_node_id, "approving_node_id"),
            (&self.approving_display_name, "approving_display_name"),
            (&self.approving_platform, "approving_platform"),
            (&self.approving_role, "approving_role"),
            (&self.target_node_id, "target_node_id"),
        ] {
            require_nonempty(value, name)?;
        }
        require(self.approved_at > 0, "approved_at must be positive")?;
        require(
            self.approval_state == "approved" || self.approval_state == "rejected",
            "invalid approval_state",
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Hello {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub source_platform: String,
    pub source_role: String,
    pub pairing_id: String,
    pub created_at: i64,
    pub supported_connection_versions: Vec<String>,
    pub supported_packet_protocol_versions: Vec<String>,
    pub capabilities: Vec<String>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Accept {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub pairing_id: String,
    pub accepted_at: i64,
    pub negotiated_connection_version: String,
    pub negotiated_packet_protocol_version: String,
    pub capabilities: Vec<String>,
    pub state: String,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Reject {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub pairing_id: String,
    pub rejected_at: i64,
    pub reason_code: String,
}

impl Hello {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("connection_hello")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("source_platform", json!(self.source_platform)),
            ("source_role", json!(self.source_role)),
            ("pairing_id", json!(self.pairing_id)),
            ("created_at", json!(self.created_at)),
            (
                "supported_connection_versions",
                json!(sorted_unique(&self.supported_connection_versions)),
            ),
            (
                "supported_packet_protocol_versions",
                json!(sorted_unique(&self.supported_packet_protocol_versions)),
            ),
            ("capabilities", json!(sorted_unique(&self.capabilities))),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn decode(value: &Value) -> Result<Self, ProtocolError> {
        let result = Self {
            protocol_version: text(value, "protocol_version")?,
            session_id: text(value, "session_id")?,
            source_node_id: text(value, "source_node_id")?,
            target_node_id: text(value, "target_node_id")?,
            source_platform: text(value, "source_platform")?,
            source_role: text(value, "source_role")?,
            pairing_id: text(value, "pairing_id")?,
            created_at: integer(value, "created_at")?,
            supported_connection_versions: strings(value, "supported_connection_versions")?,
            supported_packet_protocol_versions: strings(
                value,
                "supported_packet_protocol_versions",
            )?,
            capabilities: strings(value, "capabilities")?,
        };
        result.validate()?;
        Ok(result)
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_connection_common(
            &self.protocol_version,
            &self.session_id,
            &self.source_node_id,
            &self.target_node_id,
            &self.pairing_id,
            self.created_at,
        )?;
        validate_strings(
            &self.supported_connection_versions,
            "supported_connection_versions",
        )?;
        validate_strings(
            &self.supported_packet_protocol_versions,
            "supported_packet_protocol_versions",
        )?;
        validate_strings(&self.capabilities, "capabilities")?;
        require(
            self.supported_connection_versions
                .iter()
                .any(|v| v == CONNECTION_VERSION),
            "hello does not advertise current connection version",
        )?;
        require(
            self.supported_packet_protocol_versions
                .iter()
                .any(|v| v == LMP_VERSION),
            "hello does not advertise current packet version",
        )
    }
}
impl Accept {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("connection_accept")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("pairing_id", json!(self.pairing_id)),
            ("accepted_at", json!(self.accepted_at)),
            (
                "negotiated_connection_version",
                json!(self.negotiated_connection_version),
            ),
            (
                "negotiated_packet_protocol_version",
                json!(self.negotiated_packet_protocol_version),
            ),
            ("capabilities", json!(sorted_unique(&self.capabilities))),
            ("state", json!(self.state)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_connection_common(
            &self.protocol_version,
            &self.session_id,
            &self.source_node_id,
            &self.target_node_id,
            &self.pairing_id,
            self.accepted_at,
        )?;
        require(
            self.negotiated_connection_version == CONNECTION_VERSION,
            "unsupported negotiated connection version",
        )?;
        require(
            self.negotiated_packet_protocol_version == LMP_VERSION,
            "unsupported negotiated packet version",
        )?;
        require(
            self.state == "connected",
            "accept must declare connected state",
        )?;
        validate_strings(&self.capabilities, "capabilities")
    }
}
impl Reject {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("connection_reject")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("pairing_id", json!(self.pairing_id)),
            ("rejected_at", json!(self.rejected_at)),
            ("reason_code", json!(self.reason_code)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_connection_common(
            &self.protocol_version,
            &self.session_id,
            &self.source_node_id,
            &self.target_node_id,
            &self.pairing_id,
            self.rejected_at,
        )
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SyncRequest {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub pairing_id: String,
    pub cursor: String,
    pub limit: usize,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SyncBatch {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub pairing_id: String,
    pub request_cursor: String,
    pub next_cursor: String,
    pub has_more: bool,
    pub packets: Vec<Packet>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SyncReject {
    pub protocol_version: String,
    pub session_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub pairing_id: String,
    pub reason_code: String,
}

impl SyncRequest {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("sync_request")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("pairing_id", json!(self.pairing_id)),
            ("cursor", json!(self.cursor)),
            ("limit", json!(self.limit)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn decode(value: &Value) -> Result<Self, ProtocolError> {
        let result = Self {
            protocol_version: text(value, "protocol_version")?,
            session_id: text(value, "session_id")?,
            source_node_id: text(value, "source_node_id")?,
            target_node_id: text(value, "target_node_id")?,
            pairing_id: text(value, "pairing_id")?,
            cursor: text(value, "cursor")?,
            limit: value
                .get("limit")
                .and_then(Value::as_u64)
                .ok_or_else(|| ProtocolError::Invalid("limit".to_owned()))?
                as usize,
        };
        result.validate()?;
        Ok(result)
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_sync_common(
            &self.protocol_version,
            &self.session_id,
            &self.source_node_id,
            &self.target_node_id,
            &self.pairing_id,
        )?;
        parse_cursor(&self.cursor)?;
        require(self.limit > 0, "limit must be positive")
    }
}
impl SyncBatch {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("sync_batch")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("pairing_id", json!(self.pairing_id)),
            ("request_cursor", json!(self.request_cursor)),
            ("next_cursor", json!(self.next_cursor)),
            ("has_more", json!(self.has_more)),
            (
                "packets",
                Value::Array(self.packets.iter().map(|p| p.to_value()).collect()),
            ),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn validate(&self) -> Result<(), ProtocolError> {
        validate_sync_common(
            &self.protocol_version,
            &self.session_id,
            &self.source_node_id,
            &self.target_node_id,
            &self.pairing_id,
        )?;
        parse_cursor(&self.request_cursor)?;
        parse_cursor(&self.next_cursor)?;
        require(
            self.packets.len() <= MAX_PACKETS_PER_BATCH,
            "batch has too many packets",
        )?;
        require(
            compare_cursor(&self.next_cursor, &self.request_cursor) != std::cmp::Ordering::Less,
            "cursor regression",
        )?;
        require(
            !self.has_more || self.next_cursor != self.request_cursor,
            "stalled cursor",
        )?;
        for packet in &self.packets {
            packet.validate()?;
        }
        require(
            self.canonical_json().len() <= MAX_FRAME_BYTES,
            "sync batch exceeds frame limit",
        )
    }
}
impl SyncReject {
    pub fn to_value(&self) -> Value {
        object([
            ("message_type", json!("sync_reject")),
            ("protocol_version", json!(self.protocol_version)),
            ("session_id", json!(self.session_id)),
            ("source_node_id", json!(self.source_node_id)),
            ("target_node_id", json!(self.target_node_id)),
            ("pairing_id", json!(self.pairing_id)),
            ("reason_code", json!(self.reason_code)),
        ])
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
}

pub fn decode_connection(value: &Value) -> Result<ConnectionMessage, ProtocolError> {
    match text(value, "message_type")?.as_str() {
        "connection_hello" => Ok(ConnectionMessage::Hello(Hello::decode(value)?)),
        "connection_accept" => Ok(ConnectionMessage::Accept(decode_accept(value)?)),
        "connection_reject" => Ok(ConnectionMessage::Reject(decode_reject(value)?)),
        other => Err(ProtocolError::Invalid(format!(
            "unknown connection message {other}"
        ))),
    }
}
pub fn decode_sync(value: &Value) -> Result<SyncMessage, ProtocolError> {
    match text(value, "message_type")?.as_str() {
        "sync_request" => Ok(SyncMessage::Request(SyncRequest::decode(value)?)),
        "sync_batch" => Ok(SyncMessage::Batch(decode_batch(value)?)),
        "sync_reject" => Ok(SyncMessage::Reject(decode_sync_reject(value)?)),
        other => Err(ProtocolError::Invalid(format!(
            "unknown sync message {other}"
        ))),
    }
}
pub enum ConnectionMessage {
    Hello(Hello),
    Accept(Accept),
    Reject(Reject),
}
pub enum SyncMessage {
    Request(SyncRequest),
    Batch(SyncBatch),
    Reject(SyncReject),
}

fn decode_accept(value: &Value) -> Result<Accept, ProtocolError> {
    Ok(Accept {
        protocol_version: text(value, "protocol_version")?,
        session_id: text(value, "session_id")?,
        source_node_id: text(value, "source_node_id")?,
        target_node_id: text(value, "target_node_id")?,
        pairing_id: text(value, "pairing_id")?,
        accepted_at: integer(value, "accepted_at")?,
        negotiated_connection_version: text(value, "negotiated_connection_version")?,
        negotiated_packet_protocol_version: text(value, "negotiated_packet_protocol_version")?,
        capabilities: strings(value, "capabilities")?,
        state: text(value, "state")?,
    })
}
fn decode_reject(value: &Value) -> Result<Reject, ProtocolError> {
    Ok(Reject {
        protocol_version: text(value, "protocol_version")?,
        session_id: text(value, "session_id")?,
        source_node_id: text(value, "source_node_id")?,
        target_node_id: text(value, "target_node_id")?,
        pairing_id: text(value, "pairing_id")?,
        rejected_at: integer(value, "rejected_at")?,
        reason_code: text(value, "reason_code")?,
    })
}
fn decode_batch(value: &Value) -> Result<SyncBatch, ProtocolError> {
    let packets = value
        .get("packets")
        .and_then(Value::as_array)
        .ok_or_else(|| ProtocolError::Invalid("packets".to_owned()))?
        .iter()
        .map(Packet::from_value)
        .collect::<Result<Vec<_>, _>>()?;
    let result = SyncBatch {
        protocol_version: text(value, "protocol_version")?,
        session_id: text(value, "session_id")?,
        source_node_id: text(value, "source_node_id")?,
        target_node_id: text(value, "target_node_id")?,
        pairing_id: text(value, "pairing_id")?,
        request_cursor: text(value, "request_cursor")?,
        next_cursor: text(value, "next_cursor")?,
        has_more: value
            .get("has_more")
            .and_then(Value::as_bool)
            .ok_or_else(|| ProtocolError::Invalid("has_more".to_owned()))?,
        packets,
    };
    result.validate()?;
    Ok(result)
}
fn decode_sync_reject(value: &Value) -> Result<SyncReject, ProtocolError> {
    Ok(SyncReject {
        protocol_version: text(value, "protocol_version")?,
        session_id: text(value, "session_id")?,
        source_node_id: text(value, "source_node_id")?,
        target_node_id: text(value, "target_node_id")?,
        pairing_id: text(value, "pairing_id")?,
        reason_code: text(value, "reason_code")?,
    })
}

pub fn parse_cursor(value: &str) -> Result<(i64, String), ProtocolError> {
    let (at, id) = value.split_once(':').ok_or_else(|| {
        ProtocolError::Invalid("cursor must use received_at:packet_id".to_owned())
    })?;
    let at = at
        .parse::<i64>()
        .map_err(|_| ProtocolError::Invalid("cursor received_at is not an integer".to_owned()))?;
    require(at >= 0, "cursor received_at must not be negative")?;
    require(
        !id.contains(['\r', '\n']),
        "cursor packet_id contains a line break",
    )?;
    Ok((at, id.to_owned()))
}
pub fn compare_cursor(left: &str, right: &str) -> std::cmp::Ordering {
    let a = parse_cursor(left).expect("validated cursor");
    let b = parse_cursor(right).expect("validated cursor");
    a.cmp(&b)
}
pub fn session_id() -> String {
    format!("session_{}", Uuid::new_v4().simple())
}
pub fn make_reject(
    session_id: String,
    source_node_id: String,
    target_node_id: String,
    pairing_id: String,
    reason_code: &str,
    at: i64,
) -> Reject {
    Reject {
        protocol_version: CONNECTION_VERSION.to_owned(),
        session_id,
        source_node_id,
        target_node_id,
        pairing_id,
        rejected_at: at,
        reason_code: reason_code.to_owned(),
    }
}

fn object<const N: usize>(entries: [(&str, Value); N]) -> Value {
    let mut map = Map::new();
    for (key, value) in entries {
        if !value.is_null() {
            map.insert(key.to_owned(), value);
        }
    }
    Value::Object(map)
}
fn optional(value: &Option<String>) -> Value {
    value.clone().map(Value::String).unwrap_or(Value::Null)
}
fn text(value: &Value, name: &str) -> Result<String, ProtocolError> {
    value
        .get(name)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| ProtocolError::Invalid(format!("missing or invalid {name}")))
}
fn optional_text(value: &Value, name: &str) -> Option<String> {
    value
        .get(name)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}
fn integer(value: &Value, name: &str) -> Result<i64, ProtocolError> {
    value
        .get(name)
        .and_then(Value::as_i64)
        .ok_or_else(|| ProtocolError::Invalid(format!("missing or invalid {name}")))
}
fn strings(value: &Value, name: &str) -> Result<Vec<String>, ProtocolError> {
    value
        .get(name)
        .and_then(Value::as_array)
        .ok_or_else(|| ProtocolError::Invalid(format!("missing or invalid {name}")))?
        .iter()
        .map(|v| {
            v.as_str()
                .map(ToOwned::to_owned)
                .ok_or_else(|| ProtocolError::Invalid(format!("{name} must contain strings")))
        })
        .collect()
}
fn sorted_unique(values: &[String]) -> Vec<String> {
    let mut result = BTreeSet::new();
    result.extend(values.iter().cloned());
    result.into_iter().collect()
}
fn require(condition: bool, message: &str) -> Result<(), ProtocolError> {
    if condition {
        Ok(())
    } else {
        Err(ProtocolError::Invalid(message.to_owned()))
    }
}
fn require_nonempty(value: &str, name: &str) -> Result<(), ProtocolError> {
    require(
        !value.trim().is_empty(),
        &format!("{name} must be non-empty"),
    )
}
fn validate_strings(values: &[String], name: &str) -> Result<(), ProtocolError> {
    require(!values.is_empty(), &format!("{name} must not be empty"))?;
    for value in values {
        require_nonempty(value, name)?;
    }
    require(
        sorted_unique(values).len() == values.len(),
        &format!("{name} must not contain duplicates"),
    )
}
fn validate_session(value: &str) -> Result<(), ProtocolError> {
    require(
        value.starts_with("session_")
            && value.len() == 40
            && value[8..].chars().all(|c| c.is_ascii_hexdigit()),
        "malformed session_id",
    )
}
fn validate_connection_common(
    version: &str,
    session: &str,
    source: &str,
    target: &str,
    pairing: &str,
    at: i64,
) -> Result<(), ProtocolError> {
    require(
        version == CONNECTION_VERSION,
        "unsupported connection protocol version",
    )?;
    validate_session(session)?;
    require_nonempty(source, "source_node_id")?;
    require_nonempty(target, "target_node_id")?;
    require(
        source != target,
        "source_node_id must differ from target_node_id",
    )?;
    require_nonempty(pairing, "pairing_id")?;
    require(at > 0, "timestamp must be positive")
}
fn validate_sync_common(
    version: &str,
    session: &str,
    source: &str,
    target: &str,
    pairing: &str,
) -> Result<(), ProtocolError> {
    require(version == SYNC_VERSION, "unsupported sync protocol version")?;
    validate_session(session)?;
    require_nonempty(source, "source_node_id")?;
    require_nonempty(target, "target_node_id")?;
    require(
        source != target,
        "source_node_id must differ from target_node_id",
    )?;
    require_nonempty(pairing, "pairing_id")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn cursor_order_matches_android() {
        assert_eq!(compare_cursor("2:b", "2:a"), std::cmp::Ordering::Greater);
        assert_eq!(parse_cursor(START_CURSOR).unwrap(), (0, "".to_owned()));
    }
    #[test]
    fn hello_keys_are_canonical() {
        let hello = Hello {
            protocol_version: CONNECTION_VERSION.to_owned(),
            session_id: "session_0123456789abcdef0123456789abcdef".to_owned(),
            source_node_id: "phone".to_owned(),
            target_node_id: "computer".to_owned(),
            source_platform: "android".to_owned(),
            source_role: "phone".to_owned(),
            pairing_id: "pairing_x".to_owned(),
            created_at: 1,
            supported_connection_versions: vec![CONNECTION_VERSION.to_owned()],
            supported_packet_protocol_versions: vec![LMP_VERSION.to_owned()],
            capabilities: vec!["packet_ledger".to_owned(), "mycelium".to_owned()],
        };
        assert_eq!(
            hello.to_value().get("capabilities").unwrap(),
            &json!(["mycelium", "packet_ledger"])
        );
    }

    #[test]
    fn shared_fixtures_round_trip_with_android_canonical_bytes() {
        let offer_json = include_str!("../../../protocol-fixtures/pairing_offer.json");
        let offer_value: Value = serde_json::from_str(offer_json).unwrap();
        let offer = PairingOffer::decode(&offer_value).unwrap();
        assert_eq!(offer.canonical_json(), offer_json.trim_end());

        let approval_json = include_str!("../../../protocol-fixtures/pairing_approval.json");
        let approval_value: Value = serde_json::from_str(approval_json).unwrap();
        let approval = PairingApproval::decode(&approval_value).unwrap();
        assert_eq!(approval.canonical_json(), approval_json.trim_end());

        for name in [
            "connection_hello.json",
            "connection_accept.json",
            "connection_reject.json",
            "sync_request.json",
            "sync_batch.json",
        ] {
            let json = match name {
                "connection_hello.json" => {
                    include_str!("../../../protocol-fixtures/connection_hello.json")
                }
                "connection_accept.json" => {
                    include_str!("../../../protocol-fixtures/connection_accept.json")
                }
                "connection_reject.json" => {
                    include_str!("../../../protocol-fixtures/connection_reject.json")
                }
                "sync_request.json" => include_str!("../../../protocol-fixtures/sync_request.json"),
                _ => include_str!("../../../protocol-fixtures/sync_batch.json"),
            };
            let value: Value = serde_json::from_str(json).unwrap();
            if name.starts_with("connection") {
                match decode_connection(&value).unwrap() {
                    ConnectionMessage::Hello(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                    ConnectionMessage::Accept(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                    ConnectionMessage::Reject(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                }
            } else {
                match decode_sync(&value).unwrap() {
                    SyncMessage::Request(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                    SyncMessage::Batch(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                    SyncMessage::Reject(message) => {
                        assert_eq!(message.canonical_json(), json.trim_end())
                    }
                }
            }
        }

        for name in [
            "phrase_observed.json",
            "meaning_proposal.json",
            "meaning_vote.json",
            "safety_label.json",
        ] {
            let json = match name {
                "phrase_observed.json" => {
                    include_str!("../../../protocol-fixtures/phrase_observed.json")
                }
                "meaning_proposal.json" => {
                    include_str!("../../../protocol-fixtures/meaning_proposal.json")
                }
                "meaning_vote.json" => include_str!("../../../protocol-fixtures/meaning_vote.json"),
                _ => include_str!("../../../protocol-fixtures/safety_label.json"),
            };
            let packet = Packet::from_json(json).unwrap();
            assert_eq!(packet.canonical_json(), json.trim_end());
        }
    }
}
