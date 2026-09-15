package org.daovibe.android.core.connection

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.ServerSocket
import java.nio.ByteBuffer

class ConnectionTransportTest {
    @Test
    fun frameEncodeDecodeRoundTripPreservesCanonicalJson() {
        val json = """{"message":"नमस्ते","value":42}"""

        val decoded = ConnectionMessageFraming.readFrame(
            ByteArrayInputStream(
                ConnectionMessageFraming.encodeFrame(json)
            )
        )

        assertEquals(json, decoded)
    }

    @Test
    fun partialReadsReconstructOneFullFrame() {
        val json = """{"message_type":"connection_hello","session_id":"session_test"}"""
        val input = ChunkedInputStream(
            bytes = ConnectionMessageFraming.encodeFrame(json),
            maxChunkSize = 1
        )

        assertEquals(json, ConnectionMessageFraming.readFrame(input))
    }

    @Test
    fun sequentialFramesDoNotMerge() {
        val output = ByteArrayOutputStream()
        ConnectionMessageFraming.writeFrame(output, """{"frame":1}""")
        ConnectionMessageFraming.writeFrame(output, """{"frame":2}""")

        val input = ByteArrayInputStream(output.toByteArray())

        assertEquals("""{"frame":1}""", ConnectionMessageFraming.readFrame(input))
        assertEquals("""{"frame":2}""", ConnectionMessageFraming.readFrame(input))
    }

    @Test
    fun oversizedFrameIsRejectedBeforePayloadAllocation() {
        val header = ByteBuffer.allocate(Int.SIZE_BYTES)
            .putInt(CONNECTION_MESSAGE_MAX_FRAME_BYTES + 1)
            .array()

        val error = runCatching {
            ConnectionMessageFraming.readFrame(ByteArrayInputStream(header))
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.FRAME_TOO_LARGE,
            error = error
        )
    }

    @Test
    fun negativeFrameLengthIsRejected() {
        val header = ByteBuffer.allocate(Int.SIZE_BYTES)
            .putInt(-1)
            .array()

        val error = runCatching {
            ConnectionMessageFraming.readFrame(ByteArrayInputStream(header))
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.MALFORMED_FRAME,
            error = error
        )
    }

    @Test
    fun zeroFrameLengthIsRejected() {
        val header = ByteBuffer.allocate(Int.SIZE_BYTES)
            .putInt(0)
            .array()

        val error = runCatching {
            ConnectionMessageFraming.readFrame(ByteArrayInputStream(header))
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.MALFORMED_FRAME,
            error = error
        )
    }

    @Test
    fun truncatedFrameIsRejected() {
        val frame = ByteBuffer.allocate(Int.SIZE_BYTES + 2)
            .putInt(5)
            .put(byteArrayOf('{'.code.toByte(), '}'.code.toByte()))
            .array()

        val error = runCatching {
            ConnectionMessageFraming.readFrame(ByteArrayInputStream(frame))
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.TRUNCATED_FRAME,
            error = error
        )
    }

    @Test
    fun invalidUtf8FrameIsRejected() {
        val frame = ByteBuffer.allocate(Int.SIZE_BYTES + 2)
            .putInt(2)
            .put(byteArrayOf(0xC3.toByte(), 0x28))
            .array()

        val error = runCatching {
            ConnectionMessageFraming.readFrame(ByteArrayInputStream(frame))
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.MALFORMED_FRAME,
            error = error
        )
    }

    @Test
    fun tcpClientAndListenerExchangeOneFramedMessage() = runTest {
        val listener = TcpPeerListener(
            bindHost = "127.0.0.1",
            acceptTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )
        val endpoint = listener.start(0)
        val serverJob = async(Dispatchers.IO) {
            val peer = listener.accept()
            try {
                val received = peer.receive()
                peer.send("""{"message":"response"}""")
                received
            } finally {
                peer.close()
            }
        }

        val client = TcpPeerTransport(
            connectTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )
        try {
            client.connect(endpoint)
            client.send("""{"message":"request"}""")

            assertEquals(
                """{"message":"request"}""",
                withTimeout(5_000) { serverJob.await() }
            )
            assertEquals(
                """{"message":"response"}""",
                client.receive()
            )
        } finally {
            client.close()
            listener.stop()
        }
    }

    @Test
    fun tcpCloseMakesFurtherSendFailAsConnectionClosed() = runTest {
        val server = ServerSocket(0, 1)
        val endpoint = PeerEndpoint("127.0.0.1", server.localPort)
        val client = TcpPeerTransport(
            connectTimeoutMillis = 2_000,
            readTimeoutMillis = 2_000
        )

        try {
            val acceptJob = async(Dispatchers.IO) {
                server.accept().close()
            }
            client.connect(endpoint)
            withTimeout(5_000) { acceptJob.await() }
            client.close()

            val error = runCatching {
                client.send("""{"message":"after-close"}""")
            }.exceptionOrNull()

            assertTransportFailure(
                expectedCode = PeerTransportFailureCode.CONNECTION_CLOSED,
                error = error
            )
        } finally {
            client.close()
            server.close()
        }
    }

    @Test
    fun unusedLoopbackPortIsReportedAsConnectionRefused() = runTest {
        val server = ServerSocket(0)
        val endpoint = PeerEndpoint("127.0.0.1", server.localPort)
        server.close()

        val transport = TcpPeerTransport(
            connectTimeoutMillis = 1_000,
            readTimeoutMillis = 1_000
        )
        val error = runCatching {
            transport.connect(endpoint)
        }.exceptionOrNull()

        assertTransportFailure(
            expectedCode = PeerTransportFailureCode.CONNECTION_REFUSED,
            error = error
        )
        transport.close()
    }

    private fun assertTransportFailure(
        expectedCode: PeerTransportFailureCode,
        error: Throwable?
    ) {
        assertTrue(error is PeerTransportException)
        assertEquals(expectedCode, (error as PeerTransportException).code)
    }

    private class ChunkedInputStream(
        private val bytes: ByteArray,
        private val maxChunkSize: Int
    ) : ByteArrayInputStream(bytes) {
        override fun read(
            buffer: ByteArray,
            offset: Int,
            length: Int
        ): Int {
            return super.read(
                buffer,
                offset,
                minOf(length, maxChunkSize)
            )
        }
    }
}
