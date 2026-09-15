package org.daovibe.android.core.connection

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InterruptedIOException
import java.io.InputStream
import java.io.OutputStream
import java.net.ConnectException
import java.net.InetSocketAddress
import java.net.NoRouteToHostException
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

/**
 * Conservative length-prefixed framing for connection and sync JSON.
 *
 * A transport carries one foreground handshake followed by bounded sync
 * request/response windows. It is not encrypted.
 */
object ConnectionMessageFraming {
    fun encodeFrame(canonicalMessageJson: String): ByteArray {
        val payload = canonicalMessageJson.toByteArray(StandardCharsets.UTF_8)
        validateFrameLength(payload.size)

        return ByteBuffer.allocate(Int.SIZE_BYTES + payload.size)
            .putInt(payload.size)
            .put(payload)
            .array()
    }

    fun writeFrame(
        output: OutputStream,
        canonicalMessageJson: String
    ) {
        val data = DataOutputStream(output)
        data.write(encodeFrame(canonicalMessageJson))
        data.flush()
    }

    fun readFrame(input: InputStream): String {
        val data = DataInputStream(input)
        val frameLength = try {
            data.readInt()
        } catch (error: EOFException) {
            throw PeerTransportException(
                PeerTransportFailureCode.CONNECTION_CLOSED,
                "Connection closed before a frame length was received.",
                error
            )
        } catch (error: IOException) {
            throw mapIoFailure("read frame length", error)
        }

        validateFrameLength(frameLength)

        val payload = ByteArray(frameLength)
        try {
            data.readFully(payload)
        } catch (error: EOFException) {
            throw PeerTransportException(
                PeerTransportFailureCode.TRUNCATED_FRAME,
                "Connection closed before the complete frame was received.",
                error
            )
        } catch (error: IOException) {
            throw mapIoFailure("read frame payload", error)
        }

        return decodeUtf8(payload)
    }

    private fun validateFrameLength(frameLength: Int) {
        if (frameLength <= 0) {
            throw PeerTransportException(
                PeerTransportFailureCode.MALFORMED_FRAME,
                "Connection frame length must be positive."
            )
        }
        if (frameLength > CONNECTION_MESSAGE_MAX_FRAME_BYTES) {
            throw PeerTransportException(
                PeerTransportFailureCode.FRAME_TOO_LARGE,
                "Connection frame exceeds the ${CONNECTION_MESSAGE_MAX_FRAME_BYTES} byte limit."
            )
        }
    }

    private fun decodeUtf8(payload: ByteArray): String =
        try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(payload))
                .toString()
        } catch (error: CharacterCodingException) {
            throw PeerTransportException(
                PeerTransportFailureCode.MALFORMED_FRAME,
                "Connection frame is not valid UTF-8.",
                error
            )
        }
}

class TcpPeerTransport(
    private val connectTimeoutMillis: Int = DEFAULT_CONNECT_TIMEOUT_MILLIS,
    private val readTimeoutMillis: Int = DEFAULT_READ_TIMEOUT_MILLIS,
    acceptedSocket: Socket? = null
) : PeerTransport {
    private var socket: Socket? = null
    private var input: InputStream? = null
    private var output: OutputStream? = null

    init {
        acceptedSocket?.let { attachConnectedSocket(it) }
    }

    override suspend fun connect(endpoint: PeerEndpoint) {
        withContext(Dispatchers.IO) {
            if (!endpoint.isValid()) {
                throw PeerTransportException(
                    PeerTransportFailureCode.INVALID_ENDPOINT,
                    "Host must be non-empty and port must be between 1 and $MAX_TCP_PORT."
                )
            }

            closeSocket()

            val newSocket = Socket()
            try {
                newSocket.tcpNoDelay = true
                newSocket.soTimeout = readTimeoutMillis
                newSocket.connect(
                    InetSocketAddress(endpoint.normalizedHost, endpoint.port),
                    connectTimeoutMillis
                )
                attachConnectedSocket(newSocket)
            } catch (error: CancellationException) {
                runCatching { newSocket.close() }
                throw error
            } catch (error: Exception) {
                runCatching { newSocket.close() }
                throw mapIoFailure("connect", error)
            }
        }
    }

    override suspend fun send(canonicalMessageJson: String) {
        withContext(Dispatchers.IO) {
            val currentOutput = output
                ?: throw PeerTransportException(
                    PeerTransportFailureCode.CONNECTION_CLOSED,
                    "Connection is not open."
                )

            try {
                ConnectionMessageFraming.writeFrame(
                    output = currentOutput,
                    canonicalMessageJson = canonicalMessageJson
                )
            } catch (error: PeerTransportException) {
                throw error
            } catch (error: IOException) {
                throw mapIoFailure("send frame", error)
            }
        }
    }

    override suspend fun receive(): String =
        withContext(Dispatchers.IO) {
            val currentInput = input
                ?: throw PeerTransportException(
                    PeerTransportFailureCode.CONNECTION_CLOSED,
                    "Connection is not open."
                )

            try {
                ConnectionMessageFraming.readFrame(currentInput)
            } catch (error: PeerTransportException) {
                throw error
            } catch (error: IOException) {
                throw mapIoFailure("receive frame", error)
            }
        }

    override suspend fun close() {
        withContext(Dispatchers.IO) {
            closeSocket()
        }
    }

    private fun attachConnectedSocket(connectedSocket: Socket) {
        try {
            connectedSocket.tcpNoDelay = true
            connectedSocket.soTimeout = readTimeoutMillis
            socket = connectedSocket
            input = BufferedInputStream(connectedSocket.getInputStream())
            output = BufferedOutputStream(connectedSocket.getOutputStream())
        } catch (error: IOException) {
            runCatching { connectedSocket.close() }
            throw PeerTransportException(
                PeerTransportFailureCode.IO_FAILURE,
                "Could not open the peer connection streams.",
                error
            )
        }
    }

    private fun closeSocket() {
        val currentSocket = socket
        socket = null
        input = null
        output = null
        runCatching { currentSocket?.close() }
    }

    companion object {
        internal fun fromAcceptedSocket(
            socket: Socket,
            readTimeoutMillis: Int = DEFAULT_READ_TIMEOUT_MILLIS
        ): TcpPeerTransport =
            TcpPeerTransport(
                readTimeoutMillis = readTimeoutMillis,
                acceptedSocket = socket
            )
    }
}

class TcpPeerListener(
    private val bindHost: String = "0.0.0.0",
    private val acceptTimeoutMillis: Int = DEFAULT_ACCEPT_TIMEOUT_MILLIS,
    private val readTimeoutMillis: Int = DEFAULT_READ_TIMEOUT_MILLIS
) : PeerListener {
    private var serverSocket: ServerSocket? = null

    override suspend fun start(port: Int): PeerEndpoint =
        withContext(Dispatchers.IO) {
            if (port !in 0..MAX_TCP_PORT) {
                throw PeerTransportException(
                    PeerTransportFailureCode.INVALID_ENDPOINT,
                    "Listener port must be between 0 and $MAX_TCP_PORT."
                )
            }

            stopServerSocket()
            val server = ServerSocket()
            try {
                server.reuseAddress = true
                server.soTimeout = acceptTimeoutMillis
                server.bind(InetSocketAddress(bindHost, port))
                serverSocket = server
                PeerEndpoint(bindHost, server.localPort)
            } catch (error: CancellationException) {
                runCatching { server.close() }
                throw error
            } catch (error: Exception) {
                runCatching { server.close() }
                throw mapIoFailure("start listener", error)
            }
        }

    override suspend fun accept(): PeerTransport =
        withContext(Dispatchers.IO) {
            val currentServer = serverSocket
                ?: throw PeerTransportException(
                    PeerTransportFailureCode.CONNECTION_CLOSED,
                    "Listener is not running."
                )

            try {
                TcpPeerTransport.fromAcceptedSocket(
                    socket = currentServer.accept(),
                    readTimeoutMillis = readTimeoutMillis
                )
            } catch (error: PeerTransportException) {
                throw error
            } catch (error: IOException) {
                throw mapIoFailure("accept connection", error)
            }
        }

    override suspend fun stop() {
        withContext(Dispatchers.IO) {
            stopServerSocket()
        }
    }

    private fun stopServerSocket() {
        val currentServer = serverSocket
        serverSocket = null
        runCatching { currentServer?.close() }
    }
}

private fun mapIoFailure(
    operation: String,
    error: Throwable
): PeerTransportException {
    if (error is PeerTransportException) return error

    val code = when (error) {
        is SocketTimeoutException,
        is InterruptedIOException -> PeerTransportFailureCode.TIMEOUT
        is ConnectException -> PeerTransportFailureCode.CONNECTION_REFUSED
        is NoRouteToHostException,
        is UnknownHostException -> PeerTransportFailureCode.UNREACHABLE
        is EOFException -> PeerTransportFailureCode.CONNECTION_CLOSED
        is SocketException -> {
            if (error.message?.contains("closed", ignoreCase = true) == true) {
                PeerTransportFailureCode.CONNECTION_CLOSED
            } else {
                PeerTransportFailureCode.IO_FAILURE
            }
        }
        else -> PeerTransportFailureCode.IO_FAILURE
    }

    val message = when (code) {
        PeerTransportFailureCode.TIMEOUT ->
            "Peer $operation timed out."
        PeerTransportFailureCode.CONNECTION_REFUSED ->
            "Peer endpoint refused the connection."
        PeerTransportFailureCode.UNREACHABLE ->
            "Peer endpoint is unreachable. Check host, port, firewall, or NAT reachability."
        PeerTransportFailureCode.CONNECTION_CLOSED ->
            "Peer connection closed during $operation."
        else ->
            "Peer transport failed during $operation."
    }

    return PeerTransportException(code, message, error)
}
