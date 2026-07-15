/* ==========================================================================
   diagnosis.js — Motor de diagnóstico inteligente
   Combina Superheat y Subcooling en una matriz y devuelve diagnóstico,
   causas ordenadas por probabilidad, nivel de gravedad y acciones.
   ========================================================================== */
(function (global) {
  'use strict';

  // Umbrales (K). Ajustables por dispositivo de expansión.
  // SH: recalentamiento;  SC: subenfriamiento.
  function umbrales(dispositivo) {
    // Rangos "normales" objetivo
    if (dispositivo === 'capilar') {
      return { shBajo: 4, shAlto: 10, scBajo: 3, scAlto: 12 };
    }
    // TXV / EEV / desconocido: SH controlado por válvula (~5-8), SC es el juez de carga
    return { shBajo: 3, shAlto: 12, scBajo: 4, scAlto: 12 };
  }

  function nivel(v, bajo, alto) {
    if (v < bajo) return 'bajo';
    if (v > alto) return 'alto';
    return 'normal';
  }

  // Matriz principal SH × SC -> clave de diagnóstico
  const MATRIZ = {
    'alto|bajo':    'falta',
    'bajo|alto':    'sobrecarga',
    'alto|alto':    'restriccion',
    'bajo|bajo':    'compresor',
    'normal|normal':'correcto',
    // combinaciones parciales -> el más informativo
    'alto|normal':  'falta_leve',
    'normal|bajo':  'falta_leve',
    'bajo|normal':  'sobrecarga_leve',
    'normal|alto':  'sobrecarga_leve',
    'normal|_':     'correcto'
  };

  const CATALOGO = {
    correcto: {
      titulo: 'Funcionamiento correcto',
      color: '🟢', gravedad: 'Correcto',
      causas: [{ t: 'Sistema dentro de parámetros', p: 5 }],
      acciones: ['No se requiere actuación sobre la carga.', 'Registrar valores como referencia del equipo.']
    },
    falta: {
      titulo: 'Falta de refrigerante',
      color: '🔴', gravedad: 'Crítico',
      causas: [
        { t: 'Fuga de refrigerante', p: 5 },
        { t: 'Carga insuficiente en última intervención', p: 4 },
        { t: 'Obstrucción parcial en línea de líquido', p: 3 },
        { t: 'Evaporador muy sucio / poco caudal de aire', p: 2 },
        { t: 'Ventilador de evaporador averiado', p: 2 }
      ],
      acciones: [
        'Localizar y reparar la fuga ANTES de recargar.',
        'Verificar filtros, condensador y ventiladores.',
        'Recargar en fase vapor por la baja en dosis pequeñas hasta alcanzar SH/SC objetivo.',
        'Comprobar carga según especificación del fabricante.'
      ]
    },
    falta_leve: {
      titulo: 'Posible falta de refrigerante (leve)',
      color: '🟡', gravedad: 'Límite',
      causas: [
        { t: 'Carga ligeramente baja', p: 4 },
        { t: 'Poco caudal de aire en evaporador', p: 3 },
        { t: 'Inicio de fuga', p: 2 }
      ],
      acciones: ['Revisar caudal de aire y limpieza.', 'Vigilar evolución; confirmar con datos del fabricante antes de recargar.']
    },
    sobrecarga: {
      titulo: 'Sobrecarga de refrigerante',
      color: '🔴', gravedad: 'Crítico',
      causas: [
        { t: 'Exceso de carga', p: 5 },
        { t: 'Condensador sucio / poco caudal de aire', p: 4 },
        { t: 'Ventilador de condensador insuficiente', p: 3 },
        { t: 'Aire/incondensables en el circuito', p: 2 }
      ],
      acciones: [
        'Verificar limpieza y ventilación del condensador.',
        'Retirar exceso de refrigerante (requiere recuperadora — no purgar a la atmósfera).',
        'Comprobar carga según especificación del fabricante.'
      ]
    },
    sobrecarga_leve: {
      titulo: 'Posible sobrecarga (leve)',
      color: '🟡', gravedad: 'Límite',
      causas: [
        { t: 'Carga ligeramente alta', p: 4 },
        { t: 'Condensador algo sucio', p: 3 }
      ],
      acciones: ['Revisar condensador y caudal de aire exterior.', 'Confirmar carga con datos del fabricante.']
    },
    restriccion: {
      titulo: 'Restricción en línea de líquido',
      color: '🟠', gravedad: 'Revisar',
      causas: [
        { t: 'Filtro deshidratador obstruido', p: 5 },
        { t: 'Válvula de expansión atascada/mal regulada', p: 4 },
        { t: 'Estrangulamiento o codo aplastado en línea de líquido', p: 3 },
        { t: 'Humedad/hielo en el sistema de expansión', p: 2 }
      ],
      acciones: [
        'Inspeccionar filtro deshidratador (salto de temperatura entrada/salida).',
        'Revisar dispositivo de expansión y su bulbo/sensor.',
        'Comprobar posible taponamiento por humedad (vacío y deshidratación).'
      ]
    },
    compresor: {
      titulo: 'Compresor ineficiente / baja capacidad',
      color: '🟠', gravedad: 'Revisar',
      causas: [
        { t: 'Válvulas de compresor desgastadas', p: 5 },
        { t: 'Compresor con baja compresión', p: 4 },
        { t: 'Baja carga combinada con problema mecánico', p: 3 },
        { t: 'Bypass interno / válvula de 4 vías (bomba de calor)', p: 2 }
      ],
      acciones: [
        'Verificar relación de compresión (alta vs baja) y consumo del compresor.',
        'Comprobar temperatura de descarga.',
        'Descartar problema de carga antes de condenar el compresor.'
      ]
    }
  };

  function diagnosticar(res, dispositivo) {
    const u = umbrales(dispositivo);
    const nSH = nivel(res.superheat, u.shBajo, u.shAlto);
    const nSC = nivel(res.subcooling, u.scBajo, u.scAlto);

    let clave = MATRIZ[nSH + '|' + nSC];
    if (!clave) clave = (nSH === 'normal' && nSC === 'normal') ? 'correcto'
                      : MATRIZ[nSH + '|_'] || 'correcto';

    // Escalado por severidad: un parámetro MUY fuera convierte un caso "leve" en pleno.
    // (segundo umbral = objetivo alto + margen). Con TXV el SH queda normal en
    // sobrecarga/falta francas, por lo que el SC/SH extremo debe mandar.
    const scMuyAlto = res.subcooling > u.scAlto + 6;   // p.ej. >18 K
    const scMuyBajo = res.subcooling < u.scBajo - 3;   // p.ej. <1 K (con TXV/EEV)
    const shMuyAlto = res.superheat > u.shAlto + 8;    // p.ej. >20 K
    const shMuyBajo = res.superheat < u.shBajo - 3;
    if (clave === 'sobrecarga_leve' && scMuyAlto) clave = 'sobrecarga';
    if (clave === 'falta_leve' && (shMuyAlto || scMuyBajo)) clave = 'falta';
    if (clave === 'correcto' && scMuyAlto) clave = 'sobrecarga';
    if (clave === 'correcto' && (scMuyBajo || shMuyAlto)) clave = 'falta';

    const info = CATALOGO[clave] || CATALOGO.correcto;

    // Ordenar causas por probabilidad y renderizar estrellas
    const causas = info.causas.slice().sort((a, b) => b.p - a.p)
      .map(c => ({ texto: c.t, estrellas: '★'.repeat(c.p) + '☆'.repeat(5 - c.p) }));

    return {
      clave,
      titulo: info.titulo,
      color: info.color,
      gravedad: info.gravedad,
      nivelSH: nSH, nivelSC: nSC,
      umbrales: u,
      causas,
      acciones: info.acciones
    };
  }

  global.Diagnosis = { diagnosticar, umbrales };
})(window);
