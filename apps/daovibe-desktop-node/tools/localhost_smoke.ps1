param(
    [string]$Binary = "cargo run --quiet --",
    [string]$DataDirectory = (Join-Path $env:TEMP "daovibe-desktop-smoke")
)

# This is an explicit localhost smoke test, not part of the normal Android
# Gradle suite. It checks that the Rust listener can be started and accepts a
# framed Android-compatible CONNECTION_HELLO after a persisted pairing. A
# full Android-to-Rust test can use the same fixture files and framing.
$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath $DataDirectory) { Remove-Item -LiteralPath $DataDirectory -Recurse -Force }
New-Item -ItemType Directory -Path $DataDirectory | Out-Null
$offerPath = Join-Path $PSScriptRoot "..\..\..\protocol-fixtures\pairing_offer.json"
if (-not (Test-Path -LiteralPath $offerPath)) { throw "Run from the promoted repository layout with protocol-fixtures present." }

Write-Host "Use the explicit Rust listener command with --data-dir $DataDirectory and a test port."
Write-Host "Then use the Android loopback tests or a Kotlin/JVM client to send the shared fixtures."
Write-Host "This script intentionally does not claim physical phone reachability."
