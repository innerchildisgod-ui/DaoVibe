package org.daovibe.android.core.identity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CryptoIdentityTest {
    private val fixture = javaClass.classLoader!!.getResourceAsStream("fixtures/mycelium_identity_ed25519.json")!!
        .bufferedReader().readText()

    @Test
    fun rfc8032FixtureMatchesCanonicalEncodingAndFingerprint() {
        val seed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60".hex()
        val publicKey = deriveIdentityPublicKey(seed)
        assertTrue(fixture.contains(publicKey.toHex()))
        assertEquals("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo", encodeIdentityPublicKey(publicKey))
        assertEquals("21fe31dfa154a261626bf854046fd2271b7bed4b6abe45aa58877ef47f9721b9", identityFingerprint(publicKey))
        assertEquals("21fe 31df a154 a261 626b f854 046f d227 1b7b ed4b 6abe 45aa 5887 7ef4 7f97 21b9", groupedIdentityFingerprint(identityFingerprint(publicKey)))
    }

    @Test
    fun inMemorySecretStoragePersistsAndDoesNotRegenerate() {
        val storage = InMemoryIdentitySecretStorage()
        val seed = newIdentitySeed()
        storage.store("node", seed)
        assertTrue(seed.contentEquals(storage.load("node")!!))
        assertTrue(seed.contentEquals(storage.load("node")!!))
    }

    private fun String.hex(): ByteArray = chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
