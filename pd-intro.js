/**
 * PerData — intro de la portada
 * The last 60 (36 on phones) daily USD/PEN closes as candles (hollow = the dollar rose that day, filled = it fell,
 * body from the previous close to the close, no wicks: we only have closes). They lie flat and stand
 * up one after another in an accelerating wave while a camera follows it, starting close and pulling
 * back until the whole series fits. Then the last candle becomes a dot and the candles, the price line and
 * the grid fade out; the wordmark appears alone, centred on the screen, holds still and lands exactly on the
 * header logo. Without real data there is no intro. The <head> script only sets data-intro="play" when
 * motion and data saving allow it.
 */
(function(window, document) {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.intro !== 'play') return;

  // Phones get fewer, taller candles so the final series stays legible at 390 px
  const NARROW = window.innerWidth < 680;
  const N = NARROW ? 36 : 60;
  const YR = NARROW ? 16 : 14;  // world height of the price range (candle x step = 1): tall enough to read the peaks
  const T_FIRST = 100;         // ms until the first candle starts to stand up
  const T_WAVE = 2000;         // ms for the wave front to reach the last candle (an unhurried travelling shot)
  const T_TIP = 190;           // ms a candle takes to stand up
  const T_PAUSE = 140;         // ms held on «hoy»
  const T_DOT = 200;           // ms for the last candle to shrink into the dot
  const T_FADE = 300;          // ms for the candles, the line, the grid and the dot to fade out
  const T_NAME = 320;          // ms for the wordmark to fade in and rise into place
  const T_HOLD_NAME = 750;     // ms the wordmark stays still and fully visible before it docks
  const T_DOCK = 700;          // ms for the wordmark to land on the header logo
  const SKIP = ['click', 'keydown', 'wheel', 'touchstart'];

  let overlay, canvas, ctx, W, H, dpr;
  let candles = [], lo = 0, hi = 1;
  let start = 0, prevT = 0, raf = 0, ended = false;
  let cam = { x: 0, y: 0, s: 1 }, vel = { x: 0, y: 0, s: 0 };
  let fase = 'velas';         // velas → marca
  let marcaT = null;          // ms when the marca phase started (null while the candles are up)

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dark = () => root.classList.contains('dark');
  const ink = () => (dark() ? '#EDE8DC' : '#1B1916');
  const fmt = (v) => v.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // Colours as [r, g, b]: ink() gives #RRGGBB, getComputedStyle gives 'rgb(r, g, b)' or 'rgba(r, g, b, a)'
  function rgbOf(c) {
    const hex = /^#([0-9a-f]{6})$/i.exec(c || '');
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    const n = String(c || '').match(/[\d.]+/g);
    return n && n.length >= 3 ? n.slice(0, 3).map(Number) : null;
  }

  // Dates come as 'AAAA-MM-DD'; the site writes them without the trailing dot
  function fechaDe(iso) {
    const p = String(iso || '').split('-').map(Number);
    return p.length === 3 && p[0] && p[1] && p[2] ? new Date(p[0], p[1] - 1, p[2]) : null;
  }
  const fechaCorta = (iso) => {
    const d = fechaDe(iso);
    return d ? d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace('.', '') : '';
  };

  function finish(natural) {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    SKIP.forEach((e) => window.removeEventListener(e, onSkip));
    try { sessionStorage.setItem('pd_intro_seen', '1'); } catch (_) {}
    root.dataset.intro = natural ? 'in' : 'done';
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    delete root.dataset.introFase;
    if (natural) setTimeout(() => { root.dataset.intro = 'done'; }, 700);
  }
  const onSkip = () => finish(false);

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // World: candle i sits at x = i; prices map to y in [0, YR] (up is positive)
  const wy = (v) => ((v - lo) / (hi - lo || 1)) * YR;
  // Final framing: the series from 5 % of the width to «hoy», leaving free space to the right of it
  const lastFrac = () => (NARROW ? 0.78 : 0.52);
  const fitScale = () => Math.min((W * (lastFrac() - 0.05)) / (N - 1), (H * 0.42) / YR);
  const fitX = () => (N - 1) - (W * (lastFrac() - 0.5)) / fitScale();
  const closeScale = () => W / (NARROW ? 7 : 9);
  const toScreen = (x, y) => ({ x: W / 2 + (x - cam.x) * cam.s, y: H * 0.5 - (y - cam.y) * cam.s });

  // Moment the wave front reaches candle i: gaps shrink as it goes, so the wave accelerates
  const tStart = (i) => T_FIRST + T_WAVE * Math.pow(i / (N - 1), 0.62);
  const T_LAST = tStart(N - 1) + T_TIP;
  const T_HOLD = T_LAST + T_PAUSE;

  // The front, as a continuous position, drives the camera
  function frontAt(t) {
    if (t <= T_FIRST) return 0;
    const p = clamp01((t - T_FIRST) / T_WAVE);
    return Math.pow(p, 1 / 0.62) * (N - 1);
  }

  // Draws with setTransform instead of save/restore; the caller sets colours and resets the transform
  function drawCandle(c, i, t, alpha) {
    const p = clamp01((t - tStart(i)) / T_TIP);
    const k = 1 - Math.pow(1 - p, 4);
    if (k <= 0) return;
    const bw = 0.5;
    const base = toScreen(i - bw / 2, wy(Math.min(c.prev, c.close)));
    const w = bw * cam.s, hh = Math.max(0.14 * YR / 6, Math.abs(wy(c.close) - wy(c.prev))) * cam.s;
    if (base.x > W + hh || base.x + w + hh < 0) return;  // off screen (the camera starts very close)
    // Lying flat (rotated -90° about its bottom-left corner) → standing
    const ang = (1 - k) * (Math.PI / 2), cs = Math.cos(ang) * dpr, sn = Math.sin(ang) * dpr;
    ctx.setTransform(cs, sn, -sn, cs, base.x * dpr, base.y * dpr);
    // Depth: candles left behind dim to half ink while the camera travels; all return to full ink on the pull-back
    const lejos = clamp01((frontAt(t) - i - 4) / 10);            // 0 near the front, 1 ten candles behind
    const viaje = 1 - clamp01((t - T_FIRST) / T_WAVE);             // 1 at the start of the travel, 0 on arrival
    const atenua = 1 - 0.5 * lejos * Math.min(1, viaje * 2.5);
    ctx.globalAlpha = alpha * (0.25 + 0.75 * k) * atenua;
    if (c.up) ctx.strokeRect(0, -hh, w, hh);
    else ctx.fillRect(0, -hh, w, hh);
  }

  // The marca phase starts when the wave holds on «hoy»: the last candle becomes a dot, the rest fades,
  // and the wordmark appears alone at the centre of the screen
  function beginMarca(t) {
    fase = 'marca';
    marcaT = t;
    root.dataset.introFase = 'marca';
  }

  function headerTextBox() {
    const el = document.querySelector('header [data-header-logo]');
    if (!el || !el.firstChild) return null;
    const range = document.createRange();
    range.selectNodeContents(el.firstChild);  // the «PerData» text node, without the flag
    const r = range.getBoundingClientRect();
    return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, color: getComputedStyle(el).color } : null;
  }

  function frame(now) {
    if (ended) return;
    const t = now - start;
    const color = ink();
    ctx.clearRect(0, 0, W, H);

    if (fase === 'velas' && t >= T_HOLD) beginMarca(t);

    // Everything after the candles depends on when the marca phase started
    const fadeOut = marcaT == null ? 1 : 1 - clamp01((t - marcaT) / T_FADE);
    const nameIn = marcaT == null ? 0 : easeOut(clamp01((t - marcaT) / T_NAME));
    const dockStart = marcaT == null ? Infinity : marcaT + T_NAME + T_HOLD_NAME;
    const endT = marcaT == null ? Infinity : dockStart + T_DOCK;

    // Camera: follows the front with inertia and pulls back (logarithmic zoom) as the wave advances
    const f = frontAt(t);
    const zoom = easeInOut(clamp01(f / (N - 1)));
    const targetS = Math.exp(lerp(Math.log(closeScale()), Math.log(fitScale()), zoom));
    const targetX = lerp(f - 0.6, fitX(), zoom);
    const near = candles[Math.min(N - 1, Math.round(f))];
    const targetY = lerp(near ? wy((near.close + near.prev) / 2) : YR / 2, YR / 2, zoom);
    // Time-based easing, so a slow phone that drops frames keeps the same camera path
    // Critically damped spring with velocity: no jolts when a frame is dropped, no overshoot
    const dt = Math.min(Math.max(t - prevT, 1000 / 120), 1000 / 20) / 1000;
    prevT = t;
    const w0 = 7, k1 = w0 * w0, k2 = 2 * w0;
    for (const [key, target] of [['x', targetX], ['y', targetY], ['s', targetS]]) {
      vel[key] += (k1 * (target - cam[key]) - k2 * vel[key]) * dt;
      cam[key] += vel[key] * dt;
    }

    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, cam.s * 0.05);
    // Price grid of a real chart: round levels that move and scale with the camera
    if (fadeOut > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const span = hi - lo || 0.01;
      const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1].find((v) => span / v <= 5) || 0.1;
      ctx.font = `500 ${NARROW ? 10 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.lineWidth = 1;
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        const y = Math.round(toScreen(0, wy(v)).y) + 0.5;
        if (y < 0 || y > H) continue;
        ctx.globalAlpha = 0.09 * fadeOut;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.globalAlpha = 0.42 * fadeOut;
        ctx.fillText(`S/ ${v.toFixed(step < 0.01 ? 3 : 2)}`, W - (NARROW ? 62 : 84), y - 5);
      }
    }
    // A thin line through the closes, drawn behind the wave, so the series reads as an asset's peaks
    if (fadeOut > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 0.45 * fadeOut;
      ctx.lineWidth = Math.max(1, cam.s * 0.03);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let prevQ = null;
      for (let i = 0; i < N && t >= tStart(i) + T_TIP * 0.5; i++) {
        const q = toScreen(i, wy(candles[i].close));
        if (!prevQ) ctx.moveTo(q.x, q.y);
        else ctx.quadraticCurveTo(prevQ.x, prevQ.y, (prevQ.x + q.x) / 2, (prevQ.y + q.y) / 2);
        prevQ = q;
      }
      if (prevQ) ctx.lineTo(prevQ.x, prevQ.y);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.2, cam.s * 0.05);
      for (let i = 0; i < N - 1; i++) drawCandle(candles[i], i, t, fadeOut);
    }

    // «hoy»: the last candle stands, then shrinks into the dot, which fades with the rest
    const last = candles[N - 1];
    const dotK = marcaT == null ? 0 : easeInOut(clamp01((t - marcaT) / T_DOT));
    const dotCenter = toScreen(N - 1, wy(last.close));
    if (dotK <= 0) drawCandle(last, N - 1, t, fadeOut);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (dotK > 0 && fadeOut > 0) {
      ctx.save();
      ctx.globalAlpha = fadeOut;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(dotCenter.x, dotCenter.y, lerp(cam.s * 0.25, 4, dotK), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // The wordmark: centred on the screen, still once it has risen, then the dock onto the header logo
    const dockK = easeInOut(clamp01((t - dockStart) / T_DOCK));
    const fontPx = Math.max(34, Math.min(W * (NARROW ? 0.13 : 0.075), 96));
    ctx.font = `italic 600 ${fontPx}px 'Source Serif 4', Georgia, serif`;
    const metrics = ctx.measureText('PerData');
    const textW = metrics.width;
    const ascent = metrics.fontBoundingBoxAscent || fontPx * 0.95;
    // Centred: the anchor is the left edge of the text, so half its width is taken off the middle
    let tx = (W - textW) / 2, ty = H * 0.52 + 10 * (1 - nameIn), scale = 1;
    let textColor = color;
    const box = dockK > 0 ? headerTextBox() : null;
    if (box) {
      // Same font as the header logo, so matching the width matches the whole box
      const endScale = box.w / textW;
      scale = Math.exp(lerp(0, Math.log(endScale), dockK));
      tx = lerp(tx, box.x, dockK);
      ty = lerp(ty, box.y + ascent * endScale, dockK);
      // The colour travels continuously from the ink to the header's colour
      const from = rgbOf(color), to = rgbOf(box.color);
      if (from && to) {
        const c = [0, 1, 2].map((i) => Math.round(lerp(from[i], to[i], dockK)));
        textColor = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      }
    }

    if (nameIn > 0) {
      ctx.save();
      ctx.globalAlpha = nameIn;
      ctx.fillStyle = textColor;
      ctx.font = `italic 600 ${fontPx}px 'Source Serif 4', Georgia, serif`;
      ctx.translate(tx, ty); ctx.scale(scale, scale);
      ctx.fillText('PerData', 0, 0);
      ctx.restore();
    }

    // Data line, bottom left, counting the closes the wave has already passed
    if (t < dockStart) {
      const i = Math.min(N - 1, Math.max(0, Math.round(frontAt(t))));
      const c = candles[i];
      if (c) {
        ctx.save();
        ctx.globalAlpha = clamp01(t / 400) * fadeOut;
        ctx.fillStyle = color;
        ctx.font = `500 ${W < 680 ? 11 : 12}px 'IBM Plex Mono', ui-monospace, monospace`;
        ctx.fillText(`USD/PEN · ${fechaCorta(c.date)} · S/ ${fmt(c.close)}`, W < 680 ? 16 : 40, H - (W < 680 ? 24 : 40));
        ctx.restore();
      }
    }

    if (t >= dockStart && root.dataset.intro === 'play') root.dataset.intro = 'dock';
    if (t >= endT) { finish(true); return; }
    raf = requestAnimationFrame(frame);
  }

  function begin(points) {
    if (ended) return;
    if (!points || points.length < N + 1) { finish(false); return; }  // no real data, no intro
    const s = points.slice(-(N + 1));
    candles = s.slice(1).map((p, i) => ({ close: p.close, prev: s[i].close, up: p.close >= s[i].close, date: p.date }));
    const all = s.map((p) => p.close);
    lo = Math.min(...all); hi = Math.max(...all);
    overlay = document.getElementById('pdIntro');
    canvas = document.getElementById('pdIntroCanvas');
    if (!overlay || !canvas) { finish(false); return; }
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    SKIP.forEach((e) => window.addEventListener(e, onSkip, { passive: true }));
    cam = { x: -0.6, y: wy((candles[0].close + candles[0].prev) / 2), s: closeScale() };
    const go = () => {
      start = performance.now();
      root.dataset.introFase = 'velas';
      raf = requestAnimationFrame(frame);
    };
    // The wordmark font is asked for in the background: the intro never waits for it
    if (document.fonts && document.fonts.load) document.fonts.load("italic 600 48px 'Source Serif 4'");
    go();
  }

  function dailyOf(h) {
    const d = h && Array.isArray(h.daily) ? h.daily : null;
    return d ? d.filter((p) => p && typeof p.close === 'number' && p.close > 0) : null;
  }

  const early = window.__pdEarly && window.__pdEarly.hist;
  const source = early && typeof early.then === 'function'
    ? early
    : fetch('/api/historical?symbol=PEN=X&range=1y&interval=1mo').then((r) => (r.ok ? r.json() : null));
  // If the data takes too long, the page shows without intro
  const timeout = setTimeout(() => finish(false), 1500);
  Promise.resolve(source).then((h) => { clearTimeout(timeout); begin(dailyOf(h)); }, () => finish(false));
})(window, document);
