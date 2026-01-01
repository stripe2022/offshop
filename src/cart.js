let carrito = [];

export function getCarrito() {
  return carrito;
}

export function setCarrito(nuevo) {
  carrito = Array.isArray(nuevo) ? nuevo : [];
}

export function limpiarCarrito() {
  carrito = [];
}

export function agregarAlCarrito(producto, cantidad) {
  const qty = parseInt(cantidad, 10);
  if (!producto || !Number.isInteger(qty) || qty < 1) return;

  const existente = carrito.find(p => p.codigo === producto.codigo);
  if (existente) {
    existente.cantidad += qty;
  } else {
    carrito.push({ ...producto, cantidad: qty });
  }
}

export function eliminarDelCarrito(index) {
  carrito.splice(index, 1);
}

export function totalCarrito() {
  return carrito.reduce((acc, item) => acc + ((+item.precioVenta || 0) * (+item.cantidad || 0)), 0);
}
