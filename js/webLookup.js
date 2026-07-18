/* ==========================================================================
   webLookup.js — Búsqueda del modelo en internet (mejor esfuerzo)
   Se usa cuando la búsqueda profunda en la base de datos local y en el
   catálogo interno no da resultado. Consulta fuentes públicas con CORS
   (DuckDuckGo Instant Answers) y extrae del texto el refrigerante y, si
   aparece, la carga de fábrica. Devuelve null si no encuentra nada: en ese
   caso el técnico introduce los datos manualmente.
   ========================================================================== */
(function (global) {
  'use strict';

  function timeoutFetch(url, ms) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
  }

  async function ddg(q) {
    try {
      const r = await timeoutFetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) +
                                   '&format=json&no_html=1&skip_disambig=1', 8000);
      if (!r.ok) return '';
      const j = await r.json();
      let txt = (j.AbstractText || '') + ' ' + (j.Answer || '') + ' ';
      (j.RelatedTopics || []).forEach(t => {
        if (t.Text) txt += t.Text + ' ';
        (t.Topics || []).forEach(s => { if (s.Text) txt += s.Text + ' '; });
      });
      return txt;
    } catch (e) { return ''; }
  }

  function normRef(s) {
    const k = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const lista = (global.PT && global.PT.LISTA) || [];
    return lista.find(r => r.toUpperCase() === k) || null;
  }

  function extraer(txt) {
    if (!txt) return null;
    const mRef = txt.match(/\bR[\s-]?(32|410A|407C|134A|290|404A|448A|449A|452A|454B|513A|1234YF|1234ZE)\b/i);
    if (!mRef) return null;
    const ficha = { refrigerante: normRef('R' + mRef[1]), fuente: 'internet' };
    if (!ficha.refrigerante) return null;
    // Carga de fábrica si aparece en el texto (0,75 kg / 750 g)
    const mKg = txt.match(/(\d(?:[.,]\d{1,2})?)\s*kg/i);
    const mG = txt.match(/\b(\d{3,4})\s*g\b/i);
    if (mKg) {
      const v = parseFloat(mKg[1].replace(',', '.'));
      if (v >= 0.3 && v <= 20) ficha.cargaBase = Math.round(v * 1000);
    } else if (mG) {
      const v = parseInt(mG[1], 10);
      if (v >= 300 && v <= 20000) ficha.cargaBase = v;
    }
    return ficha;
  }

  /* Búsqueda minuciosa: recorre cada modelo con varias consultas.
     onStatus(msg) informa del progreso en pantalla.                        */
  async function buscar(modelos, onStatus) {
    if (!navigator.onLine) {
      if (onStatus) onStatus('Sin conexión a internet: búsqueda en línea no disponible.');
      return null;
    }
    for (let i = 0; i < modelos.length; i++) {
      const m = modelos[i];
      const consultas = [
        m + ' refrigerante carga refrigerant charge',
        m + ' ficha técnica aire acondicionado',
        m + ' air conditioner specifications refrigerant'
      ];
      for (let j = 0; j < consultas.length; j++) {
        if (onStatus) onStatus('Buscando en internet «' + m + '» (modelo ' + (i + 1) + '/' + modelos.length +
                               ', fuente ' + (j + 1) + '/' + consultas.length + ')…');
        const txt = await ddg(consultas[j]);
        const ficha = extraer(txt);
        if (ficha) {
          ficha.modelo = m.toUpperCase();
          return { origen: 'internet', ficha, porUnidad: {} };
        }
      }
    }
    return null;
  }

  global.WebLookup = { buscar };
})(window);
