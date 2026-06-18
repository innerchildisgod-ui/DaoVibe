import { VoteValue } from "../protocol/packetTypes";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function applyVoteToConfidence(
  currentConfidence: number,
  vote: VoteValue,
  voterTrust: number,
  voterConfidence: number
): number {
  const trust = clamp(voterTrust);
  const confidence = clamp(voterConfidence);
  const weight = trust * confidence;

  if (vote === "confirm") {
    return clamp(currentConfidence + 0.15 * weight);
  }

  if (vote === "reject") {
    return clamp(currentConfidence - 0.2 * weight);
  }

  return currentConfidence;
}