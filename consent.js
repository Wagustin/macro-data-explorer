/**
 * PerData - Gestión de Consentimiento de Cookies y Carga de Publicidad (T74)
 * - Cumplimiento RGPD/ePrivacy: auto-alojado, sin CMP externa.
 * - En EEE, Reino Unido y Suiza: AdSense desactivado por completo.
 * - Fuera de EEE: sin elección no se carga AdSense; al elegir, anuncios personalizados (Aceptar) o no personalizados.
 * - Cookie 'pd_consent': ads=1|0, v=1, date; 180 días, SameSite=Lax, Secure.
 */
(function() {
  const COOKIE_NAME = "pd_consent";
  const COOKIE_DAYS = 180;

  function parseConsent() {
    const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + COOKIE_NAME + "=([^;]+)"));
    if (!match) return null;
    try {
      const decoded = decodeURIComponent(match[1]);
      const adsMatch = decoded.match(/ads=([01])/);
      const vMatch = decoded.match(/v=([^&|;]+)/);
      const dateMatch = decoded.match(/date=([^&|;]+)/);
      return {
        ads: adsMatch ? parseInt(adsMatch[1], 10) : 0,
        v: vMatch ? vMatch[1] : "1",
        date: dateMatch ? dateMatch[1] : ""
      };
    } catch (e) {
      return null;
    }
  }

  function getGeo() {
    const meta = document.querySelector('meta[name="pd-geo"]');
    const geo = meta ? (meta.getAttribute("content") || "").toLowerCase().trim() : "";
    return geo === "eea" ? "eea" : "otro";
  }

  function loadScript() {
    if (getGeo() === "eea") return;
    // Ads only on pages with content of our own (marked with <meta name="pd-ads" content="1">)
    if (!document.querySelector('meta[name="pd-ads"][content="1"]')) return;
    if (document.querySelector('script[src*="adsbygoogle.js"]')) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3342536112010915";
    s.crossOrigin = "anonymous";
    const nonce = document.querySelector("script[nonce]")?.getAttribute("nonce");
    if (nonce) s.setAttribute("nonce", nonce);
    document.head.appendChild(s);
  }

  function saveConsent(ads) {
    const dateStr = new Date().toISOString();
    const val = encodeURIComponent(`ads=${ads ? 1 : 0}&v=1&date=${dateStr}`);
    const maxAge = COOKIE_DAYS * 86400;
    const isSecure = window.location.protocol === "https:";
    document.cookie = `${COOKIE_NAME}=${val}; max-age=${maxAge}; path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;

    // Actualizar estado de AdSense en tiempo real si aplica (solo fuera de EEE)
    if (getGeo() === "otro") {
      if (ads) {
        if (window.adsbygoogle) {
          delete window.adsbygoogle.requestNonPersonalizedAds;
        }
      } else {
        (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
      }
      loadScript();
    }
  }

  function initAdSense() {
    if (getGeo() === "eea") {
      // En EEE / Reino Unido / Suiza nunca se carga AdSense
      return;
    }

    const consent = parseConsent();
    if (!consent) {
      // Sin elección guardada NO se carga AdSense
      return;
    }

    if (consent.ads === 1) {
      if (window.adsbygoogle) {
        delete window.adsbygoogle.requestNonPersonalizedAds;
      }
    } else {
      (window.adsbygoogle = window.adsbygoogle || []).requestNonPersonalizedAds = 1;
    }

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadScript, { timeout: 2000 });
    } else {
      setTimeout(loadScript, 2000);
    }
  }

  let modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;

    const backdrop = document.createElement("div");
    backdrop.id = "pdConsentModalBackdrop";
    backdrop.className = "pd-consent-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "pdConsentModalTitle");

    backdrop.innerHTML = `
      <div class="pd-consent-modal">
        <div class="pd-consent-modal-header">
          <h2 id="pdConsentModalTitle" class="pd-consent-modal-title">Preferencias de cookies</h2>
          <button type="button" class="pd-consent-modal-close" id="pdConsentModalClose" aria-label="Cerrar">&times;</button>
        </div>
        <div class="pd-consent-category">
          <div class="pd-consent-cat-header">
            <span class="pd-consent-cat-title">Cookies necesarias</span>
            <span class="pd-consent-badge-fixed">Siempre activas</span>
          </div>
          <p class="pd-consent-cat-desc">Esenciales para el funcionamiento del sitio, la autenticación segura y la preservación de tus preferencias de interfaz.</p>
        </div>
        <div class="pd-consent-category">
          <div class="pd-consent-cat-header">
            <span class="pd-consent-cat-title">Publicidad personalizada</span>
            <label class="pd-consent-toggle" for="pdConsentAdsToggle">
              <input type="checkbox" id="pdConsentAdsToggle">
              <span class="pd-consent-toggle-slider"></span>
            </label>
          </div>
          <p class="pd-consent-cat-desc">Si lo activas, los anuncios de Google AdSense se adaptan a tus intereses. Si lo dejas desactivado verás anuncios genéricos, que también usan cookies de Google para medirlos y evitar fraudes. En Europa nunca se muestran anuncios.</p>
        </div>
        <div class="pd-consent-modal-actions">
          <button type="button" class="pd-consent-btn" id="pdConsentModalSave">Guardar preferencias</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    modalEl = backdrop;

    const closeBtn = backdrop.querySelector("#pdConsentModalClose");
    const saveBtn = backdrop.querySelector("#pdConsentModalSave");
    const toggle = backdrop.querySelector("#pdConsentAdsToggle");

    const closeModal = () => {
      backdrop.classList.remove("is-open");
    };

    closeBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    saveBtn.addEventListener("click", () => {
      const adsAllowed = toggle.checked;
      saveConsent(adsAllowed);
      closeModal();
      document.documentElement.style.removeProperty("--pd-consent-h");
      const banner = document.getElementById("pdConsentBanner");
      if (banner) banner.remove();
    });

    return backdrop;
  }

  function openModal() {
    const modal = ensureModal();
    const toggle = modal.querySelector("#pdConsentAdsToggle");
    const consent = parseConsent();
    if (toggle) {
      toggle.checked = consent ? consent.ads === 1 : false;
    }
    modal.classList.add("is-open");
  }

  function renderBanner() {
    if (document.getElementById("pdConsentBanner")) return;

    // El aviso dice la verdad según la zona: fuera del EEE se muestran anuncios de Google
    // (personalizados solo con permiso); en Europa no se muestra ninguno.
    const eea = getGeo() === "eea";
    const texto = eea
      ? "Usamos cookies necesarias para que la web funcione. En Europa no mostramos anuncios."
      : "Usamos cookies necesarias para que la web funcione y mostramos anuncios de Google. Con tu permiso, personalizados.";
    const botonNecesarias = eea ? "Solo necesarias" : "Sin personalizar";

    const bar = document.createElement("aside");
    bar.id = "pdConsentBanner";
    bar.className = "pd-consent-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Aviso de cookies");

    bar.innerHTML = `
      <div class="pd-consent-inner">
        <p class="pd-consent-text">${texto}</p>
        <div class="pd-consent-actions">
          <button type="button" class="pd-consent-btn" id="pdConsentAccept">Aceptar</button>
          <button type="button" class="pd-consent-btn" id="pdConsentNecessary">${botonNecesarias}</button>
          <button type="button" class="pd-consent-link" id="pdConsentConfig">Configurar</button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    const setH = () => document.documentElement.style.setProperty("--pd-consent-h", bar.offsetHeight + "px");
    setH();
    window.addEventListener("resize", setH);

    // Ajustar si existe barra móvil
    const updatePosition = () => {
      const mobileNav = document.querySelector(".mobile-nav");
      if (mobileNav && window.innerWidth <= 768) {
        document.body.classList.add("has-mobile-nav");
        bar.style.bottom = `${mobileNav.offsetHeight}px`;
      } else {
        bar.style.bottom = "0px";
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);

    const hideBanner = () => {
      document.documentElement.style.removeProperty("--pd-consent-h");
      window.removeEventListener("resize", setH);
      window.removeEventListener("resize", updatePosition);
      bar.remove();
    };

    bar.querySelector("#pdConsentAccept").addEventListener("click", () => {
      saveConsent(1);
      hideBanner();
    });

    bar.querySelector("#pdConsentNecessary").addEventListener("click", () => {
      saveConsent(0);
      hideBanner();
    });

    bar.querySelector("#pdConsentConfig").addEventListener("click", () => {
      openModal();
    });
  }

  function init() {
    initAdSense();

    const consent = parseConsent();
    if (!consent) {
      renderBanner();
    }

    // Escuchar clics en el enlace permanente de Cookies en el pie de página
    document.addEventListener("click", (e) => {
      const link = e.target.closest("[data-open-cookies], .pd-cookies-link, a[href='#cookies']");
      if (link) {
        e.preventDefault();
        openModal();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PerDataConsent = {
    getConsent: parseConsent,
    setConsent: saveConsent,
    openModal: openModal
  };
})();
