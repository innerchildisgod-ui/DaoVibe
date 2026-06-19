import { Server as HttpServer } from "http";
import { readServerConfig, ServerConfig } from "../config/env";
import { LanguageEngine } from "../engine";
import { NodeProfile } from "../network/nodeProfile";
import { createServer } from "./createServer";

function addTemporaryDevNodes(
  engine: LanguageEngine,
  config: ServerConfig
): void {
  const now = Math.floor(Date.now() / 1000);
  const nodes: NodeProfile[] = [
    {
      node_id: config.nodeId,
      public_key: config.author,
      zone: config.zone,
      roles: ["laptop_worker", "validator", "zone_index"],
      age_group: config.nodeAgeGroup,
      trusted_score: 0.92,
      online: true,
      supported_languages: ["Tamil", "Tamil-English slang", "English"],
      supported_regions: ["Chennai"],
      current_load: 0.2,
      last_seen: now,
    },
    {
      node_id: "node_phone_adult_001",
      public_key: "dev_public_key_phone_adult_001",
      zone: config.zone,
      roles: ["phone_active"],
      age_group: "adult",
      trusted_score: 0.71,
      online: true,
      supported_languages: ["Tamil-English slang"],
      supported_regions: ["Chennai"],
      current_load: 0.4,
      last_seen: now,
    },
    {
      node_id: "node_phone_child_001",
      public_key: "dev_public_key_phone_child_001",
      zone: config.zone,
      roles: ["phone_active"],
      age_group: "child",
      trusted_score: 0.4,
      online: true,
      supported_languages: ["Tamil-English slang"],
      supported_regions: ["Chennai"],
      current_load: 0.3,
      last_seen: now,
    },
  ];

  // Temporary dev nodes. Later these will come from real node discovery.
  for (const node of nodes) {
    engine.addNode(node);
  }
}

function logStartup(config: ServerConfig): void {
  console.log(`DAOVibe Mycelium node running on port ${config.port}`);
  console.log(`URL: http://localhost:${config.port}`);
  console.log(`node_id: ${config.nodeId}`);
  console.log(`author: ${config.author}`);
  console.log(`zone: ${config.zone}`);
  console.log(`db path: ${config.dbPath ?? config.defaultDbPath}`);
}

export function startServer(
  config: ServerConfig = readServerConfig()
): HttpServer {
  const engine = new LanguageEngine({
    zone: config.zone,
    author: config.author,
    nodeAgeGroup: config.nodeAgeGroup,
    dbPath: config.dbPath,
  });

  addTemporaryDevNodes(engine, config);

  const app = createServer({
    config,
    engine,
  });

  return app.listen(config.port, () => {
    logStartup(config);
  });
}
