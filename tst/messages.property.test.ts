import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getTemplateSid, type TemplatePurpose } from '../src/messages';

// --- Constants ---
// Only out-of-session reminder templates remain

const ALL_PURPOSES: TemplatePurpose[] = [
  'daily_reminder',
  'weekly_reminder',
  'expired_plan',
];

const DEFAULT_SIDS: Record<TemplatePurpose, string> = {
  daily_reminder: 'HX157ce81f5b19c10b737565f56b87e558',
  weekly_reminder: 'HX0e28059febf5045abc44d451dc428f3f',
  expired_plan: 'HX0e28059febf5045abc44d451dc428f3f',
};

const ENV_VAR_NAMES: Record<TemplatePurpose, string> = {
  daily_reminder: 'TWILIO_TEMPLATE_SID_DAILY_REMINDER',
  weekly_reminder: 'TWILIO_TEMPLATE_SID_WEEKLY_REMINDER',
  expired_plan: 'TWILIO_TEMPLATE_SID_EXPIRED_PLAN',
};

const SID_PATTERN = /^HX[0-9a-f]{32}$/;

// --- Arbitraries ---

const purposeArb: fc.Arbitrary<TemplatePurpose> = fc.constantFrom(...ALL_PURPOSES);

/** Generates a valid Twilio-style SID: HX + 32 lowercase hex chars */
const validSidArb: fc.Arbitrary<string> = fc
  .hexaString({ minLength: 32, maxLength: 32 })
  .map((hex) => `HX${hex.toLowerCase()}`);

// ============================================================
// Property 19: Template SID resolution correctness
// ============================================================

describe('Property 19: Template SID resolution correctness', () => {
  afterEach(() => {
    for (const envVar of Object.values(ENV_VAR_NAMES)) {
      delete process.env[envVar];
    }
  });

  it('returns undefined when no env var is set and no default exists', () => {
    fc.assert(
      fc.property(purposeArb, (purpose) => {
        delete process.env[ENV_VAR_NAMES[purpose]];

        const result = getTemplateSid(purpose);
        if (DEFAULT_SIDS[purpose]) {
          expect(result).toBe(DEFAULT_SIDS[purpose]);
        } else {
          expect(result).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns the env var value when set to a valid SID', () => {
    fc.assert(
      fc.property(purposeArb, validSidArb, (purpose, sid) => {
        process.env[ENV_VAR_NAMES[purpose]] = sid;

        const result = getTemplateSid(purpose);
        expect(result).toBe(sid);
      }),
      { numRuns: 100 },
    );
  });

  it('returned SID matches HX + 32 hex chars format when present', () => {
    fc.assert(
      fc.property(purposeArb, validSidArb, (purpose, sid) => {
        process.env[ENV_VAR_NAMES[purpose]] = sid;

        const result = getTemplateSid(purpose);
        expect(result).toBeTruthy();
        expect(result).toMatch(SID_PATTERN);
      }),
      { numRuns: 200 },
    );
  });
});
