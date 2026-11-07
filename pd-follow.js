/**
 * PerData - Campana de seguimiento: seguir una empresa y elegir su aviso.
 * Se carga con <script src="/pd-follow.js" defer>. Expone window.PD_Follow.bind(mount, symbol, opts).
 * opts.precio (opcional): último cierre conocido, usado como precio de referencia del aviso por porcentaje.
 */
(function () {
  "use strict";

  var cache = null; // { simbolos: {SYM: fila}, permitido: bool, limite: number }
  var precios = {}; // { SYM: último cierre } resuelto a demanda desde /api/historical
  var sinSesion = false;
  var abierto = null; // { panel, mount, symbol }

  function authApi() { return window.MDE_Auth || null; }

  function token() {
    var a = authApi();
    return a && a.getToken ? a.getToken() : null;
  }

  function usuario() {
    var a = authApi();
    return a && a.getUser ? a.getUser() : null;
  }

  function cabeceras(json) {
    var h = {};
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  function cargar() {
    if (cache) return Promise.resolve(cache);
    if (!token()) { sinSesion = true; return Promise.resolve(null); }
    return fetch("/api/seguimiento", { headers: cabeceras(false), cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) { sinSesion = true; return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return null;
        var mapa = {};
        (data.simbolos || []).forEach(function (fila) { mapa[fila.simbolo] = fila; });
        cache = { simbolos: mapa, permitido: data.permitido !== false, limite: data.limite || 0 };
        return cache;
      })
      .catch(function () { return null; });
  }

  function guardar(symbol, cuerpo) {
    return fetch("/api/seguimiento", {
      method: "POST",
      headers: cabeceras(true),
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      if (r.ok) return r.json().then(function (d) { return { ok: true, data: d }; });
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: false, status: r.status, data: d }; });
    }).catch(function () { return { ok: false, status: 0, data: {} }; });
  }

  function soltar(symbol) {
    return fetch("/api/seguimiento?simbolo=" + encodeURIComponent(symbol), {
      method: "DELETE",
      headers: cabeceras(false)
    }).then(function (r) {
      if (r.ok) return r.json().then(function (d) { return { ok: true, data: d }; });
      return { ok: false, status: r.status, data: {} };
    }).catch(function () { return { ok: false, status: 0, data: {} }; });
  }

  // Último cierre publicado para un símbolo. Se usa como precio de referencia del aviso
  // por porcentaje cuando el panel se abre desde el buscador, donde no hay precio a la vista.
  function ultimoCierre(symbol) {
    if (precios[symbol] !== undefined) return Promise.resolve(precios[symbol]);
    return fetch("/api/historical?symbol=" + encodeURIComponent(symbol) + "&range=1mo&interval=1d", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var serie = (d && d.series) || [];
        var cierre = null;
        for (var i = serie.length - 1; i >= 0; i--) {
          var c = Number(serie[i].close);
          if (Number.isFinite(c) && c > 0) { cierre = c; break; }
        }
        precios[symbol] = cierre;
        return cierre;
      })
      .catch(function () { precios[symbol] = null; return null; });
  }

  function aplicarCache(symbol, fila) {
    if (!cache) cache = { simbolos: {}, permitido: true, limite: 0 };
    if (fila) cache.simbolos[symbol] = fila;
    else delete cache.simbolos[symbol];
  }

  function icono(activo) {
    var relleno = activo ? ' fill="currentColor"' : ' fill="none"';
    return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"' + relleno +
      ' stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
      '<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  }

  function pintarEstado(btn, activo) {
    btn.dataset.on = activo ? "true" : "false";
    btn.setAttribute("aria-pressed", activo ? "true" : "false");
    btn.innerHTML = icono(activo);
  }

  function cerrar() {
    if (!abierto) return;
    if (abierto.panel && abierto.panel.parentNode) abierto.panel.parentNode.removeChild(abierto.panel);
    abierto = null;
  }

  function abrir(mount, btn, symbol, opts) {
    cerrar();
    var panel = document.createElement("div");
    panel.className = "pd-bell-panel";
    var idBase = "pdBell_" + symbol.replace(/[^A-Za-z0-9]/g, "");
    panel.innerHTML =
      '<p class="pd-bell-title">Avisarme de ' + escapar(symbol) + "</p>" +
      '<label class="pd-bell-row"><input type="checkbox" id="' + idBase + '_diaria" checked> Recibir cada mañana en el boletín</label>' +
      '<p class="pd-bell-ref tnum"></p>' +
      '<div class="pd-bell-sep"></div>' +
      '<label class="pd-bell-row"><input type="radio" name="' + idBase + '" value="sin" checked> Sin aviso de precio</label>' +
      '<label class="pd-bell-row"><input type="radio" name="' + idBase + '" value="bajar"> Avisar si baja un ' +
        '<input type="number" min="1" max="90" step="1" class="tnum" id="' + idBase + '_baja"> %</label>' +
      '<label class="pd-bell-row"><input type="radio" name="' + idBase + '" value="subir"> Avisar si sube un ' +
        '<input type="number" min="1" max="90" step="1" class="tnum" id="' + idBase + '_sube"> %</label>' +
      '<div class="pd-bell-acciones">' +
        '<button type="button" class="pd-btn pd-btn-accent pd-bell-guardar">Guardar</button>' +
        '<button type="button" class="pd-btn pd-btn-ghost pd-bell-soltar" hidden>Dejar de seguir</button>' +
      "</div>" +
      '<p class="pd-bell-status" role="status"></p>';

    mount.appendChild(panel);
    abierto = { panel: panel, mount: mount, symbol: symbol };

    var estado = panel.querySelector(".pd-bell-status");
    var chkDiaria = panel.querySelector("#" + idBase + "_diaria");
    var baja = panel.querySelector("#" + idBase + "_baja");
    var sube = panel.querySelector("#" + idBase + "_sube");
    var btnSoltar = panel.querySelector(".pd-bell-soltar");

    var referencia = opts && Number(opts.precio) > 0 ? Number(opts.precio) : null;
    var lineaRef = panel.querySelector(".pd-bell-ref");

    function pintaReferencia() {
      if (!lineaRef) return;
      lineaRef.textContent = referencia
        ? "Referencia: " + referencia.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : "Sin precio de referencia disponible.";
    }

    if (!referencia) {
      ultimoCierre(symbol).then(function (c) {
        if (c) { referencia = c; pintaReferencia(); }
      });
    }
    pintaReferencia();

    var siguiendo = !!(cache && cache.simbolos[symbol]);
    if (siguiendo) {
      var fila = cache.simbolos[symbol];
      if (fila.alerta_diaria === false) chkDiaria.checked = false;
      if (fila.alerta_pct_abajo) {
        panel.querySelector('input[value="bajar"]').checked = true;
        baja.value = fila.alerta_pct_abajo;
      } else if (fila.alerta_pct_arriba) {
        panel.querySelector('input[value="subir"]').checked = true;
        sube.value = fila.alerta_pct_arriba;
      }
      btnSoltar.hidden = false;
    }

    panel.querySelector(".pd-bell-guardar").addEventListener("click", function () {
      var elegido = panel.querySelector('input[name="' + idBase + '"]:checked');
      var modo = elegido ? elegido.value : "sin";
      var pctBaja = modo === "bajar" ? Number(baja.value) : null;
      var pctSube = modo === "subir" ? Number(sube.value) : null;
      if (modo === "bajar" && (!Number.isFinite(pctBaja) || pctBaja <= 0 || pctBaja > 90)) {
        estado.textContent = "Escribe un porcentaje entre 1 y 90.";
        return;
      }
      if (modo === "subir" && (!Number.isFinite(pctSube) || pctSube <= 0 || pctSube > 90)) {
        estado.textContent = "Escribe un porcentaje entre 1 y 90.";
        return;
      }
      var precio = referencia;
      if (modo !== "sin" && !precio) {
        estado.innerHTML = 'Esta empresa no tiene precio de mercado, así que no podemos calcular el porcentaje. ' +
          'Puedes recibirla igualmente cada mañana en el <a href="/boletin">boletín</a>.';
        return;
      }
      estado.textContent = "Guardando...";
      guardar(symbol, {
        simbolo: symbol,
        alerta_diaria: chkDiaria.checked,
        alerta_pct_arriba: pctSube,
        alerta_pct_abajo: pctBaja,
        precio_base: precio
      }).then(function (r) {
        if (r.ok) {
          aplicarCache(symbol, {
            simbolo: symbol,
            alerta_diaria: chkDiaria.checked,
            alerta_pct_arriba: pctSube,
            alerta_pct_abajo: pctBaja,
            precio_base: precio
          });
          pintarEstado(btn, true);
          cerrar();
          return;
        }
        if (r.status === 403 && r.data && r.data.code === "plan_required") {
          estado.innerHTML = 'Las empresas que sigues son parte del plan Boletín. <a href="/precios">Ver planes</a>';
          return;
        }
        if (r.status === 401) {
          estado.textContent = "Tu sesión caducó; entra de nuevo.";
          return;
        }
        estado.textContent = (r.data && r.data.error) || "No se pudo guardar. Inténtalo otra vez.";
      });
    });

    btnSoltar.addEventListener("click", function () {
      estado.textContent = "Quitando...";
      soltar(symbol).then(function (r) {
        if (r.ok) {
          aplicarCache(symbol, null);
          pintarEstado(btn, false);
          cerrar();
          return;
        }
        if (r.status === 403) {
          estado.innerHTML = 'Las empresas que sigues son parte del plan Boletín. <a href="/precios">Ver planes</a>';
          return;
        }
        estado.textContent = "No se pudo quitar. Inténtalo otra vez.";
      });
    });
  }

  function escapar(texto) {
    return String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  document.addEventListener("mousedown", function (ev) {
    if (!abierto) return;
    if (abierto.panel.contains(ev.target)) return;
    if (abierto.mount.contains(ev.target)) return;
    cerrar();
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") cerrar();
  });

  function bind(mount, symbol, opts) {
    if (!mount || !symbol || mount.dataset.pdBellListo === "1") return;
    mount.dataset.pdBellListo = "1";
    mount.classList.add("pd-bell-slot");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pd-bell";
    btn.setAttribute("aria-label", "Avisos de " + symbol);
    btn.setAttribute("aria-pressed", "false");
    btn.dataset.on = "false";
    btn.dataset.symbol = symbol;
    btn.innerHTML = icono(false);
    mount.appendChild(btn);

    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (sinSesion || !usuario()) {
        var a = authApi();
        if (a && a.openModal) a.openModal();
        return;
      }
      cargar().then(function (estado) {
        if (abierto && abierto.symbol === symbol) { cerrar(); return; }
        if (estado && estado.permitido === false) {
          var panel = document.createElement("div");
          panel.className = "pd-bell-panel";
          panel.innerHTML = '<p class="pd-bell-row">Las empresas que sigues son parte del plan Boletín.</p>' +
            '<p class="pd-bell-row"><a href="/precios">Ver planes</a></p>';
          mount.appendChild(panel);
          abierto = { panel: panel, mount: mount, symbol: symbol };
          return;
        }
        abrir(mount, btn, symbol, opts || {});
      });
    });

    cargar().then(function (estado) {
      if (estado && estado.permitido !== false && estado.simbolos[symbol]) pintarEstado(btn, true);
    });
  }

  window.PD_Follow = { bind: bind, cerrar: cerrar };
})();
