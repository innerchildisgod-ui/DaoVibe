import { LmpPacket } from "../protocol/packet";
import { SafetyLabel, canAskChildNode, canShareWithCommunity } from "../safety/safetyLabels";
import { NodeDirectory } from "./nodeDirectory";
import { NodeProfile } from "./nodeProfile";

export interface RoutePlan {
  packet_id: string;
  decision: "send" | "hold" | "drop";
  targets: NodeProfile[];
  reason: string;
}

function extractLanguageHint(packet: LmpPacket): string | undefined {
  const payload = packet.payload as Record<string, unknown>;

  if (typeof payload.language_hint === "string") {
    return payload.language_hint;
  }

  return undefined;
}

export class RoutePlanner {
  constructor(private readonly directory: NodeDirectory) {}

  planRoute(packet: LmpPacket, safetyLabel: SafetyLabel): RoutePlan {
    if (!canShareWithCommunity(safetyLabel)) {
      return {
        packet_id: packet.packet_id,
        decision: "drop",
        targets: [],
        reason: `Packet blocked by safety label: ${safetyLabel}`,
      };
    }

    const languageHint = extractLanguageHint(packet);

    let candidates = this.directory
      .findByZone(packet.zone)
      .filter((node) => node.online)
      .filter((node) => node.current_load < 0.9);

    candidates = candidates.filter((node) => {
      if (node.age_group === "child" && !canAskChildNode(safetyLabel)) {
        return false;
      }

      return true;
    });

    if (languageHint) {
      candidates = candidates.filter((node) =>
        node.supported_languages.some((lang) =>
          languageHint.toLowerCase().includes(lang.toLowerCase())
        )
      );
    }

    candidates = candidates.sort((a, b) => {
      const trustDiff = b.trusted_score - a.trusted_score;

      if (trustDiff !== 0) {
        return trustDiff;
      }

      return a.current_load - b.current_load;
    });

    const targets = candidates.slice(0, 5);

    if (targets.length === 0) {
      return {
        packet_id: packet.packet_id,
        decision: "hold",
        targets: [],
        reason: "No suitable online target nodes found",
      };
    }

    return {
      packet_id: packet.packet_id,
      decision: "send",
      targets,
      reason: `Found ${targets.length} suitable target node(s)`,
    };
  }
}