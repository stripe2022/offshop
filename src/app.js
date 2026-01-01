import { initDB, cargarProductosDesdeDB, obtenerNumeroTicketActual,
         importarBackupProductos, exportarVentasDB, importarVentasWipeRebuildTickets } from './db.js';
import { ordenarProductosPorNombre } from './products.js';
import { getCarrito, agregarAlCarrito, eliminarDelCarrito, totalCarrito } from './cart.js';
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
import { obtenerFechaHoraActual, formatearFechaHTML } from './utils.js';
import { guardarVenta, aplicarFiltroDiarioSemana, borrarVenta as borrarVentaSrv } from './sales.js';
import { resumenSemanalPorProductos } from './reports.js';
import { generarPdfConTabla } from './pdf.js';

let productos = [];
let tipoResumenActual = ''; // 'diario' | 'semanal'

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
  } catch {
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

  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);
  fechaFin.setHours(23, 59, 59);

  const filtradas = await aplicarFiltroDiarioSemana({ dia: '', inicio, fin });

  if (!filtradas.length) {
    contenedor.innerHTML = '';
    contenedor.style.display = 'none';
    return;
  }

  const { resumenProductos, totalVendido, inversionTotal, ganancia } = resumenSemanalPorProductos(filtradas);

  contenedor.style.display = 'block';
  contenedor.innerHTML = '<h3>📦 Resumen por productos</h3><ul>';

  for (const nombre in resumenProductos) {
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
  }

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

  // Si tus botones son inline onclick, exponemos:
  window.agregarProducto = onAgregarProducto;
  window.guardarVenta = onGuardarVenta;
  window.aplicarFiltro = aplicarFiltro;
  window.aplicarFiltroSemanaResumen = aplicarFiltroSemanaResumen;
  window.exportarVentas = exportarVentas;
});
