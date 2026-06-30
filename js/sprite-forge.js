/**
 * SpriteLoader — loads real Pokémon pixel-art sprites from PokéAPI's
 * public sprite repository. The sprites are the original official artwork,
 * served from GitHub at no cost and with no API key required.
 *
 * URL format:
 *   Normal: https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{id}.png
 *   Shiny:  https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/{id}.png
 *
 * Each sprite is a ~96×96 PNG with transparent background. We render them
 * with imageSmoothingEnabled = false (pixelated scaling) to preserve the
 * crisp retro look at any display size.
 */

const SPRITE_BASE   = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const SPRITE_SHINY  = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/";

// Image cache: key → HTMLImageElement (loaded) or Promise (loading)
const _imageCache = new Map();

/**
 * Load a Pokémon sprite image asynchronously.
 * Returns a Promise<HTMLImageElement>.
 * Subsequent calls for the same key return the same cached Promise.
 */
function loadSpriteImage(id, isShiny) {
  const key = `${id}_${isShiny ? "s" : "n"}`;
  if (_imageCache.has(key)) return _imageCache.get(key);

  const url = isShiny
    ? `${SPRITE_SHINY}${id}.png`
    : `${SPRITE_BASE}${id}.png`;

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      promise._resolved_img = img;
      resolve(img);
    };

    img.onerror = () => {
      // On network failure, fall back to the normal (non-shiny) sprite.
      // If that also fails, resolve with null — callers draw a fallback box.
      if (isShiny) {
        loadSpriteImage(id, false).then(resolve);
      } else {
        console.warn(`[SpriteLoader] Failed to load sprite for #${id}`);
        resolve(null);
      }
    };

    img.src = url;
  });

  _imageCache.set(key, promise);
  return promise;
}

/**
 * Eagerly preload sprites for a list of Pokémon IDs.
 * Call this when you know which encounters are coming up (e.g. after
 * triggering an encounter, preload the next few probable IDs).
 */
function preloadSprites(ids, includeShiny = false) {
  for (const id of ids) {
    loadSpriteImage(id, false);
    if (includeShiny) loadSpriteImage(id, true);
  }
}

/**
 * Preload the first 30 Pokémon on startup so early encounters don't show
 * a blank box while the image loads. The rest load on-demand.
 */
function preloadCommonSprites() {
  // Common early Kanto encounters + starters
  const priorityIds = [
    1,4,7,         // starters
    10,13,16,19,   // classic route 1/2 mons
    21,25,39,41,   // Spearow, Pikachu, Jigglypuff, Zubat
    52,54,63,      // Meowth, Psyduck, Abra
    // A few fan favourites so the dex looks good early
    94,131,143,147,149
  ];
  preloadSprites(priorityIds);
}

/**
 * Draw a Pokémon sprite onto a canvas context at a given position and size.
 * If the image isn't loaded yet, draws a styled placeholder and schedules
 * a re-render when the image arrives.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} id          Pokédex number
 * @param {boolean} isShiny
 * @param {number} x           Center x
 * @param {number} y           Center y
 * @param {number} size        Render size (width = height)
 * @param {function} [onLoad]  Optional callback when image loads (for re-render)
 * @returns {boolean}          true if drawn from cache, false if loading
 */
function drawSprite(ctx, id, isShiny, x, y, size, onLoad) {
  const key = `${id}_${isShiny ? "s" : "n"}`;
  const cached = _imageCache.get(key);

  // Already resolved to an image?
  if (cached && cached._resolved_img) {
    _blitSprite(ctx, cached._resolved_img, x, y, size);
    return true;
  }

  // Start / await the load
  const promise = loadSpriteImage(id, isShiny);
  promise.then((img) => {
    // Attach the resolved image directly to the promise object for O(1) sync access
    promise._resolved_img = img;
    if (onLoad) onLoad(img);
  });

  // Draw placeholder while loading
  _drawPlaceholder(ctx, id, x, y, size);
  return false;
}

/**
 * Synchronously get a loaded HTMLImageElement, or null if not yet loaded.
 * Used for the Pokédex grid cells where we want instant blit-or-skip.
 */
function getSpriteSync(id, isShiny) {
  const key = `${id}_${isShiny ? "s" : "n"}`;
  const cached = _imageCache.get(key);
  if (!cached) return null;
  return cached._resolved_img || null;
}

/**
 * Draw a sprite into an <img> element in a DOM container.
 * Used by the encounter modal and result modal, where HTML handles layout.
 * Returns the img element.
 */
function renderSpriteToElement(container, id, isShiny, size = 160) {
  container.innerHTML = "";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.width  = size;
  img.height = size;
  img.style.imageRendering = "pixelated";
  img.style.width  = size + "px";
  img.style.height = size + "px";
  img.style.filter = "drop-shadow(0 6px 12px rgba(0,0,0,0.3))";
  img.alt = `Pokémon #${id}`;

  // Show a spinner/placeholder until the real image loads
  const placeholder = document.createElement("div");
  placeholder.className = "sprite-loading";
  placeholder.style.cssText = `
    width:${size}px; height:${size}px; display:flex;
    align-items:center; justify-content:center;
    font-size:32px; animation:spin 1s linear infinite;
  `;
  placeholder.textContent = "⚪";
  container.appendChild(placeholder);

  const url = isShiny
    ? `${SPRITE_SHINY}${id}.png`
    : `${SPRITE_BASE}${id}.png`;

  img.onload = () => {
    container.innerHTML = "";
    container.appendChild(img);
    // Add shiny sparkle overlay on top
    if (isShiny) {
      const sparkle = document.createElement("div");
      sparkle.className = "shiny-sparkle-overlay";
      container.appendChild(sparkle);
    }
  };

  img.onerror = () => {
    // Fall back: try normal sprite if shiny failed
    if (isShiny) {
      renderSpriteToElement(container, id, false, size);
    } else {
      placeholder.textContent = "❓";
    }
  };

  img.src = url;
  return img;
}

/**
 * Build an img element for a Pokédex grid cell (small, fast).
 */
function renderDexCellSprite(container, id, isShiny) {
  container.innerHTML = "";

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.width  = 48;
  img.height = 48;
  img.style.imageRendering = "pixelated";
  img.style.width  = "48px";
  img.style.height = "48px";
  img.alt = `#${id}`;

  const url = isShiny
    ? `${SPRITE_SHINY}${id}.png`
    : `${SPRITE_BASE}${id}.png`;

  img.onerror = () => {
    if (isShiny) {
      const fallback = new Image();
      fallback.src = `${SPRITE_BASE}${id}.png`;
      fallback.crossOrigin = "anonymous";
      Object.assign(fallback.style, img.style);
      container.innerHTML = "";
      container.appendChild(fallback);
    }
  };

  img.src = url;
  container.appendChild(img);
}

/**
 * Centralized Pokémon renderer for canvas contexts.
 * Every Pokémon visual on the canvas should flow through this function.
 */
function renderPokemon(ctx, opts) {
  const { dexNumber, shiny = false, x, y, size = 80, rotation = 0 } = opts || {};
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  drawSprite(ctx, dexNumber, shiny, 0, 0, size);
  ctx.restore();
}

// ─── Canvas helpers (used during the throw minigame overlay) ──────────────

function _blitSprite(ctx, img, cx, cy, size) {
  if (!img) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

function _drawPlaceholder(ctx, id, cx, cy, size) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Spinning Pokéball placeholder
  const t = performance.now() / 400;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.3, t, t + Math.PI * 1.5);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `${size * 0.18}px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${id}`, cx, cy + size * 0.4);
  ctx.restore();
}

// Kick off common sprite preloading the moment this script is parsed
preloadCommonSprites();
