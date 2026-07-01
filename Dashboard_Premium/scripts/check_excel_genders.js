import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = path.resolve(__dirname, '../Deportistas_SUCUMBIOS_BALONCESTO pa george.xlsx');

async function checkExcel() {
  if (!fs.existsSync(excelPath)) {
    console.error('Error: Excel file does not exist at:', excelPath);
    return;
  }
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log("Headers (first 3 rows):");
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    console.log(`Row ${i}:`, rows[i]);
  }
  
  // Count genders in row[9]
  const genders = {};
  let athletesCount = 0;
  
  rows.forEach((row, index) => {
    if (!row || row.length === 0) return;
    if (row[2] && String(row[2]).trim() !== '' && String(row[2]).trim() !== 'Cédula') {
      const g = row[9] ? String(row[9]).trim() : 'MISSING';
      genders[g] = (genders[g] || 0) + 1;
      athletesCount++;
      if (String(row[6]).includes('Angela Solange') || String(row[6]).includes('Kiara Eilyn')) {
        console.log(`Athlete: ${row[6]}, Excel Row Gender: ${g}`);
      }
    }
  });
  
  console.log(`Total athletes: ${athletesCount}`);
  console.log("Gender distribution in Excel:", genders);
}

checkExcel();
