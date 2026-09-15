use crate::models::{DeviceIdentity, Packet, PacketError};
use crate::protocol::{PairingApproval, PairingOffer, START_CURSOR};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("SQLite error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("packet error: {0}")]
    Packet(#[from] PacketError),
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
        self.connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS device_identity (id INTEGER PRIMARY KEY CHECK (id = 1), node_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at INTEGER NOT NULL, platform TEXT NOT NULL, role TEXT NOT NULL); CREATE TABLE IF NOT EXISTS packets (packet_id TEXT PRIMARY KEY, packet_type TEXT NOT NULL, created_at INTEGER NOT NULL, received_at INTEGER NOT NULL, packet_json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS packets_ledger_order ON packets(received_at ASC, packet_id ASC); CREATE TABLE IF NOT EXISTS paired_devices (pairing_id TEXT PRIMARY KEY, local_node_id TEXT NOT NULL, remote_node_id TEXT NOT NULL, remote_display_name TEXT NOT NULL, remote_platform TEXT NOT NULL, remote_role TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, paired_at INTEGER); CREATE UNIQUE INDEX IF NOT EXISTS paired_devices_remote_active ON paired_devices(local_node_id, remote_node_id) WHERE status = 'approved'; CREATE TABLE IF NOT EXISTS peer_sync_state (remote_node_id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL, inbound_cursor TEXT NOT NULL DEFAULT '0:', updated_at INTEGER NOT NULL);")?;
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
    use crate::models::{PacketPayload, PacketType};
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
}
