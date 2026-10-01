package org.daovibe.android.core.identity

data class DeviceIdentity(
    val nodeId: String,
    val displayName: String,
    val createdAt: Long,
    val identityKeyScheme: String? = null,
    val identityPublicKey: String? = null,
    val identityKeyFingerprint: String? = null,
    val identityKeyCreatedAt: Long? = null,
    val identityKeyState: String = IdentityKeyState.UNINITIALIZED,
    val secureStorageBackend: String? = null,
    val hardwareBacked: Boolean? = null
)

object IdentityKeyState {
    const val UNINITIALIZED = "uninitialized"
    const val AVAILABLE = "available"
    const val UNAVAILABLE = "unavailable"
    const val REVOKED = "revoked"
}

object PeerTrustState {
    const val LEGACY_UNVERIFIED = "legacy_unverified"
    const val PENDING_VERIFICATION = "pending_verification"
    const val TRUSTED = "trusted"
    const val KEY_CHANGED = "key_changed"
    const val REVOKED = "revoked"
}
