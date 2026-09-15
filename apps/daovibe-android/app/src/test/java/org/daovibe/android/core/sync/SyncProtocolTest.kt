package org.daovibe.android.core.sync

import org.daovibe.android.core.connection.ConnectionSession
import org.daovibe.android.core.connection.ConnectionSessionState
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class SyncProtocolTest {
    @Test
    fun requestAndBatchRoundTripUseCanonicalJson() {
        val request = SyncRequest(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = LOCAL_NODE,
            targetNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            cursor = START_SYNC_CURSOR,
            limit = 100
        )
        val requestJson = SyncJsonCodec.encode(request)
        val decodedRequest = SyncJsonCodec.decodeRequest(requestJson)

        assertEquals(request, decodedRequest)
        assertEquals(requestJson, SyncJsonCodec.encode(decodedRequest))

        val packet = phrasePacket("protocol")
        val batch = SyncProtocol.createBatch(
            request = request,
            packets = listOf(packet),
            nextCursor = SyncProtocol.cursorFor(10L, packet.packetId),
            hasMore = false
        )
        val batchJson = SyncJsonCodec.encode(batch)
        val decodedBatch = SyncJsonCodec.decodeBatch(batchJson)

        assertEquals(batch, decodedBatch)
        assertEquals(batchJson, SyncJsonCodec.encode(decodedBatch))
    }

    @Test
    fun requestLimitAboveMaximumIsAcceptedForResponderClamping() {
        val request = SyncRequest(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = LOCAL_NODE,
            targetNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            cursor = START_SYNC_CURSOR,
            limit = MAX_PACKETS_PER_SYNC_BATCH + 25
        )

        SyncProtocol.validateRequest(request)

        assertEquals(
            MAX_PACKETS_PER_SYNC_BATCH,
            SyncProtocol.clampLimit(request.limit)
        )
    }

    @Test
    fun malformedCursorIsRejected() {
        val error = runCatching {
            SyncProtocol.decodeCursor("not-a-cursor")
        }.exceptionOrNull()

        assertTrue(error is SyncProtocolException)
        assertEquals(
            SyncRejectReason.INVALID_CURSOR,
            (error as SyncProtocolException).reason
        )
    }

    @Test
    fun oversizedBatchIsRejectedByCanonicalByteLimit() {
        val packet = phrasePacket("x".repeat(70_000))
        val batch = SyncBatch(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = REMOTE_NODE,
            targetNodeId = LOCAL_NODE,
            pairingId = PAIRING_ID,
            requestCursor = START_SYNC_CURSOR,
            nextCursor = SyncProtocol.cursorFor(10L, packet.packetId),
            hasMore = false,
            packets = listOf(packet)
        )

        val error = runCatching {
            SyncProtocol.validateBatch(batch)
        }.exceptionOrNull()

        assertTrue(error is SyncProtocolException)
        assertEquals(
            SyncRejectReason.BATCH_TOO_LARGE,
            (error as SyncProtocolException).reason
        )
    }

    @Test
    fun stalledBatchIsRejectedWhenMoreDataIsAdvertised() {
        val batch = SyncBatch(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = SESSION_ID,
            sourceNodeId = REMOTE_NODE,
            targetNodeId = LOCAL_NODE,
            pairingId = PAIRING_ID,
            requestCursor = START_SYNC_CURSOR,
            nextCursor = START_SYNC_CURSOR,
            hasMore = true,
            packets = emptyList()
        )

        val error = runCatching {
            SyncProtocol.validateBatch(batch)
        }.exceptionOrNull()

        assertTrue(error is SyncProtocolException)
        assertEquals(
            SyncRejectReason.CURSOR_STALLED,
            (error as SyncProtocolException).reason
        )
    }

    @Test
    fun wrongSessionAndDirectionAreRejectedAfterHandshake() {
        val session = connectedSession()
        val wrongSessionRequest = SyncRequest(
            protocolVersion = SYNC_PROTOCOL_VERSION,
            sessionId = "session_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sourceNodeId = LOCAL_NODE,
            targetNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            cursor = START_SYNC_CURSOR,
            limit = 1
        )
        val sessionError = runCatching {
            SyncProtocol.validateRequestForClient(
                request = wrongSessionRequest,
                session = session
            )
        }.exceptionOrNull()

        assertTrue(sessionError is SyncProtocolException)
        assertEquals(
            SyncRejectReason.SESSION_MISMATCH,
            (sessionError as SyncProtocolException).reason
        )

        val wrongDirectionRequest = wrongSessionRequest.copy(
            sessionId = SESSION_ID,
            sourceNodeId = REMOTE_NODE,
            targetNodeId = LOCAL_NODE
        )
        val directionError = runCatching {
            SyncProtocol.validateRequestForClient(
                request = wrongDirectionRequest,
                session = session
            )
        }.exceptionOrNull()

        assertTrue(directionError is SyncProtocolException)
        assertEquals(
            SyncRejectReason.NODE_ID_MISMATCH,
            (directionError as SyncProtocolException).reason
        )
    }

    private fun connectedSession(): ConnectionSession =
        ConnectionSession(
            sessionId = SESSION_ID,
            localNodeId = LOCAL_NODE,
            remoteNodeId = REMOTE_NODE,
            pairingId = PAIRING_ID,
            state = ConnectionSessionState.CONNECTED
        )

    private fun phrasePacket(surfaceText: String) =
        PacketFactory { 1_700_000_001L }.create(
            packetType = PacketType.PHRASE_OBSERVED,
            zone = "sync_protocol_test",
            author = REMOTE_NODE,
            payload = PhraseObservedPayload(
                phraseId = "phrase_${surfaceText.hashCode()}",
                surfaceText = surfaceText,
                languageHint = "en",
                inputType = InputType.TEXT
            ),
            createdAt = 1_700_000_001L
        )

    private companion object {
        const val LOCAL_NODE = "mycelium_node_local"
        const val REMOTE_NODE = "mycelium_node_remote"
        const val PAIRING_ID = "pairing_sync_protocol"
        const val SESSION_ID = "session_0123456789abcdef0123456789abcdef"
    }
}
