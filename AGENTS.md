# DAOVibe Codex Instructions

- Android-first implementation lives in `apps/daovibe-android/`.
- Preserve the existing TypeScript/Mycelium implementation in `src/`; use it as the behavioral reference unless a task explicitly says otherwise.
- Current active product scope is Mycelium/core.
- Do not implement EEE or SBP unless explicitly requested.
- Do not implement KYC, payments, marketplace, compute, or orchestrators unless explicitly requested.
- Keep DAOVibe local-first: resident state stays on device, the packet ledger is the source of truth, and the same valid packets must derive the same state.
- Future networking transfers packets/deltas only, not peer-owned resident state.
- Use Kotlin, Jetpack Compose, Room/SQLite, and coroutines/Flow where useful.
- Keep files small and focused; preserve tests/specs and add appropriate tests after changes.
- Do not use destructive git operations. Never run `git reset --hard`, `git clean -fd`, force checkout/restore, push, or commit unless explicitly requested.
- Never auto-launch GUI applications, browsers, Android Studio, VS Code, ChatGPT, or an Android emulator.
- Never automate mouse/keyboard/screen control, website login, ChatGPT, or external AI providers.
- Run one task at a time. Do not start parallel agents, parallel Codex sessions, or infinite retries.
- Stop after the requested milestone and write a clear handoff.
- For the DAOVibe development workloop, read only `.daovibe/tasks/NEXT_TASK.md` as the task source, run only its requested tests/build checks, write `.daovibe/handoff/latest.md`, and stop.
