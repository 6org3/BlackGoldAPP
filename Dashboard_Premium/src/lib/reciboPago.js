// Genera un recibo de pago en PDF (constancia para el padre cuando pagó,
// especialmente en efectivo). Reusa jsPDF, ya presente en el proyecto (se
// importa dinámicamente para no engordar el bundle inicial).

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function conceptoDe(pago) {
  if (pago.concepto) return pago.concepto;
  if (pago.tipo === 'Mensualidad' && pago.mes) return `Mensualidad ${MESES[pago.mes]} ${pago.anio}`;
  return pago.tipo || 'Pago';
}

/**
 * @param {object} pago  fila de `pagos` (con monto_final, forma_pago, fecha_pago, id…)
 * @param {object} opts  { atletaNombre, club }
 */
export async function generarReciboPDF(pago, { atletaNombre = '—', club = 'Black Gold' } = {}) {
  const { jsPDF } = await import('jspdf');
  // A6 apaisado: tamaño de recibo, cómodo de compartir/imprimir.
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a6' });
  const W = doc.internal.pageSize.getWidth();

  const dorado = [201, 162, 39];
  const gris = [90, 90, 90];

  // Encabezado
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(...dorado);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(club.toUpperCase(), 10, 11);
  doc.setTextColor(230, 230, 230);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('RECIBO DE PAGO', 10, 17);
  doc.setFontSize(7);
  doc.text(`N.º ${String(pago.id || '').slice(0, 8)}`, W - 10, 17, { align: 'right' });

  // Cuerpo
  let y = 32;
  const linea = (etiqueta, valor, destacar = false) => {
    doc.setTextColor(...gris);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(etiqueta, 10, y);
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', destacar ? 'bold' : 'normal');
    doc.setFontSize(destacar ? 13 : 9);
    doc.text(String(valor), W - 10, y, { align: 'right' });
    y += destacar ? 11 : 8;
  };

  linea('Atleta', atletaNombre);
  linea('Concepto', conceptoDe(pago));
  linea('Monto', `$${Number(pago.monto_final || 0).toFixed(2)}`, true);
  linea('Forma de pago', pago.forma_pago || '—');
  linea('Fecha de pago', pago.fecha_pago || '—');

  // Pie
  doc.setDrawColor(220, 220, 220);
  doc.line(10, y, W - 10, y);
  y += 6;
  doc.setTextColor(...gris);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text('Gracias por estar al día. ¡Nos vemos en la cancha!', 10, y);

  const safe = String(atletaNombre).replace(/\s+/g, '_');
  doc.save(`Recibo_${safe}_${conceptoDe(pago).replace(/\s+/g, '_')}.pdf`);
}
