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
vi.mock('../../src/adapters/twilioMessagingProvider', () => ({
  TwilioMessagingProvider: vi.fn().mockImplementation(() => ({
    sendTextMessage: mockSendTextMessage,
    sendButtonMessage: mockSendButtonMessage,
  })),
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

    // Both users should receive a message
    expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
    expect(mockSendButtonMessage.mock.calls[0][0]).toBe('+911111111111');
    expect(mockSendButtonMessage.mock.calls[1][0]).toBe('+912222222222');
  });

  it('sends regardless of plan status', async () => {
    const userWithPlan = makeOnboardedUser('+911111111111', true);
    const userWithoutPlan = makeOnboardedUser('+912222222222', false);
    mockScanOnboardedUsers.mockResolvedValue([userWithPlan, userWithoutPlan]);

    await weeklyReminderHandler(scheduledEvent);

    // Both get the same WEEKLY_REMINDER message
    expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
    const [, text1] = mockSendButtonMessage.mock.calls[0];
    const [, text2] = mockSendButtonMessage.mock.calls[1];
    expect(text1).toBe(text2);
    expect(text1).toContain('🍽️');
    expect(text1).toContain('plan your meals');
  });

  it('handles empty user list gracefully', async () => {
    mockScanOnboardedUsers.mockResolvedValue([]);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockSendButtonMessage).not.toHaveBeenCalled();
  });

  it('continues processing other users when one fails', async () => {
    const user1 = makeOnboardedUser('+911111111111', true);
    const user2 = makeOnboardedUser('+912222222222', true);
    mockScanOnboardedUsers.mockResolvedValue([user1, user2]);

    mockSendButtonMessage
      .mockRejectedValueOnce(new Error('Twilio error'))
      .mockResolvedValueOnce(undefined);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
    expect(mockSendButtonMessage.mock.calls[1][0]).toBe('+912222222222');
  });

  it('sends button message with "Generate Weekly Plan" option', async () => {
    const user = makeOnboardedUser('+919876543210', false);
    mockScanOnboardedUsers.mockResolvedValue([user]);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).not.toHaveBeenCalled();

    const [, text, buttons] = mockSendButtonMessage.mock.calls[0];
    expect(text).toContain('🍽️');
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Generate Weekly Plan' }),
      ]),
    );
  });
});
