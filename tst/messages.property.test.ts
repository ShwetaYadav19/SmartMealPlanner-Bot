import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getTemplateSid, type TemplatePurpose } from '../src/messages';

// --- Constants ---

const ALL_PURPOSES: TemplatePurpose[] = [
  'main_menu',
  'main_menu_button',
  'menu_more',
  'daily_reminder',
  'cook_options',
  'diet_selection',
  'cuisine_selection',
  'meal_style',
];

const DEFAULT_SIDS: Record<TemplatePurpose, string> = {
  main_menu: 'HXe992435f98fde5249c641a135bb5dbd5',
  main_menu_button: 'HX050102bc4bf8f0f9a48473db7ea7152e',
  menu_more: 'HX7957efc7a19b2b9c8d2910ba15e6a2c5',
  daily_reminder: 'HX708fce9ebb60de686f73731e071aa8cb',
  cook_options: 'HX6eddbb2f0eb2678e3f505e3786dec4e8',
  diet_selection: 'HX5ad138d83501b0b1111e0a19a524dfd5',
  cuisine_selection: 'HX62d7649f7e38d88bec1b7d85b25ea83e',
  meal_style: 'HX26deeadd8ad7de0baf4568365e3da981',
};

const ENV_VAR_NAMES: Record<TemplatePurpose, string> = {
  main_menu: 'TWILIO_TEMPLATE_SID_MAIN_MENU',
  main_menu_button: 'TWILIO_TEMPLATE_SID_MAIN_MENU_BUTTON',
  menu_more: 'TWILIO_TEMPLATE_SID_MENU_MORE',
  daily_reminder: 'TWILIO_TEMPLATE_SID_DAILY_REMINDER',
  cook_options: 'TWILIO_TEMPLATE_SID_COOK_OPTIONS',
  diet_selection: 'TWILIO_TEMPLATE_SID_DIET_SELECTION',
  cuisine_selection: 'TWILIO_TEMPLATE_SID_CUISINE_SELECTION',
  meal_style: 'TWILIO_TEMPLATE_SID_MEAL_STYLE',
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
// Validates: Requirements 18.3, 18.4, 18.5
// ============================================================

describe('Property 19: Template SID resolution correctness', () => {
  afterEach(() => {
    // Clean up all template env vars after each test
    for (const envVar of Object.values(ENV_VAR_NAMES)) {
      delete process.env[envVar];
    }
  });

  /**
   * **Validates: Requirements 18.5**
   *
   * When no env var is set, getTemplateSid returns the hardcoded default for every purpose.
   */
  it('returns the hardcoded default SID when no env var is set', () => {
    fc.assert(
      fc.property(purposeArb, (purpose) => {
        // Ensure env var is not set
        delete process.env[ENV_VAR_NAMES[purpose]];

        const result = getTemplateSid(purpose);
        expect(result).toBe(DEFAULT_SIDS[purpose]);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * When an env var is set to a valid SID, getTemplateSid returns that env var value.
   */
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

  /**
   * **Validates: Requirements 18.3, 18.4, 18.5**
   *
   * The returned SID is always non-empty and matches the HX + 32 hex chars format,
   * regardless of whether the env var is set or not.
   */
  it('returned SID is always non-empty and matches HX + 32 hex chars format', () => {
    fc.assert(
      fc.property(
        purposeArb,
        fc.option(validSidArb, { nil: undefined }),
        (purpose, maybeSid) => {
          if (maybeSid !== undefined) {
            process.env[ENV_VAR_NAMES[purpose]] = maybeSid;
          } else {
            delete process.env[ENV_VAR_NAMES[purpose]];
          }

          const result = getTemplateSid(purpose);
          expect(result).toBeTruthy();
          expect(result).toMatch(SID_PATTERN);
        },
      ),
      { numRuns: 200 },
    );
  });
});
