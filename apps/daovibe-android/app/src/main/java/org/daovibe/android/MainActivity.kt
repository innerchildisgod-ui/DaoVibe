package org.daovibe.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import androidx.room.Room
import kotlinx.coroutines.launch
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.pairing.PairingRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.ui.DaoVibeApp

class MainActivity : ComponentActivity() {
    private lateinit var database: DaoVibeDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        database = Room.databaseBuilder(
            applicationContext,
            DaoVibeDatabase::class.java,
            "daovibe_local.db"
        )
            .addMigrations(DaoVibeDatabase.MIGRATION_1_2)
            .addMigrations(DaoVibeDatabase.MIGRATION_2_3)
            .addMigrations(DaoVibeDatabase.MIGRATION_3_4)
            .build()
        val repository = LocalMyceliumRepository(database)
        val pairingRepository = PairingRepository(database)
        val connectionRepository = ConnectionRepository(database)

        lifecycleScope.launch {
            repository.ensureDeviceIdentity()
        }

        setContent {
            DaoVibeApp(
                repository = repository,
                pairingRepository = pairingRepository,
                connectionRepository = connectionRepository
            )
        }
    }

    override fun onDestroy() {
        if (::database.isInitialized) {
            database.close()
        }
        super.onDestroy()
    }
}
