import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  const validEnv: Record<string, string> = {
    STAGE: 'dev',
    DYNAMODB_TABLE: 'MealPlannerUsers-dev',
    TWILIO_ACCOUNT_SID: 'AC_test_sid',
    TWILIO_AUTH_TOKEN: 'test_auth_token',
    TWILIO_SENDER_NUMBER: '+17655483740',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads all required variables', () => {
    Object.assign(process.env, validEnv);
    const config = loadConfig();

    expect(config.stage).toBe('dev');
    expect(config.dynamodbTable).toBe('MealPlannerUsers-dev');
    expect(config.twilioAccountSid).toBe('AC_test_sid');
    expect(config.twilioAuthToken).toBe('test_auth_token');
    expect(config.twilioSenderNumber).toBe('+17655483740');
  });

  it('defaults awsAccountId to 713170882602', () => {
    Object.assign(process.env, validEnv);
    const config = loadConfig();
    expect(config.awsAccountId).toBe('713170882602');
  });

  it('uses AWS_ACCOUNT_ID env var when set', () => {
    Object.assign(process.env, validEnv, { AWS_ACCOUNT_ID: '123456789012' });
    const config = loadConfig();
    expect(config.awsAccountId).toBe('123456789012');
  });

  it('throws when a required variable is missing', () => {
    Object.assign(process.env, validEnv);
    delete process.env.TWILIO_AUTH_TOKEN;

    expect(() => loadConfig()).toThrow(
      'Missing required environment variables: TWILIO_AUTH_TOKEN'
    );
  });

  it('throws listing all missing variables', () => {
    // no env vars set beyond originalEnv
    for (const key of Object.keys(validEnv)) {
      delete process.env[key];
    }

    expect(() => loadConfig()).toThrow('Missing required environment variables:');
  });

  it('collects TWILIO_TEMPLATE_SID_* overrides', () => {
    Object.assign(process.env, validEnv, {
      TWILIO_TEMPLATE_SID_MAIN_MENU: 'HXoverride1',
      TWILIO_TEMPLATE_SID_DAILY_REMINDER: 'HXoverride2',
    });
    const config = loadConfig();

    expect(config.templateSidOverrides).toEqual({
      TWILIO_TEMPLATE_SID_MAIN_MENU: 'HXoverride1',
      TWILIO_TEMPLATE_SID_DAILY_REMINDER: 'HXoverride2',
    });
  });

  it('returns empty templateSidOverrides when none set', () => {
    Object.assign(process.env, validEnv);
    const config = loadConfig();
    expect(config.templateSidOverrides).toEqual({});
  });

  it('does not require Razorpay vars when REQUIRE_PAYMENT is not true', () => {
    Object.assign(process.env, validEnv);
    // No RAZORPAY_* vars set, no REQUIRE_PAYMENT — should not throw
    expect(() => loadConfig()).not.toThrow();
    const config = loadConfig();
    expect(config.razorpayKeyId).toBe('');
    expect(config.razorpayKeySecret).toBe('');
    expect(config.razorpayPlanId).toBe('');
  });

  it('requires Razorpay vars when REQUIRE_PAYMENT is true', () => {
    Object.assign(process.env, validEnv, { REQUIRE_PAYMENT: 'true' });
    expect(() => loadConfig()).toThrow(
      'Missing required environment variables: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID'
    );
  });

  it('loads Razorpay vars when REQUIRE_PAYMENT is true and vars are set', () => {
    Object.assign(process.env, validEnv, {
      REQUIRE_PAYMENT: 'true',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      RAZORPAY_PLAN_ID: 'plan_test_49',
    });
    const config = loadConfig();
    expect(config.razorpayKeyId).toBe('rzp_test_key');
    expect(config.razorpayKeySecret).toBe('rzp_test_secret');
    expect(config.razorpayPlanId).toBe('plan_test_49');
  });
});
