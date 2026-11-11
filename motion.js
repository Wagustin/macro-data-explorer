/**
 * PerData — Editorial Motion System
 * Curva canónica: cubic-bezier(.05, .7, .1, 1)
 * Cumple estrictamente con BRIEF_PERIODICO.md:
 * 1. prefers-reduced-motion apaga todo.
 * 2. Solo transform y opacity. Nada en bucle.
 * 3. Fallback: elementos parten visibles; JS añade clases de animación progresivamente.
 * 4. Secuencia de carga hero: firma (0ms), titular (120ms), entradilla (240ms), CTA (360ms).
 * 5. Filetes de lado a lado: scaleX(0->1) en 700ms al intersectar, seguido de su contenido.
 * 6. Sin contadores para cifras numéricas (solo fundido suave).
 */
(() => {
  // Respeto inquebrantable a accesibilidad
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // Activamos el motor de motion solo cuando JS está vivo
  document.documentElement.classList.add('pd-motion');

  // 1. Cabecera fija: filete inferior reactivo al scroll
  const onScroll = () => {
    const header = document.querySelector('header');
    if (header) {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const init = () => {
    onScroll();

    // 2. Secuencia de entrada del Hero (firma 0ms, titular 120ms, entradilla 240ms, CTA 360ms)
    // Se añade clase .hero-ready tras 50ms para permitir primer render y activar transiciones escalonadas
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.documentElement.classList.add('hero-ready');
      }, 50);
    });

    // 3. Filetes de lado a lado y revelado de contenido
    // Al entrar en pantalla: filete dibuja scaleX 0->1 (700ms).
    // Cada bloque con data-reveal / data-stagger se observa POR SEPARADO:
    // aparece cuando ÉL entra en pantalla, no cuando entra su sección.
    const sectionRules = document.querySelectorAll('[data-section-rule]');
    if ('IntersectionObserver' in window) {
      const ruleObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('rule-drawn');
            ruleObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -5% 0px' });

      sectionRules.forEach(r => ruleObserver.observe(r));

      // Revelados generales independientes: uno por bloque
      const reveals = document.querySelectorAll('[data-reveal], [data-stagger], .pd-rule-draw');
      const generalObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            generalObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });

      reveals.forEach(el => generalObserver.observe(el));
    } else {
      // Fallback sin IntersectionObserver
      sectionRules.forEach(r => r.classList.add('rule-drawn'));
      document.querySelectorAll('[data-reveal], [data-stagger], .pd-rule-draw').forEach(el => el.classList.add('is-revealed'));
    }

    // Safety timeout: por si IntersectionObserver no dispara en contenedores pequeños.
    // Solo revela lo que ya está en pantalla; lo que está más abajo espera al scroll.
    setTimeout(() => {
      document.documentElement.classList.add('hero-ready');
      document.querySelectorAll('[data-section-rule]').forEach(r => r.classList.add('rule-drawn'));
      document.querySelectorAll('[data-reveal], [data-stagger], .pd-rule-draw').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('is-revealed');
      });
    }, 1800);

    // 4. Actualización reactiva de cifras sin contadores: solo fundido sutil (160ms)
    const priceCells = document.querySelectorAll(
      '[data-cell-price], [data-cell-pct], [data-cell-p50], #pdCardP50, #pdCardP10, #pdCardP90, #pdCardChange, #pd-p10, #pd-p50, #pd-p90'
    );
    if (priceCells.length && 'MutationObserver' in window) {
      const mo = new MutationObserver((mutations) => {
        mutations.forEach(m => {
          const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (el && el.animate && el.textContent.trim() !== '—') {
            el.animate([
              { opacity: 0.4, transform: 'translateY(2px)' },
              { opacity: 1, transform: 'translateY(0)' }
            ], {
              duration: 160,
              easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)'
            });
          }
        });
      });
      priceCells.forEach(c => mo.observe(c, { childList: true, characterData: true, subtree: true }));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
