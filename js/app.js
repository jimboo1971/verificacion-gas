/* ==========================================================================
   app.js — Orquestación del flujo, navegación y eventos
   ========================================================================== */
(function () {
  'use strict';
  const $ = UI.$;
  let ultimo = null;       // {calc, diag, carga, desv, entrada} para historial/PDF
  let equipoActual = null; // ficha del equipo reconocida/guardada

  const TIPOS_UD = ['Split pared', 'Cassette', 'Conductos', 'Suelo/techo', 'Consola'];
  const NOMBRES_DISP = { txv: 'TXV', eev: 'EEV', capilar: 'Capilar', desconocido: '—' };

  // Estado del sistema (paso 2): nº de unidades interiores, tipo y modelo de
  // cada una, y modelo de la unidad exterior.
  const SISTEMA = { unidades: [nuevaUd()], modeloExt: '' };
  // Estado de la búsqueda de modelo:
  // 'sin'       -> no hay modelo escrito, no procede buscar
  // 'pendiente' -> hay modelo escrito y aún no se ha buscado
  // 'buscando'  -> búsqueda en curso (BD local y/o internet)
  // 'hecha'     -> búsqueda terminada y datos mostrados en pantalla
  const BUSQUEDA = { estado: 'sin' };
  let RAMALES = [];        // paso 4: [{mm, len}] — un ramal por unidad interior

  function nuevaUd() { return { tipo: '', modelo: '', ficha: null }; }

  /* ---------- Init ---------- */
  async function init() {
    // Poblar refrigerantes
    const sel = $('ref');
    PT.LISTA.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o); });
    await PT.precargarTodos();
    actualizarRefInfo();
    actualizarGuiaDisp();
    registrarSW();
    net();

    // Checklist habilita paso 1
    document.querySelectorAll('#checklist input').forEach(c =>
      c.addEventListener('change', () => {
        const todos = [...document.querySelectorAll('#checklist input')].every(x => x.checked);
        $('btnPaso1').disabled = !todos;
      }));

    // Navegación de pasos
    $('btnPaso1').onclick = () => mostrarPaso(2);
    $('btnAtras2').onclick = () => mostrarPaso(1);
    $('btnPaso2').onclick = continuarPaso2;
    $('btnAtras3').onclick = () => mostrarPaso(2);
    $('btnPaso3').onclick = () => { if (validarPaso3()) mostrarPaso(4); };
    $('btnAtras4').onclick = () => mostrarPaso(3);
    $('btnCalcular').onclick = diagnosticar;

    // Paso 2: unidades interiores y búsqueda de modelo
    $('numUds').addEventListener('input', cambiarNumUds);
    renderUnidades();
    $('modeloExt').addEventListener('input', () => {
      SISTEMA.modeloExt = $('modeloExt').value.trim();
      marcarPendiente();
    });
    $('btnBuscarEquipo').onclick = () => buscarEquipo();
    $('btnGuardarFicha').onclick = () => guardarFicha(false);

    // Paso 4: carga
    ['cBase', 'cFree', 'cGm', 'cExtraUds'].forEach(id =>
      $(id).addEventListener('input', () => { pintarCarga(); renderComparativa(); }));

    // Ajustes
    cargarAjustes();
    $('btnGuardarSet').onclick = guardarAjustes;
    $('sLogo').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const d = await fileToDataURL(f);
      $('logoPrev').innerHTML = '<img src="' + d + '" style="max-height:60px;margin-top:8px;border-radius:8px">';
      $('logoPrev').dataset.logo = d;
    };

    $('ref').onchange = () => {
      actualizarRefInfo(); liveSat(); pintarRangos(); renderComparativa(); pintarCondiciones(); pintarCarga();
    };
    $('tipoEquipo').onchange = actualizarGuiaDisp;
    $('dispositivo').onchange = () => { actualizarRefInfo(); pintarRangos(); renderComparativa(); pintarCondiciones(); };
    ['pbaja', 'palta', 'ubaja', 'ualta', 'relbaja', 'relalta'].forEach(id =>
      $(id).addEventListener('input', () => { liveSat(); pintarRangos(); }));

    // Nav inferior
    document.querySelectorAll('.nav button').forEach(b =>
      b.onclick = () => cambiarVista(b.dataset.view, b));

    // Historial / conversor
    $('btnVaciar').onclick = async () => { if (confirm('¿Vaciar todo el historial?')) { await Storage.vaciar(); pintarHist(); } };
    ['cvP', 'cvPu'].forEach(id => $(id).addEventListener('input', convP));
    ['cvT', 'cvTu'].forEach(id => $(id).addEventListener('input', convT));

    // Dialogo guardar
    $('gCancel').onclick = () => $('dlgGuardar').close();
    $('gOk').onclick = guardarIntervencion;

    window.addEventListener('online', net);
    window.addEventListener('offline', net);
  }

  function net() {
    const dot = $('netDot');
    if (navigator.onLine) { dot.classList.remove('off'); dot.title = 'En línea'; }
    else { dot.classList.add('off'); dot.title = 'Sin conexión (offline)'; }
  }

  function actualizarRefInfo() {
    const m = PT.meta($('ref').value);
    $('refInfo').textContent = m ? `${m.name} · ${m.type} · glide ${m.glide_K} K · ${m.safety_class}` : '';
    const box = $('tablaRefBox');
    if (box) box.innerHTML = UI.renderTablaReferencia($('ref').value, $('dispositivo').value);
  }
  function actualizarGuiaDisp() {
    $('dispGuia').textContent = UI.textoGuiaDispositivo($('tipoEquipo').value);
    if ($('dispositivo').value === 'desconocido')
      $('dispositivo').value = UI.guiaDispositivo($('tipoEquipo').value);
  }

  function mostrarPaso(n) {
    [1, 2, 3, 4].forEach(i => $('paso' + i).classList.toggle('hidden', i !== n));
    $('resultado').classList.add('hidden');
    document.querySelectorAll('#steps .s').forEach((s, i) => s.classList.toggle('on', i < n));
    if (n === 2) pintarCondiciones();
    if (n === 3) { actualizarRefInfo(); pintarRangos(); }
    if (n === 4) prepararPaso4();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =====================================================================
     PASO 2 · Unidades interiores + búsqueda profunda del modelo
     ===================================================================== */
  function cambiarNumUds() {
    const n = parseInt($('numUds').value);
    if (isNaN(n) || n < 1) return; // la validación lo bloquea al continuar
    const nn = Math.min(10, n);
    while (SISTEMA.unidades.length < nn) SISTEMA.unidades.push(nuevaUd());
    SISTEMA.unidades.length = nn;
    renderUnidades();
    marcarPendiente();
  }

  function renderUnidades() {
    const box = $('udsBox');
    box.innerHTML = SISTEMA.unidades.map((ud, i) => `
      <div class="ud-card">
        <div class="ud-title">Unidad interior ${i + 1}</div>
        <div class="row">
          <div>
            <label>Tipo <b style="color:var(--bad)">*</b></label>
            <select id="udTipo_${i}">
              <option value="">— Elige tipo —</option>
              ${TIPOS_UD.map(t => `<option${ud.tipo === t ? ' selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1.4">
            <label>Modelo</label>
            <input id="udModelo_${i}" type="text" placeholder="p.ej. MSZ-AP25VG" autocomplete="off" value="${ud.modelo || ''}">
          </div>
        </div>
        <div class="ud-res" id="udRes_${i}"></div>
      </div>`).join('');
    SISTEMA.unidades.forEach((ud, i) => {
      $('udTipo_' + i).onchange = e => { ud.tipo = e.target.value; pintarCondiciones(); };
      $('udModelo_' + i).addEventListener('input', e => { ud.modelo = e.target.value.trim(); marcarPendiente(); });
      pintarResUnidad(i);
    });
    pintarCondiciones();
  }

  function pintarResUnidad(i) {
    const ud = SISTEMA.unidades[i];
    const box = $('udRes_' + i);
    if (!box) return;
    if (ud.ficha) {
      box.innerHTML = '<span class="pill">✅ ' + (ud.ficha.tipo || '—') + '</span>' +
                      '<span class="pill">' + (ud.ficha.refrigerante || '—') + '</span>' +
                      '<span class="pill">' + (NOMBRES_DISP[ud.ficha.dispositivo] || ud.ficha.dispositivo || '—') + '</span>';
    } else box.innerHTML = '';
  }

  function marcarPendiente() {
    const hayModelo = SISTEMA.modeloExt || SISTEMA.unidades.some(u => u.modelo);
    BUSQUEDA.estado = hayModelo ? 'pendiente' : 'sin';
    const hint = $('equipoLookupHint');
    if (hayModelo)
      hint.innerHTML = 'Modelo sin buscar: pulsa <b>«🔍 Buscar datos del equipo»</b>. No se puede continuar hasta que la búsqueda termine y los datos se muestren en pantalla.';
    else
      hint.textContent = 'Sin modelo indicado: puedes introducir los datos manualmente y continuar.';
  }

  async function buscarEquipo() {
    const hint = $('equipoLookupHint');
    const modelos = [SISTEMA.modeloExt].concat(SISTEMA.unidades.map(u => u.modelo)).filter(Boolean);
    if (!modelos.length) {
      BUSQUEDA.estado = 'sin';
      hint.textContent = 'Sin modelo indicado: puedes introducir los datos manualmente y continuar.';
      return;
    }
    BUSQUEDA.estado = 'buscando';
    $('btnBuscarEquipo').disabled = true;
    $('equipoResumen').innerHTML = '';
    hint.innerHTML = '⏳ Buscando a fondo en nuestra base de datos…';

    let res = null;
    try { res = await ModelosDB.buscarProfunda(SISTEMA.modeloExt, SISTEMA.unidades.map(u => u.modelo)); } catch (e) { }
    if (!res) {
      hint.innerHTML = '⏳ Sin resultado en nuestra base de datos. Buscando a fondo y minuciosamente en internet…';
      try { res = await WebLookup.buscar(modelos, m => { hint.innerHTML = '⏳ ' + m; }); } catch (e) { }
    }

    $('btnBuscarEquipo').disabled = false;
    BUSQUEDA.estado = 'hecha';

    if (res && res.ficha) {
      aplicarFicha(res);
      const origen = { local: 'nuestra base de datos', catalogo: 'nuestro catálogo de series', internet: 'internet' }[res.origen] || res.origen;
      hint.innerHTML = '✅ Búsqueda satisfactoria en <b>' + origen + '</b>. Datos aplicados: revísalos y continúa.' +
        (res.origen !== 'local' ? ' <span class="hint">Datos orientativos: verifica placa y manual del fabricante.</span>' : '');
    } else {
      const q = encodeURIComponent(modelos.join(' ') + ' ficha técnica refrigerante carga gas');
      hint.innerHTML = '❌ Búsqueda finalizada sin resultado (base de datos e internet). ' +
        'Introduce los datos manualmente (tipo, refrigerante, dispositivo y carga) y pulsa «💾 Guardar ficha del equipo». ' +
        '<a href="https://www.google.com/search?q=' + q + '" target="_blank" rel="noopener">Ver búsqueda en el navegador ↗</a>';
      pintarCondiciones();
    }
    $('err2').innerHTML = '';
  }

  function aplicarFicha(res) {
    const f = res.ficha;
    equipoActual = f;
    if (f.tipoMaquina) $('tipoEquipo').value = f.tipoMaquina;
    if (f.refrigerante && PT.LISTA.includes(f.refrigerante)) $('ref').value = f.refrigerante;
    if (f.dispositivo) $('dispositivo').value = f.dispositivo;
    if (f.fabricante) $('fabricante').value = f.fabricante;
    // Datos que se guardan para el paso 4 (tubería):
    if (f.cargaBase != null) $('cBase').value = f.cargaBase;
    if (f.longitudSinRecarga != null) $('cFree').value = f.longitudSinRecarga;
    if (f.gPorMetro != null) $('cGm').value = f.gPorMetro;

    // Por cada unidad interior: tipo de aparato, refrigerante y dispositivo
    SISTEMA.unidades.forEach((ud, i) => {
      const pu = (res.porUnidad && res.porUnidad[i]) || null;
      const tipoUd = (pu && pu.tipo) || (TIPOS_UD.includes(f.tipoMaquina) ? f.tipoMaquina : '');
      if (tipoUd && !ud.tipo) {
        ud.tipo = tipoUd;
        const s = $('udTipo_' + i);
        if (s) s.value = tipoUd;
      }
      ud.ficha = {
        tipo: ud.tipo || tipoUd || f.tipoMaquina,
        refrigerante: (pu && pu.refrigerante) || f.refrigerante,
        dispositivo: (pu && pu.dispositivo) || f.dispositivo
      };
      pintarResUnidad(i);
    });

    actualizarRefInfo(); actualizarGuiaDisp();
    $('equipoResumen').innerHTML = UI.renderResumenEquipo(f);
    pintarCondiciones();
    renderComparativa();
  }

  // Presiones y temperaturas estándar de trabajo de cada unidad y refrigerante
  function pintarCondiciones() {
    const box = $('condicionesUds');
    if (!box) return;
    box.innerHTML = UI.renderCondicionesUnidades(SISTEMA.unidades, $('ref').value, $('dispositivo').value);
  }

  function continuarPaso2() {
    const fallos = [];
    const n = parseInt($('numUds').value);
    if (isNaN(n) || n < 1) fallos.push('Indica el número de unidades interiores del sistema (mínimo 1).');
    SISTEMA.unidades.forEach((ud, i) => {
      if (!ud.tipo) fallos.push('Elige el tipo de la unidad interior ' + (i + 1) + '.');
    });
    if (BUSQUEDA.estado === 'buscando')
      fallos.push('Espera a que termine la búsqueda de datos del modelo y se muestren en pantalla.');
    if (BUSQUEDA.estado === 'pendiente') {
      fallos.push('Hay un modelo sin buscar: se ha iniciado la búsqueda automáticamente. Espera a que los datos se muestren en pantalla y vuelve a pulsar Continuar.');
      buscarEquipo();
    }
    const err = $('err2');
    if (fallos.length) { err.innerHTML = '<div class="err">' + fallos.join('<br>') + '</div>'; return; }
    err.innerHTML = '';
    mostrarPaso(3);
  }

  /* ---------- Ficha del equipo (guardar en EquipoDB) ---------- */
  function fichaDesdeFormulario() {
    const me = SISTEMA.modeloExt;
    const mi = (SISTEMA.unidades.find(u => u.modelo) || {}).modelo || '';
    if (!mi && !me) return null;
    return {
      modelo: (me || mi).toUpperCase(),
      modeloInterior: mi, modeloExterior: me,
      fabricante: $('fabricante').value.trim(),
      tipoMaquina: $('tipoEquipo').value,
      refrigerante: $('ref').value,
      dispositivo: $('dispositivo').value,
      cargaBase: parseFloat($('cBase').value) || null,
      longitudSinRecarga: ($('cFree').value !== '' ? parseFloat($('cFree').value) : null),
      gPorMetro: ($('cGm').value !== '' ? parseFloat($('cGm').value) : null),
      tuboLiq: RAMALES[0] ? RAMALES[0].mm : (equipoActual && equipoActual.tuboLiq) || null,
      tuboGas: (equipoActual && equipoActual.tuboGas) || null,
      numUnidades: SISTEMA.unidades.length,
      unidades: SISTEMA.unidades.map(u => ({ tipo: u.tipo, modelo: u.modelo })),
      fecha: new Date().toISOString(),
      fuente: 'manual'
    };
  }
  async function guardarFicha(silencioso) {
    const rec = fichaDesdeFormulario();
    if (!rec) {
      if (!silencioso) alert('Indica al menos el modelo de una unidad interior o de la exterior para poder guardar la ficha.');
      return;
    }
    await EquipoDB.guardar(rec);
    equipoActual = rec;
    const hint = $('fichaHint');
    if (hint) hint.textContent = '✅ Ficha guardada en nuestra base de datos. La próxima vez que introduzcas este modelo se rellenará automáticamente.';
    renderComparativa();
    const resumen = $('equipoResumen');
    if (resumen) resumen.innerHTML = UI.renderResumenEquipo(rec);
  }

  /* =====================================================================
     PASO 3 · Rangos correctos de trabajo bajo cada casilla
     ===================================================================== */
  function convBar(bar, unidad) {
    switch (unidad) {
      case 'psi': return bar * 14.5038;
      case 'kPa': return bar * 100;
      case 'MPa': return bar / 10;
      default: return bar;
    }
  }
  function fmtRangoP(b1Abs, b2Abs, idU, idR) {
    const rel = $(idR).checked, u = $(idU).value;
    const a = convBar(rel ? b1Abs - PT.PRESION_ATM : b1Abs, u);
    const b = convBar(rel ? b2Abs - PT.PRESION_ATM : b2Abs, u);
    const d = u === 'MPa' ? 2 : (u === 'kPa' ? 0 : 1);
    return a.toFixed(d) + '–' + b.toFixed(d) + ' ' + u + (rel ? ' (rel.)' : ' (abs.)');
  }
  function pintarRangos() {
    const ref = $('ref').value;
    const u = Diagnosis.umbrales($('dispositivo').value);
    try {
      const pEvLo = PT.pDe(ref, 0, 'dew'), pEvHi = PT.pDe(ref, 12, 'dew');
      const pCoLo = PT.pDe(ref, 40, 'bubble'), pCoHi = PT.pDe(ref, 55, 'bubble');
      $('rangoBaja').textContent = 'Rango correcto ' + ref + ': ' + fmtRangoP(pEvLo, pEvHi, 'ubaja', 'relbaja') + ' · evaporación 0…12 °C';
      $('rangoAlta').textContent = 'Rango correcto ' + ref + ': ' + fmtRangoP(pCoLo, pCoHi, 'ualta', 'relalta') + ' · condensación 40…55 °C';

      const bb = barAbsDe('pbaja', 'ubaja', 'relbaja');
      let evLo = 0, evHi = 12, notaAsp = ' (con evaporación estándar 0…12 °C)';
      if (!isNaN(bb)) { const t = PT.tDew(ref, bb).temp; evLo = t; evHi = t; notaAsp = ' (con T. evap. medida ' + t.toFixed(1) + ' °C)'; }
      $('rangoTasp').textContent = 'Rango correcto: ' + (evLo + u.shBajo).toFixed(1) + '…' + (evHi + u.shAlto).toFixed(1) +
        ' °C = T. evaporación + SH objetivo ' + u.shBajo + '–' + u.shAlto + ' °C' + notaAsp;

      const ba = barAbsDe('palta', 'ualta', 'relalta');
      let coLo = 40, coHi = 55, notaLiq = ' (con condensación estándar 40…55 °C)';
      if (!isNaN(ba)) { const t = PT.tBubble(ref, ba).temp; coLo = t; coHi = t; notaLiq = ' (con T. cond. medida ' + t.toFixed(1) + ' °C)'; }
      $('rangoTliq').textContent = 'Rango correcto: ' + (coLo - u.scAlto).toFixed(1) + '…' + (coHi - u.scBajo).toFixed(1) +
        ' °C = T. condensación − SC objetivo ' + u.scBajo + '–' + u.scAlto + ' °C' + notaLiq;
    } catch (e) { /* tablas P/T aún no cargadas */ }
  }

  /* ---------- Vista previa en vivo de SH/SC (para la tabla comparativa) ---------- */
  function previewCalc() {
    const pBajaAbs = PT.aBarAbs(parseFloat($('pbaja').value), $('ubaja').value, $('relbaja').checked);
    const pAltaAbs = PT.aBarAbs(parseFloat($('palta').value), $('ualta').value, $('relalta').checked);
    const tAsp = parseFloat($('tasp').value), tLiq = parseFloat($('tliq').value);
    if (isNaN(pBajaAbs) || isNaN(pAltaAbs) || isNaN(tAsp) || isNaN(tLiq)) return null;
    try {
      return Calculator.calcular({
        ref: $('ref').value, dispositivo: $('dispositivo').value,
        pBaja: parseFloat($('pbaja').value), unidadBaja: $('ubaja').value, relativaBaja: $('relbaja').checked,
        pAlta: parseFloat($('palta').value), unidadAlta: $('ualta').value, relativaAlta: $('relalta').checked,
        tAsp, tLiq, tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value)
      });
    } catch (e) { return null; }
  }

  function renderComparativa() {
    const box = $('tablaCompBox');
    if (!box) return;
    const u = Diagnosis.umbrales($('dispositivo').value);
    const calc = previewCalc();
    const c = cargaActual();
    box.innerHTML = UI.renderTablaComparativa({
      equipoRef: equipoActual,
      cBaseIntro: $('cBase').value !== '' ? parseFloat($('cBase').value) : null,
      cFreeIntro: $('cFree').value !== '' ? parseFloat($('cFree').value) : null,
      cargaNominal: c ? c.total : null,
      shObjetivo: [u.shBajo, u.shAlto], scObjetivo: [u.scBajo, u.scAlto],
      shCalc: calc ? calc.superheat : null, scCalc: calc ? calc.subcooling : null
    });
  }

  /* =====================================================================
     PASO 4 · Tubería por unidad interior y carga adicional
     ===================================================================== */
  function prepararPaso4() {
    const defMm = (equipoActual && equipoActual.tuboLiq) || 6.35;
    RAMALES = SISTEMA.unidades.map((ud, i) => RAMALES[i] || { mm: defMm, len: '' });
    RAMALES.length = SISTEMA.unidades.length;
    renderRamales();
    pintarFichaPaso4();
    pintarCarga();
    renderComparativa();
  }

  function pintarFichaPaso4() {
    const box = $('fichaPaso4');
    const f = equipoActual;
    if (!f) {
      box.innerHTML = '<div class="hint">Sin ficha del paso 2: introduce la carga base y la longitud sin recarga manualmente (placa / manual del fabricante).</div>';
      return;
    }
    const tubo = t => {
      const x = Charge.TUBO.find(z => Math.abs(z.mm - t) < 0.2);
      return x ? x.pulg + ' (' + x.mm + ' mm)' : t + ' mm';
    };
    box.innerHTML = '<div class="note">Datos guardados en el paso 2' + (f.modelo ? ' para <b>' + f.modelo + '</b>' : '') + ': ' +
      'carga base <b>' + (f.cargaBase != null ? Math.round(f.cargaBase) + ' g' : '—') + '</b> · ' +
      'long. máx. sin recarga <b>' + (f.longitudSinRecarga != null ? f.longitudSinRecarga + ' m' : '—') + '</b> · ' +
      'tubo líquido <b>' + (f.tuboLiq ? tubo(f.tuboLiq) : '—') + '</b> · ' +
      'recarga <b>' + (f.gPorMetro != null ? f.gPorMetro + ' g/m' : 'según Ø') + '</b></div>';
  }

  function renderRamales() {
    const box = $('ramales');
    box.innerHTML = SISTEMA.unidades.map((ud, i) => `
      <div class="ud-card">
        <div class="ud-title">Unidad ${i + 1}${ud.tipo ? ' · ' + ud.tipo : ''}${ud.modelo ? ' · ' + ud.modelo : ''}</div>
        <div class="row" style="align-items:flex-end">
          <div style="flex:1.6">
            <label>Tipo de tubo (línea de líquido)</label>
            <select id="ramTubo_${i}">
              ${Charge.TUBO.map(t => `<option value="${t.mm}"${Math.abs(t.mm - RAMALES[i].mm) < 0.01 ? ' selected' : ''}>${t.pulg} (${t.mm} mm)</option>`).join('')}
            </select>
          </div>
          <div>
            <label>Metros del ramal</label>
            <input id="ramLen_${i}" type="number" inputmode="decimal" min="0" placeholder="m" value="${RAMALES[i].len}">
          </div>
        </div>
      </div>`).join('');
    SISTEMA.unidades.forEach((ud, i) => {
      $('ramTubo_' + i).onchange = e => { RAMALES[i].mm = parseFloat(e.target.value); pintarCarga(); renderComparativa(); };
      $('ramLen_' + i).addEventListener('input', e => { RAMALES[i].len = e.target.value; pintarCarga(); renderComparativa(); });
    });
  }

  function cargaActual() {
    const gmManual = parseFloat($('cGm').value);
    const tramos = RAMALES
      .map(r => ({ mm: r.mm, len: parseFloat(r.len) || 0, gm: (!isNaN(gmManual) && gmManual > 0) ? gmManual : null }))
      .filter(t => t.len > 0);
    return Charge.nominal({
      base: $('cBase').value, free: $('cFree').value,
      tramos, ref: $('ref').value, extraUds: $('cExtraUds').value
    });
  }
  function pintarCarga() {
    const c = cargaActual();
    const box = $('cargaBox');
    if (!box) return;
    if (!c) { box.innerHTML = '<span class="pill">Carga base pendiente</span> Sin la carga base de fábrica el diagnóstico se dará en % en vez de gramos.'; return; }
    box.innerHTML = `Base <b>${Math.round(c.base)} g</b> + carga adicional por tubería <b>${Math.round(c.extra)} g</b>${c.extraUds ? ' + uds. <b>' + Math.round(c.extraUds) + ' g</b>' : ''}
      <div class="hint">Ramales: ${Math.round(c.metrosTotal * 10) / 10} m en total${c.free > 0 ? ' · ' + c.free + ' m incluidos de fábrica sin recarga' : ''}.</div>
      <div class="big">Carga nominal ≈ ${Math.round(c.total)} g (${(c.total / 1000).toFixed(2)} kg)</div>`;
  }

  function validarPaso3() {
    const pBajaAbs = PT.aBarAbs(parseFloat($('pbaja').value), $('ubaja').value, $('relbaja').checked);
    const pAltaAbs = PT.aBarAbs(parseFloat($('palta').value), $('ualta').value, $('relalta').checked);
    const val = Validation.validar({ pBajaAbs, pAltaAbs, tAsp: parseFloat($('tasp').value),
      tLiq: parseFloat($('tliq').value), tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value) });
    $('errores').innerHTML = val.ok ? '' : '<div class="err">' + val.errores.join('<br>') + '</div>';
    return val.ok;
  }

  /* ---------- Ajustes ---------- */
  function cargarAjustes() {
    const s = Settings.leer();
    ['tecnico', 'empresa', 'nif', 'telefono', 'email', 'carnet'].forEach(k => {
      const el = $('s' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.value = s[k] || '';
    });
    if (s.logo) $('logoPrev').innerHTML = '<img src="' + s.logo + '" style="max-height:60px;margin-top:8px;border-radius:8px">';
    if (s.logo) $('logoPrev').dataset.logo = s.logo;
  }
  function guardarAjustes() {
    const s = {
      tecnico: $('sTecnico').value, empresa: $('sEmpresa').value, nif: $('sNif').value,
      telefono: $('sTelefono').value, email: $('sEmail').value, carnet: $('sCarnet').value,
      logo: $('logoPrev').dataset.logo || ''
    };
    Settings.guardar(s);
    alert('Datos guardados. Aparecerán en la cabecera de los informes.');
  }

  function datosInforme() {
    if (!ultimo) return null;
    return {
      emp: Settings.leer(),
      cli: {
        cliente: $('gCliente').value, ubicacion: $('gUbic').value,
        modelo: $('gModelo').value, fabricante: $('gFab').value,
        tipoEquipo: $('tipoEquipo').value,
        dispositivo: $('dispositivo').selectedOptions[0].textContent
      },
      calc: ultimo.calc, diag: ultimo.diag, carga: ultimo.carga, desv: ultimo.desv,
      obs: $('gObs').value, foto: ultimo.foto || null,
      fecha: new Date().toLocaleString('es-ES')
    };
  }

  /* ---------- Saturación en vivo ---------- */
  function barAbsDe(idP, idU, idR) {
    const v = parseFloat($(idP).value);
    if (isNaN(v)) return NaN;
    return PT.aBarAbs(v, $(idU).value, $(idR).checked);
  }
  function liveSat() {
    const ref = $('ref').value;
    try {
      const bb = barAbsDe('pbaja', 'ubaja', 'relbaja');
      const ba = barAbsDe('palta', 'ualta', 'relalta');
      $('satBaja').textContent = isNaN(bb) ? '' : 'T. evaporación (dew) ≈ ' + PT.tDew(ref, bb).temp.toFixed(1) + ' °C';
      $('satAlta').textContent = isNaN(ba) ? '' : 'T. condensación (bubble) ≈ ' + PT.tBubble(ref, ba).temp.toFixed(1) + ' °C';
    } catch (e) { /* tabla no cargada aún */ }
  }

  /* ---------- Diagnóstico ---------- */
  function diagnosticar() {
    const ref = $('ref').value;
    const dispositivo = $('dispositivo').value;
    const entrada = {
      ref, dispositivo,
      pBaja: parseFloat($('pbaja').value), unidadBaja: $('ubaja').value, relativaBaja: $('relbaja').checked,
      pAlta: parseFloat($('palta').value), unidadAlta: $('ualta').value, relativaAlta: $('relalta').checked,
      tAsp: parseFloat($('tasp').value), tLiq: parseFloat($('tliq').value),
      tExt: parseFloat($('text').value), tInt: parseFloat($('tint').value)
    };

    const pBajaAbs = PT.aBarAbs(entrada.pBaja, entrada.unidadBaja, entrada.relativaBaja);
    const pAltaAbs = PT.aBarAbs(entrada.pAlta, entrada.unidadAlta, entrada.relativaAlta);
    const val = Validation.validar({ pBajaAbs, pAltaAbs, tAsp: entrada.tAsp, tLiq: entrada.tLiq, tExt: entrada.tExt, tInt: entrada.tInt });

    const errBox = $('errores');
    if (!val.ok) {
      errBox.innerHTML = '<div class="err">' + val.errores.join('<br>') + '</div>';
      return;
    }
    errBox.innerHTML = '';

    const calc = Calculator.calcular(entrada);
    const diag = Diagnosis.diagnosticar(calc, dispositivo);
    const avisos = Validation.coherencia(calc);
    const carga = cargaActual();
    const desv = Charge.desvio(calc, diag, dispositivo, carga ? carga.total : null, $('esVRF').checked);
    ultimo = { calc, diag, entrada, carga, desv };

    // Guardar/actualizar automáticamente la ficha del equipo si se indicó un modelo
    guardarFicha(true);

    UI.renderResultado($('resultado'), calc, diag, avisos, PT.meta(ref), carga, desv);
    $('btnNuevo').onclick = () => { mostrarPaso(1); resetChecklist(); };
    $('btnGuardar').onclick = () => $('dlgGuardar').showModal();
    $('btnPdf').onclick = () => Report.abrirImprimible(datosInforme());
    $('btnCompartir').onclick = async () => {
      const r = await Report.compartir(datosInforme());
      if (r === 'portapapeles') alert('Resumen copiado al portapapeles: pégalo en WhatsApp o el correo.');
      else if (r === 'no') alert('Este navegador no permite compartir. Usa «Informe PDF» y adjunta el archivo.');
    };
    window.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  function resetChecklist() {
    document.querySelectorAll('#checklist input').forEach(c => c.checked = false);
    $('btnPaso1').disabled = true;
  }

  /* ---------- Guardar intervención ---------- */
  async function guardarIntervencion() {
    if (!ultimo) return;
    const foto = $('gFoto').files[0];
    const dataURL = foto ? await fileToDataURL(foto) : null;
    if (dataURL) ultimo.foto = dataURL;   // disponible para el PDF
    const c = ultimo.calc, d = ultimo.diag;
    const reg = {
      fecha: new Date().toISOString(),
      cliente: $('gCliente').value, ubicacion: $('gUbic').value,
      modelo: $('gModelo').value, fabricante: $('gFab').value,
      refrigerante: c.ref,
      pBajaAbs: c.pBajaAbs, pAltaAbs: c.pAltaAbs,
      tAsp: c.tAsp, tLiq: c.tLiq,
      sh: c.superheat, sc: c.subcooling,
      diagnostico: d.titulo, gravedad: d.gravedad,
      cargaNominal: ultimo.carga ? Math.round(ultimo.carga.total) : null,
      desvio: ultimo.desv ? ultimo.desv.texto : null,
      observaciones: $('gObs').value, foto: dataURL
    };
    await Storage.guardar(reg);
    $('dlgGuardar').close();
    ['gCliente', 'gUbic', 'gModelo', 'gFab', 'gObs'].forEach(id => $(id).value = '');
    $('gFoto').value = '';
    alert('Intervención guardada en el historial.');
  }
  function fileToDataURL(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  }

  /* ---------- Vistas ---------- */
  function cambiarVista(v, btn) {
    ['Diag', 'Hist', 'Conv', 'Set'].forEach(x => $('view' + x).classList.toggle('hidden', x !== v));
    $('steps').classList.toggle('hidden', v !== 'Diag');
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b === btn));
    if (v === 'Hist') pintarHist();
  }

  async function pintarHist() {
    const cont = $('histList');
    const items = await Storage.listar();
    if (!items.length) { cont.innerHTML = '<div class="hint">Sin intervenciones guardadas.</div>'; return; }
    cont.innerHTML = items.map(it => `
      <div class="hist-item">
        <div class="h"><span>${new Date(it.fecha).toLocaleString()}</span><span>${it.refrigerante}</span></div>
        <div style="font-weight:700;margin-top:4px">${it.diagnostico} <span class="pill">${it.gravedad}</span></div>
        <div class="hint">${it.cliente || ''} ${it.ubicacion ? '· ' + it.ubicacion : ''} ${it.modelo ? '· ' + it.modelo : ''}</div>
        <div class="metric"><span>SH / SC</span><b>${it.sh.toFixed(1)} / ${it.sc.toFixed(1)} °C</b></div>
        ${it.cargaNominal ? '<div class="metric"><span>Carga nominal</span><b>' + it.cargaNominal + ' g</b></div>' : ''}
        ${it.desvio ? '<div class="hint">' + it.desvio + '</div>' : ''}
        ${it.observaciones ? '<div class="hint">' + it.observaciones + '</div>' : ''}
        ${it.foto ? '<img src="' + it.foto + '" alt="foto">' : ''}
        <button class="btn-sec" style="margin-top:8px" onclick="window.__borrar(${it.id})">Borrar</button>
      </div>`).join('');
  }
  window.__borrar = async id => { await Storage.borrar(id); pintarHist(); };

  /* ---------- Conversor ---------- */
  function convP() {
    const v = parseFloat($('cvP').value), u = $('cvPu').value;
    if (isNaN(v)) { $('cvPout').textContent = '—'; return; }
    const bar = PT.aBarAbs(v, u, false); // tratar como absoluto para conversión pura
    $('cvPout').innerHTML = `${bar.toFixed(3)} bar · ${(bar * 14.5038).toFixed(2)} psi · ${(bar * 100).toFixed(1)} kPa · ${(bar / 10).toFixed(4)} MPa`;
  }
  function convT() {
    const v = parseFloat($('cvT').value), u = $('cvTu').value;
    if (isNaN(v)) { $('cvTout').textContent = '—'; return; }
    if (u === '°C') $('cvTout').textContent = `${v} °C = ${(v * 9 / 5 + 32).toFixed(1)} °F`;
    else $('cvTout').textContent = `${v} °F = ${((v - 32) * 5 / 9).toFixed(1)} °C`;
  }

  /* ---------- Service worker ---------- */
  function registrarSW() {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
