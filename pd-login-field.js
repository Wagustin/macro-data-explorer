/**
 * PerData — Campo de Tinta (login)
 * Canvas 2D scene: a faint ink background, the P10–P90 fan drawn as vertical ticks and a smooth
 * price line written on at load. Near the pointer the central projection bends towards it, always
 * inside the band, and the ticks along it light up. Redraws only while something moves.
 * Exported as window.PDLoginField.start(canvas) / stop().
 */
(function(window, document) {
  'use strict';

  const INK = '#EDE8DC';
  const INTRO_MS = 1800;
  const PULSE_PERIOD = 2600;  // ms between two soft pulses along the fan
  const PULSE_MS = 1400;
  const IDLE_FPS = 15;
  // Parallax shift (px) of each layer at the edge of the panel (desktop only): far, fan, line
  const DEPTH = { far: 3, mid: 7, near: 11 };

  let canvas = null;
  let ctx = null;
  let animId = null;
  let resizeObserver = null;
  let running = false;
  let startTime = 0;
  let lastFrame = 0;
  let frameCount = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let isMobile = false;
  let t0X = 0;
  let midY = 0;
  let spread = 0.3;
  let far = [];
  let ticks = [];
  let line = [];            // smooth price path, dense points
  let pointer = null;       // {x, y} in canvas px, or null when away
  let parallax = { x: 0, y: 0 };
  let bend = 0;             // current offset of the projection at the pointer, px
  let bendX = 0;            // x where the bend is anchored
  let onMove = null;
  let onLeave = null;
  let onVisibility = null;

  function reducedMotion() {
    try { return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }

  // Deterministic pseudo-random numbers, so the scene is the same on every visit
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const halfBand = (x) => (x - t0X) * spread + 4;

  // Smoothed random walk that ends at «hoy», resampled with Catmull-Rom so it has no corners
  function pricePath(rand) {
    const n = 48;
    const raw = [0];
    for (let i = 1; i < n; i++) raw.push(raw[i - 1] + (rand() - 0.5));
    const smooth = raw.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; c++; } }
      return s / c;
    });
    // Remove the overall drift so the line wanders around «hoy» instead of crashing into it
    const drift = smooth[n - 1] - smooth[0];
    const flat = smooth.map((v, i) => v - drift * (i / (n - 1)));
    const last = flat[n - 1];
    const span = Math.max(...flat.map((v) => Math.abs(v - last))) || 1;
    const amp = height * (isMobile ? 0.2 : 0.11);
    const x0 = width * 0.03;
    const pts = flat.map((v, i) => ({ x: x0 + (t0X - x0) * (i / (n - 1)), y: midY - ((v - last) / span) * amp }));
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 6; k++) {
        const t = k / 6, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function build() {
    const rand = mulberry32(7);
    isMobile = width < 680 || height < 260;
    t0X = Math.round(width * (isMobile ? 0.34 : 0.40));
    midY = Math.round(height * 0.5);
    spread = isMobile ? 0.46 : 0.40;

    far = [];
    const farStep = isMobile ? 20 : 18;
    for (let y = farStep / 2; y < height; y += farStep) {
      for (let x = farStep / 2; x < width; x += farStep) {
        far.push({ x, y, alpha: 0.06 + rand() * 0.06, angle: -0.5 + rand() * 0.3, scatter: 30 + rand() * 30, dir: rand() * Math.PI * 2 });
      }
    }

    ticks = [];
    const tickStep = isMobile ? 12 : 11;
    for (let x = t0X + tickStep; x < width; x += tickStep) {
      const half = halfBand(x);
      for (let y = midY - half; y <= midY + half; y += tickStep) {
        ticks.push({ x, y: Math.round(y), scatter: 18 + rand() * 18, dir: rand() * Math.PI * 2 });
      }
    }

    line = pricePath(rand);
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    // Redraw after a resize: the loop only paints while something moves
    if (running) draw(performance.now(), false); else if (reducedMotion()) draw(performance.now(), true);
  }

  // Central projection: straight at rest; with a pointer over the fan it bends to pass near it
  function projectionY(x) {
    if (!bend || x <= t0X) return midY;
    const ax = Math.max(bendX, t0X + 1);
    const f = x <= ax ? (x - t0X) / (ax - t0X) : 1;
    const curve = f * f * (3 - 2 * f);  // smoothstep: leaves «hoy» flat, reaches the bend softly
    const y = midY + bend * curve * Math.min(1, halfBand(x) / halfBand(ax));
    const half = halfBand(x) - 2;
    return Math.max(midY - half, Math.min(midY + half, y));
  }

  // Ticks grouped in a few opacity levels, so each frame needs few stroke() calls
  function drawTicks(list, place, sx, sy) {
    const levels = [[], [], [], [], [], []];
    for (const s of list) {
      const p = place(s);
      if (!p || p.alpha <= 0.01) continue;
      levels[Math.min(5, Math.floor(p.alpha * 6))].push(p);
    }
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].length) continue;
      ctx.globalAlpha = (i + 0.5) / 6;
      ctx.lineWidth = i >= 4 ? 1.5 : 1;
      ctx.beginPath();
      for (const p of levels[i]) {
        const c = Math.cos(p.angle) * p.len / 2, s = Math.sin(p.angle) * p.len / 2;
        ctx.moveTo(p.x + sx - c, p.y + sy - s);
        ctx.lineTo(p.x + sx + c, p.y + sy + s);
      }
      ctx.stroke();
    }
  }

  function draw(now, still) {
    if (!ctx) return;
    const t = still ? INTRO_MS : now - startTime;
    const intro = clamp01(t / INTRO_MS);
    ctx.clearRect(0, 0, width, height);
    const px = (d) => (isMobile ? 0 : -parallax.x * d);
    const py = (d) => (isMobile ? 0 : -parallax.y * d);
    // Converge from a scattered state, in a wave that crosses the panel from left to right
    const settle = (x) => easeOut(clamp01((intro - (x / width) * 0.45) / 0.55));

    drawTicks(far, (s) => {
      const k = settle(s.x);
      const off = (1 - k) * s.scatter;
      return { x: s.x + Math.cos(s.dir) * off, y: s.y + Math.sin(s.dir) * off, angle: s.angle, len: 6, alpha: s.alpha * k };
    }, px(DEPTH.far), py(DEPTH.far));

    const k0 = easeOut(clamp01((intro - 0.3) / 0.5));
    ctx.save();
    ctx.globalAlpha = 0.26 * k0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(t0X + px(DEPTH.mid), 0);
    ctx.lineTo(t0X + px(DEPTH.mid), height);
    ctx.stroke();
    ctx.restore();

    // A soft pulse leaves «hoy» every few seconds
    const since = (now - startTime - INTRO_MS) % PULSE_PERIOD;
    const pulseX = !still && t > INTRO_MS && since < PULSE_MS ? t0X + (width - t0X) * (since / PULSE_MS) : -1;

    drawTicks(ticks, (s) => {
      const k = settle(s.x);
      const off = (1 - k) * s.scatter;
      const near = Math.abs(s.y - projectionY(s.x)) / Math.max(6, halfBand(s.x));  // 0 on the projection
      let alpha = 0.16 + 0.5 * Math.pow(1 - Math.min(1, near), 2);
      if (pulseX > 0) alpha += 0.22 * Math.max(0, 1 - Math.abs(s.x - pulseX) / 60);
      return { x: s.x + Math.cos(s.dir) * off, y: s.y + Math.sin(s.dir) * off, angle: Math.PI / 2 + (1 - k) * 1.2, len: near < 0.25 ? 9 : 7, alpha: Math.min(1, alpha * k) };
    }, px(DEPTH.mid), py(DEPTH.mid));

    // Price line, one continuous smooth stroke written on from left to right
    const head = clamp01((intro - 0.1) / 0.6);
    const nx = px(DEPTH.near), ny = py(DEPTH.near);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const upto = Math.max(1, Math.floor(line.length * head));
    ctx.beginPath();
    ctx.moveTo(line[0].x + nx, line[0].y + ny);
    for (let i = 1; i < upto; i++) ctx.lineTo(line[i].x + nx, line[i].y + ny);
    ctx.stroke();

    // Central projection, dashed, written on after the price line
    const head2 = clamp01((intro - 0.6) / 0.4);
    if (head2 > 0) {
      const xEnd = t0X + (width - t0X) * head2;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(t0X + nx, midY + ny);
      for (let x = t0X + 4; x <= xEnd; x += 4) ctx.lineTo(x + nx, projectionY(x) + ny);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (head >= 1) {
      ctx.globalAlpha = k0;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(t0X + nx, midY + ny, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Eases parallax and bend towards their targets; returns true while still moving
  function step() {
    let moving = false;
    const tx = pointer && !isMobile ? (pointer.x / width - 0.5) * 2 : 0;
    const ty = pointer && !isMobile ? (pointer.y / height - 0.5) * 2 : 0;
    parallax.x += (tx - parallax.x) * 0.05;
    parallax.y += (ty - parallax.y) * 0.05;
    if (Math.abs(tx - parallax.x) + Math.abs(ty - parallax.y) > 0.002) moving = true;

    // The projection follows the pointer anywhere on the page, aimed at its height, inside the band
    let target = 0;
    if (pointer) {
      bendX = Math.max(t0X + (width - t0X) * 0.35, Math.min(width, pointer.x));
      const half = halfBand(bendX);
      target = Math.max(-half, Math.min(half, pointer.y - midY));
    }
    bend += (target - bend) * 0.045;
    if (Math.abs(target - bend) > 0.3) moving = true; else if (!target) bend = 0;
    return moving;
  }

  function loop(now) {
    if (!running) return;
    if (document.hidden) { animId = null; return; }
    const inIntro = now - startTime < INTRO_MS;
    const moving = step();
    const pulsing = (now - startTime - INTRO_MS) % PULSE_PERIOD < PULSE_MS + 100;
    if (inIntro || moving) {
      lastFrame = now; frameCount++; draw(now, false);
    } else if (pulsing && now - lastFrame >= 1000 / IDLE_FPS) {
      lastFrame = now; frameCount++; draw(now, false);
    }
    animId = requestAnimationFrame(loop);
  }

  function handleMove(e) {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    // Tracked over the whole page, not only the panel: the form side steers the projection too
    pointer = { x: e.clientX - r.left, y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  }

  function handleVisibility() {
    if (running && !document.hidden && !animId) animId = requestAnimationFrame(loop);
  }

  const PDLoginField = {
    start(el) {
      if (!el) return;
      this.stop();
      canvas = el;
      canvas.setAttribute('aria-hidden', 'true');
      startTime = performance.now();
      lastFrame = startTime;
      frameCount = 0;
      pointer = null;
      parallax = { x: 0, y: 0 };
      bend = 0;
      resize();

      if (reducedMotion()) return;  // resize() already drew the final, still frame
      running = true;

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', resize);
      }
      if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
        onMove = handleMove;
        onLeave = () => { pointer = null; };
        window.addEventListener('mousemove', onMove, { passive: true });
        document.addEventListener('mouseleave', onLeave);
      }
      onVisibility = handleVisibility;
      document.addEventListener('visibilitychange', onVisibility);
      animId = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      window.removeEventListener('resize', resize);
      if (onMove) { window.removeEventListener('mousemove', onMove); onMove = null; }
      if (onLeave) { document.removeEventListener('mouseleave', onLeave); onLeave = null; }
      if (onVisibility) { document.removeEventListener('visibilitychange', onVisibility); onVisibility = null; }
      canvas = null;
      ctx = null;
      far = []; ticks = []; line = [];
    },

    getAnimId() { return animId; },
    getFrameCount() { return frameCount; }
  };

  window.PDLoginField = PDLoginField;
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
