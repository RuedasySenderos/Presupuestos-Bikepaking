/**
 * Ruedas y Senderos · Lectura de solicitudes y marcado de ofertas finalizadas.
 *
 * IMPORTANTE
 *  - Pégalo en el MISMO proyecto que tiene tu doPost (el de la URL .../AKfycbzT0Sri.../exec).
 *  - Si ese proyecto ya tiene otra función llamada doGet, bórrala: solo puede haber una.
 *  - Cambia RYS_CLAVE_GESTOR por tu clave.
 *  - Selecciona la función "rysProbar" arriba y pulsa Ejecutar una vez (acepta los permisos).
 *  - Implementar > Gestionar implementaciones > lápiz > Versión: "Nueva versión" > Implementar.
 *    "Quién tiene acceso" debe ser "Cualquier usuario".
 *    (Si en vez de eso creas una "Nueva implementación", la URL cambia: pega la nueva en la app.)
 */
const RYS_CLAVE_GESTOR = 'cambia-esta-clave-por-una-larga';
const RYS_ID_HOJA = '1Fd0PLzZQPflxgK05A7DK_woDaGoTlhVfV6n6QgU2H9I'; // SOLICITUDES DISEÑA TU VIAJE

function doGet(e) {
  const salida = obj => ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  try {
    const p = (e && e.parameter) || {};
    if (p.clave !== RYS_CLAVE_GESTOR) return salida({ error: 'clave' });

    const hoja = SpreadsheetApp.openById(RYS_ID_HOJA).getSheets()[0];
    const filas = hoja.getDataRange().getDisplayValues();

    if (p.accion === 'finalizar' || p.accion === 'reabrir') {
      const fila = parseInt(p.fila, 10);
      if (!fila || fila < 1 || fila > filas.length) return salida({ error: 'fila' });
      const esEstado = v => /^(pendiente|finalizada|aceptado)$/i.test(String(v).trim());
      let col = filas[fila - 1].findIndex(esEstado);
      if (col === -1) { for (const f of filas) { col = f.findIndex(esEstado); if (col !== -1) break; } }
      if (col === -1) return salida({ error: 'sin_columna_estado' });
      if (/^aceptado$/i.test(String(filas[fila - 1][col]).trim())) return salida({ ok: true, fila: fila, sinCambios: 'aceptado' });
      const lock = LockService.getScriptLock(); lock.waitLock(10000);
      try { hoja.getRange(fila, col + 1).setValue(p.accion === 'finalizar' ? 'Finalizada' : 'Pendiente'); }
      finally { lock.releaseLock(); }
      return salida({ ok: true, fila: fila });
    }
    return salida({ filas: filas });
  } catch (err) {
    return salida({ error: 'script', detalle: String(err) });
  }
}

/** Ejecuta esta función una vez desde el editor para conceder permisos y comprobar que lee la hoja. */
function rysProbar() {
  const r = doGet({ parameter: { clave: RYS_CLAVE_GESTOR } });
  const datos = JSON.parse(r.getContent());
  Logger.log(datos.filas ? 'OK: ' + datos.filas.length + ' filas leídas' : 'Error: ' + JSON.stringify(datos));
}
