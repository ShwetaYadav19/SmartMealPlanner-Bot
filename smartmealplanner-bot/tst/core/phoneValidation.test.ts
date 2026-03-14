import { describe, it, expect } from 'vitest';
import { validatePhoneNumber } from '../../src/core/phoneValidation';

describe('validatePhoneNumber', () => {
  it('accepts a valid phone number with country code', () => {
    const result = validatePhoneNumber('+919876543210');
    expect(result).toEqual({ valid: true, normalized: '+919876543210' });
  });

  it('accepts the minimum length (10 digits after +)', () => {
    const result = validatePhoneNumber('+1234567890');
    expect(result).toEqual({ valid: true, normalized: '+1234567890' });
  });

  it('accepts the maximum length (15 digits after +)', () => {
    const result = validatePhoneNumber('+123456789012345');
    expect(result).toEqual({ valid: true, normalized: '+123456789012345' });
  });

  it('trims leading and trailing whitespace', () => {
    const result = validatePhoneNumber('  +919876543210  ');
    expect(result).toEqual({ valid: true, normalized: '+919876543210' });
  });

  it('rejects a number without the + prefix', () => {
    expect(validatePhoneNumber('919876543210')).toEqual({ valid: false });
  });

  it('rejects a number with letters', () => {
    expect(validatePhoneNumber('+91abcd43210')).toEqual({ valid: false });
  });

  it('rejects a number that is too short (fewer than 10 digits)', () => {
    expect(validatePhoneNumber('+123456789')).toEqual({ valid: false });
  });

  it('rejects a number that is too long (more than 15 digits)', () => {
    expect(validatePhoneNumber('+1234567890123456')).toEqual({ valid: false });
  });

  it('rejects an empty string', () => {
    expect(validatePhoneNumber('')).toEqual({ valid: false });
  });

  it('rejects a string with only whitespace', () => {
    expect(validatePhoneNumber('   ')).toEqual({ valid: false });
  });

  it('rejects a number with spaces in the middle', () => {
    expect(validatePhoneNumber('+91 9876 543210')).toEqual({ valid: false });
  });

  it('rejects a number with special characters', () => {
    expect(validatePhoneNumber('+91-9876-543210')).toEqual({ valid: false });
  });
});
