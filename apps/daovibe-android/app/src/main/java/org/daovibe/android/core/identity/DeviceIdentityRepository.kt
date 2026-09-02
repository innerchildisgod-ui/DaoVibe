package org.daovibe.android.core.identity

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.daovibe.android.core.storage.DaoVibeDao
import org.daovibe.android.core.storage.DeviceIdentityEntity
import java.util.UUID

class DeviceIdentityRepository(
    private val dao: DaoVibeDao,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L }
) {
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
        createdAt = createdAt
    )

