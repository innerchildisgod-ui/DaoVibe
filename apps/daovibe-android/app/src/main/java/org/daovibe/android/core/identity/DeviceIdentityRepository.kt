package org.daovibe.android.core.identity

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.daovibe.android.core.storage.DaoVibeDao
import org.daovibe.android.core.storage.DeviceIdentityEntity
import java.util.UUID

class DeviceIdentityRepository(
    private val dao: DaoVibeDao,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val secretStorage: IdentitySecretStorage = UnavailableIdentitySecretStorage()
) {
    private val identityMutex = Mutex()
    fun observeIdentity(): Flow<DeviceIdentity?> =
        dao.observeDeviceIdentity().map { entity -> entity?.toDeviceIdentity() }

    suspend fun getOrCreate(): DeviceIdentity {
        val existing = dao.getDeviceIdentity()
        if (existing != null) return existing.toDeviceIdentity()

        val createdAt = nowSeconds()
        val identity = DeviceIdentityEntity(
            id = DEVICE_IDENTITY_ROW_ID,
            nodeId = createNodeId(),
            displayName = "My DAOVibe Device",
            createdAt = createdAt
        )

        dao.insertDeviceIdentity(identity)
        return dao.getDeviceIdentity()?.toDeviceIdentity()
            ?: error("Failed to create DeviceIdentity")
    }

    suspend fun updateDisplayName(displayName: String): DeviceIdentity {
        val trimmed = displayName.trim()
        require(trimmed.isNotEmpty()) { "displayName must be a non-empty string" }

        getOrCreate()
        dao.updateDeviceDisplayName(trimmed)
        return dao.getDeviceIdentity()?.toDeviceIdentity()
            ?: error("Failed to update DeviceIdentity")
    }

    /** Initializes exactly one key binding, or reports unavailable without replacement. */
    suspend fun ensureIdentityKey(): DeviceIdentity = identityMutex.withLock {
        ensureIdentityKeyLocked()
    }

    private suspend fun ensureIdentityKeyLocked(): DeviceIdentity {
        val identity = getOrCreate()
        val row = dao.getDeviceIdentity() ?: error("identity is missing")
        val state = row.identityKeyState ?: IdentityKeyState.UNINITIALIZED
        if (state == IdentityKeyState.REVOKED) return row.toDeviceIdentity()
        val hasBinding = row.identityKeyScheme != null || row.identityPublicKey != null ||
            row.identityKeyFingerprint != null || row.identityKeyCreatedAt != null
        if (state == IdentityKeyState.UNINITIALIZED && !hasBinding) {
            try {
                // Recover a secure-first write if the DB update was interrupted.
                val recovered = secretStorage.load(identity.nodeId)
                if (recovered != null) {
                    val publicKey = deriveIdentityPublicKey(recovered)
                    val encoded = encodeIdentityPublicKey(publicKey)
                    dao.updateIdentityCrypto(
                        IDENTITY_KEY_SCHEME,
                        encoded,
                        identityFingerprint(publicKey),
                        nowSeconds(),
                        IdentityKeyState.AVAILABLE,
                        secretStorage.backend,
                        secretStorage.hardwareBacked
                    )
                    return dao.getDeviceIdentity()?.toDeviceIdentity() ?: error("identity metadata missing")
                }
                val seed = newIdentitySeed()
                val publicKey = deriveIdentityPublicKey(seed)
                val encoded = encodeIdentityPublicKey(publicKey)
                val fingerprint = identityFingerprint(publicKey)
                secretStorage.store(identity.nodeId, seed)
                dao.updateIdentityCrypto(
                    IDENTITY_KEY_SCHEME,
                    encoded,
                    fingerprint,
                    nowSeconds(),
                    IdentityKeyState.AVAILABLE,
                    secretStorage.backend,
                    secretStorage.hardwareBacked
                )
                return dao.getDeviceIdentity()?.toDeviceIdentity() ?: error("identity metadata missing")
            } catch (_: Exception) {
                // An interrupted/corrupt first run is terminal until repaired explicitly.
                dao.updateIdentityCrypto(
                    row.identityKeyScheme,
                    row.identityPublicKey,
                    row.identityKeyFingerprint,
                    row.identityKeyCreatedAt,
                    IdentityKeyState.UNAVAILABLE,
                    secretStorage.backend,
                    secretStorage.hardwareBacked
                )
                return dao.getDeviceIdentity()?.toDeviceIdentity() ?: error("identity metadata missing")
            }
        }
        if (state == IdentityKeyState.UNINITIALIZED) {
            dao.updateIdentityCrypto(
                row.identityKeyScheme,
                row.identityPublicKey,
                row.identityKeyFingerprint,
                row.identityKeyCreatedAt,
                IdentityKeyState.UNAVAILABLE,
                row.identitySecureStorageBackend ?: secretStorage.backend,
                row.identityHardwareBacked
            )
            return dao.getDeviceIdentity()?.toDeviceIdentity() ?: error("identity metadata missing")
        }
        try {
            require(row.identityKeyScheme == IDENTITY_KEY_SCHEME)
            val storedPublicKey = row.identityPublicKey
                ?: throw IdentityStorageException("identity public key unavailable")
            val publicKey = decodeIdentityPublicKey(storedPublicKey)
            require(identityFingerprint(publicKey) == row.identityKeyFingerprint)
            val seed = secretStorage.load(identity.nodeId)
                ?: throw IdentityStorageException("identity secure storage unavailable")
            require(deriveIdentityPublicKey(seed).contentEquals(publicKey))
            if (state != IdentityKeyState.AVAILABLE) {
                dao.updateIdentityCrypto(row.identityKeyScheme, row.identityPublicKey, row.identityKeyFingerprint,
                    row.identityKeyCreatedAt, IdentityKeyState.AVAILABLE, row.identitySecureStorageBackend,
                    row.identityHardwareBacked)
            }
        } catch (_: Exception) {
            dao.updateIdentityCrypto(row.identityKeyScheme, row.identityPublicKey, row.identityKeyFingerprint,
                row.identityKeyCreatedAt, IdentityKeyState.UNAVAILABLE, row.identitySecureStorageBackend,
                row.identityHardwareBacked)
        }
        return dao.getDeviceIdentity()?.toDeviceIdentity() ?: error("identity metadata missing")
    }

    suspend fun getIdentityKeyStatus(): DeviceIdentity = dao.getDeviceIdentity()?.toDeviceIdentity()
        ?: getOrCreate()

    private fun createNodeId(): String =
        "mycelium_node_${UUID.randomUUID().toString().replace("-", "").take(16)}"

    companion object {
        const val DEVICE_IDENTITY_ROW_ID = 1
    }
}

private fun DeviceIdentityEntity.toDeviceIdentity(): DeviceIdentity =
    DeviceIdentity(
        nodeId = nodeId,
        displayName = displayName,
        createdAt = createdAt,
        identityKeyScheme = identityKeyScheme,
        identityPublicKey = identityPublicKey,
        identityKeyFingerprint = identityKeyFingerprint,
        identityKeyCreatedAt = identityKeyCreatedAt,
        identityKeyState = identityKeyState ?: IdentityKeyState.UNINITIALIZED,
        secureStorageBackend = identitySecureStorageBackend,
        hardwareBacked = identityHardwareBacked
    )
