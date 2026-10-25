import { randomInt } from 'node:crypto';

export class Priority {
  static readonly HIGHEST = 0;
  static readonly LOWEST = 767;
  static readonly TIERS = 6;
  static readonly COHORTS_PER_TIER = 128;
  static readonly ALLOW_ALL_THRESHOLD = 768;

  private constructor(readonly value: number) {}

  static fromValue(value: number): Priority {
    if (!Number.isInteger(value) || value < Priority.HIGHEST || value > Priority.LOWEST) {
      throw new RangeError(`priority must be an integer between ${Priority.HIGHEST} and ${Priority.LOWEST}`);
    }
    return new Priority(value);
  }

  static fromTier(tier: number, cohort: number = randomInt(Priority.COHORTS_PER_TIER)): Priority {
    if (!Number.isInteger(tier) || tier < 0 || tier >= Priority.TIERS) {
      throw new RangeError(`tier must be an integer between 0 and ${Priority.TIERS - 1}`);
    }
    if (!Number.isInteger(cohort) || cohort < 0 || cohort >= Priority.COHORTS_PER_TIER) {
      throw new RangeError(`cohort must be an integer between 0 and ${Priority.COHORTS_PER_TIER - 1}`);
    }
    return new Priority(tier * Priority.COHORTS_PER_TIER + cohort);
  }

  static default(cohort?: number): Priority {
    return Priority.fromTier(Priority.TIERS - 1, cohort);
  }
}
