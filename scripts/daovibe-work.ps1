[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Conservative laptop defaults. Adjust here when needed.
$MinimumFreeMemoryGb = 2.0
$MinimumFreeDiskGb = 5.0
$MaxRuntimeMinutes = 90
$BlockedOutputPattern = "(?i)\b(auth(?:entication|orization)? (?:failed|required|error)|not authenticated|unauthorized|forbidden|not logged in|login required|login to|log in to|sign in|usage limit|rate limit|quota exceeded|insufficient_quota|payment required|billing required|billing problem|subscription required|upgrade required|approval required|requires approval|manual setup)\b"

function Get-IsoNow {
    return (Get-Date).ToString("o")
}

function Find-RepoRoot {
    param([string]$StartPath)

    $current = (Resolve-Path -LiteralPath $StartPath).Path
    while ($true) {
        if ((Test-Path -LiteralPath (Join-Path $current ".git")) -and
            (Test-Path -LiteralPath (Join-Path $current ".daovibe"))) {
            return $current
        }

        $parent = Split-Path -Parent $current
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
            throw "Could not find DAOVibe repository root from $StartPath"
        }
        $current = $parent
    }
}

function Write-AtomicText {
    param(
        [string]$Path,
        [string]$Content
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $tempPath = Join-Path $directory (".tmp-" + [guid]::NewGuid().ToString("N") + ".tmp")
    Set-Content -LiteralPath $tempPath -Value $Content -Encoding UTF8
    Move-Item -LiteralPath $tempPath -Destination $Path -Force
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Convert-ToRelativePath {
    param(
        [string]$Root,
        [string]$Path
    )

    $rootWithSlash = $Root.TrimEnd("\") + "\"
    if ($Path.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $Path.Substring($rootWithSlash.Length)
    }
    return $Path
}

function Resolve-CodexCliPath {
    foreach ($commandName in @("codex.cmd", "codex.exe", "codex")) {
        foreach ($command in @(Get-Command $commandName -ErrorAction SilentlyContinue)) {
            if ([string]::IsNullOrWhiteSpace($command.Source)) {
                continue
            }
            if ($command.Source.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }
            return $command.Source
        }
    }

    $psShim = Get-Command codex -ErrorAction SilentlyContinue
    if ($psShim -and $psShim.Source -and $psShim.Source.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Only the PowerShell Codex shim was found at $($psShim.Source), and Windows execution policy may block it. Install or expose codex.cmd on PATH."
    }

    throw "Codex CLI was not found on PATH."
}

function Test-TaskReady {
    param([string]$Content)

    if ([string]::IsNullOrWhiteSpace($Content)) {
        return $false
    }
    if ($Content -match "TEMPLATE ONLY") {
        return $false
    }

    $meaningful = @()
    foreach ($line in ($Content -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0) { continue }
        if ($trimmed.StartsWith("#")) { continue }
        if ($trimmed.StartsWith("<!--") -and $trimmed.EndsWith("-->")) { continue }
        if ($trimmed -match "^(TODO|TBD|\[fill|_fill)") { continue }
        $meaningful += $trimmed
    }

    return (($meaningful -join "").Trim().Length -gt 0)
}

function Get-GitStatusShort {
    param([string]$Root)

    Push-Location $Root
    try {
        $output = git status --short 2>&1
        if ($LASTEXITCODE -ne 0) {
            return @("git status failed: " + ($output -join "`n"))
        }
        return @($output)
    } finally {
        Pop-Location
    }
}

function Get-ResourceSnapshot {
    param([string]$Root)

    $os = Get-CimInstance Win32_OperatingSystem
    $freeMemoryGb = [math]::Round(($os.FreePhysicalMemory * 1KB) / 1GB, 2)
    $driveName = (Split-Path -Qualifier $Root).TrimEnd(":")
    $drive = Get-PSDrive -Name $driveName
    $freeDiskGb = [math]::Round($drive.Free / 1GB, 2)

    return [pscustomobject]@{
        FreeMemoryGb = $freeMemoryGb
        FreeDiskGb = $freeDiskGb
    }
}

function Get-HandoffResult {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $text = Get-Content -LiteralPath $Path -Raw
    $inResult = $false
    foreach ($line in ($text -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ($inResult) {
            if ($trimmed.Length -eq 0) {
                continue
            }

            $lower = $trimmed.ToLowerInvariant()
            if ($lower -in @("success", "failed", "blocked")) {
                return $lower
            }
            return $null
        }

        if ($trimmed -eq "## Result") {
            $inResult = $true
        }
    }
    return $null
}

function Test-BlockedOutput {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $false
    }

    return ($Text -match $BlockedOutputPattern)
}

function New-FallbackHandoff {
    param(
        [string]$TaskName,
        [string]$StartedAt,
        [string]$FinishedAt,
        [string]$Result,
        [int]$ExitCode,
        [string]$Message,
        [string[]]$GitBefore,
        [string[]]$GitAfter
    )

    $before = if ($GitBefore.Count -gt 0) { $GitBefore -join "`n" } else { "(clean or no output)" }
    $after = if ($GitAfter.Count -gt 0) { $GitAfter -join "`n" } else { "(clean or no output)" }

    return @"
# DAOVibe Codex Handoff

## Task

$TaskName

## Started

$StartedAt

## Finished

$FinishedAt

## Result

$Result

## Files Created

See git status below.

## Files Modified

See git status below.

## Files Deleted

See git status below.

## Tests Run

Unknown. Inspect the log file.

## Test Results

Unknown. Inspect the log file.

## Build Checks

Unknown. Inspect the log file.

## Problems Found

$Message

## Decisions Made

The workloop generated this fallback handoff because Codex did not produce a complete handoff.

## Unresolved Issues

Review the log and rerun only after ChatGPT/user decides the next action.

## Git Status

Before:

````text
$before
````

After:

````text
$after
````

Exit code: $ExitCode

## Recommended Next Step

Return this handoff to ChatGPT.
"@
}

if ($ValidateOnly) {
    Write-Host "PowerShell syntax OK."
    exit 0
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Find-RepoRoot $scriptDirectory
$tasksDirectory = Join-Path $repoRoot ".daovibe\tasks"
$statusDirectory = Join-Path $repoRoot ".daovibe\status"
$handoffDirectory = Join-Path $repoRoot ".daovibe\handoff"
$logsDirectory = Join-Path $repoRoot ".daovibe\logs"
$nextTaskPath = Join-Path $tasksDirectory "NEXT_TASK.md"
$statusPath = Join-Path $statusDirectory "status.json"
$lockPath = Join-Path $statusDirectory "workloop.lock"
$handoffPath = Join-Path $handoffDirectory "latest.md"

foreach ($directory in @($tasksDirectory, $statusDirectory, $handoffDirectory, $logsDirectory)) {
    Ensure-Directory -Path $directory
}

function Write-StatusFile {
    param(
        [string]$State,
        [string]$TaskName,
        [string]$StartedAt,
        [string]$FinishedAt,
        [Nullable[int]]$ExitCode,
        [string]$LogFile,
        [string]$Message
    )

    $status = [ordered]@{
        task = $TaskName
        state = $State
        started_at = $StartedAt
        finished_at = $FinishedAt
        exit_code = $ExitCode
        log_file = $LogFile
        message = $Message
    }

    Write-AtomicText -Path $statusPath -Content ($status | ConvertTo-Json -Depth 4)
}

function Stop-Blocked {
    param(
        [string]$TaskName,
        [string]$Message,
        [int]$ExitCode = 2
    )

    $finishedAt = Get-IsoNow
    $gitAfter = Get-GitStatusShort -Root $repoRoot
    Write-StatusFile -State "blocked" -TaskName $TaskName -StartedAt $null -FinishedAt $finishedAt -ExitCode $ExitCode -LogFile $null -Message $Message

    $fallback = New-FallbackHandoff -TaskName $TaskName -StartedAt "N/A" -FinishedAt $finishedAt -Result "blocked" -ExitCode $ExitCode -Message $Message -GitBefore @() -GitAfter $gitAfter
    Write-AtomicText -Path $handoffPath -Content $fallback

    Write-Host "BLOCKED: $Message"
    exit $ExitCode
}

if (-not (Test-Path -LiteralPath $nextTaskPath)) {
    Stop-Blocked -TaskName "missing NEXT_TASK.md" -Message "Missing .daovibe/tasks/NEXT_TASK.md"
}

$taskText = Get-Content -LiteralPath $nextTaskPath -Raw
if (-not (Test-TaskReady -Content $taskText)) {
    Stop-Blocked -TaskName "template or empty NEXT_TASK.md" -Message "Fill .daovibe/tasks/NEXT_TASK.md with one concrete task first."
}

if (Test-Path -LiteralPath $lockPath) {
    Write-Host "BLOCKED: Workloop lock exists at .daovibe/status/workloop.lock"
    Write-Host "Remove it manually only if you are certain no DAOVibe workloop is running."
    exit 2
}

try {
    $resources = Get-ResourceSnapshot -Root $repoRoot
} catch {
    Stop-Blocked -TaskName "resource preflight failed" -Message "Could not read free RAM/disk before starting: $($_.Exception.Message)"
}

if ($resources.FreeMemoryGb -lt $MinimumFreeMemoryGb) {
    Stop-Blocked -TaskName "low memory" -Message "Available RAM $($resources.FreeMemoryGb) GB is below threshold $MinimumFreeMemoryGb GB."
}

if ($resources.FreeDiskGb -lt $MinimumFreeDiskGb) {
    Stop-Blocked -TaskName "low disk" -Message "Free disk $($resources.FreeDiskGb) GB is below threshold $MinimumFreeDiskGb GB."
}

try {
    $codexCliPath = Resolve-CodexCliPath
} catch {
    Stop-Blocked -TaskName "codex missing" -Message $_.Exception.Message
}

$startedAt = Get-IsoNow
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logsDirectory ("codex-$timestamp.log")
$errorLogPath = Join-Path $logsDirectory ("codex-$timestamp.err.log")
$promptPath = Join-Path $statusDirectory ("codex-prompt-$timestamp.md")
$relativeLogPath = Convert-ToRelativePath -Root $repoRoot -Path $logPath
$taskName = "NEXT_TASK.md"
$gitBefore = Get-GitStatusShort -Root $repoRoot

$lock = [ordered]@{
    pid = $PID
    started_at = $startedAt
    task = $taskName
    log_file = $relativeLogPath
}
try {
    New-Item -ItemType File -LiteralPath $lockPath -Value ($lock | ConvertTo-Json -Depth 4) -ErrorAction Stop | Out-Null
} catch {
    if (Test-Path -LiteralPath $lockPath) {
        Write-Host "BLOCKED: Workloop lock exists at .daovibe/status/workloop.lock"
        Write-Host "Remove it manually only if you are certain no DAOVibe workloop is running."
        exit 2
    }

    Stop-Blocked -TaskName "workloop lock unavailable" -Message "Could not create .daovibe/status/workloop.lock: $($_.Exception.Message)"
}

$finalState = "failed"
$exitCode = 1
$message = "Task did not complete."

try {
    Write-StatusFile -State "running" -TaskName $taskName -StartedAt $startedAt -FinishedAt $null -ExitCode $null -LogFile $relativeLogPath -Message "Codex is running one local task."

    $prompt = @"
You are Codex working in the DAOVibe repository.

Follow AGENTS.md.
Perform exactly one task from .daovibe/tasks/NEXT_TASK.md.
Run the tests and build checks requested by that task.
Do not launch GUI applications, browsers, Android Studio, VS Code, emulators, ChatGPT, or other AI agents.
Do not start another Codex process.
Do not use paid APIs, OpenAI API keys, browser automation, screen automation, auto-login, git commit, git push, or destructive git commands.
Do not retry automatically. If auth, login, usage limit, quota, billing, payment, approval, network, or manual setup blocks progress, write Result: blocked.

Before exiting, write .daovibe/handoff/latest.md in this exact structure:

# DAOVibe Codex Handoff

## Task

## Started

## Finished

## Result

Write exactly one of: success, failed, blocked

## Files Created

## Files Modified

## Files Deleted

## Tests Run

## Test Results

## Build Checks

## Problems Found

## Decisions Made

## Unresolved Issues

## Git Status

## Recommended Next Step

Your final response must be exactly the same handoff markdown, with no extra text before or after it.

Then STOP.

<NEXT_TASK.md>
$taskText
</NEXT_TASK.md>
"@
    Write-AtomicText -Path $promptPath -Content $prompt

    $arguments = @(
        "--ask-for-approval", "never",
        "exec",
        "--cd", $repoRoot,
        "--sandbox", "workspace-write",
        "--color", "never",
        "--output-last-message", $handoffPath,
        "-"
    )

    $process = Start-Process -FilePath $codexCliPath `
        -ArgumentList $arguments `
        -RedirectStandardInput $promptPath `
        -RedirectStandardOutput $logPath `
        -RedirectStandardError $errorLogPath `
        -NoNewWindow `
        -PassThru

    $timeoutMilliseconds = [int]($MaxRuntimeMinutes * 60 * 1000)
    $completed = $process.WaitForExit($timeoutMilliseconds)

    if (-not $completed) {
        $message = "Codex exceeded timeout of $MaxRuntimeMinutes minutes."
        try {
            [void]$process.CloseMainWindow()
            Start-Sleep -Seconds 10
            if (-not $process.HasExited) {
                $process.Kill()
            }
        } catch {
            $message = "$message Termination attempt reported: $($_.Exception.Message)"
        }
        $exitCode = 124
        $finalState = "failed"
    } else {
        $exitCode = $process.ExitCode
        $combinedLog = ""
        if (Test-Path -LiteralPath $logPath) {
            $combinedLog += Get-Content -LiteralPath $logPath -Raw
        }
        if (Test-Path -LiteralPath $errorLogPath) {
            $combinedLog += "`n" + (Get-Content -LiteralPath $errorLogPath -Raw)
        }

        $handoffResult = Get-HandoffResult -Path $handoffPath
        $handoffText = ""
        if (Test-Path -LiteralPath $handoffPath) {
            $handoffText = Get-Content -LiteralPath $handoffPath -Raw
        }

        if (Test-BlockedOutput -Text ($combinedLog + "`n" + $handoffText)) {
            $finalState = "blocked"
            $message = "Codex appears blocked by auth, usage, quota, billing, payment, approval, or manual setup."
        } elseif ($handoffResult -in @("success", "failed", "blocked")) {
            $finalState = $handoffResult
            $message = "Codex handoff result: $handoffResult"
        } elseif ($exitCode -eq 0) {
            $finalState = "success"
            $message = "Codex exited successfully."
        } else {
            $finalState = "failed"
            $message = "Codex exited with code $exitCode."
        }
    }
} finally {
    $gitAfter = Get-GitStatusShort -Root $repoRoot
    $finishedAt = Get-IsoNow

    if (-not (Test-Path -LiteralPath $handoffPath) -or
        [string]::IsNullOrWhiteSpace((Get-Content -LiteralPath $handoffPath -Raw)) -or
        -not (Get-HandoffResult -Path $handoffPath)) {
        $fallback = New-FallbackHandoff -TaskName $taskName -StartedAt $startedAt -FinishedAt $finishedAt -Result $finalState -ExitCode $exitCode -Message $message -GitBefore $gitBefore -GitAfter $gitAfter
        Write-AtomicText -Path $handoffPath -Content $fallback
    }

    Write-StatusFile -State $finalState -TaskName $taskName -StartedAt $startedAt -FinishedAt $finishedAt -ExitCode $exitCode -LogFile $relativeLogPath -Message $message

    if (Test-Path -LiteralPath $lockPath) {
        Remove-Item -LiteralPath $lockPath -Force
    }
}

Write-Host "================================"
Write-Host "DAOVibe task finished"
Write-Host "Status: $($finalState.ToUpperInvariant())"
Write-Host "Review:"
Write-Host ".daovibe/handoff/latest.md"
Write-Host "Log:"
Write-Host $relativeLogPath
Write-Host "Return that handoff to ChatGPT."
Write-Host "================================"

if ($finalState -eq "success") { exit 0 }
if ($finalState -eq "blocked") { exit 2 }
if ($exitCode -ne 0) { exit $exitCode }
exit 1
