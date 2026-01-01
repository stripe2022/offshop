import { generarUUID, obtenerFechaHoraActual, formatearFechaHTML } from './utils.js';
import { getCarrito, limpiarCarrito } from './cart.js';
import { getDB, obtenerYActualizarNumeroTicket, leerVentasDB, borrarVentaDB } from './db.js';

export async function guardarVenta({ total, entrega, comentario }) {
  const carrito = getCarrito();
  if (!carrito.length) {
    alert("Agrega al menos un producto");
    return null;
  }

  const numeroTicket = await obtenerYActualizarNumeroTicket();

  const venta = {
    id: generarUUID(),
    fecha: obtenerFechaHoraActual(),
    numeroTicket,
    productos: carrito,
    total: parseFloat(total),
    entrega: entrega || '',
    comentario: comentario || ''
  };

  const db = getDB();
  const tx = db.transaction("ventas", "readwrite");
  const store = tx.objectStore("ventas");
  store.add(venta);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      limpiarCarrito();
      resolve(venta);
    };
    tx.onerror = (e) => {
      console.error("❌ Error al guardar venta", e);
      reject(e);
    };
  });
}

export async function aplicarFiltroDiarioSemana({ dia, inicio, fin }) {
  const ventas = await leerVentasDB();
  let filtradas = [];

  if (dia) {
    filtradas = ventas.filter(v => v.fecha?.startsWith(formatearFechaHTML(dia)));
  } else if (inicio && fin) {
    const ini = new Date(inicio);
    const finDate = new Date(fin);
    filtradas = ventas.filter(v => {
      const [dd, mm, yyyy] = (v.fecha || '').split(' ')[0].split('/');
      if (!dd || !mm || !yyyy) return false;
      const fechaVenta = new Date(`${yyyy}-${mm}-${dd}`);
      return fechaVenta >= ini && fechaVenta <= finDate;
    });
  } else {
    alert("Selecciona un día o rango de semana");
    return [];
  }

  return filtradas;
}

export async function borrarVenta(idVenta) {
  await borrarVentaDB(idVenta);
}
