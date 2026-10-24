(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('pd-motion');

  const onScroll = () => {
    const header = document.querySelector('header');
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const init = () => {
    onScroll();
    const targets = document.querySelectorAll('[data-reveal], [data-stagger], .pd-rule-draw, [data-rule-draw]');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -5% 0px' });
      targets.forEach(el => io.observe(el));
    } else {
      targets.forEach(el => el.classList.add('is-revealed'));
    }

    setTimeout(() => {
      document.querySelectorAll('[data-reveal], [data-stagger], .pd-rule-draw, [data-rule-draw]').forEach(el => el.classList.add('is-revealed'));
    }, 1500);

    const cells = document.querySelectorAll('[data-cell-price], [data-cell-pct], [data-cell-p50], #pdCardP50, #pdCardP10, #pdCardP90, #pdCardChange, #pd-p10, #pd-p50, #pd-p90');
    if (cells.length && 'MutationObserver' in window) {
      const mo = new MutationObserver((mutations) => {
        mutations.forEach(m => {
          const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
          if (el && el.animate && el.textContent.trim() !== '—') {
            el.animate([
              { opacity: 0.35, transform: 'translateY(4px)' },
              { opacity: 1, transform: 'translateY(0)' }
            ], { duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
          }
        });
      });
      cells.forEach(c => mo.observe(c, { childList: true, characterData: true, subtree: true }));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
