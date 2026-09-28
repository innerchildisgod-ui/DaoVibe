use crate::models::{DeviceIdentity, Packet, PacketError};
use crate::protocol::{PairingApproval, PairingOffer, ProtocolError, SyncBatch, START_CURSOR};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("SQLite error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("packet error: {0}")]
    Packet(#[from] PacketError),
    #[error("protocol error: {0}")]
    Protocol(#[from] ProtocolError),
}

#[derive(Clone, Debug, PartialEq)]
pub struct PairingRecord {
    pub pairing_id: String,
    pub local_node_id: String,
    pub remote_node_id: String,
    pub remote_display_name: String,
    pub remote_platform: String,
    pub remote_role: String,
    pub status: String,
    pub created_at: i64,
    pub paired_at: Option<i64>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct PeerRecord {
    pub remote_node_id: String,
    pub display_name: Option<String>,
    pub host: String,
    pub port: u16,
    pub pairing_id: String,
    pub last_successful_contact_at: Option<i64>,
    pub last_error: Option<String>,
    pub updated_at: i64,
    pub last_failure_at: Option<i64>,
    pub last_outcome: Option<String>,
    pub last_stage: Option<String>,
    pub last_error_category: Option<String>,
    pub last_attempts: Option<i64>,
    pub last_imported_packets: Option<i64>,
    pub last_duplicate_packets: Option<i64>,
    pub last_exported_packets: Option<i64>,
    pub last_sync_started_at: Option<i64>,
    pub last_sync_finished_at: Option<i64>,
    pub last_cursor: Option<String>,
}
#[derive(Clone, Debug)]
pub struct StoredPacket {
    pub packet: Packet,
    pub received_at: i64,
}

pub struct Store {
    connection: Connection,
}
impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let connection = Connection::open(path)?;
        let store = Self { connection };
        store.initialize()?;
        Ok(store)
    }
    pub fn open_in_memory() -> Result<Self, StorageError> {
        let connection = Connection::open_in_memory()?;
        let store = Self { connection };
        store.initialize()?;
        Ok(store)
    }
    fn initialize(&self) -> Result<(), StorageError> {
        self.connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS device_identity (id INTEGER PRIMARY KEY CHECK (id = 1), node_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at INTEGER NOT NULL, platform TEXT NOT NULL, role TEXT NOT NULL); CREATE TABLE IF NOT EXISTS packets (packet_id TEXT PRIMARY KEY, packet_type TEXT NOT NULL, created_at INTEGER NOT NULL, received_at INTEGER NOT NULL, packet_json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS packets_ledger_order ON packets(received_at ASC, packet_id ASC); CREATE TABLE IF NOT EXISTS paired_devices (pairing_id TEXT PRIMARY KEY, local_node_id TEXT NOT NULL, remote_node_id TEXT NOT NULL, remote_display_name TEXT NOT NULL, remote_platform TEXT NOT NULL, remote_role TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, paired_at INTEGER); CREATE UNIQUE INDEX IF NOT EXISTS paired_devices_remote_active ON paired_devices(local_node_id, remote_node_id) WHERE status = 'approved'; CREATE TABLE IF NOT EXISTS peer_sync_state (remote_node_id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL, inbound_cursor TEXT NOT NULL DEFAULT '0:', updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS known_peers (remote_node_id TEXT PRIMARY KEY, display_name TEXT, host TEXT NOT NULL, port INTEGER NOT NULL, pairing_id TEXT NOT NULL, last_successful_contact_at INTEGER, last_error TEXT, updated_at INTEGER NOT NULL);")?;
        for (name, sql) in [
            (
                "last_failure_at",
                "ALTER TABLE known_peers ADD COLUMN last_failure_at INTEGER",
            ),
            (
                "last_outcome",
                "ALTER TABLE known_peers ADD COLUMN last_outcome TEXT",
            ),
            (
                "last_stage",
                "ALTER TABLE known_peers ADD COLUMN last_stage TEXT",
            ),
            (
                "last_error_category",
                "ALTER TABLE known_peers ADD COLUMN last_error_category TEXT",
            ),
            (
                "last_attempts",
                "ALTER TABLE known_peers ADD COLUMN last_attempts INTEGER",
            ),
            (
                "last_imported_packets",
                "ALTER TABLE known_peers ADD COLUMN last_imported_packets INTEGER",
            ),
            (
                "last_duplicate_packets",
                "ALTER TABLE known_peers ADD COLUMN last_duplicate_packets INTEGER",
            ),
            (
                "last_exported_packets",
                "ALTER TABLE known_peers ADD COLUMN last_exported_packets INTEGER",
            ),
            (
                "last_sync_started_at",
                "ALTER TABLE known_peers ADD COLUMN last_sync_started_at INTEGER",
            ),
            (
                "last_sync_finished_at",
                "ALTER TABLE known_peers ADD COLUMN last_sync_finished_at INTEGER",
            ),
            (
                "last_cursor",
                "ALTER TABLE known_peers ADD COLUMN last_cursor TEXT",
            ),
        ] {
            let exists: bool = self.connection.query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('known_peers') WHERE name=?1",
                [name],
                |row| row.get(0),
            )?;
            if !exists {
                self.connection.execute(sql, [])?;
            }
        }
        Ok(())
    }
    pub fn identity(&self) -> Result<Option<DeviceIdentity>, StorageError> {
        self.connection.query_row("SELECT node_id,display_name,created_at,platform,role FROM device_identity WHERE id=1",[],|row|Ok(DeviceIdentity{node_id:row.get(0)?,display_name:row.get(1)?,created_at:row.get(2)?,platform:row.get(3)?,role:row.get(4)?})).optional().map_err(Into::into)
    }
    pub fn insert_identity(&self, identity: &DeviceIdentity) -> Result<(), StorageError> {
        self.connection.execute("INSERT OR IGNORE INTO device_identity(id,node_id,display_name,created_at,platform,role) VALUES(1,?1,?2,?3,?4,?5)",params![identity.node_id,identity.display_name,identity.created_at,identity.platform,identity.role])?;
        Ok(())
    }
    pub fn set_display_name(&self, name: &str) -> Result<(), StorageError> {
        self.connection.execute(
            "UPDATE device_identity SET display_name=?1 WHERE id=1",
            [name],
        )?;
        Ok(())
    }
    pub fn upsert_pairing(&self, record: &PairingRecord) -> Result<(), StorageError> {
        self.connection.execute("INSERT INTO paired_devices(pairing_id,local_node_id,remote_node_id,remote_display_name,remote_platform,remote_role,status,created_at,paired_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(pairing_id) DO UPDATE SET remote_display_name=excluded.remote_display_name,remote_platform=excluded.remote_platform,remote_role=excluded.remote_role,status=excluded.status,paired_at=excluded.paired_at",params![record.pairing_id,record.local_node_id,record.remote_node_id,record.remote_display_name,record.remote_platform,record.remote_role,record.status,record.created_at,record.paired_at])?;
        Ok(())
    }
    pub fn pairing(&self, pairing_id: &str) -> Result<Option<PairingRecord>, StorageError> {
        self.connection.query_row("SELECT pairing_id,local_node_id,remote_node_id,remote_display_name,remote_platform,remote_role,status,created_at,paired_at FROM paired_devices WHERE pairing_id=?1",[pairing_id],row_pairing).optional().map_err(Into::into)
    }
    pub fn active_pairing_for_remote(
        &self,
        local_node_id: &str,
        remote_node_id: &str,
    ) -> Result<Option<PairingRecord>, StorageError> {
        self.connection.query_row("SELECT pairing_id,local_node_id,remote_node_id,remote_display_name,remote_platform,remote_role,status,created_at,paired_at FROM paired_devices WHERE local_node_id=?1 AND remote_node_id=?2 AND status='approved'",params![local_node_id,remote_node_id],row_pairing).optional().map_err(Into::into)
    }
    pub fn pairings(&self) -> Result<Vec<PairingRecord>, StorageError> {
        let mut statement=self.connection.prepare("SELECT pairing_id,local_node_id,remote_node_id,remote_display_name,remote_platform,remote_role,status,created_at,paired_at FROM paired_devices ORDER BY created_at ASC,pairing_id ASC")?;
        let result = statement
            .query_map([], row_pairing)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(result)
    }
    pub fn upsert_peer(&self, peer: &PeerRecord) -> Result<(), StorageError> {
        self.connection.execute("INSERT INTO known_peers(remote_node_id,display_name,host,port,pairing_id,last_successful_contact_at,last_error,updated_at,last_failure_at,last_outcome,last_stage,last_error_category,last_attempts,last_imported_packets,last_duplicate_packets,last_exported_packets,last_sync_started_at,last_sync_finished_at,last_cursor) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19) ON CONFLICT(remote_node_id) DO UPDATE SET display_name=excluded.display_name,host=excluded.host,port=excluded.port,pairing_id=excluded.pairing_id,last_successful_contact_at=known_peers.last_successful_contact_at,last_error=known_peers.last_error,last_failure_at=known_peers.last_failure_at,last_outcome=known_peers.last_outcome,last_stage=known_peers.last_stage,last_error_category=known_peers.last_error_category,last_attempts=known_peers.last_attempts,last_imported_packets=known_peers.last_imported_packets,last_duplicate_packets=known_peers.last_duplicate_packets,last_exported_packets=known_peers.last_exported_packets,last_sync_started_at=known_peers.last_sync_started_at,last_sync_finished_at=known_peers.last_sync_finished_at,last_cursor=known_peers.last_cursor,updated_at=excluded.updated_at", params![peer.remote_node_id, peer.display_name, peer.host, peer.port, peer.pairing_id, peer.last_successful_contact_at, peer.last_error, peer.updated_at, peer.last_failure_at, peer.last_outcome, peer.last_stage, peer.last_error_category, peer.last_attempts, peer.last_imported_packets, peer.last_duplicate_packets, peer.last_exported_packets, peer.last_sync_started_at, peer.last_sync_finished_at, peer.last_cursor])?;
        Ok(())
    }
    pub fn peer(&self, remote_node_id: &str) -> Result<Option<PeerRecord>, StorageError> {
        self.connection.query_row("SELECT remote_node_id,display_name,host,port,pairing_id,last_successful_contact_at,last_error,updated_at,last_failure_at,last_outcome,last_stage,last_error_category,last_attempts,last_imported_packets,last_duplicate_packets,last_exported_packets,last_sync_started_at,last_sync_finished_at,last_cursor FROM known_peers WHERE remote_node_id=?1", [remote_node_id], row_peer).optional().map_err(Into::into)
    }
    pub fn peers(&self) -> Result<Vec<PeerRecord>, StorageError> {
        let mut statement = self.connection.prepare("SELECT remote_node_id,display_name,host,port,pairing_id,last_successful_contact_at,last_error,updated_at,last_failure_at,last_outcome,last_stage,last_error_category,last_attempts,last_imported_packets,last_duplicate_packets,last_exported_packets,last_sync_started_at,last_sync_finished_at,last_cursor FROM known_peers ORDER BY remote_node_id ASC")?;
        let peers = statement
            .query_map([], row_peer)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(peers)
    }
    pub fn remove_peer(&self, remote_node_id: &str) -> Result<(), StorageError> {
        self.connection.execute(
            "DELETE FROM known_peers WHERE remote_node_id=?1",
            [remote_node_id],
        )?;
        Ok(())
    }
    pub fn mark_peer_success(&self, remote_node_id: &str, at: i64) -> Result<(), StorageError> {
        self.connection.execute("UPDATE known_peers SET last_successful_contact_at=?1,updated_at=?1 WHERE remote_node_id=?2", params![at, remote_node_id])?;
        Ok(())
    }

    pub fn record_peer_success(
        &self,
        result: &crate::node::PeerSyncResult,
    ) -> Result<(), StorageError> {
        self.connection.execute("UPDATE known_peers SET last_successful_contact_at=?1,last_outcome='success',last_stage=?2,last_attempts=?3,last_imported_packets=?4,last_duplicate_packets=?5,last_exported_packets=?6,last_sync_started_at=?7,last_sync_finished_at=?1,last_cursor=?8,updated_at=?1 WHERE remote_node_id=?9", params![result.finished_at, result.stage.to_string(), result.attempts as i64, result.imported_packets as i64, result.duplicate_packets as i64, result.exported_packets.map(|v| v as i64), result.started_at, result.cursor, result.remote_node_id])?;
        Ok(())
    }
    pub fn record_peer_failure(
        &self,
        result: &crate::node::PeerSyncResult,
    ) -> Result<(), StorageError> {
        self.connection.execute("UPDATE known_peers SET last_failure_at=?1,last_error=?2,last_outcome='failed',last_stage=?3,last_error_category=?4,last_attempts=?5,last_imported_packets=?6,last_duplicate_packets=?7,last_exported_packets=?8,last_sync_started_at=?9,last_sync_finished_at=?1,last_cursor=?10,updated_at=?1 WHERE remote_node_id=?11", params![result.finished_at, result.message.as_deref().unwrap_or("sync failed"), result.stage.to_string(), result.error_category.as_ref().map(ToString::to_string), result.attempts as i64, result.imported_packets as i64, result.duplicate_packets as i64, result.exported_packets.map(|v| v as i64), result.started_at, result.cursor, result.remote_node_id])?;
        Ok(())
    }
    pub fn mark_peer_failure(
        &self,
        remote_node_id: &str,
        at: i64,
        error: &str,
    ) -> Result<(), StorageError> {
        self.connection.execute(
            "UPDATE known_peers SET last_error=?1,updated_at=?2 WHERE remote_node_id=?3",
            params![error, at, remote_node_id],
        )?;
        Ok(())
    }
    pub fn insert_packet(&self, packet: &Packet, received_at: i64) -> Result<bool, StorageError> {
        let inserted=self.connection.execute("INSERT OR IGNORE INTO packets(packet_id,packet_type,created_at,received_at,packet_json) VALUES(?1,?2,?3,?4,?5)",params![packet.packet_id,packet.packet_type.wire(),packet.created_at,received_at,packet.canonical_json()])?;
        Ok(inserted == 1)
    }
    pub fn packet_count(&self) -> Result<i64, StorageError> {
        Ok(self
            .connection
            .query_row("SELECT COUNT(*) FROM packets", [], |row| row.get(0))?)
    }
    pub fn packets_after(
        &self,
        received_at: i64,
        packet_id: &str,
        limit: usize,
    ) -> Result<Vec<StoredPacket>, StorageError> {
        let mut statement=self.connection.prepare("SELECT packet_json,received_at FROM packets WHERE received_at > ?1 OR (received_at = ?1 AND packet_id > ?2) ORDER BY received_at ASC,packet_id ASC LIMIT ?3")?;
        let values = statement.query_map(params![received_at, packet_id, limit as i64], |row| {
            let json: String = row.get(0)?;
            let at: i64 = row.get(1)?;
            let packet = Packet::from_json(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(StoredPacket {
                packet,
                received_at: at,
            })
        })?;
        Ok(values.collect::<Result<Vec<_>, _>>()?)
    }
    pub fn packets_for_replay(&self) -> Result<Vec<Packet>, StorageError> {
        let mut statement = self
            .connection
            .prepare("SELECT packet_json FROM packets ORDER BY created_at ASC,packet_id ASC")?;
        let values = statement.query_map([], |row| {
            let json: String = row.get(0)?;
            Packet::from_json(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })?;
        Ok(values.collect::<Result<Vec<_>, _>>()?)
    }
    pub fn sync_states(&self) -> Result<Vec<(String, String, String, i64)>, StorageError> {
        let mut statement=self.connection.prepare("SELECT remote_node_id,pairing_id,inbound_cursor,updated_at FROM peer_sync_state ORDER BY remote_node_id ASC")?;
        let result = statement
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(result)
    }
    pub fn transaction(&mut self) -> Result<rusqlite::Transaction<'_>, StorageError> {
        Ok(self.connection.transaction()?)
    }
    pub fn connection(&self) -> &Connection {
        &self.connection
    }
    pub fn seed_packet(&self, packet: &Packet, received_at: i64) -> Result<bool, StorageError> {
        self.insert_packet(packet, received_at)
    }
    pub fn cursor_or_start_for_pairing(
        &self,
        remote_node_id: &str,
        pairing_id: &str,
    ) -> Result<String, StorageError> {
        Ok(self
            .connection
            .query_row(
                "SELECT inbound_cursor FROM peer_sync_state WHERE remote_node_id=?1 AND pairing_id=?2",
                params![remote_node_id, pairing_id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(|| START_CURSOR.to_owned()))
    }

    pub fn import_sync_batch_atomically(
        &self,
        batch: &SyncBatch,
        remote_node_id: &str,
        pairing_id: &str,
        imported_at: i64,
    ) -> Result<(usize, usize), StorageError> {
        batch.validate()?;

        if remote_node_id.trim().is_empty() {
            return Err(PacketError::Invalid("remote node id must be non-empty".to_owned()).into());
        }
        if pairing_id.trim().is_empty() {
            return Err(PacketError::Invalid("pairing id must be non-empty".to_owned()).into());
        }
        if batch.source_node_id != remote_node_id {
            return Err(PacketError::Invalid(
                "sync batch source does not match remote node".to_owned(),
            )
            .into());
        }
        if batch.pairing_id != pairing_id {
            return Err(PacketError::Invalid(
                "sync batch pairing does not match pairing id".to_owned(),
            )
            .into());
        }

        let transaction = self.connection.unchecked_transaction()?;
        let existing_state = transaction
            .query_row(
                "SELECT pairing_id,inbound_cursor FROM peer_sync_state WHERE remote_node_id=?1",
                [remote_node_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((stored_pairing_id, _)) = &existing_state {
            if stored_pairing_id != pairing_id {
                return Err(PacketError::Invalid(
                    "stored sync state belongs to another pairing".to_owned(),
                )
                .into());
            }
        }
        let current_cursor = existing_state
            .map(|(_, cursor)| cursor)
            .unwrap_or_else(|| START_CURSOR.to_owned());

        if batch.request_cursor != current_cursor {
            return Err(PacketError::Invalid(format!(
                "sync cursor mismatch: expected {current_cursor}, received {}",
                batch.request_cursor
            ))
            .into());
        }

        let cursor_comparison =
            crate::protocol::compare_cursor(&batch.next_cursor, &current_cursor);
        if cursor_comparison == std::cmp::Ordering::Less {
            return Err(PacketError::Invalid("sync cursor regressed".to_owned()).into());
        }

        let local_node_id = transaction
            .query_row(
                "SELECT node_id FROM device_identity WHERE id=1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| PacketError::Invalid("local device identity is missing".to_owned()))?;
        if batch.target_node_id != local_node_id {
            return Err(PacketError::Invalid(
                "sync batch target does not match local node".to_owned(),
            )
            .into());
        }
        let active_pairing = transaction
            .query_row(
                "SELECT 1 FROM paired_devices
                 WHERE pairing_id=?1 AND local_node_id=?2
                   AND remote_node_id=?3 AND status='approved'",
                params![pairing_id, local_node_id, remote_node_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if active_pairing.is_none() {
            return Err(PacketError::Invalid(
                "approved pairing is missing for sync import".to_owned(),
            )
            .into());
        }

        let mut existing_phrase_ids = HashSet::new();
        let mut existing_meaning_ids = HashSet::new();
        let mut existing_meaning_proposals = HashMap::new();
        let mut existing_correction_proposals = HashMap::new();
        let mut existing_tombstone_proposals = HashMap::new();
        let mut packet_json_by_id = HashMap::new();
        {
            let mut statement = transaction.prepare("SELECT packet_json FROM packets")?;
            let rows = statement.query_map([], |row| row.get::<_, String>(0))?;

            for row in rows {
                let packet = Packet::from_json(&row?)?;
                remember_dependency(&packet, &mut existing_phrase_ids, &mut existing_meaning_ids);
                remember_correction_dependency(
                    &packet,
                    &mut existing_meaning_proposals,
                    &mut existing_correction_proposals,
                    &mut existing_tombstone_proposals,
                );
            }
        }

        let mut unique_packets = HashMap::new();
        let mut ordered_unique_packets = Vec::new();
        for packet in &batch.packets {
            packet.validate()?;
            if packet.is_expired(imported_at) {
                return Err(
                    PacketError::Invalid(format!("packet expired: {}", packet.packet_id)).into(),
                );
            }

            let canonical_json = packet.canonical_json();
            if let Some(existing) = unique_packets.get(&packet.packet_id) {
                if existing != &canonical_json {
                    return Err(PacketError::Invalid(format!(
                        "conflicting duplicate packet id: {}",
                        packet.packet_id
                    ))
                    .into());
                }
            } else {
                unique_packets.insert(packet.packet_id.clone(), canonical_json);
                ordered_unique_packets.push(packet.clone());
            }
        }

        let mut available_phrase_ids = existing_phrase_ids;
        let mut available_meaning_ids = existing_meaning_ids;
        let mut meaning_proposals = existing_meaning_proposals;
        let mut correction_proposals = existing_correction_proposals;
        let mut tombstone_proposals = existing_tombstone_proposals;
        for packet in &ordered_unique_packets {
            require_dependencies(
                packet,
                &available_phrase_ids,
                &available_meaning_ids,
                &meaning_proposals,
                &correction_proposals,
                &tombstone_proposals,
            )?;
            remember_dependency(
                packet,
                &mut available_phrase_ids,
                &mut available_meaning_ids,
            );
            remember_correction_dependency(
                packet,
                &mut meaning_proposals,
                &mut correction_proposals,
                &mut tombstone_proposals,
            );
        }

        for (packet_id, canonical_json) in &unique_packets {
            let existing = transaction
                .query_row(
                    "SELECT packet_json FROM packets WHERE packet_id=?1",
                    [packet_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if let Some(existing) = existing {
                let existing_packet = Packet::from_json(&existing)?;
                if existing_packet.canonical_json() != *canonical_json {
                    return Err(PacketError::Invalid(format!(
                        "conflicting duplicate packet id in ledger: {packet_id}"
                    ))
                    .into());
                }
                packet_json_by_id.insert(packet_id.clone(), existing);
            }
        }

        let genuinely_new = unique_packets
            .keys()
            .filter(|packet_id| !packet_json_by_id.contains_key(*packet_id))
            .count();
        if batch.packets.is_empty() && cursor_comparison != std::cmp::Ordering::Equal {
            return Err(PacketError::Invalid(
                "sync cursor cannot advance without packets".to_owned(),
            )
            .into());
        }
        if genuinely_new > 0 && cursor_comparison == std::cmp::Ordering::Equal {
            return Err(PacketError::Invalid(
                "sync cursor did not advance for new packets".to_owned(),
            )
            .into());
        }

        let mut inserted = 0usize;

        for packet in &batch.packets {
            if packet_json_by_id.contains_key(&packet.packet_id) {
                continue;
            }
            let changed = transaction.execute(
                "INSERT OR IGNORE INTO packets(packet_id,packet_type,created_at,received_at,packet_json) VALUES(?1,?2,?3,?4,?5)",
                params![
                    packet.packet_id,
                    packet.packet_type.wire(),
                    packet.created_at,
                    imported_at,
                    packet.canonical_json()
                ],
            )?;
            inserted += changed;
        }

        transaction.execute(
            "INSERT INTO peer_sync_state(remote_node_id,pairing_id,inbound_cursor,updated_at)
             VALUES(?1,?2,?3,?4)
             ON CONFLICT(remote_node_id) DO UPDATE SET
                 pairing_id=excluded.pairing_id,
                 inbound_cursor=excluded.inbound_cursor,
                 updated_at=excluded.updated_at",
            params![remote_node_id, pairing_id, batch.next_cursor, imported_at],
        )?;

        transaction.commit()?;

        let duplicates = batch.packets.len().saturating_sub(inserted);
        Ok((inserted, duplicates))
    }
    pub fn cursor_or_start(&self, remote_node_id: &str) -> Result<String, StorageError> {
        Ok(self
            .connection
            .query_row(
                "SELECT inbound_cursor FROM peer_sync_state WHERE remote_node_id=?1",
                [remote_node_id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(|| START_CURSOR.to_owned()))
    }
}

fn remember_dependency(
    packet: &Packet,
    phrase_ids: &mut HashSet<String>,
    meaning_ids: &mut HashSet<String>,
) {
    match &packet.payload {
        crate::models::PacketPayload::PhraseObserved { phrase_id, .. } => {
            phrase_ids.insert(phrase_id.clone());
        }
        crate::models::PacketPayload::MeaningProposal { meaning_id, .. } => {
            meaning_ids.insert(meaning_id.clone());
        }
        crate::models::PacketPayload::MeaningVote { .. }
        | crate::models::PacketPayload::CorrectionProposed { .. }
        | crate::models::PacketPayload::CorrectionVote { .. }
        | crate::models::PacketPayload::CorrectionTombstoneProposed { .. }
        | crate::models::PacketPayload::CorrectionTombstoneVote { .. }
        | crate::models::PacketPayload::SafetyLabel { .. } => {}
    }
}

fn require_dependencies(
    packet: &Packet,
    phrase_ids: &HashSet<String>,
    meaning_ids: &HashSet<String>,
    meaning_proposals: &HashMap<(String, String), String>,
    correction_proposals: &HashMap<(String, String, String), String>,
    tombstone_proposals: &HashMap<(String, String, String, String), String>,
) -> Result<(), StorageError> {
    match &packet.payload {
        crate::models::PacketPayload::PhraseObserved { .. } => Ok(()),
        crate::models::PacketPayload::MeaningProposal { phrase_id, .. }
        | crate::models::PacketPayload::SafetyLabel { phrase_id, .. } => {
            if phrase_ids.contains(phrase_id) {
                Ok(())
            } else {
                Err(PacketError::Invalid(format!("missing phrase dependency: {phrase_id}")).into())
            }
        }
        crate::models::PacketPayload::MeaningVote { meaning_id, .. } => {
            if meaning_ids.contains(meaning_id) {
                Ok(())
            } else {
                Err(
                    PacketError::Invalid(format!("missing meaning dependency: {meaning_id}"))
                        .into(),
                )
            }
        }
        crate::models::PacketPayload::CorrectionProposed {
            phrase_id,
            meaning_id,
            ..
        } => {
            if meaning_ids.contains(meaning_id)
                && meaning_proposals.get(&(phrase_id.clone(), meaning_id.clone()))
                    == packet.parent.as_ref()
            {
                Ok(())
            } else {
                Err(PacketError::Invalid(format!(
                    "invalid correction meaning parent: {meaning_id}"
                ))
                .into())
            }
        }
        crate::models::PacketPayload::CorrectionVote {
            phrase_id,
            meaning_id,
            correction_id,
            ..
        } => {
            if meaning_ids.contains(meaning_id)
                && correction_proposals.get(&(
                    phrase_id.clone(),
                    meaning_id.clone(),
                    correction_id.clone(),
                )) == packet.parent.as_ref()
            {
                Ok(())
            } else {
                Err(PacketError::Invalid(format!(
                    "invalid correction vote parent: {correction_id}"
                ))
                .into())
            }
        }
        crate::models::PacketPayload::CorrectionTombstoneProposed {
            phrase_id,
            meaning_id,
            correction_id,
            ..
        } => {
            if correction_proposals.get(&(
                phrase_id.clone(),
                meaning_id.clone(),
                correction_id.clone(),
            )) == packet.parent.as_ref()
            {
                Ok(())
            } else {
                Err(PacketError::Invalid(format!(
                    "invalid correction tombstone parent: {correction_id}"
                ))
                .into())
            }
        }
        crate::models::PacketPayload::CorrectionTombstoneVote {
            phrase_id,
            meaning_id,
            correction_id,
            tombstone_id,
            ..
        } => {
            if tombstone_proposals.get(&(
                phrase_id.clone(),
                meaning_id.clone(),
                correction_id.clone(),
                tombstone_id.clone(),
            )) == packet.parent.as_ref()
            {
                Ok(())
            } else {
                Err(PacketError::Invalid(format!(
                    "invalid correction tombstone vote parent: {tombstone_id}"
                ))
                .into())
            }
        }
    }
}

fn remember_correction_dependency(
    packet: &Packet,
    meaning_proposals: &mut HashMap<(String, String), String>,
    correction_proposals: &mut HashMap<(String, String, String), String>,
    tombstone_proposals: &mut HashMap<(String, String, String, String), String>,
) {
    match &packet.payload {
        crate::models::PacketPayload::MeaningProposal {
            phrase_id,
            meaning_id,
            ..
        } => {
            meaning_proposals.insert(
                (phrase_id.clone(), meaning_id.clone()),
                packet.packet_id.clone(),
            );
        }
        crate::models::PacketPayload::CorrectionProposed {
            phrase_id,
            meaning_id,
            correction_id,
            ..
        } => {
            correction_proposals.insert(
                (phrase_id.clone(), meaning_id.clone(), correction_id.clone()),
                packet.packet_id.clone(),
            );
        }
        crate::models::PacketPayload::CorrectionTombstoneProposed {
            phrase_id,
            meaning_id,
            correction_id,
            tombstone_id,
            ..
        } => {
            tombstone_proposals.insert(
                (
                    phrase_id.clone(),
                    meaning_id.clone(),
                    correction_id.clone(),
                    tombstone_id.clone(),
                ),
                packet.packet_id.clone(),
            );
        }
        _ => {}
    }
}
fn row_pairing(row: &rusqlite::Row<'_>) -> rusqlite::Result<PairingRecord> {
    Ok(PairingRecord {
        pairing_id: row.get(0)?,
        local_node_id: row.get(1)?,
        remote_node_id: row.get(2)?,
        remote_display_name: row.get(3)?,
        remote_platform: row.get(4)?,
        remote_role: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
        paired_at: row.get(8)?,
    })
}
fn row_peer(row: &rusqlite::Row<'_>) -> rusqlite::Result<PeerRecord> {
    Ok(PeerRecord {
        remote_node_id: row.get(0)?,
        display_name: row.get(1)?,
        host: row.get(2)?,
        port: row.get::<_, i64>(3)? as u16,
        pairing_id: row.get(4)?,
        last_successful_contact_at: row.get(5)?,
        last_error: row.get(6)?,
        updated_at: row.get(7)?,
        last_failure_at: row.get(8)?,
        last_outcome: row.get(9)?,
        last_stage: row.get(10)?,
        last_error_category: row.get(11)?,
        last_attempts: row.get(12)?,
        last_imported_packets: row.get(13)?,
        last_duplicate_packets: row.get(14)?,
        last_exported_packets: row.get(15)?,
        last_sync_started_at: row.get(16)?,
        last_sync_finished_at: row.get(17)?,
        last_cursor: row.get(18)?,
    })
}

impl From<&PairingApproval> for PairingRecord {
    fn from(value: &PairingApproval) -> Self {
        Self {
            pairing_id: value.pairing_id.clone(),
            local_node_id: value.target_node_id.clone(),
            remote_node_id: value.approving_node_id.clone(),
            remote_display_name: value.approving_display_name.clone(),
            remote_platform: value.approving_platform.clone(),
            remote_role: value.approving_role.clone(),
            status: value.approval_state.clone(),
            created_at: value.approved_at,
            paired_at: (value.approval_state == "approved").then_some(value.approved_at),
        }
    }
}
impl From<&PairingOffer> for PairingRecord {
    fn from(value: &PairingOffer) -> Self {
        Self {
            pairing_id: value.pairing_id.clone(),
            local_node_id: value.source_node_id.clone(),
            remote_node_id: String::new(),
            remote_display_name: String::new(),
            remote_platform: String::new(),
            remote_role: String::new(),
            status: "pending".to_owned(),
            created_at: value.created_at,
            paired_at: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::canonical;
    use crate::models::{sha256, PacketPayload, PacketType};
    use crate::protocol::{SyncBatch, SYNC_VERSION};
    #[test]
    fn identity_survives_name_change() {
        let store = Store::open_in_memory().unwrap();
        let identity = DeviceIdentity {
            node_id: "mycelium_node_desktop".to_owned(),
            display_name: "Desk".to_owned(),
            created_at: 1,
            platform: "windows".to_owned(),
            role: "computer".to_owned(),
        };
        store.insert_identity(&identity).unwrap();
        store.set_display_name("New").unwrap();
        assert_eq!(store.identity().unwrap().unwrap().node_id, identity.node_id);
    }
    #[test]
    fn packet_count_starts_empty() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.packet_count().unwrap(), 0);
        let _ = PacketType::PhraseObserved;
        let _ = PacketPayload::SafetyLabel {
            phrase_id: "p".to_owned(),
            label: "normal".to_owned(),
            reason: None,
        };
    }

    #[test]
    fn invalid_payload_hash_is_rejected_atomically() {
        let store = test_store();
        let mut packet = phrase_packet();
        packet.payload_hash = "invalid".to_owned();

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:payload_hash"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn invalid_packet_id_is_rejected_atomically() {
        let store = test_store();
        let mut packet = phrase_packet();
        packet.packet_id = "invalid".to_owned();

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:packet_id"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn arbitrary_dev_signature_is_rejected() {
        let store = test_store();
        let mut packet = phrase_packet();
        packet.signature = "arbitrary-signature".to_owned();

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:signature"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn exact_dev_signature_is_accepted() {
        let store = test_store();
        let packet = phrase_packet();

        let result = store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:exact"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(result, (1, 0));
        assert_eq!(store.packet_count().unwrap(), 1);
    }

    #[test]
    fn expired_packet_is_rejected() {
        let store = test_store();
        let packet = packet_with_expiry(IMPORTED_AT - 1);

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:expired"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn packet_expiring_at_import_time_is_accepted() {
        let store = test_store();
        let packet = packet_with_expiry(IMPORTED_AT);

        let result = store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:boundary"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(result, (1, 0));
        assert_eq!(store.packet_count().unwrap(), 1);
    }

    #[test]
    fn missing_dependency_rejects_the_whole_batch() {
        let store = test_store();

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![meaning_proposal_packet()], "1:missing"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn dependency_already_in_ledger_is_accepted() {
        let store = test_store();
        store.seed_packet(&phrase_packet(), 1).unwrap();

        let result = store
            .import_sync_batch_atomically(
                &test_batch(vec![meaning_proposal_packet()], "1:existing"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(result, (1, 0));
        assert_eq!(store.packet_count().unwrap(), 2);
    }

    #[test]
    fn earlier_dependency_in_same_batch_is_accepted() {
        let store = test_store();

        let result = store
            .import_sync_batch_atomically(
                &test_batch(
                    vec![phrase_packet(), meaning_proposal_packet()],
                    "1:same-batch",
                ),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(result, (2, 0));
        assert_eq!(store.packet_count().unwrap(), 2);
    }

    #[test]
    fn invalid_second_packet_rolls_back_first_packet() {
        let store = test_store();
        let mut invalid_proposal = meaning_proposal_packet();
        invalid_proposal.payload_hash = "invalid".to_owned();

        assert!(store
            .import_sync_batch_atomically(
                &test_batch(vec![phrase_packet(), invalid_proposal], "1:rollback"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .is_err());
        assert_empty_import(&store);
    }

    #[test]
    fn valid_duplicate_does_not_insert_a_second_row() {
        let store = test_store();
        let packet = phrase_packet();
        store.seed_packet(&packet, 1).unwrap();

        let result = store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "1:duplicate"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(result, (0, 1));
        assert_eq!(store.packet_count().unwrap(), 1);
    }

    #[test]
    fn valid_duplicate_batch_can_advance_cursor() {
        let store = test_store();
        let packet = phrase_packet();
        store.seed_packet(&packet, 1).unwrap();

        store
            .import_sync_batch_atomically(
                &test_batch(vec![packet], "2:duplicate"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        assert_eq!(
            store
                .cursor_or_start_for_pairing(REMOTE_NODE, PAIRING_ID)
                .unwrap(),
            "2:duplicate"
        );
    }

    #[test]
    fn forwarded_packet_author_is_preserved() {
        let store = test_store();
        let packet = phrase_packet();

        store
            .import_sync_batch_atomically(
                &test_batch(vec![packet.clone()], "1:forwarded"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        let stored = store.packets_after(0, "", 10).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].packet.author, packet.author);
        assert_ne!(stored[0].packet.author, REMOTE_NODE);
    }

    #[test]
    fn correction_vote_requires_exact_proposal_parent_during_sync_import() {
        let store = test_store();
        let packets = correction_fixture_packets();
        store.seed_packet(&packets[0], 1).unwrap();
        store.seed_packet(&packets[1], 1).unwrap();
        store
            .import_sync_batch_atomically(
                &test_batch(vec![packets[2].clone()], "1:correction"),
                REMOTE_NODE,
                PAIRING_ID,
                IMPORTED_AT,
            )
            .unwrap();

        let mut wrong_parent = packets[5].clone();
        wrong_parent.parent = Some(packets[1].packet_id.clone());
        rehash_packet(&mut wrong_parent);
        let mut wrong_batch = test_batch(vec![wrong_parent], "2:wrong-parent");
        wrong_batch.request_cursor = "1:correction".to_owned();
        assert!(store
            .import_sync_batch_atomically(&wrong_batch, REMOTE_NODE, PAIRING_ID, IMPORTED_AT,)
            .is_err());
        assert_eq!(store.packet_count().unwrap(), 3);

        let mut missing_parent = packets[5].clone();
        missing_parent.parent = None;
        rehash_packet(&mut missing_parent);
        let mut missing_batch = test_batch(vec![missing_parent], "2:missing-parent");
        missing_batch.request_cursor = "1:correction".to_owned();
        assert!(store
            .import_sync_batch_atomically(&missing_batch, REMOTE_NODE, PAIRING_ID, IMPORTED_AT,)
            .is_err());
        assert_eq!(store.packet_count().unwrap(), 3);
    }

    fn test_store() -> Store {
        let store = Store::open_in_memory().unwrap();
        store
            .insert_identity(&DeviceIdentity {
                node_id: LOCAL_NODE.to_owned(),
                display_name: "Test desktop".to_owned(),
                created_at: 1,
                platform: "windows".to_owned(),
                role: "computer".to_owned(),
            })
            .unwrap();
        store
            .upsert_pairing(&PairingRecord {
                pairing_id: PAIRING_ID.to_owned(),
                local_node_id: LOCAL_NODE.to_owned(),
                remote_node_id: REMOTE_NODE.to_owned(),
                remote_display_name: "Remote".to_owned(),
                remote_platform: "android".to_owned(),
                remote_role: "phone".to_owned(),
                status: "approved".to_owned(),
                created_at: 1,
                paired_at: Some(1),
            })
            .unwrap();
        store
    }

    fn assert_empty_import(store: &Store) {
        assert_eq!(store.packet_count().unwrap(), 0);
        assert_eq!(
            store
                .cursor_or_start_for_pairing(REMOTE_NODE, PAIRING_ID)
                .unwrap(),
            crate::protocol::START_CURSOR
        );
    }

    fn test_batch(packets: Vec<Packet>, next_cursor: &str) -> SyncBatch {
        SyncBatch {
            protocol_version: SYNC_VERSION.to_owned(),
            session_id: SESSION_ID.to_owned(),
            source_node_id: REMOTE_NODE.to_owned(),
            target_node_id: LOCAL_NODE.to_owned(),
            pairing_id: PAIRING_ID.to_owned(),
            request_cursor: crate::protocol::START_CURSOR.to_owned(),
            next_cursor: next_cursor.to_owned(),
            has_more: false,
            packets,
        }
    }

    fn phrase_packet() -> Packet {
        Packet::from_json(include_str!(
            "../../../protocol-fixtures/phrase_observed.json"
        ))
        .unwrap()
    }

    fn meaning_proposal_packet() -> Packet {
        Packet::from_json(include_str!(
            "../../../protocol-fixtures/meaning_proposal.json"
        ))
        .unwrap()
    }

    fn correction_fixture_packets() -> Vec<Packet> {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../daovibe-android/app/src/test/resources/fixtures/mycelium_state_correction.json"
        ))
        .unwrap();
        fixture["packets"]
            .as_array()
            .unwrap()
            .iter()
            .map(Packet::from_value)
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    fn rehash_packet(packet: &mut Packet) {
        packet.payload_hash = sha256(&canonical::stringify(&packet.payload.to_value()));
        let mut hash_input = packet.to_value();
        let object = hash_input.as_object_mut().unwrap();
        object.remove("packet_id");
        object.remove("signature");
        packet.packet_id = sha256(&canonical::stringify(&hash_input));
        packet.signature = format!("dev_signature:{}:{}", packet.author, packet.packet_id);
    }

    fn packet_with_expiry(expires_at: i64) -> Packet {
        let mut packet = phrase_packet();
        packet.expires_at = Some(expires_at);
        packet.payload_hash = sha256(&canonical::stringify(&packet.payload.to_value()));

        let mut hash_input = packet.to_value();
        let object = hash_input.as_object_mut().unwrap();
        object.remove("packet_id");
        object.remove("signature");
        packet.packet_id = sha256(&canonical::stringify(&hash_input));
        packet.signature = format!("dev_signature:{}:{}", packet.author, packet.packet_id);
        packet
    }

    const LOCAL_NODE: &str = "mycelium_node_local";
    const REMOTE_NODE: &str = "mycelium_node_remote";
    const PAIRING_ID: &str = "pairing_storage_test";
    const SESSION_ID: &str = "session_0123456789abcdef0123456789abcdef";
    const IMPORTED_AT: i64 = 1_700_002_000;
}
