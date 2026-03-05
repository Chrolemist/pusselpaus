export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number | null | undefined): number {
  if (seed === null || seed === undefined || !Number.isFinite(seed)) {
    return Math.floor(Math.random() * 2_000_000_000);
  }
  return Math.abs(Math.floor(seed)) % 2_000_000_000;
}
