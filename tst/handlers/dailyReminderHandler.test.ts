import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyReminderHandler } from '../../src/handlers/dailyReminderHandler';
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

      expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
      const [to, text] = mockSendButtonMessage.mock.calls[0];
      expect(to).toBe('+919876543210');
      // Daily reminder text should contain emoji formatting
      expect(text).toMatch(/🍽️/);
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

      // First call fails, second succeeds
      mockSendButtonMessage
        .mockRejectedValueOnce(new Error('Twilio error'))
        .mockResolvedValueOnce(undefined);

      await dailyReminderHandler(scheduledEvent);

      // Should have attempted both users
      expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
      expect(mockSendButtonMessage.mock.calls[1][0]).toBe('+912222222222');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends button messages (not text) for DAILY_REMINDER', async () => {
    // Set to Wednesday so tomorrow (Thursday) = index 3, within plan
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 12, 12, 0, 0)); // Wed Mar 12 2025
    try {
      const user = makeOnboardedUser('+919876543210', true);
      mockScanOnboardedUsers.mockResolvedValue([user]);

      await dailyReminderHandler(scheduledEvent);

      expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
      expect(mockSendTextMessage).not.toHaveBeenCalled();

      const [, , buttons] = mockSendButtonMessage.mock.calls[0];
      expect(buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'View Grocery List' }),
          expect.objectContaining({ title: 'Send to Cook' }),
        ]),
      );
      expect(buttons).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Swap Lunch' }),
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
