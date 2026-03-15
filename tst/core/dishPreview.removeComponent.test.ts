import { describe, it, expect } from 'vitest';
import { removeComponent } from '../../src/core/dishPreview';
import type { CandidateDishes, MealComponent, ComponentsByCategory } from '../../src/core/types';

function makeComponent(id: string, name: string, category: 'base' | 'gravy' | 'dry_veggie' | 'side'): MealComponent {
  return {
    id, name, category,
    cuisine: 'south_indian', diet: 'veg', style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Ingredient', quantity: '100g', category: 'vegetables' }],
  };
}

function makeComponentsByCategory(counts: { base?: number; gravy?: number; dry_veggie?: number; side?: number } = {}): ComponentsByCategory {
  const make = (cat: 'base' | 'gravy' | 'dry_veggie' | 'side', n: number) =>
    Array.from({ length: n }, (_, i) => makeComponent(`${cat}-${i}`, `${cat} ${i}`, cat));
  return {
    base: make('base', counts.base ?? 2),
    gravy: make('gravy', counts.gravy ?? 2),
    dry_veggie: make('dry_veggie', counts.dry_veggie ?? 2),
    side: make('side', counts.side ?? 2),
  };
}

function makeCandidates(overrides?: Partial<CandidateDishes>): CandidateDishes {
  return {
    breakfasts: [],
    lunchComponents: makeComponentsByCategory(),
    dinnerComponents: makeComponentsByCategory(),
    ...overrides,
  };
}

describe('removeComponent', () => {
  it('removes a component from lunchComponents and returns updated candidates', () => {
    const candidates = makeCandidates();
    const result = removeComponent(candidates, 'base-0');

    expect(result).not.toBeNull();
    expect(result!.removedComponentName).toBe('base 0');
    expect(result!.removedComponentCategory).toBe('base');
    // Same ID exists in both slots — removed from both
    expect(result!.candidates.lunchComponents.base).toHaveLength(1);
    expect(result!.candidates.lunchComponents.base[0].id).toBe('base-1');
    expect(result!.candidates.dinnerComponents.base).toHaveLength(1);
    expect(result!.candidates.dinnerComponents.base[0].id).toBe('base-1');
  });

  it('removes a component from dinnerComponents when not found in lunch', () => {
    const lunch = makeComponentsByCategory();
    const dinner = makeComponentsByCategory();
    // Give dinner a unique component
    dinner.gravy.push(makeComponent('dinner-gravy-special', 'Special Gravy', 'gravy'));
    const candidates = makeCandidates({ lunchComponents: lunch, dinnerComponents: dinner });

    const result = removeComponent(candidates, 'dinner-gravy-special');

    expect(result).not.toBeNull();
    expect(result!.removedComponentName).toBe('Special Gravy');
    expect(result!.removedComponentCategory).toBe('gravy');
    expect(result!.candidates.dinnerComponents.gravy).toHaveLength(2);
  });

  it('returns null when removing would leave a category empty in any slot', () => {
    const candidates = makeCandidates({
      lunchComponents: makeComponentsByCategory({ base: 1 }),
      dinnerComponents: makeComponentsByCategory({ base: 1 }),
    });

    const result = removeComponent(candidates, 'base-0');
    expect(result).toBeNull();
  });

  it('returns null when component ID is not found', () => {
    const candidates = makeCandidates();
    const result = removeComponent(candidates, 'nonexistent-id');
    expect(result).toBeNull();
  });

  it('does not mutate the original candidates', () => {
    const candidates = makeCandidates();
    const originalBaseLength = candidates.lunchComponents.base.length;

    removeComponent(candidates, 'base-0');

    expect(candidates.lunchComponents.base).toHaveLength(originalBaseLength);
  });

  it('removes from all slots where the component appears', () => {
    // Both lunch and dinner have the same component IDs by default
    const candidates = makeCandidates();
    const result = removeComponent(candidates, 'base-0');

    expect(result).not.toBeNull();
    // Removed from both lunch and dinner
    expect(result!.candidates.lunchComponents.base).toHaveLength(1);
    expect(result!.candidates.dinnerComponents.base).toHaveLength(1);
  });
});
