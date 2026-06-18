import {
  MeaningProposalPayload,
  MeaningVotePayload,
  PhraseObservedPayload,
} from "../protocol/packetTypes";
import { SafetyLabel } from "../safety/safetyLabels";
import { applyVoteToConfidence } from "./confidence";

export interface MeaningRecord {
  meaning_id: string;
  reference_meaning: string;
  context?: string;
  confidence: number;
  confirms: number;
  rejects: number;
}

export interface PhraseRecord {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label: SafetyLabel;
  meanings: Map<string, MeaningRecord>;
}

export interface PhraseHydrationRecord {
  phrase_id: string;
  surface_text?: string;
  phonetic_hint?: string;
  language_hint?: string;
  safety_label: SafetyLabel;
  meanings: MeaningRecord[];
}

export class PhraseStore {
  private phrases = new Map<string, PhraseRecord>();

  hydrate(phrases: PhraseHydrationRecord[]): void {
    for (const phrase of phrases) {
      this.phrases.set(phrase.phrase_id, {
        phrase_id: phrase.phrase_id,
        surface_text: phrase.surface_text,
        phonetic_hint: phrase.phonetic_hint,
        language_hint: phrase.language_hint,
        safety_label: phrase.safety_label,
        meanings: new Map(
          phrase.meanings.map((meaning) => [
            meaning.meaning_id,
            {
              meaning_id: meaning.meaning_id,
              reference_meaning: meaning.reference_meaning,
              context: meaning.context,
              confidence: meaning.confidence,
              confirms: meaning.confirms,
              rejects: meaning.rejects,
            },
          ])
        ),
      });
    }
  }

  observePhrase(payload: PhraseObservedPayload): PhraseRecord {
    const existing = this.phrases.get(payload.phrase_id);

    if (existing) {
      return existing;
    }

    const record: PhraseRecord = {
      phrase_id: payload.phrase_id,
      surface_text: payload.surface_text,
      phonetic_hint: payload.phonetic_hint,
      language_hint: payload.language_hint,
      safety_label: "normal",
      meanings: new Map(),
    };

    this.phrases.set(payload.phrase_id, record);
    return record;
  }

  proposeMeaning(payload: MeaningProposalPayload): MeaningRecord {
    const phrase = this.phrases.get(payload.phrase_id);

    if (!phrase) {
      throw new Error(`Phrase not found: ${payload.phrase_id}`);
    }

    const existing = phrase.meanings.get(payload.meaning_id);

    if (existing) {
      return existing;
    }

    const meaning: MeaningRecord = {
      meaning_id: payload.meaning_id,
      reference_meaning: payload.reference_meaning,
      context: payload.context,
      confidence: payload.confidence,
      confirms: 0,
      rejects: 0,
    };

    phrase.meanings.set(payload.meaning_id, meaning);
    return meaning;
  }

  vote(payload: MeaningVotePayload): MeaningRecord {
    const phrase = this.phrases.get(payload.phrase_id);

    if (!phrase) {
      throw new Error(`Phrase not found: ${payload.phrase_id}`);
    }

    const meaning = phrase.meanings.get(payload.meaning_id);

    if (!meaning) {
      throw new Error(`Meaning not found: ${payload.meaning_id}`);
    }

    if (payload.vote === "confirm") {
      meaning.confirms += 1;
    }

    if (payload.vote === "reject") {
      meaning.rejects += 1;
    }

    meaning.confidence = applyVoteToConfidence(
      meaning.confidence,
      payload.vote,
      0.7,
      payload.confidence
    );

    return meaning;
  }

  setSafetyLabel(phrase_id: string, label: SafetyLabel): void {
    const phrase = this.phrases.get(phrase_id);

    if (!phrase) {
      throw new Error(`Phrase not found: ${phrase_id}`);
    }

    phrase.safety_label = label;
  }

  getPhrase(phrase_id: string): PhraseRecord | undefined {
    return this.phrases.get(phrase_id);
  }

  list() {
    return [...this.phrases.values()].map((phrase) => ({
      ...phrase,
      meanings: [...phrase.meanings.values()],
    }));
  }
}