# DAOVibe Development Workloop

The local workloop is:

```text
ChatGPT
  -> .daovibe/tasks/NEXT_TASK.md
  -> .\scripts\daovibe-work.ps1
  -> codex exec
  -> tests/build requested by the task
  -> .daovibe/handoff/latest.md
  -> ChatGPT
```

## Setup

1. Make sure the Codex CLI is installed and authenticated manually.
2. On Windows PowerShell, make sure `codex.cmd` is available on `PATH`.
3. Fill `.daovibe/tasks/NEXT_TASK.md` using `.daovibe/tasks/TASK_TEMPLATE.md`.
4. Keep each task scoped to one milestone.

The workloop does not use OpenAI API keys, paid APIs, browser automation, ChatGPT automation, or GUI application launches.
It launches one `codex exec` process, waits for that process to exit, writes logs/status/handoff files, and stops.

## Normal Command

From the repository root:

```powershell
.\scripts\daovibe-work.ps1
```

If PowerShell script execution is restricted for local scripts, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daovibe-work.ps1
```

To validate the script without running a task:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\daovibe-work.ps1 -ValidateOnly
```

## Status Meanings

- `idle`: no task is running.
- `running`: the script has launched one `codex exec` process.
- `success`: Codex exited successfully and produced a handoff.
- `failed`: Codex or a required check failed.
- `blocked`: manual setup is needed, such as login, usage limit resolution, payment/auth requirement, low RAM, low disk space, or a stale lock.

Status is written to `.daovibe/status/status.json` with atomic file replacement.

## Logs And Handoff

- Logs: `.daovibe/logs/`
- Latest handoff: `.daovibe/handoff/latest.md`
- Lock file: `.daovibe/status/workloop.lock`

The script does not open the handoff, a browser, ChatGPT, VS Code, Android Studio, or an emulator.
It does not commit, push, reset, clean, relaunch Codex, or retry automatically.

## Blocked Recovery

Read `.daovibe/status/status.json` and `.daovibe/handoff/latest.md`.

If blocked by Codex auth or usage limits, resolve that manually with the official Codex CLI/login flow, then run the script again.

If blocked by low resources, close applications or free disk space manually. The script does not delete caches or kill unrelated processes.

## Stale Lock Recovery

If `.daovibe/status/workloop.lock` exists and you are certain no DAOVibe workloop is running, remove only that lock file manually:

```powershell
Remove-Item -LiteralPath .\.daovibe\status\workloop.lock
```

Then rerun the normal command.

## Resource Thresholds

The script defines configurable values near the top:

- minimum free RAM in GB
- minimum free disk space in GB
- maximum task runtime in minutes

Change those values in `scripts/daovibe-work.ps1` when needed.

## Failure Inspection

Open the timestamped log in `.daovibe/logs/`, inspect `git status --short`, and return `.daovibe/handoff/latest.md` to ChatGPT.
