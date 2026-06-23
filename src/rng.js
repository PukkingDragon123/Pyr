// Seeded deterministic RNG (mulberry32). Logic RNG is split from any visual
// randomness so the same inputs reproduce the same game (determinism rule).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

// Advances the RNG stored on `state.rng` and returns a float in [0,1).
// Persisting state.rng keeps weather/disaster rolls deterministic across reloads.
export function nextRand(state) {
  let a = state.rng >>> 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rng = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rangeRand(state, min, max) { return min + nextRand(state) * (max - min); }
export function intRand(state, min, max) { return Math.floor(rangeRand(state, min, max + 1)); }

// Visual-only randomness — never feeds game logic.
export function vrand(min, max) { return min + Math.random() * (max - min); }
