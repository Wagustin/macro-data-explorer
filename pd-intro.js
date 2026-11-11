/**
 * PerData — intro de la portada
 * The last 60 (36 on phones) daily USD/PEN closes as candles (hollow = the dollar rose that day, filled = it fell,
 * body from the previous close to the close, no wicks: we only have closes). They lie flat and stand
 * up one after another in an accelerating wave while a camera follows it, starting close and pulling
 * back until the whole series fits. Then the fan of the next close's probable range opens to the right of
 * «hoy» as a soft curved band that fades out, the last candle shrinks into a dot, the wordmark appears
 * beside it and lands exactly on the header logo. Without real data there is no intro. The <head>
 * script only sets data-intro="play" when motion and data saving allow it.
 */
(function(window, document) {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.intro !== 'play') return;

  // Phones get fewer, taller candles so the final series stays legible at 390 px
  const NARROW = window.innerWidth < 680;
  const N = NARROW ? 36 : 60;
  const YR = NARROW ? 16 : 14;  // world height of the price range (candle x step = 1): tall enough to read the peaks
  const T_FIRST = 60;          // ms until the first candle starts to stand up
  const T_WAVE = 1350;         // ms for the wave front to reach the last candle (a quick sweep)
  const T_TIP = 150;           // ms a candle takes to stand up (each one snaps up fast)
  const T_PAUSE = 90;          // ms held on «hoy»
  const T_BAND = 380;          // ms the range fan takes to open
  const T_READ = 640;          // ms the range stays on screen, still, to be read
  const T_DOT = 160;           // ms for the last candle to become the dot
  const T_WORD = 200;          // ms for the wordmark to appear
  const T_DOCK = 520;          // ms for the wordmark to land on the header logo
  const bandW = () => (NARROW ? 110 : Math.round(Math.min(300, W * 0.22)));  // px the range fan opens to the right of «hoy»
  const SKIP = ['click', 'keydown', 'wheel', 'touchstart'];

  let overlay, canvas, ctx, W, H, dpr;
  let candles = [], lo = 0, hi = 1;
  let start = 0, prevT = 0, raf = 0, ended = false;
  let cam = { x: 0, y: 0, s: 1 }, vel = { x: 0, y: 0, s: 0 };
  let fase = 'velas';         // velas → rango → marca
  let marcaT = null;          // ms when the marca phase started (null while the candles are up)
  let rangoDatos = null;      // the next close's range, as soon as the API answers
  let rango = null;           // ... and once the fan opens (the decision is taken only once)

  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const dark = () => root.classList.contains('dark');
  const ink = () => (dark() ? '#EDE8DC' : '#1B1916');
  const fmt = (v) => v.toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

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
  // Final framing: the series from 5 % of the width to «hoy», leaving room for the range fan
  const lastFrac = () => (NARROW ? 0.78 : 0.52);
  const fitScale = () => Math.min((W * (lastFrac() - 0.05)) / (N - 1), (H * 0.42) / YR);
  const fitX = () => (N - 1) - (W * (lastFrac() - 0.5)) / fitScale();
  const closeScale = () => W / (NARROW ? 7 : 9);
  const toScreen = (x, y) => ({ x: W / 2 + (x - cam.x) * cam.s, y: H * 0.5 - (y - cam.y) * cam.s });

  // Moment the wave front reaches candle i: gaps shrink as it goes, so the wave accelerates
  const tStart = (i) => T_FIRST + T_WAVE * Math.pow(i / (N - 1), 0.62);
  const T_LAST = tStart(N - 1) + T_TIP;
  const T_HOLD = T_LAST + T_PAUSE;
  const T_RANGO_END = T_HOLD + T_BAND + T_READ;

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
    ctx.globalAlpha = alpha * (0.25 + 0.75 * k);
    if (c.up) ctx.strokeRect(0, -hh, w, hh);
    else ctx.fillRect(0, -hh, w, hh);
  }

  // The fan of the next close's probable range: a soft curved band, borderless, fading out to the right of «hoy»
  function drawFan(t, alpha) {
    if (!rango || alpha <= 0) return;
    const hoy = toScreen(N - 1, wy(candles[N - 1].close));
    const wMax = Math.max(40, Math.min(bandW(), W - 16 - hoy.x));
    const w = wMax * easeOut(clamp01((t - T_HOLD) / T_BAND));
    const p90 = toScreen(N - 1, wy(rango.p90));
    const p50 = toScreen(N - 1, wy(rango.p50));
    const p10 = toScreen(N - 1, wy(rango.p10));
    const tinta = (a) => (dark() ? `rgba(237,232,220,${a})` : `rgba(27,25,22,${a})`);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alpha;
    // Curved edges: they open fast at first and then flatten, like a square root
    const n = 24;
    const borde = (p, k) => {
      ctx.beginPath();
      ctx.moveTo(hoy.x, hoy.y);
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = hoy.x + w * u;
        ctx.lineTo(x, hoy.y + (p.y - hoy.y) * k * Math.sqrt(u));
      }
      for (let i = n; i >= 0; i--) {
        const u = i / n, x = hoy.x + w * u;
        ctx.lineTo(x, hoy.y + (p10.y - hoy.y) * k * Math.sqrt(u));
      }
      ctx.closePath();
    };
    if (w >= 1) {
      const g = ctx.createLinearGradient(hoy.x, 0, hoy.x + w, 0);
      g.addColorStop(0, tinta(0.20)); g.addColorStop(0.6, tinta(0.09)); g.addColorStop(1, tinta(0));
      ctx.fillStyle = g;
      borde(p90, 1); ctx.fill();      // full band
      borde(p90, 0.5); ctx.fill();    // inner band, more marked because it adds up
      // Central line: a single continuous 1 px line from «hoy» to the tip of the median
      const gm = ctx.createLinearGradient(hoy.x, 0, hoy.x + w, 0);
      gm.addColorStop(0, tinta(0.55)); gm.addColorStop(1, tinta(0));
      ctx.strokeStyle = gm;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hoy.x, hoy.y);
      ctx.lineTo(hoy.x + w, p50.y);
      ctx.stroke();
    }
    // «hoy»: the last close as a filled dot
    ctx.fillStyle = tinta(1);
    ctx.beginPath(); ctx.arc(hoy.x, hoy.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function beginRango() {
    fase = 'rango';
    rango = rangoDatos;
    root.dataset.introFase = 'rango';
  }

  // The wordmark phase: the last candle becomes the dot and the brand flies to the header
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

    // Phases: the range is decided once, when the wave holds on «hoy»
    if (fase === 'velas' && t >= T_HOLD) {
      if (rangoDatos) beginRango(); else beginMarca(t);
    } else if (fase === 'rango' && t >= T_RANGO_END) {
      beginMarca(t);
    }
    // Everything after the candles depends on when the marca phase started
    const dotEnd = marcaT == null ? Infinity : marcaT + T_DOT;
    const dockStart = marcaT == null ? Infinity : dotEnd + T_WORD;
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
    const w0 = 8.5, k1 = w0 * w0, k2 = 2 * w0;
    for (const [key, target] of [['x', targetX], ['y', targetY], ['s', targetS]]) {
      vel[key] += (k1 * (target - cam[key]) - k2 * vel[key]) * dt;
      cam[key] += vel[key] * dt;
    }

    // Candles fade while the wordmark appears, so only the wordmark travels to the header
    const fadeOut = marcaT == null ? 1 : 1 - clamp01((t - dotEnd) / T_WORD);
    ctx.fillStyle = ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, cam.s * 0.05);
    // The grid has done its job once the range takes over: it fades out while the fan opens
    const gridK = rango ? 1 - clamp01((t - T_HOLD) / 220) : 1;
    // Price grid of a real chart: round levels that move and scale with the camera
    if (fadeOut * gridK > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const span = hi - lo || 0.01;
      const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1].find((v) => span / v <= 5) || 0.1;
      ctx.font = `500 ${NARROW ? 10 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.lineWidth = 1;
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
        const y = Math.round(toScreen(0, wy(v)).y) + 0.5;
        if (y < 0 || y > H) continue;
        ctx.globalAlpha = 0.09 * fadeOut * gridK;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.globalAlpha = 0.42 * fadeOut * gridK;
        ctx.fillText(`S/ ${v.toFixed(step < 0.01 ? 3 : 2)}`, W - (NARROW ? 62 : 84), y - 5);
      }
    }
    // The range fan, behind the candles: «hoy» opens into the p90-p10 band
    if (rango) drawFan(t, fadeOut);
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

    // «hoy»: the last candle stands, then shrinks into the dot
    const last = candles[N - 1];
    const dotK = marcaT == null ? 0 : easeInOut(clamp01((t - marcaT) / T_DOT));
    const dotCenter = toScreen(N - 1, wy(last.close));
    if (dotK <= 0) drawCandle(last, N - 1, t, fadeOut);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    // Wordmark next to the dot, then the dock onto the header logo
    const wordK = easeOut(clamp01((t - dotEnd) / T_WORD));
    const dockK = easeInOut(clamp01((t - dockStart) / T_DOCK));
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

  // The next close's range: asked for right away, but the intro never waits for it
  const diario = window.__pdEarly && window.__pdEarly.diario && typeof window.__pdEarly.diario.then === 'function'
    ? window.__pdEarly.diario
    : fetch('/api/diario?symbol=PEN').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.resolve(diario).then((d) => {
    const m = d && d.vigente ? d.manana : null;
    if (!m || ![m.p10, m.p50, m.p90].every((v) => typeof v === 'number' && isFinite(v)) || !m.fecha_objetivo) return;
    rangoDatos = { p10: m.p10, p50: m.p50, p90: m.p90, fecha: m.fecha_objetivo };
  }, () => {});

  const early = window.__pdEarly && window.__pdEarly.hist;
  const source = early && typeof early.then === 'function'
    ? early
    : fetch('/api/historical?symbol=PEN=X&range=1y&interval=1mo').then((r) => (r.ok ? r.json() : null));
  // If the data takes too long, the page shows without intro
  const timeout = setTimeout(() => finish(false), 1500);
  Promise.resolve(source).then((h) => { clearTimeout(timeout); begin(dailyOf(h)); }, () => finish(false));
})(window, document);
