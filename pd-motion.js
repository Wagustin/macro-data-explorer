/**
 * PerData · movimiento y barra de estado.
 * - Revela al hacer scroll los elementos con [data-reveal] (escalonado
 *   dentro de [data-reveal-group]).
 * - Reloj de Lima y estado de la sesión BVL (lun–vie, 09:00–16:00).
 * - window.pdFlap(el, texto): cambia un valor carácter a carácter,
 *   como un panel de salidas de aeropuerto.
 */
(function (window, document) {
  var root = document.documentElement;
  root.classList.add("pd-js");

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal() {
    var groups = document.querySelectorAll("[data-reveal-group]");
    groups.forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (el, i) {
        el.setAttribute("data-reveal", "");
        el.style.setProperty("--d", Math.min(i, 8) * 70 + "ms");
      });
    });
    var items = document.querySelectorAll("[data-reveal]");
    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  }

  function limaParts() {
    var fmt = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima", weekday: "short", day: "2-digit", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false
    });
    var out = {};
    fmt.formatToParts(new Date()).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }

  function clock() {
    var dateEl = document.querySelector("[data-pd-date]");
    var timeEl = document.querySelector("[data-pd-time]");
    var mktEl = document.querySelector("[data-pd-market]");
    if (!dateEl && !timeEl && !mktEl) return;
    function tick() {
      var p = limaParts();
      if (dateEl) dateEl.textContent = (p.weekday + " " + p.day + " " + p.month + " " + p.year).replace(/\./g, "").toUpperCase();
      if (timeEl) timeEl.textContent = p.hour + ":" + p.minute;
      if (mktEl) {
        var day = new Date().toLocaleString("en-US", { timeZone: "America/Lima", weekday: "short" });
        var mins = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
        var open = day !== "Sat" && day !== "Sun" && mins >= 540 && mins < 960;
        mktEl.setAttribute("data-state", open ? "open" : "closed");
        mktEl.textContent = open ? "BVL abierta" : "BVL cerrada";
      }
    }
    tick();
    setInterval(tick, 30000);
  }

  window.pdFlap = function (el, text) {
    if (!el) return;
    var prev = el.getAttribute("data-flap") || "";
    text = String(text);
    if (prev === text) return;
    el.setAttribute("data-flap", text);
    if (reduced) { el.textContent = text; return; }
    el.textContent = "";
    var n = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var wrap = document.createElement("span");
      wrap.className = "pd-flap";
      var inner = document.createElement("span");
      inner.textContent = ch === " " ? " " : ch;
      if (ch !== prev.charAt(i)) {
        inner.style.setProperty("--d", n * 35 + "ms");
        n++;
      } else {
        inner.style.animation = "none";
      }
      wrap.appendChild(inner);
      el.appendChild(wrap);
    }
    el.setAttribute("aria-label", text);
  };

  function init() { reveal(); clock(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window, document);
