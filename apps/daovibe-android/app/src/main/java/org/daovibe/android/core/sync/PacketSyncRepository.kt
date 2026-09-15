package org.daovibe.android.core.sync

import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.protocol.PacketValidator
import org.daovibe.android.core.storage.DaoVibeDatabase
import java.nio.charset.StandardCharsets

class PacketSyncRepository(
    private val database: DaoVibeDatabase,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000L },
    private val myceliumRepository: LocalMyceliumRepository =
        LocalMyceliumRepository(database, nowSeconds)
) {
    private val dao = database.daoVibeDao()
    private val validator = PacketValidator()

    suspend fun loadInboundCursor(
        remoteNodeId: String,
        pairingId: String
    ): String {
        val state = dao.getPeerSyncState(remoteNodeId) ?: return START_SYNC_CURSOR
        if (state.pairingId != pairingId) {
            throw SyncProtocolException(
                reason = SyncRejectReason.PAIRING_MISMATCH,
                message = "Stored sync cursor belongs to another pairing"
            )
        }

        SyncProtocol.decodeCursor(state.inboundCursor)
        return state.inboundCursor
    }

    suspend fun exportWindow(request: SyncRequest): SyncBatch {
        SyncProtocol.validateRequest(request)
        val cursor = SyncProtocol.decodeCursor(request.cursor)
        val requestedLimit = SyncProtocol.clampLimit(request.limit)
        val candidateRows = dao.listPacketsAfterCursor(
            receivedAt = cursor.receivedAt,
            packetId = cursor.packetId,
            limit = MAX_PACKETS_PER_SYNC_BATCH + 1
        )

        if (candidateRows.isEmpty()) {
            return SyncProtocol.createBatch(
                request = request,
                packets = emptyList(),
                nextCursor = request.cursor,
                hasMore = false
            )
        }

        val selectedPackets = mutableListOf<
            org.daovibe.android.core.protocol.LmpPacket<
                org.daovibe.android.core.protocol.PacketPayload
            >
            >()
        var nextCursor = request.cursor
        val rowLimit = minOf(requestedLimit, candidateRows.size)

        for (index in 0 until rowLimit) {
            val row = candidateRows[index]
            val packet = PacketJsonCodec.decode(row.packetJson)
            val validation = validator.validate(packet)
            if (!validation.valid) {
                throw SyncProtocolException(
                    reason = SyncRejectReason.INVALID_PACKET,
                    message =
                        "Cannot export invalid packet ${packet.packetId}: " +
                            validation.errors.joinToString(", ")
                )
            }

            val candidateNextCursor = SyncProtocol.cursorFor(
                receivedAt = row.receivedAt,
                packetId = row.packetId
            )
            val candidateHasMore = index + 1 < candidateRows.size
            val candidatePackets = selectedPackets + packet
            val candidateBatch = try {
                SyncProtocol.createBatch(
                    request = request,
                    packets = candidatePackets,
                    nextCursor = candidateNextCursor,
                    hasMore = candidateHasMore
                )
            } catch (error: SyncProtocolException) {
                if (
                    error.reason == SyncRejectReason.BATCH_TOO_LARGE &&
                    selectedPackets.isEmpty()
                ) {
                    throw SyncProtocolException(
                        reason = SyncRejectReason.PACKET_TOO_LARGE,
                        message =
                            "Packet ${packet.packetId} cannot fit in the " +
                                "$MAX_SYNC_BATCH_BYTES byte sync batch limit"
                    )
                }
                if (error.reason == SyncRejectReason.BATCH_TOO_LARGE) {
                    break
                }
                throw error
            }

            val candidateBytes = candidateBatch.toCanonicalJson()
                .toByteArray(StandardCharsets.UTF_8)
                .size
            if (candidateBytes > MAX_SYNC_BATCH_BYTES) {
                if (selectedPackets.isEmpty()) {
                    throw SyncProtocolException(
                        reason = SyncRejectReason.PACKET_TOO_LARGE,
                        message =
                            "Packet ${packet.packetId} cannot fit in the " +
                                "$MAX_SYNC_BATCH_BYTES byte sync batch limit"
                    )
                }
                break
            }

            selectedPackets += packet
            nextCursor = candidateNextCursor
        }

        if (selectedPackets.isEmpty()) {
            throw SyncProtocolException(
                reason = SyncRejectReason.PACKET_TOO_LARGE,
                message = "No packet can fit in the sync batch limit"
            )
        }

        return SyncProtocol.createBatch(
            request = request,
            packets = selectedPackets,
            nextCursor = nextCursor,
            hasMore = candidateRows.size > selectedPackets.size
        )
    }

    suspend fun importBatch(
        batch: SyncBatch,
        remoteNodeId: String,
        pairingId: String,
        importedAt: Long = nowSeconds()
    ): SyncImportResult =
        myceliumRepository.importSyncBatchAtomically(
            batch = batch,
            remoteNodeId = remoteNodeId,
            pairingId = pairingId,
            importedAt = importedAt
        )
}
