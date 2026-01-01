import { totalCarrito } from './cart.js';

export function actualizarTotalProductosUI(productos) {
  const totalEl = document.getElementById('total-productos');
  const n = (productos || []).length;

  if (totalEl) {
    totalEl.textContent = n;
    return;
  }

  const footer = document.querySelector('.footer');
  if (footer) {
    const match = footer.innerHTML.match(/Total de productos: \d+/);
    if (match) {
      footer.innerHTML = footer.innerHTML.replace(/Total de productos: \d+/, `Total de productos: ${n}`);
    }
  }
}

export function poblarSelectProductos(productos) {
  const select = document.getElementById('producto');
  if (!select) return;

  select.innerHTML = '<option value="">-- Selecciona un producto --</option>';

  (productos || []).forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;          // index visible
    opt.textContent = p.nombre;
    select.appendChild(opt);
  });
}

export function renderizarCarrito(carrito, onEliminarIndex) {
  const contenedor = document.getElementById('lista-productos');
  if (!contenedor) return;

  contenedor.innerHTML = '';
  (carrito || []).forEach((item, i) => {
    const subtotal = ((+item.precioVenta || 0) * (+item.cantidad || 0)).toFixed(2);
    const div = document.createElement('div');
    div.className = 'producto-item';
    div.innerHTML = `
      ${item.nombre} x ${item.cantidad} - $${subtotal}
      <button class="btn-eliminar" data-i="${i}">✖️</button>
    `;
    contenedor.appendChild(div);
  });

  // Delegación de evento (mejor que onclick inline)
  contenedor.onclick = (e) => {
    const btn = e.target.closest('button.btn-eliminar');
    if (!btn) return;
    const i = parseInt(btn.getAttribute('data-i'), 10);
    if (Number.isInteger(i)) onEliminarIndex(i);
  };
}

export function renderTotalUI() {
  const el = document.getElementById('total');
  if (!el) return;
  el.textContent = totalCarrito().toFixed(2);
}

export function limpiarBusquedaYSelect() {
  const busq = document.getElementById('busqueda');
  if (busq) {
    busq.value = '';
    busq.dispatchEvent(new Event('input'));
    busq.focus();
  }
}

export function resetInputsDespuesAgregar() {
  const sel = document.getElementById('producto');
  const cant = document.getElementById('cantidad');
  if (sel) sel.value = '';
  if (cant) cant.value = '1';
}

export function resetInputsDespuesGuardarVenta() {
  const cmt = document.getElementById('comentario');
  if (cmt) cmt.value = '';

  const sel = document.getElementById('producto');
  if (sel) sel.value = '';

  const cant = document.getElementById('cantidad');
  if (cant) cant.value = '1';

  limpiarBusquedaYSelect();
}

export function setNumeroReciboUI(n) {
  const numeroSpan = document.getElementById('numero-recibo');
  if (numeroSpan) numeroSpan.textContent = n;
}
