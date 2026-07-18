/* ==========================================================================
   modelosDB.js — Búsqueda PROFUNDA de modelos de equipos
   1) Busca en nuestra base de datos local (EquipoDB, IndexedDB): coincidencia
      exacta y difusa (sin guiones/espacios, por prefijo).
   2) Si no hay resultado, busca en el catálogo interno de series comunes del
      mercado español. Los datos del catálogo son ORIENTATIVOS (tipo de
      aparato, refrigerante, dispositivo de expansión, carga base, longitud
      sin recarga, g/m y diámetros de tubo típicos de cada serie): SIEMPRE
      prevalecen la placa y el manual del fabricante.
   ========================================================================== */
(function (global) {
  'use strict';

  const norm = s => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

  /* Catálogo de series. Las regex se aplican sobre el modelo NORMALIZADO
     (mayúsculas, sin guiones ni espacios). cargas = g por tamaño nominal. */
  const SERIES = [
    // ---- Mitsubishi Electric ----
    { re: /(MSZ|MUZ)(AP|AY|EF|LN|HR|BT|FT)(\d{2})/, fab: 'Mitsubishi Electric', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 7, gm: 20, tl: 6.35, tg: 9.52, cargas: { 25: 700, 35: 800, 42: 1150, 50: 1450, 60: 1450, 71: 1800 } },
    { re: /(MSZ|MUZ)(SF|GF|GE|DM)(\d{2})/, fab: 'Mitsubishi Electric', tipo: 'Split pared', ref: 'R410A', disp: 'eev',
      free: 7, gm: 20, tl: 6.35, tg: 9.52, cargas: { 25: 800, 35: 1150, 42: 1150, 50: 1450 } },
    { re: /(SLZ|PLA)(M|ZM)?(\d{2})/, fab: 'Mitsubishi Electric', tipo: 'Cassette', ref: 'R32', disp: 'eev',
      free: 30, gm: null, tl: 6.35, tg: 12.7, cargas: null },
    { re: /(SEZ|PEAD)(M|ZM)?(\d{2})/, fab: 'Mitsubishi Electric', tipo: 'Conductos', ref: 'R32', disp: 'eev',
      free: 30, gm: null, tl: 6.35, tg: 12.7, cargas: null },
    { re: /(PUMY|PURY|PUHY)(P|SP)?(\d{2,3})/, fab: 'Mitsubishi Electric', tipo: 'VRF', ref: 'R410A', disp: 'eev',
      free: 0, gm: null, tl: 9.52, tg: 15.88, cargas: null },
    { re: /(PUZ|SUZ)(WM|SWM)(\d{2})/, fab: 'Mitsubishi Electric (Ecodan)', tipo: 'Aerotermia', ref: 'R32', disp: 'eev',
      free: 10, gm: null, tl: 6.35, tg: 15.88, cargas: null },
    { re: /PUHZ(SW|SHW|W)?(\d{2})/, fab: 'Mitsubishi Electric (Ecodan)', tipo: 'Aerotermia', ref: 'R410A', disp: 'eev',
      free: 10, gm: null, tl: 9.52, tg: 15.88, cargas: null },

    // ---- Daikin ----
    { re: /(FTXM|RXM|ATXM|ARXM|FTXA|RXA|FTXJ|RXJ|FTXC|RXC|ATXC|ARXC|FTXF|RXF|FTXP|RXP)(\d{2})/, fab: 'Daikin', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 10, gm: 20, tl: 6.35, tg: 9.52, cargas: { 20: 760, 25: 760, 35: 760, 42: 1150, 50: 1300, 60: 1450, 71: 1620 } },
    { re: /(FTXS|RXS|FTXB|RXB)(\d{2})/, fab: 'Daikin', tipo: 'Split pared', ref: 'R410A', disp: 'eev',
      free: 10, gm: 20, tl: 6.35, tg: 9.52, cargas: { 25: 1000, 35: 1050, 42: 1450, 50: 1450 } },
    { re: /(FCAG|FFA|FCAHG)(\d{2})/, fab: 'Daikin', tipo: 'Cassette', ref: 'R32', disp: 'eev',
      free: 30, gm: null, tl: 6.35, tg: 12.7, cargas: null },
    { re: /(FDXM|FBA|ADEA)(\d{2})/, fab: 'Daikin', tipo: 'Conductos', ref: 'R32', disp: 'eev',
      free: 30, gm: null, tl: 6.35, tg: 12.7, cargas: null },
    { re: /RXYQ(\d{1,2})/, fab: 'Daikin', tipo: 'VRF', ref: 'R410A', disp: 'eev',
      free: 0, gm: null, tl: 9.52, tg: 19.05, cargas: null },
    { re: /(ERGA|EHVX|EHBX)(\d{2})/, fab: 'Daikin (Altherma)', tipo: 'Aerotermia', ref: 'R32', disp: 'eev',
      free: 10, gm: null, tl: 6.35, tg: 15.88, cargas: { 4: 1450, 6: 1450, 8: 1900 } },

    // ---- Fujitsu / General ----
    { re: /(ASY|ASYG|AOY|AOYG|ASHG)(\d{2})/, fab: 'Fujitsu', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 15, gm: 20, tl: 6.35, tg: 9.52, cargas: { 9: 750, 12: 900, 25: 750, 35: 900, 14: 1050, 50: 1300, 71: 1700 } },

    // ---- LG ----
    { re: /(S|PC|PM)(\d{2})(ET|EQ|SQ|SK|SJ)/, fab: 'LG', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 7.5, gm: 20, tl: 6.35, tg: 9.52, cargas: { 9: 600, 12: 1100, 18: 1500, 24: 1700 } },

    // ---- Samsung ----
    { re: /AR(\d{2})(TX|RX|AX|NX)/, fab: 'Samsung', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 5, gm: 15, tl: 6.35, tg: 9.52, cargas: { 9: 550, 12: 700, 18: 1200, 24: 1500 } },

    // ---- Panasonic ----
    { re: /(CS|CU|KIT)(TZ|XZ|BZ|FZ|Z)(\d{2})/, fab: 'Panasonic', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 7.5, gm: 10, tl: 6.35, tg: 9.52, cargas: { 20: 780, 25: 870, 35: 940, 42: 1100, 50: 1300, 60: 1450, 71: 1900 } },

    // ---- Toshiba ----
    { re: /RASB?(\d{2})(J2|E2|G3|N4)?(KVG|KVSG|AVG)/, fab: 'Toshiba', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 15, gm: 20, tl: 6.35, tg: 9.52, cargas: { 10: 550, 13: 750, 16: 900, 18: 1000, 22: 1100, 24: 1350 } },

    // ---- Mitsubishi Heavy Industries ----
    { re: /SRK(\d{2})Z/, fab: 'Mitsubishi Heavy Industries', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 15, gm: 20, tl: 6.35, tg: 9.52, cargas: { 20: 750, 25: 900, 35: 1100, 50: 1400 } },

    // ---- Haier ----
    { re: /AS(\d{2})(TAD|PBA|FBA|HRA|TAL)/, fab: 'Haier', tipo: 'Split pared', ref: 'R32', disp: 'eev',
      free: 5, gm: 16, tl: 6.35, tg: 9.52, cargas: { 25: 500, 35: 600, 50: 1150, 68: 1400 } }
  ];

  // Capacidad nominal: último grupo de captura numérico de la regex.
  function capDe(m) {
    for (let i = m.length - 1; i >= 1; i--) {
      if (/^\d+$/.test(m[i] || '')) return parseInt(m[i], 10);
    }
    return null;
  }

  function buscarCatalogo(modelo) {
    const nm = norm(modelo);
    if (nm.length < 3) return null;
    for (const s of SERIES) {
      const m = nm.match(s.re);
      if (!m) continue;
      const cap = capDe(m);
      return {
        modelo: (modelo || '').toString().trim().toUpperCase(),
        fabricante: s.fab,
        tipoMaquina: s.tipo,
        refrigerante: s.ref,
        dispositivo: s.disp,
        cargaBase: (s.cargas && cap != null && s.cargas[cap] != null) ? s.cargas[cap] : null,
        longitudSinRecarga: (s.free != null) ? s.free : null,
        gPorMetro: (s.gm != null) ? s.gm : null,
        tuboLiq: s.tl || null,
        tuboGas: s.tg || null,
        fuente: 'catalogo'
      };
    }
    return null;
  }

  // Ficha por unidad interior a partir del catálogo (tipo de aparato,
  // refrigerante y dispositivo de cada modelo interior indicado).
  function unidadesDesdeCatalogo(modelosInt) {
    const out = {};
    (modelosInt || []).forEach((mod, i) => {
      const f = mod ? buscarCatalogo(mod) : null;
      if (f) out[i] = { tipo: f.tipoMaquina, refrigerante: f.refrigerante, dispositivo: f.dispositivo };
    });
    return out;
  }

  /* Búsqueda profunda: EquipoDB (exacta + difusa) y después catálogo.
     Devuelve { origen:'local'|'catalogo', ficha, porUnidad } o null.       */
  async function buscarProfunda(modeloExt, modelosInt) {
    const todos = [modeloExt].concat(modelosInt || []).map(x => (x || '').trim()).filter(Boolean);
    if (!todos.length) return null;

    // 1) Nuestra base de datos local
    try {
      const guardados = await global.EquipoDB.listar();
      for (const mod of todos) {
        const nm = norm(mod);
        if (nm.length < 3) continue;
        const hit = guardados.find(r => [r.modelo, r.modeloInterior, r.modeloExterior].some(x => {
          const nx = norm(x);
          if (!nx) return false;
          return nx === nm || (nm.length >= 5 && (nx.startsWith(nm) || nm.startsWith(nx)));
        }));
        if (hit) return { origen: 'local', ficha: hit, porUnidad: unidadesDesdeCatalogo(modelosInt) };
      }
    } catch (e) { /* IndexedDB no disponible: seguir con el catálogo */ }

    // 2) Catálogo interno de series
    for (const mod of todos) {
      const f = buscarCatalogo(mod);
      if (f) return { origen: 'catalogo', ficha: f, porUnidad: unidadesDesdeCatalogo(modelosInt) };
    }
    return null;
  }

  global.ModelosDB = { buscarProfunda, buscarCatalogo, norm };
})(window);
