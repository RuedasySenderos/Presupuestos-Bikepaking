/**
 * Ruedas y Senderos · Script de correos (proyecto NUEVO de Apps Script, independiente del formulario)
 *
 * Hace tres cosas:
 *  1. Cuando un cliente pulsa "Acepto presupuesto", te envía el PDF con el sello "Presupuesto aceptado"
 *     y marca su fila de la hoja como "Aceptado".
 *  2. Envía al cliente su presupuesto (PDF) desde la página de presupuestos.
 *  3. Envía al cliente la documentación de la ruta (PDF rellenable).
 *
 * Instalación:
 *  - Entra en script.google.com > Nuevo proyecto. Borra lo que haya y pega este código.
 *  - Cambia RYS_CLAVE_GESTOR por la MISMA clave que usas en la página de presupuestos.
 *  - Elige la función "rysProbarCorreo" y pulsa Ejecutar. Acepta los permisos (Gmail y Hojas de cálculo).
 *    Te llegará un correo de prueba.
 *  - Implementar > Nueva implementación > Tipo: Aplicación web.
 *    Ejecutar como: Yo.  Quién tiene acceso: Cualquier usuario.  > Implementar.
 *  - Copia la URL que termina en /exec y pégala en la página de presupuestos, en "Script de correos".
 */
const RYS_CLAVE_GESTOR = 'cambia-esta-clave-por-una-larga';
const RYS_EMAIL_GESTOR = 'xaimeca@gmail.com';
const RYS_ID_HOJA = '1Fd0PLzZQPflxgK05A7DK_woDaGoTlhVfV6n6QgU2H9I'; // SOLICITUDES DISEÑA TU VIAJE
const RYS_WEB = 'https://ruedasysenderos.github.io/Presupuestos-Bikepaking/';

function doGet() { return rysSalida({ ok: true, servicio: 'Correos Ruedas y Senderos' }); }

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.accion === 'aceptar') return rysAceptar(d);
    if (d.accion === 'enviarCliente') return rysEnviarCliente(d);
    return rysSalida({ error: 'accion' });
  } catch (err) {
    return rysSalida({ error: 'script', detalle: String(err) });
  }
}

/** El cliente acepta: correo al gestor con el PDF sellado + marca "Aceptado" en la hoja. */
function rysAceptar(d) {
  if (!d.pdf || d.pdf.length > 8000000) return rysSalida({ error: 'pdf' });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const urlDoc = String(d.urlDoc || '').indexOf(RYS_WEB) === 0 ? d.urlDoc : RYS_WEB;
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<h2 style="color:#24452F">✅ Presupuesto aceptado</h2>' +
    '<p><b>' + esc(d.nombre) + '</b> ha aceptado el presupuesto <b>' + esc(d.ref) + '</b> el ' + esc(d.fecha) + '.</p>' +
    '<p>Ruta: ' + esc(d.ruta) + '<br>Total: <b>' + esc(d.total) + '</b><br>Email: ' + esc(d.email) + '<br>Teléfono: ' + esc(d.telefono) + '</p>' +
    '<p style="margin:24px 0"><a href="' + esc(urlDoc) + '" style="background:#24452F;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Generar documentación de la ruta</a></p>' +
    '<p style="color:#6F6A63;font-size:13px">Adjunto va el presupuesto con el sello de aceptado.</p></div>';
  const blob = Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', String(d.archivo || 'Presupuesto_aceptado.pdf'));
  const opciones = { htmlBody: html, attachments: [blob], name: 'Ruedas y Senderos' };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) opciones.replyTo = d.email;
  MailApp.sendEmail(RYS_EMAIL_GESTOR, '✅ Presupuesto aceptado · ' + d.ref + ' · ' + d.nombre, 'Presupuesto aceptado', opciones);
  rysMarcar(parseInt(d.fila, 10), d.nombre, 'Aceptado');
  return rysSalida({ ok: true });
}

/** Envíos al cliente desde la página de presupuestos (solo con la clave del gestor). */
function rysEnviarCliente(d) {
  if (d.clave !== RYS_CLAVE_GESTOR) return rysSalida({ error: 'clave' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.para || '')) return rysSalida({ error: 'email' });
  const blob = Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', String(d.archivo || 'Ruedas_y_Senderos.pdf'));
  MailApp.sendEmail(d.para, String(d.asunto || 'Ruedas y Senderos'), String(d.texto || ''), {
    htmlBody: String(d.html || ''), attachments: [blob], name: 'Ruedas y Senderos', replyTo: RYS_EMAIL_GESTOR
  });
  return rysSalida({ ok: true });
}

/** Escribe el estado en la columna de estado de la fila (comprobando que la fila es de ese cliente). */
function rysMarcar(fila, nombre, valor) {
  if (!fila) return;
  const hoja = SpreadsheetApp.openById(RYS_ID_HOJA).getSheets()[0];
  const filas = hoja.getDataRange().getDisplayValues();
  if (fila < 1 || fila > filas.length) return;
  const texto = filas[fila - 1].join(' ');
  if (nombre && texto.indexOf(nombre) === -1) return;
  const esEstado = v => /^(pendiente|finalizada|aceptado)$/i.test(String(v).trim());
  let col = filas[fila - 1].findIndex(esEstado);
  if (col === -1) { for (const f of filas) { col = f.findIndex(esEstado); if (col !== -1) break; } }
  if (col === -1) return;
  hoja.getRange(fila, col + 1).setValue(valor);
}

function rysSalida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecútala una vez desde el editor para dar permisos. */
function rysProbarCorreo() {
  SpreadsheetApp.openById(RYS_ID_HOJA).getName();
  MailApp.sendEmail(RYS_EMAIL_GESTOR, 'Prueba · Correos Ruedas y Senderos', 'El script de correos funciona correctamente.');
}
