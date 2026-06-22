/**
 * Poneglyph_Black_Gold - Analíticas y Automatizaciones
 * Entorno: Google Apps Script (.gs)
 * Proyecto: Black Gold (Sucumbíos Small Ball)
 * Uso: Copiar y pegar en el editor de Apps Script de tu Google Sheet.
 */

const SHEET_ATLETAS = "Atletas_Black_Gold";
const COL_NOMBRE = 1;
const COL_POSICION = 2; // 1-2 (Generadores), 3 (3andD), 4 (Ala-Pívot Móvil), 5 (Ancla Fuerte)
const COL_FUERZA = 3; // Métrica 1-100 (Fuerza Isométrica)
const COL_EXPLOSIVIDAD = 4; // Métrica 1-100 (Aceleración y Salto)
const COL_DEFENSA = 5; // Métrica 1-100 (Box Out y Switching)
const COL_MAMBA_SCORE = 6; // Métrica 1-100 (Resiliencia y Presión)
const COL_ESTADO_ALERTA = 7; // Output Automatizado

/**
 * Función onEdit: Se dispara sola cada vez que alguien edita una celda en Google Sheets.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.source.getActiveSheet();
  
  // Solo evaluar si estamos en la hoja de Atletas
  if (sheet.getName() === SHEET_ATLETAS) {
    const fila = e.range.getRow();
    // No ejecutar en la fila 1 (encabezados)
    if (fila > 1) {
      evaluarAtleta(sheet, fila);
    }
  }
}

/**
 * Evalúa el rendimiento de un atleta en base a nuestra filosofía "Small Ball".
 * Pinta la celda de colores institucionales según el resultado.
 */
function evaluarAtleta(sheet, fila) {
  const fuerza = sheet.getRange(fila, COL_FUERZA).getValue();
  const explosividad = sheet.getRange(fila, COL_EXPLOSIVIDAD).getValue();
  const mambaScore = sheet.getRange(fila, COL_MAMBA_SCORE).getValue();
  const alertaCell = sheet.getRange(fila, COL_ESTADO_ALERTA);
  
  if (!fuerza || !explosividad || !mambaScore) return;
  
  let estado = "ÓPTIMO - SISTEMA ESTABLE";
  let color = "#1a1a1a"; // Negro mate (Identidad Black Gold)
  let fontColor = "#FFD700"; // Dorado 
  
  // Reglas Tácticas: La fuerza y la resiliencia no se negocian en Sucumbíos.
  if (mambaScore < 70) {
    estado = "ALERTA: Fractura de Mamba Mentality. Se requiere charla.";
    color = "#8B0000"; // Rojo oscuro sangre
    fontColor = "#FFFFFF";
  } else if (fuerza < 75 && explosividad < 75) {
    estado = "PELIGRO TÁCTICO: Biotipo insuficiente para Small Ball.";
    color = "#FF4500"; // Naranja alerta
    fontColor = "#000000";
  } else if (mambaScore >= 90 && fuerza >= 85 && explosividad >= 85) {
    estado = "ELITE - TITÁN DE SUCUMBÍOS";
    color = "#FFD700"; // Dorado puro
    fontColor = "#000000";
  }
  
  alertaCell.setValue(estado);
  alertaCell.setBackground(color);
  alertaCell.setFontColor(fontColor);
  alertaCell.setFontWeight("bold");
}

/**
 * Función Cron: Para ejecutarse todos los viernes por la noche automáticamente.
 * Realiza una auditoría a todo el equipo y manda un correo si la identidad se pierde.
 */
function auditoriaSemanalTripulacion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_ATLETAS);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  
  let totalMamba = 0;
  let count = 0;
  
  // Ignorar cabecera
  for (let i = 1; i < data.length; i++) {
    let score = data[i][COL_MAMBA_SCORE - 1]; // Índices en JS empiezan en 0
    if (typeof score === 'number') {
      totalMamba += score;
      count++;
    }
  }
  
  const promedioEquipo = count > 0 ? (totalMamba / count) : 0;
  
  if (promedioEquipo < 80) {
    // Aquí puedes cambiar el mail o integrar un webhook para que llegue a WhatsApp
    MailApp.sendEmail({
      to: "admin@blackgold.com",
      subject: "⚠️ ALERTA BLACK GOLD: Caída de Identidad Mamba",
      body: "Capitán, el Mamba Score promedio del equipo ha caído a " + promedioEquipo.toFixed(1) + 
            ". La dureza mental en Sucumbíos está en riesgo. Ajustar la presión en entrenamientos."
    });
  }
}
