package org.daovibe.android.core.identity

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import java.util.Base64

const val IDENTITY_KEY_SCHEME = "ed25519"
const val IDENTITY_PUBLIC_KEY_BYTES = 32
const val IDENTITY_WRAP_FORMAT_VERSION = 1

fun encodeIdentityPublicKey(bytes: ByteArray): String {
    require(bytes.size == IDENTITY_PUBLIC_KEY_BYTES)
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

fun decodeIdentityPublicKey(value: String): ByteArray =
    Base64.getUrlDecoder().decode(value).also {
        require(it.size == IDENTITY_PUBLIC_KEY_BYTES) { "identity public key must be 32 bytes" }
    }

fun identityFingerprint(publicKey: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(publicKey).joinToString("") { "%02x".format(it) }

fun groupedIdentityFingerprint(fingerprint: String): String =
    fingerprint.chunked(4).joinToString(" ")

data class IdentitySecretRecord(
    val seed: ByteArray,
    val secureStorageBackend: String,
    val hardwareBacked: Boolean?
)

interface IdentitySecretStorage {
    val backend: String
    val hardwareBacked: Boolean?
    fun store(nodeId: String, seed: ByteArray)
    fun load(nodeId: String): ByteArray?
}

/** Test-only deterministic adapter; production passes AndroidKeystoreIdentitySecretStorage. */
class InMemoryIdentitySecretStorage : IdentitySecretStorage {
    private val values = mutableMapOf<String, ByteArray>()
    override val backend: String = "test_memory"
    override val hardwareBacked: Boolean? = false
    override fun store(nodeId: String, seed: ByteArray) { values[nodeId] = seed.copyOf() }
    override fun load(nodeId: String): ByteArray? = values[nodeId]?.copyOf()
}

/** Explicit fail-closed adapter for non-production helpers that do not need key access. */
class UnavailableIdentitySecretStorage : IdentitySecretStorage {
    override val backend: String = "unavailable"
    override val hardwareBacked: Boolean? = null
    override fun store(nodeId: String, seed: ByteArray) =
        throw IdentityStorageException("identity secure storage unavailable")
    override fun load(nodeId: String): ByteArray? = null
}

class IdentityStorageException(message: String) : Exception(message)

/** AES-GCM wrapping in Android Keystore. Plaintext seeds never enter preferences/files. */
class AndroidKeystoreIdentitySecretStorage(context: Context) : IdentitySecretStorage {
    private val preferences = context.applicationContext.getSharedPreferences(
        "daovibe_identity_secrets", Context.MODE_PRIVATE
    )
    private val keyStore: KeyStore by lazy {
        try {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        } catch (_: Exception) {
            throw IdentityStorageException("identity secure storage unavailable")
        }
    }
    private val secureRandom = SecureRandom()
    override val backend: String = "android_keystore_aes_gcm"
    private var lastNodeId: String? = null
    override val hardwareBacked: Boolean?
        get() = lastNodeId?.let(::queryHardwareBacked)

    private fun alias(nodeId: String): String =
        "daovibe_identity_wrap_${identityFingerprint(MessageDigest.getInstance("SHA-256").digest(nodeId.toByteArray()))}"

    private fun key(nodeId: String): SecretKey {
        val name = alias(nodeId)
        if (!keyStore.containsAlias(name)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(
                KeyGenParameterSpec.Builder(
                    name,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build()
            )
            generator.generateKey()
        }
        return (keyStore.getKey(name, null) as? SecretKey)
            ?: throw IdentityStorageException("identity secure storage unavailable")
    }

    private fun existingKey(nodeId: String): SecretKey? {
        val name = alias(nodeId)
        if (!keyStore.containsAlias(name)) return null
        return (keyStore.getKey(name, null) as? SecretKey)
            ?: throw IdentityStorageException("identity secure storage unavailable")
    }

    private fun aad(nodeId: String): ByteArray =
        "daovibe/identity-wrap/v1|$nodeId|$IDENTITY_KEY_SCHEME".toByteArray(StandardCharsets.UTF_8)

    @Synchronized
    override fun store(nodeId: String, seed: ByteArray) {
        require(seed.size == 32)
        val preferenceKey = alias(nodeId)
        if (preferences.contains(preferenceKey)) {
            throw IdentityStorageException("identity secure storage already contains a key")
        }
        val iv = ByteArray(12).also(secureRandom::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(nodeId), GCMParameterSpec(128, iv))
        cipher.updateAAD(aad(nodeId))
        val ciphertext = cipher.doFinal(seed)
        val blob = ByteBuffer.allocate(1 + iv.size + ciphertext.size)
            .put(IDENTITY_WRAP_FORMAT_VERSION.toByte()).put(iv).put(ciphertext).array()
        check(preferences.edit().putString(preferenceKey, Base64.getEncoder().encodeToString(blob)).commit()) {
            "identity secure storage unavailable"
        }
        lastNodeId = nodeId
    }

    override fun load(nodeId: String): ByteArray? {
        val encoded = preferences.getString(alias(nodeId), null) ?: return null
        return try {
            val blob = Base64.getDecoder().decode(encoded)
            require(blob.size > 1 + 12 + 16 && blob[0].toInt() == IDENTITY_WRAP_FORMAT_VERSION)
            val iv = blob.copyOfRange(1, 13)
            val ciphertext = blob.copyOfRange(13, blob.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, existingKey(nodeId)
                ?: throw IdentityStorageException("identity secure storage unavailable"), GCMParameterSpec(128, iv))
            cipher.updateAAD(aad(nodeId))
            cipher.doFinal(ciphertext).also {
                require(it.size == 32)
                lastNodeId = nodeId
            }
        } catch (error: IdentityStorageException) {
            throw error
        } catch (_: Exception) {
            throw IdentityStorageException("identity secure storage corrupt")
        }
    }

    private fun queryHardwareBacked(nodeId: String): Boolean? = try {
        val secret = existingKey(nodeId) ?: return null
        val info = SecretKeyFactory.getInstance(secret.algorithm, "AndroidKeyStore")
            .getKeySpec(secret, KeyInfo::class.java) as KeyInfo
        info.isInsideSecureHardware
    } catch (_: Exception) {
        null
    }

}

fun deriveIdentityPublicKey(seed: ByteArray): ByteArray {
    require(seed.size == 32)
    return Ed25519PrivateKeyParameters(seed, 0).generatePublicKey().encoded
}

fun newIdentitySeed(): ByteArray = ByteArray(32).also { SecureRandom().nextBytes(it) }
