/**
 * PerData - Institutional Authentication & Feature Gating Module
 * Compatible with Supabase Auth (@supabase/supabase-js v2) and persistent localStorage session.
 */

(function (window) {
  const STORAGE_KEY = "mde_auth_session";
  const DEFAULT_GATING_MESSAGE = "Acceso Cuantitativo Avanzado - Inicia sesión o crea tu cuenta institucional gratuita para desbloquear series de 10 años, exportación en Excel y análisis de sensibilidad en profundidad.";

  // Optional Supabase client instance
  let supabaseClient = null;
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    try {
      supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn("Supabase init error:", e);
    }
  }

  const Auth = {
    supabase: supabaseClient,

    getSession() {
      try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (!item) return null;
        return JSON.parse(item);
      } catch (e) {
        return null;
      }
    },

    isAuthenticated() {
      const session = this.getSession();
      return !!(session && session.user);
    },

    setSession(sessionData) {
      if (!sessionData) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
      }
      this.updateNavbar();
      this.updateGatedElements();
      window.dispatchEvent(new CustomEvent("mde-auth-changed", { detail: sessionData }));
      window.dispatchEvent(new CustomEvent("mde:auth-change", { detail: sessionData }));
    },

    logout() {
      if (supabaseClient) {
        try { supabaseClient.auth.signOut(); } catch (e) {}
      }
      try {
        fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signout" })
        }).catch(() => {});
      } catch (e) {}
      this.setSession(null);
    },

    requireAuth(featureName, onAllowed) {
      if (this.isAuthenticated()) {
        if (typeof onAllowed === "function") onAllowed();
        return true;
      }
      this.openModal(DEFAULT_GATING_MESSAGE);
      return false;
    },

    openModal(customPrompt) {
      ensureModalDOM();
      const modal = document.getElementById("mdeAuthModal");
      const modalBox = document.getElementById("mdeAuthModalBox");
      const banner = document.getElementById("mdeAuthBanner");

      if (banner) {
        if (customPrompt) {
          banner.textContent = customPrompt;
          banner.classList.remove("hidden");
        } else {
          banner.textContent = DEFAULT_GATING_MESSAGE;
          banner.classList.remove("hidden");
        }
      }

      if (modal && modalBox) {
        modal.classList.remove("opacity-0", "pointer-events-none");
        modal.classList.add("opacity-100", "pointer-events-auto");
        modalBox.classList.remove("scale-95");
        modalBox.classList.add("scale-100");
        document.body.style.overflow = "hidden";
        // Reset form error/status
        const statusEl = document.getElementById("mdeAuthStatus");
        if (statusEl) statusEl.textContent = "";
      }
    },

    closeModal() {
      const modal = document.getElementById("mdeAuthModal");
      const modalBox = document.getElementById("mdeAuthModalBox");
      if (modal && modalBox) {
        modal.classList.remove("opacity-100", "pointer-events-auto");
        modal.classList.add("opacity-0", "pointer-events-none");
        modalBox.classList.remove("scale-100");
        modalBox.classList.add("scale-95");
        document.body.style.overflow = "";
      }
    },

    async signInWithEmail(email, password) {
      if (!email || !email.includes("@")) {
        return { success: false, error: "Ingresa un correo electrónico válido (ej. analista@empresa.com)." };
      }
      if (!password || password.length < 6) {
        return { success: false, error: "La contraseña debe tener al menos 6 caracteres." };
      }

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "signin", email, password })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "Credenciales incorrectas." };
        }
        this.setSession({
          user: data.user,
          access_token: data.token
        });
        return { success: true, user: data.user };
      } catch (err) {
        return { success: false, error: "Error conectando con el servidor de autenticación." };
      }
    },

    async signUpWithEmail(email, password, fullName) {
      if (!email || !email.includes("@")) {
        return { success: false, error: "Ingresa un correo institucional válido." };
      }
      if (!password || password.length < 6) {
        return { success: false, error: "La contraseña debe tener un mínimo de 6 caracteres." };
      }

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "signup",
            email: email.trim().toLowerCase(),
            password,
            name: fullName ? fullName.trim() : email.split("@")[0]
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "No se pudo registrar la cuenta." };
        }
        this.setSession({
          user: data.user,
          access_token: data.token
        });
        return { success: true, user: data.user };
      } catch (err) {
        return { success: false, error: "Error conectando con el servidor de autenticación." };
      }
    },

    async signInWithOAuth(provider) {
      return this.openOAuthPopup(provider);
    },

    openOAuthPopup(provider) {
      // NOTE: Real OAuth requires backend credentials (client_id/secret)
      // and proper registration at each provider's developer console.
      // This placeholder shows the modal message until OAuth is configured.
      const msg = "Autenticación social próximamente. Por ahora usa correo y contraseña.";
      const statusEl = document.getElementById("mdeAuthStatus") || document.getElementById("authStatus");
      if (statusEl) statusEl.textContent = msg;
      console.warn("[PerData] OAuth SSO not yet configured for:", provider);
    },

    updateNavbar() {
      const container = document.getElementById("navbarAuthContainer");
      if (!container) return;

      const session = this.getSession();
      if (session && session.user) {
        const u = session.user;
        const initial = (u.name || u.email || "U").charAt(0).toUpperCase();
        const displayName = u.name || u.email.split("@")[0];

        container.innerHTML = `
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#3A3A3C]">
              <span class="w-6 h-6 rounded-full bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-xs font-bold font-mono">${initial}</span>
              <span class="text-xs font-medium text-black dark:text-white max-w-[110px] truncate" title="${u.email}">${escapeHTML(displayName)}</span>
            </div>
            <button id="btnLogout" type="button" class="text-xs text-[#86868B] hover:text-black dark:hover:text-white px-2 py-1 transition" title="Cerrar sesión">
              Cerrar sesión
            </button>
          </div>
        `;

        const btnLogout = document.getElementById("btnLogout");
        if (btnLogout) {
          btnLogout.addEventListener("click", () => {
            Auth.logout();
          });
        }
      } else {
        container.innerHTML = `
          <button id="btnOpenAuthModal" type="button" class="text-xs font-semibold px-3 py-1.5 rounded-md bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span>Iniciar Sesión</span>
          </button>
        `;

        const btnOpen = document.getElementById("btnOpenAuthModal");
        if (btnOpen) {
          btnOpen.addEventListener("click", () => {
            Auth.openModal();
          });
        }
      }
    },

    updateGatedElements() {
      const isAuth = this.isAuthenticated();

      // Clean up any remaining legacy lock icons
      document.querySelectorAll(".auth-lock-icon, .range-lock, .horizon-lock").forEach(el => el.remove());

      // 10Y range button: attenuate font if not authenticated
      const btn10y = document.querySelector('.range-btn[data-range="10y"]');
      if (btn10y) {
        if (!isAuth) {
          btn10y.classList.add("locked-option");
        } else {
          btn10y.classList.remove("locked-option");
        }
      }

      // Horizon buttons: 3M, 6M, 12M and Custom
      const horizonGated = [
        document.querySelector('.horizon-btn[data-horizon="3"]'),
        document.querySelector('.horizon-btn[data-horizon="6"]'),
        document.querySelector('.horizon-btn[data-horizon="12"]'),
        document.getElementById("btnCustomHorizon")
      ].filter(Boolean);

      horizonGated.forEach(btn => {
        if (!isAuth) {
          btn.classList.add("locked-option");
        } else {
          btn.classList.remove("locked-option");
        }
      });

      // Excel export buttons
      const excelButtons = [document.getElementById("btnExportExcel"), document.getElementById("btnExportExcelTop")].filter(Boolean);
      excelButtons.forEach(btn => {
        if (!isAuth) {
          btn.classList.add("locked-option");
        } else {
          btn.classList.remove("locked-option");
        }
      });

      // Econometric Sensitivity Accordion
      const accordionHeader = document.getElementById("econometricAccordionHeader");
      if (accordionHeader) {
        if (!isAuth) {
          accordionHeader.classList.add("locked-option");
        } else {
          accordionHeader.classList.remove("locked-option");
        }
      }
    },

    init() {
      ensureModalDOM();
      this.updateNavbar();
      this.updateGatedElements();

      // Listen for OAuth Gateway popup message
      window.addEventListener("message", (e) => {
        if (e.data && e.data.type === "MDE_AUTH_SUCCESS" && e.data.session) {
          this.setSession(e.data.session);
          this.closeModal();
          this.updateNavbar();
          this.updateGatedElements();
        }
      });

      // Listen for ESC key
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.closeModal();
        }
      });
    }
  };

  function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m]);
  }

  function ensureModalDOM() {
    if (document.getElementById("mdeAuthModal")) return;

    const modalHTML = `
      <div id="mdeAuthModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-300">
        <div id="mdeAuthModalBox" class="bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-lg w-full max-w-md p-6 sm:p-7 shadow-2xl scale-95 transition-all duration-300 text-black dark:text-white relative">
          
          <!-- Close Button -->
          <button id="btnCloseAuthModal" type="button" class="absolute top-4 right-4 text-[#86868B] hover:text-black dark:hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <!-- Banner / Prompt for Gated Features -->
          <div id="mdeAuthBanner" class="mb-4 p-3 rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#3A3A3C] text-[12px] leading-relaxed text-[#1D1D1F] dark:text-[#E5E5EA] font-medium">
            ${DEFAULT_GATING_MESSAGE}
          </div>

          <!-- Header -->
          <div class="mb-5 text-center">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-black dark:bg-white text-white dark:text-black mb-2 shadow-sm font-mono text-sm font-bold">
              MDE
            </div>
            <h3 class="text-lg font-bold tracking-tight">Acceso Cuantitativo Avanzado</h3>
            <p class="text-xs text-[#86868B] mt-0.5">Terminal Institucional PerData</p>
          </div>

          <!-- Mode Switcher (Tab) -->
          <div class="flex p-1 bg-[#F5F5F7] dark:bg-[#2C2C2E] rounded-lg mb-5 text-xs font-semibold">
            <button id="tabSignIn" type="button" class="flex-1 py-1.5 rounded-lg bg-white dark:bg-[#1C1C1E] text-black dark:text-white shadow-sm transition">
              Iniciar Sesión
            </button>
            <button id="tabSignUp" type="button" class="flex-1 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition">
              Crear Cuenta
            </button>
          </div>

          <!-- Social Auth Buttons (SSO en desarrollo — claramente marcado) -->
          <div class="space-y-2 mb-4 opacity-60" title="Disponible próximamente">
            <!-- Google Button -->
            <button id="btnAuthGoogle" type="button" class="w-full flex items-center justify-center gap-3 py-2 px-4 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]/50 hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] text-xs font-medium transition">
              <svg class="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar con Google</span>
            </button>

            <!-- Apple Button -->
            <button id="btnAuthApple" type="button" class="w-full flex items-center justify-center gap-3 py-2 px-4 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]/50 hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] text-xs font-medium transition">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.65-.79 1.1-1.89.98-3-.95.04-2.09.63-2.76 1.42-.59.68-1.11 1.79-.97 2.87 1.06.08 2.1-.5 2.75-1.29z"/>
              </svg>
              <span>Continuar con Apple</span>
            </button>

            <!-- Facebook Button -->
            <button id="btnAuthFacebook" type="button" class="w-full flex items-center justify-center gap-3 py-2 px-4 rounded-lg border border-[#E5E5EA] dark:border-[#3A3A3C] bg-white dark:bg-[#2C2C2E]/50 hover:bg-[#F5F5F7] dark:hover:bg-[#2C2C2E] text-xs font-medium transition">
              <svg class="w-4 h-4 fill-[#1877F2]" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>Continuar con Facebook</span>
            </button>
          </div>

          <!-- Divider -->
          <div class="relative flex items-center justify-center mb-4">
            <div class="border-t border-[#E5E5EA] dark:border-[#2C2C2E] w-full"></div>
            <span class="bg-white dark:bg-[#1C1C1E] px-3 text-[10px] text-[#86868B] uppercase tracking-wider font-semibold">o con correo</span>
          </div>

          <!-- Email / Password Form -->
          <form id="mdeAuthForm" class="space-y-3">
            <div id="groupFullName" class="hidden">
              <label class="block text-[11px] font-medium text-[#86868B] mb-1">Nombre completo / Organización</label>
              <input type="text" id="authFullName" placeholder="Ej. Agustín Wong / Tesorería Corporativa" class="w-full px-3 py-2 text-xs rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#3A3A3C] focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10">
            </div>

            <div>
              <label class="block text-[11px] font-medium text-[#86868B] mb-1">Correo electrónico</label>
              <input type="email" id="authEmail" required placeholder="analista@empresa.com" class="w-full px-3 py-2 text-xs rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#3A3A3C] focus:outline-none focus:border-black dark:focus:border-white focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10">
            </div>

            <div>
              <label class="block text-[11px] font-medium text-[#86868B] mb-1">Contraseña</label>
              <div class="relative">
                <input type="password" id="authPassword" required minlength="6" placeholder="Mínimo 6 caracteres" class="w-full px-3 py-2 pr-9 text-xs rounded-lg bg-[#F5F5F7] dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#3A3A3C] focus:outline-none focus:border-black dark:focus:border-white">
                <button type="button" id="btnTogglePwVisibility" class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#86868B] hover:text-black dark:hover:text-white transition" aria-label="Mostrar u ocultar contraseña">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
              </div>
              <div id="pwStrengthBar" class="hidden mt-1.5 h-1 w-full bg-[#E5E5EA] dark:bg-[#3A3A3C] rounded-full overflow-hidden">
                <div id="pwStrengthFill" class="h-full w-0 bg-rose-500 transition-all duration-300"></div>
              </div>
              <div id="pwStrengthText" class="hidden text-[10px] text-[#86868B] mt-1">Fortaleza de la contraseña</div>
            </div>

            <div id="groupForgotPw" class="text-right">
              <button type="button" id="btnForgotPassword" class="text-[11px] text-[#86868B] hover:text-black dark:hover:text-white underline transition">Olvidé mi contraseña</button>
            </div>

            <div id="mdeAuthStatus" class="text-[11px] text-red-500 font-medium min-h-[16px]"></div>

            <button type="submit" id="btnSubmitAuth" class="w-full py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black font-semibold text-xs hover:opacity-90 transition shadow-sm">
              Iniciar Sesión
            </button>
          </form>

          <p class="mt-4 text-[10px] text-center text-[#86868B]">
            Al registrarte aceptas los <a href="/terms" class="underline hover:text-black dark:hover:text-white">Términos y Condiciones</a> y el descargo SMV/SEC.
          </p>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Bind Modal Events
    let isSignUp = false;
    const tabSignIn = document.getElementById("tabSignIn");
    const tabSignUp = document.getElementById("tabSignUp");
    const groupFullName = document.getElementById("groupFullName");
    const btnSubmit = document.getElementById("btnSubmitAuth");
    const authForm = document.getElementById("mdeAuthForm");
    const statusEl = document.getElementById("mdeAuthStatus");
    const btnClose = document.getElementById("btnCloseAuthModal");
    const modalBackdrop = document.getElementById("mdeAuthModal");

    function setTab(signup) {
      isSignUp = signup;
      if (signup) {
        tabSignUp.className = "flex-1 py-1.5 rounded-lg bg-white dark:bg-[#1C1C1E] text-black dark:text-white shadow-sm transition";
        tabSignIn.className = "flex-1 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition";
        groupFullName.classList.remove("hidden");
        btnSubmit.textContent = "Crear Cuenta Institucional Gratuita";
      } else {
        tabSignIn.className = "flex-1 py-1.5 rounded-lg bg-white dark:bg-[#1C1C1E] text-black dark:text-white shadow-sm transition";
        tabSignUp.className = "flex-1 py-1.5 rounded-lg text-[#86868B] dark:text-[#8E8E93] hover:text-black dark:hover:text-white transition";
        groupFullName.classList.add("hidden");
        btnSubmit.textContent = "Iniciar Sesión";
      }
      statusEl.textContent = "";
    }

    // Password visibility toggle
    const pwInput = document.getElementById("authPassword");
    const pwToggle = document.getElementById("btnTogglePwVisibility");
    pwToggle.addEventListener("click", () => {
      pwInput.type = pwInput.type === "password" ? "text" : "password";
      pwToggle.classList.toggle("text-black", pwInput.type === "text");
      pwToggle.classList.toggle("dark:text-white", pwInput.type === "text");
    });

    // Password strength meter (signup only)
    const strengthBar = document.getElementById("pwStrengthBar");
    const strengthFill = document.getElementById("pwStrengthFill");
    const strengthText = document.getElementById("pwStrengthText");
    pwInput.addEventListener("input", () => {
      if (!isSignUp) { strengthBar.classList.add("hidden"); strengthText.classList.add("hidden"); return; }
      const v = pwInput.value;
      let score = 0;
      if (v.length >= 6) score++;
      if (v.length >= 10) score++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
      if (/[0-9]/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      const pct = Math.min(100, score * 20);
      const labels = ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte", "Excelente"];
      const colors = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];
      strengthFill.className = "h-full transition-all duration-300 " + colors[score];
      strengthFill.style.width = pct + "%";
      strengthText.textContent = "Fortaleza: " + labels[score];
      strengthBar.classList.remove("hidden");
      strengthText.classList.remove("hidden");
    });

    // Forgot password — honest message (reset flow pending email service)
    document.getElementById("btnForgotPassword").addEventListener("click", () => {
      const email = document.getElementById("authEmail").value.trim();
      if (!email || !email.includes("@")) {
        statusEl.className = "text-[11px] text-red-500 font-medium min-h-[16px]";
        statusEl.textContent = "Ingresa tu correo y te avisaremos cuando el restablecimiento esté activo.";
        return;
      }
      statusEl.className = "text-[11px] text-[#86868B] font-medium min-h-[16px]";
      statusEl.textContent = "El restablecimiento por correo se activará próximamente. Guarda tus credenciales con cuidado.";
    });

    tabSignIn.addEventListener("click", () => setTab(false));
    tabSignUp.addEventListener("click", () => setTab(true));

    btnClose.addEventListener("click", () => Auth.closeModal());
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) Auth.closeModal();
    });

    // Social SSO — honest state: coming soon (backend credentials not configured)
    const ssoSoon = (provider) => {
      statusEl.className = "text-[11px] text-[#86868B] font-medium min-h-[16px]";
      statusEl.textContent = "El acceso con " + provider + " estará disponible próximamente. Por ahora usa correo y contraseña.";
    };
    document.getElementById("btnAuthGoogle").addEventListener("click", () => ssoSoon("Google"));
    document.getElementById("btnAuthApple").addEventListener("click", () => ssoSoon("Apple"));
    document.getElementById("btnAuthFacebook").addEventListener("click", () => ssoSoon("Facebook"));

    // Form Submit Handler
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("authEmail").value;
      const pass = document.getElementById("authPassword").value;
      const fullName = document.getElementById("authFullName")?.value;

      btnSubmit.disabled = true;
      btnSubmit.classList.add("opacity-60");
      statusEl.className = "text-[11px] text-[#86868B] font-medium min-h-[16px]";
      statusEl.textContent = "Verificando credenciales institucionales...";

      let res;
      if (isSignUp) {
        res = await Auth.signUpWithEmail(email, pass, fullName);
      } else {
        res = await Auth.signInWithEmail(email, pass);
      }

      btnSubmit.disabled = false;
      btnSubmit.classList.remove("opacity-60");

      if (res.success) {
        statusEl.className = "text-[11px] text-emerald-600 dark:text-emerald-400 font-medium min-h-[16px]";
        statusEl.textContent = "Acceso verificado. ¡Bienvenido a la Terminal!";
        setTimeout(() => {
          Auth.closeModal();
        }, 500);
      } else {
        statusEl.className = "text-[11px] text-red-500 font-medium min-h-[16px]";
        statusEl.textContent = res.error || "No se pudo completar el acceso.";
      }
    });
  }

  // Expose to window
  window.MDE_Auth = Auth;
  window.MacroAuth = Auth;

  // Auto initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Auth.init());
  } else {
    Auth.init();
  }
})(window);
