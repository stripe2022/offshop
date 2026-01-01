import { fechaStrToISO, formatearFechaHTML } from './utils.js';

let db = null;

export function getDB() {
  return db;
}

export function initDB({ onReady } = {}) {
  const request = indexedDB.open("barylieDB", 2);

  request.onerror = (event) => {
    console.error("Error al abrir IndexedDB", event);
  };

  request.onsuccess = (event) => {
    db = event.target.result;
    onReady?.(db);
  };

  request.onupgradeneeded = (event) => {
    db = event.target.result;

    if (!db.objectStoreNames.contains("ventas")) {
      db.createObjectStore("ventas", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("productos")) {
      db.createObjectStore("productos", { keyPath: "codigo" });
    }
    if (!db.objectStoreNames.contains("tickets")) {
      db.createObjectStore("tickets", { keyPath: "fecha" });
    }
  };
}

export function cargarProductosDesdeDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("productos", "readonly");
    const store = tx.objectStore("productos");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e);
  });
}

export function importarBackupProductos(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!Array.isArray(backup.productos)) throw new Error("Archivo inválido");

        const tx = db.transaction("productos", "readwrite");
        const store = tx.objectStore("productos");

        const clearReq = store.clear();
        clearReq.onsuccess = () => {
          backup.productos.forEach(prod => {
            if (prod && prod.codigo && prod.nombre) store.put(prod);
          });
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);

      } catch (e) {
        reject(e);
      }
    };

    reader.readAsText(file);
  });
}

export function exportarVentasDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("ventas", "readonly");
    const store = tx.objectStore("ventas");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(new Error("Error exportando ventas"));
  });
}

export function importarVentasWipeRebuildTickets(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file"));

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!Array.isArray(backup.ventas)) throw new Error("El archivo no contiene un array 'ventas'");

        const tx = db.transaction(["ventas", "tickets"], "readwrite");
        const ventasStore = tx.objectStore("ventas");
        const ticketsStore = tx.objectStore("tickets");

        const clearVentasReq = ventasStore.clear();
        clearVentasReq.onsuccess = () => {
          const maxPorDia = new Map();

          backup.ventas.forEach(venta => {
            if (venta && venta.id && venta.fecha && Array.isArray(venta.productos)) {
              try {
                ventasStore.put(venta);

                const iso = fechaStrToISO(venta.fecha);
                const n = parseInt(venta.numeroTicket, 10);
                if (iso && Number.isInteger(n) && n > 0) {
                  const prev = maxPorDia.get(iso) || 0;
                  if (n > prev) maxPorDia.set(iso, n);
                }
              } catch (e) {
                console.warn("Venta ignorada (put error):", venta, e);
              }
            } else {
              console.warn("Venta ignorada (formato incorrecto):", venta);
            }
          });

          const clearTicketsReq = ticketsStore.clear();
          clearTicketsReq.onsuccess = () => {
            for (const [fechaISO, ultimo] of maxPorDia.entries()) {
              ticketsStore.put({ fecha: fechaISO, ultimo });
            }
          };
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);

      } catch (e) {
        reject(e);
      }
    };

    reader.readAsText(file);
  });
}

export function borrarVentaDB(idVenta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("ventas", "readwrite");
    const store = tx.objectStore("ventas");
    store.delete(idVenta);

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}

/** Tickets **/
export function obtenerNumeroTicketActual() {
  return new Promise((resolve) => {
    const hoy = new Date().toISOString().split('T')[0];
    const tx = db.transaction("tickets", "readonly");
    const store = tx.objectStore("tickets");

    const req = store.get(hoy);
    req.onsuccess = () => {
      const ultimo = req.result?.ultimo || 0;
      resolve(ultimo + 1);
    };
    req.onerror = () => resolve(1);
  });
}

export function obtenerYActualizarNumeroTicket() {
  return new Promise((resolve) => {
    const hoyISO = new Date().toISOString().split('T')[0];
    const hoyDDMMYYYY = formatearFechaHTML(hoyISO);

    const tx = db.transaction(['tickets', 'ventas'], 'readwrite');
    const ticketsStore = tx.objectStore('tickets');
    const ventasStore  = tx.objectStore('ventas');

    let ultimo = 0;
    let numeroAsignado = 1;

    const reqTicket = ticketsStore.get(hoyISO);
    reqTicket.onsuccess = (e) => {
      ultimo = e.target.result?.ultimo || 0;

      const reqVentas = ventasStore.getAll();
      reqVentas.onsuccess = () => {
        const ventasHoy = (reqVentas.result || []).filter(v =>
          typeof v.fecha === 'string' && v.fecha.startsWith(hoyDDMMYYYY)
        );

        const usados = new Set(
          ventasHoy
            .map(v => parseInt(v.numeroTicket, 10))
            .filter(n => Number.isInteger(n) && n > 0)
        );

        let candidato = 1;
        while (usados.has(candidato)) candidato++;

        numeroAsignado = (candidato <= ultimo) ? candidato : (ultimo + 1);

        const nuevoUltimo = Math.max(ultimo, numeroAsignado);
        ticketsStore.put({ fecha: hoyISO, ultimo: nuevoUltimo });

        console.log(`[Tickets] hoy=${hoyISO} ultimo=${ultimo} → asignado=${numeroAsignado} → guardado.ultimo=${nuevoUltimo}`);
      };

      reqVentas.onerror = (err) => {
        console.error('[Tickets] Error leyendo ventas', err);
        numeroAsignado = ultimo + 1;
        ticketsStore.put({ fecha: hoyISO, ultimo: numeroAsignado });
      };
    };

    reqTicket.onerror = (err) => {
      console.error('[Tickets] Error leyendo tickets[hoy], se usará 1', err);
      numeroAsignado = 1;
      ticketsStore.put({ fecha: hoyISO, ultimo: 1 });
    };

    tx.oncomplete = () => resolve(numeroAsignado);
    tx.onerror = (e) => {
      console.error('[Tickets] Transacción falló, devolviendo 1', e);
      resolve(1);
    };
    tx.onabort = (e) => {
      console.error('[Tickets] Transacción abortada, devolviendo 1', e);
      resolve(1);
    };
  });
}

export function leerVentasDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("ventas", "readonly");
    const store = tx.objectStore("ventas");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e);
  });
}
