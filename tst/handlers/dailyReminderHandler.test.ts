import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyReminderHandler } from '../../src/handlers/dailyReminderHandler';
import { getComingMondayISO } from '../../src/core/botEngine';
import type { UserState, DayPlan, Meal } from '../../src/core/types';

// Mock the delay to resolve immediately in tests
vi.mock('../../src/utils', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

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
const mockSendListMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/adapters/twilioMessagingProvider', () => ({
  TwilioMessagingProvider: vi.fn().mockImplementation(() => ({
    sendTextMessage: mockSendTextMessage,
    sendButtonMessage: mockSendButtonMessage,
    sendListMessage: mockSendListMessage,
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

function makeOnboardedUser(phone: string, withPlan: boolean, startDate?: string): UserState {
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
    user.weeklyPlanStartDate = startDate ?? getComingMondayISO();
  }
  return user;
}

const scheduledEvent = {
  source: 'aws.events',
  'detail-type': 'Scheduled Event',
  detail: {},
};

describe('dailyReminderHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends DAILY_REMINDER to users with valid plan covering tomorrow', async () => {
    // Set to Wednesday so tomorrow (Thursday) = index 3, within plan
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
    try {
      const user = makeOnboardedUser('+919876543210', true);
      mockScanOnboardedUsers.mockResolvedValue([user]);

      await dailyReminderHandler(scheduledEvent);

      // Template message sent via sendTextMessage with contentSid + contentVariables
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
      const [to, , contentSid, contentVars] = mockSendTextMessage.mock.calls[0];
      expect(to).toBe('+919876543210');
      expect(contentSid).toBe('HX708fce9ebb60de686f73731e071aa8cb');
      expect(contentVars).toEqual({
        '1': 'Thursday Breakfast',
        '2': 'Thursday Lunch',
        '3': 'Thursday Dinner',
      });

      // Follow-up grocery prompt sent as in-session button message
      expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
      const [, groceryText] = mockSendButtonMessage.mock.calls[0];
      expect(groceryText).toMatch(/grocery/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends EXPIRED_PLAN_PROMPT to users with expired/missing plans', async () => {
    // User with no plan at all
    const user = makeOnboardedUser('+919876543210', false);
    mockScanOnboardedUsers.mockResolvedValue([user]);

    await dailyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    const [to, text, buttons] = mockSendButtonMessage.mock.calls[0];
    expect(to).toBe('+919876543210');
    expect(text).toContain('expired');
    // Should have "Generate Weekly Plan" button
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Generate Weekly Plan' }),
      ]),
    );
  });

  it('sends EXPIRED_PLAN_PROMPT for plan with expired start date', async () => {
    // Plan from 3 weeks ago — won't cover tomorrow
    const user = makeOnboardedUser('+919876543210', true, '2024-01-01');
    mockScanOnboardedUsers.mockResolvedValue([user]);

    await dailyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    const [, text, buttons] = mockSendButtonMessage.mock.calls[0];
    expect(text).toContain('expired');
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Generate Weekly Plan' }),
      ]),
    );
  });

  it('handles empty user list gracefully', async () => {
    mockScanOnboardedUsers.mockResolvedValue([]);

    await dailyReminderHandler(scheduledEvent);

    expect(mockSendTextMessage).not.toHaveBeenCalled();
    expect(mockSendButtonMessage).not.toHaveBeenCalled();
  });

  it('continues processing other users when one fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
    try {
      const user1 = makeOnboardedUser('+911111111111', true);
      const user2 = makeOnboardedUser('+912222222222', true);
      mockScanOnboardedUsers.mockResolvedValue([user1, user2]);

      // First template send fails, second succeeds
      mockSendTextMessage
        .mockRejectedValueOnce(new Error('Twilio error'))
        .mockResolvedValueOnce(undefined);

      await dailyReminderHandler(scheduledEvent);

      // Should have attempted both users (template send)
      expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
      expect(mockSendTextMessage.mock.calls[1][0]).toBe('+912222222222');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends template then grocery buttons for DAILY_REMINDER', async () => {
    // Set to Wednesday so tomorrow (Thursday) = index 3, within plan
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
    try {
      const user = makeOnboardedUser('+919876543210', true);
      mockScanOnboardedUsers.mockResolvedValue([user]);

      await dailyReminderHandler(scheduledEvent);

      // Template sent via sendTextMessage
      expect(mockSendTextMessage).toHaveBeenCalledTimes(1);

      // Grocery prompt sent as in-session button message
      expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
      const [, , buttons] = mockSendButtonMessage.mock.calls[0];
      expect(buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'daily_grocery_yes' }),
          expect.objectContaining({ id: 'daily_grocery_no' }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends button messages (not text) for EXPIRED_PLAN_PROMPT', async () => {
    const user = makeOnboardedUser('+919876543210', false);
    mockScanOnboardedUsers.mockResolvedValue([user]);

    await dailyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });
});
