/**
 * PerData — Página /entrar (Login, Registro y Recuperación a pantalla completa)
 * Sustituye al modal de autenticación.
 */
(function(window, document) {
  'use strict';

  function validateVolver(raw) {
    if (!raw || typeof raw !== 'string') return '/';

    function isInvalid(str) {
      if (!str || typeof str !== 'string') return true;
      // Rechazar cualquier carácter de control o espacio antes de las otras comprobaciones
      // (el navegador quita tabuladores y saltos: «/\t/evil.com» se volvería «//evil.com»)
      if (/[\u0000- \u007f]/.test(str)) return true;
      if (!str.startsWith('/') || str.startsWith('//') || str.includes('\\') || str.includes(':')) {
        return true;
      }
      return false;
    }

    // 1. Comprobaciones sobre raw antes de decodificar
    if (isInvalid(raw)) return '/';

    // Rechazar cadenas con secuencias codificadas peligrosas
    const lower = raw.toLowerCase();
    if (lower.includes('/%2f') || lower.includes('/%5c')) return '/';

    // 2. Descodificar una vez con decodeURIComponent en try/catch y repetir las comprobaciones
    let decoded;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return '/';
    }

    if (isInvalid(decoded)) return '/';
    const decodedLower = decoded.toLowerCase();
    if (decodedLower.includes('/%2f') || decodedLower.includes('/%5c')) return '/';

    return raw;
  }

  if (typeof window !== 'undefined') {
    window.validateVolver = validateVolver;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateVolver };
  }

  const params = new URLSearchParams(window.location ? window.location.search : '');
  const volver = validateVolver(params.get('volver'));
  let currentMode = 'signin';
  const rawModo = (params.get('modo') || '').toLowerCase();
  if (rawModo === 'registro' || rawModo === 'signup') {
    currentMode = 'signup';
  } else if (rawModo === 'recuperar' || rawModo === 'recover') {
    currentMode = 'recover';
  }

  let isGoogleAvailable = false;

  function setStatus(msg, kind) {
    const el = document.getElementById('pdAuthStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'pd-form-status' + (kind ? ' is-' + kind : '');
  }

  function setMode(mode, updateUrl = true) {
    currentMode = mode;

    if (updateUrl) {
      const p = new URLSearchParams(window.location.search);
      if (mode === 'signup') p.set('modo', 'registro');
      else if (mode === 'recover') p.set('modo', 'recuperar');
      else p.delete('modo');
      p.set('volver', volver);
      const qs = p.toString();
      const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }

    const tabs = document.getElementById('pdAuthTabs');
    const tabSignIn = document.getElementById('pdTabSignIn');
    const tabSignUp = document.getElementById('pdTabSignUp');
    const title = document.getElementById('pdAuthTitle');
    const groupName = document.getElementById('pdGroupName');
    const groupPw = document.getElementById('pdGroupPassword');
    const forgot = document.getElementById('pdForgot');
    const backToLogin = document.getElementById('pdBackToLogin');
    const legal = document.getElementById('pdAuthLegal');
    const submit = document.getElementById('pdAuthSubmit');
    const pwInput = document.getElementById('pdAuthPassword');
    const promptEl = document.getElementById('pdAuthPrompt');
    const googleWrap = document.getElementById('pdGoogleWrap');
    const forgotBtn = document.getElementById('pdForgotBtn');
    const backBtn = document.getElementById('pdBackToLoginBtn');

    if (forgotBtn) {
      forgotBtn.href = '/entrar?modo=recuperar&volver=' + encodeURIComponent(volver);
    }
    if (backBtn) {
      backBtn.href = '/entrar?volver=' + encodeURIComponent(volver);
    }

    setStatus('');

    if (mode === 'signup') {
      if (tabs) tabs.hidden = false;
      if (tabSignIn) tabSignIn.setAttribute('aria-selected', 'false');
      if (tabSignUp) tabSignUp.setAttribute('aria-selected', 'true');
      if (title) title.textContent = 'Crea tu cuenta gratuita';
      if (groupName) groupName.hidden = false;
      if (groupPw) groupPw.hidden = false;
      if (forgot) forgot.hidden = true;
      if (backToLogin) backToLogin.hidden = true;
      if (legal) legal.hidden = false;
      if (pwInput) {
        pwInput.autocomplete = 'new-password';
        pwInput.placeholder = 'Mínimo 8 caracteres';
        pwInput.required = true;
      }
      if (submit) submit.textContent = 'Crear cuenta';
      if (promptEl) promptEl.hidden = true;
      if (googleWrap && isGoogleAvailable) googleWrap.hidden = false;
    } else if (mode === 'recover') {
      if (tabs) tabs.hidden = true;
      if (title) title.textContent = 'Recuperar contraseña';
      if (groupName) groupName.hidden = true;
      if (groupPw) groupPw.hidden = true;
      if (forgot) forgot.hidden = true;
      if (backToLogin) backToLogin.hidden = false;
      if (legal) legal.hidden = true;
      if (pwInput) pwInput.required = false;
      if (submit) submit.textContent = 'Enviar enlace de recuperación';
      if (promptEl) {
        promptEl.textContent = 'Escribe tu correo para recibir un enlace de recuperación.';
        promptEl.hidden = false;
      }
      if (googleWrap) googleWrap.hidden = true;
    } else {
      // signin
      if (tabs) tabs.hidden = false;
      if (tabSignIn) tabSignIn.setAttribute('aria-selected', 'true');
      if (tabSignUp) tabSignUp.setAttribute('aria-selected', 'false');
      if (title) title.textContent = 'Inicia sesión en PerData';
      if (groupName) groupName.hidden = true;
      if (groupPw) groupPw.hidden = false;
      if (forgot) forgot.hidden = false;
      if (backToLogin) backToLogin.hidden = true;
      if (legal) legal.hidden = true;
      if (pwInput) {
        pwInput.autocomplete = 'current-password';
        pwInput.placeholder = 'Tu contraseña';
        pwInput.required = true;
      }
      if (submit) submit.textContent = 'Iniciar sesión';
      if (promptEl) promptEl.hidden = true;
      if (googleWrap && isGoogleAvailable) googleWrap.hidden = false;
    }
  }

  function consumeOAuthReturn() {
    if (!window.location.hash) return;
    const h = new URLSearchParams(window.location.hash.slice(1));
    const token = h.get('access_token');
    const error = h.get('error');
    if (!token && !error) return;

    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    if (error) {
      setStatus('No se pudo entrar con Google. Prueba otra vez o usa tu correo.', 'error');
      return;
    }

    setStatus('Verificando acceso con Google…');
    fetch('/api/auth', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.user) {
          const auth = window.PDAuth || window.MacroAuth || window.MDE_Auth;
          if (auth && auth.setSession) {
            auth.setSession({ user: data.user, access_token: token });
          } else {
            localStorage.setItem('mde_auth_session', JSON.stringify({ user: data.user, access_token: token }));
          }
          setStatus('Sesión iniciada. Redirigiendo…', 'ok');
          setTimeout(() => {
            window.location.href = volver;
          }, 300);
        } else {
          setStatus('No se pudo entrar con Google. Prueba otra vez o usa tu correo.', 'error');
        }
      })
      .catch(() => {
        setStatus('Error de conexión al verificar Google. Intenta de nuevo.', 'error');
      });
  }

  // Link from the sign-up email: /entrar?confirmar=<token>. Exchanges it for a session, like a sign-in.
  async function confirmSignupLink(token) {
    setStatus('Confirmando tu correo…');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', token })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success || !d.token) {
        setStatus(d.error || 'El enlace no es válido o ya venció. Regístrate de nuevo con el mismo correo y te enviamos otro.', 'error');
        return;
      }
      const auth = window.PDAuth || window.MacroAuth || window.MDE_Auth;
      if (auth && auth.setSession) {
        auth.setSession({ user: d.user, access_token: d.token });
      } else {
        localStorage.setItem('mde_auth_session', JSON.stringify({ user: d.user, access_token: d.token }));
      }
      setStatus('Correo confirmado. Entrando…', 'ok');
      setTimeout(() => {
        window.location.href = volver;
      }, 300);
    } catch (err) {
      setStatus('Error de conexión al confirmar tu correo. Intenta de nuevo.', 'error');
    }
  }

  function setupGoogle() {
    const wrap = document.getElementById('pdGoogleWrap');
    const btn = document.getElementById('pdGoogleBtn');
    if (!wrap || !btn) return;

    const returnUrl = '/entrar?volver=' + encodeURIComponent(volver);
    btn.href = '/api/auth?action=google&next=' + encodeURIComponent(returnUrl);

    fetch('/api/auth?action=providers')
      .then(r => r.json())
      .then(d => {
        isGoogleAvailable = Boolean(d && d.google);
        if (currentMode !== 'recover') {
          wrap.hidden = !isGoogleAvailable;
        }
      })
      .catch(() => {
        isGoogleAvailable = false;
        wrap.hidden = true;
      });
  }

  function initField() {
    const canvas = document.querySelector('.pd-auth-canvas');
    if (canvas && window.PDLoginField) {
      window.PDLoginField.start(canvas);
    }
  }

  function init() {
    const volverLink = document.getElementById('pdVolverLink') || document.getElementById('pdEntrarBack') || document.querySelector('.pd-entrar-back');
    if (volverLink) {
      volverLink.href = volver;
    }

    // Set initial mode
    setMode(currentMode, false);

    // Setup Google auth
    setupGoogle();

    // Consume OAuth hash return if present
    consumeOAuthReturn();

    // Sign-up confirmation link: handled at the end of init, after the page is wired up
    const confirmToken = params.get('confirmar') || '';
    if (confirmToken) {
      const p = new URLSearchParams(window.location.search);
      p.delete('confirmar');
      const qs = p.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }

    // If user is already authenticated and not handling OAuth return, redirect
    const auth = window.PDAuth || window.MacroAuth || window.MDE_Auth;
    if (auth && auth.isAuthenticated && auth.isAuthenticated() && !window.location.hash && !confirmToken) {
      window.location.replace(volver);
      return;
    }

    // Canvas ink field
    initField();

    // Tab buttons
    const tabSignIn = document.getElementById('pdTabSignIn');
    const tabSignUp = document.getElementById('pdTabSignUp');
    if (tabSignIn) tabSignIn.addEventListener('click', () => setMode('signin'));
    if (tabSignUp) tabSignUp.addEventListener('click', () => setMode('signup'));

    // Forgot password & back to login links
    const forgotBtn = document.getElementById('pdForgotBtn');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setMode('recover');
      });
    }

    const backBtn = document.getElementById('pdBackToLoginBtn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setMode('signin');
      });
    }

    // Password toggle
    const togglePw = document.getElementById('pdTogglePw');
    const pwInput = document.getElementById('pdAuthPassword');
    if (togglePw && pwInput) {
      togglePw.addEventListener('click', () => {
        const isPassword = pwInput.type === 'password';
        pwInput.type = isPassword ? 'text' : 'password';
        togglePw.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
        togglePw.classList.toggle('is-on', isPassword);
      });
    }

    // Form submit
    const form = document.getElementById('pdAuthForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('pdAuthEmail');
        const email = (emailInput?.value || '').trim();
        const password = pwInput?.value || '';
        const nameInput = document.getElementById('pdAuthName');
        const name = (nameInput?.value || '').trim();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          setStatus('Ingresa un correo electrónico válido.', 'error');
          if (emailInput) emailInput.focus();
          return;
        }

        const submit = document.getElementById('pdAuthSubmit');

        if (currentMode === 'recover') {
          if (submit) submit.disabled = true;
          setStatus('Enviando enlace…');
          try {
            const res = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'forgot', email })
            });
            const data = await res.json().catch(() => ({}));
            setStatus(
              data.message || (data.success ? 'Te hemos enviado un enlace para restablecer tu contraseña.' : data.error || 'No se pudo enviar el enlace.'),
              data.success ? 'ok' : 'error'
            );
          } catch (err) {
            setStatus('No hay conexión con el servidor. Intenta de nuevo.', 'error');
          } finally {
            if (submit) submit.disabled = false;
          }
          return;
        }

        if (currentMode === 'signup') {
          if (password.length < 8) {
            setStatus('La contraseña debe tener al menos 8 caracteres.', 'error');
            if (pwInput) pwInput.focus();
            return;
          }
          if (submit) submit.disabled = true;
          setStatus('Creando tu cuenta…');
          let res;
          if (auth && auth.signUpWithEmail) {
            res = await auth.signUpWithEmail(email, password, name);
          } else {
            try {
              const r = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'signup', email: email.toLowerCase(), password, name })
              });
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d.success) res = { success: false, error: d.error || 'No se pudo crear la cuenta.' };
              else if (d.pendingConfirmation) res = { success: true, pendingConfirmation: true, message: d.message };
              else res = { success: true, user: d.user, token: d.token };
            } catch (err) {
              res = { success: false, error: 'No hay conexión con el servidor.' };
            }
          }
          if (submit) submit.disabled = false;
          if (!res.success) {
            setStatus(res.error || 'No se pudo crear la cuenta.', 'error');
            return;
          }
          if (res.pendingConfirmation) {
            // No session yet: the person must open the link we emailed
            setStatus(res.message || 'Te enviamos un correo para confirmar tu cuenta.', 'ok');
            return;
          }
          setStatus('Cuenta creada. ¡Bienvenido!', 'ok');
          setTimeout(() => {
            window.location.href = volver;
          }, 350);
          return;
        }

        // signin
        if (!password) {
          setStatus('Ingresa tu contraseña.', 'error');
          if (pwInput) pwInput.focus();
          return;
        }
        if (submit) submit.disabled = true;
        setStatus('Verificando…');
        let res;
        if (auth && auth.signInWithEmail) {
          res = await auth.signInWithEmail(email, password);
        } else {
          try {
            const r = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'signin', email, password })
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.success) res = { success: false, error: d.error || 'Credenciales incorrectas.' };
            else res = { success: true, user: d.user, token: d.token };
          } catch (err) {
            res = { success: false, error: 'No hay conexión con el servidor.' };
          }
        }
        if (submit) submit.disabled = false;
        if (!res.success) {
          setStatus(res.error || 'Credenciales incorrectas.', 'error');
          return;
        }
        setStatus('Sesión iniciada.', 'ok');
        setTimeout(() => {
          window.location.href = volver;
        }, 350);
      });
    }

    // Set initial focus
    setTimeout(() => {
      const first = document.getElementById(currentMode === 'signup' ? 'pdAuthName' : 'pdAuthEmail');
      if (first) first.focus();
    }, 60);

    if (confirmToken) confirmSignupLink(confirmToken);
  }

  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
