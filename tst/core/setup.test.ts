import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Project setup verification', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should run a fast-check property test', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      })
    );
  });
});
