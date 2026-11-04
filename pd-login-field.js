/**
 * PerData — Campo de Tinta (login)
 * Canvas 2D scene in three depth layers: a faint ink background, the P10–P90 fan and the price
 * line, which converge on load and keep a slow flow at rest. Exported as
 * window.PDLoginField.start(canvas) / stop().
 */
(function(window, document) {
  'use strict';

  const INK = '#EDE8DC';
  const INTRO_MS = 1800;
  const REST_FPS = 30;
  const REST_INTERVAL = 1000 / REST_FPS;
  const ALPHA_BUCKETS = 12;
  // Parallax shift (px) of each layer at the edge of the panel: far, fan, line
  const DEPTH = { far: 4, mid: 9, near: 15 };

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
  let t0X = 0;
  let midY = 0;
  let layers = { far: [], mid: [], near: [] };
  let pointer = { x: 0, y: 0 };   // -1..1 relative to the panel centre
  let parallax = { x: 0, y: 0 };  // eased towards pointer
  let onMove = null;
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

  // Smoothed random walk that ends exactly at «hoy» (t0X, midY)
  function pricePath(rand, isMobile) {
    const n = 90;
    const raw = [0];
    for (let i = 1; i < n; i++) raw.push(raw[i - 1] + (rand() - 0.5));
    const smooth = raw.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -4; k <= 4; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; c++; } }
      return s / c;
    });
    // Remove the overall drift so the line wanders around «hoy» instead of crashing into it
    const drift = smooth[n - 1] - smooth[0];
    const flat = smooth.map((v, i) => v - drift * (i / (n - 1)));
    const last = flat[n - 1];
    const span = Math.max(...flat.map((v) => Math.abs(v - last))) || 1;
    const amp = height * (isMobile ? 0.2 : 0.11);
    const x0 = width * 0.03;
    return flat.map((v, i) => ({ x: x0 + (t0X - x0) * (i / (n - 1)), y: midY - ((v - last) / span) * amp }));
  }

  // Strokes placed every `step` px along a polyline, aligned to its tangent
  function strokesAlong(points, step, opts) {
    const out = [];
    let carry = 0;
    let arc = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let d = step - carry;
      while (d <= seg) {
        const f = d / seg;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: ang, arc: arc + d, ...opts });
        d += step;
      }
      carry = seg - (d - step);
      arc += seg;
    }
    return out;
  }

  function build() {
    const rand = mulberry32(7);
    const isMobile = width < 680 || height < 260;
    t0X = Math.round(width * (isMobile ? 0.34 : 0.40));
    midY = Math.round(height * 0.5);
    const spread = isMobile ? 0.36 : 0.30;  // half-width of the fan per px to the right of «hoy»

    const far = [];
    const farStep = isMobile ? 16 : 18;
    for (let y = farStep / 2; y < height; y += farStep) {
      for (let x = farStep / 2; x < width; x += farStep) {
        far.push({
          x, y, len: isMobile ? 5 : 6, width: 0.8,
          alpha: 0.07 + rand() * 0.07,
          angle: -0.5 + rand() * 0.3,
          phase: rand() * Math.PI * 2,
          scatter: 30 + rand() * 30,
          scatterAngle: rand() * Math.PI * 2,
          spin: (rand() - 0.5) * 4
        });
      }
    }

    const mid = [];
    const midStep = isMobile ? 11 : 12;
    for (let y = midStep / 2; y < height; y += midStep) {
      for (let x = t0X + midStep; x < width; x += midStep) {
        const dx = x - t0X;
        const half = dx * spread + 4;
        const rel = (y - midY) / half;
        if (Math.abs(rel) > 1) continue;
        mid.push({
          x, y, len: isMobile ? 7 : 8, width: 1.1 - Math.abs(rel) * 0.3,
          alpha: 0.28 + (1 - Math.abs(rel)) * 0.42,
          angle: Math.atan2(rel * spread, 1),
          dx, phase: rand() * Math.PI * 2,
          scatter: 22 + rand() * 18,
          scatterAngle: rand() * Math.PI * 2,
          spin: (rand() - 0.5) * 3
        });
      }
    }

    const path = pricePath(rand, isMobile);
    const line = strokesAlong(path, 7, { len: 5.5, width: 1.7, alpha: 0.95 });
    const p50 = strokesAlong([{ x: t0X, y: midY }, { x: width, y: midY }], 9, { len: 6, width: 1.6, alpha: 0.9 });
    const total = (line.length ? line[line.length - 1].arc : 1) + (p50.length ? p50[p50.length - 1].arc : 0);
    const near = line.concat(p50.map((s) => ({ ...s, arc: s.arc + (line.length ? line[line.length - 1].arc : 0) })));
    near.forEach((s) => { s.write = s.arc / total; s.phase = rand() * Math.PI * 2; });

    layers = { far, mid, near };
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
  }

  // Draws a layer grouping strokes by opacity, so each frame needs only a few stroke() calls
  function drawLayer(list, place, shift) {
    const buckets = [];
    for (let i = 0; i < list.length; i++) {
      const p = place(list[i]);
      if (!p || p.alpha <= 0.004) continue;
      const k = Math.min(ALPHA_BUCKETS - 1, Math.floor(p.alpha * ALPHA_BUCKETS));
      const w = p.width > 1.3 ? 1 : 0;
      const key = k * 2 + w;
      (buckets[key] || (buckets[key] = [])).push(p);
    }
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    for (let key = 0; key < buckets.length; key++) {
      const b = buckets[key];
      if (!b) continue;
      ctx.globalAlpha = ((key >> 1) + 0.5) / ALPHA_BUCKETS;
      ctx.lineWidth = key & 1 ? 1.7 : 1;
      ctx.beginPath();
      for (const p of b) {
        const c = Math.cos(p.angle) * p.len / 2, s = Math.sin(p.angle) * p.len / 2;
        ctx.moveTo(p.x + shift.x - c, p.y + shift.y - s);
        ctx.lineTo(p.x + shift.x + c, p.y + shift.y + s);
      }
      ctx.stroke();
    }
  }

  function draw(now, still) {
    if (!ctx) return;
    const t = still ? INTRO_MS : now - startTime;
    const intro = clamp01(t / INTRO_MS);
    const sec = now * 0.001;
    ctx.clearRect(0, 0, width, height);

    if (!still) {
      parallax.x += (pointer.x - parallax.x) * 0.08;
      parallax.y += (pointer.y - parallax.y) * 0.08;
    }
    const shift = (d) => ({ x: -parallax.x * d, y: -parallax.y * d });

    // Converge from a scattered state, in a wave that crosses the panel from left to right
    const settle = (s) => easeOut(clamp01((intro - (s.x / width) * 0.45) / 0.55));

    drawLayer(layers.far, (s) => {
      const k = settle(s);
      const off = (1 - k) * s.scatter;
      const breathe = still ? 0 : Math.sin(sec * 0.35 + s.phase + s.x * 0.004) * 0.12;
      return {
        x: s.x + Math.cos(s.scatterAngle) * off, y: s.y + Math.sin(s.scatterAngle) * off,
        angle: s.angle + (1 - k) * s.spin + breathe, len: s.len, width: s.width, alpha: s.alpha * k
      };
    }, shift(DEPTH.far));

    // «hoy» marker
    const k0 = easeOut(clamp01((intro - 0.3) / 0.5));
    ctx.save();
    ctx.globalAlpha = 0.28 * k0;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(t0X - parallax.x * DEPTH.mid, 0);
    ctx.lineTo(t0X - parallax.x * DEPTH.mid, height);
    ctx.stroke();
    ctx.restore();

    drawLayer(layers.mid, (s) => {
      const k = settle(s);
      const off = (1 - k) * s.scatter;
      // A soft pulse that flows out of «hoy» along the fan
      const flow = still ? 0 : 0.18 * Math.max(0, Math.sin(s.dx * 0.022 - sec * 1.4));
      return {
        x: s.x + Math.cos(s.scatterAngle) * off, y: s.y + Math.sin(s.scatterAngle) * off,
        angle: s.angle + (1 - k) * s.spin, len: s.len, width: s.width, alpha: Math.min(1, (s.alpha + flow) * k)
      };
    }, shift(DEPTH.mid));

    // Price line and P50 are written on, stroke by stroke
    const writeHead = clamp01((intro - 0.1) / 0.75);
    drawLayer(layers.near, (s) => {
      const k = clamp01((writeHead - s.write) / 0.06);
      if (k <= 0) return null;
      const lift = (1 - easeOut(k)) * 10;
      return { x: s.x, y: s.y - lift, angle: s.angle, len: s.len, width: s.width, alpha: s.alpha * easeOut(k) };
    }, shift(DEPTH.near));

    // «hoy» point with one slow pulse
    if (writeHead > 0.5) {
      const hx = t0X - parallax.x * DEPTH.near, hy = midY - parallax.y * DEPTH.near;
      const pulse = still ? 0 : (Math.sin(sec * 1.6) + 1) / 2;
      ctx.globalAlpha = 0.18 * pulse * k0;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(hx, hy, 6 + pulse * 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = k0;
      ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    if (document.hidden) { animId = null; return; }
    const introDone = now - startTime >= INTRO_MS;
    if (!introDone || now - lastFrame >= REST_INTERVAL) {
      lastFrame = now;
      frameCount++;
      draw(now, false);
    }
    animId = requestAnimationFrame(loop);
  }

  function handleMove(e) {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    pointer.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
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
      running = true;
      startTime = performance.now();
      lastFrame = startTime;
      frameCount = 0;
      pointer = { x: 0, y: 0 };
      parallax = { x: 0, y: 0 };
      resize();

      if (reducedMotion()) {
        draw(startTime, true);
        return;
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', resize);
      }
      onMove = handleMove;
      window.addEventListener('mousemove', onMove, { passive: true });
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
      if (onVisibility) { document.removeEventListener('visibilitychange', onVisibility); onVisibility = null; }
      canvas = null;
      ctx = null;
      layers = { far: [], mid: [], near: [] };
    },

    getAnimId() { return animId; },
    getFrameCount() { return frameCount; }
  };

  window.PDLoginField = PDLoginField;
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
