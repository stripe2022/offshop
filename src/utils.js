export function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function obtenerFechaHoraActual() {
  const ahora = new Date();
  const opcionesFecha = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const opcionesHora = { hour: 'numeric', minute: '2-digit', hour12: true };
  return (
    ahora.toLocaleDateString('es-ES', opcionesFecha) +
    ' ' +
    ahora.toLocaleTimeString('es-ES', opcionesHora)
  );
}

export function formatearFechaHTML(fechaInput) {
  const [yyyy, mm, dd] = (fechaInput || '').split("-");
  if (!yyyy || !mm || !dd) return '';
  return `${dd}/${mm}/${yyyy}`;
}

// Helper interno: "DD/MM/YYYY HH:mm" -> "YYYY-MM-DD"
export function fechaStrToISO(fechaStr) {
  try {
    const soloFecha = (fechaStr || '').split(' ')[0];
    const [dd, mm, yyyy] = soloFecha.split('/');
    if (!dd || !mm || !yyyy) return null;
    return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  } catch {
    return null;
  }
}
