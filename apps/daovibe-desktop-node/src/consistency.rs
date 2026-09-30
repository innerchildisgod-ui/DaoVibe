use crate::models::{Packet, PacketError};
use crate::mycelium::MyceliumStateSnapshot;
use crate::storage::{StorageError, Store};
use serde::Serialize;

const MAX_ISSUES: usize = 12;
pub const RUST_SCHEMA_COMPATIBILITY: &str = "idempotent_sqlite_current_layout";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConsistencyStatus {
    Healthy,
    Warning,
    Failed,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ConsistencyIssue {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packet_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct MyceliumConsistencyReport {
    pub package_version: String,
    pub schema_compatibility: String,
    pub status: ConsistencyStatus,
    pub checked_at: i64,
    pub node_id: Option<String>,
    pub ledger_packet_count: usize,
    pub derived_phrase_count: usize,
    pub canonical_fingerprint: Option<String>,
    pub issues: Vec<ConsistencyIssue>,
    pub checks_performed: Vec<String>,
}

impl MyceliumConsistencyReport {
    pub fn diagnostics_json(&self) -> String {
        serde_json::to_string(self).expect("consistency report is serializable")
    }
}

impl Store {
    /// Runs only reads against the resident store. The temporary replay store is
    /// closed before returning and no resident ledger, cursor, peer, or diagnose
    /// metadata is changed.
    pub fn consistency_report(
        &self,
        checked_at: i64,
    ) -> Result<MyceliumConsistencyReport, StorageError> {
        let mut issues = Vec::new();
        let mut checks = vec![
            "identity_structural_validity".to_owned(),
            "ledger_canonical_order".to_owned(),
            "stored_packet_revalidation".to_owned(),
            "packet_decode_and_validation".to_owned(),
            "payload_hash_recomputation".to_owned(),
            "packet_id_recomputation".to_owned(),
        ];
        let identity = self.identity()?;
        let node_id = identity.as_ref().map(|value| value.node_id.clone());
        if identity.is_none() {
            push_issue(&mut issues, "identity_missing", None);
        } else if identity.as_ref().is_some_and(|value| {
            value.node_id.trim().is_empty()
                || value.display_name.trim().is_empty()
                || value.created_at <= 0
                || value.platform.trim().is_empty()
                || value.role.trim().is_empty()
        }) {
            push_issue(&mut issues, "identity_invalid", None);
        }

        // Revalidate each raw stored row with the same Packet::from_json path
        // used by normal import/sync insertion. This covers canonical decode,
        // payload hash, packet id, required/expiry fields, and dev signature.
        let rows = self.packet_rows_for_replay()?;
        let mut packets = Vec::with_capacity(rows.len());
        let mut canonical_by_id = std::collections::HashMap::<String, String>::new();
        for (stored_id, raw_json) in &rows {
            match Packet::from_json(raw_json) {
                Ok(packet) => {
                    if packet.canonical_json() != *raw_json {
                        push_issue(&mut issues, "packet_decode_failed", Some(stored_id.clone()));
                        continue;
                    }
                    if packet.packet_id != *stored_id {
                        push_issue(&mut issues, "packet_id_mismatch", Some(stored_id.clone()));
                        continue;
                    }
                    let canonical = packet.canonical_json();
                    if canonical_by_id
                        .insert(packet.packet_id.clone(), canonical.clone())
                        .is_some_and(|previous| previous != canonical)
                    {
                        push_issue(
                            &mut issues,
                            "duplicate_packet_id_conflict",
                            Some(packet.packet_id.clone()),
                        );
                        continue;
                    }
                    packets.push(packet);
                }
                Err(error) => push_issue(
                    &mut issues,
                    packet_error_code(&error),
                    Some(stored_id.clone()),
                ),
            }
        }
        let packet_count = rows.len();
        checks.push("unique_packet_ids_schema_guarded".to_owned());
        checks.push("development_signature_behavior".to_owned());
        checks.push("stored_expiry_structural_validation".to_owned());
        checks.push("expired_packets_retained_as_historical_ledger".to_owned());
        checks.push("dependency_aware_replay".to_owned());

        // Production/current state path: from_store is the real resident
        // semantic path. Fresh state is independently loaded from raw rows
        // above and replayed after a second decode/validation boundary.
        let resident = MyceliumStateSnapshot::from_store(self).map_err(|error| error.to_string());
        let validated_packets = packets.clone();
        let fresh = MyceliumStateSnapshot::from_packets(packets).map_err(|error| error.to_string());
        let (fingerprint, phrase_count) = match (&resident, &fresh) {
            (Ok(resident), Ok(fresh))
                if resident.canonical_json() == fresh.canonical_json()
                    && resident.fingerprint() == fresh.fingerprint() =>
            {
                checks.push("resident_vs_fresh_replay".to_owned());
                checks.push("canonical_fingerprint".to_owned());
                (Some(fresh.fingerprint()), fresh.phrases.len())
            }
            (Err(error), _) => {
                let code = replay_error_code(&error.to_string());
                push_issue(&mut issues, code, None);
                checks.push("resident_vs_fresh_replay".to_owned());
                (None, 0)
            }
            (_, Err(error)) => {
                let code = replay_error_code(&error.to_string());
                push_issue(&mut issues, code, None);
                checks.push("resident_vs_fresh_replay".to_owned());
                (None, 0)
            }
            _ => {
                push_issue(&mut issues, "replay_failed", None);
                checks.push("resident_vs_fresh_replay".to_owned());
                (None, 0)
            }
        };

        // The semantic snapshot deliberately contains only packet-derived state.
        checks.push("peer_metadata_excluded".to_owned());
        checks.push("diagnose_metadata_excluded".to_owned());
        checks.push("export_import_roundtrip".to_owned());
        let roundtrip_ok = if let Ok(snapshot) = &fresh {
            let scratch = Store::open_in_memory()?;
            let mut first_inserted = 0usize;
            let mut second_inserted = 0usize;
            for packet in &validated_packets {
                if scratch.insert_packet(packet, checked_at)? {
                    first_inserted += 1;
                }
                if scratch.insert_packet(packet, checked_at)? {
                    second_inserted += 1;
                }
            }
            first_inserted == packet_count
                && second_inserted == 0
                && MyceliumStateSnapshot::from_store(&scratch)
                    .map(|value| {
                        value.canonical_json() == snapshot.canonical_json()
                            && value.fingerprint() == snapshot.fingerprint()
                    })
                    .unwrap_or(false)
        } else {
            false
        };
        if !roundtrip_ok && packet_count > 0 {
            push_issue(&mut issues, "replay_failed", None);
        }

        let status = if issues.iter().any(|issue| issue.code != "unknown") {
            ConsistencyStatus::Failed
        } else if !issues.is_empty() {
            ConsistencyStatus::Warning
        } else {
            ConsistencyStatus::Healthy
        };
        Ok(MyceliumConsistencyReport {
            package_version: env!("CARGO_PKG_VERSION").to_owned(),
            schema_compatibility: RUST_SCHEMA_COMPATIBILITY.to_owned(),
            status,
            checked_at,
            node_id,
            ledger_packet_count: packet_count,
            derived_phrase_count: phrase_count,
            canonical_fingerprint: fingerprint,
            issues,
            checks_performed: checks,
        })
    }
}

fn push_issue(issues: &mut Vec<ConsistencyIssue>, code: &str, packet_id: Option<String>) {
    if issues.len() < MAX_ISSUES {
        issues.push(ConsistencyIssue {
            code: code.to_owned(),
            packet_id,
        });
    }
}

fn packet_error_code(error: &PacketError) -> &'static str {
    let text = error.to_string();
    if text.contains("payload_hash") {
        "payload_hash_mismatch"
    } else if text.contains("packet_id") {
        "packet_id_mismatch"
    } else if text.contains("signature") {
        "signature_invalid"
    } else if text.contains("JSON") || text.contains("object") || text.contains("field") {
        "packet_decode_failed"
    } else {
        "unknown"
    }
}

fn replay_error_code(error: &str) -> &'static str {
    if error.contains("dependencies") {
        "dependency_unresolved"
    } else {
        "replay_failed"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{DeviceIdentity, Packet};
    use crate::storage::PeerRecord;
    use serde_json::Value;

    #[test]
    fn alpha_release_acceptance_is_healthy_and_replay_stable() {
        let store = Store::open_in_memory().unwrap();
        store
            .insert_identity(&DeviceIdentity {
                node_id: "mycelium_node_consistency".to_owned(),
                display_name: "Consistency test".to_owned(),
                created_at: 1_700_000_000,
                platform: "desktop".to_owned(),
                role: "independent_node".to_owned(),
            })
            .unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_convergence.json"
        ))
        .unwrap();
        for (index, value) in fixture["packets"].as_array().unwrap().iter().enumerate() {
            let packet = Packet::from_value(value).unwrap();
            assert!(store
                .seed_packet(&packet, 1_701_000_000 + index as i64)
                .unwrap());
        }
        store
            .upsert_peer(&PeerRecord {
                remote_node_id: "remote".to_owned(),
                display_name: Some("Remote".to_owned()),
                host: "127.0.0.1".to_owned(),
                port: 4242,
                pairing_id: "pair".to_owned(),
                last_successful_contact_at: Some(11),
                last_error: Some("old failure".to_owned()),
                updated_at: 12,
                last_failure_at: Some(13),
                last_outcome: Some("failed".to_owned()),
                last_stage: Some("accept".to_owned()),
                last_error_category: Some("timeout".to_owned()),
                last_attempts: Some(2),
                last_imported_packets: Some(3),
                last_duplicate_packets: Some(4),
                last_exported_packets: Some(5),
                last_sync_started_at: Some(6),
                last_sync_finished_at: Some(7),
                last_cursor: Some("7:cursor".to_owned()),
                last_diagnostic_at: Some(8),
                last_diagnostic_outcome: Some("failed".to_owned()),
                last_diagnostic_stage: Some("hello".to_owned()),
                last_diagnostic_error_category: Some("refused".to_owned()),
                last_diagnostic_message: Some("diagnostic message".to_owned()),
                last_diagnostic_latency_ms: Some(9),
            })
            .unwrap();
        store
            .connection()
            .execute(
                "INSERT INTO peer_sync_state(remote_node_id,pairing_id,inbound_cursor,updated_at) VALUES(?1,?2,?3,?4)",
                rusqlite::params!["remote", "pair", "4:cursor", 14i64],
            )
            .unwrap();
        let before_count = store.packet_count().unwrap();
        let before_rows = store.packet_rows_for_replay().unwrap();
        let before_cursors = store.sync_states().unwrap();
        let before_peers = store.peers().unwrap();
        let before_identity = store.identity().unwrap();
        let before_fingerprint = MyceliumStateSnapshot::from_store(&store)
            .unwrap()
            .fingerprint();

        let report = store.consistency_report(1_701_000_200).unwrap();

        assert_eq!(report.status, ConsistencyStatus::Healthy);
        assert_eq!(
            report.canonical_fingerprint.as_deref(),
            Some(before_fingerprint.as_str())
        );
        assert!(report
            .checks_performed
            .iter()
            .any(|check| check == "resident_vs_fresh_replay"));
        assert_eq!(store.packet_count().unwrap(), before_count);
        assert_eq!(store.packet_rows_for_replay().unwrap(), before_rows);
        assert_eq!(store.sync_states().unwrap(), before_cursors);
        assert_eq!(store.peers().unwrap(), before_peers);
        assert_eq!(store.identity().unwrap(), before_identity);
        assert_eq!(
            MyceliumStateSnapshot::from_store(&store)
                .unwrap()
                .fingerprint(),
            before_fingerprint
        );
    }

    #[test]
    fn alpha_store_copy_acceptance_preserves_packets_and_fingerprint() {
        let source = Store::open_in_memory().unwrap();
        source
            .insert_identity(&DeviceIdentity {
                node_id: "mycelium_alpha_source".to_owned(),
                display_name: "Alpha source".to_owned(),
                created_at: 1_700_000_000,
                platform: "desktop".to_owned(),
                role: "independent_node".to_owned(),
            })
            .unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_convergence.json"
        ))
        .unwrap();
        for (index, value) in fixture["packets"].as_array().unwrap().iter().enumerate() {
            let packet = Packet::from_value(value).unwrap();
            assert!(source
                .insert_packet(&packet, 1_701_000_000 + index as i64)
                .unwrap());
        }

        let source_packets = source.packets_for_replay().unwrap();
        let source_fingerprint = MyceliumStateSnapshot::from_store(&source)
            .unwrap()
            .fingerprint();
        let target = Store::open_in_memory().unwrap();
        target
            .insert_identity(&DeviceIdentity {
                node_id: "mycelium_alpha_target".to_owned(),
                display_name: "Alpha target".to_owned(),
                created_at: 1_700_000_001,
                platform: "desktop".to_owned(),
                role: "independent_node".to_owned(),
            })
            .unwrap();
        for (index, packet) in source_packets.iter().enumerate() {
            assert!(target
                .insert_packet(packet, 1_702_000_000 + index as i64)
                .unwrap());
        }

        let report = target.consistency_report(1_702_000_100).unwrap();
        assert_eq!(report.status, ConsistencyStatus::Healthy);
        assert_eq!(
            report.canonical_fingerprint.as_deref(),
            Some(source_fingerprint.as_str())
        );
        assert_eq!(target.packets_for_replay().unwrap(), source_packets);
    }

    #[test]
    fn stored_packet_rows_are_revalidated_before_replay() {
        let store = Store::open_in_memory().unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_convergence.json"
        ))
        .unwrap();
        let packet = Packet::from_value(&fixture["packets"][0]).unwrap();
        assert!(store.seed_packet(&packet, 1_701_000_000).unwrap());
        let corrupted = packet
            .canonical_json()
            .replacen(&packet.payload_hash, &"0".repeat(64), 1);
        store
            .connection()
            .execute(
                "UPDATE packets SET packet_json = ?1 WHERE packet_id = ?2",
                rusqlite::params![corrupted, packet.packet_id],
            )
            .unwrap();

        let report = store.consistency_report(1_701_000_200).unwrap();
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "payload_hash_mismatch"));
    }

    #[test]
    fn sqlite_primary_key_is_the_duplicate_row_boundary() {
        let store = Store::open_in_memory().unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_convergence.json"
        ))
        .unwrap();
        let packet = Packet::from_value(&fixture["packets"][0]).unwrap();
        assert!(store.seed_packet(&packet, 1_701_000_000).unwrap());
        let duplicate_row = store.connection().execute(
            "INSERT INTO packets(packet_id,packet_type,created_at,received_at,packet_json) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![packet.packet_id, packet.packet_type.wire(), packet.created_at, 1_701_000_001i64, packet.canonical_json()],
        );
        assert!(duplicate_row.is_err());
    }
}
