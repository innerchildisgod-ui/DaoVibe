package org.daovibe.android.core.mycelium

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import org.json.JSONObject
import org.daovibe.android.core.identity.DeviceIdentityRepository
import org.daovibe.android.core.identity.IdentitySecretStorage
import org.daovibe.android.core.identity.UnavailableIdentitySecretStorage
import org.daovibe.android.core.protocol.InputType
import org.daovibe.android.core.protocol.LmpPacket
import org.daovibe.android.core.protocol.MeaningProposalPayload
import org.daovibe.android.core.protocol.MeaningVotePayload
import org.daovibe.android.core.protocol.CorrectionProposedPayload
import org.daovibe.android.core.protocol.CorrectionVotePayload
import org.daovibe.android.core.protocol.CorrectionTombstoneProposedPayload
import org.daovibe.android.core.protocol.CorrectionTombstoneVotePayload
import org.daovibe.android.core.protocol.PacketFactory
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketPayload
import org.daovibe.android.core.protocol.PacketType
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.protocol.PhraseObservedPayload
import org.daovibe.android.core.protocol.SafetyLabel
import org.daovibe.android.core.protocol.SafetyLabelPayload
import org.daovibe.android.core.protocol.StableJson
import org.daovibe.android.core.protocol.VoteValue
import org.daovibe.android.core.protocol.estimatePacketSize
import org.daovibe.android.core.protocol.sha256
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.MeaningEntity
import org.daovibe.android.core.storage.PacketEntity
import org.daovibe.android.core.storage.PeerSyncStateEntity
import org.daovibe.android.core.storage.PhraseEntity
import org.daovibe.android.core.storage.VoteEntity
import org.daovibe.android.core.sync.START_SYNC_CURSOR
import org.daovibe.android.core.sync.SyncBatch
import org.daovibe.android.core.sync.SyncImportException
import org.daovibe.android.core.sync.SyncImportResult
import org.daovibe.android.core.sync.SyncProtocol
import org.daovibe.android.core.sync.SyncRejectReason
import java.util.Locale

private const val LEDGER_EXPORT_FORMAT = "daovibe-ledger-v1"

/*
 * Early Android milestone guard for manual local JSON imports. This is not a
 * packet, networking, or sync protocol limit.
 */
internal const val LEDGER_IMPORT_MAX_BYTES = 1 * 1024 * 1024

private const val EXISTING_PACKET_LOOKUP_CHUNK_SIZE = 500

data class LedgerImportResult(
    val totalPackets: Int,
    val insertedPackets: Int,
    val duplicatePackets: Int
)

class LocalMyceliumRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val zone: String = "local_device_zone",
    private val secretStorage: IdentitySecretStorage = UnavailableIdentitySecretStorage()
) {
    private val dao = database.daoVibeDao()
    private val validator = PacketValidator()
    private val packetFactory = PacketFactory(nowSeconds)
    val identityRepository = DeviceIdentityRepository(dao, nowSeconds, secretStorage)
    internal val identitySecretStorageBackend: String
        get() = secretStorage.backend

    /** Read-only inputs for the explicit consistency/readiness check. */
    internal suspend fun diagnosticPackets(): List<PacketEntity> = dao.listPacketsForReplay()

    internal suspend fun diagnosticDeviceIdentity() = dao.getDeviceIdentity()

    internal suspend fun diagnosticKnownPeerCount(): Int = dao.listKnownPeers().size

    fun observeSnapshot(): Flow<LocalMyceliumSnapshot> {
        val packetLists = combine(
            dao.observeRecentPackets(20),
            dao.observePacketsInLedgerOrder()
        ) { recentPackets, ledgerPackets ->
            recentPackets to ledgerPackets
        }

        return combine(
            identityRepository.observeIdentity(),
            dao.observePhrases(),
            dao.observeMeanings(),
            dao.observeVotes(),
            packetLists
        ) { identity, phrases, meanings, votes, packets ->
            LocalMyceliumSnapshot(
                identity = identity,
                state = MyceliumReducer.reduce(packets.second.map { PacketJsonCodec.decode(it.packetJson) }),
                recentPackets = packets.first,
                ledgerPackets = packets.second
            )
        }
    }

    suspend fun ensureDeviceIdentity() =
        identityRepository.getOrCreate()

    suspend fun observePhrase(surfaceText: String): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val trimmedSurfaceText = surfaceText.trim()
        require(trimmedSurfaceText.isNotEmpty()) { "phrase must be a non-empty string" }

        val payload = PhraseObservedPayload(
            phraseId = phraseIdFor(trimmedSurfaceText),
            surfaceText = trimmedSurfaceText,
            languageHint = "und",
            inputType = InputType.TEXT
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.PHRASE_OBSERVED,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun proposeMeaning(
        phraseId: String,
        referenceMeaning: String,
        confidence: Double = 0.25
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val trimmedPhraseId = phraseId.trim()
        val trimmedMeaning = referenceMeaning.trim()
        require(trimmedPhraseId.isNotEmpty()) { "phraseId must be a non-empty string" }
        require(trimmedMeaning.isNotEmpty()) { "referenceMeaning must be a non-empty string" }

        val payload = MeaningProposalPayload(
            phraseId = trimmedPhraseId,
            meaningId = meaningIdFor(trimmedPhraseId, trimmedMeaning),
            referenceMeaning = trimmedMeaning,
            confidence = confidence
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.MEANING_PROPOSAL,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun voteMeaning(
        phraseId: String,
        meaningId: String,
        vote: VoteValue,
        confidence: Double = 1.0
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val payload = MeaningVotePayload(
            phraseId = phraseId.trim(),
            meaningId = meaningId.trim(),
            vote = vote,
            confidence = confidence
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.MEANING_VOTE,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun proposeCorrection(phraseId: String, meaningId: String, referenceMeaning: String, context: String? = null, confidence: Double = 0.25): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val trimmedPhraseId = phraseId.trim()
        val trimmedMeaningId = meaningId.trim()
        val text = referenceMeaning.trim()
        require(trimmedPhraseId.isNotEmpty()) { "phraseId must be a non-empty string" }
        require(trimmedMeaningId.isNotEmpty()) { "meaningId must be a non-empty string" }
        require(text.isNotEmpty()) { "referenceMeaning must be a non-empty string" }
        val parent = meaningProposalPacketId(trimmedPhraseId, trimmedMeaningId)
            ?: error("Meaning proposal not found: $trimmedMeaningId")
        val normalizedContext = context?.trim()?.takeIf { it.isNotEmpty() }
        val correctionId = correctionIdFor(trimmedPhraseId, trimmedMeaningId, text, normalizedContext, confidence)
        return receivePacket(packetFactory.create(PacketType.CORRECTION_PROPOSED, zone, identity.nodeId, parent = parent, payload = CorrectionProposedPayload(correctionId, trimmedPhraseId, trimmedMeaningId, text, normalizedContext, confidence)))
    }

    suspend fun voteCorrection(phraseId: String, meaningId: String, correctionId: String, vote: VoteValue, confidence: Double = 1.0): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val parent = correctionProposalPacketId(phraseId.trim(), meaningId.trim(), correctionId.trim())
            ?: error("Correction proposal not found: ${correctionId.trim()}")
        return receivePacket(packetFactory.create(PacketType.CORRECTION_VOTE, zone, identity.nodeId, parent = parent, payload = CorrectionVotePayload(correctionId.trim(), phraseId.trim(), meaningId.trim(), vote, confidence)))
    }

    suspend fun proposeCorrectionTombstone(
        phraseId: String,
        meaningId: String,
        correctionId: String,
        reason: String,
        confidence: Double = 0.25
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val normalizedPhraseId = phraseId.trim()
        val normalizedMeaningId = meaningId.trim()
        val normalizedCorrectionId = correctionId.trim()
        val normalizedReason = reason.trim()
        require(normalizedPhraseId.isNotEmpty()) { "phraseId must be a non-empty string" }
        require(normalizedMeaningId.isNotEmpty()) { "meaningId must be a non-empty string" }
        require(normalizedCorrectionId.isNotEmpty()) { "correctionId must be a non-empty string" }
        require(normalizedReason.isNotEmpty()) { "reason must be a non-empty string" }
        require(confidence.isFinite() && confidence in 0.0..1.0) { "confidence must be finite and in [0,1]" }
        val parent = correctionProposalPacketId(normalizedPhraseId, normalizedMeaningId, normalizedCorrectionId)
            ?: error("Correction proposal not found: $normalizedCorrectionId")
        val tombstoneId = tombstoneIdFor(
            normalizedPhraseId, normalizedMeaningId, normalizedCorrectionId,
            normalizedReason, confidence
        )
        return receivePacket(
            packetFactory.create(
                PacketType.CORRECTION_TOMBSTONE_PROPOSED,
                zone,
                identity.nodeId,
                parent = parent,
                payload = CorrectionTombstoneProposedPayload(
                    tombstoneId, normalizedPhraseId, normalizedMeaningId,
                    normalizedCorrectionId, normalizedReason, confidence
                )
            )
        )
    }

    suspend fun voteCorrectionTombstone(
        phraseId: String,
        meaningId: String,
        correctionId: String,
        tombstoneId: String,
        vote: VoteValue,
        confidence: Double = 1.0
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val normalizedPhraseId = phraseId.trim()
        val normalizedMeaningId = meaningId.trim()
        val normalizedCorrectionId = correctionId.trim()
        val normalizedTombstoneId = tombstoneId.trim()
        val parent = tombstoneProposalPacketId(
            normalizedPhraseId, normalizedMeaningId,
            normalizedCorrectionId, normalizedTombstoneId
        ) ?: error("Correction tombstone proposal not found: $normalizedTombstoneId")
        return receivePacket(
            packetFactory.create(
                PacketType.CORRECTION_TOMBSTONE_VOTE,
                zone,
                identity.nodeId,
                parent = parent,
                payload = CorrectionTombstoneVotePayload(
                    normalizedTombstoneId, normalizedPhraseId, normalizedMeaningId,
                    normalizedCorrectionId, vote, confidence
                )
            )
        )
    }

    private suspend fun meaningProposalPacketId(phraseId: String, meaningId: String): String? =
        dao.listPacketsForReplay().asSequence().map { PacketJsonCodec.decode(it.packetJson) }
            .firstOrNull { packet -> (packet.payload as? MeaningProposalPayload)?.let { it.phraseId == phraseId && it.meaningId == meaningId } == true }?.packetId

    private suspend fun correctionProposalPacketId(phraseId: String, meaningId: String, correctionId: String): String? =
        dao.listPacketsForReplay().asSequence().map { PacketJsonCodec.decode(it.packetJson) }
            .firstOrNull { packet -> (packet.payload as? CorrectionProposedPayload)?.let { it.phraseId == phraseId && it.meaningId == meaningId && it.correctionId == correctionId } == true }?.packetId

    private suspend fun tombstoneProposalPacketId(
        phraseId: String,
        meaningId: String,
        correctionId: String,
        tombstoneId: String
    ): String? = dao.listPacketsForReplay().asSequence().map { PacketJsonCodec.decode(it.packetJson) }
        .firstOrNull { packet ->
            (packet.payload as? CorrectionTombstoneProposedPayload)?.let {
                it.phraseId == phraseId && it.meaningId == meaningId &&
                    it.correctionId == correctionId && it.tombstoneId == tombstoneId
            } == true
        }?.packetId

    suspend fun applySafetyLabel(
        phraseId: String,
        label: SafetyLabel,
        reason: String? = null
    ): PacketReceiveResult {
        val identity = identityRepository.getOrCreate()
        val payload = SafetyLabelPayload(
            phraseId = phraseId.trim(),
            label = label,
            reason = reason?.trim()?.takeIf { it.isNotEmpty() }
        )

        return receivePacket(
            packetFactory.create(
                packetType = PacketType.SAFETY_LABEL,
                zone = zone,
                author = identity.nodeId,
                payload = payload
            )
        )
    }

    suspend fun exportLedgerJson(): String {
        val packets = dao.listPacketsForReplay()

        return buildString {
            append("{\"format\":\"")
            append(LEDGER_EXPORT_FORMAT)
            append("\",\"packets\":[")

            packets.forEachIndexed { index, entity ->
                if (index > 0) {
                    append(',')
                }

                val packet = PacketJsonCodec.decode(entity.packetJson)
                append(PacketJsonCodec.encode(packet))
            }

            append("]}")
        }
    }

    suspend fun importLedgerJson(
        json: String,
        importedAt: Long = nowSeconds()
    ): LedgerImportResult {
        require(json.toByteArray(Charsets.UTF_8).size <= LEDGER_IMPORT_MAX_BYTES) {
            "Ledger import is too large. Maximum local import is ${LEDGER_IMPORT_MAX_BYTES / 1024} KiB."
        }

        val root = JSONObject(json)

        require(root.optString("format") == LEDGER_EXPORT_FORMAT) {
            "Unsupported ledger export format"
        }

        val packetArray = root.getJSONArray("packets")
        val decodedPackets = mutableListOf<LmpPacket<PacketPayload>>()

        for (index in 0 until packetArray.length()) {
            val packet = PacketJsonCodec.decode(packetArray.getJSONObject(index))
            val validation = validator.validate(packet)

            require(validation.valid) {
                "Invalid packet ${packet.packetId}: ${validation.errors.joinToString(", ")}"
            }

            require(!validator.isExpired(packet, importedAt)) {
                "Expired packet: ${packet.packetId}"
            }

            decodedPackets += packet
        }

        /*
         * Validate the complete document before opening the write transaction.
         * Identical duplicate packet IDs are harmless. A duplicate ID containing
         * different canonical packet data is rejected as ambiguous.
         */
        val uniquePackets = linkedMapOf<String, LmpPacket<PacketPayload>>()

        for (packet in decodedPackets) {
            val existing = uniquePackets[packet.packetId]

            if (existing == null) {
                uniquePackets[packet.packetId] = packet
            } else {
                require(
                    PacketJsonCodec.encode(existing) == PacketJsonCodec.encode(packet)
                ) {
                    "Conflicting duplicate packet_id: ${packet.packetId}"
                }
            }
        }

        val orderedPackets = uniquePackets.values.sortedWith(
            compareBy<LmpPacket<PacketPayload>>(
                { it.createdAt },
                { it.packetId }
            )
        )

        val existingPacketsById =
            if (orderedPackets.isEmpty()) {
                emptyMap()
            } else {
                orderedPackets
                    .map { it.packetId }
                    .chunked(EXISTING_PACKET_LOOKUP_CHUNK_SIZE)
                    .flatMap { packetIds -> dao.listPacketsByIds(packetIds) }
                    .associateBy { it.packetId }
            }

        for (packet in orderedPackets) {
            val existing = existingPacketsById[packet.packetId] ?: continue

            require(
                canonicalPacketJson(existing.packetJson) == PacketJsonCodec.encode(packet)
            ) {
                "Conflicting duplicate packet_id: ${packet.packetId}"
            }
        }

        var insertedPackets = 0
        var duplicatePackets = decodedPackets.size - orderedPackets.size

        /*
         * All writes and the full derived-state rebuild happen in ONE Room
         * transaction. If replay/apply fails, Room rolls the entire import back.
         */
        database.withTransaction {
            val genuinelyNewPackets = orderedPackets.filterNot {
                existingPacketsById.containsKey(it.packetId)
            }
            requireImportDependencies(
                packets = genuinelyNewPackets,
                existingLedger = dao.listPacketsForReplay()
                    .map { PacketJsonCodec.decode(it.packetJson) }
            )
            for (packet in orderedPackets) {
                if (existingPacketsById.containsKey(packet.packetId)) {
                    duplicatePackets += 1
                    continue
                }

                val inserted = dao.insertPacket(
                    packet.toEntity(receivedAt = importedAt)
                )

                if (inserted == -1L) {
                    duplicatePackets += 1
                } else {
                    insertedPackets += 1
                }
            }

            rebuildDerivedStateInsideTransaction()
        }

        return LedgerImportResult(
            totalPackets = decodedPackets.size,
            insertedPackets = insertedPackets,
            duplicatePackets = duplicatePackets
        )
    }

    private fun canonicalPacketJson(packetJson: String): String =
        PacketJsonCodec.encode(PacketJsonCodec.decode(packetJson))

    suspend fun importSyncBatchAtomically(
        batch: SyncBatch,
        remoteNodeId: String,
        pairingId: String,
        importedAt: Long = nowSeconds()
    ): SyncImportResult {
        SyncProtocol.validateBatch(batch)

        if (remoteNodeId.isBlank()) {
            throw SyncImportException(
                reason = SyncRejectReason.NODE_ID_MISMATCH,
                message = "Remote Node ID must be non-empty"
            )
        }
        if (pairingId.isBlank()) {
            throw SyncImportException(
                reason = SyncRejectReason.PAIRING_MISMATCH,
                message = "Pairing ID must be non-empty"
            )
        }
        if (batch.sourceNodeId != remoteNodeId) {
            throw SyncImportException(
                reason = SyncRejectReason.NODE_ID_MISMATCH,
                message = "Sync batch source does not match the paired remote node"
            )
        }
        if (batch.pairingId != pairingId) {
            throw SyncImportException(
                reason = SyncRejectReason.PAIRING_MISMATCH,
                message = "Sync batch pairing does not match the active pairing"
            )
        }
        val localIdentity = dao.getDeviceIdentity()
            ?: throw SyncImportException(
                reason = SyncRejectReason.TARGET_NODE_MISMATCH,
                message = "Local Device Identity must exist before sync import"
            )
        if (batch.targetNodeId != localIdentity.nodeId) {
            throw SyncImportException(
                reason = SyncRejectReason.TARGET_NODE_MISMATCH,
                message = "Sync batch target does not match the local Node ID"
            )
        }

        for (packet in batch.packets) {
            val validation = validator.validate(packet)
            if (!validation.valid) {
                throw SyncImportException(
                    reason = SyncRejectReason.INVALID_PACKET,
                    message =
                        "Invalid packet ${packet.packetId}: " +
                            validation.errors.joinToString(", ")
                )
            }
            if (validator.isExpired(packet, importedAt)) {
                throw SyncImportException(
                    reason = SyncRejectReason.EXPIRED_PACKET,
                    message = "Expired packet: ${packet.packetId}"
                )
            }
        }

        /*
         * Validate duplicate IDs in the complete batch before opening the
         * transaction. Identical duplicates are harmless; conflicting content
         * makes the whole batch ambiguous.
         */
        val uniquePackets = linkedMapOf<String, LmpPacket<PacketPayload>>()
        for (packet in batch.packets) {
            val existing = uniquePackets[packet.packetId]
            if (existing == null) {
                uniquePackets[packet.packetId] = packet
            } else if (
                PacketJsonCodec.encode(existing) != PacketJsonCodec.encode(packet)
            ) {
                throw SyncImportException(
                    reason = SyncRejectReason.CONFLICTING_DUPLICATE_PACKET,
                    message = "Conflicting duplicate packet_id: ${packet.packetId}"
                )
            }
        }

        val orderedPackets = uniquePackets.values.sortedWith(
            compareBy<LmpPacket<PacketPayload>>(
                { it.createdAt },
                { it.packetId }
            )
        )

        return database.withTransaction {
            val existingState = dao.getPeerSyncState(remoteNodeId)
            if (existingState != null && existingState.pairingId != pairingId) {
                throw SyncImportException(
                    reason = SyncRejectReason.PAIRING_MISMATCH,
                    message = "Stored sync state belongs to another pairing"
                )
            }

            val cursorBefore = existingState?.inboundCursor ?: START_SYNC_CURSOR
            if (batch.requestCursor != cursorBefore) {
                throw SyncImportException(
                    reason = SyncRejectReason.CURSOR_MISMATCH,
                    message =
                        "Sync cursor mismatch. Expected $cursorBefore, " +
                            "received ${batch.requestCursor}"
                )
            }

            val cursorComparison = SyncProtocol.compareCursors(
                left = batch.nextCursor,
                right = cursorBefore
            )
            if (cursorComparison < 0) {
                throw SyncImportException(
                    reason = SyncRejectReason.CURSOR_REGRESSION,
                    message =
                        "Sync cursor regression. Current $cursorBefore, " +
                            "requested ${batch.nextCursor}"
                )
            }

            val existingPacketsById =
                if (orderedPackets.isEmpty()) {
                    emptyMap()
                } else {
                    orderedPackets
                        .map { it.packetId }
                        .chunked(EXISTING_PACKET_LOOKUP_CHUNK_SIZE)
                        .flatMap { packetIds -> dao.listPacketsByIds(packetIds) }
                        .associateBy { it.packetId }
                }

            for (packet in orderedPackets) {
                val existing = existingPacketsById[packet.packetId] ?: continue
                if (
                    canonicalPacketJson(existing.packetJson) !=
                    PacketJsonCodec.encode(packet)
                ) {
                    throw SyncImportException(
                        reason = SyncRejectReason.CONFLICTING_DUPLICATE_PACKET,
                        message =
                            "Conflicting duplicate packet_id in local ledger: " +
                                packet.packetId
                    )
                }
            }

            val genuinelyNewPackets = orderedPackets.filterNot {
                existingPacketsById.containsKey(it.packetId)
            }

            try {
                requireImportDependencies(
                    packets = genuinelyNewPackets,
                    existingLedger = dao.listPacketsForReplay()
                        .map { PacketJsonCodec.decode(it.packetJson) }
                )
            } catch (error: IllegalArgumentException) {
                throw SyncImportException(
                    reason = SyncRejectReason.INVALID_PACKET,
                    message = error.message ?: "Invalid packet dependencies"
                )
            }

            if (cursorComparison == 0 && genuinelyNewPackets.isNotEmpty()) {
                throw SyncImportException(
                    reason = SyncRejectReason.CURSOR_STALLED,
                    message =
                        "Sync cursor did not advance for new packets. Current " +
                            "$cursorBefore, requested ${batch.nextCursor}"
                )
            }
            if (batch.packets.isEmpty() && cursorComparison != 0) {
                throw SyncImportException(
                    reason = SyncRejectReason.CURSOR_STALLED,
                    message = "Sync cursor cannot advance without packets"
                )
            }

            var insertedPackets = 0
            var duplicatePackets =
                batch.packets.size - orderedPackets.size

            for (packet in genuinelyNewPackets) {
                val inserted = dao.insertPacket(
                    packet.toEntity(receivedAt = importedAt)
                )
                if (inserted == -1L) {
                    throw SyncImportException(
                        reason = SyncRejectReason.CONFLICTING_DUPLICATE_PACKET,
                        message =
                            "Packet appeared during sync import: " +
                                packet.packetId
                    )
                }
                insertedPackets += 1
            }

            duplicatePackets += orderedPackets.count {
                existingPacketsById.containsKey(it.packetId)
            }

            /*
             * Replay happens before the cursor write. Room rolls back both
             * packet inserts and derived rows if replay throws.
             */
            rebuildDerivedStateInsideTransaction()
            dao.upsertPeerSyncState(
                PeerSyncStateEntity(
                    remoteNodeId = remoteNodeId,
                    pairingId = pairingId,
                    inboundCursor = batch.nextCursor,
                    updatedAt = nowSeconds()
                )
            )

            SyncImportResult(
                totalPackets = batch.packets.size,
                insertedPackets = insertedPackets,
                duplicatePackets = duplicatePackets,
                cursorBefore = cursorBefore,
                cursorAfter = batch.nextCursor
            )
        }
    }

    suspend fun receivePacket(
        packet: LmpPacket<PacketPayload>,
        receivedAt: Long = nowSeconds()
    ): PacketReceiveResult {
        val validation = validator.validate(packet)
        if (!validation.valid) {
            return PacketReceiveResult(
                decision = PacketReceiveDecision.REJECTED_INVALID,
                packetId = packet.packetId,
                errors = validation.errors
            )
        }

        if (validator.isExpired(packet, receivedAt)) {
            return PacketReceiveResult(
                decision = PacketReceiveDecision.REJECTED_EXPIRED,
                packetId = packet.packetId,
                errors = listOf("Packet expired")
            )
        }

        return try {
            database.withTransaction {
                val existingPacket = dao.getPacketById(packet.packetId)
                if (existingPacket != null) {
                    if (canonicalPacketJson(existingPacket.packetJson) != PacketJsonCodec.encode(packet)) {
                        return@withTransaction PacketReceiveResult(
                            decision = PacketReceiveDecision.REJECTED_INVALID,
                            packetId = packet.packetId,
                            errors = listOf("Conflicting duplicate packet_id: ${packet.packetId}")
                        )
                    }
                    return@withTransaction PacketReceiveResult(
                        decision = PacketReceiveDecision.ALREADY_STORED,
                        packetId = packet.packetId
                    )
                }

                require(receiveDependenciesSatisfied(packet)) {
                    "Unresolved packet dependencies for ${packet.packetId}"
                }

                val inserted = dao.insertPacket(packet.toEntity(receivedAt))
                if (inserted == -1L) {
                    return@withTransaction PacketReceiveResult(
                        decision = PacketReceiveDecision.ALREADY_STORED,
                        packetId = packet.packetId
                    )
                }

                applyPacketToDerivedState(packet, receivedAt)
                PacketReceiveResult(
                    decision = PacketReceiveDecision.ACCEPTED_NEW,
                    packetId = packet.packetId
                )
            }
        } catch (error: IllegalArgumentException) {
            PacketReceiveResult(
                decision = PacketReceiveDecision.FAILED_APPLY,
                packetId = packet.packetId,
                errors = listOf(error.message ?: "Failed to apply packet")
            )
        } catch (error: IllegalStateException) {
            PacketReceiveResult(
                decision = PacketReceiveDecision.FAILED_APPLY,
                packetId = packet.packetId,
                errors = listOf(error.message ?: "Failed to apply packet")
            )
        }
    }

    suspend fun rebuildDerivedStateFromLedger(): MyceliumState =
        database.withTransaction {
            rebuildDerivedStateInsideTransaction()
        }

    private suspend fun rebuildDerivedStateInsideTransaction(): MyceliumState {
        val packets = dao.listPacketsForReplay()
            .map { PacketJsonCodec.decode(it.packetJson) }

        for (packet in packets) {
            val validation = validator.validate(packet)
            require(validation.valid) {
                "Invalid packet in ledger ${packet.packetId}: ${validation.errors.joinToString(", ")}"
            }
        }

        dao.clearVotes()
        dao.clearMeanings()
        dao.clearPhrases()

        /*
         * Ledger replay must not depend on packets arriving in causal order.
         *
         * Two valid dependent packets can have the same created_at value,
         * and packet_id ordering does not guarantee that a phrase sorts before
         * its meaning proposal or that a meaning sorts before its vote.
         *
         * Keep the ledger's deterministic created_at/packet_id ordering, but
         * postpone packets whose dependencies have not been derived yet.
         * Repeating this process produces deterministic state from the same
         * valid packet set without relying on insertion or network order.
         */
        var pending = packets

        while (pending.isNotEmpty()) {
            val deferred = mutableListOf<LmpPacket<PacketPayload>>()
            var appliedAny = false

            for (packet in pending) {
                if (canApplyDuringReplay(packet)) {
                    applyPacketToDerivedState(
                        packet = packet,
                        updatedAt = packet.createdAt
                    )
                    appliedAny = true
                } else {
                    deferred += packet
                }
            }

            require(appliedAny) {
                "Unresolvable packet dependencies: ${
                    deferred.joinToString(", ") { it.packetId }
                }"
            }

            pending = deferred
        }

        return MyceliumReducer.reduce(packets)
    }

    private suspend fun canApplyDuringReplay(
        packet: LmpPacket<PacketPayload>
    ): Boolean {
        return when (packet.packetType) {
            PacketType.PHRASE_OBSERVED -> true

            PacketType.MEANING_PROPOSAL -> {
                val payload = packet.payload as MeaningProposalPayload
                dao.phraseCountById(payload.phraseId) > 0
            }

            PacketType.MEANING_VOTE -> {
                val payload = packet.payload as MeaningVotePayload
                dao.meaningCountById(payload.meaningId) > 0
            }
            PacketType.CORRECTION_PROPOSED -> {
                val payload = packet.payload as CorrectionProposedPayload
                dao.meaningCountById(payload.meaningId) > 0 && dao.phraseCountById(payload.phraseId) > 0 && meaningProposalPacketId(payload.phraseId, payload.meaningId) == packet.parent
            }
            PacketType.CORRECTION_VOTE -> {
                val payload = packet.payload as CorrectionVotePayload
                dao.meaningCountById(payload.meaningId) > 0 && correctionProposalPacketId(payload.phraseId, payload.meaningId, payload.correctionId) == packet.parent
            }
            PacketType.CORRECTION_TOMBSTONE_PROPOSED -> {
                val payload = packet.payload as CorrectionTombstoneProposedPayload
                correctionProposalPacketId(payload.phraseId, payload.meaningId, payload.correctionId) == packet.parent
            }
            PacketType.CORRECTION_TOMBSTONE_VOTE -> {
                val payload = packet.payload as CorrectionTombstoneVotePayload
                tombstoneProposalPacketId(
                    payload.phraseId, payload.meaningId, payload.correctionId, payload.tombstoneId
                ) == packet.parent
            }

            PacketType.SAFETY_LABEL -> {
                val payload = packet.payload as SafetyLabelPayload
                dao.phraseCountById(payload.phraseId) > 0
            }
        }
    }

    private suspend fun receiveDependenciesSatisfied(packet: LmpPacket<PacketPayload>): Boolean {
        val ledger = dao.listPacketsForReplay().map { PacketJsonCodec.decode(it.packetJson) }
        return when (val payload = packet.payload) {
            is PhraseObservedPayload -> true
            is MeaningProposalPayload -> dao.phraseCountById(payload.phraseId) > 0
            is MeaningVotePayload -> dao.meaningCountById(payload.meaningId) > 0
            is CorrectionProposedPayload ->
                dao.phraseCountById(payload.phraseId) > 0 &&
                    ledger.any {
                        it.packetId == packet.parent &&
                            (it.payload as? MeaningProposalPayload)?.let { proposal ->
                                proposal.phraseId == payload.phraseId && proposal.meaningId == payload.meaningId
                            } == true
                    }
            is CorrectionVotePayload ->
                ledger.any {
                    it.packetId == packet.parent &&
                        (it.payload as? CorrectionProposedPayload)?.let { proposal ->
                            proposal.phraseId == payload.phraseId &&
                                proposal.meaningId == payload.meaningId &&
                                proposal.correctionId == payload.correctionId
                        } == true
                }
            is CorrectionTombstoneProposedPayload ->
                ledger.any {
                    it.packetId == packet.parent &&
                        (it.payload as? CorrectionProposedPayload)?.let { proposal ->
                            proposal.phraseId == payload.phraseId &&
                                proposal.meaningId == payload.meaningId &&
                                proposal.correctionId == payload.correctionId
                        } == true
                }
            is CorrectionTombstoneVotePayload ->
                ledger.any {
                    it.packetId == packet.parent &&
                        (it.payload as? CorrectionTombstoneProposedPayload)?.let { proposal ->
                            proposal.phraseId == payload.phraseId &&
                                proposal.meaningId == payload.meaningId &&
                                proposal.correctionId == payload.correctionId &&
                                proposal.tombstoneId == payload.tombstoneId
                        } == true
                }
            is SafetyLabelPayload -> dao.phraseCountById(payload.phraseId) > 0
            else -> false
        }
    }

    private fun requireImportDependencies(
        packets: List<LmpPacket<PacketPayload>>,
        existingLedger: List<LmpPacket<PacketPayload>>
    ) {
        val phraseIds = mutableSetOf<String>()
        val meaningIds = mutableSetOf<String>()
        val meaningProposals = mutableSetOf<Triple<String, String, String>>()
        val correctionProposals = mutableSetOf<Pair<CorrectionDependencyKey, String>>()
        val tombstoneProposals = mutableSetOf<Pair<TombstoneDependencyKey, String>>()

        fun remember(packet: LmpPacket<PacketPayload>) {
            when (val payload = packet.payload) {
                is PhraseObservedPayload -> phraseIds += payload.phraseId
                is MeaningProposalPayload -> {
                    meaningIds += payload.meaningId
                    meaningProposals += Triple(payload.phraseId, payload.meaningId, packet.packetId)
                }
                is CorrectionProposedPayload -> correctionProposals +=
                    CorrectionDependencyKey(payload.phraseId, payload.meaningId, payload.correctionId) to packet.packetId
                is CorrectionTombstoneProposedPayload -> tombstoneProposals +=
                    TombstoneDependencyKey(
                        payload.phraseId, payload.meaningId,
                        payload.correctionId, payload.tombstoneId
                    ) to packet.packetId
                else -> Unit
            }
        }

        existingLedger.forEach(::remember)
        packets.forEach { packet ->
            when (val payload = packet.payload) {
                is PhraseObservedPayload -> phraseIds += payload.phraseId
                is MeaningProposalPayload -> meaningIds += payload.meaningId
                else -> Unit
            }
        }
        for (packet in packets) {
            when (val payload = packet.payload) {
                is PhraseObservedPayload -> Unit
                is MeaningProposalPayload -> require(payload.phraseId in phraseIds) {
                    "Missing phrase dependency: ${payload.phraseId}"
                }
                is MeaningVotePayload -> require(payload.meaningId in meaningIds) {
                    "Missing meaning dependency: ${payload.meaningId}"
                }
                is CorrectionProposedPayload -> require(
                    payload.phraseId in phraseIds && packet.parent != null &&
                        Triple(payload.phraseId, payload.meaningId, packet.parent) in meaningProposals
                ) {
                    "Invalid correction meaning parent: ${payload.meaningId}"
                }
                is CorrectionVotePayload -> require(
                    payload.meaningId in meaningIds && packet.parent != null &&
                        (CorrectionDependencyKey(
                            payload.phraseId,
                            payload.meaningId,
                            payload.correctionId
                        ) to packet.parent) in correctionProposals
                ) {
                    "Invalid correction vote parent: ${payload.correctionId}"
                }
                is CorrectionTombstoneProposedPayload -> require(
                    packet.parent != null &&
                        (CorrectionDependencyKey(
                            payload.phraseId, payload.meaningId, payload.correctionId
                        ) to packet.parent) in correctionProposals
                ) {
                    "Invalid correction tombstone parent: ${payload.tombstoneId}"
                }
                is CorrectionTombstoneVotePayload -> require(
                    packet.parent != null &&
                        (TombstoneDependencyKey(
                            payload.phraseId, payload.meaningId,
                            payload.correctionId, payload.tombstoneId
                        ) to packet.parent) in tombstoneProposals
                ) {
                    "Invalid correction tombstone vote parent: ${payload.tombstoneId}"
                }
                is SafetyLabelPayload -> require(payload.phraseId in phraseIds) {
                    "Missing phrase dependency: ${payload.phraseId}"
                }
                else -> error("Unsupported packet payload")
            }
            when (packet.payload) {
                is MeaningProposalPayload, is CorrectionProposedPayload,
                is CorrectionTombstoneProposedPayload -> remember(packet)
                else -> Unit
            }
        }
    }

    private suspend fun applyPacketToDerivedState(
        packet: LmpPacket<PacketPayload>,
        updatedAt: Long
    ) {
        when (packet.packetType) {
            PacketType.PHRASE_OBSERVED -> {
                val payload = packet.payload as PhraseObservedPayload
                val phrase = PhraseEntity(
                    phraseId = payload.phraseId,
                    surfaceText = payload.surfaceText,
                    phoneticHint = payload.phoneticHint,
                    languageHint = payload.languageHint,
                    safetyLabel = SafetyLabel.NORMAL.wireValue,
                    updatedAt = updatedAt
                )
                val inserted = dao.insertPhrase(phrase)
                if (inserted == -1L) {
                    dao.mergePhrase(
                        phraseId = payload.phraseId,
                        surfaceText = payload.surfaceText,
                        phoneticHint = payload.phoneticHint,
                        languageHint = payload.languageHint,
                        safetyLabel = SafetyLabel.NORMAL.wireValue,
                        updatedAt = updatedAt
                    )
                }
            }
            PacketType.MEANING_PROPOSAL -> {
                val payload = packet.payload as MeaningProposalPayload
                require(dao.phraseCountById(payload.phraseId) > 0) {
                    "Phrase not found: ${payload.phraseId}"
                }
                dao.insertMeaning(
                    MeaningEntity(
                        meaningId = payload.meaningId,
                        phraseId = payload.phraseId,
                        referenceMeaning = payload.referenceMeaning,
                        context = payload.context,
                        confidence = payload.confidence,
                        confirms = 0.0,
                        rejects = 0.0,
                        updatedAt = updatedAt
                    )
                )
            }
            PacketType.MEANING_VOTE -> {
                val payload = packet.payload as MeaningVotePayload
                require(dao.meaningCountById(payload.meaningId) > 0) {
                    "Meaning not found: ${payload.meaningId}"
                }
                dao.insertVote(
                    VoteEntity(
                        votePacketId = packet.packetId,
                        phraseId = payload.phraseId,
                        meaningId = payload.meaningId,
                        vote = payload.vote.wireValue,
                        confidence = payload.confidence,
                        author = packet.author,
                        createdAt = packet.createdAt
                    )
                )
            }
            PacketType.CORRECTION_PROPOSED,
            PacketType.CORRECTION_VOTE,
            PacketType.CORRECTION_TOMBSTONE_PROPOSED,
            PacketType.CORRECTION_TOMBSTONE_VOTE -> Unit
            PacketType.SAFETY_LABEL -> {
                val payload = packet.payload as SafetyLabelPayload
                require(dao.phraseCountById(payload.phraseId) > 0) {
                    "Phrase not found: ${payload.phraseId}"
                }
                dao.updateSafetyLabel(
                    phraseId = payload.phraseId,
                    label = payload.label.wireValue,
                    updatedAt = updatedAt
                )
            }
        }
    }

    private fun phraseIdFor(surfaceText: String): String =
        "phrase_${sha256(surfaceText.lowercase(Locale.ROOT)).take(16)}"

    private fun meaningIdFor(phraseId: String, referenceMeaning: String): String =
        "meaning_${sha256("${phraseId}:${referenceMeaning.lowercase(Locale.ROOT)}").take(16)}"

    private fun correctionIdFor(
        phraseId: String,
        meaningId: String,
        referenceMeaning: String,
        context: String?,
        confidence: Double
    ): String = "correction_${sha256(StableJson.stringify(linkedMapOf(
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "reference_meaning" to referenceMeaning,
        "context" to context,
        "confidence" to confidence
    ))).take(16)}"

    private fun tombstoneIdFor(
        phraseId: String,
        meaningId: String,
        correctionId: String,
        reason: String,
        confidence: Double
    ): String = "tombstone_${sha256(StableJson.stringify(linkedMapOf(
        "phrase_id" to phraseId,
        "meaning_id" to meaningId,
        "correction_id" to correctionId,
        "reason" to reason,
        "confidence" to confidence
    ))).take(16)}"

    private data class CorrectionDependencyKey(
        val phraseId: String,
        val meaningId: String,
        val correctionId: String
    )

    private data class TombstoneDependencyKey(
        val phraseId: String,
        val meaningId: String,
        val correctionId: String,
        val tombstoneId: String
    )

    private fun LmpPacket<PacketPayload>.toEntity(receivedAt: Long): PacketEntity {
        val payloadMap = payload.toStableMap()
        val packetSize = estimatePacketSize(this)

        return PacketEntity(
            packetId = packetId,
            packetType = packetType.wireValue,
            zone = zone,
            author = author,
            parent = parent,
            phraseId = payloadMap["phrase_id"] as? String,
            meaningId = payloadMap["meaning_id"] as? String,
            payloadHash = payloadHash,
            payloadJson = StableJson.stringify(payloadMap),
            packetJson = StableJson.stringify(toStableMap()),
            packetSizeBytes = packetSize.bytes,
            packetSizeClass = packetSize.sizeClass.wireValue,
            sizeRecommendation = packetSize.recommendation,
            createdAt = createdAt,
            receivedAt = receivedAt
        )
    }
}
