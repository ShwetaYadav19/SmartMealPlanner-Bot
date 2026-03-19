import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JsonMealComponentRepository } from '../../src/adapters/jsonMealComponentRepository';
import type { MealComponent } from '../../src/core/types';

const fixtureComponents: MealComponent[] = [
  {
    id: 'si-base-001',
    name: 'Rice',
    category: 'base',
    cuisine: 'south_indian',
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Rice', quantity: '300g', category: 'grains' }],
  },
  {
    id: 'ni-base-001',
    name: 'Roti',
    category: 'base',
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'regular',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Wheat Flour', quantity: '200g', category: 'grains' }],
  },
  {
    id: 'si-gravy-001',
    name: 'Sambar',
    category: 'gravy',
    cuisine: 'south_indian',
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Toor Dal', quantity: '100g', category: 'lentils' }],
  },
  {
    id: 'ni-gravy-001',
    name: 'Rajma',
    category: 'gravy',
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'regular',
    slots: ['lunch'],
    ingredients: [{ name: 'Rajma', quantity: '200g', category: 'lentils' }],
  },
  {
    id: 'si-dry_veggie-001',
    name: 'Beans Poriyal',
    category: 'dry_veggie',
    cuisine: 'south_indian',
    diet: 'veg',
    style: 'health',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Beans', quantity: '200g', category: 'vegetables' }],
  },
  {
    id: 'ni-side-001',
    name: 'Raita',
    category: 'side',
    cuisine: 'north_indian',
    diet: 'veg',
    style: 'regular',
    slots: ['lunch', 'dinner'],
    ingredients: [{ name: 'Curd', quantity: '200g', category: 'dairy' }],
  },
];

function writeFixture(data: unknown): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-comp-'));
  const filePath = path.join(tmpDir, 'meal-components.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  return filePath;
}

describe('JsonMealComponentRepository', () => {
  const fixturePath = writeFixture(fixtureComponents);
  const repo = new JsonMealComponentRepository(fixturePath);

  it('loads all components from the JSON file', async () => {
    const all = await repo.getComponents({});
    expect(all).toHaveLength(fixtureComponents.length);
  });

  it('filters by cuisine south_indian', async () => {
    const components = await repo.getComponents({ cuisine: 'south_indian' });
    expect(components.length).toBeGreaterThan(0);
    components.forEach((c) => expect(c.cuisine).toBe('south_indian'));
  });

  it('filters by cuisine north_indian', async () => {
    const components = await repo.getComponents({ cuisine: 'north_indian' });
    expect(components.length).toBeGreaterThan(0);
    components.forEach((c) => expect(c.cuisine).toBe('north_indian'));
  });

  it('returns only north_indian-tagged items when cuisine filter is "both"', async () => {
    const components = await repo.getComponents({ cuisine: 'both' });
    expect(components.length).toBeGreaterThan(0);
    for (const c of components) {
      expect(c.cuisine).toContain('north_indian');
    }
    // Should not include south_indian-only items
    const southOnly = components.filter((c) => !c.cuisine.includes('north_indian'));
    expect(southOnly.length).toBe(0);
  });

  it('filters by diet', async () => {
    const veg = await repo.getComponents({ diet: 'veg' });
    veg.forEach((c) => expect(c.diet).toBe('veg'));
  });

  it('returns all diets when diet filter is "both"', async () => {
    const components = await repo.getComponents({ diet: 'both' });
    expect(components).toHaveLength(fixtureComponents.length);
  });

  it('filters by style', async () => {
    const health = await repo.getComponents({ style: 'health' });
    health.forEach((c) => expect(c.style).toBe('health'));

    const regular = await repo.getComponents({ style: 'regular' });
    regular.forEach((c) => expect(c.style).toBe('regular'));
  });

  it('filters by slot', async () => {
    const lunch = await repo.getComponents({ slot: 'lunch' });
    lunch.forEach((c) => expect(c.slots).toContain('lunch'));

    const dinner = await repo.getComponents({ slot: 'dinner' });
    dinner.forEach((c) => expect(c.slots).toContain('dinner'));
  });

  it('filters by category', async () => {
    const bases = await repo.getComponents({ category: 'base' });
    bases.forEach((c) => expect(c.category).toBe('base'));
    expect(bases).toHaveLength(2);

    const gravies = await repo.getComponents({ category: 'gravy' });
    gravies.forEach((c) => expect(c.category).toBe('gravy'));
    expect(gravies).toHaveLength(2);
  });

  it('applies multiple filters together', async () => {
    const components = await repo.getComponents({
      cuisine: 'south_indian',
      diet: 'veg',
      style: 'health',
      slot: 'lunch',
      category: 'gravy',
    });
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('Sambar');
  });

  it('returns empty array when no components match', async () => {
    const components = await repo.getComponents({
      cuisine: 'north_indian',
      category: 'dry_veggie',
    });
    expect(components).toHaveLength(0);
  });

  it('throws descriptive error when file is missing', () => {
    expect(() => new JsonMealComponentRepository('/nonexistent/path.json')).toThrow(
      /Failed to read meal components file/
    );
  });

  it('throws descriptive error when file contains malformed JSON', () => {
    const badPath = writeFixture('not valid json {{');
    // writeFixture writes JSON.stringify, so we need to write raw bad content
    fs.writeFileSync(badPath, 'not valid json {{', 'utf-8');
    expect(() => new JsonMealComponentRepository(badPath)).toThrow(
      /Failed to parse meal components JSON/
    );
  });

  it('throws descriptive error when file contains non-array JSON', () => {
    const objPath = writeFixture({ not: 'an array' });
    // writeFixture wraps in JSON.stringify which is valid JSON but not an array
    expect(() => new JsonMealComponentRepository(objPath)).toThrow(
      /expected a JSON array/
    );
  });
});
