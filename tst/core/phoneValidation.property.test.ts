import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePhoneNumber } from '../../src/core/phoneValidation';

// --- Arbitraries ---

/** Generates a valid phone number: '+' followed by 10–15 digits */
const validPhoneArb = fc
  .integer({ min: 10, max: 15 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    }),
  )
  .map((digits) => `+${digits}`);

/** Generates a string that contains at least one letter */
const stringWithLettersArb = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 5 }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), {
      minLength: 1,
      maxLength: 5,
    }),
    fc.string({ minLength: 0, maxLength: 5 }),
  )
  .map(([pre, letters, post]) => `+${pre}${letters}${post}`);

/** Generates a digit string without the '+' prefix (10–15 digits) */
const missingPlusArb = fc
  .integer({ min: 10, max: 15 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    }),
  );

/** Generates '+' followed by too few digits (1–9) */
const tooShortArb = fc
  .integer({ min: 1, max: 9 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    }),
  )
  .map((digits) => `+${digits}`);

/** Generates '+' followed by too many digits (16–25) */
const tooLongArb = fc
  .integer({ min: 16, max: 25 })
  .chain((len) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: len,
      maxLength: len,
    }),
  )
  .map((digits) => `+${digits}`);

// ============================================================
// Property 9: Phone number validation
// Validates: Requirements 8.2, 8.3
// ============================================================

describe('Property 9: Phone number validation', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * Any string matching the pattern ^\+\d{10,15}$ should be accepted
   * as valid and returned as the normalized value.
   */
  it('accepts valid international format (+ followed by 10–15 digits)', () => {
    fc.assert(
      fc.property(validPhoneArb, (phone) => {
        const result = validatePhoneNumber(phone);
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe(phone);
      }),
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Strings containing letters should always be rejected.
   */
  it('rejects strings containing letters', () => {
    fc.assert(
      fc.property(stringWithLettersArb, (input) => {
        const result = validatePhoneNumber(input);
        expect(result.valid).toBe(false);
      }),
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Digit strings without the '+' country code prefix should be rejected.
   */
  it('rejects strings without + prefix (missing country code)', () => {
    fc.assert(
      fc.property(missingPlusArb, (input) => {
        const result = validatePhoneNumber(input);
        expect(result.valid).toBe(false);
      }),
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Numbers with fewer than 10 digits after '+' should be rejected.
   */
  it('rejects numbers that are too short (< 10 digits after +)', () => {
    fc.assert(
      fc.property(tooShortArb, (input) => {
        const result = validatePhoneNumber(input);
        expect(result.valid).toBe(false);
      }),
    );
  });

  /**
   * **Validates: Requirements 8.3**
   *
   * Numbers with more than 15 digits after '+' should be rejected.
   */
  it('rejects numbers that are too long (> 15 digits after +)', () => {
    fc.assert(
      fc.property(tooLongArb, (input) => {
        const result = validatePhoneNumber(input);
        expect(result.valid).toBe(false);
      }),
    );
  });
});
