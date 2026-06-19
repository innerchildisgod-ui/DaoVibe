export const CORRECTION_GOVERNANCE_RATE_LIMIT_ERROR =
  "Too many correction requests. Try again later.";

const CORRECTION_GOVERNANCE_RATE_LIMIT = 30;
const CORRECTION_GOVERNANCE_RATE_LIMIT_WINDOW_MS = 60_000;

interface CorrectionGovernanceRateLimiterOptions {
  limit?: number;
  windowMs?: number;
  now?: () => number;
}

interface CorrectionGovernanceRateLimitBucket {
  windowStartedAt: number;
  count: number;
}

export interface CorrectionGovernanceRateLimiter {
  allow(ip?: string): boolean;
}

export function createCorrectionGovernanceRateLimiter(
  options: CorrectionGovernanceRateLimiterOptions = {}
): CorrectionGovernanceRateLimiter {
  const limit = options.limit ?? CORRECTION_GOVERNANCE_RATE_LIMIT;
  const windowMs =
    options.windowMs ?? CORRECTION_GOVERNANCE_RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, CorrectionGovernanceRateLimitBucket>();

  return {
    allow(ip?: string): boolean {
      const key = ip || "unknown";
      const currentTime = now();
      const bucket = buckets.get(key);

      if (!bucket || currentTime - bucket.windowStartedAt >= windowMs) {
        buckets.set(key, {
          windowStartedAt: currentTime,
          count: 1,
        });
        return true;
      }

      if (bucket.count >= limit) {
        return false;
      }

      bucket.count += 1;
      return true;
    },
  };
}
