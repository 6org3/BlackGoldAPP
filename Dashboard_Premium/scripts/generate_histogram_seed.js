import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple manual .env parser
function loadEnv() {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'YOUR_URL';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a logical progression score based on the month offset
// monthOffset: -2 (2 months ago), -1 (last month), 0 (this month)
function getScoreByMonth(monthOffset) {
  if (monthOffset === -2) return randomInt(35, 55); // Starting low
  if (monthOffset === -1) return randomInt(50, 70); // Getting better
  return randomInt(65, 90); // Current month, performing well!
}

async function generateSeed() {
  console.log('Fetching athletes...');
  const { data: atletasData, error: errAtletas } = await supabase
    .from('atletas')
    .select('id, usuarios!atletas_usuario_id_fkey(nombre)');

  if (errAtletas || !atletasData) {
    console.error('Error fetching athletes:', errAtletas);
    return;
  }

  // Flatten the array to easily filter names
  const atletas = atletasData.map(a => ({
    id: a.id,
    nombre: a.usuarios?.nombre || 'Unknown'
  }));

  // We look for One Piece mock names, or just take all if there are few
  const targetNames = ['Luffy', 'Zoro', 'Sanji', 'Nami', 'Usopp', 'Chopper', 'Robin', 'Franky', 'Brook', 'Jinbe'];
  const testAtletas = atletas.filter(a => targetNames.some(n => a.nombre.includes(n))) || atletas.slice(0, 5);
  
  if (testAtletas.length === 0) {
    console.log('No target athletes found. Using all available...');
    testAtletas.push(...atletas);
  } else {
    console.log(`Found ${testAtletas.length} target athletes (One Piece themed).`);
  }

  console.log('Fetching ejercicios...');
  const { data: ejercicios, error: errEjer } = await supabase
    .from('catalogo_ejercicios')
    .select('id, nombre, pilar, sub_pilar, unidad')
    .limit(10);

  if (errEjer || !ejercicios || ejercicios.length === 0) {
    console.error('Error fetching ejercicios or no catalog available. Did you run seed_ejercicios.sql?');
    return;
  }

  const sqlStatements = [];
  sqlStatements.push('-- Archivo de Seed para Histogramas (Progresión 3 meses)');
  sqlStatements.push('BEGIN;');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Generate for -2, -1, 0 months
  for (let monthOffset = -2; monthOffset <= 0; monthOffset++) {
    // Determine the month and year
    let targetMonth = currentMonth + monthOffset;
    let targetYear = currentYear;
    if (targetMonth < 0) {
      targetMonth += 12;
      targetYear -= 1;
    }

    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    // Simulate 8 sessions per month (approx 2 per week)
    const sessionDays = [];
    while (sessionDays.length < 8) {
      const d = randomInt(1, daysInMonth);
      if (!sessionDays.includes(d)) sessionDays.push(d);
    }
    sessionDays.sort((a,b) => a-b);

    for (const atleta of testAtletas) {
      for (const day of sessionDays) {
        // Pick a random exercise to evaluate
        const ej = ejercicios[randomInt(0, ejercicios.length - 1)];
        
        // Random score progression
        const score = getScoreByMonth(monthOffset);
        
        // Date format: YYYY-MM-DD
        const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')} 15:30:00+00`;

        sqlStatements.push(`INSERT INTO evaluaciones_pruebas (id, atleta_id, prueba_tipo, valor_crudo, lado, unidad, pilar, sub_pilar, tren, tier, puntuacion_normalizada, notas, created_at) VALUES (gen_random_uuid(), '${atleta.id}', '${ej.nombre}', ${randomInt(10, 50)}, 'unico', '${ej.unidad}', '${ej.pilar}', '${ej.sub_pilar}', NULL, 'average', ${score}, 'Sesión generada para probar histograma', '${dateStr}');`);
      }
    }
  }

  sqlStatements.push('COMMIT;');

  const outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed_histogramas.sql');
  fs.writeFileSync(outputPath, sqlStatements.join('\n'));
  console.log(`\n¡Listo! SQL generado con ${sqlStatements.length - 2} evaluaciones en ${outputPath}`);
}

generateSeed();
