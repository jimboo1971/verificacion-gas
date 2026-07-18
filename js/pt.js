/* ==========================================================================
   pt.js — Motor Presión/Temperatura
   Carga tablas de refrigerantes e interpola temperatura de saturación.
   Todas las tablas usan PRESIÓN ABSOLUTA en bar.
   ========================================================================== */
(function (global) {
  'use strict';

  const LISTA = ["R32","R410A","R134a","R407C","R290","R404A","R448A",
                 "R449A","R452A","R454B","R513A","R1234yf","R1234ze"];

  const cache = {};          // { R32: {…json…}, ... }
  const PRESION_ATM = 1.01325; // bar, para pasar relativa <-> absoluta

  /* ---- Conversión de unidades de PRESIÓN a bar ABSOLUTOS ---------------- */
  // Los manómetros de campo dan presión RELATIVA (manométrica).
  function aBarAbs(valor, unidad, esRelativa) {
    let bar;
    switch (unidad) {
      case 'bar': bar = valor; break;
      case 'psi': bar = valor * 0.0689475729; break;
      case 'kPa': bar = valor / 100; break;
      case 'MPa': bar = valor * 10; break;
      default:    bar = valor;
    }
    return esRelativa ? bar + PRESION_ATM : bar;
  }

  /* ---- Carga de una tabla (fetch del JSON, con cache) ------------------- */
  async function cargar(ref) {
    if (cache[ref]) return cache[ref];
    const resp = await fetch('refrigerants/' + ref + '.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('No se pudo cargar la tabla de ' + ref);
    const data = await resp.json();
    cache[ref] = data;
    return data;
  }

  function precargarTodos() {
    return Promise.allSettled(LISTA.map(cargar));
  }

  /* ---- Interpolación lineal de temperatura de saturación --------------- */
  // campo = 'bubble' | 'dew'
  function interpolar(tabla, barAbs, campo) {
    const t = tabla.table;
    if (barAbs <= t[0].p) return { temp: t[0][campo], extrapolado: barAbs < t[0].p };
    const ult = t[t.length - 1];
    if (barAbs >= ult.p) return { temp: ult[campo], extrapolado: barAbs > ult.p };
    for (let i = 0; i < t.length - 1; i++) {
      const a = t[i], b = t[i + 1];
      if (barAbs >= a.p && barAbs <= b.p) {
        const f = (barAbs - a.p) / (b.p - a.p);
        return { temp: a[campo] + (b[campo] - a[campo]) * f, extrapolado: false };
      }
    }
    return { temp: null, extrapolado: true };
  }

  /* ---- API pública: temperatura de saturación -------------------------- */
  // Para SUPERHEAT (evaporador) -> usar DEW point.
  // Para SUBCOOLING (condensador) -> usar BUBBLE point.
  function tSaturacion(ref, barAbs, campo) {
    const tabla = cache[ref];
    if (!tabla) throw new Error('Tabla no cargada: ' + ref);
    return interpolar(tabla, barAbs, campo);
  }

  function meta(ref) { return cache[ref] || null; }

  /* ---- Inversa: presión de saturación (bar abs) para una temperatura ----
     campo = 'bubble' | 'dew'. Interpolación lineal sobre la misma tabla.   */
  function pDe(ref, tempC, campo) {
    const tabla = cache[ref];
    if (!tabla) throw new Error('Tabla no cargada: ' + ref);
    const t = tabla.table;
    if (tempC <= t[0][campo]) return t[0].p;
    const ult = t[t.length - 1];
    if (tempC >= ult[campo]) return ult.p;
    for (let i = 0; i < t.length - 1; i++) {
      const a = t[i], b = t[i + 1];
      if (tempC >= a[campo] && tempC <= b[campo]) {
        const f = (tempC - a[campo]) / (b[campo] - a[campo]);
        return a.p + (b.p - a.p) * f;
      }
    }
    return NaN;
  }

  global.PT = {
    LISTA, PRESION_ATM, aBarAbs, cargar, precargarTodos,
    tSaturacion, meta, pDe,
    tDew:    (ref, bar) => tSaturacion(ref, bar, 'dew'),
    tBubble: (ref, bar) => tSaturacion(ref, bar, 'bubble')
  };
})(window);
