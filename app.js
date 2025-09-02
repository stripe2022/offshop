// app.js

let productos = [];
let ventas = [];
let carrito = [];
let db;
let tipoResumenActual = ''; // Puede ser 'diario' o 'semanal'

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function initDB() {
  const request = indexedDB.open("barylieDB", 2);

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
    if (!db.objectStoreNames.contains("tickets")) {
  db.createObjectStore("tickets", { keyPath: "fecha" });
    }

  };
}



function obtenerFechaHoraActual() {
  const ahora = new Date();
  const opcionesFecha = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const opcionesHora = { hour: 'numeric', minute: '2-digit', hour12: true };
  return ahora.toLocaleDateString('es-ES', opcionesFecha) + ' ' + ahora.toLocaleTimeString('es-ES', opcionesHora);
}
function mostrarNumeroTicketActual() {
  obtenerNumeroTicketActual((numeroTicket) => {
    const numeroSpan = document.getElementById('numero-recibo');
    if (numeroSpan) {
      numeroSpan.textContent = numeroTicket; // próximo disponible
    }
  });
}


function obtenerNumeroTicketActual(callback) {
  const hoy = new Date().toISOString().split('T')[0];
  const tx = db.transaction("tickets", "readonly");
  const store = tx.objectStore("tickets");

  const req = store.get(hoy);
  req.onsuccess = () => {
    const ultimo = req.result?.ultimo || 0;
    callback(ultimo + 1);
  };
  req.onerror = () => {
    callback(1);
  };
}


function obtenerYActualizarNumeroTicket(callback) {
  const hoyISO = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const hoyDDMMYYYY = formatearFechaHTML(hoyISO);        // DD/MM/YYYY

  // Abrimos una transacción que abarque ambas stores para mantener consistencia
  const tx = db.transaction(['tickets', 'ventas'], 'readwrite');
  const ticketsStore = tx.objectStore('tickets');
  const ventasStore  = tx.objectStore('ventas');

  let ultimo = 0;
  let numeroAsignado = 1;

  // 1) Lee el último del día
  const reqTicket = ticketsStore.get(hoyISO);
  reqTicket.onsuccess = (e) => {
    ultimo = e.target.result?.ultimo || 0;

    // 2) Lee todas las ventas y detecta huecos del día actual
    const reqVentas = ventasStore.getAll();
    reqVentas.onsuccess = () => {
      const ventasHoy = reqVentas.result.filter(v => 
        typeof v.fecha === 'string' && v.fecha.startsWith(hoyDDMMYYYY)
      );

      const usados = new Set(
        ventasHoy
          .map(v => parseInt(v.numeroTicket, 10))
          .filter(n => Number.isInteger(n) && n > 0)
      );

      // 3) Encuentra el menor número no usado desde 1 hasta usados.size + 1
      // (si no hay huecos, será el siguiente a la mayor longitud)
      let candidato = 1;
      while (usados.has(candidato)) candidato++;

      // Si hay hueco (candidato <= ultimo), úsalo; si no, siguiente al último
      numeroAsignado = (candidato <= ultimo) ? candidato : (ultimo + 1);

      // 4) Actualiza "ultimo" a como mínimo el mayor alcanzado, nunca lo bajes
      const nuevoUltimo = Math.max(ultimo, numeroAsignado);
      ticketsStore.put({ fecha: hoyISO, ultimo: nuevoUltimo });

      // Log opcional para verificar
      console.log(`[Tickets] hoy=${hoyISO} ultimo=${ultimo} → asignado=${numeroAsignado} → guardado.ultimo=${nuevoUltimo}`);
    };

    reqVentas.onerror = (err) => {
      console.error('[Tickets] Error leyendo ventas para huecos', err);
      // Fallback: si falla la lectura de ventas, usa ultimo+1
      numeroAsignado = ultimo + 1;
      ticketsStore.put({ fecha: hoyISO, ultimo: numeroAsignado });
    };
  };

  reqTicket.onerror = (err) => {
    console.error('[Tickets] Error leyendo tickets[hoy], se usará 1', err);
    // No hay registro hoy: asigna 1 y créalo
    numeroAsignado = 1;
    ticketsStore.put({ fecha: hoyISO, ultimo: 1 });
  };

  tx.oncomplete = () => {
    // Devuelve el número listo para usar en la venta
    callback(numeroAsignado);
  };

  tx.onerror = (e) => {
    console.error('[Tickets] Transacción falló, devolviendo 1', e);
    callback(1);
  };

  tx.onabort = (e) => {
    console.error('[Tickets] Transacción abortada, devolviendo 1', e);
    callback(1);
  };
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

  const entregaSel = document.querySelector('input[name="entrega"]:checked');
  const entrega = entregaSel ? entregaSel.value : ''; // por si no hay selección
  const comentario = document.getElementById('comentario')?.value || '';

  obtenerYActualizarNumeroTicket((numeroTicket) => {
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

    tx.oncomplete = () => {
      ventas.push(venta);
      carrito = [];
      renderizarProductos();
      calcularTotal();
      const cmt = document.getElementById('comentario');
      if (cmt) cmt.value = '';
      const sel = document.getElementById('producto');
      if (sel) sel.value = '';
      const cant = document.getElementById('cantidad');
      if (cant) cant.value = '1';

      mostrarNumeroTicketActual();
      alert(`✅ Venta #${numeroTicket} guardada correctamente`);
    };

    tx.onerror = (e) => {
      console.error("❌ Error al guardar venta", e);
      alert("❌ Error al guardar la venta");
    };
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
  const inputImportarVentas = document.getElementById('importarVentasInput');
if (inputImportarVentas) {
  inputImportarVentas.addEventListener('change', importarVentas);
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
  tipoResumenActual = 'diario';
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
  .sort((a, b) => {
    // Orden principal: numeroTicket ASC
    const ta = Number.isFinite(+a.numeroTicket) ? +a.numeroTicket : Number.MAX_SAFE_INTEGER;
    const tb = Number.isFinite(+b.numeroTicket) ? +b.numeroTicket : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;

    // Fallback: por fecha ASC si falta numeroTicket o hay empate
    const fa = new Date(a.fecha.split(' ')[0].split('/').reverse().join('-'));
    const fb = new Date(b.fecha.split(' ')[0].split('/').reverse().join('-'));
    return fa - fb;
  })
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
      <button onclick="borrarVenta('${venta.id}')" style="background:red;color:white;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;">
        🗑 Borrar
      </button>
      <hr>
    `;
    contenedor.appendChild(div);
  });

}

function aplicarFiltroSemanaResumen() {
  tipoResumenActual = 'semanal';
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

async function generarPdfConTabla() {
  const contenedor = document.getElementById('resultados-historial');
  if (!contenedor || contenedor.innerHTML.trim() === '') {
    alert('❌ No hay datos para exportar a PDF.');
    return;
  }

  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const nombreArchivo = tipoResumenActual === 'semanal'
    ? `Resumen-Semanal-${new Date().toISOString().split('T')[0]}.pdf`
    : `Resumen-Diario-${new Date().toISOString().split('T')[0]}.pdf`;

  doc.setFontSize(14);
  doc.text("Resumen de Ventas - Barylie Shop", 10, 15);

  if (tipoResumenActual === 'diario') {
    const rows = [];

    const bloques = contenedor.querySelectorAll('.venta-item');
    bloques.forEach(bloque => {
      const datos = bloque.querySelectorAll('p');
      const fila = { recibo: '', fecha: '', productos: '', total: '', entrega: '' };

      datos.forEach(p => {
        const txt = p.textContent.trim();
        if (txt.includes("Recibo #")) fila.recibo = txt.replace("📄", "").trim();
        else if (txt.includes("Fecha:")) fila.fecha = txt.replace("📅", "").replace("Fecha:", "").trim();
        else if (txt.includes("Productos:")) fila.productos = txt.replace("🛒", "").replace("Productos:", "").trim();
        else if (txt.includes("Total:")) fila.total = txt.replace("💵", "").replace("Total:", "").trim();
        else if (txt.includes("Entrega:")) fila.entrega = txt.replace("🚚", "").replace("Entrega:", "").trim();
      });

      rows.push([
        fila.recibo,
        fila.fecha,
        fila.productos,
        fila.total,
        fila.entrega
      ]);
    });

    doc.autoTable({
      head: [["Recibo", "Fecha", "Productos", "Total", "Entrega"]],
      body: rows,
      startY: 20,
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 35 },
        2: { cellWidth: 60 },
        3: { halign: 'right' },
        4: { halign: 'center' }
      },
      didDrawPage: function () {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, 180, 290);
      }
    });

  } else if (tipoResumenActual === 'semanal') {
    const resumen = {};
    let total = '', inversion = '', ganancia = '';

    const items = contenedor.querySelectorAll('li');
    items.forEach(li => {
      const nombre = li.querySelector('strong')?.textContent?.trim() || '';
      const textos = li.childNodes;

      let cantidad = 0, costo = 0, venta = 0, subtotal = 0;

      textos.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = node.textContent;
          const match = txt.match(/: (\d+) unidades/);
          if (match) cantidad = parseInt(match[1]);
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
          const spanTxt = node.textContent;
          if (spanTxt.includes('($')) {
            costo = parseFloat(spanTxt.replace(/[^\d.]/g, ''));
          } else if (spanTxt.includes('$') && !spanTxt.includes('sub')) {
            venta = parseFloat(spanTxt.replace(/[^\d.]/g, ''));
          } else if (spanTxt.includes('sub')) {
            subtotal = parseFloat(spanTxt.replace(/[^\d.]/g, ''));
          }
        }
      });

      if (nombre && cantidad > 0) {
        resumen[nombre] = { cantidad, costo, venta, subtotal };
      }
    });

    const pTags = contenedor.querySelectorAll('p');
    pTags.forEach(p => {
      const txt = p.textContent;
      if (txt.includes('Total vendido')) total = txt.split('$')[1];
      if (txt.includes('Inversión total')) inversion = txt.split('$')[1];
      if (txt.includes('Ganancia')) ganancia = txt.split('$')[1];
    });

    const rowsSemanal = [];
    for (const nombre in resumen) {
      const { cantidad, costo, venta, subtotal } = resumen[nombre];
      rowsSemanal.push([
        nombre,
        `x${cantidad}`,
        `$${parseFloat(costo).toFixed(2)}`,
        `$${parseFloat(venta).toFixed(2)}`,
        `$${parseFloat(subtotal).toFixed(2)}`
      ]);
    }

    rowsSemanal.push(['', '', '', '', '']);
    rowsSemanal.push(['Total vendido', '', '', '', `$${total}`]);
    rowsSemanal.push(['Inversión total', '', '', '', `$${inversion}`]);
    rowsSemanal.push(['Ganancia', '', '', '', `$${ganancia}`]);
    doc.text(`Rango: ${formatearFechaHTML(document.getElementById('filtro-semana-inicio').value)} — ${formatearFechaHTML(document.getElementById('filtro-semana-fin').value)}`, 10, 22);

    doc.autoTable({
      head: [["Producto", "Cantidad", "Costo", "Precio Venta", "Subtotal"]],
      body: rowsSemanal,
      startY: 32,
      styles: {
        fontSize: 9,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { halign: 'center' },
        2: { textColor: 'red' },
        3: { textColor: 'green' },
        4: { halign: 'right', textColor: 'black' }
      },
      headStyles: {
        fillColor: [255, 182, 193],
        textColor: 0,
        fontStyle: 'bold'
      },
      didDrawPage: function () {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, 180, 290);
      }
    });
  }

  doc.save(nombreArchivo);
}




document.getElementById('generarPdf')?.addEventListener('click', generarPdfConTabla);


function exportarVentas() {
  if (!db) {
    alert("La base de datos aún no está lista. Intenta de nuevo en unos segundos.");
    return;
  }

  const tx = db.transaction("ventas", "readonly");
  const store = tx.objectStore("ventas");
  const request = store.getAll();

  request.onsuccess = () => {
    const ventas = request.result;

    const json = JSON.stringify({ ventas }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  };

  request.onerror = () => {
    alert("❌ Error al exportar ventas");
  };
}
function importarVentas(event) {
  const file = event.target.files[0];
  if (!file) {
    alert("❌ No se seleccionó ningún archivo");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (!Array.isArray(backup.ventas)) {
        throw new Error("❌ El archivo no contiene un array 'ventas'");
      }

      const tx = db.transaction("ventas", "readwrite");
      const store = tx.objectStore("ventas");

      backup.ventas.forEach(venta => {
        if (venta.id && venta.fecha && Array.isArray(venta.productos)) {
          store.put(venta);
        } else {
          console.warn("❗ Venta ignorada por formato incorrecto:", venta);
        }
      });

      tx.oncomplete = () => {
        alert("✅ Ventas importadas correctamente");
        console.log("Ventas importadas:", backup.ventas);
      };

      tx.onerror = (e) => {
        console.error("❌ Error durante la transacción de importación", e);
        alert("❌ Error al importar ventas");
      };

    } catch (e) {
      console.error("❌ Error al leer el archivo JSON", e);
      alert("❌ Archivo inválido o corrupto");
    }
  };

  reader.readAsText(file);
}

function borrarVenta(idVenta) {
  if (!confirm("⚠️ ¿Seguro que quieres borrar este ticket? Esta acción no se puede deshacer.")) return;

  const tx = db.transaction("ventas", "readwrite");
  const store = tx.objectStore("ventas");
  store.delete(idVenta);

  tx.oncomplete = () => {
    alert("✅ Ticket borrado correctamente");
    aplicarFiltro(); // vuelve a cargar la lista filtrada
  };

  tx.onerror = (e) => {
    console.error("❌ Error al borrar venta", e);
    alert("❌ Error al borrar el ticket");
  };
}

