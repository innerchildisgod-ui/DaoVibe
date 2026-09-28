use crate::canonical;
use crate::models::{Packet, PacketPayload};
use crate::storage::{StorageError, Store};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MyceliumError {
    #[error("storage: {0}")]
    Storage(#[from] StorageError),
    #[error("unresolvable packet dependencies: {0}")]
    Dependencies(String),
    #[error("conflicting duplicate packet id: {0}")]
    ConflictingDuplicate(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct MyceliumStateSnapshot {
    pub phrases: Vec<PhraseSnapshot>,
}

impl MyceliumStateSnapshot {
    /// Rebuilds the canonical convergence snapshot from the packet ledger,
    /// which remains the source of truth for persisted Mycelium state.
    pub fn from_store(store: &Store) -> Result<Self, MyceliumError> {
        Self::from_packets(store.packets_for_replay()?)
    }

    pub fn from_packets(packets: Vec<Packet>) -> Result<Self, MyceliumError> {
        let mut state = MutableState::default();
        let mut packets_by_id: BTreeMap<String, BTreeMap<String, Packet>> = BTreeMap::new();
        for packet in packets {
            packets_by_id
                .entry(packet.packet_id.clone())
                .or_default()
                .entry(packet.canonical_json())
                .or_insert(packet);
        }
        for (packet_id, variants) in &packets_by_id {
            if variants.len() > 1 {
                return Err(MyceliumError::ConflictingDuplicate(packet_id.clone()));
            }
        }
        let mut pending = packets_by_id
            .into_values()
            .map(|variants| {
                variants
                    .into_values()
                    .next()
                    .expect("packet variant exists")
            })
            .collect::<Vec<_>>();
        pending.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then_with(|| left.packet_id.cmp(&right.packet_id))
        });

        while !pending.is_empty() {
            let mut deferred = Vec::new();
            let mut applied_any = false;

            for packet in pending {
                if state.can_apply(&packet) {
                    state.apply(&packet);
                    applied_any = true;
                } else {
                    deferred.push(packet);
                }
            }

            if !applied_any {
                return Err(MyceliumError::Dependencies(
                    deferred
                        .iter()
                        .map(|packet| packet.packet_id.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                ));
            }

            pending = deferred;
        }

        Ok(state.snapshot())
    }

    pub fn to_value(&self) -> Value {
        json!({
            "phrases": self.phrases.iter().map(PhraseSnapshot::to_value).collect::<Vec<_>>()
        })
    }

    pub fn canonical_json(&self) -> String {
        canonical::stringify(&self.to_value())
    }

    /// Exact UTF-8 bytes of `state` JSON, without its console newline.
    pub fn canonical_bytes(&self) -> Vec<u8> {
        self.canonical_json().into_bytes()
    }

    pub fn fingerprint(&self) -> String {
        hex::encode(Sha256::digest(self.canonical_bytes()))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PhraseSnapshot {
    pub phrase_id: String,
    pub surface_text: Option<String>,
    pub phonetic_hint: Option<String>,
    pub language_hint: Option<String>,
    pub safety_label: String,
    pub best_meaning_id: Option<String>,
    pub meanings: Vec<MeaningSnapshot>,
}

impl PhraseSnapshot {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("phrase_id".to_owned(), json!(self.phrase_id));
        insert_optional(&mut map, "surface_text", self.surface_text.as_deref());
        insert_optional(&mut map, "phonetic_hint", self.phonetic_hint.as_deref());
        insert_optional(&mut map, "language_hint", self.language_hint.as_deref());
        map.insert("safety_label".to_owned(), json!(self.safety_label));
        insert_optional(&mut map, "best_meaning_id", self.best_meaning_id.as_deref());
        map.insert(
            "meanings".to_owned(),
            Value::Array(
                self.meanings
                    .iter()
                    .map(MeaningSnapshot::to_value)
                    .collect(),
            ),
        );
        Value::Object(map)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct MeaningSnapshot {
    pub meaning_id: String,
    pub reference_meaning: String,
    pub context: Option<String>,
    pub confidence: f64,
    pub confirms: f64,
    pub rejects: f64,
    pub score: f64,
    pub total_votes: f64,
    pub corrections: Vec<CorrectionSnapshot>,
    pub effective_correction_id: Option<String>,
    pub effective_reference_meaning: String,
    pub effective_context: Option<String>,
}

impl MeaningSnapshot {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("meaning_id".to_owned(), json!(self.meaning_id));
        map.insert(
            "reference_meaning".to_owned(),
            json!(self.reference_meaning),
        );
        insert_optional(&mut map, "context", self.context.as_deref());
        map.insert("confidence".to_owned(), json!(self.confidence));
        map.insert("confirms".to_owned(), json!(self.confirms));
        map.insert("rejects".to_owned(), json!(self.rejects));
        map.insert("score".to_owned(), json!(self.score));
        map.insert("total_votes".to_owned(), json!(self.total_votes));
        if !self.corrections.is_empty() {
            map.insert(
                "corrections".to_owned(),
                json!(self
                    .corrections
                    .iter()
                    .map(CorrectionSnapshot::to_value)
                    .collect::<Vec<_>>()),
            );
            insert_optional(
                &mut map,
                "effective_correction_id",
                self.effective_correction_id.as_deref(),
            );
            map.insert(
                "effective_reference_meaning".to_owned(),
                json!(self.effective_reference_meaning),
            );
            insert_optional(
                &mut map,
                "effective_context",
                self.effective_context.as_deref(),
            );
        }
        Value::Object(map)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CorrectionSnapshot {
    pub correction_id: String,
    pub reference_meaning: String,
    pub context: Option<String>,
    pub confidence: f64,
    pub confirms: f64,
    pub rejects: f64,
    pub total_votes: f64,
    pub score: f64,
    pub tombstoned: bool,
    pub effective_tombstone_id: Option<String>,
    pub tombstones: Vec<CorrectionTombstoneSnapshot>,
}
impl CorrectionSnapshot {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("correction_id".to_owned(), json!(self.correction_id));
        map.insert(
            "reference_meaning".to_owned(),
            json!(self.reference_meaning),
        );
        map.insert("context".to_owned(), json!(self.context));
        map.insert("confidence".to_owned(), json!(self.confidence));
        map.insert("confirms".to_owned(), json!(self.confirms));
        map.insert("rejects".to_owned(), json!(self.rejects));
        map.insert("total_votes".to_owned(), json!(self.total_votes));
        map.insert("score".to_owned(), json!(self.score));
        if !self.tombstones.is_empty() {
            map.insert("tombstoned".to_owned(), json!(self.tombstoned));
            map.insert(
                "effective_tombstone_id".to_owned(),
                json!(self.effective_tombstone_id),
            );
            map.insert(
                "tombstones".to_owned(),
                Value::Array(
                    self.tombstones
                        .iter()
                        .map(CorrectionTombstoneSnapshot::to_value)
                        .collect(),
                ),
            );
        }
        Value::Object(map)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CorrectionTombstoneSnapshot {
    pub tombstone_id: String,
    pub reason: String,
    pub confidence: f64,
    pub confirms: f64,
    pub rejects: f64,
    pub total_votes: f64,
    pub score: f64,
    pub effective: bool,
}
impl CorrectionTombstoneSnapshot {
    fn to_value(&self) -> Value {
        json!({"tombstone_id":self.tombstone_id,"reason":self.reason,"confidence":self.confidence,"confirms":self.confirms,"rejects":self.rejects,"total_votes":self.total_votes,"score":self.score,"effective":self.effective})
    }
}

#[derive(Default)]
struct MutableState {
    phrases: BTreeMap<String, MutablePhrase>,
    meaning_phrase_by_id: HashMap<String, String>,
    votes: Vec<MeaningVoteEvidence>,
    corrections: HashMap<(String, String, String), CorrectionProposalEvidence>,
    correction_votes: Vec<CorrectionVoteEvidence>,
    tombstones: HashMap<(String, String, String, String), TombstoneProposalEvidence>,
    tombstone_votes: Vec<TombstoneVoteEvidence>,
    tombstone_proposal_ids: HashMap<(String, String, String, String), String>,
    meaning_proposal_ids: HashMap<(String, String), String>,
    correction_proposal_ids: HashMap<(String, String, String), String>,
}

impl MutableState {
    fn can_apply(&self, packet: &Packet) -> bool {
        match &packet.payload {
            PacketPayload::PhraseObserved { .. } => true,
            PacketPayload::MeaningProposal { phrase_id, .. }
            | PacketPayload::SafetyLabel { phrase_id, .. } => self.phrases.contains_key(phrase_id),
            PacketPayload::MeaningVote { meaning_id, .. } => {
                self.meaning_phrase_by_id.contains_key(meaning_id)
            }
            PacketPayload::CorrectionProposed {
                phrase_id,
                meaning_id,
                ..
            } => {
                self.meaning_phrase_by_id.get(meaning_id) == Some(phrase_id)
                    && self
                        .meaning_proposal_ids
                        .get(&(phrase_id.clone(), meaning_id.clone()))
                        == packet.parent.as_ref()
            }
            PacketPayload::CorrectionVote {
                correction_id,
                meaning_id,
                phrase_id,
                ..
            } => {
                self.meaning_phrase_by_id.get(meaning_id) == Some(phrase_id)
                    && self.corrections.contains_key(&(
                        phrase_id.clone(),
                        meaning_id.clone(),
                        correction_id.clone(),
                    ))
                    && self.correction_proposal_ids.get(&(
                        phrase_id.clone(),
                        meaning_id.clone(),
                        correction_id.clone(),
                    )) == packet.parent.as_ref()
            }
            PacketPayload::CorrectionTombstoneProposed {
                phrase_id,
                meaning_id,
                correction_id,
                ..
            } => {
                self.correction_proposal_ids.get(&(
                    phrase_id.clone(),
                    meaning_id.clone(),
                    correction_id.clone(),
                )) == packet.parent.as_ref()
            }
            PacketPayload::CorrectionTombstoneVote {
                tombstone_id,
                phrase_id,
                meaning_id,
                correction_id,
                ..
            } => {
                self.tombstones.contains_key(&(
                    phrase_id.clone(),
                    meaning_id.clone(),
                    correction_id.clone(),
                    tombstone_id.clone(),
                )) && self.tombstone_proposal_ids.get(&(
                    phrase_id.clone(),
                    meaning_id.clone(),
                    correction_id.clone(),
                    tombstone_id.clone(),
                )) == packet.parent.as_ref()
            }
        }
    }

    fn apply(&mut self, packet: &Packet) {
        match &packet.payload {
            PacketPayload::PhraseObserved {
                phrase_id,
                surface_text,
                phonetic_hint,
                language_hint,
                ..
            } => {
                self.phrases
                    .entry(phrase_id.clone())
                    .and_modify(|phrase| {
                        if surface_text.is_some() {
                            phrase.surface_text = surface_text.clone();
                        }
                        if phonetic_hint.is_some() {
                            phrase.phonetic_hint = phonetic_hint.clone();
                        }
                        if language_hint.is_some() {
                            phrase.language_hint = language_hint.clone();
                        }
                    })
                    .or_insert_with(|| MutablePhrase {
                        phrase_id: phrase_id.clone(),
                        surface_text: surface_text.clone(),
                        phonetic_hint: phonetic_hint.clone(),
                        language_hint: language_hint.clone(),
                        safety_label: "normal".to_owned(),
                        meanings: BTreeMap::new(),
                    });
            }
            PacketPayload::MeaningProposal {
                phrase_id,
                meaning_id,
                reference_meaning,
                context,
                confidence,
            } => {
                self.meaning_proposal_ids.insert(
                    (phrase_id.clone(), meaning_id.clone()),
                    packet.packet_id.clone(),
                );
                if self.meaning_phrase_by_id.contains_key(meaning_id) {
                    return;
                }
                if let Some(phrase) = self.phrases.get_mut(phrase_id) {
                    phrase.meanings.insert(
                        meaning_id.clone(),
                        MutableMeaning {
                            meaning_id: meaning_id.clone(),
                            reference_meaning: reference_meaning.clone(),
                            context: context.clone(),
                            confidence: *confidence,
                        },
                    );
                    self.meaning_phrase_by_id
                        .insert(meaning_id.clone(), phrase_id.clone());
                }
            }
            PacketPayload::MeaningVote {
                phrase_id: _,
                meaning_id,
                vote,
                ..
            } => {
                self.votes.push(MeaningVoteEvidence {
                    vote_packet_id: packet.packet_id.clone(),
                    meaning_id: meaning_id.clone(),
                    vote: vote.clone(),
                    author: packet.author.clone(),
                    created_at: packet.created_at,
                });
            }
            PacketPayload::CorrectionProposed {
                correction_id,
                phrase_id,
                meaning_id,
                reference_meaning,
                context,
                confidence,
                ..
            } => {
                self.correction_proposal_ids.insert(
                    (phrase_id.clone(), meaning_id.clone(), correction_id.clone()),
                    packet.packet_id.clone(),
                );
                self.corrections
                    .entry((phrase_id.clone(), meaning_id.clone(), correction_id.clone()))
                    .or_insert(CorrectionProposalEvidence {
                        phrase_id: phrase_id.clone(),
                        correction_id: correction_id.clone(),
                        meaning_id: meaning_id.clone(),
                        reference_meaning: reference_meaning.clone(),
                        context: context.clone(),
                        confidence: *confidence,
                    });
            }
            PacketPayload::CorrectionVote {
                correction_id,
                phrase_id,
                meaning_id,
                vote,
                ..
            } => {
                self.correction_votes.push(CorrectionVoteEvidence {
                    vote_packet_id: packet.packet_id.clone(),
                    phrase_id: phrase_id.clone(),
                    meaning_id: meaning_id.clone(),
                    correction_id: correction_id.clone(),
                    vote: vote.clone(),
                    author: packet.author.clone(),
                    created_at: packet.created_at,
                });
            }
            PacketPayload::CorrectionTombstoneProposed {
                tombstone_id,
                phrase_id,
                meaning_id,
                correction_id,
                reason,
                confidence,
            } => {
                self.tombstone_proposal_ids.insert(
                    (
                        phrase_id.clone(),
                        meaning_id.clone(),
                        correction_id.clone(),
                        tombstone_id.clone(),
                    ),
                    packet.packet_id.clone(),
                );
                self.tombstones
                    .entry((
                        phrase_id.clone(),
                        meaning_id.clone(),
                        correction_id.clone(),
                        tombstone_id.clone(),
                    ))
                    .or_insert(TombstoneProposalEvidence {
                        tombstone_id: tombstone_id.clone(),
                        phrase_id: phrase_id.clone(),
                        meaning_id: meaning_id.clone(),
                        correction_id: correction_id.clone(),
                        reason: reason.clone(),
                        confidence: *confidence,
                    });
            }
            PacketPayload::CorrectionTombstoneVote {
                tombstone_id,
                phrase_id,
                meaning_id,
                correction_id,
                vote,
                ..
            } => self.tombstone_votes.push(TombstoneVoteEvidence {
                vote_packet_id: packet.packet_id.clone(),
                tombstone_id: tombstone_id.clone(),
                phrase_id: phrase_id.clone(),
                meaning_id: meaning_id.clone(),
                correction_id: correction_id.clone(),
                vote: vote.clone(),
                author: packet.author.clone(),
                created_at: packet.created_at,
            }),
            PacketPayload::SafetyLabel {
                phrase_id, label, ..
            } => {
                if let Some(phrase) = self.phrases.get_mut(phrase_id) {
                    phrase.safety_label = label.clone();
                }
            }
        }
    }

    fn snapshot(self) -> MyceliumStateSnapshot {
        let counts_by_meaning = count_unique_voter_votes(
            self.votes
                .into_iter()
                .filter(|vote| vote.vote == "confirm" || vote.vote == "reject")
                .map(|vote| UniqueVoterVoteInput {
                    target_key: vote.meaning_id,
                    voter_id: vote.author,
                    vote: vote.vote,
                    created_at: vote.created_at,
                    packet_id: vote.vote_packet_id,
                })
                .collect(),
        );
        let correction_counts = count_unique_voter_votes(
            self.correction_votes
                .into_iter()
                .map(|vote| UniqueVoterVoteInput {
                    target_key: format!(
                        "{}\u{0}{}\u{0}{}",
                        vote.phrase_id, vote.meaning_id, vote.correction_id
                    ),
                    voter_id: vote.author,
                    vote: vote.vote,
                    created_at: vote.created_at,
                    packet_id: vote.vote_packet_id,
                })
                .collect(),
        );
        let tombstone_counts = count_unique_voter_votes(
            self.tombstone_votes
                .iter()
                .filter(|vote| vote.vote == "confirm" || vote.vote == "reject")
                .map(|vote| UniqueVoterVoteInput {
                    target_key: format!(
                        "{}\u{0}{}\u{0}{}\u{0}{}",
                        vote.phrase_id, vote.meaning_id, vote.correction_id, vote.tombstone_id
                    ),
                    voter_id: vote.author.clone(),
                    vote: vote.vote.clone(),
                    created_at: vote.created_at,
                    packet_id: vote.vote_packet_id.clone(),
                })
                .collect(),
        );

        let mut phrases = self
            .phrases
            .into_values()
            .map(|phrase| {
                let mut meanings = phrase
                    .meanings
                    .into_values()
                    .map(|meaning| {
                        let counts = counts_by_meaning.get(&meaning.meaning_id);
                        let score = calculate_meaning_score(
                            meaning.confidence,
                            counts.map_or(0.0, |value| value.confirm_votes),
                            counts.map_or(0.0, |value| value.reject_votes),
                        );
                        let mut candidates = self
                            .corrections
                            .values()
                            .filter(|c| {
                                c.phrase_id == phrase.phrase_id
                                    && c.meaning_id == meaning.meaning_id
                            })
                            .map(|c| {
                                let correction_key = format!(
                                    "{}\u{0}{}\u{0}{}",
                                    c.phrase_id, c.meaning_id, c.correction_id
                                );
                                let counts = correction_counts.get(&correction_key);
                                let score = calculate_meaning_score(
                                    c.confidence,
                                    counts.map_or(0.0, |v| v.confirm_votes),
                                    counts.map_or(0.0, |v| v.reject_votes),
                                );
                                let mut tombstone_candidates = self
                                    .tombstones
                                    .values()
                                    .filter(|t| {
                                        t.phrase_id == c.phrase_id
                                            && t.meaning_id == c.meaning_id
                                            && t.correction_id == c.correction_id
                                    })
                                    .map(|t| {
                                        let key = format!(
                                            "{}\u{0}{}\u{0}{}\u{0}{}",
                                            t.phrase_id,
                                            t.meaning_id,
                                            t.correction_id,
                                            t.tombstone_id
                                        );
                                        let counts = tombstone_counts.get(&key);
                                        let s = calculate_meaning_score(
                                            t.confidence,
                                            counts.map_or(0.0, |v| v.confirm_votes),
                                            counts.map_or(0.0, |v| v.reject_votes),
                                        );
                                        CorrectionTombstoneSnapshot {
                                            tombstone_id: t.tombstone_id.clone(),
                                            reason: t.reason.clone(),
                                            confidence: s.confidence,
                                            confirms: s.confirms,
                                            rejects: s.rejects,
                                            total_votes: s.total_votes,
                                            score: s.score,
                                            effective: false,
                                        }
                                    })
                                    .collect::<Vec<_>>();
                                tombstone_candidates.sort_by(|left, right| {
                                    kotlin_string_cmp(&left.tombstone_id, &right.tombstone_id)
                                });
                                CorrectionSnapshot {
                                    correction_id: c.correction_id.clone(),
                                    reference_meaning: c.reference_meaning.clone(),
                                    context: c.context.clone(),
                                    confidence: score.confidence,
                                    confirms: score.confirms,
                                    rejects: score.rejects,
                                    total_votes: score.total_votes,
                                    score: score.score,
                                    tombstoned: false,
                                    effective_tombstone_id: None,
                                    tombstones: tombstone_candidates,
                                }
                            })
                            .collect::<Vec<_>>();
                        candidates.iter_mut().for_each(|candidate| {
                            let winner = candidate
                                .tombstones
                                .iter()
                                .filter(|t| t.confirms > t.rejects && t.confirms >= 1.0)
                                .max_by(|a, b| {
                                    a.score.total_cmp(&b.score).then_with(|| {
                                        kotlin_string_cmp(&b.tombstone_id, &a.tombstone_id)
                                    })
                                })
                                .map(|t| t.tombstone_id.clone());
                            if let Some(id) = &winner {
                                for t in &mut candidate.tombstones {
                                    t.effective = t.tombstone_id == *id;
                                }
                                candidate.tombstoned = true;
                                candidate.effective_tombstone_id = winner.clone();
                            }
                        });
                        candidates.sort_by(|left, right| {
                            kotlin_string_cmp(&left.correction_id, &right.correction_id)
                        });
                        let effective = candidates
                            .iter()
                            .filter(|c| {
                                !c.tombstoned && c.confirms > c.rejects && c.confirms >= 1.0
                            })
                            .max_by(|a, b| {
                                a.score.total_cmp(&b.score).then_with(|| {
                                    kotlin_string_cmp(&b.correction_id, &a.correction_id)
                                })
                            })
                            .cloned();
                        let original_reference = meaning.reference_meaning.clone();
                        let original_context = meaning.context.clone();
                        MeaningSnapshot {
                            meaning_id: meaning.meaning_id,
                            reference_meaning: original_reference.clone(),
                            context: meaning.context,
                            confidence: score.confidence,
                            confirms: score.confirms,
                            rejects: score.rejects,
                            score: score.score,
                            total_votes: score.total_votes,
                            corrections: candidates,
                            effective_correction_id: effective
                                .as_ref()
                                .map(|c| c.correction_id.clone()),
                            effective_reference_meaning: effective
                                .as_ref()
                                .map_or(original_reference, |c| c.reference_meaning.clone()),
                            effective_context: effective.map_or(original_context, |c| c.context),
                        }
                    })
                    .collect::<Vec<_>>();
                meanings
                    .sort_by(|left, right| kotlin_string_cmp(&left.meaning_id, &right.meaning_id));
                let best_meaning_id = meanings
                    .iter()
                    .max_by(|left, right| compare_meaning_for_best(left, right))
                    .map(|meaning| meaning.meaning_id.clone());

                PhraseSnapshot {
                    phrase_id: phrase.phrase_id,
                    surface_text: phrase.surface_text,
                    phonetic_hint: phrase.phonetic_hint,
                    language_hint: phrase.language_hint,
                    safety_label: phrase.safety_label,
                    best_meaning_id,
                    meanings,
                }
            })
            .collect::<Vec<_>>();
        phrases.sort_by(|left, right| kotlin_string_cmp(&left.phrase_id, &right.phrase_id));

        MyceliumStateSnapshot { phrases }
    }
}

struct MutablePhrase {
    phrase_id: String,
    surface_text: Option<String>,
    phonetic_hint: Option<String>,
    language_hint: Option<String>,
    safety_label: String,
    meanings: BTreeMap<String, MutableMeaning>,
}

struct MutableMeaning {
    meaning_id: String,
    reference_meaning: String,
    context: Option<String>,
    confidence: f64,
}

struct MeaningVoteEvidence {
    vote_packet_id: String,
    meaning_id: String,
    vote: String,
    author: String,
    created_at: i64,
}
struct CorrectionProposalEvidence {
    phrase_id: String,
    correction_id: String,
    meaning_id: String,
    reference_meaning: String,
    context: Option<String>,
    confidence: f64,
}
struct CorrectionVoteEvidence {
    vote_packet_id: String,
    phrase_id: String,
    meaning_id: String,
    correction_id: String,
    vote: String,
    author: String,
    created_at: i64,
}
struct TombstoneProposalEvidence {
    tombstone_id: String,
    phrase_id: String,
    meaning_id: String,
    correction_id: String,
    reason: String,
    confidence: f64,
}
struct TombstoneVoteEvidence {
    vote_packet_id: String,
    tombstone_id: String,
    phrase_id: String,
    meaning_id: String,
    correction_id: String,
    vote: String,
    author: String,
    created_at: i64,
}

struct UniqueVoterVoteInput {
    target_key: String,
    voter_id: String,
    vote: String,
    created_at: i64,
    packet_id: String,
}

struct UniqueVoterVoteCounts {
    confirm_votes: f64,
    reject_votes: f64,
}

struct MutableVoteCounts {
    confirm_votes: f64,
    reject_votes: f64,
}

struct MeaningScoreResult {
    score: f64,
    confidence: f64,
    confirms: f64,
    rejects: f64,
    total_votes: f64,
}

fn count_unique_voter_votes(
    votes: Vec<UniqueVoterVoteInput>,
) -> HashMap<String, UniqueVoterVoteCounts> {
    let mut counts_by_target: HashMap<String, MutableVoteCounts> = HashMap::new();
    let mut latest_vote_by_target_voter: HashMap<String, UniqueVoterVoteInput> = HashMap::new();

    for vote in votes {
        let target_key = vote.target_key.trim().to_owned();
        if target_key.is_empty() {
            continue;
        }

        let voter_id = vote.voter_id.trim().to_owned();
        if voter_id.is_empty() {
            add_vote_count(&mut counts_by_target, &target_key, &vote.vote, 0.5);
            continue;
        }

        let key = stable_vote_key(&target_key, &voter_id);
        let effective_vote = UniqueVoterVoteInput {
            target_key,
            voter_id,
            vote: vote.vote,
            created_at: vote.created_at,
            packet_id: vote.packet_id,
        };
        let should_replace = latest_vote_by_target_voter
            .get(&key)
            .is_none_or(|existing| compare_votes(&effective_vote, existing).is_gt());
        if should_replace {
            latest_vote_by_target_voter.insert(key, effective_vote);
        }
    }

    for vote in latest_vote_by_target_voter.values() {
        add_vote_count(&mut counts_by_target, &vote.target_key, &vote.vote, 1.0);
    }

    counts_by_target
        .into_iter()
        .map(|(target, counts)| {
            (
                target,
                UniqueVoterVoteCounts {
                    confirm_votes: counts.confirm_votes,
                    reject_votes: counts.reject_votes,
                },
            )
        })
        .collect()
}

fn add_vote_count(
    counts_by_target: &mut HashMap<String, MutableVoteCounts>,
    target_key: &str,
    vote: &str,
    weight: f64,
) {
    let counts = counts_by_target
        .entry(target_key.to_owned())
        .or_insert(MutableVoteCounts {
            confirm_votes: 0.0,
            reject_votes: 0.0,
        });

    if vote == "confirm" {
        counts.confirm_votes += weight;
    }
    if vote == "reject" {
        counts.reject_votes += weight;
    }
}

fn calculate_meaning_score(confidence: f64, confirms: f64, rejects: f64) -> MeaningScoreResult {
    let confidence = clamp_confidence(confidence);
    let confirms = normalize_vote_count(confirms);
    let rejects = normalize_vote_count(rejects);
    let total_votes = confirms + rejects;
    let vote_balance = if total_votes > 0.0 {
        (confirms - rejects) / total_votes
    } else {
        0.0
    };
    let vote_maturity = (total_votes / 3.0).min(1.0);
    let score = clamp_score(confidence + (vote_balance * vote_maturity * 0.5));

    MeaningScoreResult {
        score,
        confidence,
        confirms,
        rejects,
        total_votes,
    }
}

fn stable_vote_key(target_key: &str, voter_id: &str) -> String {
    // Intentionally mirrors Android StableVoteKey exactly, including its
    // unescaped interpolation semantics. This preserves current product
    // behavior for convergence without redefining the vote model here.
    format!(r#"["{target_key}","{voter_id}"]"#)
}

fn kotlin_string_cmp(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn compare_votes(left: &UniqueVoterVoteInput, right: &UniqueVoterVoteInput) -> Ordering {
    left.created_at
        .cmp(&right.created_at)
        .then_with(|| kotlin_string_cmp(&left.packet_id, &right.packet_id))
}

fn compare_meaning_for_best(left: &MeaningSnapshot, right: &MeaningSnapshot) -> Ordering {
    left.score
        .total_cmp(&right.score)
        .then_with(|| kotlin_string_cmp(&right.meaning_id, &left.meaning_id))
}

fn clamp_confidence(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn normalize_vote_count(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        0.0
    } else if value < 1.0 {
        value
    } else {
        value.floor()
    }
}

fn clamp_score(value: f64) -> f64 {
    value.clamp(-1.0, 1.0)
}

fn insert_optional(map: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    map.insert(
        key.to_owned(),
        value.map_or(Value::Null, |value| json!(value)),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    // Independently hashed from the fixture string's 971 UTF-8 bytes using .NET SHA256.
    const EXPECTED_FINGERPRINT: &str =
        "aea5b196398a17e03e3ba9f07d388709b654fc417956d1da6c5b1e754c841bc0";

    #[test]
    fn canonicalization_edge_fixture_matches_exact_json_and_fingerprint() {
        let (packets, expected_json, expected_fingerprint) = canonicalization_edge_fixture();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();

        assert_eq!(snapshot.canonical_json(), expected_json);
        assert_eq!(snapshot.canonical_bytes(), expected_json.as_bytes());
        assert_eq!(snapshot.fingerprint(), expected_fingerprint);
    }

    #[test]
    fn canonicalization_edge_fixture_survives_reversal_and_duplicates() {
        let (packets, expected_json, expected_fingerprint) = canonicalization_edge_fixture();
        let mut reversed_with_duplicates = packets.clone();
        reversed_with_duplicates.reverse();
        reversed_with_duplicates.extend(packets);
        let snapshot = MyceliumStateSnapshot::from_packets(reversed_with_duplicates).unwrap();

        assert_eq!(snapshot.canonical_json(), expected_json);
        assert_eq!(snapshot.fingerprint(), expected_fingerprint);
    }

    #[test]
    fn canonicalization_edge_fixture_conflicting_duplicate_cannot_be_fingerprinted() {
        let (packets, _, _) = canonicalization_edge_fixture();
        let original = packets[0].clone();
        let mut conflict = original.clone();
        conflict.zone = "conflict".to_owned();

        for variants in [
            vec![original.clone(), conflict.clone()],
            vec![conflict, original],
        ] {
            assert!(matches!(
                MyceliumStateSnapshot::from_packets(variants)
                    .map(|snapshot| snapshot.fingerprint()),
                Err(MyceliumError::ConflictingDuplicate(_))
            ));
        }
    }

    #[test]
    fn correction_fixture_matches_fixed_json_bytes_and_hash() {
        let (packets, expected_json, expected_len, expected_fingerprint) = correction_fixture();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();
        assert_eq!(snapshot.canonical_json(), expected_json);
        assert_eq!(snapshot.canonical_bytes(), expected_json.as_bytes());
        assert_eq!(snapshot.canonical_bytes().len(), expected_len);
        assert_eq!(snapshot.fingerprint(), expected_fingerprint);
        let meaning = &snapshot.phrases[0].meanings[0];
        assert_eq!(
            meaning.effective_correction_id.as_deref(),
            Some("correction_𐀀")
        );
        assert_eq!(meaning.effective_context, None);
        assert_eq!(
            meaning
                .corrections
                .iter()
                .map(|correction| correction.correction_id.as_str())
                .collect::<Vec<_>>(),
            vec!["correction_z", "correction_𐀀", "correction_"]
        );
    }

    #[test]
    fn correction_fixture_reversal_and_duplicates_converge() {
        let (packets, expected_json, _, expected_fingerprint) = correction_fixture();
        let mut reversed = packets.clone();
        reversed.reverse();
        reversed.extend(packets.clone());
        let snapshot = MyceliumStateSnapshot::from_packets(reversed).unwrap();
        assert_eq!(snapshot.canonical_json(), expected_json);
        assert_eq!(snapshot.fingerprint(), expected_fingerprint);
    }

    #[test]
    fn correction_tombstone_fixture_matches_android_canonical_bytes_and_hash() {
        let (packets, expected_json, expected_len, expected_fingerprint) =
            correction_tombstone_fixture();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();
        assert_eq!(snapshot.canonical_json(), expected_json);
        assert_eq!(snapshot.canonical_bytes().len(), expected_len);
        assert_eq!(snapshot.fingerprint(), expected_fingerprint);
        let meaning = &snapshot.phrases[0].meanings[0];
        assert_eq!(
            meaning.effective_correction_id.as_deref(),
            Some("correction_")
        );
        let tombstoned = meaning
            .corrections
            .iter()
            .find(|correction| correction.correction_id == "correction_𐀀")
            .unwrap();
        assert!(tombstoned.tombstoned);
        assert_eq!(
            tombstoned.effective_tombstone_id.as_deref(),
            Some("tombstone_𐀀")
        );
    }

    #[test]
    fn correction_vote_wrong_parent_or_target_is_deferred_and_rejected() {
        let (packets, _, _, _) = correction_fixture();
        let mut wrong_parent = packets[5].clone();
        wrong_parent.parent = Some(packets[1].packet_id.clone());
        assert!(matches!(
            MyceliumStateSnapshot::from_packets(vec![
                packets[0].clone(),
                packets[1].clone(),
                packets[2].clone(),
                wrong_parent,
            ]),
            Err(MyceliumError::Dependencies(_))
        ));

        let mut wrong_target = packets[5].clone();
        if let PacketPayload::CorrectionVote { phrase_id, .. } = &mut wrong_target.payload {
            *phrase_id = "another_phrase".to_owned();
        }
        assert!(matches!(
            MyceliumStateSnapshot::from_packets(vec![
                packets[0].clone(),
                packets[1].clone(),
                packets[2].clone(),
                wrong_target,
            ]),
            Err(MyceliumError::Dependencies(_))
        ));
    }

    #[test]
    fn shared_fingerprint_survives_duplicates_and_store_restart() {
        let (packets, expected_json) = convergence_fixture();
        let mut duplicated = packets.clone();
        duplicated.extend(packets.clone());
        let snapshot = MyceliumStateSnapshot::from_packets(duplicated).unwrap();
        assert_eq!(snapshot.canonical_bytes(), expected_json.as_bytes());
        assert_eq!(snapshot.fingerprint(), EXPECTED_FINGERPRINT);

        let path =
            std::env::temp_dir().join(format!("mycelium-hash-{}.sqlite", uuid::Uuid::new_v4()));
        {
            let store = Store::open(&path).unwrap();
            for packet in &packets {
                store.insert_packet(packet, 1_701_000_200).unwrap();
            }
            assert_eq!(
                MyceliumStateSnapshot::from_store(&store)
                    .unwrap()
                    .fingerprint(),
                EXPECTED_FINGERPRINT
            );
        }
        {
            let store = Store::open(&path).unwrap();
            let replayed = MyceliumStateSnapshot::from_store(&store).unwrap();
            assert_eq!(replayed.canonical_json(), expected_json);
            assert_eq!(replayed.fingerprint(), EXPECTED_FINGERPRINT);
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn conflicting_fixture_duplicates_never_produce_a_fingerprint() {
        let (packets, _) = convergence_fixture();
        let original = packets[0].clone();
        let mut conflict = original.clone();
        conflict.zone = "conflict".to_owned();
        for variants in [
            vec![original.clone(), conflict.clone()],
            vec![conflict, original],
        ] {
            let result = MyceliumStateSnapshot::from_packets(variants).map(|s| s.fingerprint());
            assert!(matches!(
                result,
                Err(MyceliumError::ConflictingDuplicate(_))
            ));
        }
    }

    #[test]
    fn fixture_derives_expected_state() {
        let snapshot = MyceliumStateSnapshot::from_packets(fixture_packets()).unwrap();

        assert_eq!(snapshot.phrases.len(), 1);
        let phrase = &snapshot.phrases[0];
        assert_eq!(phrase.phrase_id, "fixture_phrase_001");
        assert_eq!(phrase.safety_label, "mild_slang");
        assert_eq!(
            phrase.best_meaning_id.as_deref(),
            Some("fixture_meaning_hello")
        );
        let meaning = &phrase.meanings[0];
        assert_eq!(meaning.confirms, 1.0);
        assert_eq!(meaning.rejects, 1.0);
        assert_eq!(meaning.total_votes, 2.0);
        assert_eq!(meaning.score, 0.25);
    }

    #[test]
    fn different_arrival_order_derives_same_state() {
        let mut reversed = fixture_packets();
        reversed.reverse();

        assert_eq!(
            MyceliumStateSnapshot::from_packets(fixture_packets()).unwrap(),
            MyceliumStateSnapshot::from_packets(reversed).unwrap()
        );
    }

    #[test]
    fn duplicate_delivery_derives_same_state() {
        let mut duplicated = fixture_packets();
        duplicated.extend(fixture_packets());

        assert_eq!(
            MyceliumStateSnapshot::from_packets(fixture_packets()).unwrap(),
            MyceliumStateSnapshot::from_packets(duplicated).unwrap()
        );
    }

    #[test]
    fn conflicting_duplicate_is_rejected_deterministically() {
        let mut packet = fixture_packets().into_iter().next().unwrap();
        let original = packet.clone();
        packet.zone = "conflicting-zone".to_owned();

        let error = MyceliumStateSnapshot::from_packets(vec![packet, original]).unwrap_err();
        assert!(matches!(error, MyceliumError::ConflictingDuplicate(_)));
    }

    #[test]
    fn convergence_fixture_matches_android_canonical_snapshot() {
        let (packets, expected_json) = convergence_fixture();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();

        assert_eq!(expected_json, snapshot.canonical_json());
        assert_eq!(snapshot.fingerprint(), EXPECTED_FINGERPRINT);
    }

    #[test]
    fn reversed_convergence_fixture_matches_android_canonical_snapshot() {
        let (mut packets, expected_json) = convergence_fixture();
        packets.reverse();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();

        assert_eq!(expected_json, snapshot.canonical_json());
        assert_eq!(snapshot.fingerprint(), EXPECTED_FINGERPRINT);
    }

    #[test]
    fn convergence_fixture_uses_global_meaning_ids_and_utf16_tie_breaking() {
        let (packets, _) = convergence_fixture();
        let snapshot = MyceliumStateSnapshot::from_packets(packets).unwrap();

        assert_eq!(snapshot.phrases.len(), 2);
        assert_eq!(snapshot.phrases[0].phrase_id, "phrase_𐀀");
        assert_eq!(snapshot.phrases[1].phrase_id, "phrase_");

        let first = &snapshot.phrases[0];
        assert_eq!(first.best_meaning_id.as_deref(), Some("meaning_𐀀"));
        assert!(first
            .meanings
            .iter()
            .any(|meaning| meaning.meaning_id == "shared_global"));
        assert!(!snapshot.phrases[1]
            .meanings
            .iter()
            .any(|meaning| meaning.meaning_id == "shared_global"));

        let shared = first
            .meanings
            .iter()
            .find(|meaning| meaning.meaning_id == "shared_global")
            .unwrap();
        assert_eq!(shared.reference_meaning, "first global owner");
        assert_eq!(shared.confirms, 1.0);
    }

    #[test]
    fn kotlin_utf16_ordering_differs_from_rust_scalar_order_as_expected() {
        assert_eq!(kotlin_string_cmp("id_𐀀", "id_"), Ordering::Less);
        assert!("id_𐀀" > "id_");
    }

    #[test]
    fn unique_voter_key_matches_android_unescaped_collision_semantics() {
        let counts = count_unique_voter_votes(vec![
            UniqueVoterVoteInput {
                target_key: "a\",\"b".to_owned(),
                voter_id: "c".to_owned(),
                vote: "confirm".to_owned(),
                created_at: 1,
                packet_id: "packet_a".to_owned(),
            },
            UniqueVoterVoteInput {
                target_key: "a".to_owned(),
                voter_id: "b\",\"c".to_owned(),
                vote: "reject".to_owned(),
                created_at: 2,
                packet_id: "packet_b".to_owned(),
            },
        ]);

        assert!(!counts.contains_key("a\",\"b"));
        let surviving = counts.get("a").unwrap();
        assert_eq!(surviving.confirm_votes, 0.0);
        assert_eq!(surviving.reject_votes, 1.0);
    }

    fn fixture_packets() -> Vec<Packet> {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/typescript_language_packets.json"
        ))
        .unwrap();
        fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| Packet::from_value(&entry["packet"]).unwrap())
            .collect()
    }

    fn convergence_fixture() -> (Vec<Packet>, String) {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_convergence.json"
        ))
        .unwrap();
        let packets = fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|packet| Packet::from_value(packet).unwrap())
            .collect();
        let expected_json = fixture["expected_snapshot_canonical_json"]
            .as_str()
            .unwrap()
            .to_owned();
        (packets, expected_json)
    }

    fn canonicalization_edge_fixture() -> (Vec<Packet>, String, String) {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_canonicalization_edge.json"
        ))
        .unwrap();
        let packets = fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|packet| Packet::from_value(packet).unwrap())
            .collect();
        let expected_json = fixture["expected_snapshot_canonical_json"]
            .as_str()
            .unwrap()
            .to_owned();
        let expected_fingerprint = fixture["expected_fingerprint"].as_str().unwrap().to_owned();
        (packets, expected_json, expected_fingerprint)
    }

    fn correction_fixture() -> (Vec<Packet>, String, usize, String) {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_correction.json"
        ))
        .unwrap();
        let packets = fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(Packet::from_value)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        (
            packets,
            fixture["expected_snapshot_canonical_json"]
                .as_str()
                .unwrap()
                .to_owned(),
            fixture["expected_utf8_byte_length"].as_u64().unwrap() as usize,
            fixture["expected_fingerprint"].as_str().unwrap().to_owned(),
        )
    }

    fn correction_tombstone_fixture() -> (Vec<Packet>, String, usize, String) {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_correction_tombstone.json"
        ))
        .unwrap();
        let packets = fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(Packet::from_value)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        (
            packets,
            fixture["expected_snapshot_canonical_json"]
                .as_str()
                .unwrap()
                .to_owned(),
            fixture["expected_utf8_byte_length"].as_u64().unwrap() as usize,
            fixture["expected_fingerprint"].as_str().unwrap().to_owned(),
        )
    }
}
