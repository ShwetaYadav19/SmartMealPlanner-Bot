import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webhookHandler } from '../../src/handlers/webhookHandler';

// Mock config
vi.mock('../../src/config', () => ({
  loadConfig: () => ({
    stage: 'dev',
    dynamodbTable: 'MealPlannerUsers-dev',
    twilioAccountSid: 'AC_TEST',
    twilioAuthToken: 'test_token',
    twilioSenderNumber: '+17655483740',
    awsAccountId: '713170882602',
    templateSidOverrides: {},
  }),
}));

// Mock DynamoDB adapter
const mockGetUser = vi.fn();
const mockSaveUser = vi.fn();
vi.mock('../../src/adapters/dynamodbUserStateRepository', () => ({
  DynamoDBUserStateRepository: vi.fn().mockImplementation(() => ({
    getUser: mockGetUser,
    saveUser: mockSaveUser,
  })),
}));

// Mock JsonMealRepository
vi.mock('../../src/adapters/jsonMealRepository', () => ({
  JsonMealRepository: vi.fn().mockImplementation(() => ({
    getMeals: vi.fn().mockResolvedValue([]),
    getMealById: vi.fn().mockResolvedValue(null),
  })),
}));

// Mock JsonMealComponentRepository
vi.mock('../../src/adapters/jsonMealComponentRepository', () => ({
  JsonMealComponentRepository: vi.fn().mockImplementation(() => ({
    getComponents: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock TwilioMessagingProvider
const mockSendTextMessage = vi.fn().mockResolvedValue(undefined);
const mockSendButtonMessage = vi.fn().mockResolvedValue(undefined);
const mockSendListMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/adapters/twilioMessagingProvider', () => ({
  TwilioMessagingProvider: vi.fn().mockImplementation(() => ({
    sendTextMessage: mockSendTextMessage,
    sendButtonMessage: mockSendButtonMessage,
    sendListMessage: mockSendListMessage,
  })),
}));

function makeEvent(body: string, isBase64Encoded = false) {
  return {
    body: isBase64Encoded ? Buffer.from(body).toString('base64') : body,
    isBase64Encoded,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
}

describe('webhookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue(null);
    mockSaveUser.mockResolvedValue(undefined);
  });

  it('returns 400 when From field is missing', async () => {
    const event = makeEvent('Body=hello');
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('Missing From');
  });

  it('returns 400 when body is empty', async () => {
    const event = makeEvent('');
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 200 for a valid new user message', async () => {
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=hello');
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('');
  });

  it('strips whatsapp: prefix from From field', async () => {
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=hello');
    await webhookHandler(event);
    expect(mockGetUser).toHaveBeenCalledWith('+919876543210');
  });

  it('handles base64-encoded body', async () => {
    const body = 'From=whatsapp%3A%2B919876543210&Body=hello';
    const event = makeEvent(body, true);
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith('+919876543210');
  });

  it('sends button message when formatted response has buttons', async () => {
    // New user → onboarding cuisine prompt (has buttons)
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=hello');
    await webhookHandler(event);
    expect(mockSendButtonMessage).toHaveBeenCalled();
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it('sends text message when formatted response has no buttons', async () => {
    // User in awaiting_cook_number state with invalid phone → INVALID_PHONE (no buttons)
    mockGetUser.mockResolvedValue({
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'awaiting_cook_number',
    });
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=invalid');
    await webhookHandler(event);
    expect(mockSendTextMessage).toHaveBeenCalled();
  });

  it('saves updated user state after processing', async () => {
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=hello');
    await webhookHandler(event);
    expect(mockSaveUser).toHaveBeenCalled();
  });

  it('extracts ButtonPayload from Twilio request', async () => {
    mockGetUser.mockResolvedValue({
      phoneNumber: '+919876543210',
      onboardingComplete: false,
      conversationState: 'awaiting_cuisine',
    });
    const event = makeEvent(
      'From=whatsapp%3A%2B919876543210&Body=&ButtonPayload=north_indian',
    );
    await webhookHandler(event);
    const savedState = mockSaveUser.mock.calls[0][0];
    expect(savedState.cuisinePreference).toBe('north_indian');
    expect(savedState.conversationState).toBe('awaiting_diet');
  });

  it('returns 500 on unexpected errors', async () => {
    mockGetUser.mockRejectedValue(new Error('DynamoDB failure'));
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=hello');
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(500);
    expect(result.body).toBe('');
  });

  it('handles From without whatsapp: prefix', async () => {
    const event = makeEvent('From=%2B919876543210&Body=hello');
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith('+919876543210');
  });

  it('handles null body in event', async () => {
    const event = { body: null, isBase64Encoded: false, headers: {} };
    const result = await webhookHandler(event);
    expect(result.statusCode).toBe(400);
  });
});
