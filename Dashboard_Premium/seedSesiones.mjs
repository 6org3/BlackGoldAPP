import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Cargar variables de entorno manually si dotenv no detecta el archivo .env
const envFile = fs.readFileSync('.env', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
});

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function seed() {
  console.log('Iniciando Seeding de Sesiones...');

  // 1. Obtener datos base
  const { data: coaches } = await supabase.from('usuarios').select('id').in('rol', ['coach', 'superadmin', 'owner']);
  const { data: atletas } = await supabase.from('atletas').select('id, grupo_id, usuario_id');
  const { data: grupos } = await supabase.from('grupos_entrenamiento').select('id, nombre');
  const { data: ejercicios } = await supabase.from('ejercicios_catalogo').select('id, tipo');

  if (!coaches || coaches.length === 0) throw new Error('No hay coaches');
  if (!atletas || atletas.length === 0) throw new Error('No hay atletas');
  if (!grupos || grupos.length === 0) throw new Error('No hay grupos');

  const coachId = coaches[0].id;
  const sesionesTotales = [];

  // Función auxiliar para fechas pasadas (últimos 30 días)
  const getRandomDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - randomInt(1, 30));
    return d.toISOString().split('T')[0];
  };

  const resultados = ['Sí', 'Parcial', 'No'];

  // A. SESIONES GRUPALES (10 por categoría)
  for (const grupo of grupos) {
    for (let i = 0; i < 15; i++) {
      const isTecnico = Math.random() > 0.5;
      const objTipo = isTecnico ? 'Técnico' : 'Físico';
      const ejerciciosFiltrados = ejercicios.filter(e => e.tipo === objTipo).map(e => e.id);
      const ejsSeleccionados = [];
      if (ejerciciosFiltrados.length > 0) {
        ejsSeleccionados.push(getRandomItem(ejerciciosFiltrados));
        if (Math.random() > 0.5 && ejerciciosFiltrados.length > 1) {
           ejsSeleccionados.push(getRandomItem(ejerciciosFiltrados));
        }
      }

      sesionesTotales.push({
        tipo: 'Grupal',
        grupo_id: grupo.id,
        coach_id: coachId,
        fecha: getRandomDate(),
        objetivo_tipo: objTipo,
        objetivo_descripcion: `Desarrollo de habilidades para el grupo ${grupo.nombre} - Sesión #${i + 1}`,
        ejercicios_ids: ejsSeleccionados,
        ejercicios_notas: 'Buen esfuerzo general del grupo. Algunos problemas de concentración en la segunda mitad.',
        se_logro: getRandomItem(resultados),
        notas_evaluacion: 'Se recomienda repasar los fundamentos la próxima semana.'
      });
    }
  }

  // B. SESIONES INDIVIDUALES (10 sesiones repartidas en 4 atletas aleatorios)
  // Seleccionar 4 atletas
  const atletasIndiv = [];
  for(let i = 0; i < 4; i++) {
    atletasIndiv.push(getRandomItem(atletas));
  }

  for (let i = 0; i < 12; i++) {
    const atleta = getRandomItem(atletasIndiv);
    const objTipo = 'Técnico';
    const ejerciciosFiltrados = ejercicios.filter(e => e.tipo === objTipo).map(e => e.id);
    const ejsSeleccionados = ejerciciosFiltrados.length > 0 ? [getRandomItem(ejerciciosFiltrados)] : [];

    sesionesTotales.push({
      tipo: 'Individual',
      atleta_id: atleta.id,
      coach_id: coachId,
      fecha: getRandomDate(),
      objetivo_tipo: objTipo,
      objetivo_descripcion: 'Corrección de tiro y postura. Trabajo de footwork específico.',
      ejercicios_ids: ejsSeleccionados,
      ejercicios_notas: 'Mejora notable en el release del balón. Mantener el codo alineado.',
      se_logro: 'Sí',
      notas_evaluacion: '¡Excelente sesión! NOTA PRIVADA PADRE: Vemos un avance increíble en su técnica de tiro. Por favor asegúrense de que descanse bien esta semana, ha trabajado muy duro.',
      es_pago_extra: true,
      monto_extra: 20.00
    });
  }

  // Insertar en lotes
  const chunkSize = 20;
  for (let i = 0; i < sesionesTotales.length; i += chunkSize) {
    const chunk = sesionesTotales.slice(i, i + chunkSize);
    const { error } = await supabase.from('sesiones_control').insert(chunk);
    if (error) {
      console.error('Error insertando chunk:', error);
    } else {
      console.log(`Insertadas ${chunk.length} sesiones...`);
    }
  }

  console.log('¡Seeding completado exitosamente!');
}

seed().catch(console.error);
