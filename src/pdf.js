import { formatearFechaHTML } from './utils.js';

export async function generarPdfConTabla({ tipoResumenActual }) {
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

      rows.push([fila.recibo, fila.fecha, fila.productos, fila.total, fila.entrega]);
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
    // Reutiliza DOM existente (como tú haces)
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

      if (nombre && cantidad > 0) resumen[nombre] = { cantidad, costo, venta, subtotal };
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
      headStyles: { fillColor: [255, 182, 193], textColor: 0, fontStyle: 'bold' },
      didDrawPage: function () {
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Página ${doc.internal.getNumberOfPages()}`, 180, 290);
      }
    });
  }

  doc.save(nombreArchivo);
}
