import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webhookHandler } from '../../src/handlers/webhookHandler';
import type { CandidateDishes, MealComponent, Meal } from '../../src/core/types';

// ============================================================
// Integration Test 5.1
// **Validates: Requirements 2.1, 2.2**
//
// INTEGRATION TEST: Expected to PASS on fixed code.
// Tests the full webhook handler flow end-to-end:
//   - User is in dish_preview at gravy step with 6 list items
//   - lastButtonIds has 6 remove_dish IDs + next_category
//   - User types "7" (the correct offset number after the fix)
//   - Webhook resolves input to next_category and advances step
// ============================================================

// --- Mock config ---
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

// --- Mock DynamoDB adapter ---
const mockGetUser = vi.fn();
const mockSaveUser = vi.fn();
vi.mock('../../src/adapters/dynamodbUserStateRepository', () => ({
  DynamoDBUserStateRepository: vi.fn().mockImplementation(() => ({
    getUser: mockGetUser,
    saveUser: mockSaveUser,
  })),
}));

// --- Mock JsonMealRepository ---
vi.mock('../../src/adapters/jsonMealRepository', () => ({
  JsonMealRepository: vi.fn().mockImplementation(() => ({
    getMeals: vi.fn().mockResolvedValue([]),
    getMealById: vi.fn().mockResolvedValue(null),
  })),
}));

// --- Mock JsonMealComponentRepository ---
vi.mock('../../src/adapters/jsonMealComponentRepository', () => ({
  JsonMealComponentRepository: vi.fn().mockImplementation(() => ({
    getComponents: vi.fn().mockResolvedValue([]),
  })),
}));

// --- Mock TwilioMessagingProvider ---
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

// Mock voice note sender — Polly is not available in tests
vi.mock('../../src/core/voiceNoteSender', () => ({
  sendMealVoiceNote: vi.fn().mockResolvedValue(undefined),
}));

// --- Helpers ---

function makeEvent(body: string) {
  return {
    body,
    isBase64Encoded: false,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
}

function makeMealComponent(id: string, name: string, category: 'base' | 'gravy' | 'dry_veggie' | 'side'): MealComponent {
  return {
    id,
    name,
    category,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'regular',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'test', quantity: '1 cup', category: 'vegetables' }],
  };
}

function makeBreakfast(id: string, name: string): Meal {
  return {
    id,
    name,
    cuisine: ['north_indian'],
    diet: 'veg',
    style: 'regular',
    slots: ['breakfast'],
    ingredients: [{ name: 'test', quantity: '1 cup', category: 'grains' }],
  };
}

/** Build a CandidateDishes with 7 breakfasts and 6 items per component category */
function buildCandidateDishes(): CandidateDishes {
  const breakfasts = Array.from({ length: 7 }, (_, i) =>
    makeBreakfast(`breakfast_${i + 1}`, `Breakfast ${i + 1}`),
  );

  const makePool = (cat: 'base' | 'gravy' | 'dry_veggie' | 'side') =>
    Array.from({ length: 6 }, (_, i) =>
      makeMealComponent(`${cat}_${String(i + 1).padStart(3, '0')}`, `${cat} Item ${i + 1}`, cat),
    );

  const lunchComponents = {
    base: makePool('base'),
    gravy: makePool('gravy'),
    dry_veggie: makePool('dry_veggie'),
    side: makePool('side'),
  };
  const dinnerComponents = {
    base: [],
    gravy: [],
    dry_veggie: [],
    side: [],
  };

  return { breakfasts, lunchComponents, dinnerComponents };
}

describe('Integration 5.1: full webhook flow — user types correct offset number to advance past dish preview step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveUser.mockResolvedValue(undefined);
  });

  it('typing "7" at gravy step with 6 list items resolves to next_category and advances to dry_veggie', async () => {
    const candidates = buildCandidateDishes();

    // 6 gravy list item IDs + 1 button ID (next_category)
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',
    ];

    // Set up user in dish_preview at gravy step
    mockGetUser.mockResolvedValue({
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'dish_preview',
      previewStep: 'gravy',
      cuisinePreference: 'north_indian',
      dietPreference: 'veg',
      mealStyle: 'regular',
      candidateDishes: candidates,
      lastButtonIds,
    });

    // User types "7" — the correct offset number for next_category
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=7');
    const result = await webhookHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the saved state advanced to dry_veggie
    expect(mockSaveUser).toHaveBeenCalledOnce();
    const savedState = mockSaveUser.mock.calls[0][0];
    expect(savedState.conversationState).toBe('dish_preview');
    expect(savedState.previewStep).toBe('dry_veggie');
  });
});

// ============================================================
// Integration Test 5.2
// **Validates: Requirements 2.4**
//
// INTEGRATION TEST: Expected to PASS on fixed code.
// Tests the full webhook handler flow end-to-end:
//   - User is in dish_preview at gravy step with 6 list items
//   - User types "next" (free text, no button payload)
//   - After the fix, "next" in dish_preview maps to Intent.NEXT_CATEGORY
//   - Webhook handler advances the preview step to dry_veggie
// ============================================================

describe('Integration 5.2: full webhook flow — user types "next" at gravy step → advances to dry_veggie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveUser.mockResolvedValue(undefined);
  });

  it('typing "next" at gravy step maps to NEXT_CATEGORY and advances to dry_veggie', async () => {
    const candidates = buildCandidateDishes();

    // 6 gravy list item IDs + 1 button ID (next_category)
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',
    ];

    // Set up user in dish_preview at gravy step
    mockGetUser.mockResolvedValue({
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'dish_preview',
      previewStep: 'gravy',
      cuisinePreference: 'north_indian',
      dietPreference: 'veg',
      mealStyle: 'regular',
      candidateDishes: candidates,
      lastButtonIds,
    });

    // User types "next" — free text, no button payload
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=next');
    const result = await webhookHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the saved state advanced to dry_veggie
    expect(mockSaveUser).toHaveBeenCalledOnce();
    const savedState = mockSaveUser.mock.calls[0][0];
    expect(savedState.conversationState).toBe('dish_preview');
    expect(savedState.previewStep).toBe('dry_veggie');
  });
});

// ============================================================
// Integration Test 5.3
// **Validates: Requirements 3.2**
//
// INTEGRATION TEST: Expected to PASS on fixed code.
// Tests the full webhook handler flow end-to-end:
//   - User is in dish_preview at gravy step with 6 list items
//   - lastButtonIds has 6 remove_dish IDs + next_category
//   - User types "1" (intending to remove the first dish)
//   - Webhook resolves "1" to remove_dish_gravy_001 and removes
//     the first dish — does NOT advance to next step
//   - User remains at gravy step with the first dish removed
// ============================================================

describe('Integration 5.3: full webhook flow — user types "1" at step with list items → removes first dish (not advance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveUser.mockResolvedValue(undefined);
  });

  it('typing "1" at gravy step with 6 list items removes the first gravy dish and stays at gravy', async () => {
    const candidates = buildCandidateDishes();

    // 6 gravy list item IDs + 1 button ID (next_category)
    const lastButtonIds = [
      'remove_dish_gravy_001',
      'remove_dish_gravy_002',
      'remove_dish_gravy_003',
      'remove_dish_gravy_004',
      'remove_dish_gravy_005',
      'remove_dish_gravy_006',
      'next_category',
    ];

    // Set up user in dish_preview at gravy step
    mockGetUser.mockResolvedValue({
      phoneNumber: '+919876543210',
      onboardingComplete: true,
      conversationState: 'dish_preview',
      previewStep: 'gravy',
      cuisinePreference: 'north_indian',
      dietPreference: 'veg',
      mealStyle: 'regular',
      candidateDishes: candidates,
      lastButtonIds,
    });

    // User types "1" — should resolve to remove_dish_gravy_001 (first list item)
    const event = makeEvent('From=whatsapp%3A%2B919876543210&Body=1');
    const result = await webhookHandler(event);

    expect(result.statusCode).toBe(200);

    // Verify the saved state stayed at gravy (did NOT advance)
    expect(mockSaveUser).toHaveBeenCalledOnce();
    const savedState = mockSaveUser.mock.calls[0][0];
    expect(savedState.conversationState).toBe('dish_preview');
    expect(savedState.previewStep).toBe('gravy');

    // Verify the first gravy dish was removed from candidateDishes
    const savedGravyLunch = savedState.candidateDishes.lunchComponents.gravy;
    expect(savedGravyLunch.every((c: MealComponent) => c.id !== 'gravy_001')).toBe(true);
    expect(savedGravyLunch).toHaveLength(5);

    // Verify gravy_001 is in the excluded list
    expect(savedState.excludedDishIds).toContain('gravy_001');
  });
});
