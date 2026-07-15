/* ==========================================================================
   charge.js — Calculadora de carga de refrigerante
   1) Carga NOMINAL  = base fábrica + Σ(metros extra × g/m)   -> CÁLCULO EXACTO
   2) Desvío estimado (faltan/sobran gramos)                  -> ESTIMACIÓN
   Los g/m dependen del diámetro de la línea de LÍQUIDO y de la densidad
   del refrigerante líquido. Los valores por defecto son orientativos:
   SIEMPRE prevalece la tabla del fabricante del equipo.
   ========================================================================== */
(function (global) {
  'use strict';

  /* Volumen interno de tubo de cobre por metro (litros/m = dm³/m).
     Diámetros nominales frigoríficos con espesor de pared habitual. */
  const TUBO = [
    { pulg: '1/4"',  mm: 6.35,  di: 4.75,  lpm: 0.0177 },
    { pulg: '5/16"', mm: 7.94,  di: 6.34,  lpm: 0.0316 },
    { pulg: '3/8"',  mm: 9.52,  di: 7.92,  lpm: 0.0493 },
    { pulg: '1/2"',  mm: 12.70, di: 10.92, lpm: 0.0937 },
    { pulg: '5/8"',  mm: 15.88, di: 13.84, lpm: 0.1504 },
    { pulg: '3/4"',  mm: 19.05, di: 16.56, lpm: 0.2154 },
    { pulg: '7/8"',  mm: 22.22, di: 19.74, lpm: 0.3061 },
    { pulg: '1.1/8"',mm: 28.58, di: 25.60, lpm: 0.5147 }
  ];

  /* Densidad del líquido (kg/dm³) a ~30-40 °C en línea de líquido.
     Se usa para estimar g/m cuando el fabricante no da tabla. */
  const DENS = {
    R410A: 0.98, R32: 0.90, R134a: 1.15, R407C: 1.10, R290: 0.47,
    R404A: 0.99, R448A: 1.06, R449A: 1.06, R452A: 1.06, R454B: 0.94,
    R513A: 1.08, R1234yf: 1.05, R1234ze: 1.11
  };

  /* g/m estimados = litros/m × densidad(kg/dm³) × 1000 */
  function gPorMetro(mm, ref) {
    const t = TUBO.find(x => Math.abs(x.mm - mm) < 0.2);
    if (!t) return null;
    const d = DENS[ref] || 1.0;
    return t.lpm * d * 1000;
  }

  function tabla(ref) {
    return TUBO.map(t => ({ ...t, gm: +(t.lpm * (DENS[ref] || 1) * 1000).toFixed(1) }));
  }

  /* ---------- 1) CARGA NOMINAL (exacta, fórmula del fabricante) ---------- */
  /*  cfg = { base:g, free:m, tramos:[{mm, len, gm?}], ref, extraUds:g }      */
  function nominal(cfg) {
    const base = parseFloat(cfg.base);
    if (isNaN(base)) return null;

    const free = parseFloat(cfg.free) || 0;
    const tramos = (cfg.tramos || []).map(t => {
      const gm = (t.gm != null && !isNaN(t.gm)) ? +t.gm : gPorMetro(t.mm, cfg.ref);
      return { ...t, gm, gramos: (parseFloat(t.len) || 0) * (gm || 0) };
    });

    const metrosTotal = tramos.reduce((s, t) => s + (parseFloat(t.len) || 0), 0);

    // Los metros "gratis" se descuentan del tramo de mayor diámetro hacia abajo,
    // pero de forma simple y transparente: se descuentan proporcionalmente.
    let extra = 0;
    if (free > 0 && metrosTotal > 0) {
      const factor = Math.max(0, (metrosTotal - free)) / metrosTotal;
      extra = tramos.reduce((s, t) => s + t.gramos * factor, 0);
    } else {
      extra = tramos.reduce((s, t) => s + t.gramos, 0);
    }

    const extraUds = parseFloat(cfg.extraUds) || 0;   // ajuste por nº uds. interiores (VRF)
    const total = base + extra + extraUds;

    return { base, free, metrosTotal, tramos, extra, extraUds, total };
  }

  /* ---------- 2) DESVÍO ESTIMADO (aproximado, NO exacto) ---------- */
  /*  Heurística de campo: el desvío de SC (TXV/EEV) o SH (capilar) respecto
      del objetivo se traduce en % de carga. ~3-4 % de carga por K de desvío.
      Se devuelve SIEMPRE un RANGO, nunca un valor único: la carga real solo
      se conoce pesando.                                                       */
  function desvio(calc, diag, dispositivo, cargaNominal, esVRF) {
    const u = diag.umbrales;
    let dir = null, kDesvio = 0, param = '';

    if (dispositivo === 'capilar') {
      param = 'recalentamiento';
      const objetivo = (u.shBajo + u.shAlto) / 2;
      if (calc.superheat > u.shAlto) { dir = 'falta'; kDesvio = calc.superheat - objetivo; }
      else if (calc.superheat < u.shBajo) { dir = 'sobra'; kDesvio = objetivo - calc.superheat; }
    } else {
      param = 'subenfriamiento';
      const objetivo = (u.scBajo + u.scAlto) / 2;   // ~8 K
      if (calc.subcooling < u.scBajo) { dir = 'falta'; kDesvio = objetivo - calc.subcooling; }
      else if (calc.subcooling > u.scAlto) { dir = 'sobra'; kDesvio = calc.subcooling - objetivo; }
    }

    if (!dir) return { dir: null, texto: 'Carga dentro de rango: no se estima desvío.' };

    // VRF/multisplit: una sola lectura no representa el circuito -> sin gramos.
    if (esVRF) {
      return {
        dir, param, esVRF: true,
        texto: 'Tendencia: ' + (dir === 'falta' ? 'FALTA' : 'SOBRA') +
               ' carga. En VRF/multisplit no se estiman gramos con una sola lectura: ' +
               'usa el modo de comprobación de carga del fabricante.'
      };
    }

    // % estimado: ~3,5 %/K, con rango ±30 % del propio valor, tope 40 %.
    const pct = Math.min(40, kDesvio * 3.5);
    const pctMin = Math.max(2, pct * 0.7), pctMax = Math.min(50, pct * 1.3);

    const r = { dir, param, kDesvio, pctMin, pctMax };
    if (cargaNominal) {
      r.gMin = Math.round(cargaNominal * pctMin / 100 / 10) * 10;
      r.gMax = Math.round(cargaNominal * pctMax / 100 / 10) * 10;
      r.texto = (dir === 'falta' ? 'Faltan' : 'Sobran') + ' aproximadamente ' +
                r.gMin + '–' + r.gMax + ' g (' + pctMin.toFixed(0) + '–' + pctMax.toFixed(0) +
                ' % de ' + Math.round(cargaNominal) + ' g nominales).';
    } else {
      r.texto = (dir === 'falta' ? 'Falta' : 'Sobra') + ' aproximadamente ' +
                pctMin.toFixed(0) + '–' + pctMax.toFixed(0) +
                ' % de carga. Introduce la carga base de fábrica para estimar los gramos.';
    }
    return r;
  }

  global.Charge = { TUBO, DENS, gPorMetro, tabla, nominal, desvio };
})(window);
