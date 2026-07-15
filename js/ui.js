/* ==========================================================================
   ui.js — Helpers de interfaz y renderizado del resultado
   ========================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const fx = (v, d = 1) => (isNaN(v) || v === null) ? '—' : v.toFixed(d);

  function guiaDispositivo(tipoEquipo) {
    // Sugerencia del dispositivo más probable segun tipo
    const t = tipoEquipo || '';
    if (/capilar/i.test(t)) return 'capilar';
    if (/VRF|Aerotermia|Chiller/i.test(t)) return 'eev';
    if (/comercial|Cámara/i.test(t)) return 'txv';
    if (/Split|Cassette|Conductos/i.test(t)) return 'txv';
    return 'txv';
  }

  function textoGuiaDispositivo(tipoEquipo) {
    const sug = guiaDispositivo(tipoEquipo);
    const nombres = { txv: 'TXV (termostática)', eev: 'EEV (electrónica)', capilar: 'Capilar' };
    return 'Guía: en un «' + tipoEquipo + '» lo más habitual es ' + nombres[sug] +
           '. El capilar es un tubo fino largo sin bulbo; la TXV tiene bulbo en la aspiración; la EEV es una válvula con conexión eléctrica (motor paso a paso).';
  }

  function renderResultado(box, calc, diag, avisos, meta, carga, desv) {
    const g = diag.gravedad;
    let causasHTML = diag.causas.map(c =>
      `<div class="causa"><span>${c.texto}</span><span class="stars">${c.estrellas}</span></div>`).join('');
    let accHTML = diag.acciones.map(a => `<li>${a}</li>`).join('');
    let avisosHTML = avisos.length
      ? `<div class="note warn">⚠️ ${avisos.join('<br>⚠️ ')}</div>` : '';

    let mezclaNota = (meta && meta.glide_K > 1)
      ? `<div class="note">Mezcla zeotropa (glide ≈ ${meta.glide_K} K): recalentamiento calculado con punto de rocío (dew) y subenfriamiento con punto de burbuja (bubble).</div>`
      : '';

    let extrapNota = calc.extrapolado
      ? `<div class="note warn">Alguna presión queda fuera del rango de la tabla P/T: valor extrapolado, fiabilidad reducida.</div>` : '';

    // Bloque de carga nominal (exacta) + desvío (estimado)
    let bloqueCarga = '';
    if (carga && carga.total) {
      const det = carga.tramos.map(t =>
        `<div class="metric"><span>Ø${t.mm} mm · ${t.len} m × ${fx(t.gm)} g/m</span><b>${Math.round(t.gramos)} g</b></div>`).join('');
      const freeNota = carga.free > 0
        ? `<div class="metric"><span>Descuento ${carga.free} m sin recarga</span><b>−${Math.round(carga.tramos.reduce((s,t)=>s+t.gramos,0) - carga.extra)} g</b></div>` : '';
      bloqueCarga = `
        <h2 style="margin-top:16px">Carga de refrigerante</h2>
        <div class="metric"><span>Carga base de fábrica</span><b>${Math.round(carga.base)} g</b></div>
        ${det}
        ${freeNota}
        <div class="metric"><span>Recarga por tuberías (neta)</span><b>${Math.round(carga.extra)} g</b></div>
        ${carga.extraUds ? `<div class="metric"><span>Ajuste unidades interiores</span><b>${Math.round(carga.extraUds)} g</b></div>` : ''}
        <div class="metric"><span><b>CARGA NOMINAL (debería tener)</b></span><b class="big">${Math.round(carga.total)} g</b></div>
        <div class="hint">Cálculo exacto: base de placa + recarga por metros de línea de líquido${carga.free > 0 ? ', descontados los ' + carga.free + ' m incluidos de fábrica' : ''}.</div>`;
    }
    let bloqueDesvio = '';
    if (desv && desv.texto) {
      bloqueDesvio = `
        <h2 style="margin-top:16px">Desvío de carga (estimación)</h2>
        <div class="note" style="border:1px solid var(--accent);color:var(--txt);font-size:.95rem;font-weight:700">${desv.texto}</div>
        <div class="note warn">La cantidad real solo se conoce pesando. El rango procede del desvío del ${desv.param || 'parámetro de control'} respecto a su objetivo.</div>`;
    }

    box.innerHTML = `
      <div class="verdict g-${g}">${diag.color} ${diag.titulo}<br><span style="font-size:.8rem;font-weight:600">Gravedad: ${g}</span></div>

      <div class="metric"><span>Refrigerante</span><b>${calc.ref}</b></div>
      <div class="metric"><span>Temp. evaporación</span><b>${fx(calc.tEvap)} °C</b></div>
      <div class="metric"><span>Temp. condensación</span><b>${fx(calc.tCond)} °C</b></div>
      <div class="metric"><span>Recalentamiento (SH)</span><b>${fx(calc.superheat)} K</b></div>
      <div class="metric"><span>Subenfriamiento (SC)</span><b>${fx(calc.subcooling)} K</b></div>
      <div class="metric"><span>Lift térmico</span><b>${fx(calc.lift)} K</b></div>
      <div class="metric"><span>ΔT evaporador</span><b>${fx(calc.dtEvap)} K</b></div>
      <div class="metric"><span>ΔT condensador</span><b>${fx(calc.dtCond)} K</b></div>

      <h2 style="margin-top:16px">Posibles causas</h2>
      ${causasHTML}

      <h2 style="margin-top:16px">Acciones recomendadas</h2>
      <ul class="acc">${accHTML}</ul>

      ${bloqueCarga}
      ${bloqueDesvio}

      ${avisosHTML}${mezclaNota}${extrapNota}

      <div class="row" style="margin-top:14px">
        <button class="btn-sec" id="btnPdf" style="flex:1">🖨️ Informe PDF</button>
        <button class="btn-sec" id="btnCompartir" style="flex:1">📤 Compartir</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn-sec" id="btnNuevo" style="flex:1">Nuevo diagnóstico</button>
        <button class="btn-primary" id="btnGuardar" style="margin-top:0;flex:1">Guardar</button>
      </div>

      <div class="note warn" style="margin-top:14px">Ayuda al diagnóstico basada en las mediciones introducidas. No sustituye los procedimientos del fabricante. Antes de añadir o recuperar refrigerante, verifica especificaciones, condiciones y normativa vigente.</div>
    `;
    box.classList.remove('hidden');
  }

  global.UI = { $, fx, guiaDispositivo, textoGuiaDispositivo, renderResultado };
})(window);
