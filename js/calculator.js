/* ==========================================================================
   calculator.js — Motor de cálculo termodinámico
   Calcula SH, SC, Tevap, Tcond, lift y ΔT a partir de los datos de entrada.
   Depende de PT (pt.js).
   ========================================================================== */
(function (global) {
  'use strict';

  /*
    entrada = {
      ref, dispositivo,
      pBaja, unidadBaja, relativaBaja,
      pAlta, unidadAlta, relativaAlta,
      tAsp, tLiq, tExt, tInt
    }
  */
  function calcular(entrada) {
    const ref = entrada.ref;

    // Presiones a bar absolutos
    const pBajaAbs = PT.aBarAbs(entrada.pBaja, entrada.unidadBaja, entrada.relativaBaja);
    const pAltaAbs = PT.aBarAbs(entrada.pAlta, entrada.unidadAlta, entrada.relativaAlta);

    // Temperaturas de saturación:
    //  - Evaporación (baja) para SUPERHEAT -> DEW
    //  - Condensación (alta) para SUBCOOLING -> BUBBLE
    const evap = PT.tDew(ref, pBajaAbs);       // Tevap (dew a baja presión)
    const cond = PT.tBubble(ref, pAltaAbs);    // Tcond (bubble a alta presión)

    const tEvap = evap.temp;
    const tCond = cond.temp;

    const superheat = entrada.tAsp - tEvap;    // SH = Tasp - Tsat.evap(dew)
    const subcooling = tCond - entrada.tLiq;   // SC = Tsat.cond(bubble) - Tliq

    const lift = tCond - tEvap;                // lift térmico
    const dtEvap = (!isNaN(entrada.tInt)) ? entrada.tInt - tEvap : NaN; // aire interior - evap
    const dtCond = (!isNaN(entrada.tExt)) ? tCond - entrada.tExt : NaN; // cond - aire exterior

    const m = PT.meta(ref) || {};

    return {
      ref,
      pBajaAbs, pAltaAbs,
      tEvap, tCond,
      superheat, subcooling,
      lift, dtEvap, dtCond,
      tAsp: entrada.tAsp, tLiq: entrada.tLiq, tExt: entrada.tExt, tInt: entrada.tInt,
      glide: m.glide_K || 0,
      tipoMezcla: m.type || '',
      extrapolado: evap.extrapolado || cond.extrapolado
    };
  }

  global.Calculator = { calcular };
})(window);
