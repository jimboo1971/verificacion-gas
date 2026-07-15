/* ==========================================================================
   settings.js — Datos del técnico / empresa (persisten en localStorage)
   Se usan como cabecera de los informes PDF.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'diagclima-empresa';
  const CAMPOS = ['tecnico', 'empresa', 'nif', 'telefono', 'email', 'carnet', 'logo'];

  function leer() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function guardar(obj) {
    localStorage.setItem(KEY, JSON.stringify(obj));
  }

  global.Settings = { KEY, CAMPOS, leer, guardar };
})(window);
