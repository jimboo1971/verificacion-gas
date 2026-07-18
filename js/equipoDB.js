/* ==========================================================================
   equipoDB.js — Base de datos local de equipos (modelo -> ficha técnica)
   A partir del modelo de la unidad interior y/o exterior, guarda y recupera:
   fabricante, tipo de máquina, refrigerante, dispositivo de expansión,
   carga base de fábrica y longitud máxima de tubería sin recarga.
   Así, la próxima vez que se introduzca el mismo modelo, estos datos se
   rellenan automáticamente sin tener que buscarlos de nuevo.
   ========================================================================== */
(function (global) {
  'use strict';

  const DB_NAME = 'clima-equipos';
  const DB_VER = 1;
  const STORE = 'equipos';
  let dbp = null;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'modelo' });
          os.createIndex('modeloInterior', 'modeloInterior');
          os.createIndex('modeloExterior', 'modeloExterior');
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target.error);
    });
    return dbp;
  }

  function norm(s) { return (s || '').toString().trim().toUpperCase(); }

  async function guardar(registro) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(registro);
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function listar() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  }

  // Busca primero por clave exacta (modelo exterior o interior, el que se
  // use como clave principal) y, si no hay coincidencia, recorre todos los
  // registros comparando modeloInterior / modeloExterior individualmente
  // (para encontrar el equipo aunque solo se conozca una de las dos unidades).
  async function buscar(clave, modeloInterior, modeloExterior) {
    const db = await abrir();
    const k = norm(clave);
    const mi = norm(modeloInterior), me = norm(modeloExterior);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const os = tx.objectStore(STORE);

      function buscarEnTodos() {
        const reqAll = os.getAll();
        reqAll.onsuccess = () => {
          const found = reqAll.result.find(r =>
            (mi && norm(r.modeloInterior) === mi) ||
            (me && norm(r.modeloExterior) === me) ||
            (mi && norm(r.modelo) === mi) ||
            (me && norm(r.modelo) === me));
          resolve(found || null);
        };
        reqAll.onerror = e => reject(e.target.error);
      }

      if (k) {
        const reqExacto = os.get(k);
        reqExacto.onsuccess = () => { if (reqExacto.result) resolve(reqExacto.result); else buscarEnTodos(); };
        reqExacto.onerror = () => buscarEnTodos();
      } else {
        buscarEnTodos();
      }
    });
  }

  async function borrar(modelo) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(modelo);
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  global.EquipoDB = { guardar, listar, buscar, borrar };
})(window);
