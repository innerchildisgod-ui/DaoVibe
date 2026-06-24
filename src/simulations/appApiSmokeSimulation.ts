import { existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { createServer as createHttpServer } from "http";
import type { Server } from "http";
import { LanguageEngine } from "../engine";
import { MyceliumClient } from "../client/MyceliumClient";
import type { ServerConfig } from "../config/env";
import { createServer } from "../server/createServer";
import {
  runCommerceSmokeFlow,
  runKycSmokeFlow,
  runLanguageSmokeFlow,
  runNodeRuntimeSmokeFlow,
} from "./appApiSmokeSimulationFlows";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app_api_smoke_node.db");

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ZONE = "app_api_smoke_simulation_zone";
const AUTHOR = "dev_public_key_app_api_smoke";
const NODE_ID = "node_app_api_smoke";

function clearSqliteDatabase(dbPath: string): void {
  for (const filePath of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function runSimulation(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  clearSqliteDatabase(DB_PATH);

  const config: ServerConfig = {
    port: PORT,
    author: AUTHOR,
    nodeId: NODE_ID,
    nodeAgeGroup: "adult",
    dbPath: DB_PATH,
    defaultDbPath: DB_PATH,
    zone: ZONE,
  };

  const engine = new LanguageEngine({
    zone: config.zone,
    author: config.author,
    nodeAgeGroup: config.nodeAgeGroup,
    dbPath: config.dbPath,
  });
  const app = createServer({
    config,
    engine,
  });
  const server = createHttpServer(app);
  const client = new MyceliumClient({ baseUrl: BASE_URL });

  try {
    await listen(server);

    await runNodeRuntimeSmokeFlow(client);
    await runKycSmokeFlow(engine, client);
    await runLanguageSmokeFlow(client);
    await runCommerceSmokeFlow(engine, client);

    console.log("App API smoke simulation succeeded.");
  } finally {
    await close(server);
  }
}

runSimulation().catch((error) => {
  console.error("App API smoke simulation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
