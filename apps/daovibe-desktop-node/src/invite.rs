use crate::canonical;
use crate::models::{sha256, LMP_VERSION};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

pub const INVITE_VERSION: u32 = 1;
pub const CONNECTION_VERSION: &str = "daovibe-connection-v1";
pub const MAX_INVITE_BYTES: usize = 4096;
pub const MAX_INVITE_TEXT: usize = 8192;
const PREFIX: &str = "daovibe://peer-invite?v=1&data=";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PeerInvite {
    pub invite_version: u32,
    pub source_node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_display_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub pairing_id: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub connection_version: String,
    pub packet_protocol_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Error)]
pub enum InviteError {
    #[error("invalid invite JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid invite: {0}")]
    Invalid(String),
}

impl PeerInvite {
    pub fn canonical_json(&self) -> Result<String, InviteError> {
        self.validate(self.created_at)?;
        Ok(canonical::stringify(&self.to_value()))
    }
    pub fn invite_id(&self) -> Result<String, InviteError> {
        Ok(sha256(&self.canonical_json()?))
    }
    pub fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert(
            "invite_version".into(),
            serde_json::json!(self.invite_version),
        );
        map.insert(
            "source_node_id".into(),
            serde_json::json!(self.source_node_id),
        );
        if let Some(value) = &self.source_display_name {
            map.insert("source_display_name".into(), serde_json::json!(value));
        }
        map.insert("host".into(), serde_json::json!(self.host));
        map.insert("port".into(), serde_json::json!(self.port));
        map.insert("pairing_id".into(), serde_json::json!(self.pairing_id));
        map.insert("created_at".into(), serde_json::json!(self.created_at));
        map.insert("expires_at".into(), serde_json::json!(self.expires_at));
        map.insert(
            "connection_version".into(),
            serde_json::json!(self.connection_version),
        );
        map.insert(
            "packet_protocol_version".into(),
            serde_json::json!(self.packet_protocol_version),
        );
        if let Some(values) = &self.capabilities {
            let mut values = values.clone();
            values.sort();
            map.insert("capabilities".into(), serde_json::json!(values));
        }
        if let Some(value) = &self.note {
            map.insert("note".into(), serde_json::json!(value));
        }
        Value::Object(map)
    }
    pub fn decode_canonical(json: &str, now: i64) -> Result<Self, InviteError> {
        if json.len() > MAX_INVITE_BYTES {
            return Err(InviteError::Invalid("invite payload is oversized".into()));
        }
        let invite: Self = serde_json::from_str(json)?;
        invite.validate(now)?;
        Ok(invite)
    }
    pub fn payload(&self) -> Result<String, InviteError> {
        let json = self.canonical_json()?;
        if json.len() > MAX_INVITE_BYTES {
            return Err(InviteError::Invalid("invite payload is oversized".into()));
        }
        Ok(format!("{PREFIX}{}", base64_url_encode(json.as_bytes())))
    }
    pub fn decode_payload(payload: &str, now: i64) -> Result<Self, InviteError> {
        if payload.len() > MAX_INVITE_TEXT {
            return Err(InviteError::Invalid("invite text is oversized".into()));
        }
        let encoded = payload.strip_prefix(PREFIX).ok_or_else(|| {
            InviteError::Invalid("unsupported or malformed invite payload".into())
        })?;
        let bytes = base64_url_decode(encoded)
            .ok_or_else(|| InviteError::Invalid("malformed invite encoding".into()))?;
        if base64_url_encode(&bytes) != encoded {
            return Err(InviteError::Invalid("non-canonical invite encoding".into()));
        }
        if bytes.len() > MAX_INVITE_BYTES {
            return Err(InviteError::Invalid("invite payload is oversized".into()));
        }
        let json = String::from_utf8(bytes)
            .map_err(|_| InviteError::Invalid("invite is not UTF-8".into()))?;
        Self::decode_canonical(&json, now)
    }
    pub fn validate(&self, now: i64) -> Result<(), InviteError> {
        let nonblank = |value: &str, field: &str, max: usize| {
            if value.trim().is_empty() {
                return Err(InviteError::Invalid(format!("{field} must not be blank")));
            }
            if value.len() > max {
                return Err(InviteError::Invalid(format!("{field} is too long")));
            }
            Ok(())
        };
        if self.invite_version != INVITE_VERSION {
            return Err(InviteError::Invalid("unsupported invite version".into()));
        }
        nonblank(&self.source_node_id, "source_node_id", 256)?;
        nonblank(&self.host, "host", 255)?;
        nonblank(&self.pairing_id, "pairing_id", 256)?;
        if self.port == 0 {
            return Err(InviteError::Invalid(
                "port must be between 1 and 65535".into(),
            ));
        }
        if self.created_at <= 0 || self.expires_at < self.created_at {
            return Err(InviteError::Invalid("invalid invite timestamps".into()));
        }
        if now >= self.expires_at {
            return Err(InviteError::Invalid("invite is expired".into()));
        }
        if self.connection_version != CONNECTION_VERSION {
            return Err(InviteError::Invalid(
                "unsupported connection version".into(),
            ));
        }
        if self.packet_protocol_version != LMP_VERSION {
            return Err(InviteError::Invalid(
                "unsupported packet protocol version".into(),
            ));
        }
        if let Some(value) = &self.source_display_name {
            nonblank(value, "source_display_name", 128)?;
        }
        if let Some(value) = &self.note {
            nonblank(value, "note", 256)?;
        }
        if let Some(values) = &self.capabilities {
            if values.len() > 16
                || values
                    .iter()
                    .any(|value| value.trim().is_empty() || value.len() > 64)
            {
                return Err(InviteError::Invalid("invalid capabilities".into()));
            }
        }
        Ok(())
    }
}

fn base64_url_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut output = String::new();
    let mut index = 0;
    while index < bytes.len() {
        let a = bytes[index] as u32;
        let b = bytes.get(index + 1).copied().unwrap_or(0) as u32;
        let c = bytes.get(index + 2).copied().unwrap_or(0) as u32;
        output.push(TABLE[(a >> 2) as usize] as char);
        output.push(TABLE[((a & 3) << 4 | b >> 4) as usize] as char);
        if index + 1 < bytes.len() {
            output.push(TABLE[((b & 15) << 2 | c >> 6) as usize] as char);
        }
        if index + 2 < bytes.len() {
            output.push(TABLE[(c & 63) as usize] as char);
        }
        index += 3;
    }
    output
}

fn base64_url_decode(value: &str) -> Option<Vec<u8>> {
    if value.is_empty()
        || value
            .bytes()
            .any(|byte| !byte.is_ascii_alphanumeric() && byte != b'-' && byte != b'_')
    {
        return None;
    }
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;
    for byte in value.bytes() {
        let digit = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return None,
        } as u32;
        buffer = (buffer << 6) | digit;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    // Unpadded base64 may leave 0, 2, or 4 bits, but those trailing bits must
    // be zero; otherwise multiple encodings would decode to the same bytes.
    if (bits == 0 || bits == 2 || bits == 4) && buffer == 0 {
        Some(output)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const FIXTURE: &str = include_str!("../../../shared/fixtures/mycelium_peer_invite.json");

    #[test]
    fn shared_fixture_matches_android_bytes_hash_and_payload() {
        let invite = PeerInvite::decode_canonical(FIXTURE, 1_700_000_001).unwrap();
        let canonical = invite.canonical_json().unwrap();
        assert_eq!(canonical.len(), 353);
        assert_eq!(
            invite.invite_id().unwrap(),
            "957a1e5ba01a74a5532ff643cd45e6bd9f4c3ec3297fe0597f95eb91c188ddb9"
        );
        assert_eq!(invite.payload().unwrap(), "daovibe://peer-invite?v=1&data=eyJjYXBhYmlsaXRpZXMiOlsibXljZWxpdW0iLCJwYWNrZXRfbGVkZ2VyIl0sImNvbm5lY3Rpb25fdmVyc2lvbiI6ImRhb3ZpYmUtY29ubmVjdGlvbi12MSIsImNyZWF0ZWRfYXQiOjE3MDAwMDAwMDAsImV4cGlyZXNfYXQiOjE5MDAwMDAwMDAsImhvc3QiOiIxMjcuMC4wLjEiLCJpbnZpdGVfdmVyc2lvbiI6MSwibm90ZSI6ImZpeHR1cmUiLCJwYWNrZXRfcHJvdG9jb2xfdmVyc2lvbiI6ImxtcC8wLjEiLCJwYWlyaW5nX2lkIjoicGFpcmluZ19maXh0dXJlXzAxIiwicG9ydCI6NDI0Miwic291cmNlX2Rpc3BsYXlfbmFtZSI6IkZpeHR1cmUgTm9kZSIsInNvdXJjZV9ub2RlX2lkIjoibXljZWxpdW1fZml4dHVyZV9ub2RlIn0");
    }

    #[test]
    fn payload_round_trip() {
        let invite = PeerInvite {
            invite_version: 1,
            source_node_id: "node_a".into(),
            source_display_name: Some("A".into()),
            host: "127.0.0.1".into(),
            port: 4242,
            pairing_id: "pair_a".into(),
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            connection_version: CONNECTION_VERSION.into(),
            packet_protocol_version: LMP_VERSION.into(),
            capabilities: Some(vec!["mycelium".into()]),
            note: None,
        };
        let payload = invite.payload().unwrap();
        assert_eq!(
            PeerInvite::decode_payload(&payload, 1_700_000_001).unwrap(),
            invite
        );
    }

    #[test]
    fn rejects_malformed_noncanonical_and_oversized_payloads() {
        let invite = PeerInvite {
            invite_version: 1,
            source_node_id: "node_a".into(),
            source_display_name: None,
            host: "127.0.0.1".into(),
            port: 4242,
            pairing_id: "pair_a".into(),
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            connection_version: CONNECTION_VERSION.into(),
            packet_protocol_version: LMP_VERSION.into(),
            capabilities: None,
            note: None,
        };
        let payload = invite.payload().unwrap();
        assert!(PeerInvite::decode_payload(&format!("{payload}A"), 1_700_000_001).is_err());
        assert!(PeerInvite::decode_payload("daovibe://peer-invite?v=1&data=%%%", 1).is_err());
        assert!(PeerInvite::decode_payload(
            &format!(
                "daovibe://peer-invite?v=1&data={}",
                "A".repeat(MAX_INVITE_TEXT)
            ),
            1
        )
        .is_err());
    }

    #[test]
    fn strict_validation_rejects_expiry_versions_blank_fields_and_port() {
        let base = PeerInvite {
            invite_version: 1,
            source_node_id: "node_a".into(),
            source_display_name: None,
            host: "127.0.0.1".into(),
            port: 4242,
            pairing_id: "pair_a".into(),
            created_at: 1_700_000_000,
            expires_at: 1_800_000_000,
            connection_version: CONNECTION_VERSION.into(),
            packet_protocol_version: LMP_VERSION.into(),
            capabilities: None,
            note: None,
        };
        let mut value = base.clone();
        value.invite_version = 2;
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.connection_version = "old".into();
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.packet_protocol_version = "old".into();
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.source_node_id = " ".into();
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.host = " ".into();
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.pairing_id = " ".into();
        assert!(value.validate(1).is_err());
        let mut value = base.clone();
        value.port = 0;
        assert!(value.validate(1).is_err());
        assert!(base.validate(base.expires_at).is_err());
    }
}
