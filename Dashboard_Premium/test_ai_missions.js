import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env variables manually to avoid missing dotenv error
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    env[key.trim()] = valueParts.join('=').trim().replace(/['"]/g, '');
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAIFlow() {
  console.log("Iniciando prueba de fuego...");
  
  // 1. Fetch athletes
  const { data: athletes, error: athError } = await supabase
    .from('atletas')
    .select('id, usuarios!atletas_usuario_id_fkey ( nombre )');
    
  if (athError) {
    console.error("Error fetching athletes:", athError);
    return;
  }

  // Find Paulina, Jennifer, and 3 randoms
  const paulina = athletes.find(a => {
    const fullName = (a.usuarios?.nombre || '').toLowerCase();
    return fullName.includes('paulina');
  });
  const jennifer = athletes.find(a => {
    const fullName = (a.usuarios?.nombre || '').toLowerCase();
    return fullName.includes('jennifer');
  });
  
  const others = athletes.filter(a => a.id !== paulina?.id && a.id !== jennifer?.id && a.usuarios?.nombre);
  const randoms = others.sort(() => 0.5 - Math.random()).slice(0, 3);
  
  const testSubjects = [paulina, jennifer, ...randoms].filter(Boolean);
  
  console.log("Atletas seleccionados para la prueba:");
  testSubjects.forEach(a => console.log(`- ${a.usuarios.nombre} (ID: ${a.id})`));

  // 2. Insert evaluations to trigger the webhook
  for (const athlete of testSubjects) {
    const nombreAtleta = athlete.usuarios.nombre;
    console.log(`\nInsertando evaluación para ${nombreAtleta}...`);
    
    // We simulate a bad tier to ensure Gemini creates a specific training mission
    const { data: evalData, error: evalError } = await supabase
      .from('evaluaciones_pruebas')
      .insert({
        atleta_id: athlete.id,
        pilar: 'Fuerza',
        sub_pilar: 'Sentadilla Maxima',
        prueba_tipo: 'Físico',
        unidad: 'kg',
        puntuacion_normalizada: 30, // Score bajo
        tier: 'poor', // Esto asegura que salte la alarma en la Edge Function
        valor_crudo: 50
      })
      .select();

    if (evalError) {
      console.error(`Error insertando evaluación para ${athlete.nombres}:`, evalError);
    } else {
      console.log(`Evaluación insertada. El Webhook debería dispararse ahora en Supabase.`);
      console.log(`Esperando 5 segundos para que la IA responda...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 3. Check the misiones table for the AI generated mission
      const { data: misiones, error: missionError } = await supabase
        .from('misiones')
        .select('*')
        .eq('condicion_trigger', 'generado_por_ia')
        .eq('autor_id', athlete.id)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (missionError) {
        console.error("Error buscando la misión:", missionError);
      } else if (misiones && misiones.length > 0) {
        console.log(`✅ ¡Misión IA creada con éxito para ${nombreAtleta}!`);
        console.log(`Título: ${misiones[0].titulo}`);
        console.log(`Descripción: ${misiones[0].descripcion.substring(0, 100)}...`);
      } else {
        console.log(`❌ No se encontró ninguna misión IA generada para ${nombreAtleta}. Revisa los logs de Edge Functions en Supabase.`);
      }
    }
  }
}

testAIFlow();
