import { describe, it, expect, vi, beforeEach } from 'vitest';
import { weeklyReminderHandler } from '../../src/handlers/weeklyReminderHandler';
import { getComingMondayISO } from '../../src/core/botEngine';
import type { UserState, DayPlan, Meal } from '../../src/core/types';

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

// Mock messages — provide a template SID so the handler doesn't skip users
vi.mock('../../src/messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/messages')>();
  return {
    ...actual,
    getTemplateSid: (purpose: string) => {
      if (purpose === 'weekly_reminder') return 'HX_WEEKLY_TEST_SID';
      return undefined;
    },
  };
});

// Mock DynamoDB adapter
const mockScanOnboardedUsers = vi.fn();
vi.mock('../../src/adapters/dynamodbUserStateRepository', () => ({
  DynamoDBUserStateRepository: vi.fn().mockImplementation(() => ({
    getUser: vi.fn(),
    saveUser: vi.fn(),
    scanOnboardedUsers: mockScanOnboardedUsers,
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

// Mock imageSender
vi.mock('../../src/core/imageSender', () => ({
  sendWeeklyPlanImage: vi.fn().mockResolvedValue(undefined),
}));

function makeMeal(name: string): Meal {
  return {
    id: name.toLowerCase().replace(/\s/g, '-'),
    name,
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'regular',
    slots: ['breakfast'],
    ingredients: [{ name: 'Test Ingredient', quantity: '1 cup', category: 'grains' }],
  };
}

function makeDayPlan(day: string): DayPlan {
  return {
    day,
    breakfast: makeMeal(`${day} Breakfast`),
    lunch: makeMeal(`${day} Lunch`),
    dinner: makeMeal(`${day} Dinner`),
  };
}

function makeWeeklyPlan() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map((d) => makeDayPlan(d));
}

function makeOnboardedUser(phone: string, withPlan: boolean): UserState {
  const user: UserState = {
    phoneNumber: phone,
    onboardingComplete: true,
    conversationState: 'main_menu',
    cuisinePreference: 'north_indian',
    dietPreference: 'veg',
    mealStyle: 'regular',
  };
  if (withPlan) {
    user.weeklyPlan = makeWeeklyPlan();
    user.weeklyPlanStartDate = getComingMondayISO();
  }
  return user;
}

const scheduledEvent = {
  source: 'aws.events',
  'detail-type': 'Scheduled Event',
  detail: {},
};

describe('weeklyReminderHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends WEEKLY_REMINDER to all onboarded users', async () => {
    const user1 = makeOnboardedUser('+911111111111', true);
    const user2 = makeOnboardedUser('+912222222222', false);
    mockScanOnboardedUsers.mockResolvedValue([user1, user2]);

    await weeklyReminderHandler(scheduledEvent);

    // Both users get a template message first (sendTextMessage with templateSid)
    // user1 (with plan): template + plan text via sendTextMessage + follow-up via sendButtonMessage
    // user2 (no plan): template only (button is in the template itself)
    // Total sendTextMessage: 3 (template user1 + plan text user1 + template user2)
    expect(mockSendTextMessage).toHaveBeenCalledTimes(3);
    // First call is template for user1
    expect(mockSendTextMessage.mock.calls[0][0]).toBe('+911111111111');
    expect(mockSendTextMessage.mock.calls[0][2]).toBe('HX_WEEKLY_TEST_SID');
    // Second call is freeform plan text for user1
    expect(mockSendTextMessage.mock.calls[1][0]).toBe('+911111111111');
    // Third call is template for user2
    expect(mockSendTextMessage.mock.calls[2][0]).toBe('+912222222222');
    expect(mockSendTextMessage.mock.calls[2][2]).toBe('HX_WEEKLY_TEST_SID');
  });

  it('shows existing plan with grocery/change options for users with a plan', async () => {
    const userWithPlan = makeOnboardedUser('+911111111111', true);
    mockScanOnboardedUsers.mockResolvedValue([userWithPlan]);

    await weeklyReminderHandler(scheduledEvent);

    // Call 1: template message to open session
    // Call 2: freeform plan text
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    // First call is the template
    expect(mockSendTextMessage.mock.calls[0][2]).toBe('HX_WEEKLY_TEST_SID');
    // Second call is the plan text (freeform, no templateSid)
    const [, planText] = mockSendTextMessage.mock.calls[1];
    expect(planText).toContain('Monday');
    expect(planText).toContain('meal plan');

    // Follow-up has approval buttons
    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    const [, , followUpButtons] = mockSendButtonMessage.mock.calls[0];
    expect(followUpButtons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'happy_with_menu', title: 'Happy with the menu' }),
        expect.objectContaining({ id: 'change_plan', title: 'Want to change' }),
      ]),
    );
  });

  it('shows generate prompt for users without a plan', async () => {
    const userWithoutPlan = makeOnboardedUser('+912222222222', false);
    mockScanOnboardedUsers.mockResolvedValue([userWithoutPlan]);

    await weeklyReminderHandler(scheduledEvent);

    // Template message opens the session — it already contains the "Generate Weekly Plan" button
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0][0]).toBe('+912222222222');
    expect(mockSendTextMessage.mock.calls[0][2]).toBe('HX_WEEKLY_TEST_SID');
    // No additional button messages needed for no-plan users
    expect(mockSendButtonMessage).not.toHaveBeenCalled();
  });

  it('handles empty user list gracefully', async () => {
    mockScanOnboardedUsers.mockResolvedValue([]);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockSendButtonMessage).not.toHaveBeenCalled();
  });

  it('continues processing other users when one fails', async () => {
    const user1 = makeOnboardedUser('+911111111111', false);
    const user2 = makeOnboardedUser('+912222222222', false);
    mockScanOnboardedUsers.mockResolvedValue([user1, user2]);

    // First template send fails, second succeeds
    mockSendTextMessage
      .mockRejectedValueOnce(new Error('Twilio error'))
      .mockResolvedValueOnce(undefined);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
    expect(mockSendTextMessage.mock.calls[1][0]).toBe('+912222222222');
  });

  it('sends template message for no-plan user (button is in the template)', async () => {
    const user = makeOnboardedUser('+919876543210', false);
    mockScanOnboardedUsers.mockResolvedValue([user]);

    await weeklyReminderHandler(scheduledEvent);

    // Only the template message is sent — the "Generate Weekly Plan" button lives in the template
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0][0]).toBe('+919876543210');
    expect(mockSendTextMessage.mock.calls[0][2]).toBe('HX_WEEKLY_TEST_SID');
    expect(mockSendButtonMessage).not.toHaveBeenCalled();
  });
});
