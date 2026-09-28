package org.daovibe.android.core.storage

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.estimatePacketSize
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DaoVibeMigrationTest {
    private lateinit var databaseFile: File

    @Before
    fun setUp() {
        databaseFile = File(
            ApplicationProvider.getApplicationContext<android.content.Context>().cacheDir,
            "daovibe-room-migration.db"
        )
        databaseFile.delete()
    }

    @After
    fun tearDown() {
        databaseFile.delete()
    }

    @Test
    fun migrationToPairingStoragePreservesIdentityAndPacketLedger() = runTest {
        val packet = PacketFactory { 1_700_000_000L }.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "migration_zone",
            author = "migration_node",
            payload = PhraseObservedPayload(
                phraseId = "migration_phrase",
                surfaceText = "Migration phrase",
                languageHint = "en",
                inputType = InputType.TEXT
            ),
            createdAt = 1_700_000_000L
        )
        val packetSize = estimatePacketSize(packet)

        createVersionOneDatabase(packet, packetSize)

        val migrated = Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java,
            databaseFile.absolutePath
        )
            .addMigrations(DaoVibeDatabase.MIGRATION_1_2)
            .addMigrations(DaoVibeDatabase.MIGRATION_2_3)
            .addMigrations(DaoVibeDatabase.MIGRATION_3_4)
            .addMigrations(DaoVibeDatabase.MIGRATION_4_5)
            .addMigrations(DaoVibeDatabase.MIGRATION_5_6)
            .allowMainThreadQueries()
            .build()

        try {
            val dao = migrated.daoVibeDao()
            val identity = dao.getDeviceIdentity()
            val storedPacket = dao.listPacketsInLedgerOrder().single()

            assertEquals("mycelium_node_legacy", identity?.nodeId)
            assertEquals("Legacy Device", identity?.displayName)
            assertEquals(packet.packetId, storedPacket.packetId)
            assertEquals(packet.author, storedPacket.author)
            assertEquals(packet.packetJson(), storedPacket.packetJson)
            assertEquals(emptyList<PairingRecordEntity>(), dao.listPairingRecords())
            assertEquals(emptyList<KnownPeerEntity>(), dao.listKnownPeers())
        } finally {
            migrated.close()
        }
    }

    private fun createVersionOneDatabase(
        packet: org.daovibe.android.core.protocol.LmpPacket<
            org.daovibe.android.core.protocol.PacketPayload
        >,
        packetSize: org.daovibe.android.core.protocol.PacketSizeEstimate
    ) {
        val legacy = SQLiteDatabase.openOrCreateDatabase(databaseFile, null)
        try {
            legacy.execSQL(
                """
                CREATE TABLE `device_identity` (
                    `id` INTEGER NOT NULL,
                    `node_id` TEXT NOT NULL,
                    `display_name` TEXT NOT NULL,
                    `created_at` INTEGER NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                """
                CREATE TABLE `packets` (
                    `packet_id` TEXT NOT NULL,
                    `packet_type` TEXT NOT NULL,
                    `zone` TEXT NOT NULL,
                    `author` TEXT NOT NULL,
                    `parent` TEXT,
                    `phrase_id` TEXT,
                    `meaning_id` TEXT,
                    `payload_hash` TEXT NOT NULL,
                    `payload_json` TEXT NOT NULL,
                    `packet_json` TEXT NOT NULL,
                    `packet_size_bytes` INTEGER NOT NULL,
                    `packet_size_class` TEXT NOT NULL,
                    `size_recommendation` TEXT NOT NULL,
                    `created_at` INTEGER NOT NULL,
                    `received_at` INTEGER NOT NULL,
                    PRIMARY KEY(`packet_id`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                """
                CREATE TABLE `phrases` (
                    `phrase_id` TEXT NOT NULL,
                    `surface_text` TEXT,
                    `phonetic_hint` TEXT,
                    `language_hint` TEXT,
                    `safety_label` TEXT NOT NULL,
                    `updated_at` INTEGER NOT NULL,
                    PRIMARY KEY(`phrase_id`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                """
                CREATE TABLE `meanings` (
                    `meaning_id` TEXT NOT NULL,
                    `phrase_id` TEXT NOT NULL,
                    `reference_meaning` TEXT NOT NULL,
                    `context` TEXT,
                    `confidence` REAL NOT NULL,
                    `confirms` REAL NOT NULL,
                    `rejects` REAL NOT NULL,
                    `updated_at` INTEGER NOT NULL,
                    PRIMARY KEY(`meaning_id`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                """
                CREATE TABLE `votes` (
                    `vote_packet_id` TEXT NOT NULL,
                    `phrase_id` TEXT NOT NULL,
                    `meaning_id` TEXT NOT NULL,
                    `vote` TEXT NOT NULL,
                    `confidence` REAL NOT NULL,
                    `author` TEXT NOT NULL,
                    `created_at` INTEGER NOT NULL,
                    PRIMARY KEY(`vote_packet_id`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                """
                CREATE TABLE `peer_sync_cursors` (
                    `peer_author` TEXT NOT NULL,
                    `cursor` TEXT NOT NULL,
                    `updated_at` INTEGER NOT NULL,
                    PRIMARY KEY(`peer_author`)
                )
                """.trimIndent()
            )
            legacy.execSQL(
                "CREATE INDEX `index_packets_phrase_id` ON `packets` (`phrase_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_packets_meaning_id` ON `packets` (`meaning_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_packets_packet_type` ON `packets` (`packet_type`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_packets_zone` ON `packets` (`zone`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_packets_received_at_packet_id` " +
                    "ON `packets` (`received_at`, `packet_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_meanings_phrase_id` ON `meanings` (`phrase_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_votes_phrase_id` ON `votes` (`phrase_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_votes_meaning_id` ON `votes` (`meaning_id`)"
            )
            legacy.execSQL(
                "CREATE INDEX `index_votes_author` ON `votes` (`author`)"
            )

            legacy.insertOrThrow(
                "device_identity",
                null,
                ContentValues().apply {
                    put("id", 1)
                    put("node_id", "mycelium_node_legacy")
                    put("display_name", "Legacy Device")
                    put("created_at", 1_600_000_000L)
                }
            )
            legacy.insertOrThrow(
                "packets",
                null,
                ContentValues().apply {
                    put("packet_id", packet.packetId)
                    put("packet_type", packet.packetType.wireValue)
                    put("zone", packet.zone)
                    put("author", packet.author)
                    putNull("parent")
                    put("phrase_id", "migration_phrase")
                    putNull("meaning_id")
                    put("payload_hash", packet.payloadHash)
                    put("payload_json", StableJson.stringify(packet.payload.toStableMap()))
                    put("packet_json", packet.packetJson())
                    put("packet_size_bytes", packetSize.bytes)
                    put("packet_size_class", packetSize.sizeClass.wireValue)
                    put("size_recommendation", packetSize.recommendation)
                    put("created_at", packet.createdAt)
                    put("received_at", 1_700_000_100L)
                }
            )
            legacy.version = 1
        } finally {
            legacy.close()
        }
    }
}

private fun org.daovibe.android.core.protocol.LmpPacket<
    org.daovibe.android.core.protocol.PacketPayload
>.packetJson(): String =
    org.daovibe.android.core.protocol.PacketJsonCodec.encode(this)
