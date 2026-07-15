/* ==========================================================================
   validation.js — Validación de datos de entrada
   Bloquea el cálculo si hay valores imposibles o incoherentes.
   ========================================================================== */
(function (global) {
  'use strict';

  // Devuelve { ok:bool, errores:[...], avisos:[...] }
  function validar(datos) {
    const errores = [];
    const avisos = [];
    const {
      pBajaAbs, pAltaAbs, tAsp, tLiq, tExt, tInt
    } = datos;

    // Presiones
    if (isNaN(pBajaAbs)) errores.push('Falta la presión de baja.');
    if (isNaN(pAltaAbs)) errores.push('Falta la presión de alta.');
    if (!isNaN(pBajaAbs) && pBajaAbs <= 0) errores.push('La presión de baja (absoluta) no puede ser ≤ 0.');
    if (!isNaN(pAltaAbs) && pAltaAbs <= 0) errores.push('La presión de alta (absoluta) no puede ser ≤ 0.');
    if (!isNaN(pBajaAbs) && !isNaN(pAltaAbs) && pAltaAbs <= pBajaAbs)
      errores.push('La presión de alta debe ser mayor que la de baja.');

    // Temperaturas obligatorias
    if (isNaN(tAsp)) errores.push('Falta la temperatura de la línea de aspiración.');
    if (isNaN(tLiq)) errores.push('Falta la temperatura de la línea de líquido.');

    // Rango físico razonable
    [['aspiración', tAsp], ['líquido', tLiq], ['exterior', tExt], ['interior', tInt]]
      .forEach(([n, v]) => {
        if (!isNaN(v) && (v < -70 || v > 150))
          errores.push('Temperatura de ' + n + ' fuera de rango físico (-70…150 °C).');
      });

    return { ok: errores.length === 0, errores, avisos };
  }

  // Coherencia posterior al cálculo (avisos, no bloqueantes)
  function coherencia(res) {
    const avisos = [];
    if (res.superheat < -2) avisos.push('Recalentamiento negativo: posible líquido en aspiración o error de lectura.');
    if (res.subcooling < -2) avisos.push('Subenfriamiento negativo: revisa la lectura de presión de alta o temperatura de líquido.');
    if (res.superheat > 40) avisos.push('Recalentamiento muy alto (>40 K): posible falta severa de gas o restricción.');
    if (res.subcooling > 25) avisos.push('Subenfriamiento muy alto (>25 K): posible sobrecarga severa.');
    if (res.tCond - res.tExt < 5 && !isNaN(res.tExt)) avisos.push('Salto condensación-exterior bajo: revisa condensador o carga.');
    return avisos;
  }

  global.Validation = { validar, coherencia };
})(window);
