# Mycelium Storage Migrations

Mycelium uses SQLite for durable local node state. Schema migrations give the app a durable record of which storage setup steps have run, so startup can safely apply pending schema changes as the local database evolves.

## How Migrations Work

- Migrations are defined in `src/storage/sqliteMigrations.ts`.
- Each migration has a stable ordered `migration_id`.
- Startup ensures `schema_migrations` exists, then runs pending migrations.
- Applied migrations are recorded with `applied_at`.
- Existing schema creation remains compatible through `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

## Adding A Migration

1. Add a new `SqliteMigration` entry at the end of `SQLITE_MIGRATIONS`.
2. Use a stable ordered ID, such as `006_short_description`.
3. Keep migration SQL idempotent where practical.
4. Preserve existing user data.
5. Add or update focused tests for the new schema behavior.

## Rules

- Do not drop user data without explicit review.
- Do not rewrite packet history.
- Do not remove existing tables in routine migrations.
- Do not change packet protocol through a storage migration.
- Prefer additive tables, columns, and indexes.
- Use transactions through the migration runner.

## Current Settings Migration

`006_local_node_settings` adds the single-row `local_node_settings` table for durable local app/node configuration. These settings are server/app config only; they are not packet-ledger truth, not sync governance, and not part of the low-level Rust/WASM core.

## Low-Level Boundary

SQLite migration orchestration stays TypeScript for now. Future Rust/WASM work should target packet validation, hashing, signing, canonicalization, ledger verification, ranking, and cryptography first. Database schema migration coordination should remain in the app/server layer unless a native storage engine is introduced later.
