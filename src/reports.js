export function resumenSemanalPorProductos(ventasFiltradas) {
  const resumenProductos = {};
  let totalVendido = 0;
  let inversionTotal = 0;

  ventasFiltradas.forEach(venta => {
    (venta.productos || []).forEach(p => {
      if (!resumenProductos[p.nombre]) {
        resumenProductos[p.nombre] = {
          cantidad: 0,
          precioCosto: +p.precioCosto || 0,
          precioVenta: +p.precioVenta || 0
        };
      }
      resumenProductos[p.nombre].cantidad += (+p.cantidad || 0);
      totalVendido += (+p.precioVenta || 0) * (+p.cantidad || 0);
      inversionTotal += (+p.precioCosto || 0) * (+p.cantidad || 0);
    });
  });

  const ganancia = totalVendido - inversionTotal;

  return { resumenProductos, totalVendido, inversionTotal, ganancia };
}
