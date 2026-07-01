/**
 * SaveData — localStorage persistence for Pokédex progress and stats.
 */

const SAVE_KEY = "flappy_pidgey_save_v1";

const DEFAULT_SAVE = {
  version: 2,
  bestScore: 0,
  totalRuns: 0,
  dex: {}, // { [pokemonId]: { caught: true, shinyCaught: true|false, firstCaughtAt: timestamp } }
  shinyCount: 0,
  totalCatches: 0,
  totalEncounters: 0,
};

function _migrateSave(save) {
  if (save.version === 2) return save;
  // v1 → v2: rename `shiny` to `shinyCaught` per entry
  for (const entry of Object.values(save.dex)) {
    if (entry && entry.shiny !== undefined) {
      entry.shinyCaught = entry.shiny;
      delete entry.shiny;
    }
  }
  save.version = 2;
  return save;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    const save = { ...structuredClone(DEFAULT_SAVE), ...parsed, dex: parsed.dex || {} };
    return _migrateSave(save);
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
  save.totalCatches++;
  const entry = save.dex[pokemonId] || (save.dex[pokemonId] = { caught: false, shinyCaught: false });

  if (isShiny) {
    if (!entry.shinyCaught) {
      entry.shinyCaught = true;
      if (!entry.caught) entry.firstCaughtAt = Date.now();
    }
    save.shinyCount++;
  } else {
    if (!entry.caught) {
      entry.caught = true;
      if (!entry.shinyCaught) entry.firstCaughtAt = Date.now();
    }
  }

  return save;
}

function getDexProgress(save) {
  let caught = 0;
  for (const e of Object.values(save.dex)) {
    if (e.caught) caught++;
    if (e.shinyCaught) caught++;
  }
  return { caught, total: 302 };
}
