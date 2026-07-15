/* ==========================================================================
   app.js — Orquestación del flujo, navegación y eventos
   ========================================================================== */
(function () {
  'use strict';
  const $ = UI.$;
  let ultimo = null;     // {calc, diag, carga, desv, entrada} para historial/PDF
  let TRAMOS = [];       // [{mm, len, gm}]

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
    $('btnPaso2').onclick = () => mostrarPaso(3);
    $('btnAtras3').onclick = () => mostrarPaso(2);
    $('btnPaso3').onclick = () => { if (validarPaso3()) mostrarPaso(4); };
    $('btnAtras4').onclick = () => mostrarPaso(3);
    $('btnCalcular').onclick = diagnosticar;

    // Carga: tramos
    poblarDiametros();
    $('btnAddTramo').onclick = addTramo;
    ['cBase','cFree','cExtraUds'].forEach(id => $(id).addEventListener('input', pintarCarga));
    renderTramos();

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
      actualizarRefInfo(); liveSat();
      // Los g/m dependen de la densidad del refrigerante: recalcular tramos.
      TRAMOS.forEach(t => t.gm = Charge.gPorMetro(t.mm, $('ref').value));
      renderTramos();
    };
    $('tipoEquipo').onchange = actualizarGuiaDisp;
    ['pbaja','palta','ubaja','ualta','relbaja','relalta'].forEach(id => $(id).addEventListener('input', liveSat));

    // Nav inferior
    document.querySelectorAll('.nav button').forEach(b =>
      b.onclick = () => cambiarVista(b.dataset.view, b));

    // Historial / conversor
    $('btnVaciar').onclick = async () => { if (confirm('¿Vaciar todo el historial?')) { await Storage.vaciar(); pintarHist(); } };
    ['cvP','cvPu'].forEach(id => $(id).addEventListener('input', convP));
    ['cvT','cvTu'].forEach(id => $(id).addEventListener('input', convT));

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
  }
  function actualizarGuiaDisp() {
    $('dispGuia').textContent = UI.textoGuiaDispositivo($('tipoEquipo').value);
    // sugerir automáticamente si está en "desconocido"
    if ($('dispositivo').value === 'desconocido')
      $('dispositivo').value = UI.guiaDispositivo($('tipoEquipo').value);
  }

  function mostrarPaso(n) {
    [1,2,3,4].forEach(i => $('paso' + i).classList.toggle('hidden', i !== n));
    $('resultado').classList.add('hidden');
    document.querySelectorAll('#steps .s').forEach((s, i) => s.classList.toggle('on', i < n));
    if (n === 4) pintarCarga();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Paso 4: tramos y carga ---------- */
  function poblarDiametros() {
    const sel = $('tDiam');
    sel.innerHTML = '';
    Charge.TUBO.forEach(t => {
      const o = document.createElement('option');
      o.value = t.mm; o.textContent = `${t.pulg} (${t.mm} mm)`;
      sel.appendChild(o);
    });
  }
  function addTramo() {
    const mm = parseFloat($('tDiam').value);
    const len = parseFloat($('tLen').value);
    if (isNaN(len) || len <= 0) { alert('Indica los metros del tramo.'); return; }
    TRAMOS.push({ mm, len, gm: Charge.gPorMetro(mm, $('ref').value) });
    $('tLen').value = '';
    renderTramos();
  }
  window.__delTramo = i => { TRAMOS.splice(i, 1); renderTramos(); };
  window.__setGm = (i, v) => { TRAMOS[i].gm = parseFloat(v); pintarCarga(); };

  function renderTramos() {
    const box = $('tramos');
    if (!TRAMOS.length) { box.innerHTML = '<div class="hint" style="padding:6px 0">Sin tramos añadidos.</div>'; pintarCarga(); return; }
    box.innerHTML = TRAMOS.map((t, i) => `
      <div class="metric">
        <span>Ø${t.mm} mm · ${t.len} m</span>
        <b>
          <input type="number" value="${t.gm != null ? t.gm.toFixed(1) : ''}" onchange="__setGm(${i},this.value)"
                 style="width:78px;display:inline-block;padding:5px;font-size:.85rem;text-align:right"> g/m
          <button class="btn-sec" style="padding:3px 9px;margin-left:6px" onclick="__delTramo(${i})">✕</button>
        </b>
      </div>`).join('');
    pintarCarga();
  }

  function cargaActual() {
    return Charge.nominal({
      base: $('cBase').value, free: $('cFree').value,
      tramos: TRAMOS, ref: $('ref').value, extraUds: $('cExtraUds').value
    });
  }
  function pintarCarga() {
    const c = cargaActual();
    const box = $('cargaBox');
    if (!c) { box.innerHTML = '<span class="pill">Carga base pendiente</span> Sin la carga base de fábrica el diagnóstico se dará en % en vez de gramos.'; return; }
    box.innerHTML = `Base <b>${Math.round(c.base)} g</b> + tuberías <b>${Math.round(c.extra)} g</b>${c.extraUds ? ' + uds. <b>' + Math.round(c.extraUds) + ' g</b>' : ''}
      <div class="big">Carga nominal ≈ ${Math.round(c.total)} g (${(c.total/1000).toFixed(2)} kg)</div>`;
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
    ['tecnico','empresa','nif','telefono','email','carnet'].forEach(k => {
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
      const bb = barAbsDe('pbaja','ubaja','relbaja');
      const ba = barAbsDe('palta','ualta','relalta');
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
    ['gCliente','gUbic','gModelo','gFab','gObs'].forEach(id => $(id).value = '');
    $('gFoto').value = '';
    alert('Intervención guardada en el historial.');
  }
  function fileToDataURL(file) {
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
  }

  /* ---------- Vistas ---------- */
  function cambiarVista(v, btn) {
    ['Diag','Hist','Conv','Set'].forEach(x => $('view' + x).classList.toggle('hidden', x !== v));
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
        <div class="metric"><span>SH / SC</span><b>${it.sh.toFixed(1)} / ${it.sc.toFixed(1)} K</b></div>
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
    $('cvPout').innerHTML = `${bar.toFixed(3)} bar · ${(bar*14.5038).toFixed(2)} psi · ${(bar*100).toFixed(1)} kPa · ${(bar/10).toFixed(4)} MPa`;
  }
  function convT() {
    const v = parseFloat($('cvT').value), u = $('cvTu').value;
    if (isNaN(v)) { $('cvTout').textContent = '—'; return; }
    if (u === '°C') $('cvTout').textContent = `${v} °C = ${(v*9/5+32).toFixed(1)} °F`;
    else $('cvTout').textContent = `${v} °F = ${((v-32)*5/9).toFixed(1)} °C`;
  }

  /* ---------- Service worker ---------- */
  function registrarSW() {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
