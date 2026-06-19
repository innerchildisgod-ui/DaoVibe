import { NodeAgeGroup } from "../safety/safetyGate";

export const DEFAULT_DB_PATH = "data/callsab_language_engine.db";

export interface ServerConfig {
  port: number;
  author: string;
  nodeId: string;
  nodeAgeGroup: NodeAgeGroup;
  dbPath?: string;
  zone: string;
  defaultDbPath: string;
}

function readNodeAgeGroup(value: string | undefined): NodeAgeGroup {
  if (value === "child" || value === "adult") {
    return value;
  }

  return "adult";
}

export function readServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  return {
    port: Number(env.DAOVIBE_PORT ?? env.CALLSAB_PORT ?? 3000),
    author:
      env.DAOVIBE_AUTHOR ??
      env.CALLSAB_AUTHOR ??
      "dev_public_key_laptop_001",
    nodeId: env.DAOVIBE_NODE_ID ?? env.CALLSAB_NODE_ID ?? "node_laptop_001",
    nodeAgeGroup: readNodeAgeGroup(
      env.DAOVIBE_NODE_AGE_GROUP ?? env.CALLSAB_NODE_AGE_GROUP
    ),
    dbPath: env.DAOVIBE_DB_PATH ?? env.CALLSAB_DB_PATH,
    zone: env.DAOVIBE_ZONE ?? env.CALLSAB_ZONE ?? "chennai_local_zone",
    defaultDbPath: DEFAULT_DB_PATH,
  };
}
