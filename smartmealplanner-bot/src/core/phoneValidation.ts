/**
 * Phone number validation for cook phone numbers.
 * Pure core logic — no external dependencies.
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
}

const PHONE_PATTERN = /^\+\d{10,15}$/;

export function validatePhoneNumber(input: string): PhoneValidationResult {
  const trimmed = input.trim();

  if (PHONE_PATTERN.test(trimmed)) {
    return { valid: true, normalized: trimmed };
  }

  return { valid: false };
}
