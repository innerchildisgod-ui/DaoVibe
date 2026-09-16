use crate::canonical;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fmt;
use thiserror::Error;

pub const LMP_VERSION: &str = "lmp/0.1";
pub const DEV_SIGNATURE_PREFIX: &str = "dev_signature";

#[derive(Clone, Debug, PartialEq)]
pub struct DeviceIdentity {
    pub node_id: String,
    pub display_name: String,
    pub created_at: i64,
    pub platform: String,
    pub role: String,
}

#[derive(Debug, Error)]
pub enum PacketError {
    #[error("packet JSON must be an object")]
    NotObject,
    #[error("missing or invalid field: {0}")]
    Field(String),
    #[error("unsupported packet type: {0}")]
    PacketType(String),
    #[error("invalid payload: {0}")]
    Payload(String),
    #[error("packet validation failed: {0}")]
    Invalid(String),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PacketType {
    PhraseObserved,
    MeaningProposal,
    MeaningVote,
    SafetyLabel,
}

impl PacketType {
    pub fn wire(self) -> &'static str {
        match self {
            Self::PhraseObserved => "phrase_observed",
            Self::MeaningProposal => "meaning_proposal",
            Self::MeaningVote => "meaning_vote",
            Self::SafetyLabel => "safety_label",
        }
    }
    fn parse(value: &str) -> Result<Self, PacketError> {
        match value {
            "phrase_observed" => Ok(Self::PhraseObserved),
            "meaning_proposal" => Ok(Self::MeaningProposal),
            "meaning_vote" => Ok(Self::MeaningVote),
            "safety_label" => Ok(Self::SafetyLabel),
            other => Err(PacketError::PacketType(other.to_owned())),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum PacketPayload {
    PhraseObserved {
        phrase_id: String,
        surface_text: Option<String>,
        phonetic_hint: Option<String>,
        language_hint: Option<String>,
        input_type: String,
    },
    MeaningProposal {
        phrase_id: String,
        meaning_id: String,
        reference_meaning: String,
        context: Option<String>,
        confidence: f64,
    },
    MeaningVote {
        phrase_id: String,
        meaning_id: String,
        vote: String,
        confidence: f64,
    },
    SafetyLabel {
        phrase_id: String,
        label: String,
        reason: Option<String>,
    },
}

impl PacketPayload {
    pub fn packet_type(&self) -> PacketType {
        match self {
            Self::PhraseObserved { .. } => PacketType::PhraseObserved,
            Self::MeaningProposal { .. } => PacketType::MeaningProposal,
            Self::MeaningVote { .. } => PacketType::MeaningVote,
            Self::SafetyLabel { .. } => PacketType::SafetyLabel,
        }
    }
    pub fn to_value(&self) -> Value {
        let mut map = Map::new();
        let put = |map: &mut Map<String, Value>, key: &str, value: Option<&str>| {
            if let Some(value) = value {
                map.insert(key.to_owned(), Value::String(value.to_owned()));
            }
        };
        match self {
            Self::PhraseObserved {
                phrase_id,
                surface_text,
                phonetic_hint,
                language_hint,
                input_type,
            } => {
                put(&mut map, "phrase_id", Some(phrase_id));
                put(&mut map, "surface_text", surface_text.as_deref());
                put(&mut map, "phonetic_hint", phonetic_hint.as_deref());
                put(&mut map, "language_hint", language_hint.as_deref());
                put(&mut map, "input_type", Some(input_type));
            }
            Self::MeaningProposal {
                phrase_id,
                meaning_id,
                reference_meaning,
                context,
                confidence,
            } => {
                put(&mut map, "phrase_id", Some(phrase_id));
                put(&mut map, "meaning_id", Some(meaning_id));
                put(&mut map, "reference_meaning", Some(reference_meaning));
                put(&mut map, "context", context.as_deref());
                map.insert("confidence".to_owned(), json!(confidence));
            }
            Self::MeaningVote {
                phrase_id,
                meaning_id,
                vote,
                confidence,
            } => {
                put(&mut map, "phrase_id", Some(phrase_id));
                put(&mut map, "meaning_id", Some(meaning_id));
                put(&mut map, "vote", Some(vote));
                map.insert("confidence".to_owned(), json!(confidence));
            }
            Self::SafetyLabel {
                phrase_id,
                label,
                reason,
            } => {
                put(&mut map, "phrase_id", Some(phrase_id));
                put(&mut map, "label", Some(label));
                put(&mut map, "reason", reason.as_deref());
            }
        }
        Value::Object(map)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Packet {
    pub version: String,
    pub packet_id: String,
    pub packet_type: PacketType,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub zone: String,
    pub author: String,
    pub parent: Option<String>,
    pub payload_hash: String,
    pub payload: PacketPayload,
    pub signature: String,
}

impl Packet {
    pub fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("version".to_owned(), json!(self.version));
        map.insert("packet_id".to_owned(), json!(self.packet_id));
        map.insert("packet_type".to_owned(), json!(self.packet_type.wire()));
        map.insert("created_at".to_owned(), json!(self.created_at));
        if let Some(value) = self.expires_at {
            map.insert("expires_at".to_owned(), json!(value));
        }
        map.insert("zone".to_owned(), json!(self.zone));
        map.insert("author".to_owned(), json!(self.author));
        if let Some(value) = &self.parent {
            map.insert("parent".to_owned(), json!(value));
        }
        map.insert("payload_hash".to_owned(), json!(self.payload_hash));
        map.insert("payload".to_owned(), self.payload.to_value());
        map.insert("signature".to_owned(), json!(self.signature));
        Value::Object(map)
    }
    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }
    pub fn from_value(value: &Value) -> Result<Self, PacketError> {
        let object = value.as_object().ok_or(PacketError::NotObject)?;
        let text = |name: &str| {
            object
                .get(name)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .ok_or_else(|| PacketError::Field(name.to_owned()))
        };
        let integer = |name: &str| {
            object
                .get(name)
                .and_then(Value::as_i64)
                .ok_or_else(|| PacketError::Field(name.to_owned()))
        };
        let packet_type = PacketType::parse(&text("packet_type")?)?;
        let payload_value = object
            .get("payload")
            .ok_or_else(|| PacketError::Field("payload".to_owned()))?
            .as_object()
            .ok_or_else(|| PacketError::Payload("must be an object".to_owned()))?;
        let payload_text = |name: &str| {
            payload_value
                .get(name)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .ok_or_else(|| PacketError::Payload(name.to_owned()))
        };
        let optional_text = |obj: &Map<String, Value>, name: &str| {
            obj.get(name).and_then(Value::as_str).map(ToOwned::to_owned)
        };
        let payload = match packet_type {
            PacketType::PhraseObserved => PacketPayload::PhraseObserved {
                phrase_id: payload_text("phrase_id")?,
                surface_text: optional_text(payload_value, "surface_text"),
                phonetic_hint: optional_text(payload_value, "phonetic_hint"),
                language_hint: optional_text(payload_value, "language_hint"),
                input_type: payload_text("input_type")?,
            },
            PacketType::MeaningProposal => PacketPayload::MeaningProposal {
                phrase_id: payload_text("phrase_id")?,
                meaning_id: payload_text("meaning_id")?,
                reference_meaning: payload_text("reference_meaning")?,
                context: optional_text(payload_value, "context"),
                confidence: payload_value
                    .get("confidence")
                    .and_then(Value::as_f64)
                    .ok_or_else(|| PacketError::Payload("confidence".to_owned()))?,
            },
            PacketType::MeaningVote => PacketPayload::MeaningVote {
                phrase_id: payload_text("phrase_id")?,
                meaning_id: payload_text("meaning_id")?,
                vote: payload_text("vote")?,
                confidence: payload_value
                    .get("confidence")
                    .and_then(Value::as_f64)
                    .ok_or_else(|| PacketError::Payload("confidence".to_owned()))?,
            },
            PacketType::SafetyLabel => PacketPayload::SafetyLabel {
                phrase_id: payload_text("phrase_id")?,
                label: payload_text("label")?,
                reason: optional_text(payload_value, "reason"),
            },
        };
        let packet = Self {
            version: text("version")?,
            packet_id: text("packet_id")?,
            packet_type,
            created_at: integer("created_at")?,
            expires_at: object.get("expires_at").and_then(Value::as_i64),
            zone: text("zone")?,
            author: text("author")?,
            parent: object
                .get("parent")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            payload_hash: text("payload_hash")?,
            payload,
            signature: text("signature")?,
        };
        packet.validate()?;
        Ok(packet)
    }
    pub fn from_json(json: &str) -> Result<Self, PacketError> {
        let value: Value =
            serde_json::from_str(json).map_err(|error| PacketError::Invalid(error.to_string()))?;
        Self::from_value(&value)
    }
    pub fn validate(&self) -> Result<(), PacketError> {
        if self.version != LMP_VERSION {
            return Err(PacketError::Invalid(format!(
                "unsupported version {}",
                self.version
            )));
        }
        if self.packet_type != self.payload.packet_type() {
            return Err(PacketError::Invalid(
                "packet type does not match payload".to_owned(),
            ));
        }
        if self.packet_id.trim().is_empty()
            || self.zone.trim().is_empty()
            || self.author.trim().is_empty()
            || self.created_at <= 0
            || self.signature.trim().is_empty()
        {
            return Err(PacketError::Invalid(
                "missing required packet field".to_owned(),
            ));
        }
        if self.expires_at.is_some_and(|value| value <= 0) {
            return Err(PacketError::Invalid("invalid expires_at".to_owned()));
        }
        if matches!(self.payload, PacketPayload::MeaningProposal { confidence, .. } | PacketPayload::MeaningVote { confidence, .. } if !confidence.is_finite())
        {
            return Err(PacketError::Invalid("invalid confidence".to_owned()));
        }
        let payload_hash = sha256(&canonical::stringify(&self.payload.to_value()));
        if self.payload_hash != payload_hash {
            return Err(PacketError::Invalid("invalid payload_hash".to_owned()));
        }
        let packet_id = sha256(&canonical::stringify(&self.hash_input_value()));
        if self.packet_id != packet_id {
            return Err(PacketError::Invalid("invalid packet_id".to_owned()));
        }
        let expected_signature =
            format!("{DEV_SIGNATURE_PREFIX}:{}:{}", self.author, self.packet_id);
        if self.signature != expected_signature {
            return Err(PacketError::Invalid("invalid dev signature".to_owned()));
        }
        Ok(())
    }
    fn hash_input_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("version".to_owned(), json!(self.version));
        map.insert("packet_type".to_owned(), json!(self.packet_type.wire()));
        map.insert("created_at".to_owned(), json!(self.created_at));
        if let Some(value) = self.expires_at {
            map.insert("expires_at".to_owned(), json!(value));
        }
        map.insert("zone".to_owned(), json!(self.zone));
        map.insert("author".to_owned(), json!(self.author));
        if let Some(value) = &self.parent {
            map.insert("parent".to_owned(), json!(value));
        }
        map.insert("payload_hash".to_owned(), json!(self.payload_hash));
        map.insert("payload".to_owned(), self.payload.to_value());
        Value::Object(map)
    }
    pub fn is_expired(&self, now: i64) -> bool {
        self.expires_at.is_some_and(|value| value < now)
    }
}

pub fn sha256(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
pub fn pairing_id_for(source_node_id: &str, created_at: i64, challenge: Option<&str>) -> String {
    sha256(&format!(
        "daovibe-pairing-v1|{source_node_id}|{created_at}|{}",
        challenge.unwrap_or_default()
    ))[..24]
        .to_owned()
        .pipe(|id| format!("pairing_{id}"))
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}
impl<T> Pipe for T {}

impl fmt::Display for PacketType {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.wire())
    }
}
