# Mycelium v0.1 Alpha operator guide

Commands below are the current Clap commands. Run PowerShell from the stated
directory. Replace `<DATA_DIR>`, `<NODE_ID>`, and `<PAIRING_ID>` with local test
values; do not paste secrets into copied diagnostics.

## Rust desktop node

```powershell
cd C:\Users\ADMIN\DaoVibe\apps\daovibe-desktop-node
cargo +1.90.0-x86_64-pc-windows-gnu build
.\target\debug\daovibe-desktop.exe --version
.\target\debug\daovibe-desktop.exe --help
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> identity
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> listen --host 127.0.0.1 --port 4242
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> ledger status
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> state
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> state-hash
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> mycelium-check
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> sync-status
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer list
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer add <NODE_ID> 127.0.0.1 4242 <PAIRING_ID> --name "Test peer"
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer remove <NODE_ID>
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer sync <NODE_ID>
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer sync-all
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer diagnose <NODE_ID>
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer invite create 127.0.0.1 4242 <PAIRING_ID> --ttl-seconds 86400
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer invite parse <PAYLOAD>
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> peer invite import <PAYLOAD>
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> pairing list
.\target\debug\daovibe-desktop.exe --data-dir <DATA_DIR> pairing offer .\offer.json --yes --output .\approval.json
```

`peer invite` and `pairing` are development correlation workflows only. They
do not authenticate a node or encrypt transport.

The debug binary is `apps\daovibe-desktop-node\target\debug\daovibe-desktop.exe`.

## Android build and APK

```powershell
cd C:\Users\ADMIN\DaoVibe\apps\daovibe-android
.\gradlew.bat testDebugUnitTest --no-daemon --console=plain
.\gradlew.bat assembleDebug --no-daemon --console=plain
Get-Item .\app\build\outputs\apk\debug\app-debug.apk
adb install -r .\app\build\outputs\apk\debug\app-debug.apk
```

The app package is `org.daovibe.android`, version name `0.1-alpha`, version
code `1`, and the exact debug APK path is
`apps\daovibe-android\app\build\outputs\apk\debug\app-debug.apk`.
The optional `adb install` command is operator-run and is not physical testing
performed by Codex.

## Android UI paths

- Device: identity/node ID, state fingerprint, **Mycelium alpha readiness**,
  **Run check**, and **Copy diagnostics**.
- Network: manually configured peers, **Diagnose**, **Sync**, **Sync all**, and
  peer diagnostics. Diagnose is handshake-only.
- Settings: **Export Ledger** and **Import Ledger**. Import never replaces the
  local node identity.
- Mycelium: create phrase observations and meaning proposals/votes.

