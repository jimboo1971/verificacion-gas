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

      <h2 style="margin-top:4px">Valores de funcionamiento</h2>
      ${tablaResultado(calc, diag)}

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

  /* SH/SC son diferencias de temperatura (1 K = 1 °C): se muestran en °C. */
  const kc = v => (isNaN(v) || v === null) ? '—' : `${v.toFixed(1)} °C`;

  /* ---------- Tabla comparativa del RESULTADO (pantalla final) ----------
     Columna 1: valores correctos para un funcionamiento normal.
     Columna 2: valores medidos/calculados, en verde si están dentro de los
     valores correctos y en rojo si están fuera. */
  function tablaResultado(calc, diag) {
    const u = diag.umbrales;
    const filas = [];
    function fila(nombre, correcto, medido, estado) {
      const cls = (estado === null || estado === undefined) ? '' : (estado ? 'cmp-ok' : 'cmp-bad');
      filas.push(`<tr><td>${nombre}</td><td>${correcto}</td><td class="${cls}">${medido}</td></tr>`);
    }

    // Refrigerante — informativo, sin rango
    fila('Refrigerante', '—', calc.ref, null);

    // Temp. evaporación — referida al aire interior de retorno (evap 6–16 K por debajo)
    let evapRef = 'según aplicación', evapOk = null;
    if (!isNaN(calc.tInt)) {
      const lo = calc.tInt - 16, hi = calc.tInt - 6;
      evapRef = `${Math.round(lo)}…${Math.round(hi)} °C`;
      evapOk = (calc.tEvap >= lo && calc.tEvap <= hi);
    }
    fila('Temp. evaporación', evapRef, fx(calc.tEvap) + ' °C', evapOk);

    // Temp. condensación — referida al aire exterior (condensa 8–22 K por encima)
    let condRef = 'ambiente +8…+22 °C', condOk = null;
    if (!isNaN(calc.tExt)) {
      const lo = calc.tExt + 8, hi = calc.tExt + 22;
      condRef = `${Math.round(lo)}…${Math.round(hi)} °C`;
      condOk = (calc.tCond >= lo && calc.tCond <= hi);
    }
    fila('Temp. condensación', condRef, fx(calc.tCond) + ' °C', condOk);

    // Recalentamiento (SH) — rango del dispositivo/refrigerante
    fila('Recalentamiento (SH)', `${u.shBajo}–${u.shAlto} °C`, kc(calc.superheat),
         (!isNaN(calc.superheat)) ? (calc.superheat >= u.shBajo && calc.superheat <= u.shAlto) : null);

    // Subenfriamiento (SC)
    fila('Subenfriamiento (SC)', `${u.scBajo}–${u.scAlto} °C`, kc(calc.subcooling),
         (!isNaN(calc.subcooling)) ? (calc.subcooling >= u.scBajo && calc.subcooling <= u.scAlto) : null);

    // Lift térmico — muy dependiente de la aplicación: informativo, sin color
    fila('Lift térmico', 'según aplicación', fx(calc.lift) + ' K', null);

    // ΔT evaporador (aire) — rango amplio 4–16 K
    let dtEvOk = null;
    if (!isNaN(calc.dtEvap)) dtEvOk = (calc.dtEvap >= 4 && calc.dtEvap <= 16);
    fila('ΔT evaporador', '4–16 K', !isNaN(calc.dtEvap) ? fx(calc.dtEvap) + ' K' : '—', dtEvOk);

    // ΔT condensador — 6–22 K sobre ambiente
    let dtCoOk = null;
    if (!isNaN(calc.dtCond)) dtCoOk = (calc.dtCond >= 6 && calc.dtCond <= 22);
    fila('ΔT condensador', '6–22 K', !isNaN(calc.dtCond) ? fx(calc.dtCond) + ' K' : '—', dtCoOk);

    return `<table class="tabla-comp">
        <thead><tr><th>Parámetro</th><th>Valor correcto</th><th>Medido / calculado</th></tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table>
      <div class="hint">Fondo verde = dentro de los valores para un correcto funcionamiento · rojo = fuera de rango. Rangos orientativos; prevalecen las especificaciones del fabricante.</div>`;
  }

  /* ---------- Ficha-resumen del equipo (Paso 1) ----------
     Al reconocer el modelo se muestran de un vistazo los datos técnicos:
     tipo, refrigerante, dispositivo, SH/SC objetivo, glide, carga base y
     longitud de circuito sin recarga. */
  function renderResumenEquipo(rec) {
    if (!rec) return '';
    const nombresDisp = { txv: 'TXV (termostática)', eev: 'EEV (electrónica)', capilar: 'Capilar / orificio fijo', desconocido: 'No definido' };
    const u = global.Diagnosis ? global.Diagnosis.umbrales(rec.dispositivo) : null;
    const m = (global.PT && rec.refrigerante) ? global.PT.meta(rec.refrigerante) : null;
    const filas = [];
    const f = (k, v) => filas.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
    const tuboTxt = mm => {
      const t = global.Charge ? global.Charge.TUBO.find(x => Math.abs(x.mm - mm) < 0.2) : null;
      return t ? `${t.pulg} (${t.mm} mm)` : `${mm} mm`;
    };
    f('Tipo de equipo', rec.tipoMaquina || '—');
    f('Refrigerante', rec.refrigerante || '—');
    f('Dispositivo de expansión', nombresDisp[rec.dispositivo] || rec.dispositivo || '—');
    f('Recalentamiento (SH)', u ? `${u.shBajo}–${u.shAlto} °C` : '—');
    f('Subenfriamiento (SC)', u ? `${u.scBajo}–${u.scAlto} °C` : '—');
    f('Glide del refrigerante', m ? `${m.glide_K} K` : '—');
    f('Carga base de fábrica', rec.cargaBase != null ? `${Math.round(rec.cargaBase)} g` : '—');
    f('Longitud máx. sin recarga', rec.longitudSinRecarga != null ? `${rec.longitudSinRecarga} m` : '—');
    f('Recarga por metro extra', rec.gPorMetro != null ? `${rec.gPorMetro} g/m` : '— (según Ø del tubo)');
    f('Tubo de clima (líquido)', rec.tuboLiq ? tuboTxt(rec.tuboLiq) : '—');
    f('Tubo de clima (gas)', rec.tuboGas ? tuboTxt(rec.tuboGas) : '—');
    if (rec.numUnidades) f('Unidades interiores', rec.numUnidades);
    return `<table class="tabla-ref" style="margin-top:6px">
        <thead><tr><th>Ficha del equipo</th><th>Valor</th></tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table>
      <div class="hint">Datos recuperados de nuestra base de datos. SH, SC y glide se derivan del refrigerante y el dispositivo de expansión. Se rellenan automáticamente en los pasos siguientes.</div>`;
  }

  /* ---------- Tabla de referencia (Paso 3) ----------
     Ayuda visual: rango normal de SH/SC para el refrigerante y dispositivo
     de expansión seleccionados, antes de introducir ninguna medida. */
  function renderTablaReferencia(ref, dispositivo) {
    if (!ref || !global.Diagnosis) return '';
    const u = global.Diagnosis.umbrales(dispositivo);
    const m = global.PT ? global.PT.meta(ref) : null;
    const nombresDisp = { txv: 'TXV (termostática)', eev: 'EEV (electrónica)', capilar: 'capilar', desconocido: 'desconocido' };
    return `
      <table class="tabla-ref">
        <thead><tr><th>Parámetro (valores normales)</th><th>Rango correcto</th></tr></thead>
        <tbody>
          <tr><td>Recalentamiento (SH)</td><td>${u.shBajo}–${u.shAlto} °C</td></tr>
          <tr><td>Subenfriamiento (SC)</td><td>${u.scBajo}–${u.scAlto} °C</td></tr>
          ${m ? `<tr><td>Glide de ${ref}</td><td>${m.glide_K} K</td></tr>` : ''}
        </tbody>
      </table>
      <div class="hint">Rangos orientativos para <b>${ref}</b> con dispositivo de expansión «${nombresDisp[dispositivo] || dispositivo}». Úsalos como primera referencia visual; el fabricante del equipo prevalece siempre.</div>`;
  }

  /* ---------- Tabla comparativa (Paso 4) ----------
     Columna 1: valores correctos (de fábrica / de referencia).
     Columna 2: valores introducidos/calculados, en verde si están dentro
     de los valores correctos y en rojo si están fuera. */
  function renderTablaComparativa(d) {
    const filas = [];
    function fila(nombre, refTxt, valTxt, ok) {
      const cls = ok === null ? '' : (ok ? 'cmp-ok' : 'cmp-bad');
      filas.push(`<tr><td>${nombre}</td><td>${refTxt}</td><td class="${cls}">${valTxt}</td></tr>`);
    }

    const eq = d.equipoRef;
    let hayReferencia = false;

    if (eq && eq.cargaBase) {
      hayReferencia = true;
      const okBase = d.cBaseIntro != null && Math.abs(d.cBaseIntro - eq.cargaBase) <= eq.cargaBase * 0.05;
      fila('Carga base de fábrica', Math.round(eq.cargaBase) + ' g',
           d.cBaseIntro != null ? Math.round(d.cBaseIntro) + ' g' : '—',
           d.cBaseIntro != null ? okBase : null);
    }
    if (eq && eq.longitudSinRecarga != null) {
      hayReferencia = true;
      const okFree = d.cFreeIntro != null && d.cFreeIntro <= eq.longitudSinRecarga + 0.01;
      fila('Longitud máx. sin recarga', eq.longitudSinRecarga + ' m',
           d.cFreeIntro != null ? d.cFreeIntro + ' m' : '—',
           d.cFreeIntro != null ? okFree : null);
    }

    const okSH = d.shCalc != null && !isNaN(d.shCalc) ? (d.shCalc >= d.shObjetivo[0] && d.shCalc <= d.shObjetivo[1]) : null;
    fila('Recalentamiento (SH)', d.shObjetivo[0] + '–' + d.shObjetivo[1] + ' °C',
         (d.shCalc != null && !isNaN(d.shCalc)) ? d.shCalc.toFixed(1) + ' °C' : '—', okSH);

    const okSC = d.scCalc != null && !isNaN(d.scCalc) ? (d.scCalc >= d.scObjetivo[0] && d.scCalc <= d.scObjetivo[1]) : null;
    fila('Subenfriamiento (SC)', d.scObjetivo[0] + '–' + d.scObjetivo[1] + ' °C',
         (d.scCalc != null && !isNaN(d.scCalc)) ? d.scCalc.toFixed(1) + ' °C' : '—', okSC);

    const nota = hayReferencia
      ? '<div class="hint">Verde = dentro de los valores correctos de funcionamiento · Rojo = fuera de rango.</div>'
      : '<div class="hint">Sin ficha del equipo guardada: se muestran solo los rangos normales de SH/SC. Guarda la ficha en el paso 2 para comparar también la carga de fábrica.</div>';

    return `<table class="tabla-comp">
        <thead><tr><th></th><th>Valor correcto</th><th>Introducido / calculado</th></tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table>${nota}`;
  }

  /* ---------- Condiciones estándar de trabajo por unidad (Paso 2) ----------
     Presiones y temperaturas estándar de trabajo en refrigeración para el
     refrigerante en uso, más la lista de unidades interiores del sistema. */
  function renderCondicionesUnidades(unidades, ref, dispositivo) {
    if (!ref || !global.PT || !global.Diagnosis) return '';
    const u = global.Diagnosis.umbrales(dispositivo);
    const P = global.PT;
    let pEvLo, pEvHi, pCoLo, pCoHi;
    try {
      pEvLo = P.pDe(ref, 0, 'dew') - P.PRESION_ATM;
      pEvHi = P.pDe(ref, 12, 'dew') - P.PRESION_ATM;
      pCoLo = P.pDe(ref, 40, 'bubble') - P.PRESION_ATM;
      pCoHi = P.pDe(ref, 55, 'bubble') - P.PRESION_ATM;
    } catch (e) { return ''; }
    const f1 = v => isNaN(v) ? '—' : v.toFixed(1);
    const filasUds = (unidades || []).map((ud, i) =>
      `<tr><td>Unidad ${i + 1}</td><td>${ud.tipo || '—'}</td><td>${ud.modelo || '—'}</td><td>${ref}</td></tr>`).join('');
    return `
      <table class="tabla-ref" style="margin-top:8px">
        <thead><tr><th>Unidad interior</th><th>Tipo</th><th>Modelo</th><th>Refrigerante</th></tr></thead>
        <tbody>${filasUds}</tbody>
      </table>
      <table class="tabla-ref">
        <thead><tr><th>Condición estándar de trabajo (${ref})</th><th>Rango</th></tr></thead>
        <tbody>
          <tr><td>Presión de BAJA (manométrica)</td><td>${f1(pEvLo)}–${f1(pEvHi)} bar · evaporación 0…12 °C</td></tr>
          <tr><td>Presión de ALTA (manométrica)</td><td>${f1(pCoLo)}–${f1(pCoHi)} bar · condensación 40…55 °C</td></tr>
          <tr><td>Recalentamiento (SH) objetivo</td><td>${u.shBajo}–${u.shAlto} °C</td></tr>
          <tr><td>Subenfriamiento (SC) objetivo</td><td>${u.scBajo}–${u.scAlto} °C</td></tr>
        </tbody>
      </table>
      <div class="hint">Presiones y temperaturas estándar de trabajo de cada unidad con <b>${ref}</b> (modo frío). Orientativas: prevalecen los datos del fabricante.</div>`;
  }

  global.UI = { $, fx, guiaDispositivo, textoGuiaDispositivo, renderResultado, renderResumenEquipo, renderTablaReferencia, renderTablaComparativa, renderCondicionesUnidades };
})(window);
