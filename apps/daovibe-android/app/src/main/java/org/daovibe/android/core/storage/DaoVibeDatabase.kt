package org.daovibe.android.core.storage

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

const val DAO_VIBE_ROOM_SCHEMA_VERSION = 7

@Database(
    entities = [
        DeviceIdentityEntity::class,
        PacketEntity::class,
        PhraseEntity::class,
        MeaningEntity::class,
        VoteEntity::class,
        SyncCursorEntity::class,
        PeerSyncStateEntity::class,
        KnownPeerEntity::class,
        PairingRecordEntity::class,
        PendingPairingOfferEntity::class
    ],
    version = DAO_VIBE_ROOM_SCHEMA_VERSION,
    exportSchema = false
)
abstract class DaoVibeDatabase : RoomDatabase() {
    abstract fun daoVibeDao(): DaoVibeDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `paired_devices` (
                        `pairing_id` TEXT NOT NULL,
                        `local_node_id` TEXT NOT NULL,
                        `remote_node_id` TEXT NOT NULL,
                        `remote_display_name` TEXT NOT NULL,
                        `remote_platform` TEXT NOT NULL,
                        `remote_role` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `created_at` INTEGER NOT NULL,
                        `paired_at` INTEGER,
                        `updated_at` INTEGER NOT NULL,
                        PRIMARY KEY(`pairing_id`)
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS " +
                        "`index_paired_devices_local_node_id` " +
                        "ON `paired_devices` (`local_node_id`)"
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS " +
                        "`index_paired_devices_local_node_id_remote_node_id` " +
                        "ON `paired_devices` (`local_node_id`, `remote_node_id`)"
                )
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `peer_sync_state` (
                        `remote_node_id` TEXT NOT NULL,
                        `pairing_id` TEXT NOT NULL,
                        `inbound_cursor` TEXT NOT NULL,
                        `updated_at` INTEGER NOT NULL,
                        PRIMARY KEY(`remote_node_id`)
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS " +
                        "`index_peer_sync_state_pairing_id` " +
                        "ON `peer_sync_state` (`pairing_id`)"
                )
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `pending_pairing_offers` (
                        `pairing_id` TEXT NOT NULL,
                        `offer_json` TEXT NOT NULL,
                        `local_node_id` TEXT NOT NULL,
                        `created_at` INTEGER NOT NULL,
                        `updated_at` INTEGER NOT NULL,
                        PRIMARY KEY(`pairing_id`)
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `known_peers` (
                        `remote_node_id` TEXT NOT NULL,
                        `display_name` TEXT,
                        `host` TEXT NOT NULL,
                        `port` INTEGER NOT NULL,
                        `pairing_id` TEXT NOT NULL,
                        `last_successful_contact_at` INTEGER,
                        `last_error` TEXT,
                        `updated_at` INTEGER NOT NULL,
                        PRIMARY KEY(`remote_node_id`)
                    )
                    """.trimIndent()
                )
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `known_peers` (
                        `remote_node_id` TEXT NOT NULL,
                        `display_name` TEXT,
                        `host` TEXT NOT NULL,
                        `port` INTEGER NOT NULL,
                        `pairing_id` TEXT NOT NULL,
                        `last_successful_contact_at` INTEGER,
                        `last_error` TEXT,
                        `updated_at` INTEGER NOT NULL,
                        PRIMARY KEY(`remote_node_id`)
                    )
                    """.trimIndent()
                )
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_failure_at INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_outcome TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_stage TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_error_category TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_attempts INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_imported_packets INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_duplicate_packets INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_exported_packets INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_sync_started_at INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_sync_finished_at INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_cursor TEXT")
            }
        }
        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_at INTEGER")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_outcome TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_stage TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_error_category TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_message TEXT")
                db.execSQL("ALTER TABLE known_peers ADD COLUMN last_diagnostic_latency_ms INTEGER")
            }
        }
    }
}
