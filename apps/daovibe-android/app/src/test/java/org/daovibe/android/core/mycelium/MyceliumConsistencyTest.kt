package org.daovibe.android.core.mycelium

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.KnownPeerEntity
import org.daovibe.android.core.storage.PeerSyncStateEntity
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MyceliumConsistencyTest {
    private lateinit var database: DaoVibeDatabase
    private lateinit var repository: LocalMyceliumRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
        repository = LocalMyceliumRepository(database, nowSeconds = { CHECKED_AT })
    }

    @After
    fun tearDown() = database.close()

    @Test
    fun healthyCheckIsReadOnlyAndFreshReplayMatches() = runTest {
        repository.ensureDeviceIdentity()
        repository.observePhrase("read only consistency")
        val beforeLedger = repository.exportLedgerJson()
        val beforeIdentity = database.daoVibeDao().getDeviceIdentity()
        database.daoVibeDao().upsertPeerSyncState(
            PeerSyncStateEntity("remote", "pair", "4:cursor", CHECKED_AT)
        )
        database.daoVibeDao().upsertKnownPeer(
            KnownPeerEntity(
                remoteNodeId = "remote",
                displayName = "Remote",
                host = "127.0.0.1",
                port = 4242,
                pairingId = "pair",
                lastSuccessfulContactAt = 11,
                lastError = "old failure",
                updatedAt = 12,
                lastFailureAt = 13,
                lastOutcome = "failed",
                lastStage = "accept",
                lastErrorCategory = "timeout",
                lastAttempts = 2,
                lastImportedPackets = 3,
                lastDuplicatePackets = 4,
                lastExportedPackets = 5,
                lastSyncStartedAt = 6,
                lastSyncFinishedAt = 7,
                lastCursor = "7:cursor",
                lastDiagnosticAt = 8,
                lastDiagnosticOutcome = "failed",
                lastDiagnosticStage = "hello",
                lastDiagnosticErrorCategory = "refused",
                lastDiagnosticMessage = "diagnostic message",
                lastDiagnosticLatencyMs = 9
            )
        )
        val stableCursors = database.daoVibeDao().listPeerSyncStates()
        val stablePeers = database.daoVibeDao().listKnownPeers()
        val stableLedger = repository.diagnosticPackets()
        val beforeFingerprint = MyceliumStateDiagnostic.snapshot(
            ApplicationProvider.getApplicationContext(), stableLedger
        ).fingerprint()

        val (consistency, readiness) = MyceliumConsistencyChecker.check(
            repository,
            ApplicationProvider.getApplicationContext(),
            CHECKED_AT
        )

        assertEquals(MyceliumConsistencyStatus.HEALTHY, consistency.status)
        assertEquals("ready_for_local_alpha", readiness.status)
        assertTrue(readiness.exportImportRoundtripTested)
        assertTrue(consistency.canonicalFingerprint?.isNotBlank() == true)
        assertTrue("resident_vs_fresh_replay" in consistency.checksPerformed)
        assertEquals(beforeLedger, repository.exportLedgerJson())
        assertEquals(beforeIdentity, database.daoVibeDao().getDeviceIdentity())
        assertEquals(stableCursors, database.daoVibeDao().listPeerSyncStates())
        assertEquals(stablePeers, database.daoVibeDao().listKnownPeers())
        assertEquals(beforeFingerprint, consistency.canonicalFingerprint)
        assertEquals(stableLedger.map { it.packetId }, repository.diagnosticPackets().map { it.packetId })
        assertEquals(stableLedger.map { it.author }, repository.diagnosticPackets().map { it.author })
        assertEquals(
            stableLedger.map { PacketJsonCodec.encode(PacketJsonCodec.decode(it.packetJson)) },
            repository.diagnosticPackets().map { PacketJsonCodec.encode(PacketJsonCodec.decode(it.packetJson)) }
        )
        assertTrue(readiness.databaseOpen)
        assertEquals("current_schema_open", readiness.migrationChainOk)
        assertEquals("test_suite_verified", readiness.semanticFixtureCompatibility)
        assertEquals("test_suite_verified", readiness.inviteFixtureCompatibility)
        assertEquals("identity_present_in_persistent_row", readiness.identityPersistent)
    }

    @Test
    fun copiedReadinessDiagnosticsContainNoPacketPayloadsOrSecrets() = runTest {
        repository.ensureDeviceIdentity()
        repository.observePhrase("private payload marker")
        val (_, readiness) = MyceliumConsistencyChecker.check(
            repository,
            ApplicationProvider.getApplicationContext(),
            CHECKED_AT
        )

        val diagnostics = readiness.diagnosticsText()
        assertFalse(diagnostics.contains("private payload marker"))
        assertFalse(diagnostics.contains("payload"))
        assertFalse(diagnostics.contains("secret"))
    }

    @Test
    fun failureDiagnosticsUseOnlyBoundedStableIssueCode() {
        val report = MyceliumAlphaReadinessReport(
            status = "failed",
            nodeIdPresent = false,
            databaseOpen = true,
            migrationChainOk = "current_schema_open",
            ledgerConsistency = MyceliumConsistencyStatus.FAILED,
            replayConsistency = MyceliumConsistencyStatus.FAILED,
            canonicalFingerprint = null,
            packetCount = 0,
            peerCount = 0,
            identityPersistent = "missing",
            exportImportRoundtripTested = false,
            semanticFixtureCompatibility = "test_suite_verified",
            inviteFixtureCompatibility = "test_suite_verified",
            warnings = safeReadinessWarnings(
                IllegalStateException("SECRET_PAYLOAD /private/path/db.sqlite SQL internals")
            ),
            checkedAt = CHECKED_AT
        )
        val diagnostics = report.diagnosticsText()
        assertEquals(listOf("unknown"), report.warnings)
        assertFalse(diagnostics.contains("SECRET_PAYLOAD"))
        assertFalse(diagnostics.contains("/private/path"))
        assertFalse(diagnostics.contains("SQL internals"))
    }

    private companion object {
        const val CHECKED_AT = 1_700_000_100L
    }
}
