// Build the Pyramid is a single-player, client-side idle game.
// The platform still requires a rules module at the zip root; this is the
// canonical solo stub (no imports, no timers). All gameplay lives in the client.
export const meta = { game: "build-the-pyramid", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
