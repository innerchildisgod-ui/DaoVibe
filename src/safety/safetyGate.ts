import {
  canAskChildNode,
  canShareWithCommunity,
  SafetyLabel,
} from "./safetyLabels";

export type NodeAgeGroup = "child" | "adult" | "unknown";

export interface SafetyContext {
  nodeAgeGroup: NodeAgeGroup;
  action:
    | "observe_phrase"
    | "propose_meaning"
    | "vote_meaning"
    | "apply_safety_label"
    | "list_knowledge";
}

export class SafetyGate {
  assertAllowed(label: SafetyLabel, context: SafetyContext): void {
    if (context.nodeAgeGroup === "child" && !canAskChildNode(label)) {
      throw new Error(
        `SafetyGate blocked action: child node cannot process ${label} content`
      );
    }

    if (
      context.action !== "apply_safety_label" &&
      !canShareWithCommunity(label)
    ) {
      throw new Error(
        `SafetyGate blocked action: ${label} content cannot be shared with community`
      );
    }
  }
}