/**
 * Game — the core engine. Single canvas, single update/render loop.
 * States: "menu" | "playing" | "encounter" | "throwing" | "result" | "gameover"
 */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = 0;
    this.H = 0;

    this.save = loadSave();
    this.state = "menu";
    this.score = 0;
    this.bestScore = this.save.bestScore;

    this.bird = { x: 0, y: 0, vy: 0, rot: 0, flapAnim: 0 };
    this.GRAVITY = 1500;
    this.FLAP_VY = -420;
    this.MAX_FALL_VY = 700;

    this.pipes = [];
    this.pipeTimer = 0;
    this.pipeInterval = 1.45;
    this.pipeGapBase = 165;
    this.pipeSpeed = 180;
    this.groundY = 0;

    this.baseSpeed = 180;
    this.baseInterval = 1.45;
    this.baseGap = 165;

    this.thresholds = this._buildThresholds();
    this.nextThresholdIdx = 0;

    this.encounter = null;
    this.throwState = null;
    this.particles = [];
    this.floatTexts = [];

    this.bgOffset = 0;
    this.cloudOffset = 0;

    this.inputLocked = false;
    this._bindInput();

    this.lastTime = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());

    // Preload player Pidgey sprites on startup
    loadSpriteImage(16, false);
    loadSpriteImage(16, true);

    requestAnimationFrame((t) => this._loop(t));

    this.ui = {
      menu: document.getElementById("menu-screen"),
      hud: document.getElementById("hud"),
      gameover: document.getElementById("gameover-screen"),
      dexButton: document.getElementById("dex-button"),
      dexModal: document.getElementById("dex-modal"),
    };
    this._wireMenuUI();
  }

  _buildThresholds() {
    const arr = [];
    let score = 8;
    let gap = 14;
    for (let i = 0; i < 60; i++) {
      arr.push(score);
      score += gap;
      gap = Math.min(gap + 2, 40);
    }
    return arr;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + "px";
    this.canvas.style.height = this.H + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.groundY = this.H - 90;
    if (this.state === "menu") {
      this.bird.x = this.W * 0.3;
      this.bird.y = this.H * 0.45;
    }
  }

  _bindInput() {
    const flap = (e) => {
      if (e) e.preventDefault();
      this._handleTap();
    };
    this.canvas.addEventListener("pointerdown", flap);
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code === "ArrowUp") flap(e);
    });
  }

  _wireMenuUI() {
    document.getElementById("play-button").addEventListener("click", () => this.startRun());
    document.getElementById("retry-button").addEventListener("click", () => this.startRun());
    this.ui.dexButton.addEventListener("click", () => this._openDex());
    document.getElementById("dex-close").addEventListener("click", () => this._closeDex());
    document.getElementById("gameover-dex-button").addEventListener("click", () => this._openDex());
  }

  _handleTap() {
    if (this.inputLocked) return;

    if (this.state === "playing") {
      this.bird.vy = this.FLAP_VY;
      this.bird.flapAnim = 1;
      this._spawnFlapParticle();
    } else if (this.state === "throwing" && this.throwState) {
      this._releaseThrow();
    }
  }

  startRun() {
    this.ui.menu.classList.add("hidden");
    this.ui.gameover.classList.add("hidden");
    this.ui.hud.classList.remove("hidden");

    this.score = 0;
    this.pipes = [];
    this.pipeTimer = 0;
    this.pipeSpeed = this.baseSpeed;
    this.pipeInterval = this.baseInterval;
    this.nextThresholdIdx = 0;
    this.particles = [];
    this.floatTexts = [];

    this.bird.x = this.W * 0.3;
    this.bird.y = this.H * 0.45;
    this.bird.vy = 0;
    this.bird.rot = 0;

    this.save.totalRuns++;
    writeSave(this.save);

    this.state = "playing";
    this._updateHUD();
  }

  gameOver() {
    this.state = "gameover";
    this.inputLocked = true;

    if (this.score > this.save.bestScore) {
      this.save.bestScore = this.score;
      this.bestScore = this.score;
    }
    writeSave(this.save);

    setTimeout(() => {
      this.ui.hud.classList.add("hidden");
      this.ui.gameover.classList.remove("hidden");
      const progress = getDexProgress(this.save);
      document.getElementById("final-score").textContent = this.score;
      document.getElementById("final-best").textContent = this.save.bestScore;
      document.getElementById("final-dex").textContent = `${progress.caught} / 151`;
      this.inputLocked = false;
    }, 700);
  }

  // ─── Main Loop ───────────────────────────────────────────────────────────

  _loop(timestamp) {
    try {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033) || 0;
      this.lastTime = timestamp;

      this._update(dt);
      this._render();
    } catch (e) {
      console.error("[Game] Error in loop:", e);
    }
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.bgOffset = (this.bgOffset + dt * 20) % this.W;
    this.cloudOffset = (this.cloudOffset + dt * 8) % this.W;

    if (this.state === "playing") {
      this._updatePlaying(dt);
    } else if (this.state === "throwing") {
      this._updateThrow(dt);
    } else if (this.state === "menu") {
      this.bird.y = this.H * 0.45 + Math.sin(performance.now() / 400) * 10;
    }

    this._updateParticles(dt);
    this._updateFloatTexts(dt);
  }

  _updatePlaying(dt) {
    this.bird.vy = Math.min(this.bird.vy + this.GRAVITY * dt, this.MAX_FALL_VY);
    this.bird.y += this.bird.vy * dt;
    this.bird.rot = velocityToAngle(this.bird.vy);
    if (this.bird.flapAnim > 0) this.bird.flapAnim -= dt * 6;

    if (this.bird.y > this.groundY - 14) {
      this.bird.y = this.groundY - 14;
      this._crash();
      return;
    }
    if (this.bird.y < 10) {
      this.bird.y = 10;
      this.bird.vy = 0;
    }

    this.pipeTimer += dt;
    if (this.pipeTimer >= this.pipeInterval) {
      this.pipeTimer = 0;
      this._spawnPipe();
    }

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const pipe = this.pipes[i];
      pipe.x -= this.pipeSpeed * dt;

      if (!pipe.scored && pipe.x + pipe.width < this.bird.x) {
        pipe.scored = true;
        this._addScore(1);
      }

      if (this._checkPipeCollision(pipe)) {
        this._crash();
        return;
      }

      if (pipe.x + pipe.width < -20) {
        this.pipes.splice(i, 1);
      }
    }
  }

  _spawnPipe() {
    const gap = Math.max(this.pipeGapBase - this.score * 0.5, 125);
    const margin = 60;
    const usable = this.H - this.groundY - margin * 2 - gap;
    const gapTop = margin + Math.random() * Math.max(usable, 40);

    this.pipes.push({
      x: this.W + 20,
      width: 56,
      gapTop,
      gapBottom: gapTop + gap,
      scored: false,
    });
  }

  _checkPipeCollision(pipe) {
    const bx = this.bird.x, by = this.bird.y;
    const r = 14;

    if (bx + r < pipe.x || bx - r > pipe.x + pipe.width) return false;
    if (by - r < pipe.gapTop || by + r > pipe.gapBottom) return true;
    return false;
  }

  _addScore(amount) {
    this.score += amount;
    this._updateHUD();
    this._spawnFloatText(this.bird.x, this.bird.y - 20, `+${amount}`, "#fff");

    this.pipeSpeed = Math.min(this.baseSpeed + this.score * 2.2, 340);
    this.pipeInterval = Math.max(this.baseInterval - this.score * 0.01, 0.95);

    if (
      this.nextThresholdIdx < this.thresholds.length &&
      this.score >= this.thresholds[this.nextThresholdIdx]
    ) {
      this.nextThresholdIdx++;
      this._triggerEncounter();
    }
  }

  _crash() {
    if (this.state !== "playing") return;
    this._spawnCrashParticles();
    this.gameOver();
  }

  // ─── Encounter Flow ──────────────────────────────────────────────────────

  _triggerEncounter() {
    this.state = "encounter";
    this.inputLocked = true;
    this.save.totalEncounters++;

    const pokemonId = getRandomPokemonId();
    const isShiny = Math.random() < 1 / 20;

    this.encounter = { pokemonId, isShiny };

    this._showEncounterUI();
  }

  _showEncounterUI() {
    const mon = getPokemon(this.encounter.pokemonId);
    const modal = document.getElementById("encounter-modal");
    const nameEl = document.getElementById("encounter-name");
    const spriteContainer = document.getElementById("encounter-sprite");
    const shinyBadge = document.getElementById("shiny-badge");
    const typesEl = document.getElementById("encounter-types");

    renderSpriteToElement(spriteContainer, mon.id, this.encounter.isShiny, 160);

    nameEl.textContent = `Wild ${mon.name} appeared!`;
    typesEl.innerHTML = mon.types
      .map(t => `<span class="type-badge" style="background:${TYPE_COLORS[t]}">${t}</span>`)
      .join("");

    shinyBadge.classList.toggle("hidden", !this.encounter.isShiny);

    modal.classList.remove("hidden");
    modal.classList.add("modal-enter");

    document.getElementById("throw-button").onclick = () => this._beginThrow();
  }

  _beginThrow() {
    document.getElementById("encounter-modal").classList.add("hidden");
    this.state = "throwing";
    this.inputLocked = false;

    this.throwState = {
      phase: "aiming",
      ringRadius: 1.0,
      direction: -1,
      speed: 0.85,
      ballProgress: 0,
    };

    document.getElementById("throw-prompt").classList.remove("hidden");
  }

  _updateThrow(dt) {
    if (!this.throwState) return;
    const t = this.throwState;

    if (t.phase === "aiming") {
      t.ringRadius += t.direction * t.speed * dt;
      if (t.ringRadius <= 0.22) { t.ringRadius = 0.22; t.direction = 1; }
      if (t.ringRadius >= 1.0) { t.ringRadius = 1.0; t.direction = -1; }
    } else if (t.phase === "flying") {
      t.ballProgress += dt * 2.2;
      if (t.ballProgress >= 1) {
        t.ballProgress = 1;
        this._animateBallThrow(t.catchChance, t.ringSize);
      }
    }
  }

  _releaseThrow() {
    if (!this.throwState || this.throwState.phase !== "aiming") return;

    const ringSize = this.throwState.ringRadius;
    const precisionBonus = (1 - ringSize) * 0.10;
    const catchChance = Math.min(0.90 + precisionBonus, 0.99);

    this.throwState.phase = "flying";
    this.throwState.ballProgress = 0;
    this.throwState.catchChance = catchChance;
    this.throwState.ringSize = ringSize;

    document.getElementById("throw-prompt").classList.add("hidden");
  }

  _animateBallThrow(catchChance, ringSize) {
    this.state = "result";
    const caught = Math.random() < catchChance;
    const quality = ringSize < 0.35 ? "excellent" : ringSize < 0.6 ? "great" : "good";

    this._showResultUI(caught, quality);
  }

  _showResultUI(caught, quality) {
    const mon = getPokemon(this.encounter.pokemonId);
    const modal = document.getElementById("result-modal");
    const titleEl = document.getElementById("result-title");
    const subEl = document.getElementById("result-sub");
    const spriteContainer = document.getElementById("result-sprite");

    renderSpriteToElement(spriteContainer, mon.id, this.encounter.isShiny, 140);

    const wasNew = !this.save.dex[mon.id]?.caught;

    if (caught) {
      recordCatch(this.save, mon.id, this.encounter.isShiny);
      writeSave(this.save);

      const qualityLabel = { excellent: "Excellent throw!", great: "Great throw!", good: "Nice throw!" }[quality];
      titleEl.textContent = `Gotcha! ${mon.name} was caught!`;
      titleEl.style.color = "#4ade80";
      subEl.textContent = wasNew
        ? `${qualityLabel} New Pokédex entry!`
        : `${qualityLabel} Already in your Pokédex.`;

      modal.classList.remove("result-fail");
      modal.classList.add("result-success");
    } else {
      titleEl.textContent = `Oh no! ${mon.name} broke free!`;
      titleEl.style.color = "#f87171";
      subEl.textContent = "Better luck on the next one!";

      modal.classList.remove("result-success");
      modal.classList.add("result-fail");
    }

    const progress = getDexProgress(this.save);
    document.getElementById("result-dex-progress").textContent = `Pokédex: ${progress.caught} / 151`;

    modal.classList.remove("hidden");

    document.getElementById("result-continue").onclick = () => this._continueAfterEncounter();
  }

  _continueAfterEncounter() {
    document.getElementById("result-modal").classList.add("hidden");
    this.encounter = null;
    this.throwState = null;
    this.state = "playing";
    this.inputLocked = false;
  }

  // ─── Pokédex Modal ───────────────────────────────────────────────────────

  _openDex() {
    const grid = document.getElementById("dex-grid");
    grid.innerHTML = "";

    for (let id = 1; id <= 151; id++) {
      const entry = this.save.dex[id];
      const caught = entry?.caught;
      const isShiny = entry?.shiny;
      const mon = getPokemon(id);

      const cell = document.createElement("div");
      cell.className = "dex-cell" + (caught ? " caught" : "") + (isShiny ? " shiny" : "");

      if (caught) {
        const spriteEl = document.createElement("div");
        spriteEl.style.cssText = "width:48px;height:48px;display:flex;align-items:center;justify-content:center;";
        renderDexCellSprite(spriteEl, id, isShiny);
        cell.appendChild(spriteEl);
        const label = document.createElement("div");
        label.className = "dex-cell-label";
        label.textContent = mon.name;
        cell.appendChild(label);
      } else {
        cell.innerHTML = `<div class="dex-unknown">?</div><div class="dex-cell-label">#${String(id).padStart(3, "0")}</div>`;
      }
      grid.appendChild(cell);
    }

    const progress = getDexProgress(this.save);
    document.getElementById("dex-progress-text").textContent = `${progress.caught} / 151 caught`;
    document.getElementById("dex-shiny-text").textContent = `✨ ${this.save.shinyCount} shiny catches`;

    this.ui.dexModal.classList.remove("hidden");
  }

  _closeDex() {
    this.ui.dexModal.classList.add("hidden");
  }

  // ─── Particles & Float Text ──────────────────────────────────────────────

  _spawnFlapParticle() {
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: this.bird.x - 14, y: this.bird.y + 6,
        vx: -60 - Math.random() * 40, vy: (Math.random() - 0.5) * 60,
        life: 0.4, maxLife: 0.4, size: 3 + Math.random() * 2,
        color: "rgba(255,255,255,0.6)",
      });
    }
  }

  _spawnCrashParticles() {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 150;
      this.particles.push({
        x: this.bird.x, y: this.bird.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 0.6, maxLife: 0.6, size: 3 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#ffcc55" : "#ff8855",
      });
    }
  }

  _spawnFloatText(x, y, text, color) {
    this.floatTexts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _updateFloatTexts(dt) {
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.y -= 40 * dt;
      f.life -= dt;
      if (f.life <= 0) this.floatTexts.splice(i, 1);
    }
  }

  _updateHUD() {
    document.getElementById("score-display").textContent = this.score;
    const progress = getDexProgress(this.save);
    document.getElementById("hud-dex-progress").textContent = `${progress.caught}/151`;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    this._renderSky(ctx);
    this._renderClouds(ctx);

    if (this.state === "playing" || this.state === "menu") {
      this._renderPipes(ctx);
    }

    this._renderGround(ctx);
    this._renderParticles(ctx);

    if (this.state !== "throwing") {
      this._renderBird(ctx);
    } else {
      this._renderThrowScene(ctx);
    }

    this._renderFloatTexts(ctx);
  }

  _renderSky(ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, "#7ec8e3");
    grad.addColorStop(0.7, "#a8dff0");
    grad.addColorStop(1, "#c8ecf5");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.W, this.H);
  }

  _renderClouds(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const cloudY = [80, 160, 220];
    for (let row = 0; row < 3; row++) {
      const offset = (this.cloudOffset * (0.5 + row * 0.3)) % (this.W + 200);
      for (let i = 0; i < 3; i++) {
        const x = ((i * 280 - offset) % (this.W + 200)) - 100;
        this._drawCloud(ctx, x, cloudY[row], 30 + row * 10);
      }
    }
  }

  _drawCloud(ctx, x, y, size) {
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.6, y + size * 0.1, size * 0.7, size * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.6, y + size * 0.15, size * 0.6, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _renderPipes(ctx) {
    for (const pipe of this.pipes) {
      this._drawPipeSegment(ctx, pipe.x, 0, pipe.width, pipe.gapTop, true);
      this._drawPipeSegment(ctx, pipe.x, pipe.gapBottom, pipe.width, this.groundY - pipe.gapBottom, false);
    }
  }

  _drawPipeSegment(ctx, x, y, w, h, isTop) {
    const capH = 26;
    const bodyGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    bodyGrad.addColorStop(0, "#4ec96a");
    bodyGrad.addColorStop(0.5, "#5fdb7a");
    bodyGrad.addColorStop(1, "#3eb359");

    ctx.fillStyle = bodyGrad;
    if (isTop) {
      ctx.fillRect(x, y, w, h - capH);
      ctx.fillStyle = "#3a9a4f";
      ctx.fillRect(x - 4, y + h - capH, w + 8, capH);
      ctx.fillStyle = "#5fdb7a";
      ctx.fillRect(x - 4, y + h - capH, w + 8, 6);
    } else {
      ctx.fillRect(x, y + capH, w, h - capH);
      ctx.fillStyle = "#3a9a4f";
      ctx.fillRect(x - 4, y, w + 8, capH);
      ctx.fillStyle = "#5fdb7a";
      ctx.fillRect(x - 4, y, w + 8, 6);
    }
  }

  _renderGround(ctx) {
    ctx.fillStyle = "#dcc77a";
    ctx.fillRect(0, this.groundY, this.W, this.H - this.groundY);
    ctx.fillStyle = "#c9b366";
    ctx.fillRect(0, this.groundY, this.W, 8);

    ctx.fillStyle = "#5fbd5f";
    const tuftSpacing = 24;
    const offset = this.bgOffset % tuftSpacing;
    for (let x = -offset; x < this.W + tuftSpacing; x += tuftSpacing) {
      ctx.fillRect(x, this.groundY - 6, 4, 6);
      ctx.fillRect(x + 8, this.groundY - 10, 4, 10);
    }
  }

  _renderBird(ctx) {
    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate((this.bird.rot * Math.PI) / 180);

    const flap = this.bird.flapAnim > 0 ? Math.sin(performance.now() / 40) * 6 : Math.sin(performance.now() / 180) * 3;

    ctx.fillStyle = "#d4a36a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a8763f";
    ctx.beginPath();
    ctx.ellipse(-4, 2 + flap, 10, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5e6c8";
    ctx.beginPath();
    ctx.ellipse(2, 4, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#a8763f";
    ctx.beginPath();
    ctx.moveTo(8, -10);
    ctx.lineTo(16, -18);
    ctx.lineTo(10, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8a73f";
    ctx.beginPath();
    ctx.moveTo(13, -2);
    ctx.lineTo(22, 1);
    ctx.lineTo(13, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(9, -4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(10, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawPokeball(ctx, x, y, r) {
    ctx.save();
    // Red top half
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = "#ee1515";
    ctx.fill();

    // White bottom half
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = "#f0f0f0";
    ctx.fill();

    // Black center band
    ctx.fillStyle = "#222";
    ctx.fillRect(x - r, y - r * 0.15, r * 2, r * 0.3);

    // White center button
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#eee";
    ctx.fill();
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer rim
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  _renderThrowScene(ctx) {
    ctx.fillStyle = "rgba(20, 20, 40, 0.5)";
    ctx.fillRect(0, 0, this.W, this.H);

    const cx = this.W / 2;
    const cy = this.H * 0.4;
    const bob = Math.sin(performance.now() / 300) * 6;

    renderPokemon(ctx, {
      dexNumber: this.encounter.pokemonId,
      shiny: this.encounter.isShiny,
      x: cx,
      y: cy + bob,
      size: 160,
    });

    if (!this.throwState) return;

    if (this.throwState.phase === "aiming") {
      const maxR = 90;
      const minR = 20;
      const r = minR + (maxR - minR) * this.throwState.ringRadius;

      // Outer guide ring (dashed)
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy + 90, minR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Shrinking ring with glow pulse
      ctx.save();
      const pulse = 0.6 + Math.sin(performance.now() / 200) * 0.4;
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(cx, cy + 90, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Pokéball at center of timing ring
      this._drawPokeball(ctx, cx, cy + 90, 14);
    } else if (this.throwState.phase === "flying") {
      const progress = this.throwState.ballProgress;
      const ease = 1 - Math.pow(1 - progress, 2);
      const targetX = cx;
      const targetY = cy + bob;
      const ballX = this.bird.x + (targetX - this.bird.x) * ease;
      const ballY = this.bird.y + (targetY - this.bird.y) * ease - Math.sin(progress * Math.PI) * 50;
      const ballScale = 0.5 + progress * 0.5;

      this._drawPokeball(ctx, ballX, ballY, 14 * ballScale);
    }
  }

  _renderParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(p.life / p.maxLife, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _renderFloatTexts(ctx) {
    ctx.textAlign = "center";
    ctx.font = "bold 20px 'Press Start 2P', monospace";
    for (const f of this.floatTexts) {
      ctx.globalAlpha = Math.max(f.life / f.maxLife, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

// Converts vertical velocity into a visual bird-tilt angle in degrees
function velocityToAngle(vy) {
  const clamped = Math.max(-500, Math.min(vy, 500));
  return (clamped / 500) * 75;
}
