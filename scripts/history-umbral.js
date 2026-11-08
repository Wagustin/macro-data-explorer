// Failure threshold for scripts/refresh-history.js. The catalog keeps growing, but
// many listed symbols have no official history yet. A failure only matters when
// symbols that previously had a cached series stop updating, or when a cold cache
// cannot fetch anything. New symbols without data stay absent and do not fail.
// Usage: imported by scripts/refresh-history.js and test/history-umbral.test.js
export function debeFallar({ previos, actualizados, ok, smv }) {
  if (previos.size >= 20) {
    let updated = 0;
    for (const s of previos) if (actualizados.has(s)) updated++;
    return updated < previos.size * 0.75;
  }
  // Cold cache (always the case in GitHub Actions: only the model is cached). Besides the floor, the
  // SMV registry must have answered for a good share of the Lima stocks (125 on 8-nov-2026); if the
  // registry is down, the series that survive come from other sources and the run must be red.
  return ok < 40 || (typeof smv === "number" && smv < 60);
}
