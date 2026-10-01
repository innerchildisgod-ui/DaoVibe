package org.daovibe.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.lifecycleScope
import androidx.room.Room
import kotlinx.coroutines.launch
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.connection.PeerRegistryRepository
import org.daovibe.android.core.connection.PeerSyncCoordinator
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.identity.AndroidKeystoreIdentitySecretStorage
import org.daovibe.android.core.pairing.PairingRepository
import org.daovibe.android.core.storage.DaoVibeDatabase
import org.daovibe.android.ui.DaoVibeApp

/** Production-only composition root for the non-exportable identity secret. */
internal fun createProductionIdentitySecretStorage(
    context: android.content.Context
): org.daovibe.android.core.identity.IdentitySecretStorage =
    AndroidKeystoreIdentitySecretStorage(context)

class MainActivity : ComponentActivity() {
    private lateinit var database: DaoVibeDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        database = Room.databaseBuilder(
            applicationContext,
            DaoVibeDatabase::class.java,
            "daovibe_local.db"
        )
            .addMigrations(*DaoVibeDatabase.ALL_MIGRATIONS)
            .build()
        val secretStorage = createProductionIdentitySecretStorage(applicationContext)
        val repository = LocalMyceliumRepository(
            database,
            secretStorage = secretStorage
        )
        val pairingRepository = PairingRepository(database, secretStorage = secretStorage)
        val connectionRepository = ConnectionRepository(database, secretStorage = secretStorage)
        val peerRegistryRepository = PeerRegistryRepository(database, secretStorage = secretStorage)
        val peerSyncCoordinator = PeerSyncCoordinator(peerRegistryRepository, connectionRepository)

        lifecycleScope.launch {
            repository.ensureDeviceIdentity()
            runCatching { repository.identityRepository.ensureIdentityKey() }
        }

        setContent {
            DaoVibeApp(
                repository = repository,
                pairingRepository = pairingRepository,
                connectionRepository = connectionRepository
                ,peerRegistryRepository = peerRegistryRepository
                ,peerSyncCoordinator = peerSyncCoordinator
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
