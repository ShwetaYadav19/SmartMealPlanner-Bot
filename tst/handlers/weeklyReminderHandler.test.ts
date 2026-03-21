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

    // user1 (with plan): plan text (sendTextMessage) + follow-up buttons
    // user2 (no plan): generate prompt with buttons
    // Total sendButtonMessage calls: 1 follow-up for user1 + 1 for user2 = 2
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0][0]).toBe('+911111111111');
    expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
  });

  it('shows existing plan with grocery/change options for users with a plan', async () => {
    const userWithPlan = makeOnboardedUser('+911111111111', true);
    mockScanOnboardedUsers.mockResolvedValue([userWithPlan]);

    await weeklyReminderHandler(scheduledEvent);

    // Primary message is plain text (plan is too long for button message body)
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    const [, planText] = mockSendTextMessage.mock.calls[0];
    expect(planText).toContain('Monday');
    expect(planText).toContain('meal plan');

    // Follow-up has grocery + change buttons
    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    const [, , followUpButtons] = mockSendButtonMessage.mock.calls[0];
    expect(followUpButtons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'weekly_grocery', title: 'View Grocery List' }),
        expect.objectContaining({ id: 'change_plan', title: 'Change Plan' }),
      ]),
    );
  });

  it('shows generate prompt for users without a plan', async () => {
    const userWithoutPlan = makeOnboardedUser('+912222222222', false);
    mockScanOnboardedUsers.mockResolvedValue([userWithoutPlan]);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(1);
    const [, text, buttons] = mockSendButtonMessage.mock.calls[0];
    expect(text).toContain('🍽️');
    expect(text).toContain('plan your meals');
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Generate Weekly Plan' }),
      ]),
    );
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

    mockSendButtonMessage
      .mockRejectedValueOnce(new Error('Twilio error'))
      .mockResolvedValueOnce(undefined);

    await weeklyReminderHandler(scheduledEvent);

    expect(mockSendButtonMessage).toHaveBeenCalledTimes(2);
    expect(mockSendButtonMessage.mock.calls[1][0]).toBe('+912222222222');
  });

  it('sends button message with "Generate Weekly Plan" option for no-plan user', async () => {
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
