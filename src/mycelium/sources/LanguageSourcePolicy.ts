export type LanguageSourceAccess =
  | "free_public"
  | "open_license"
  | "community_observed"
  | "user_provided"
  | "paid_optional"
  | "proprietary_blocked"
  | "unknown";

export type LanguageSourceUse =
  | "core_truth"
  | "optional_reference"
  | "teacher_reference"
  | "blocked";

export interface LanguageSourcePolicyInput {
  source_name: string;
  access: LanguageSourceAccess;
  license_note?: string;
  user_provided?: boolean;
}

export interface LanguageSourcePolicyDecision {
  source_name: string;
  allowed: boolean;
  use: LanguageSourceUse;
  reason: string;
}

export function decideLanguageSourceUse(
  input: LanguageSourcePolicyInput
): LanguageSourcePolicyDecision {
  if (input.access === "community_observed") {
    return {
      source_name: input.source_name,
      allowed: true,
      use: "core_truth",
      reason: "Community-observed language is core Mycelium knowledge.",
    };
  }

  if (input.access === "free_public" || input.access === "open_license") {
    return {
      source_name: input.source_name,
      allowed: true,
      use: "optional_reference",
      reason:
        "Free or openly licensed language data may be used as a reference source.",
    };
  }

  if (input.access === "user_provided" || input.user_provided === true) {
    return {
      source_name: input.source_name,
      allowed: true,
      use: "teacher_reference",
      reason:
        "User-provided access may be used as a teacher/reference source, not as core dependency.",
    };
  }

  if (input.access === "paid_optional") {
    return {
      source_name: input.source_name,
      allowed: false,
      use: "blocked",
      reason: "Paid language data must not become a core Mycelium dependency.",
    };
  }

  if (input.access === "proprietary_blocked") {
    return {
      source_name: input.source_name,
      allowed: false,
      use: "blocked",
      reason:
        "Proprietary language databases are blocked unless explicitly permitted or user-provided.",
    };
  }

  return {
    source_name: input.source_name,
    allowed: false,
    use: "blocked",
    reason: "Unknown language source access is blocked until reviewed.",
  };
}
