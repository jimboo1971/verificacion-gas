/* ==========================================================================
   report.js — Informe imprimible / PDF / compartir
   Genera un documento A4 en una ventana nueva y usa window.print() para
   "Guardar como PDF" o imprimir. Sin librerías externas (la PWA debe
   funcionar offline; un CDN rompería el modo sin conexión).
   Compartir: Web Share API (WhatsApp, mail, etc.) cuando esté disponible.
   ========================================================================== */
(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const f1 = v => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(1);

  function fila(k, v) { return `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`; }

  function construirHTML(d) {
    const { emp, cli, calc, diag, carga, desv, obs, foto, fecha } = d;

    const logo = emp.logo ? `<img class="logo" src="${emp.logo}" alt="">` : '';
    const cabEmpresa = `
      <div class="empresa">
        ${logo}
        <div>
          <div class="e1">${esc(emp.empresa || emp.tecnico || 'Informe técnico')}</div>
          <div class="e2">
            ${emp.tecnico ? esc(emp.tecnico) + ' · ' : ''}${emp.nif ? 'NIF: ' + esc(emp.nif) + ' · ' : ''}
            ${emp.telefono ? esc(emp.telefono) + ' · ' : ''}${emp.email ? esc(emp.email) : ''}
            ${emp.carnet ? '<br>Carnet/RITE: ' + esc(emp.carnet) : ''}
          </div>
        </div>
      </div>`;

    const causas = diag.causas.map(c =>
      `<li>${esc(c.texto)} <span class="st">${c.estrellas}</span></li>`).join('');
    const acciones = diag.acciones.map(a => `<li>${esc(a)}</li>`).join('');

    // Bloque de carga
    let bloqueCarga = '';
    if (carga && carga.total) {
      const tramos = carga.tramos.map(t =>
        `<tr><td>Ø${t.mm} mm</td><td>${f1(t.len)} m</td><td>${f1(t.gm)} g/m</td><td>${Math.round(t.gramos)} g</td></tr>`
      ).join('');
      bloqueCarga = `
        <h2>Carga de refrigerante</h2>
        <table class="grid">
          <tr><th>Ø línea líquido</th><th>Longitud</th><th>g/m</th><th>Subtotal</th></tr>
          ${tramos}
        </table>
        <table class="kv">
          ${fila('Carga base de fábrica', Math.round(carga.base) + ' g')}
          ${carga.free ? fila('Longitud incluida sin recarga', carga.free + ' m (descontada)') : ''}
          ${fila('Recarga por tuberías (neta)', Math.round(carga.extra) + ' g')}
          ${carga.extraUds ? fila('Ajuste unidades interiores', Math.round(carga.extraUds) + ' g') : ''}
          <tr class="tot"><th>CARGA NOMINAL (debería tener)</th><td>${Math.round(carga.total)} g (${(carga.total/1000).toFixed(2)} kg)</td></tr>
        </table>
        <p class="nota">Carga nominal calculada con la fórmula del fabricante: carga base + recarga por metros de línea de líquido. Valor exacto siempre que los datos de placa y los g/m sean los del fabricante.</p>`;
    }

    let bloqueDesvio = '';
    if (desv && desv.texto) {
      bloqueDesvio = `
        <h2>Estimación de desvío de carga</h2>
        <p class="desv">${esc(desv.texto)}</p>
        <p class="nota aviso"><b>Importante:</b> la cantidad real de refrigerante en un circuito solo puede conocerse pesando la carga. El valor anterior es una ESTIMACIÓN obtenida del desvío del ${esc(desv.param || 'parámetro de control')} respecto a su objetivo, y se expresa como rango por ese motivo.</p>`;
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Informe ${esc(cli.cliente || '')} ${esc(fecha)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:0;padding:18mm 14mm;font-size:11pt;line-height:1.45}
  h1{font-size:16pt;margin:0 0 2mm}
  h2{font-size:12pt;margin:6mm 0 2mm;color:#0369a1;border-bottom:1px solid #cbd5e1;padding-bottom:1mm}
  .empresa{display:flex;gap:6mm;align-items:center;border-bottom:2px solid #0369a1;padding-bottom:3mm;margin-bottom:4mm}
  .empresa .logo{max-height:18mm;max-width:40mm}
  .e1{font-size:13pt;font-weight:700}
  .e2{font-size:8.5pt;color:#475569}
  table{width:100%;border-collapse:collapse;margin:2mm 0}
  .kv th{text-align:left;width:52%;font-weight:600;color:#334155}
  .kv th,.kv td{border-bottom:1px solid #e2e8f0;padding:1.6mm 1mm;font-size:10pt}
  .kv td{text-align:right;font-variant-numeric:tabular-nums}
  .grid th,.grid td{border:1px solid #cbd5e1;padding:1.4mm 2mm;font-size:9.5pt;text-align:left}
  .grid th{background:#f1f5f9}
  .tot th,.tot td{border-top:2px solid #0369a1;font-weight:800;font-size:11pt;color:#0369a1}
  .verd{border:2px solid;border-radius:3mm;padding:3mm;text-align:center;font-weight:800;font-size:13pt;margin:3mm 0}
  .Correcto{border-color:#16a34a;color:#166534;background:#f0fdf4}
  .Límite{border-color:#d97706;color:#92400e;background:#fffbeb}
  .Revisar{border-color:#ea580c;color:#9a3412;background:#fff7ed}
  .Crítico{border-color:#dc2626;color:#991b1b;background:#fef2f2}
  ul{margin:1mm 0;padding-left:5mm}
  li{margin:1mm 0;font-size:10pt}
  .st{color:#d97706;letter-spacing:1px}
  .nota{font-size:8.5pt;color:#475569;background:#f8fafc;border-left:3px solid #94a3b8;padding:2mm 3mm;margin:2mm 0}
  .nota.aviso{border-left-color:#d97706;background:#fffbeb;color:#78350f}
  .desv{font-size:12pt;font-weight:700;background:#eff6ff;border:1px solid #93c5fd;border-radius:2mm;padding:3mm}
  .foto{max-width:80mm;max-height:60mm;border:1px solid #cbd5e1;border-radius:2mm;margin-top:2mm}
  .pie{margin-top:6mm;border-top:1px solid #cbd5e1;padding-top:2mm;font-size:7.5pt;color:#64748b}
  .firmas{display:flex;gap:10mm;margin-top:8mm}
  .firma{flex:1;border-top:1px solid #94a3b8;padding-top:1.5mm;font-size:8.5pt;color:#475569}
  .cols{display:flex;gap:6mm}
  .cols>div{flex:1}
  @media print{ body{padding:12mm 10mm} .noprint{display:none} @page{size:A4;margin:0} }
</style></head><body>
${cabEmpresa}
<h1>Informe de diagnóstico de carga de refrigerante</h1>
<div class="e2">Fecha: ${esc(fecha)}</div>

<h2>Datos de la instalación</h2>
<div class="cols">
  <div><table class="kv">
    ${fila('Cliente', cli.cliente)}
    ${fila('Ubicación', cli.ubicacion)}
    ${fila('Tipo de equipo', cli.tipoEquipo)}
  </table></div>
  <div><table class="kv">
    ${fila('Fabricante', cli.fabricante)}
    ${fila('Modelo', cli.modelo)}
    ${fila('Refrigerante', calc.ref)}
  </table></div>
</div>

<h2>Mediciones</h2>
<div class="cols">
  <div><table class="kv">
    ${fila('Presión baja (abs)', f1(calc.pBajaAbs) + ' bar')}
    ${fila('Temp. línea aspiración', f1(calc.tAsp) + ' °C')}
    ${fila('Temp. evaporación', f1(calc.tEvap) + ' °C')}
    ${fila('Temp. exterior', f1(calc.tExt) + ' °C')}
  </table></div>
  <div><table class="kv">
    ${fila('Presión alta (abs)', f1(calc.pAltaAbs) + ' bar')}
    ${fila('Temp. línea líquido', f1(calc.tLiq) + ' °C')}
    ${fila('Temp. condensación', f1(calc.tCond) + ' °C')}
    ${fila('Temp. interior retorno', f1(calc.tInt) + ' °C')}
  </table></div>
</div>

<h2>Resultados</h2>
<table class="kv">
  ${fila('Recalentamiento (SH)', f1(calc.superheat) + ' K')}
  ${fila('Subenfriamiento (SC)', f1(calc.subcooling) + ' K')}
  ${fila('Lift térmico', f1(calc.lift) + ' K')}
  ${fila('ΔT evaporador', f1(calc.dtEvap) + ' K')}
  ${fila('ΔT condensador', f1(calc.dtCond) + ' K')}
  ${fila('Dispositivo de expansión', cli.dispositivo)}
</table>

<div class="verd ${esc(diag.gravedad)}">${esc(diag.titulo)} · Gravedad: ${esc(diag.gravedad)}</div>

<h2>Posibles causas (por probabilidad)</h2>
<ul>${causas}</ul>

<h2>Acciones recomendadas</h2>
<ul>${acciones}</ul>

${bloqueCarga}
${bloqueDesvio}

${obs ? '<h2>Observaciones</h2><p>' + esc(obs) + '</p>' : ''}
${foto ? '<h2>Fotografía</h2><img class="foto" src="' + foto + '">' : ''}

<div class="firmas">
  <div class="firma">Firma del técnico${emp.tecnico ? ': ' + esc(emp.tecnico) : ''}</div>
  <div class="firma">Conformidad del cliente</div>
</div>

<div class="pie">
  Los cálculos constituyen una ayuda al diagnóstico basada en principios termodinámicos y en las mediciones introducidas.
  No sustituyen los procedimientos de servicio del fabricante del equipo. Antes de añadir o recuperar refrigerante,
  verifique las especificaciones del fabricante, las condiciones de funcionamiento y la normativa vigente aplicable
  a instalaciones frigoríficas (manipulación por personal certificado; prohibido liberar refrigerante a la atmósfera).
  <br>Generado con DiagClima.
</div>
<div class="noprint" style="text-align:center;margin-top:8mm">
  <button onclick="window.print()" style="padding:10px 18px;font-size:12pt;cursor:pointer">🖨️ Imprimir / Guardar PDF</button>
</div>
</body></html>`;
  }

  /* Abre el informe en una ventana nueva y lanza el diálogo de impresión
     (permite "Guardar como PDF" en escritorio y móvil). */
  function abrirImprimible(datos) {
    const html = construirHTML(datos);
    const w = window.open('', '_blank');
    if (!w) { alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para generar el informe.'); return null; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) {} }, 600);
    return w;
  }

  /* Compartir: si el dispositivo soporta compartir ficheros, envía el HTML
     del informe; si no, comparte un resumen de texto (WhatsApp/mail). */
  async function compartir(datos) {
    const resumen = resumenTexto(datos);
    try {
      if (navigator.share) {
        const html = construirHTML(datos);
        const file = new File([html], 'informe-diagclima.html', { type: 'text/html' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Informe DiagClima', text: resumen, files: [file] });
          return 'archivo';
        }
        await navigator.share({ title: 'Informe DiagClima', text: resumen });
        return 'texto';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado';
    }
    // Respaldo: copiar al portapapeles
    try { await navigator.clipboard.writeText(resumen); return 'portapapeles'; }
    catch (e) { return 'no'; }
  }

  function resumenTexto(d) {
    const { cli, calc, diag, carga, desv, fecha } = d;
    let t = `INFORME DIAGCLIMA · ${fecha}\n`;
    if (cli.cliente) t += `Cliente: ${cli.cliente}\n`;
    if (cli.ubicacion) t += `Ubicación: ${cli.ubicacion}\n`;
    if (cli.modelo) t += `Equipo: ${cli.fabricante || ''} ${cli.modelo}\n`;
    t += `Refrigerante: ${calc.ref}\n`;
    t += `\nMEDICIONES\n`;
    t += `T. evaporación: ${f1(calc.tEvap)} °C · T. condensación: ${f1(calc.tCond)} °C\n`;
    t += `Recalentamiento: ${f1(calc.superheat)} K · Subenfriamiento: ${f1(calc.subcooling)} K\n`;
    t += `\nDIAGNÓSTICO: ${diag.titulo} (${diag.gravedad})\n`;
    if (carga && carga.total) t += `Carga nominal: ${Math.round(carga.total)} g (${(carga.total/1000).toFixed(2)} kg)\n`;
    if (desv && desv.texto) t += `${desv.texto}\n`;
    t += `\nLa carga real solo se conoce pesando. Informe de ayuda al diagnóstico; no sustituye el procedimiento del fabricante.`;
    return t;
  }

  global.Report = { construirHTML, abrirImprimible, compartir, resumenTexto };
})(window);
