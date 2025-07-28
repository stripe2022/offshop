// app.js

let productos = [];
let ventas = [];
let carrito = [];
let db;

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function initDB() {
  const request = indexedDB.open("barylieDB", 1);

  request.onerror = (event) => {
    console.error("Error al abrir IndexedDB", event);
  };

  request.onsuccess = (event) => {
    db = event.target.result;
    cargarProductosDesdeDB();
    mostrarNumeroTicketActual();
  };

  request.onupgradeneeded = (event) => {
    db = event.target.result;
    if (!db.objectStoreNames.contains("ventas")) {
      db.createObjectStore("ventas", { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("productos")) {
      db.createObjectStore("productos", { keyPath: "codigo" });
    }
  };
}

function obtenerFechaHoraActual() {
  const ahora = new Date();
  const opcionesFecha = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const opcionesHora = { hour: 'numeric', minute: '2-digit', hour12: true };
  return ahora.toLocaleDateString('es-ES', opcionesFecha) + ' ' + ahora.toLocaleTimeString('es-ES', opcionesHora);
}

function obtenerNumeroTicketDelDia(callback) {
  const hoy = new Date().toISOString().split('T')[0];
  const tx = db.transaction("ventas", "readonly");
  const store = tx.objectStore("ventas");
  const request = store.getAll();

  request.onsuccess = () => {
    const ventasDelDia = request.result.filter(v => v.fecha.startsWith(hoy.split('-').reverse().join('/')));
    callback(ventasDelDia.length + 1);
  };
}

function mostrarNumeroTicketActual() {
  obtenerNumeroTicketDelDia((numeroTicket) => {
    const numeroSpan = document.getElementById('numero-recibo');
    if (numeroSpan) {
      numeroSpan.textContent = numeroTicket;
    }
  });
}


function actualizarTotalProductos() {
  const totalEl = document.getElementById('total-productos');
  if (totalEl) {
    totalEl.textContent = productos.length;
  } else {
    const footer = document.querySelector('.footer');
    if (footer) {
      const match = footer.innerHTML.match(/Total de productos: \d+/);
      if (match) {
        footer.innerHTML = footer.innerHTML.replace(/Total de productos: \d+/, `Total de productos: ${productos.length}`);
      }
    }
  }
}

function guardarVenta() {
  if (carrito.length === 0) return alert("Agrega al menos un producto");

  const entrega = document.querySelector('input[name="entrega"]:checked').value;
  const comentario = document.getElementById('comentario')?.value || '';

  obtenerNumeroTicketDelDia((numeroTicket) => {
    const venta = {
      id: generarUUID(),
      fecha: obtenerFechaHoraActual(),
      numeroTicket,
      productos: carrito,
      total: parseFloat(document.getElementById('total').textContent),
      entrega,
      comentario
    };

    const tx = db.transaction("ventas", "readwrite");
    const store = tx.objectStore("ventas");
    store.add(venta);

    ventas.push(venta);
    carrito = [];
    renderizarProductos();
    calcularTotal();
    document.getElementById('comentario').value = '';
    document.getElementById('producto').value = '';
    document.getElementById('cantidad').value = '1';

    mostrarNumeroTicketActual();

    alert(`✅ Venta #${numeroTicket} guardada correctamente`);
  });
}

function cargarProductosDesdeDB() {
  const tx = db.transaction("productos", "readonly");
  const store = tx.objectStore("productos");
  const request = store.getAll();

  request.onsuccess = () => {
    productos = request.result;
    const select = document.getElementById('producto');
    if (select) {
      select.innerHTML = '<option value="">-- Selecciona un producto --</option>';
      productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
      productos.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.nombre;
        select.appendChild(opt);
      });
    }
    actualizarTotalProductos();
  };
}

function importarBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (!Array.isArray(backup.productos)) throw new Error("Archivo inválido");

      const tx = db.transaction("productos", "readwrite");
      const store = tx.objectStore("productos");

      backup.productos.forEach(prod => {
        if (prod && prod.codigo && prod.nombre) {
          store.put(prod);
        }
      });

      tx.oncomplete = () => {
        cargarProductosDesdeDB();
        alert("✅ Productos importados con éxito");
      };

    } catch (e) {
      alert("❌ Archivo inválido");
    }
  };

  reader.readAsText(file);
}


function agregarProducto() {
  const select = document.getElementById('producto');
  const cantidadInput = document.getElementById('cantidad');

  const index = parseInt(select.value);
  const cantidad = parseInt(cantidadInput.value);

  if (isNaN(index) || index < 0 || isNaN(cantidad) || cantidad < 1) {
    return alert("Selecciona un producto y cantidad válida");
  }

  const producto = productos[index];

  const existente = carrito.find(p => p.codigo === producto.codigo);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    carrito.push({ ...producto, cantidad });
  }

  renderizarProductos();
  calcularTotal();
  select.value = '';
  cantidadInput.value = '1';
}

function renderizarProductos() {
  const contenedor = document.getElementById('lista-productos');
  contenedor.innerHTML = '';
  carrito.forEach((item, i) => {
    const subtotal = (item.precioVenta * item.cantidad).toFixed(2);
    const div = document.createElement('div');
    div.className = 'producto-item';
    div.innerHTML = `
      ${item.nombre} x ${item.cantidad} - $${subtotal}
      <button class="btn-eliminar" onclick="eliminarProducto(${i})">✖️</button>
    `;
    contenedor.appendChild(div);
  });
}

function eliminarProducto(index) {
  carrito.splice(index, 1);
  renderizarProductos();
  calcularTotal();
}

function calcularTotal() {
  const total = carrito.reduce((acc, item) => acc + (item.precioVenta * item.cantidad), 0);
  document.getElementById('total').textContent = total.toFixed(2);
}

window.addEventListener('DOMContentLoaded', () => {
  const fecha = obtenerFechaHoraActual();
  const fechaElem = document.getElementById('fecha-hora');
  if (fechaElem) fechaElem.textContent = fecha;
  initDB();

  const inputImportar = document.getElementById('importarInput');
  if (inputImportar) {
    inputImportar.addEventListener('change', importarBackup);
  }

  const inputBusqueda = document.getElementById('busqueda');
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
      const filtro = e.target.value.toLowerCase();
      const select = document.getElementById('producto');
      select.innerHTML = '<option value="">-- Selecciona un producto --</option>';
      productos
        .filter(p => p.nombre.toLowerCase().includes(filtro))
        .forEach((p, i) => {
          const opt = document.createElement('option');
          opt.value = productos.indexOf(p);
          opt.textContent = p.nombre;
          select.appendChild(opt);
        });
    });
  }
});

function aplicarFiltro() {
  const dia = document.getElementById('filtro-dia').value;
  const inicio = document.getElementById('filtro-semana-inicio').value;
  const fin = document.getElementById('filtro-semana-fin').value;

  const tx = db.transaction("ventas", "readonly");
  const store = tx.objectStore("ventas");
  const request = store.getAll();

  request.onsuccess = () => {
    const ventas = request.result;
    let filtradas = [];

    if (dia) {
      filtradas = ventas.filter(v => v.fecha.startsWith(formatearFechaHTML(dia)));
    } else if (inicio && fin) {
      const ini = new Date(inicio);
      const finDate = new Date(fin);
      filtradas = ventas.filter(v => {
        const [dd, mm, yyyy] = v.fecha.split(' ')[0].split('/');
        const fechaVenta = new Date(`${yyyy}-${mm}-${dd}`);
        return fechaVenta >= ini && fechaVenta <= finDate;
      });
    } else {
      alert("Selecciona un día o rango de semana");
      return;
    }

    renderizarResultadosHistorial(filtradas);
  };
}
function formatearFechaHTML(fechaInput) {
  const [yyyy, mm, dd] = fechaInput.split("-");
  return `${dd}/${mm}/${yyyy}`;
}
function renderizarResultadosHistorial(lista) {
  const contenedor = document.getElementById('resultados-historial');
  contenedor.innerHTML = '';

  if (lista.length === 0) {
    contenedor.style.display = 'none'; // Ocultar si no hay resultados
    contenedor.innerHTML = "<p style='text-align:center;'>❌ No hay ventas registradas para ese período.</p>";
    return;
  }

  contenedor.style.display = 'block'; // Mostrar si hay resultados

  lista
    .sort((a, b) => new Date(b.fecha.split(' ')[0].split('/').reverse().join('-')) - new Date(a.fecha.split(' ')[0].split('/').reverse().join('-')))
    .forEach((venta) => {
      const productos = venta.productos.map(p => `${p.nombre} x${p.cantidad}`).join(', ');
      const div = document.createElement('div');
      div.className = 'venta-item';
      div.innerHTML = `
        <p><strong>📄 Recibo #${venta.numeroTicket || '—'} del día</strong></p>
        <p><strong>📅 Fecha:</strong> ${venta.fecha}</p>
        <p><strong>🛒 Productos:</strong> ${productos}</p>
        <p><strong>💵 Total:</strong> $${venta.total.toFixed(2)}</p>
        ${venta.entrega ? `<p><strong>🚚 Entrega:</strong> ${venta.entrega}</p>` : ''}
        ${venta.comentario ? `<p><strong>📝 Comentario:</strong> ${venta.comentario}</p>` : ''}
        <hr>
      `;
      contenedor.appendChild(div);
    });
}

function aplicarFiltroSemanaResumen() {
  const inicio = document.getElementById('filtro-semana-inicio').value;
  const fin = document.getElementById('filtro-semana-fin').value;
  const contenedor = document.getElementById('resultados-historial');

  if (!inicio || !fin) {
    return alert('Selecciona un rango válido de fechas.');
  }

  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);
  fechaFin.setHours(23, 59, 59); // incluir todo el último día

  const tx = db.transaction('ventas', 'readonly');
  const store = tx.objectStore('ventas');
  const request = store.getAll();

  request.onsuccess = () => {
    const resumenProductos = {};
    let totalVendido = 0;
    let inversionTotal = 0;

    const ventasFiltradas = request.result.filter(v => {
      const [d, m, y] = v.fecha.split(' ')[0].split('/');
      const fechaVenta = new Date(`${y}-${m}-${d}`);
      return fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
    });

    if (ventasFiltradas.length === 0) {
      contenedor.innerHTML = '';
      contenedor.style.display = 'none';
      return;
    }

    contenedor.style.display = 'block';
    contenedor.innerHTML = '<h3>📦 Resumen por productos</h3><ul>';

    ventasFiltradas.forEach(venta => {
      venta.productos.forEach(p => {
        if (!resumenProductos[p.nombre]) {
          resumenProductos[p.nombre] = {
            cantidad: 0,
            precioCosto: p.precioCosto,
            precioVenta: p.precioVenta
          };
        }
        resumenProductos[p.nombre].cantidad += p.cantidad;
        totalVendido += p.precioVenta * p.cantidad;
        inversionTotal += p.precioCosto * p.cantidad;
      });
    });

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

    const ganancia = totalVendido - inversionTotal;

    contenedor.innerHTML += `
      <hr>
      <p><strong>💰 Total vendido:</strong> $${totalVendido.toFixed(2)}</p>
      <p><strong>📦 Inversión total:</strong> $${inversionTotal.toFixed(2)}</p>
      <p><strong>📈 Ganancia:</strong> $${ganancia.toFixed(2)}</p>
    `;
  };
}
