import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const excelPath = path.resolve(__dirname, '../../Deportistas_SUCUMBIOS_BALONCESTO pa george.xlsx');

// Load environment variables manually
function loadEnv() {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value.trim();
      }
    });
  }
}
loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixGenders() {
  if (!fs.existsSync(excelPath)) {
    console.error('Error: Excel file does not exist at:', excelPath);
    return;
  }
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const athletesFromExcel = [];
  rows.forEach((row) => {
    if (!row || row.length === 0) return;
    if (row[2] && String(row[2]).trim() !== '' && String(row[2]).trim() !== 'Cédula') {
      const cedula = String(row[2]).trim();
      const nombre = row[6] ? String(row[6]).trim() : '';
      const excelGen = row[9] ? String(row[9]).trim() : 'M';
      const genero = excelGen === 'F' ? 'Femenino' : 'Masculino';
      athletesFromExcel.push({ cedula, nombre, genero });
    }
  });

  console.log(`Read ${athletesFromExcel.length} athletes from Excel.`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const athlete of athletesFromExcel) {
    const { data, error } = await supabase
      .from('usuarios')
      .update({ genero: athlete.genero })
      .eq('cedula', athlete.cedula)
      .select();

    if (error) {
      console.error(`Error updating athlete ${athlete.nombre} (${athlete.cedula}):`, error.message);
      errorCount++;
    } else if (data && data.length > 0) {
      updatedCount++;
      if (updatedCount % 50 === 0 || athlete.nombre.includes('Angela Solange')) {
        console.log(`Updated ${updatedCount} athletes. Last: ${athlete.nombre} -> ${athlete.genero}`);
      }
    }
  }

  console.log(`\n=== UPDATE COMPLETE ===`);
  console.log(`Successfully updated: ${updatedCount} athletes.`);
  console.log(`Errors encountered: ${errorCount}`);
}

fixGenders();
