package org.daovibe.android.core.connection

import kotlinx.coroutines.test.runTest
import org.daovibe.android.core.sync.SyncRunResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PeerSyncCoordinatorTest {
    private val session = ConnectionSession(
        sessionId = "session_0123456789abcdef0123456789abcdef",
        localNodeId = "local",
        remoteNodeId = "remote",
        pairingId = "pairing",
        state = ConnectionSessionState.CONNECTED
    )
    private fun peer(id: String) = KnownPeer(id, null, "127.0.0.1", 4242, "pairing", null, null)

    @Test fun syncOneSuccess() = runTest {
        val registry = FakeRegistry(listOf(peer("a")))
        val coordinator = PeerSyncCoordinator(registry, retryBackoffMillis = 0) {
            SyncRunResult.Completed(session, 1, 0, 1, "1:p")
        }
        assertEquals(1, coordinator.syncOne("a").attempts)
        assertEquals(listOf("a"), registry.successes)
    }

    @Test fun retryThenSuccess() = runTest {
        var calls = 0
        val registry = FakeRegistry(listOf(peer("a")))
        val coordinator = PeerSyncCoordinator(registry, retryBackoffMillis = 0) {
            if (++calls == 1) error("temporary")
            SyncRunResult.Completed(session, 0, 0, 1, "0:")
        }
        assertEquals(2, coordinator.syncOne("a").attempts)
        assertEquals(2, calls)
    }

    @Test fun retryExhaustionAndFailureIsolation() = runTest {
        val registry = FakeRegistry(listOf(peer("b"), peer("a")))
        val coordinator = PeerSyncCoordinator(registry, retryBackoffMillis = 0) {
            if (it.remoteNodeId == "a") error("offline")
            SyncRunResult.Completed(session, 0, 0, 1, "0:")
        }
        val results = coordinator.syncAll()
        assertEquals(listOf("a", "b"), results.map { it.peerNodeId })
        assertTrue(results.first().error != null)
        assertEquals(listOf("b"), registry.successes)
    }

    @Test fun syncAllZeroPeers() = runTest {
        val coordinator = PeerSyncCoordinator(FakeRegistry(emptyList()), retryBackoffMillis = 0) { error("unused") }
        assertTrue(coordinator.syncAll().isEmpty())
    }

    @Test fun healthUsesHistoricalFailureAndExactTwentyFourHourBoundary() {
        val now = 100_000L
        assertEquals(PeerHealth.NEVER_CONTACTED, derivePeerHealth(peer("a"), now))
        assertEquals(PeerHealth.ERROR, derivePeerHealth(peer("a").copy(lastFailureAt = now - 1), now))
        assertEquals(PeerHealth.HEALTHY, derivePeerHealth(peer("a").copy(lastSuccessfulContactAt = now - 86_400, lastFailureAt = now - 90_000), now))
        assertEquals(PeerHealth.STALE, derivePeerHealth(peer("a").copy(lastSuccessfulContactAt = now - 86_401), now))
        assertEquals(PeerHealth.HEALTHY, derivePeerHealth(peer("a").copy(lastSuccessfulContactAt = now - 1, lastFailureAt = now - 2), now))
    }

    @Test fun classifierUsesConcreteTransportEvidence() {
        val failure = SyncRunResult.Failed(
            session,
            PeerTransportFailure(PeerTransportFailureCode.INVALID_ENDPOINT, "bad endpoint")
        )
        val result = PeerSyncClassifier.fromSyncResult("a", failure, 1, 1, 2)
        assertEquals(PeerSyncErrorCategory.INVALID_PEER_CONFIG, result.errorCategory)
        assertEquals(PeerSyncStage.CONNECT, result.stage)
    }

    private class FakeRegistry(private val peers: List<KnownPeer>) : PeerSyncRegistry {
        val successes = mutableListOf<String>()
        override suspend fun listPeers() = peers
        override suspend fun getPeer(remoteNodeId: String) = peers.firstOrNull { it.remoteNodeId == remoteNodeId }
        override suspend fun markSuccess(remoteNodeId: String) { successes += remoteNodeId }
        override suspend fun markFailure(remoteNodeId: String, error: String) = Unit
    }
}
