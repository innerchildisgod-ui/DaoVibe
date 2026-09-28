package org.daovibe.android.core.mycelium

import android.content.Context
import androidx.room.Room
import androidx.room.withTransaction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.daovibe.android.core.protocol.PacketJsonCodec
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.core.storage.PacketEntity

/** Replays a captured ledger in isolated memory using the production repository.
 * Never rebuilds or writes the resident database, and never creates an identity.
 */
object MyceliumStateDiagnostic {
    suspend fun snapshot(context: Context, ledger: List<PacketEntity>): MyceliumStateSnapshot =
        withContext(Dispatchers.IO) {
            val packets = ledger.groupBy { it.packetId }.toSortedMap()
            for ((id, variants) in packets) {
                require(variants.map {
                    PacketJsonCodec.encode(PacketJsonCodec.decode(it.packetJson))
                }.distinct().size == 1) { "Conflicting duplicate packet_id: $id" }
            }
            val scratch = Room.inMemoryDatabaseBuilder(
                context.applicationContext, DaoVibeDatabase::class.java
            ).build()
            try {
                scratch.withTransaction {
                    packets.values.forEach { scratch.daoVibeDao().insertPacket(it.first()) }
                }
                MyceliumStateSnapshot.fromState(
                    LocalMyceliumRepository(scratch).rebuildDerivedStateFromLedger()
                )
            } finally {
                scratch.close()
            }
        }
}
