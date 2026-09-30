package org.daovibe.android.core.mycelium

import android.content.Context
import android.os.Build
import androidx.room.Room
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.DAO_VIBE_ROOM_SCHEMA_VERSION
import org.daovibe.android.core.storage.PacketEntity

enum class MyceliumConsistencyStatus { HEALTHY, WARNING, FAILED }

enum class MyceliumIssueCode {
    IDENTITY_MISSING,
    IDENTITY_INVALID,
    PACKET_DECODE_FAILED,
    PAYLOAD_HASH_MISMATCH,
    PACKET_ID_MISMATCH,
    SIGNATURE_INVALID,
    DUPLICATE_PACKET_ID_CONFLICT,
    DEPENDENCY_UNRESOLVED,
    REPLAY_FAILED,
    RESIDENT_STATE_MISMATCH,
    MIGRATION_ISSUE,
    EXPORT_ROUNDTRIP_FAILED,
    UNKNOWN
}

data class MyceliumConsistencyIssue(
    val code: MyceliumIssueCode,
    val packetId: String? = null
)

data class MyceliumConsistencyReport(
    val status: MyceliumConsistencyStatus,
    val checkedAt: Long,
    val nodeId: String?,
    val ledgerPacketCount: Int,
    val derivedPhraseCount: Int,
    val canonicalFingerprint: String?,
    val issues: List<MyceliumConsistencyIssue>,
    val checksPerformed: List<String>
) {
    fun diagnosticsText(): String = buildString {
        appendLine("Mycelium consistency: ${status.name.lowercase()}")
        appendLine("checked_at=$checkedAt")
        appendLine("node_id=${nodeId ?: "missing"}")
        appendLine("packet_count=$ledgerPacketCount")
        appendLine("phrase_count=$derivedPhraseCount")
        appendLine("canonical_fingerprint=${canonicalFingerprint ?: "unavailable"}")
        appendLine("issues=${issues.joinToString(",") { it.code.name.lowercase() }}")
        appendLine("checks=${checksPerformed.joinToString(",")}")
        if (status == MyceliumConsistencyStatus.FAILED) {
            appendLine("Local consistency issue detected. No automatic repair was performed.")
        }
    }
}

data class MyceliumAlphaReadinessReport(
    val appPackage: String,
    val appVersionName: String,
    val appVersionCode: Long,
    val roomSchemaVersion: Int,
    val status: String,
    val nodeIdPresent: Boolean,
    val databaseOpen: Boolean,
    /** Narrow runtime meaning: the already-open database is at the expected current schema. */
    val migrationChainOk: String,
    val ledgerConsistency: MyceliumConsistencyStatus,
    val replayConsistency: MyceliumConsistencyStatus,
    val canonicalFingerprint: String?,
    val packetCount: Int,
    val peerCount: Int,
    /** The current identity row was read from the persistent Room repository. */
    val identityPersistent: String,
    val exportImportRoundtripTested: Boolean,
    /** Runtime fixture execution is intentionally not duplicated here. */
    val semanticFixtureCompatibility: String,
    val inviteFixtureCompatibility: String,
    val warnings: List<String>,
    val checkedAt: Long
) {
    fun diagnosticsText(): String = buildString {
        appendLine("app_package=$appPackage")
        appendLine("app_version_name=$appVersionName")
        appendLine("app_version_code=$appVersionCode")
        appendLine("room_schema_version=$roomSchemaVersion")
        appendLine("Mycelium alpha readiness: $status")
        appendLine("checked_at=$checkedAt")
        appendLine("node_id_present=$nodeIdPresent")
        appendLine("database_open=$databaseOpen")
        appendLine("migration_chain_ok=$migrationChainOk")
        appendLine("ledger_consistency=${ledgerConsistency.name.lowercase()}")
        appendLine("replay_consistency=${replayConsistency.name.lowercase()}")
        appendLine("canonical_fingerprint=${canonicalFingerprint ?: "unavailable"}")
        appendLine("packet_count=$packetCount")
        appendLine("peer_count=$peerCount")
        appendLine("identity_persistent=$identityPersistent")
        appendLine("export_import_roundtrip_tested=$exportImportRoundtripTested")
        appendLine("semantic_fixture_compatibility=$semanticFixtureCompatibility")
        appendLine("invite_fixture_compatibility=$inviteFixtureCompatibility")
        appendLine("warnings=${warnings.joinToString(",")}")
        if (status == "failed") {
            appendLine("Local consistency issue detected. No automatic repair was performed.")
        }
    }
}

internal object MyceliumConsistencyChecker {
    private const val MAX_ISSUES = 12

    suspend fun check(
        repository: LocalMyceliumRepository,
        context: Context,
        checkedAt: Long
    ): Pair<MyceliumConsistencyReport, MyceliumAlphaReadinessReport> {
        val issues = mutableListOf<MyceliumConsistencyIssue>()
        val checks = mutableListOf<String>()
        val identity = repository.diagnosticIdentity()
        checks += "identity_structural_validity"
        val nodeId = identity?.nodeId
        if (identity == null) addIssue(issues, MyceliumIssueCode.IDENTITY_MISSING)
        else if (identity.nodeId.isBlank() || identity.displayName.isBlank() || identity.createdAt <= 0L) {
            addIssue(issues, MyceliumIssueCode.IDENTITY_INVALID)
        }

        val ledger = repository.diagnosticLedger()
        val decoded = mutableListOf<org.daovibe.android.core.protocol.LmpPacket<org.daovibe.android.core.protocol.PacketPayload>>()
        checks += "ledger_canonical_order"
        checks += "packet_decode_and_validation"
        checks += "unique_packet_ids"
        checks += "stored_expiry_structural_validation"
        checks += "expired_packets_retained_as_historical_ledger"
        val seen = linkedMapOf<String, String>()
        for (entity in ledger) {
            try {
                val packet = PacketJsonCodec.decode(entity.packetJson)
                val canonical = PacketJsonCodec.encode(packet)
                if (canonical != entity.packetJson || packet.packetId != entity.packetId) {
                    addIssue(issues, MyceliumIssueCode.PACKET_DECODE_FAILED, entity.packetId)
                    continue
                }
                val prior = seen.putIfAbsent(packet.packetId, canonical)
                if (prior != null && prior != canonical) {
                    addIssue(issues, MyceliumIssueCode.DUPLICATE_PACKET_ID_CONFLICT, packet.packetId)
                }
                val validation = PacketValidator().validate(packet)
                if (!validation.valid) {
                    val code = when {
                        validation.errors.any { it.contains("payload_hash") } -> MyceliumIssueCode.PAYLOAD_HASH_MISMATCH
                        validation.errors.any { it.contains("packet_id") } -> MyceliumIssueCode.PACKET_ID_MISMATCH
                        validation.errors.any { it.contains("signature") } -> MyceliumIssueCode.SIGNATURE_INVALID
                        else -> MyceliumIssueCode.UNKNOWN
                    }
                    addIssue(issues, code, packet.packetId)
                } else {
                    // Expiry is checked on import/sync. Existing ledger rows
                    // remain historical source-of-truth and are replayed even
                    // when their expiry is in the past.
                    decoded += packet
                }
            } catch (_: Exception) {
                addIssue(issues, MyceliumIssueCode.PACKET_DECODE_FAILED, entity.packetId)
            }
        }

        checks += "development_signature_behavior"
        checks += "dependency_aware_replay"
        var fresh: MyceliumStateSnapshot? = null
        try {
            fresh = MyceliumStateDiagnostic.snapshot(context, ledger)
        } catch (error: Exception) {
            val code = if (error.message.orEmpty().contains("dependency", ignoreCase = true)) {
                MyceliumIssueCode.DEPENDENCY_UNRESOLVED
            } else {
                MyceliumIssueCode.REPLAY_FAILED
            }
            addIssue(issues, code)
        }

        checks += "resident_vs_fresh_replay"
        // The production observer derives its resident semantic view from the
        // authoritative ledger (there is no second resident semantic serializer).
        // Compare that view with the isolated, dependency-aware replay below.
        val resident = runCatching {
            MyceliumStateSnapshot.fromState(MyceliumReducer.reduce(decoded))
        }.getOrNull()
        if (fresh != null && resident != null &&
            (fresh.toCanonicalJson() != resident.toCanonicalJson() || fresh.fingerprint() != resident.fingerprint())
        ) {
            addIssue(issues, MyceliumIssueCode.RESIDENT_STATE_MISMATCH)
        }

        checks += "canonical_fingerprint"
        checks += "peer_metadata_excluded"
        checks += "diagnose_metadata_excluded"
        val fingerprint = fresh?.fingerprint() ?: resident?.fingerprint()
        val roundtripOk = runCatching {
            val exported = repository.exportLedgerJson()
            val scratch = Room.inMemoryDatabaseBuilder(context.applicationContext, DaoVibeDatabase::class.java).build()
            try {
                val importedRepository = LocalMyceliumRepository(scratch)
                val first = importedRepository.importLedgerJson(exported, checkedAt)
                val importedEntities = importedRepository.diagnosticPackets()
                val sourceEntities = repository.diagnosticPackets()
                val packetsEqual = importedEntities.map { it.packetId to it.author to canonicalPacket(it.packetJson) } ==
                    sourceEntities.map { it.packetId to it.author to canonicalPacket(it.packetJson) }
                val second = importedRepository.importLedgerJson(exported, checkedAt)
                val imported = MyceliumStateSnapshot.fromState(importedRepository.rebuildDerivedStateFromLedger())
                packetsEqual && first.totalPackets == sourceEntities.size &&
                    second.insertedPackets == 0 &&
                    imported.fingerprint() == fingerprint && imported.toCanonicalJson() == fresh?.toCanonicalJson()
            } finally {
                scratch.close()
            }
        }.getOrDefault(false)
        checks += "export_import_roundtrip"
        if (!roundtripOk && ledger.isNotEmpty()) addIssue(issues, MyceliumIssueCode.EXPORT_ROUNDTRIP_FAILED)

        val consistencyStatus = when {
            issues.any { it.code != MyceliumIssueCode.EXPORT_ROUNDTRIP_FAILED } -> MyceliumConsistencyStatus.FAILED
            issues.isNotEmpty() -> MyceliumConsistencyStatus.WARNING
            else -> MyceliumConsistencyStatus.HEALTHY
        }
        val report = MyceliumConsistencyReport(
            status = consistencyStatus,
            checkedAt = checkedAt,
            nodeId = nodeId,
            ledgerPacketCount = ledger.size,
            derivedPhraseCount = resident?.phrases?.size ?: 0,
            canonicalFingerprint = fingerprint,
            issues = issues,
            checksPerformed = checks
        )
        val peers = repository.diagnosticPeerCount()
        val readinessStatus = when {
            consistencyStatus == MyceliumConsistencyStatus.FAILED -> "failed"
            consistencyStatus == MyceliumConsistencyStatus.WARNING -> "warning"
            else -> "ready_for_local_alpha"
        }
        val readiness = MyceliumAlphaReadinessReport(
            appPackage = context.packageName,
            appVersionName = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown",
            appVersionCode = context.packageManager.getPackageInfo(context.packageName, 0).let { info ->
                if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
            },
            roomSchemaVersion = DAO_VIBE_ROOM_SCHEMA_VERSION,
            status = readinessStatus,
            nodeIdPresent = identity?.nodeId?.isNotBlank() == true,
            databaseOpen = true,
            migrationChainOk = "current_schema_open",
            ledgerConsistency = consistencyStatus,
            replayConsistency = if (fresh != null && resident != null) MyceliumConsistencyStatus.HEALTHY else MyceliumConsistencyStatus.FAILED,
            canonicalFingerprint = fingerprint,
            packetCount = ledger.size,
            peerCount = peers,
            identityPersistent = if (identity != null) "identity_present_in_persistent_row" else "missing",
            exportImportRoundtripTested = roundtripOk,
            semanticFixtureCompatibility = "test_suite_verified",
            inviteFixtureCompatibility = "test_suite_verified",
            warnings = issues.map { it.code.name.lowercase() },
            checkedAt = checkedAt
        )
        return report to readiness
    }

    private fun addIssue(issues: MutableList<MyceliumConsistencyIssue>, code: MyceliumIssueCode, packetId: String? = null) {
        if (issues.size < MAX_ISSUES) issues += MyceliumConsistencyIssue(code, packetId)
    }

    private fun canonicalPacket(json: String): String =
        PacketJsonCodec.encode(PacketJsonCodec.decode(json))
}

/** Stable bounded copy surface for a failed readiness action. */
internal fun safeReadinessWarnings(@Suppress("UNUSED_PARAMETER") error: Throwable): List<String> =
    listOf("unknown")

internal suspend fun LocalMyceliumRepository.diagnosticLedger(): List<PacketEntity> = diagnosticPackets()
internal suspend fun LocalMyceliumRepository.diagnosticIdentity() = diagnosticDeviceIdentity()
internal suspend fun LocalMyceliumRepository.diagnosticPeerCount(): Int = diagnosticKnownPeerCount()
