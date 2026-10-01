package org.daovibe.android.core.identity

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.daovibe.android.createProductionIdentitySecretStorage
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class DeviceIdentityRepositoryTest {
    private lateinit var database: DaoVibeDatabase

    @Before fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), DaoVibeDatabase::class.java
        ).allowMainThreadQueries().build()
    }
    @After fun tearDown() { database.close() }

    @Test
    fun firstInitializationAndRestartAreIdempotent() = runTest {
        val storage = InMemoryIdentitySecretStorage()
        val first = DeviceIdentityRepository(database.daoVibeDao(), { 10L }, storage).ensureIdentityKey()
        val second = DeviceIdentityRepository(database.daoVibeDao(), { 20L }, storage).ensureIdentityKey()
        assertEquals(first.nodeId, second.nodeId)
        assertEquals(first.identityPublicKey, second.identityPublicKey)
        assertEquals(first.identityKeyFingerprint, second.identityKeyFingerprint)
        assertEquals(IdentityKeyState.AVAILABLE, second.identityKeyState)
    }

    @Test
    fun missingSecretMarksUnavailableWithoutReplacement() = runTest {
        val storage = InMemoryIdentitySecretStorage()
        val first = DeviceIdentityRepository(database.daoVibeDao(), { 10L }, storage).ensureIdentityKey()
        val missing = object : IdentitySecretStorage {
            override val backend = "test_missing"
            override val hardwareBacked: Boolean? = false
            override fun store(nodeId: String, seed: ByteArray) = error("must not regenerate")
            override fun load(nodeId: String): ByteArray? = null
        }
        val second = DeviceIdentityRepository(database.daoVibeDao(), { 20L }, missing).ensureIdentityKey()
        assertEquals(first.nodeId, second.nodeId)
        assertEquals(first.identityPublicKey, second.identityPublicKey)
        assertNotEquals(IdentityKeyState.AVAILABLE, second.identityKeyState)
        assertEquals(IdentityKeyState.UNAVAILABLE, second.identityKeyState)
    }

    @Test
    fun corruptSecretMarksUnavailableWithoutRegeneration() = runTest {
        val storage = InMemoryIdentitySecretStorage()
        val first = DeviceIdentityRepository(database.daoVibeDao(), { 10L }, storage).ensureIdentityKey()
        val corrupt = object : IdentitySecretStorage {
            override val backend = "test_corrupt"
            override val hardwareBacked: Boolean? = false
            override fun store(nodeId: String, seed: ByteArray) = error("must not regenerate")
            override fun load(nodeId: String): ByteArray? =
                throw IdentityStorageException("ciphertext authentication failed")
        }
        val second = DeviceIdentityRepository(database.daoVibeDao(), { 20L }, corrupt).ensureIdentityKey()
        assertEquals(first.nodeId, second.nodeId)
        assertEquals(first.identityPublicKey, second.identityPublicKey)
        assertEquals(IdentityKeyState.UNAVAILABLE, second.identityKeyState)
    }

    @Test
    fun publicKeyMetadataMismatchFailsClosed() = runTest {
        val storage = InMemoryIdentitySecretStorage()
        val first = DeviceIdentityRepository(database.daoVibeDao(), { 10L }, storage).ensureIdentityKey()
        database.daoVibeDao().updateIdentityCrypto(
            IDENTITY_KEY_SCHEME,
            encodeIdentityPublicKey(ByteArray(32) { 7 }),
            first.identityKeyFingerprint,
            first.identityKeyCreatedAt,
            IdentityKeyState.AVAILABLE,
            storage.backend,
            storage.hardwareBacked
        )
        val second = DeviceIdentityRepository(database.daoVibeDao(), { 20L }, storage).ensureIdentityKey()
        assertEquals(IdentityKeyState.UNAVAILABLE, second.identityKeyState)
        assertTrue(second.identityPublicKey != first.identityPublicKey)
    }

    @Test
    fun productionCompositionUsesAndroidKeystoreAndNotInMemoryStorage() {
        val productionStorage = createProductionIdentitySecretStorage(
            ApplicationProvider.getApplicationContext()
        )
        assertTrue(productionStorage is AndroidKeystoreIdentitySecretStorage)
        val repository = LocalMyceliumRepository(database, secretStorage = productionStorage)
        assertEquals("android_keystore_aes_gcm", repository.identitySecretStorageBackend)
    }
}
