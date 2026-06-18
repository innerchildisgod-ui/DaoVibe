export type SafetyLabel =
  | "normal"
  | "mild_slang"
  | "vulgar"
  | "adult_18_plus"
  | "abusive"
  | "dangerous"
  | "blocked";

export function isAgeRestricted(label: SafetyLabel): boolean {
  return label === "adult_18_plus";
}

export function canAskChildNode(label: SafetyLabel): boolean {
  return label === "normal" || label === "mild_slang";
}

export function canShareWithCommunity(label: SafetyLabel): boolean {
  return label !== "blocked" && label !== "dangerous";
}