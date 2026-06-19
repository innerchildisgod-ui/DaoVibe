import Database from "better-sqlite3";

export interface SqliteMigration {
  migration_id: string;
  run: (db: Database.Database) => void;
}

export interface AppliedSchemaMigration {
  migration_id: string;
  applied_at: number;
}

const CREATE_SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
`;

export const SQLITE_MIGRATIONS: SqliteMigration[] = [
  {
    migration_id: "001_initial_packet_ledger",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS packets (
          packet_id TEXT PRIMARY KEY,
          packet_type TEXT NOT NULL,
          zone TEXT NOT NULL,
          author TEXT NOT NULL,
          parent TEXT,
          phrase_id TEXT,
          meaning_id TEXT,
          symbol_id TEXT,
          payload_hash TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          packet_json TEXT NOT NULL,
          packet_size_bytes INTEGER NOT NULL,
          packet_size_class TEXT NOT NULL,
          size_recommendation TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          received_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_packets_phrase_id
          ON packets(phrase_id);

        CREATE INDEX IF NOT EXISTS idx_packets_meaning_id
          ON packets(meaning_id);

        CREATE INDEX IF NOT EXISTS idx_packets_type
          ON packets(packet_type);

        CREATE INDEX IF NOT EXISTS idx_packets_zone
          ON packets(zone);
      `);
    },
  },
  {
    migration_id: "002_phrase_knowledge_tables",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS phrases (
          phrase_id TEXT PRIMARY KEY,
          surface_text TEXT,
          phonetic_hint TEXT,
          language_hint TEXT,
          safety_label TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meanings (
          meaning_id TEXT PRIMARY KEY,
          phrase_id TEXT NOT NULL,
          reference_meaning TEXT NOT NULL,
          context TEXT,
          confidence REAL NOT NULL,
          confirms INTEGER NOT NULL,
          rejects INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_meanings_phrase_id
          ON meanings(phrase_id);

        CREATE TABLE IF NOT EXISTS votes (
          vote_packet_id TEXT PRIMARY KEY,
          phrase_id TEXT NOT NULL,
          meaning_id TEXT NOT NULL,
          vote TEXT NOT NULL,
          confidence REAL NOT NULL,
          author TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    migration_id: "003_sync_cursors",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS peer_sync_cursors (
          peer_author TEXT PRIMARY KEY,
          cursor TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    migration_id: "004_local_node_identity",
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS local_node_identity (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          node_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          default_author TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
  {
    migration_id: "005_phrase_scoped_packet_indexes",
    run: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_packets_phrase_type_received
          ON packets(phrase_id, packet_type, received_at, packet_id);

        CREATE INDEX IF NOT EXISTS idx_packets_type_received
          ON packets(packet_type, received_at, packet_id);
      `);
    },
  },
];

export function runSqliteMigrations(db: Database.Database): void {
  ensureSchemaMigrationsTable(db);

  const appliedMigrationIds = new Set(
    listAppliedSchemaMigrations(db).map((migration) => migration.migration_id)
  );
  const applyMigration = db.transaction((migration: SqliteMigration) => {
    migration.run(db);
    db.prepare(
      `
      INSERT INTO schema_migrations (migration_id, applied_at)
      VALUES (?, ?)
    `
    ).run(migration.migration_id, currentUnixSeconds());
  });

  for (const migration of SQLITE_MIGRATIONS) {
    if (appliedMigrationIds.has(migration.migration_id)) {
      continue;
    }

    applyMigration(migration);
    appliedMigrationIds.add(migration.migration_id);
  }
}

export function listAppliedSchemaMigrations(
  db: Database.Database
): AppliedSchemaMigration[] {
  ensureSchemaMigrationsTable(db);

  return db
    .prepare(
      `
      SELECT migration_id, applied_at
      FROM schema_migrations
      ORDER BY migration_id ASC
    `
    )
    .all() as AppliedSchemaMigration[];
}

function ensureSchemaMigrationsTable(db: Database.Database): void {
  db.exec(CREATE_SCHEMA_MIGRATIONS_TABLE);
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
