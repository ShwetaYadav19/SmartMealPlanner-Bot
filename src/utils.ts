/** Simple delay helper — extracted so tests can mock it. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
