import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, './.env');

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

const candidateTipos = [
  'youtube', 'articulo', 'video', 'texto', 'quiz', 'link', 'pdf',
  'fuerza', 'explosividad', 'movilidad', 'tiro', 'agilidad', 'tactica', 'resiliencia',
  'Fuerza', 'Explosividad', 'Movilidad', 'Tiro', 'Agilidad', 'Táctica', 'Resiliencia',
  'fisico', 'tecnico', 'mental',
  'Físico', 'Técnico', 'Mental',
  'Técnica', 'Táctica', 'Nutrición', 'Psicología'
];

async function testInsertions() {
  console.log("Testing candidate values for 'tipo' in 'misiones' table...");
  for (const tipo of candidateTipos) {
    const testMision = {
      titulo: `Test Mision for type ${tipo}`,
      descripcion: 'Temporary test description',
      tipo: tipo,
      video_url: 'https://youtube.com/watch?v=1bXoM0k7Y6A',
      xp_recompensa: 10,
      categoria_objetivo: 'Todas'
    };
    
    const { data, error } = await supabase
      .from('misiones')
      .insert(testMision)
      .select();
      
    if (error) {
      if (error.message.includes('violates check constraint')) {
        console.log(`❌ ${tipo}: REJECTED (violates check constraint)`);
      } else {
        console.log(`❓ ${tipo}: FAILED with error: ${error.message}`);
      }
    } else {
      console.log(`✅ ${tipo}: ACCEPTED!`);
      // Delete it to keep the database clean
      if (data && data[0]) {
        await supabase.from('misiones').delete().eq('id', data[0].id);
      }
    }
  }
}

testInsertions();
