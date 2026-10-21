/**
 * PerData - Cuentas, planes y facturación (cliente).
 * La sesión se valida contra /api/auth al cargar; los límites por plan vienen de
 * /api/billing?action=config y el servidor los vuelve a aplicar en cada API.
 */

(function (window, document) {
  const STORAGE_KEY = "mde_auth_session";

  // Fallback until /api/billing?action=config answers (same table as api/_lib/plans.js).
  let PLANS = {
    anon: { id: "anon", ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y"], maxHorizon: 1, excel: false },
    free: { id: "free", label: "Gratis", ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y"], maxHorizon: 6, excel: false },
    pro: { id: "pro", label: "Pro", ranges: ["1mo", "3mo", "6mo", "1y", "2y", "3y", "5y", "10y", "max"], maxHorizon: 36, excel: true }
  };
  let billing = { enabled: false, prices: [] };
  let billingLoaded = null;

  const ICON_USER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  const ICON_EYE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

  const FEATURE_COPY = {
    range: "Las series de 10 años y el historial completo son parte del plan Pro.",
    horizon: "Los horizontes de proyección largos (12 a 36 meses) son parte del plan Pro.",
    excel: "La exportación a Excel es parte del plan Pro.",
    default: "Desbloquea series de 10 años, horizontes de hasta 36 meses y exportación a Excel."
  };

  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m]);
  }

  function formatPrice(p) {
    if (!p || typeof p.amount !== "number") return "";
    try {
      return new Intl.NumberFormat("es-PE", { style: "currency", currency: p.currency.toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
    } catch (e) {
      return (p.amount / 100).toFixed(2) + " " + p.currency.toUpperCase();
    }
  }

  const Auth = {
    // ---------- Session ----------
    getSession() {
      try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        return s && s.user && s.access_token ? s : null;
      } catch (e) {
        return null;
      }
    },

    getUser() {
      const s = this.getSession();
      return s ? s.user : null;
    },

    getToken() {
      const s = this.getSession();
      return s ? s.access_token : null;
    },

    isAuthenticated() {
      return !!this.getSession();
    },

    isPro() {
      const u = this.getUser();
      return !!(u && u.plan === "pro");
    },

    setSession(session) {
      try {
        if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        else localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      this.render();
      window.dispatchEvent(new CustomEvent("mde-auth-changed", { detail: session }));
      window.dispatchEvent(new CustomEvent("mde:auth-change", { detail: session }));
    },

    /** Re-reads the user (plan included) from the server. Signs out only on a definite 401. */
    async refresh() {
      const token = this.getToken();
      if (!token) return null;
      try {
        const res = await fetch("/api/auth", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
        if (res.status === 401) {
          this.setSession(null);
          return null;
        }
        const data = await res.json();
        if (data.success && data.user) {
          const prev = this.getUser() || {};
          if (JSON.stringify(prev) !== JSON.stringify(data.user)) {
            this.setSession({ user: data.user, access_token: token });
          }
          return data.user;
        }
      } catch (e) {}
      return this.getUser();
    },

    logout() {
      fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signout" }) }).catch(() => {});
      this.setSession(null);
      closeMenu();
    },

    /** fetch() that adds the session token. */
    authFetch(url, options) {
      const opts = Object.assign({}, options || {});
      const token = this.getToken();
      if (token) opts.headers = Object.assign({}, opts.headers || {}, { Authorization: "Bearer " + token });
      return fetch(url, opts);
    },

    // ---------- Plans ----------
    plan() {
      const u = this.getUser();
      if (!u) return PLANS.anon;
      return u.plan === "pro" ? PLANS.pro : PLANS.free;
    },

    plans() {
      return PLANS;
    },

    billing() {
      return billing;
    },

    loadBilling() {
      if (!billingLoaded) {
        billingLoaded = fetch("/api/billing?action=config")
          .then(r => r.json())
          .then(cfg => {
            if (cfg && cfg.plans) PLANS = cfg.plans;
            billing = { enabled: !!(cfg && cfg.enabled), prices: (cfg && cfg.prices) || [] };
            window.dispatchEvent(new CustomEvent("mde:billing-loaded", { detail: billing }));
            this.render();
            return billing;
          })
          .catch(() => billing);
      }
      return billingLoaded;
    },

    priceLabel(interval) {
      const p = billing.prices.find(x => x.interval === (interval || "month"));
      return p ? formatPrice(p) : "";
    },

    /** can("range","10y") · can("horizon",12) · can("excel") */
    can(feature, value) {
      const plan = this.plan();
      if (feature === "range") return plan.ranges.indexOf(value) !== -1;
      if (feature === "horizon") return Number(value) <= plan.maxHorizon;
      if (feature === "excel") return !!plan.excel;
      return true;
    },

    /** Returns true if allowed; otherwise opens sign-in (anon) or the Pro prompt (free). */
    gate(feature, value) {
      if (this.can(feature, value)) return true;
      if (!this.isAuthenticated()) {
        // A free account is enough for short horizons; anything else needs Pro after signing up.
        const freeAllows = feature === "horizon" && Number(value) <= PLANS.free.maxHorizon;
        const prompt = freeAllows
          ? "Crea tu cuenta gratuita para proyectar hasta " + PLANS.free.maxHorizon + " meses."
          : (FEATURE_COPY[feature] || FEATURE_COPY.default) + " Crea tu cuenta para empezar.";
        this.openModal(prompt, "signup", freeAllows ? null : feature);
      } else {
        this.openUpgrade(feature);
      }
      return false;
    },

    /** Handles a 403 from a gated API. Returns true when it was a plan error. */
    handleApiDenied(body) {
      if (!body || (body.code !== "auth_required" && body.code !== "upgrade_required")) return false;
      if (body.code === "auth_required") this.openModal(body.error, "signup");
      else this.openUpgrade(body.feature);
      return true;
    },

    requireAuth(featureName, onAllowed) {
      if (this.isAuthenticated()) {
        if (typeof onAllowed === "function") onAllowed();
        return true;
      }
      this.openModal();
      return false;
    },

    // ---------- Billing actions ----------
    async startCheckout(interval) {
      if (!this.isAuthenticated()) {
        this.openModal("Crea tu cuenta o inicia sesión para suscribirte a Pro.", "signup", "checkout");
        return { success: false };
      }
      try {
        const res = await this.authFetch("/api/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "checkout", interval: interval || "month" })
        });
        const data = await res.json();
        if (res.status === 401) this.setSession(null);
        if (data.url) {
          window.location.href = data.url;
          return { success: true };
        }
        return { success: false, error: data.error || "No se pudo iniciar el pago." };
      } catch (e) {
        return { success: false, error: "Error de conexión. Intenta de nuevo." };
      }
    },

    async openPortal() {
      try {
        const res = await this.authFetch("/api/billing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "portal" })
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return { success: true };
        }
        return { success: false, error: data.error || "No se pudo abrir el portal de pagos." };
      } catch (e) {
        return { success: false, error: "Error de conexión. Intenta de nuevo." };
      }
    },

    // ---------- Email auth ----------
    async signInWithEmail(email, password) {
      return submitCredentials({ action: "signin", email: String(email || "").trim(), password });
    },

    async signUpWithEmail(email, password, fullName) {
      return submitCredentials({ action: "signup", email: String(email || "").trim().toLowerCase(), password, name: (fullName || "").trim() });
    },

    // ---------- UI ----------
    openModal(prompt, mode, afterAuth) {
      ensureModal();
      pendingAfterAuth = afterAuth || null;
      const banner = document.getElementById("pdAuthPrompt");
      banner.textContent = prompt || "";
      banner.hidden = !prompt;
      setAuthMode(mode === "signup" ? "signup" : "signin");
      showDialog("pdAuthModal");
      setTimeout(() => {
        const first = document.getElementById(mode === "signup" ? "pdAuthName" : "pdAuthEmail");
        if (first) first.focus();
      }, 60);
    },

    closeModal() {
      hideDialog("pdAuthModal");
    },

    openUpgrade(feature) {
      ensureUpgrade();
      this.loadBilling();
      document.getElementById("pdUpgradeReason").textContent = FEATURE_COPY[feature] || FEATURE_COPY.default;
      renderUpgradeCta();
      showDialog("pdUpgradeModal");
    },

    closeUpgrade() {
      hideDialog("pdUpgradeModal");
    },

    render() {
      this.updateNavbar();
      this.updateGatedElements();
    },

    updateNavbar() {
      const container = document.getElementById("navbarAuthContainer");
      if (!container) return;
      const u = this.getUser();
      if (!u) {
        container.innerHTML = '<button id="btnOpenAuthModal" type="button" class="pd-nav-btn">' + ICON_USER + "<span>Iniciar sesión</span></button>";
        document.getElementById("btnOpenAuthModal").addEventListener("click", () => Auth.openModal());
        return;
      }
      const name = u.name || u.email.split("@")[0];
      const isPro = u.plan === "pro";
      container.innerHTML =
        '<div class="pd-acct">' +
          '<button id="pdAcctBtn" type="button" class="pd-acct-btn" aria-haspopup="menu" aria-expanded="false">' +
            '<span class="pd-avatar" aria-hidden="true">' + escapeHTML(name.charAt(0).toUpperCase()) + "</span>" +
            '<span class="pd-acct-name">' + escapeHTML(name) + "</span>" +
            (isPro ? '<span class="pd-plan-badge">Pro</span>' : "") +
          "</button>" +
          '<div id="pdAcctMenu" class="pd-acct-menu" role="menu" hidden>' +
            '<div class="pd-acct-head"><div class="pd-acct-head-name">' + escapeHTML(name) + '</div><div class="pd-acct-head-mail">' + escapeHTML(u.email) + "</div>" +
              '<div class="pd-acct-head-plan">Plan ' + (isPro ? "Pro" : "Gratis") + "</div></div>" +
            '<a role="menuitem" href="/cuenta">Mi cuenta</a>' +
            (isPro ? "" : '<a role="menuitem" href="/precios" class="pd-acct-upgrade">Mejorar a Pro</a>') +
            '<button role="menuitem" type="button" id="pdAcctLogout">Cerrar sesión</button>' +
          "</div>" +
        "</div>";
      const btn = document.getElementById("pdAcctBtn");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById("pdAcctMenu");
        const open = menu.hidden;
        menu.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      });
      document.getElementById("pdAcctLogout").addEventListener("click", () => Auth.logout());
    },

    /** Marks buttons for features the current plan can't use. */
    updateGatedElements() {
      const mark = (el, allowed) => {
        if (!el) return;
        el.classList.toggle("locked-option", !allowed);
        if (!allowed) el.setAttribute("data-locked", this.isAuthenticated() ? "pro" : "account");
        else el.removeAttribute("data-locked");
      };
      document.querySelectorAll(".range-btn[data-range]").forEach(btn => {
        if (!btn.classList.contains("bg-black")) mark(btn, this.can("range", btn.getAttribute("data-range")));
      });
      document.querySelectorAll(".horizon-btn[data-horizon]").forEach(btn => {
        if (!btn.classList.contains("bg-black")) mark(btn, this.can("horizon", btn.getAttribute("data-horizon")));
      });
      const custom = document.getElementById("btnCustomHorizon");
      if (custom && !custom.classList.contains("bg-black")) mark(custom, this.plan().maxHorizon > 12);
      ["btnExportExcel", "btnExportExcelTop"].forEach(id => mark(document.getElementById(id), this.can("excel")));
    },

    init() {
      this.render();
      this.loadBilling();
      this.refresh();
      document.addEventListener("click", (e) => {
        const menu = document.getElementById("pdAcctMenu");
        if (menu && !menu.hidden && !e.target.closest(".pd-acct")) closeMenu();
        const opener = e.target.closest("[data-auth-open]");
        if (opener) {
          e.preventDefault();
          Auth.openModal(opener.getAttribute("data-auth-prompt") || "", opener.getAttribute("data-auth-open"));
        }
        const upgrader = e.target.closest("[data-upgrade]");
        if (upgrader) {
          e.preventDefault();
          Auth.openUpgrade(upgrader.getAttribute("data-upgrade"));
        }
      });
      window.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closeMenu();
        Auth.closeModal();
        Auth.closeUpgrade();
      });
      // Another tab signed in or out.
      window.addEventListener("storage", (e) => {
        if (e.key === STORAGE_KEY) this.render();
      });
    }
  };

  // ---------- Internals ----------
  let authMode = "signin";
  let pendingAfterAuth = null;
  let lastFocus = null;

  function closeMenu() {
    const menu = document.getElementById("pdAcctMenu");
    if (menu) menu.hidden = true;
    const btn = document.getElementById("pdAcctBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function showDialog(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains("is-open")) return;
    lastFocus = document.activeElement;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-open"));
    document.body.style.overflow = "hidden";
  }

  function hideDialog(id) {
    const el = document.getElementById(id);
    if (!el || el.hidden) return;
    el.classList.remove("is-open");
    el.hidden = true;
    if (!document.querySelector(".pd-dialog.is-open")) document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function submitCredentials(payload) {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "No se pudo completar el acceso." };
      }
      Auth.setSession({ user: data.user, access_token: data.token });
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo." };
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    document.getElementById("pdTabSignIn").setAttribute("aria-selected", String(!signup));
    document.getElementById("pdTabSignUp").setAttribute("aria-selected", String(signup));
    document.getElementById("pdAuthTitle").textContent = signup ? "Crea tu cuenta gratuita" : "Inicia sesión en PerData";
    document.getElementById("pdGroupName").hidden = !signup;
    document.getElementById("pdForgot").hidden = signup;
    document.getElementById("pdAuthLegal").hidden = !signup;
    const pw = document.getElementById("pdAuthPassword");
    pw.autocomplete = signup ? "new-password" : "current-password";
    pw.placeholder = signup ? "Mínimo 8 caracteres" : "Tu contraseña";
    document.getElementById("pdAuthSubmit").textContent = signup ? "Crear cuenta" : "Iniciar sesión";
    setStatus("");
  }

  function setStatus(msg, kind) {
    const el = document.getElementById("pdAuthStatus");
    el.textContent = msg || "";
    el.className = "pd-form-status" + (kind ? " is-" + kind : "");
  }

  function ensureModal() {
    if (document.getElementById("pdAuthModal")) return;
    document.body.insertAdjacentHTML("beforeend",
      '<div id="pdAuthModal" class="pd-dialog" hidden>' +
        '<div class="pd-dialog-box" role="dialog" aria-modal="true" aria-labelledby="pdAuthTitle">' +
          '<button type="button" class="pd-dialog-close" data-close aria-label="Cerrar">' + ICON_CLOSE + "</button>" +
          '<div class="pd-dialog-brand"><span class="pd-mark" aria-hidden="true">P</span><span>PerData</span></div>' +
          '<h2 id="pdAuthTitle" class="pd-dialog-title">Inicia sesión en PerData</h2>' +
          '<p id="pdAuthPrompt" class="pd-dialog-prompt" hidden></p>' +
          '<div class="pd-tabs" role="tablist">' +
            '<button id="pdTabSignIn" type="button" role="tab" aria-selected="true">Iniciar sesión</button>' +
            '<button id="pdTabSignUp" type="button" role="tab" aria-selected="false">Crear cuenta</button>' +
          "</div>" +
          '<form id="pdAuthForm" class="pd-form" novalidate>' +
            '<label id="pdGroupName" class="pd-field" hidden><span>Nombre</span>' +
              '<input id="pdAuthName" type="text" autocomplete="name" maxlength="80" placeholder="Cómo te llamamos"></label>' +
            '<label class="pd-field"><span>Correo electrónico</span>' +
              '<input id="pdAuthEmail" type="email" autocomplete="email" required placeholder="tu@empresa.com"></label>' +
            '<label class="pd-field"><span>Contraseña</span><span class="pd-field-pw">' +
              '<input id="pdAuthPassword" type="password" autocomplete="current-password" required placeholder="Tu contraseña">' +
              '<button type="button" id="pdTogglePw" aria-label="Mostrar contraseña">' + ICON_EYE + "</button></span></label>" +
            '<div id="pdForgot" class="pd-form-aside"><button type="button" id="pdForgotBtn">¿Olvidaste tu contraseña?</button></div>' +
            '<p id="pdAuthStatus" class="pd-form-status" role="status" aria-live="polite"></p>' +
            '<button id="pdAuthSubmit" type="submit" class="pd-btn pd-btn-primary pd-btn-block">Iniciar sesión</button>' +
            '<p id="pdAuthLegal" class="pd-form-legal" hidden>Al crear tu cuenta aceptas los <a href="/terms">Términos y Condiciones</a>.</p>' +
          "</form>" +
        "</div>" +
      "</div>");

    const modal = document.getElementById("pdAuthModal");
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-close]")) Auth.closeModal();
    });
    trapFocus(modal);
    document.getElementById("pdTabSignIn").addEventListener("click", () => setAuthMode("signin"));
    document.getElementById("pdTabSignUp").addEventListener("click", () => setAuthMode("signup"));

    const pw = document.getElementById("pdAuthPassword");
    const toggle = document.getElementById("pdTogglePw");
    toggle.addEventListener("click", () => {
      const show = pw.type === "password";
      pw.type = show ? "text" : "password";
      toggle.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
      toggle.classList.toggle("is-on", show);
    });

    document.getElementById("pdForgotBtn").addEventListener("click", async (e) => {
      const email = document.getElementById("pdAuthEmail").value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        setStatus("Escribe tu correo arriba y vuelve a pulsar aquí para recibir el enlace.", "error");
        document.getElementById("pdAuthEmail").focus();
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      setStatus("Enviando enlace…");
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "forgot", email })
        });
        const data = await res.json().catch(() => ({}));
        setStatus(data.message || data.error || "No se pudo enviar el enlace.", data.success ? "ok" : "error");
      } catch (err) {
        setStatus("No hay conexión con el servidor. Intenta de nuevo.", "error");
      }
      btn.disabled = false;
    });

    document.getElementById("pdAuthForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("pdAuthEmail").value.trim();
      const password = pw.value;
      const name = document.getElementById("pdAuthName").value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setStatus("Ingresa un correo electrónico válido.", "error");
      if (authMode === "signup" && password.length < 8) return setStatus("La contraseña debe tener al menos 8 caracteres.", "error");
      if (!password) return setStatus("Ingresa tu contraseña.", "error");

      const submit = document.getElementById("pdAuthSubmit");
      submit.disabled = true;
      setStatus(authMode === "signup" ? "Creando tu cuenta…" : "Verificando…");
      const res = authMode === "signup" ? await Auth.signUpWithEmail(email, password, name) : await Auth.signInWithEmail(email, password);
      submit.disabled = false;

      if (!res.success) return setStatus(res.error, "error");
      setStatus(authMode === "signup" ? "Cuenta creada. ¡Bienvenido!" : "Sesión iniciada.", "ok");
      pw.value = "";
      const next = pendingAfterAuth;
      pendingAfterAuth = null;
      setTimeout(() => {
        Auth.closeModal();
        if (next === "checkout") Auth.startCheckout();
        else if (next && !Auth.can(next, next === "range" ? "10y" : 36)) Auth.openUpgrade(next);
      }, 450);
    });
  }

  function ensureUpgrade() {
    if (document.getElementById("pdUpgradeModal")) return;
    const perks = ["Series históricas de 10 años", "Proyecciones de 1 a 36 meses y horizonte a medida", "Exportación completa a Excel", "Cancela cuando quieras desde tu cuenta"];
    document.body.insertAdjacentHTML("beforeend",
      '<div id="pdUpgradeModal" class="pd-dialog" hidden>' +
        '<div class="pd-dialog-box" role="dialog" aria-modal="true" aria-labelledby="pdUpgradeTitle">' +
          '<button type="button" class="pd-dialog-close" data-close aria-label="Cerrar">' + ICON_CLOSE + "</button>" +
          '<p class="pd-kicker">Plan Pro</p>' +
          '<h2 id="pdUpgradeTitle" class="pd-dialog-title">Análisis completo, sin límites</h2>' +
          '<p id="pdUpgradeReason" class="pd-dialog-prompt"></p>' +
          '<ul class="pd-perks">' + perks.map(p => "<li>" + ICON_CHECK + "<span>" + p + "</span></li>").join("") + "</ul>" +
          '<div id="pdUpgradeCta"></div>' +
          '<p class="pd-form-legal"><a href="/precios">Comparar planes</a></p>' +
        "</div>" +
      "</div>");
    const modal = document.getElementById("pdUpgradeModal");
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-close]")) Auth.closeUpgrade();
    });
    trapFocus(modal);
    window.addEventListener("mde:billing-loaded", renderUpgradeCta);
  }

  function renderUpgradeCta() {
    const box = document.getElementById("pdUpgradeCta");
    if (!box) return;
    if (!billing.enabled) {
      box.innerHTML = '<button type="button" class="pd-btn pd-btn-primary pd-btn-block" disabled>Disponible muy pronto</button>';
      return;
    }
    const price = Auth.priceLabel("month");
    box.innerHTML =
      '<button type="button" id="pdUpgradeGo" class="pd-btn pd-btn-accent pd-btn-block">Mejorar a Pro' + (price ? " · " + escapeHTML(price) + "/mes" : "") + "</button>" +
      '<p id="pdUpgradeStatus" class="pd-form-status" role="status"></p>';
    document.getElementById("pdUpgradeGo").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = "Abriendo pago seguro…";
      const r = await Auth.startCheckout("month");
      if (!r.success) {
        const st = document.getElementById("pdUpgradeStatus");
        if (st) { st.textContent = r.error || ""; st.className = "pd-form-status is-error"; }
        renderUpgradeCta();
      }
    });
  }

  function trapFocus(container) {
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const items = [...container.querySelectorAll("button:not([disabled]), a[href], input:not([type=hidden]):not([disabled])")].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  window.MDE_Auth = Auth;
  window.MacroAuth = Auth;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => Auth.init());
  else Auth.init();
})(window, document);
