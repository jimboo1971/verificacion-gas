/* ==========================================================================
   storage.js — Historial de intervenciones en IndexedDB (offline)
   Guarda cada diagnóstico con datos, resultado y fotografía (blob/dataURL).
   ========================================================================== */
(function (global) {
  'use strict';

  const DB_NAME = 'clima-diag';
  const DB_VER = 1;
  const STORE = 'historial';
  let dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          os.createIndex('fecha', 'fecha');
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
    return dbp;
  }

  async function guardar(registro) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(registro);
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function listar() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
      req.onerror = e => reject(e.target.error);
    });
  }

  async function borrar(id) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function vaciar() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  global.Storage = { guardar, listar, borrar, vaciar };
})(window);
