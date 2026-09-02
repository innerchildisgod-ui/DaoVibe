package org.daovibe.android.core.storage

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        DeviceIdentityEntity::class,
        PacketEntity::class,
        PhraseEntity::class,
        MeaningEntity::class,
        VoteEntity::class,
        SyncCursorEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class DaoVibeDatabase : RoomDatabase() {
    abstract fun daoVibeDao(): DaoVibeDao
}
