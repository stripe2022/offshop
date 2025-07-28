// app.js

let productos = [];
let ventas = [];
let carrito = [];

// Formatear fecha y hora en formato latino (Cuba)
function obtenerFechaHoraActual() {
  const ahora = new Date();
  const opciones = { year: 'numeric', month: '2-digit', day: '2-digit' };
  const fecha = ahora.toLocaleDateString('es-ES', opciones);

  let horas = ahora.getHours();
  let minutos = ahora.getMinutes();
  const ampm = horas >= 12 ? 'PM' : 'AM';
  horas = horas % 12;
  horas = horas ? horas : 12;
  minutos = minutos < 10 ? '0' + minutos : minutos;
  const hora = `${horas}:${minutos} ${ampm}`;

  return `${fecha} ${hora}`;
}

// Mostrar sección
function mostrar(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Volver a pantalla principal
function volver() {
  mostrar('pantalla-principal');
}

// Agregar producto al resumen
function agregarProducto() {
  const select = document.getElementById('producto');
  const cantidad = parseInt(document.getElementById('cantidad').value);
  if (!select.value || isNaN(cantidad) || cantidad <= 0) return;

  const prod = productos[parseInt(select.value)];
  if (!prod) return;

  const item = {
    nombre: prod.nombre,
    precio: prod.precioVenta,
    costo: prod.precioCosto,
    cantidad
  };

  carrito.push(item);
  renderizarProductos();
  calcularTotal();
}

// Renderizar productos añadidos
function renderizarProductos() {
  const lista = document.getElementById('lista-productos');
  lista.innerHTML = '';
  carrito.forEach((p, i) => {
    const div = document.createElement('div');
    div.classList.add('producto-item');
    div.innerHTML = `
      <span>${p.nombre} x${p.cantidad} - $${p.precio}</span>
      <button class="btn-eliminar" onclick="eliminarProducto(${i})">✖️</button>
    `;
    lista.appendChild(div);
  });
}

// Eliminar producto añadido
function eliminarProducto(index) {
  carrito.splice(index, 1);
  renderizarProductos();
  calcularTotal();
}

// Calcular total
function calcularTotal() {
  const total = carrito.reduce((sum, p) => sum + p.precio * p.cantidad, 0);
  document.getElementById('total').textContent = total.toFixed(2);
}

// Guardar venta
function guardarVenta() {
  if (carrito.length === 0) return alert("Agrega al menos un producto");

  const entrega = document.querySelector('input[name="entrega"]:checked').value;
  const comentario = document.getElementById('comentario')?.value || '';

  const venta = {
    id: crypto.randomUUID(),
    fecha: obtenerFechaHoraActual(),
    productos: carrito,
    total: parseFloat(document.getElementById('total').textContent),
    entrega,
    comentario
  };

  ventas.push(venta);
  carrito = [];
  renderizarProductos();
  calcularTotal();
  document.getElementById('comentario').value = '';
  document.getElementById('producto').value = '';
  document.getElementById('cantidad').value = '1';
  alert("✅ Venta guardada correctamente");
}

function actualizarTotalProductos() {
  const totalEl = document.getElementById('total-productos');
  if (totalEl) {
    totalEl.textContent = productos.length;
  } else {
    // Intenta actualizar directamente si no está presente (por compatibilidad con texto fijo)
    const footer = document.querySelector('.footer');
    if (footer) {
      const match = footer.innerHTML.match(/Total de productos: \d+/);
      if (match) {
        footer.innerHTML = footer.innerHTML.replace(/Total de productos: \d+/, `Total de productos: ${productos.length}`);
      }
    }
  }
}

// Importar ventas o productos desde archivo JSON
const importarInput = document.getElementById('importarInput');
if (importarInput) {
  importarInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const data = JSON.parse(event.target.result);
        const timestamp = Date.now();

        // Si es array => ventas
        if (Array.isArray(data)) {
          ventas = [...ventas, ...data];
          alert("✅ Ventas importadas exitosamente");
        }

        // Si tiene productos
        else if (data.productos && Array.isArray(data.productos)) {
          productos = data.productos;
          const select = document.getElementById('producto');
          select.innerHTML = '<option value="">-- Selecciona un producto --</option>';
          productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
          productos.forEach((p, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = p.nombre;
            select.appendChild(opt);
          });
          actualizarTotalProductos();
          alert("✅ Productos importados correctamente");
        } else {
          alert("⚠️ El archivo no tiene el formato esperado");
        }
      } catch (err) {
        console.error(err);
        alert("❌ Error al leer el archivo JSON");
      }
    };
    reader.readAsText(file);
    importarInput.value = '';
  });
}

// Inicializar datos al cargar
window.addEventListener('DOMContentLoaded', () => {
  const fecha = obtenerFechaHoraActual();
  document.getElementById('fecha-hora').textContent = fecha;

  fetch('productos.json')
    .then(res => res.json())
    .then(data => {
      productos = data.productos;
      const select = document.getElementById('producto');
      productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
      productos.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.nombre;
        select.appendChild(opt);
      });
      actualizarTotalProductos();
    });
});
