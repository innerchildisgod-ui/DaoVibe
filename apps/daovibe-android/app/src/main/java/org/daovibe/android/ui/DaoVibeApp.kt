package org.daovibe.android.ui

import androidx.compose.animation.Crossfade
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import org.daovibe.android.core.connection.ConnectionRepository
import org.daovibe.android.core.mycelium.LocalMyceliumRepository
import org.daovibe.android.core.mycelium.LocalMyceliumSnapshot
import org.daovibe.android.core.mycelium.MyceliumState
import org.daovibe.android.core.pairing.PairingRepository

@Composable
fun DaoVibeApp(
    repository: LocalMyceliumRepository,
    pairingRepository: PairingRepository,
    connectionRepository: ConnectionRepository
) {
    val snapshot by repository.observeSnapshot().collectAsState(
        initial = LocalMyceliumSnapshot(
            identity = null,
            state = MyceliumState(emptyList()),
            recentPackets = emptyList()
        )
    )
    var showSplash by remember { mutableStateOf(true) }
    var destination by rememberSaveable { mutableStateOf(DaoVibeDestination.Home) }

    LaunchedEffect(Unit) {
        repository.ensureDeviceIdentity()
        delay(1_050L)
        showSplash = false
    }

    DaoVibeTheme {
        Crossfade(targetState = showSplash, label = "daovibe_root") { splashVisible ->
            if (splashVisible) {
                SplashScreen()
            } else {
                DaoVibeScreenScaffold(
                    currentDestination = destination,
                    onNavigate = { destination = it }
                ) {
                    when (destination) {
                        DaoVibeDestination.Home -> HomeScreen(
                            snapshot = snapshot,
                            onNavigate = { destination = it }
                        )
                        DaoVibeDestination.Mycelium -> MyceliumScreen(
                            snapshot = snapshot,
                            repository = repository
                        )
                        DaoVibeDestination.Ledger -> LedgerScreen(snapshot)
                        DaoVibeDestination.Device -> DeviceScreen(
                            snapshot = snapshot,
                            repository = repository,
                            pairingRepository = pairingRepository
                        )
                        DaoVibeDestination.Network -> NetworkScreen(connectionRepository)
                        DaoVibeDestination.Settings -> SettingsScreen(repository)
                    }
                }
            }
        }
    }
}

internal enum class DaoVibeDestination(
    val label: String,
    val screenTitle: String,
    val screenSubtitle: String
) {
    Home(
        label = "Home",
        screenTitle = "DAOVibe",
        screenSubtitle = "Local node ready"
    ),
    Mycelium(
        label = "Mycelium",
        screenTitle = "Mycelium",
        screenSubtitle = "Language & shared meaning"
    ),
    Ledger(
        label = "Ledger",
        screenTitle = "Packet Ledger",
        screenSubtitle = "Local source of truth"
    ),
    Device(
        label = "Device",
        screenTitle = "Device",
        screenSubtitle = "Your local DAOVibe node"
    ),
    Network(
        label = "Network",
        screenTitle = "Network",
        screenSubtitle = "Internet peer connection"
    ),
    Settings(
        label = "Settings",
        screenTitle = "Settings",
        screenSubtitle = "Local app controls"
    )
}
