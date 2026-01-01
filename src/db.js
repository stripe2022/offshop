// /src/db.js
// ✅ OFFLINE ONLY (IndexedDB)
// ✅ Fix: evita NotFoundError creando stores faltantes con upgrade de versión
// ✅ Incluye guards + onblocked para upgrades

import { fechaStrToISO, formatearFechaHTML } from './utils.js';

let db = null;

export function getDB() {
  return db;
}

/**
 * Abre/crea la DB.
 * IMPORTANTE: subimos versión a 3 para forzar onupgradeneeded y crear "tickets"
 */
export function initDB({ onReady } = {}) {
  const request = indexedDB.open("barylieDB", 3);

  request.onerror = (event) => {
    console.error("❌ Error al abrir IndexedDB", event);
  };

  request.onblocked = () => {
    // Esto pasa si hay otra pestaña/instancia usando la DB e impide el upgrade
    alert("⚠️ OffShop necesita actualizar la base de datos. Cierra otras pestañas de OffShop y recarga.");
  };

  request.onsuccess = (event) => {
    db = event.target.result;

    // Si en el futuro cambias versión, esto ayuda a no dejar conexiones viejas abiertas
    db.onversionchange = () => {
      db.close();
      alert("⚠️ Se detectó una actualización de la base de datos. Recarga la página.");
    };

    console.log("✅ DB lista. Stores:", Array.from(db.objectStoreNames));
    onReady?.(db);
  };

  request.onupgradeneeded = (event) => {
    db = event.target.result;

    // Crea stores si faltan (no destruye datos existentes)
    if (!db.objectStoreNames.contains("ventas")) {
      db.createObjectStore("ventas", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("productos")) {
      db.createObjectStore("productos", { keyPath: "codigo" });
    }
    if (!db.objectStoreNames.contains("tickets")) {
      db.createObjectStore("tickets", { keyPath: "fecha" });
    }

    console.log("✅ Upgrade DB OK. Stores:", Array.from(db.objectStoreNames));
  };
}

/* =========================
   PRODUCTOS
========================= */

export function cargarProductosDesdeDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no lista"));

    if (!db.objectStoreNames.contains("productos")) {
      console.warn("⚠️ Store 'productos' no existe. Devuelvo [].");
      resolve([]);
      return;
    }

    const tx = db.transaction("productos", "readonly");
    const store = tx.objectStore("productos");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e);
  });
}

export function importarBackupProductos(file) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no lista"));
    if (!file) return reject(new Error("No file"));

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!Array.isArray(backup.productos)) throw new Error("Archivo inválido");

        if (!db.objectStoreNames.contains("productos")) {
          throw new Error("Store 'productos' no existe (upgrade no aplicado).");
        }

        const tx = db.transaction("productos", "readwrite");
        const store = tx.objectStore("productos");

        // WIPE
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

/* =========================
   VENTAS
========================= */

export function leerVentasDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no lista"));

    if (!db.objectStoreNames.contains("ventas")) {
      console.warn("⚠️ Store 'ventas' no existe. Devuelvo [].");
      resolve([]);
      return;
    }

    const tx = db.transaction("ventas", "readonly");
    const store = tx.objectStore("ventas");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e);
  });
}

export function exportarVentasDB() {
  return leerVentasDB();
}

export function borrarVentaDB(idVenta) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no lista"));

    if (!db.objectStoreNames.contains("ventas")) {
      reject(new Error("Store 'ventas' no existe"));
      return;
    }

    const tx = db.transaction("ventas", "readwrite");
    const store = tx.objectStore("ventas");
    store.delete(idVenta);

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}

/**
 * Importa ventas haciendo:
 * 1) WIPE ventas
 * 2) Inserta ventas del backup
 * 3) WIPE tickets
 * 4) Reconstruye tickets[YYYY-MM-DD].ultimo = max(numeroTicket) del día
 */
export function importarVentasWipeRebuildTickets(file) {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error("DB no lista"));
    if (!file) return reject(new Error("No file"));

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (!Array.isArray(backup.ventas)) {
          throw new Error("❌ El archivo no contiene un array 'ventas'");
        }

        if (!db.objectStoreNames.contains("ventas")) {
          throw new Error("Store 'ventas' no existe (upgrade no aplicado).");
        }
        if (!db.objectStoreNames.contains("tickets")) {
          throw new Error("Store 'tickets' no existe (upgrade no aplicado).");
        }

        const tx = db.transaction(["ventas", "tickets"], "readwrite");
        const ventasStore = tx.objectStore("ventas");
        const ticketsStore = tx.objectStore("tickets");

        // 1) WIPE ventas
        const clearVentasReq = ventasStore.clear();

        clearVentasReq.onsuccess = () => {
          const maxPorDia = new Map(); // { YYYY-MM-DD: maxNumero }

          // 2) Insertar ventas y calcular máximos por fecha
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
                console.warn("❗ Venta ignorada por error en put:", venta, e);
              }
            } else {
              console.warn("❗ Venta ignorada por formato incorrecto:", venta);
            }
          });

          // 3) WIPE tickets
          const clearTicketsReq = ticketsStore.clear();
          clearTicketsReq.onsuccess = () => {
            // 4) Reconstruir
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

/* =========================
   TICKETS (numeración)
========================= */

export function obtenerNumeroTicketActual() {
  return new Promise((resolve) => {
    const hoy = new Date().toISOString().split('T')[0];

    if (!db?.objectStoreNames?.contains("tickets")) {
      console.warn("⚠️ Store 'tickets' no existe. Devuelvo 1. (Sube versión DB / recarga)");
      resolve(1);
      return;
    }

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

/**
 * Asigna ticket del día:
 * - Detecta huecos en ventas del día (por numeroTicket)
 * - Si hay hueco lo usa, sino usa ultimo+1
 * - Actualiza tickets[hoy].ultimo sin bajarlo
 */
export function obtenerYActualizarNumeroTicket() {
  return new Promise((resolve) => {
    const hoyISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const hoyDDMMYYYY = formatearFechaHTML(hoyISO);        // DD/MM/YYYY

    if (!db?.objectStoreNames?.contains("tickets")) {
      console.warn("⚠️ Store 'tickets' no existe. Devuelvo 1.");
      resolve(1);
      return;
    }
    if (!db?.objectStoreNames?.contains("ventas")) {
      console.warn("⚠️ Store 'ventas' no existe. Devuelvo 1.");
      resolve(1);
      return;
    }

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

        // menor candidato libre
        let candidato = 1;
        while (usados.has(candidato)) candidato++;

        // si hay hueco antes o igual a ultimo => usa hueco; si no => ultimo+1
        numeroAsignado = (candidato <= ultimo) ? candidato : (ultimo + 1);

        // nunca bajes ultimo
        const nuevoUltimo = Math.max(ultimo, numeroAsignado);
        ticketsStore.put({ fecha: hoyISO, ultimo: nuevoUltimo });

        console.log(`[Tickets] hoy=${hoyISO} ultimo=${ultimo} → asignado=${numeroAsignado} → guardado.ultimo=${nuevoUltimo}`);
      };

      reqVentas.onerror = (err) => {
        console.error('[Tickets] Error leyendo ventas para huecos', err);
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
