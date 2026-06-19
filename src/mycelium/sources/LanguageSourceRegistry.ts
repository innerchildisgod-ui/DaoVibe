import {
  decideLanguageSourceUse,
  type LanguageSourcePolicyDecision,
  type LanguageSourcePolicyInput,
} from "./LanguageSourcePolicy";

export interface RegisteredLanguageSource {
  source_id: string;
  source_name: string;
  description: string;
  policy: LanguageSourcePolicyDecision;
}

export function registerLanguageSource(
  source_id: string,
  input: LanguageSourcePolicyInput,
  description: string
): RegisteredLanguageSource {
  return {
    source_id,
    source_name: input.source_name,
    description,
    policy: decideLanguageSourceUse(input),
  };
}

export const defaultMyceliumLanguageSources: RegisteredLanguageSource[] = [
  registerLanguageSource(
    "community_observed_packets",
    {
      source_name: "Community observed language packets",
      access: "community_observed",
    },
    "Phrase, meaning, vote, correction, and usage packets observed from DAOVibe/Mycelium communities."
  ),
  registerLanguageSource(
    "free_public_language_data",
    {
      source_name: "Free or public language data",
      access: "free_public",
    },
    "Free/permitted public language data that can be used as optional reference material."
  ),
  registerLanguageSource(
    "open_license_language_data",
    {
      source_name: "Open-license language data",
      access: "open_license",
    },
    "Openly licensed datasets that can be used according to their license terms."
  ),
  registerLanguageSource(
    "user_provided_teacher_access",
    {
      source_name: "User-provided teacher/reference access",
      access: "user_provided",
      user_provided: true,
    },
    "Language help or teacher access provided by the user. This can guide learning but must not become a hidden dependency."
  ),
];
