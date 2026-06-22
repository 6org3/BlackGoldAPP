/**
 * Poneglyph API (Backend)
 * Despliega este script como "Aplicación Web" (Web App) en Google Apps Script.
 * Permite que tu Dashboard Premium lea la tabla de Atletas en tiempo real por internet.
 */

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Atletas_Black_Gold");
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Hoja no encontrada" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const jsonArray = [];

  // Empezamos desde 1 para ignorar los encabezados (Fila 1 en UI, índice 0 en Array)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    jsonArray.push({
      id: i,
      nombre: row[0] || "Desconocido",
      posicion: row[1] || "Sin asignar",
      fuerza: Number(row[2]) || 0,
      explosividad: Number(row[3]) || 0,
      defensa: Number(row[4]) || 0,
      mambaScore: Number(row[5]) || 0
    });
  }

  // Devolvemos los datos en formato JSON para que React los entienda
  return ContentService.createTextOutput(JSON.stringify(jsonArray))
    .setMimeType(ContentService.MimeType.JSON);
}
