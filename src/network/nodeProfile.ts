import { NodeAgeGroup } from "../safety/safetyGate";

export type NodeRole =
  | "phone_light"
  | "phone_active"
  | "laptop_worker"
  | "validator"
  | "archive"
  | "zone_index";

export interface NodeProfile {
  node_id: string;
  public_key: string;
  zone: string;
  roles: NodeRole[];
  age_group: NodeAgeGroup;
  trusted_score: number; // 0 to 1
  online: boolean;
  supported_languages: string[];
  supported_regions: string[];
  current_load: number; // 0 to 1
  last_seen: number;
}