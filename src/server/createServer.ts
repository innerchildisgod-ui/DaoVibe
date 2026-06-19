import express from "express";
import type { Express } from "express";
import { ServerConfig } from "../config/env";
import { LanguageEngine } from "../engine";
import { MyceliumController } from "../mycelium/MyceliumController";
import { SyncController } from "../sync/SyncController";
import { registerLanguageRoutes } from "./routes/languageRoutes";
import { registerSyncRoutes } from "./routes/syncRoutes";

interface CreateServerParams {
  config: ServerConfig;
  engine: LanguageEngine;
}

interface StatusRoutesContext {
  config: ServerConfig;
  myceliumController: MyceliumController;
}

function registerStatusRoutes(
  app: Express,
  { config, myceliumController }: StatusRoutesContext
): void {
  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      name: "DAOVibe Mycelium Engine",
      version: "lmp/0.1",
      status: "running",
      node: {
        node_id: config.nodeId,
        zone: config.zone,
        author: config.author,
        node_age_group: config.nodeAgeGroup,
        db_path: config.dbPath ?? config.defaultDbPath,
        port: config.port,
      },
    });
  });

  app.get("/app/status", (_req, res) => {
    res.json({
      ok: true,
      app: {
        name: "DAOVibe",
        product_layer: "Mycelium",
        mode: {
          local_first: true,
          offline_capable: true,
          online_sync_capable: true,
          p2p_future_capable: true,
        },
      },
      node: {
        node_id: config.nodeId,
        zone: config.zone,
        author: config.author,
        node_age_group: config.nodeAgeGroup,
        db_path: config.dbPath ?? config.defaultDbPath,
        port: config.port,
      },
      local_state: {
        packet_count: myceliumController.packetCount(),
        knowledge_count: myceliumController.listKnowledge().length,
        known_node_count: myceliumController.listNodes().length,
      },
      sync: {
        event_log_sync: true,
        change_only_packets: true,
        cursor_sync_available: true,
        inventory_sync_available: true,
      },
    });
  });
}

export function createServer(params: CreateServerParams): Express {
  const app = express();
  const myceliumController = new MyceliumController(params.engine);
  const syncController = new SyncController(params.engine);

  app.use(express.json());
  registerStatusRoutes(app, {
    config: params.config,
    myceliumController,
  });
  registerLanguageRoutes(app, {
    myceliumController,
  });
  registerSyncRoutes(app, {
    syncController,
    zone: params.config.zone,
    author: params.config.author,
  });

  return app;
}
