/**
 * SaveData — localStorage persistence for Pokédex progress and stats.
 */

const SAVE_KEY = "flappy_pidgey_save_v1";

const DEFAULT_SAVE = {
  version: 1,
  bestScore: 0,
  totalRuns: 0,
  dex: {}, // { [pokemonId]: { caught: true, shiny: true|false, firstCaughtAt: timestamp } }
  shinyCount: 0,
  totalCatches: 0,
  totalEncounters: 0,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SAVE), ...parsed, dex: parsed.dex || {} };
  } catch (e) {
    console.warn("[SaveData] Failed to load save, using defaults:", e);
    return structuredClone(DEFAULT_SAVE);
  }
}

function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    console.warn("[SaveData] Failed to write save:", e);
    return false;
  }
}

function recordCatch(save, pokemonId, isShiny) {
  const existing = save.dex[pokemonId];
  save.totalCatches++;

  if (!existing || !existing.caught) {
    save.dex[pokemonId] = {
      caught: true,
      shiny: isShiny,
      firstCaughtAt: Date.now(),
    };
  } else if (isShiny && !existing.shiny) {
    // Upgrade existing entry to note a shiny was also caught
    existing.shiny = true;
  }

  if (isShiny) save.shinyCount++;
  return save;
}

function getDexProgress(save) {
  const caught = Object.values(save.dex).filter(e => e.caught).length;
  return { caught, total: 151 };
}
