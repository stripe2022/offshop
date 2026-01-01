// /src/pdf.js
// ✅ Generación PDF (Diario / Semanal)
// ✅ FIX: Orden alfabético real en semanal (y opción de ordenar también diario)
// Requiere que jsPDF + autoTable estén cargados (CDN o local) en el HTML.

import { formatearFechaHTML } from './utils.js';

export async function generarPdfConTabla({ tipoResumenActual }) {
  const contenedor = document.getElementById('resultados-historial');
  if (!contenedor || contenedor.innerHTML.trim() === '') {
    alert('❌ No hay datos para exportar a PDF.');
    return;
  }

  // Guard: si no cargó jsPDF, evita crash
  if (!window.jspdf?.jsPDF) {
    alert('❌ jsPDF no está disponible. Verifica la conexión (CDN) o las libs locales.');
    return;
  }

  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const hoy = new Date().toISOString().split('T')[0];
  const nombreArchivo = tipoResumenActual === 'semanal'
    ? `Resumen-Semanal-${hoy}.pdf`
    : `Resumen-Diario-${hoy}.pdf`;

  doc.setFontSize(14);
  doc.text("Resumen de Ventas - Barylie Shop", 10, 15);

  /* =========================
     PDF DIARIO
     - Se construye desde el DOM (.venta-item)
     - (Opcional) ordenar filas por columna "Productos"
  ========================= */
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

      rows.push([fila.recibo, fila.fecha, fila.productos, fila.total, fila.entrega]);
    });

    // ✅ Opcional: ordenar alfabéticamente por columna "Productos"
    // (si prefieres NO ordenar diario, borra estas 3 líneas)
    rows.sort((a, b) =>
      String(a[2] || '').localeCompare(String(b[2] || ''), 'es', { sensitivity: 'base' })
    );

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
  }

  /* =========================
     PDF SEMANAL
     - Se construye leyendo <li> del DOM
     - FIX: ordenar productos alfabéticamente A-Z
  ========================= */
  else if (tipoResumenActual === 'semanal') {
    const resumen = {};
    let total = '', inversion = '', ganancia = '';

    // Leer items del resumen semanal (li)
    const items = contenedor.querySelectorAll('li');
    items.forEach(li => {
      const nombre = li.querySelector('strong')?.textContent?.trim() || '';
      const textos = li.childNodes;

      let cantidad = 0, costo = 0, venta = 0, subtotal = 0;

      textos.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = node.textContent;
          const match = txt.match(/: (\d+) unidades/);
          if (match) cantidad = parseInt(match[1], 10);
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
          const spanTxt = node.textContent;

          // costo: "($X.XX"
          if (spanTxt.includes('($')) {
            costo = parseFloat(spanTxt.replace(/[^\d.]/g, '')) || 0;
          }
          // venta: "$X.XX)" pero NO "sub"
          else if (spanTxt.includes('$') && !spanTxt.includes('sub')) {
            venta = parseFloat(spanTxt.replace(/[^\d.]/g, '')) || 0;
          }
          // subtotal: "sub $X.XX"
          else if (spanTxt.includes('sub')) {
            subtotal = parseFloat(spanTxt.replace(/[^\d.]/g, '')) || 0;
          }
        }
      });

      if (nombre && cantidad > 0) {
        resumen[nombre] = { cantidad, costo, venta, subtotal };
      }
    });

    // Totales (p)
    const pTags = contenedor.querySelectorAll('p');
    pTags.forEach(p => {
      const txt = p.textContent;
      if (txt.includes('Total vendido')) total = (txt.split('$')[1] || '').trim();
      if (txt.includes('Inversión total')) inversion = (txt.split('$')[1] || '').trim();
      if (txt.includes('Ganancia')) ganancia = (txt.split('$')[1] || '').trim();
    });

    // ✅ FIX: ordenar alfabéticamente por nombre de producto
    const rowsSemanal = [];
    Object.keys(resumen)
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .forEach(nombre => {
        const { cantidad, costo, venta, subtotal } = resumen[nombre];
        rowsSemanal.push([
          nombre,
          `x${cantidad}`,
          `$${(+costo).toFixed(2)}`,
          `$${(+venta).toFixed(2)}`,
          `$${(+subtotal).toFixed(2)}`
        ]);
      });

    // Separador + totales al final
    rowsSemanal.push(['', '', '', '', '']);
    rowsSemanal.push(['Total vendido', '', '', '', `$${total}`]);
    rowsSemanal.push(['Inversión total', '', '', '', `$${inversion}`]);
    rowsSemanal.push(['Ganancia', '', '', '', `$${ganancia}`]);

    const ini = document.getElementById('filtro-semana-inicio')?.value;
    const fin = document.getElementById('filtro-semana-fin')?.value;
    doc.text(`Rango: ${formatearFechaHTML(ini)} — ${formatearFechaHTML(fin)}`, 10, 22);

    doc.autoTable({
      head: [["Producto", "Cantidad", "Costo", "Precio Venta", "Subtotal"]],
      body: rowsSemanal,
      startY: 32,
      styles: { fontSize: 9, cellPadding: 2 },
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

  // Si tipo no está seteado
  else {
    alert('❌ Tipo de resumen desconocido.');
    return;
  }

  doc.save(nombreArchivo);
}
