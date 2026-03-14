import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamoDBUserStateRepository } from '../../src/adapters/dynamodbUserStateRepository';
import type { UserState } from '../../src/core/types';

// Mock the DynamoDBDocumentClient
function createMockDocClient() {
  return {
    send: vi.fn(),
  };
}

describe('DynamoDBUserStateRepository', () => {
  let mockDocClient: ReturnType<typeof createMockDocClient>;
  let repo: DynamoDBUserStateRepository;

  beforeEach(() => {
    mockDocClient = createMockDocClient();
    repo = new DynamoDBUserStateRepository(
      'MealPlannerUsers-dev',
      mockDocClient as any
    );
  });

  describe('getUser', () => {
    it('returns null when user does not exist', async () => {
      mockDocClient.send.mockResolvedValue({ Item: undefined });

      const result = await repo.getUser('+919876543210');

      expect(result).toBeNull();
      expect(mockDocClient.send).toHaveBeenCalledOnce();
    });

    it('returns deserialized UserState for existing user', async () => {
      const storedItem = {
        phoneNumber: '+919876543210',
        onboardingComplete: true,
        conversationState: 'main_menu',
        cuisinePreference: 'north_indian',
        dietPreference: 'veg',
        mealStyle: 'health',
        cookPhoneNumber: '+919999999999',
      };
      mockDocClient.send.mockResolvedValue({ Item: storedItem });

      const result = await repo.getUser('+919876543210');

      expect(result).toEqual({
        phoneNumber: '+919876543210',
        onboardingComplete: true,
        conversationState: 'main_menu',
        cuisinePreference: 'north_indian',
        dietPreference: 'veg',
        mealStyle: 'health',
        cookPhoneNumber: '+919999999999',
      });
    });

    it('returns minimal UserState when optional fields are absent', async () => {
      const storedItem = {
        phoneNumber: '+919876543210',
        onboardingComplete: false,
        conversationState: 'awaiting_cuisine',
      };
      mockDocClient.send.mockResolvedValue({ Item: storedItem });

      const result = await repo.getUser('+919876543210');

      expect(result).toEqual({
        phoneNumber: '+919876543210',
        onboardingComplete: false,
        conversationState: 'awaiting_cuisine',
      });
      expect(result?.cuisinePreference).toBeUndefined();
      expect(result?.weeklyPlan).toBeUndefined();
    });

    it('deserializes weeklyPlan correctly', async () => {
      const weeklyPlan = [
        {
          day: 'Monday',
          breakfast: {
            id: 'ni-b-001',
            name: 'Poha',
            cuisine: 'north_indian',
            diet: 'veg',
            style: 'health',
            slots: ['breakfast'],
            ingredients: [{ name: 'Flattened Rice', quantity: '200g', category: 'grains' }],
          },
          lunch: {
            id: 'ni-l-001',
            name: 'Dal Rice',
            cuisine: 'north_indian',
            diet: 'veg',
            style: 'health',
            slots: ['lunch'],
            ingredients: [{ name: 'Toor Dal', quantity: '200g', category: 'lentils' }],
          },
          dinner: {
            id: 'ni-d-001',
            name: 'Roti Sabzi',
            cuisine: 'north_indian',
            diet: 'veg',
            style: 'regular',
            slots: ['dinner'],
            ingredients: [{ name: 'Wheat Flour', quantity: '200g', category: 'grains' }],
          },
        },
      ];

      mockDocClient.send.mockResolvedValue({
        Item: {
          phoneNumber: '+919876543210',
          onboardingComplete: true,
          conversationState: 'main_menu',
          weeklyPlan,
          weeklyPlanStartDate: '2024-01-15',
        },
      });

      const result = await repo.getUser('+919876543210');

      expect(result?.weeklyPlan).toEqual(weeklyPlan);
      expect(result?.weeklyPlanStartDate).toBe('2024-01-15');
    });
  });

  describe('saveUser', () => {
    it('saves a complete UserState', async () => {
      mockDocClient.send.mockResolvedValue({});

      const state: UserState = {
        phoneNumber: '+919876543210',
        onboardingComplete: true,
        conversationState: 'main_menu',
        cuisinePreference: 'both',
        dietPreference: 'non_veg',
        mealStyle: 'regular',
        cookPhoneNumber: '+919999999999',
      };

      await repo.saveUser(state);

      expect(mockDocClient.send).toHaveBeenCalledOnce();
      const call = mockDocClient.send.mock.calls[0][0];
      expect(call.input.TableName).toBe('MealPlannerUsers-dev');
      expect(call.input.Item.phoneNumber).toBe('+919876543210');
      expect(call.input.Item.onboardingComplete).toBe(true);
      expect(call.input.Item.cuisinePreference).toBe('both');
    });

    it('saves minimal UserState without optional fields', async () => {
      mockDocClient.send.mockResolvedValue({});

      const state: UserState = {
        phoneNumber: '+919876543210',
        onboardingComplete: false,
        conversationState: 'awaiting_cuisine',
      };

      await repo.saveUser(state);

      const call = mockDocClient.send.mock.calls[0][0];
      expect(call.input.Item.phoneNumber).toBe('+919876543210');
      expect(call.input.Item.onboardingComplete).toBe(false);
      expect(call.input.Item.cuisinePreference).toBeUndefined();
      expect(call.input.Item.weeklyPlan).toBeUndefined();
    });

    it('uses phoneNumber as partition key', async () => {
      mockDocClient.send.mockResolvedValue({});

      const state: UserState = {
        phoneNumber: '+14155551234',
        onboardingComplete: false,
        conversationState: 'awaiting_cuisine',
      };

      await repo.saveUser(state);

      const call = mockDocClient.send.mock.calls[0][0];
      expect(call.input.Item.phoneNumber).toBe('+14155551234');
    });
  });
});
