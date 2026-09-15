package org.daovibe.android.core.connection

data class PeerEndpoint(
    val host: String,
    val port: Int
) {
    val normalizedHost: String
        get() = host.trim()

    fun isValid(): Boolean =
        normalizedHost.isNotEmpty() && port in 1..MAX_TCP_PORT
}

interface PeerTransport {
    suspend fun connect(endpoint: PeerEndpoint)

    suspend fun send(canonicalMessageJson: String)

    suspend fun receive(): String

    suspend fun close()
}

interface PeerListener {
    suspend fun start(port: Int = 0): PeerEndpoint

    suspend fun accept(): PeerTransport

    suspend fun stop()
}

enum class PeerTransportFailureCode(val wireValue: String) {
    INVALID_ENDPOINT("invalid_endpoint"),
    TIMEOUT("timeout"),
    CONNECTION_REFUSED("connection_refused"),
    UNREACHABLE("unreachable"),
    CONNECTION_CLOSED("connection_closed"),
    MALFORMED_FRAME("malformed_frame"),
    FRAME_TOO_LARGE("frame_too_large"),
    TRUNCATED_FRAME("truncated_frame"),
    INVALID_MESSAGE("invalid_message"),
    IO_FAILURE("io_failure")
}

data class PeerTransportFailure(
    val code: PeerTransportFailureCode,
    val message: String
)

class PeerTransportException(
    val code: PeerTransportFailureCode,
    message: String,
    cause: Throwable? = null
) : Exception(message, cause)

const val DEFAULT_CONNECT_TIMEOUT_MILLIS = 4_000
const val DEFAULT_READ_TIMEOUT_MILLIS = 8_000
const val DEFAULT_ACCEPT_TIMEOUT_MILLIS = 8_000
const val CONNECTION_MESSAGE_MAX_FRAME_BYTES = 64 * 1024
const val MAX_TCP_PORT = 65_535

internal fun PeerTransportException.toFailure(): PeerTransportFailure =
    PeerTransportFailure(
        code = code,
        message = message ?: code.wireValue
    )
