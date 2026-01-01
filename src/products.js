export function ordenarProductosPorNombre(productos) {
  return (productos || []).slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}
