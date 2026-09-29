package org.daovibe.android.ui

import org.daovibe.android.core.storage.KnownPeerEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SupportDiagnosticsTest {
    @Test
    fun copyDiagnosticsIncludesBothSummariesAndExcludesPayloadsAndSecrets() {
        val text = peerDiagnosticsText(
            KnownPeerEntity(
                remoteNodeId = "remote-node",
                displayName = "Remote",
                host = "127.0.0.1",
                port = 4242,
                pairingId = "pairing-secret",
                lastSuccessfulContactAt = 10,
                lastError = "packet payload secret",
                updatedAt = 11,
                lastOutcome = "success",
                lastStage = "complete",
                lastErrorCategory = "none",
                lastAttempts = 2,
                lastImportedPackets = 3,
                lastDuplicatePackets = 4,
                lastExportedPackets = 5,
                lastSyncStartedAt = 6,
                lastSyncFinishedAt = 7,
                lastCursor = "7:cursor",
                lastDiagnosticAt = 12,
                lastDiagnosticOutcome = "failed",
                lastDiagnosticStage = "accept",
                lastDiagnosticErrorCategory = "pairing_mismatch",
                lastDiagnosticMessage = "diagnostic secret"
            ),
            localNodeId = "local-node"
        )

        assertTrue(text.contains("local_node_id=local-node"))
        assertTrue(text.contains("remote_node_id=remote-node"))
        assertTrue(text.contains("last_outcome=success"))
        assertTrue(text.contains("diagnose_outcome=failed"))
        assertTrue(text.contains("diagnose_error_category=pairing_mismatch"))
        assertFalse(text.contains("pairing-secret"))
        assertFalse(text.contains("packet payload secret"))
        assertFalse(text.contains("diagnostic secret"))
    }
}
