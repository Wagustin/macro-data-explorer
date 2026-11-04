/**
 * PerData — intro de la portada
 * The last 60 (36 on phones) daily USD/PEN closes as candles (hollow = the dollar rose that day, filled = it fell,
 * body from the previous close to the close, no wicks: we only have closes). They lie flat and stand
 * up one after another in an accelerating wave while a camera follows it, starting very close and
 * pulling back until the whole series fits. The last candle («hoy») shrinks into a dot, the
 * wordmark appears beside it and lands exactly on the header logo. Without real data there is no
 * intro. The <head> script only sets data-intro="play" when motion and data saving allow it.
 */
(function(window, document) {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.intro !== 'play') return;

  // Phones get fewer, taller candles so the final series stays legible at 390 px
  const NARROW = window.innerWidth < 680;
  const N = NARROW ? 36 : 60;
  const YR = NARROW ? 16 : 6;  // world height of the price range (candle x step = 1)
  const T_FIRST = 260;        // ms until the first candle starts to stand up
  const T_WAVE = 1450;        // ms for the wave front to reach the last candle
  const T_TIP = 320;          // ms a candle takes to stand up
  const T_PAUSE = 180;        // ms held on «hoy»
  const T_DOT = 220;          // ms for the last candle to become the dot
  const T_WORD = 260;         // ms for the wordmark to appear
  const T_DOCK = 680;         // ms for the wordmark to land on the header logo
  const SKIP = ['click', 'keydown', 'wheel', 'touchstart'];

  let overlay, canvas, ctx, W, H, dpr;
  let candles = [], lo = 0, hi = 1, label = '';
  let start = 0, prevT = 0, raf = 0, ended = false;
  let cam = { x: 0, y: 0, s: 1 };

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dark = () => root.classList.contains('dark');
  const ink = () => (dark() ? '#EDE8DC' : '#1B1916');
  const fmt = (v) => v.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function finish(natural) {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    SKIP.forEach((e) => window.removeEventListener(e, onSkip));
    try { sessionStorage.setItem('pd_intro_seen', '1'); } catch (_) {}
    root.dataset.intro = natural ? 'in' : 'done';
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
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
  // Final framing: the series from 5 % of the width to «hoy», leaving room for the wordmark
  // (beside «hoy» on desktop; on phones it goes above it, so the series can use the width)
  const lastFrac = () => (NARROW ? 0.9 : 0.58);
  const fitScale = () => Math.min((W * (lastFrac() - 0.05)) / (N - 1), (H * 0.42) / YR);
  const fitX = () => (N - 1) - (W * (lastFrac() - 0.5)) / fitScale();
  const closeScale = () => W / (W < 680 ? 3.2 : 4.2);
  const toScreen = (x, y) => ({ x: W / 2 + (x - cam.x) * cam.s, y: H * 0.5 - (y - cam.y) * cam.s });

  // Moment the wave front reaches candle i: gaps shrink as it goes, so the wave accelerates
  const tStart = (i) => T_FIRST + T_WAVE * Math.pow(i / (N - 1), 0.62);
  const T_LAST = tStart(N - 1) + T_TIP;
  const T_HOLD = T_LAST + T_PAUSE;
  const T_DOT_END = T_HOLD + T_DOT;
  const T_DOCK_START = T_DOT_END + T_WORD;
  const T_END = T_DOCK_START + T_DOCK;

  // The front, as a continuous position, drives the camera
  function frontAt(t) {
    if (t <= T_FIRST) return 0;
    const p = clamp01((t - T_FIRST) / T_WAVE);
    return Math.pow(p, 1 / 0.62) * (N - 1);
  }

  // Draws with setTransform instead of save/restore; the caller sets colours and resets the transform
  function drawCandle(c, i, t, alpha) {
    const k = easeOut(clamp01((t - tStart(i)) / T_TIP));
    if (k <= 0) return;
    const bw = 0.5;
    const base = toScreen(i - bw / 2, wy(Math.min(c.prev, c.close)));
    const w = bw * cam.s, hh = Math.max(0.14 * YR / 6, Math.abs(wy(c.close) - wy(c.prev))) * cam.s;
    if (base.x > W + hh || base.x + w + hh < 0) return;  // off screen (the camera starts very close)
    // Lying flat (rotated -90° about its bottom-left corner) → standing
    const ang = (1 - k) * (Math.PI / 2), cs = Math.cos(ang) * dpr, sn = Math.sin(ang) * dpr;
    ctx.setTransform(cs, sn, -sn, cs, base.x * dpr, base.y * dpr);
    ctx.globalAlpha = alpha * (0.25 + 0.75 * k);
    if (c.up) ctx.strokeRect(0, -hh, w, hh);
    else ctx.fillRect(0, -hh, w, hh);
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

    // Camera: follows the front with inertia and pulls back (logarithmic zoom) as the wave advances
    const f = frontAt(t);
    const zoom = easeInOut(clamp01(f / (N - 1)));
    const targetS = Math.exp(lerp(Math.log(closeScale()), Math.log(fitScale()), zoom));
    const targetX = lerp(f - 0.6, fitX(), zoom);
    const near = candles[Math.min(N - 1, Math.round(f))];
    const targetY = lerp(near ? wy((near.close + near.prev) / 2) : YR / 2, YR / 2, zoom);
    // Time-based easing, so a slow phone that drops frames keeps the same camera path
    const a = 1 - Math.exp(-(Math.max(t - prevT, 1000 / 60) / 1000) * 7);
    prevT = t;
    cam.x += (targetX - cam.x) * a; cam.y += (targetY - cam.y) * a; cam.s += (targetS - cam.s) * a;

    // Candles fade while the wordmark appears, so only the wordmark travels to the header
    const fadeOut = 1 - clamp01((t - T_DOT_END) / T_WORD);
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, cam.s * 0.05);
    if (fadeOut > 0) for (let i = 0; i < N - 1; i++) drawCandle(candles[i], i, t, fadeOut);

    // «hoy»: the last candle stands, then shrinks into the dot
    const last = candles[N - 1];
    const dotK = easeInOut(clamp01((t - T_HOLD) / T_DOT));
    const dotCenter = toScreen(N - 1, wy(last.close));
    if (dotK <= 0) drawCandle(last, N - 1, t, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    // Wordmark next to the dot, then the dock onto the header logo
    const wordK = easeOut(clamp01((t - T_DOT_END) / T_WORD));
    const dockK = easeInOut(clamp01((t - T_DOCK_START) / T_DOCK));
    const fontPx = Math.max(34, Math.min(W * (NARROW ? 0.13 : 0.075), 96));
    ctx.font = `italic 600 ${fontPx}px 'Source Serif 4', Georgia, serif`;
    const metrics = ctx.measureText('PerData');
    const textW = metrics.width;
    const ascent = metrics.fontBoundingBoxAscent || fontPx * 0.95;
    let tx = dotCenter.x + fontPx * 0.45, ty = dotCenter.y + fontPx * 0.32, scale = 1;
    if (NARROW) {
      // Above «hoy», ending just past it, but never above the top tenth of the screen
      tx = Math.max(W * 0.05, Math.min(dotCenter.x + fontPx * 0.15, W * 0.95) - textW);
      ty = Math.max(dotCenter.y - fontPx * 0.55, H * 0.1 + ascent);
    }
    let textColor = color;
    const box = dockK > 0 ? headerTextBox() : null;
    if (box) {
      // Same font as the header logo, so matching the width matches the whole box
      const endScale = box.w / textW;
      scale = Math.exp(lerp(0, Math.log(endScale), dockK));
      tx = lerp(tx, box.x, dockK);
      ty = lerp(ty, box.y + ascent * endScale, dockK);
      if (dockK > 0.5) textColor = box.color;
    }

    if (dotK > 0 && dockK < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - dockK;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(dotCenter.x, dotCenter.y, lerp(cam.s * 0.25, 4, dotK), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (wordK > 0) {
      ctx.save();
      ctx.globalAlpha = wordK;
      ctx.fillStyle = textColor;
      ctx.translate(tx, ty); ctx.scale(scale, scale);
      ctx.fillText('PerData', 0, 0);
      ctx.restore();
    }

    // Data line, bottom left, until the dock
    if (label && t < T_DOCK_START) {
      ctx.save();
      ctx.globalAlpha = clamp01(t / 400) * fadeOut;
      ctx.fillStyle = color;
      ctx.font = `500 ${W < 680 ? 11 : 12}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.fillText(label, W < 680 ? 16 : 40, H - (W < 680 ? 24 : 40));
      ctx.restore();
    }

    if (t >= T_DOCK_START && root.dataset.intro === 'play') root.dataset.intro = 'dock';
    if (t >= T_END) { finish(true); return; }
    raf = requestAnimationFrame(frame);
  }

  function begin(points) {
    if (ended) return;
    if (!points || points.length < N + 1) { finish(false); return; }  // no real data, no intro
    const s = points.slice(-(N + 1));
    candles = s.slice(1).map((p, i) => ({ close: p.close, prev: s[i].close, up: p.close >= s[i].close }));
    const all = s.map((p) => p.close);
    lo = Math.min(...all); hi = Math.max(...all);
    label = `USD/PEN · ${N} días · S/ ${fmt(lo)} – S/ ${fmt(hi)}`;
    overlay = document.getElementById('pdIntro');
    canvas = document.getElementById('pdIntroCanvas');
    if (!overlay || !canvas) { finish(false); return; }
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    SKIP.forEach((e) => window.addEventListener(e, onSkip, { passive: true }));
    cam = { x: -0.6, y: wy((candles[0].close + candles[0].prev) / 2), s: closeScale() };
    const go = () => { start = performance.now(); raf = requestAnimationFrame(frame); };
    // Draw the wordmark with the real font: wait for it, but never more than 400 ms
    const fonts = document.fonts && document.fonts.load ? document.fonts.load("italic 600 48px 'Source Serif 4'") : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 400))]).then(go, go);
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
