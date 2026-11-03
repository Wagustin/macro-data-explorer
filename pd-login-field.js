/**
 * PerData — Campo de Tinta (Login Modal Ink Field)
 * Canvas 2D scene with short strokes aligning into a probabilistic forecast fan (P10–P90).
 * Exported as window.PDLoginField.start(canvas) / stop().
 */
(function(window, document) {
  'use strict';

  let activeCanvas = null;
  let animId = null;
  let resizeObserver = null;
  let isRunning = false;
  let startTime = 0;
  let lastFrameTime = 0;
  let mouseX = -1000;
  let mouseY = -1000;
  let boundMouseMove = null;
  let boundVisibility = null;

  const DURATION_MS = 1800;
  const MAX_STROKES = 2400;
  const REST_FPS = 12;
  const REST_INTERVAL = 1000 / REST_FPS;

  let strokes = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let t0X = 0;
  let midY = 0;

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function initStrokes() {
    if (!width || !height) return;
    strokes = [];
    const isMobile = (typeof window !== 'undefined' && window.innerWidth < 680) || height < 250;
    const spacing = isMobile ? 12 : 14;
    const baseLen = isMobile ? 8 : 9;
    const cols = Math.floor(width / spacing) + 1;
    const rows = Math.floor(height / spacing) + 1;
    const count = Math.min(cols * rows, MAX_STROKES);

    const p50Row = Math.round((height * 0.50 - spacing / 2) / spacing);
    midY = p50Row * spacing + (spacing / 2);

    const t0Col = Math.round((width * (isMobile ? 0.36 : 0.40) - spacing / 2) / spacing);
    t0X = t0Col * spacing + (spacing / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (strokes.length >= count) break;
        const x = c * spacing + (spacing / 2);
        const y = r * spacing + (spacing / 2);
        const initialAngle = Math.random() * Math.PI * 2;

        let targetAngle = 0;
        let targetOpacity = 0.08;
        let targetThickness = 0.8;
        let isMainLine = false;

        if (x <= t0X) {
          // Historical price line to the left of «hoy» (T0)
          const dx = t0X - x;
          const waveY = midY - Math.sin(dx * 0.045) * (height * 0.16) + Math.sin(dx * 0.09) * (height * 0.06);
          const slope = 0.045 * Math.cos(dx * 0.045) * (height * 0.16) - 0.09 * Math.cos(dx * 0.09) * (height * 0.06);
          const priceRow = Math.round((waveY - spacing / 2) / spacing);

          if (r === priceRow) {
            // Price line matches P50: thickness 1.8px and opacity 1.0
            targetAngle = Math.atan2(slope, 1);
            targetOpacity = 1.0;
            targetThickness = 1.8;
            isMainLine = true;
          } else {
            // Outside of price line
            targetAngle = (Math.random() - 0.5) * 0.25;
            targetOpacity = 0.06 + Math.random() * 0.06;
            targetThickness = 0.8;
          }
        } else {
          // Forecast Fan P10-P90 to the right of «hoy»
          const dx = x - t0X;
          const halfSpread = dx * (isMobile ? 0.30 : 0.38) + (spacing * 0.6);
          const topY = midY - halfSpread;
          const botY = midY + halfSpread;

          if (r === p50Row) {
            // P50 line: thickness 1.8px and opacity 1.0
            targetAngle = 0;
            targetOpacity = 1.0;
            targetThickness = 1.8;
            isMainLine = true;
          } else if (y >= topY && y <= botY) {
            // Inside P10-P90 band: opacity 0.45-0.8 aligned with fan direction
            const relY = halfSpread > 0 ? (y - midY) / halfSpread : 0;
            targetAngle = Math.atan2(y - midY, dx);
            targetOpacity = 0.45 + (1 - Math.abs(relY)) * 0.35;
            targetThickness = 1.1 + (1 - Math.abs(relY)) * 0.3;
          } else {
            // Outside of fan: opacity 0.06-0.12
            targetAngle = y < midY ? -0.55 : 0.55;
            targetOpacity = 0.06 + Math.random() * 0.06;
            targetThickness = 0.8;
          }
        }

        strokes.push({
          x, y,
          initialAngle,
          targetAngle,
          targetOpacity,
          targetThickness,
          baseLen,
          isMainLine,
          driftPhase: Math.random() * Math.PI * 2,
          driftSpeed: 0.25 + Math.random() * 0.5
        });
      }
    }
  }

  function resize() {
    if (!activeCanvas) return;
    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    activeCanvas.width = Math.round(width * dpr);
    activeCanvas.height = Math.round(height * dpr);
    const ctx = activeCanvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    initStrokes();
  }

  function drawFrame(now, isFinalOnly) {
    if (!activeCanvas) return;
    const ctx = activeCanvas.getContext('2d');
    if (!ctx) return;

    const elapsed = now - startTime;
    const progress = isFinalOnly ? 1 : Math.min(elapsed / DURATION_MS, 1);
    // Cubic ease-out
    const ease = 1 - Math.pow(1 - progress, 3);

    ctx.clearRect(0, 0, width, height);

    // Fine vertical dotted line at «hoy» (T0)
    if (t0X > 0) {
      ctx.save();
      ctx.strokeStyle = '#EDE8DC';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.globalAlpha = 0.32 * (isFinalOnly ? 1 : Math.max(0.15, ease));
      ctx.beginPath();
      ctx.moveTo(t0X, 0);
      ctx.lineTo(t0X, height);
      ctx.stroke();
      ctx.restore();
    }

    const isDesktop = width >= 640;
    const timeSec = now * 0.001;

    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      let angle = s.initialAngle + (s.targetAngle - s.initialAngle) * ease;
      let opacity = 0.05 + (s.targetOpacity - 0.05) * ease;
      let thickness = 0.8 + (s.targetThickness - 0.8) * ease;

      if (progress >= 1 && !isFinalOnly) {
        if (!s.isMainLine) {
          // Slow natural drift in resting mode for background and fan strokes
          angle += Math.sin(timeSec * s.driftSpeed + s.driftPhase) * 0.04;

          // Desktop mouse deflection
          if (isDesktop && mouseX >= 0 && mouseY >= 0) {
            const ddx = mouseX - s.x;
            const ddy = mouseY - s.y;
            const dist = Math.hypot(ddx, ddy);
            if (dist < 80) {
              const toMouse = Math.atan2(ddy, ddx);
              const weight = (1 - dist / 80) * 0.32;
              angle += (toMouse - angle) * weight;
            }
          }
        } else {
          // Subtle stable breathing for main price/P50 trajectory
          angle += Math.sin(timeSec * 0.4 + s.driftPhase) * 0.008;
        }
      }

      const len = s.baseLen * (0.6 + 0.4 * ease);
      const cos = Math.cos(angle) * (len / 2);
      const sin = Math.sin(angle) * (len / 2);

      ctx.strokeStyle = '#EDE8DC';
      ctx.globalAlpha = opacity;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.moveTo(s.x - cos, s.y - sin);
      ctx.lineTo(s.x + cos, s.y + sin);
      ctx.stroke();
    }
  }

  function loop(now) {
    if (!isRunning || !activeCanvas) return;

    if (document.hidden) {
      animId = requestAnimationFrame(loop);
      return;
    }

    const elapsed = now - startTime;
    const inRestingState = elapsed >= DURATION_MS;

    if (inRestingState) {
      // Throttle to <= 12 fps during resting state
      if (now - lastFrameTime >= REST_INTERVAL) {
        lastFrameTime = now;
        drawFrame(now, false);
      }
    } else {
      lastFrameTime = now;
      drawFrame(now, false);
    }

    animId = requestAnimationFrame(loop);
  }

  function handleMouseMove(e) {
    if (!activeCanvas) return;
    const rect = activeCanvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function handleVisibilityChange() {
    if (!isRunning || !activeCanvas) return;
    if (!document.hidden && !animId) {
      lastFrameTime = performance.now();
      animId = requestAnimationFrame(loop);
    }
  }

  const PDLoginField = {
    start(canvas) {
      if (!canvas) return;
      this.stop();

      activeCanvas = canvas;
      activeCanvas.setAttribute('aria-hidden', 'true');
      isRunning = true;
      startTime = performance.now();
      lastFrameTime = startTime;
      mouseX = -1000;
      mouseY = -1000;

      resize();

      if (prefersReducedMotion()) {
        // Draw single final frame without loop
        drawFrame(startTime + DURATION_MS, true);
        return;
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          resize();
          if (prefersReducedMotion()) {
            drawFrame(performance.now() + DURATION_MS, true);
          }
        });
        resizeObserver.observe(activeCanvas);
      } else {
        window.addEventListener('resize', resize);
      }

      boundMouseMove = handleMouseMove;
      window.addEventListener('mousemove', boundMouseMove, { passive: true });

      boundVisibility = handleVisibilityChange;
      document.addEventListener('visibilitychange', boundVisibility);

      animId = requestAnimationFrame(loop);
    },

    stop() {
      isRunning = false;
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener('resize', resize);
      if (boundMouseMove) {
        window.removeEventListener('mousemove', boundMouseMove);
        boundMouseMove = null;
      }
      if (boundVisibility) {
        document.removeEventListener('visibilitychange', boundVisibility);
        boundVisibility = null;
      }
      activeCanvas = null;
      strokes = [];
    }
  };

  window.PDLoginField = PDLoginField;
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
