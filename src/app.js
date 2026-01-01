// /src/app.js

import {
  initDB,
  cargarProductosDesdeDB,
  obtenerNumeroTicketActual,
  importarBackupProductos,
  exportarVentasDB,
  importarVentasWipeRebuildTickets
} from './db.js';

import { ordenarProductosPorNombre } from './products.js';

import {
  getCarrito,
  agregarAlCarrito,
  eliminarDelCarrito,
  totalCarrito
} from './cart.js';

import {
  poblarSelectProductos,
  actualizarTotalProductosUI,
  renderizarCarrito,
  renderTotalUI,
  limpiarBusquedaYSelect,
  resetInputsDespuesAgregar,
  resetInputsDespuesGuardarVenta,
  setNumeroReciboUI
} from './ui.js';

import { obtenerFechaHoraActual } from './utils.js';

import {
  guardarVenta,
  aplicarFiltroDiarioSemana,
  borrarVenta as borrarVentaSrv
} from './sales.js';

import { resumenSemanalPorProductos } from './reports.js';
import { generarPdfConTabla } from './pdf.js';

// ✅ Scanner (PASO 1: solo leer QR y mostrar texto)
import { startScan, stopScan } from './scanner.js';

let productos = [];
let tipoResumenActual = ''; // 'diario' | 'semanal'

// Guardamos el último texto escaneado (PASO 1)
let lastQRText = '';
window.__LAST_QR__ = () => lastQRText;

// ========= UI helpers =========
async function refrescarProductosUI() {
  const list = await cargarProductosDesdeDB();
  productos = ordenarProductosPorNombre(list);
  poblarSelectProductos(productos);
  actualizarTotalProductosUI(productos);
}

async function mostrarNumeroTicketActual() {
  const n = await obtenerNumeroTicketActual();
  setNumeroReciboUI(n);
}

function renderCarritoYTotal() {
  renderizarCarrito(getCarrito(), (i) => {
    eliminarDelCarrito(i);
    renderCarritoYTotal();
  });
  renderTotalUI();
}

function aplicarFiltroBusquedaSelect() {
  const inputBusqueda = document.getElementById('busqueda');
  if (!inputBusqueda) return;

  inputBusqueda.addEventListener('input', (e) => {
    const filtro = (e.target.value || '').toLowerCase();
    const select = document.getElementById('producto');
    if (!select) return;

    select.innerHTML = '<option value="">-- Selecciona un producto --</option>';

    productos
      .filter(p => (p.nombre || '').toLowerCase().includes(filtro))
      .forEach((p) => {
        const opt = document.createElement('option');
        opt.value = productos.indexOf(p); // mantiene tu lógica original
        opt.textContent = p.nombre;
        select.appendChild(opt);
      });
  });
}

// ========= Scanner UI (PASO 1) =========
function wireScannerUI() {
  const btnScan = document.getElementById('btn-scan-qr');
  const btnStop = document.getElementById('btn-stop-scan');
  const box = document.getElementById('scanner-box');
  const videoEl = document.getElementById('qr-video');
  const statusEl = document.getElementById('scan-status');

  // Si el HTML todavía no tiene el panel, no hacemos nada
  if (!btnScan || !btnStop || !box || !videoEl || !statusEl) return;

  // Cooldown para que no lea el mismo QR 10 veces seguidas
  let lastReadAt = 0;
  const COOLDOWN_MS = 1200;

  btnScan.addEventListener('click', async () => {
    box.style.display = 'block';
    statusEl.textContent = '⏳ Preparando escáner...';

    try {
      await startScan({
        videoEl,
        statusEl,
        onText: async (text) => {
          const now = Date.now();
          if (now - lastReadAt < COOLDOWN_MS) return;
          lastReadAt = now;

          lastQRText = String(text || '').trim();
          console.log('📦 QR detectado:', lastQRText);

          // PASO 1: solo mostrarlo en el status (ya lo hace scanner.js)
          // Si quieres detener tras 1 lectura, descomenta:
          // stopScan({ videoEl, statusEl });
          // box.style.display = 'none';
        }
      });
    } catch (e) {
      console.error(e);
      statusEl.textContent = `❌ ${e.message || e}`;
    }
  });

  btnStop.addEventListener('click', () => {
    stopScan({ videoEl, statusEl });
    box.style.display = 'none';
  });
}

// ========= Funciones principales =========
async function onAgregarProducto() {
  const select = document.getElementById('producto');
  const cantidadInput = document.getElementById('cantidad');

  const index = parseInt(select?.value, 10);
  const cantidad = parseInt(cantidadInput?.value, 10);

  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(cantidad) || cantidad < 1) {
    alert("Selecciona un producto y cantidad válida");
    return;
  }

  const producto = productos[index];
  agregarAlCarrito(producto, cantidad);

  renderCarritoYTotal();
  resetInputsDespuesAgregar();
  limpiarBusquedaYSelect();
}

async function onGuardarVenta() {
  const entregaSel = document.querySelector('input[name="entrega"]:checked');
  const entrega = entregaSel ? entregaSel.value : '';
  const comentario = document.getElementById('comentario')?.value || '';

  try {
    const venta = await guardarVenta({
      total: totalCarrito().toFixed(2),
      entrega,
      comentario
    });

    resetInputsDespuesGuardarVenta();
    renderCarritoYTotal();
    await mostrarNumeroTicketActual();

    alert(`✅ Venta #${venta.numeroTicket} guardada correctamente`);
  } catch (e) {
    console.error(e);
    alert("❌ Error al guardar la venta");
  }
}

function renderizarResultadosHistorial(lista) {
  const contenedor = document.getElementById('resultados-historial');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  if (!lista.length) {
    contenedor.style.display = 'none';
    contenedor.innerHTML = "<p style='text-align:center;'>❌ No hay ventas registradas para ese período.</p>";
    return;
  }

  contenedor.style.display = 'block';

  lista
    .sort((a, b) => {
      const ta = Number.isFinite(+a.numeroTicket) ? +a.numeroTicket : Number.MAX_SAFE_INTEGER;
      const tb = Number.isFinite(+b.numeroTicket) ? +b.numeroTicket : Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;

      const fa = new Date((a.fecha || '').split(' ')[0].split('/').reverse().join('-'));
      const fb = new Date((b.fecha || '').split(' ')[0].split('/').reverse().join('-'));
      return fa - fb;
    })
    .forEach((venta) => {
      const productosTxt = (venta.productos || []).map(p => `${p.nombre} x${p.cantidad}`).join(', ');
      const div = document.createElement('div');
      div.className = 'venta-item';
      div.innerHTML = `
        <p><strong>📄 Recibo #${venta.numeroTicket || '—'} del día</strong></p>
        <p><strong>📅 Fecha:</strong> ${venta.fecha}</p>
        <p><strong>🛒 Productos:</strong> ${productosTxt}</p>
        <p><strong>💵 Total:</strong> $${(+venta.total || 0).toFixed(2)}</p>
        ${venta.entrega ? `<p><strong>🚚 Entrega:</strong> ${venta.entrega}</p>` : ''}
        ${venta.comentario ? `<p><strong>📝 Comentario:</strong> ${venta.comentario}</p>` : ''}
        <button data-id="${venta.id}" class="btn-borrar-venta"
          style="background:red;color:white;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;">
          🗑 Borrar
        </button>
        <hr>
      `;
      contenedor.appendChild(div);
    });

  // Delegación borrar
  contenedor.onclick = async (e) => {
    const btn = e.target.closest('.btn-borrar-venta');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (!confirm("⚠️ ¿Seguro que quieres borrar este ticket? Esta acción no se puede deshacer.")) return;
    await borrarVentaSrv(id);
    alert("✅ Ticket borrado correctamente");
    await aplicarFiltro(); // recarga
  };
}

async function aplicarFiltro() {
  tipoResumenActual = 'diario';
  const dia = document.getElementById('filtro-dia')?.value || '';
  const inicio = document.getElementById('filtro-semana-inicio')?.value || '';
  const fin = document.getElementById('filtro-semana-fin')?.value || '';

  const filtradas = await aplicarFiltroDiarioSemana({ dia, inicio, fin });
  renderizarResultadosHistorial(filtradas);
}

async function aplicarFiltroSemanaResumen() {
  tipoResumenActual = 'semanal';

  const inicio = document.getElementById('filtro-semana-inicio')?.value;
  const fin = document.getElementById('filtro-semana-fin')?.value;
  const contenedor = document.getElementById('resultados-historial');

  if (!inicio || !fin) {
    alert('Selecciona un rango válido de fechas.');
    return;
  }

  const filtradas = await aplicarFiltroDiarioSemana({ dia: '', inicio, fin });

  if (!filtradas.length) {
    contenedor.innerHTML = '';
    contenedor.style.display = 'none';
    return;
  }

  const { resumenProductos, totalVendido, inversionTotal, ganancia } = resumenSemanalPorProductos(filtradas);

  contenedor.style.display = 'block';
  contenedor.innerHTML = '<h3>📦 Resumen por productos</h3><ul>';

  Object.keys(resumenProductos)
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .forEach(nombre => {
      const prod = resumenProductos[nombre];
      const subtotal = prod.cantidad * prod.precioVenta;

      contenedor.innerHTML += `
        <li>
          <strong>${nombre}</strong>: ${prod.cantidad} unidades
          <span style="color: red;">($${prod.precioCosto.toFixed(2)}</span> /
          <span style="color: green;">$${prod.precioVenta.toFixed(2)})</span>
          <span style="color: black;"> — sub $${subtotal.toFixed(2)}</span>
        </li>
      `;
    });

  contenedor.innerHTML += '</ul>';
  contenedor.innerHTML += `
    <hr>
    <p><strong>💰 Total vendido:</strong> $${totalVendido.toFixed(2)}</p>
    <p><strong>📦 Inversión total:</strong> $${inversionTotal.toFixed(2)}</p>
    <p><strong>📈 Ganancia:</strong> $${ganancia.toFixed(2)}</p>
  `;
}

// ======= Export/Import =======
async function exportarVentas() {
  const ventas = await exportarVentasDB();
  const json = JSON.stringify({ ventas }, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importarVentas(event) {
  const file = event.target.files?.[0];
  if (!file) return alert("❌ No se seleccionó ningún archivo");

  try {
    await importarVentasWipeRebuildTickets(file);
    alert("✅ Ventas importadas correctamente (wipe + rebuild de tickets)");
    await mostrarNumeroTicketActual();
  } catch (e) {
    console.error(e);
    alert("❌ Archivo inválido o corrupto");
  }
}

// ========= Boot =========
window.addEventListener('DOMContentLoaded', () => {
  const fechaElem = document.getElementById('fecha-hora');
  if (fechaElem) fechaElem.textContent = obtenerFechaHoraActual();

  // ✅ Wire scanner UI (PASO 1)
  wireScannerUI();

  initDB({
    onReady: async () => {
      await refrescarProductosUI();
      await mostrarNumeroTicketActual();
      aplicarFiltroBusquedaSelect();
      renderCarritoYTotal();
    }
  });

  // Import productos
  const inputImportar = document.getElementById('importarInput');
  if (inputImportar) {
    inputImportar.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importarBackupProductos(file);
        await refrescarProductosUI();
        alert("✅ Productos importados con éxito (wipe + restore)");
      } catch (err) {
        console.error(err);
        alert("❌ Error al importar el backup");
      }
    });
  }

  // Import ventas
  const inputImportarVentas = document.getElementById('importarVentasInput');
  if (inputImportarVentas) {
    inputImportarVentas.addEventListener('change', importarVentas);
  }

  // Botón PDF
  document.getElementById('generarPdf')?.addEventListener('click', () =>
    generarPdfConTabla({ tipoResumenActual })
  );

  // Exponer para HTML inline onclick
  window.agregarProducto = onAgregarProducto;
  window.guardarVenta = onGuardarVenta;
  window.aplicarFiltro = aplicarFiltro;
  window.aplicarFiltroSemanaResumen = aplicarFiltroSemanaResumen;
  window.exportarVentas = exportarVentas;
});
