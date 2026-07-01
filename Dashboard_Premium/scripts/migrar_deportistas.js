import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

// Modo de ejecución: true = solo validar y reportar; false = escribir en Supabase
const SIMULAR = true;

// Resolver rutas
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
const excelPath = path.resolve(__dirname, '../../Deportistas_SUCUMBIOS_BALONCESTO pa george.xlsx');

// 1. Cargar variables de entorno manualmente
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

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: No se encontraron las credenciales de Supabase en el archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper para parsear fechas del Excel de forma robusta
function parseExcelDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  
  // Si viene como número de fecha de Excel
  if (typeof dateVal === 'number') {
    return new Date((dateVal - 25569) * 86400 * 1000);
  }
  
  // Si viene como string 'DD/MM/AAAA'
  const str = String(dateVal).trim();
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed en JS
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  
  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed);
}

// Helper para calcular Categoría FEB y Edad Deportiva para el año de temporada actual (2026)
function calcularCategoriaFEB(fechaNacimiento) {
  const fecha = parseExcelDate(fechaNacimiento);
  if (!fecha) return { edad: null, categoria: 'Por definir' };
  
  const anioNacimiento = fecha.getFullYear();
  const anioTemporada = 2026; // Año de corte del sistema
  const edadDeportiva = anioTemporada - anioNacimiento;
  
  let categoria = 'Por definir';
  if (edadDeportiva <= 6) categoria = 'Sub-6';
  else if (edadDeportiva <= 8) categoria = 'Sub-8';
  else if (edadDeportiva <= 10) categoria = 'Sub-10';
  else if (edadDeportiva <= 12) categoria = 'Sub-12';
  else if (edadDeportiva <= 15) categoria = 'Sub-15';
  else if (edadDeportiva <= 17) categoria = 'Sub-17';
  else categoria = 'Juvenil';
  
  return {
    edad: edadDeportiva,
    categoria,
    fechaFormateada: fecha.toISOString().split('T')[0]
  };
}

async function run() {
  console.log('=== BLACK GOLD — MIGRACIÓN INICIAL SUCUMBÍOS ===');
  console.log(`Modo de ejecución: ${SIMULAR ? '🔍 SIMULACIÓN (Seguro - Solo lectura)' : '🚀 MIGRACIÓN REAL (Inserción en BD)'}`);
  
  // 2. Probar conexión y detectar esquema de tablas
  console.log('\nAnalizando esquema de base de datos...');
  const { data: muestraAtletas, error: errAtleta } = await supabase.from('atletas').select('*').limit(1);
  const { data: muestraUsuarios, error: errUsuario } = await supabase.from('usuarios').select('*').limit(1);
  
  if (errAtleta || errUsuario) {
    console.error('Error conectando a Supabase o leyendo tablas:', errAtleta || errUsuario);
    process.exit(1);
  }
  
  const columnasAtletas = Object.keys(muestraAtletas[0] || {});
  const columnasUsuarios = Object.keys(muestraUsuarios[0] || {});
  console.log('Columnas en "usuarios":', columnasUsuarios);
  console.log('Columnas en "atletas":', columnasAtletas);
  
  // 3. Cargar y parsear archivo Excel
  console.log(`\nLeyendo archivo Excel: ${excelPath}`);
  if (!fs.existsSync(excelPath)) {
    console.error('Error: El archivo Excel no existe en la ruta:', excelPath);
    process.exit(1);
  }
  
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  let cantonActual = '';
  let categoriaExcel = '';
  const atletasRaw = [];
  
  rows.forEach((row, index) => {
    if (!row || row.length === 0) return;
    
    // Detectar nuevo cantón
    if (row[3] && String(row[3]).includes('---')) {
      cantonActual = String(row[3]).split('\n')[0].trim();
    }
    // Detectar nueva categoría del Excel
    else if (row[0] && row[0] !== 'Categoria' && row.slice(1).every(c => c === '' || c === undefined || c === null)) {
      categoriaExcel = String(row[0]).trim();
    }
    // Detectar fila de atleta (debe tener cédula no vacía en columna 2)
    else if (row[2] && String(row[2]).trim() !== '' && String(row[2]).trim() !== 'Cédula') {
      atletasRaw.push({
        index,
        canton: cantonActual || 'Sugerido',
        categoriaOriginal: categoriaExcel,
        cedula: String(row[2]).trim(),
        nombre: row[6] ? String(row[6]).trim() : '',
        genero: row[9] ? String(row[9]).trim() : 'M',
        fechaNacRaw: row[11],
        edadRaw: row[13],
        direccion: row[18] ? String(row[18]).trim() : '',
        telefonoRepresentante: row[20] ? String(row[20]).trim().replace(/[\s-]/g, '') : '',
        emailRepresentante: row[22] ? String(row[22]).trim() : '',
        etnia: row[row.length - 1] ? String(row[row.length - 1]).trim() : 'MESTIZO'
      });
    }
  });
  
  console.log(`Total de atletas detectados en el archivo: ${atletasRaw.length}`);
  
  // 4. Validar duplicados de cédula en el Excel mismo
  const cedulasVistas = new Set();
  const duplicadosExcel = [];
  atletasRaw.forEach(a => {
    if (cedulasVistas.has(a.cedula)) {
      duplicadosExcel.push(a);
    }
    cedulasVistas.add(a.cedula);
  });
  
  if (duplicadosExcel.length > 0) {
    console.log(`⚠️ Advertencia: Hay ${duplicadosExcel.length} cédulas duplicadas en el Excel.`);
    duplicadosExcel.slice(0, 5).forEach(d => console.log(`   - Cédula ${d.cedula} asociada a ${d.nombre}`));
  }
  
  // 5. Consultar usuarios existentes en la base de datos para ver colisiones
  console.log('\nConsultando registros existentes en la base de datos...');
  const { data: dbUsuarios, error: errDbUsers } = await supabase
    .from('usuarios')
    .select('id, cedula, rol, nombre');
    
  if (errDbUsers) {
    console.error('Error cargando usuarios de base de datos:', errDbUsers);
    process.exit(1);
  }
  
  const mapDbUsuarios = new Map();
  dbUsuarios.forEach(u => mapDbUsuarios.set(u.cedula, u));
  
  console.log(`Usuarios en la base de datos actualmente: ${dbUsuarios.length}`);
  
  // 6. Preparar lotes de inserción
  const listUsuariosNuevos = [];
  const listAtletasNuevos = [];
  const mapPadres = new Map(); // Agrupar representantes por teléfono para evitar duplicar padres
  const listVinculosPadres = [];
  
  let conteoExistentes = 0;
  let conteoNuevos = 0;
  
  atletasRaw.forEach(atleta => {
    // Calcular categoría FEB y validar fecha
    const infoFEB = calcularCategoriaFEB(atleta.fechaNacRaw);
    
    // Verificar si el deportista ya existe en la base de datos por Cédula
    const usuarioExistente = mapDbUsuarios.get(atleta.cedula);
    
    let usuarioId = '';
    let atletaId = '';
    
    if (usuarioExistente) {
      conteoExistentes++;
      usuarioId = usuarioExistente.id;
      // Nota: Si ya existe, no lo volveremos a insertar.
    } else {
      conteoNuevos++;
      // Generar UUIDs para inserción
      usuarioId = crypto.randomUUID();
      atletaId = crypto.randomUUID();
      
      // Armar registro para tabla usuarios
      const regUsuario = {
        id: usuarioId,
        cedula: atleta.cedula,
        nombre: atleta.nombre,
        rol: 'atleta',
        club: atleta.canton, // Mapeado al cantón como club o Black Gold por defecto
        categoria: infoFEB.categoria
      };
      
      // Agregar campos opcionales si existen en la BD
      if (columnasUsuarios.includes('fecha_nacimiento') && infoFEB.fechaFormateada) {
        regUsuario.fecha_nacimiento = infoFEB.fechaFormateada;
      }
      if (columnasUsuarios.includes('celular') && atleta.telefonoRepresentante) {
        // Celular atleta opcional (aquí solo tenemos el del representante, se puede dejar vacío o mapear)
      }
      if (columnasUsuarios.includes('correo') && atleta.emailRepresentante) {
        regUsuario.correo = atleta.emailRepresentante;
      }
      
      listUsuariosNuevos.push(regUsuario);
      
      // Armar registro para tabla atletas
      const regAtleta = {
        id: atletaId,
        usuario_id: usuarioId,
        edad: infoFEB.edad || 12,
        posicion: 'Por definir',
        deporte: 'Baloncesto',
        xp_total: 0,
        perfil_mental: 'Estable / Resistente',
        estado_recuperacion: 'Óptimo'
      };
      
      // Inicializar pilares de rendimiento dinámicamente si existen en la BD
      const pilares = ['fuerza', 'explosividad', 'movilidad', 'tiro', 'agilidad', 'tactica', 'resiliencia'];
      pilares.forEach(p => {
        if (columnasAtletas.includes(p)) regAtleta[p] = 0;
      });
      
      // Campos de salud renombrados (biomecánica)
      if (columnasAtletas.includes('restriccion_movilidad')) {
        regAtleta.restriccion_movilidad = 'Ninguna';
      }
      if (columnasAtletas.includes('prevencion_impacto')) {
        regAtleta.prevencion_impacto = false;
      }
      
      listAtletasNuevos.push(regAtleta);
    }
    
    // Procesar cuenta de Representante (Padre) si tiene teléfono
    if (atleta.telefonoRepresentante) {
      const telPadre = atleta.telefonoRepresentante;
      
      // Verificar si el padre ya existe en la base de datos (por su celular en el campo cedula)
      const padreExistenteDb = mapDbUsuarios.get(telPadre);
      let padreId = '';
      
      if (padreExistenteDb) {
        padreId = padreExistenteDb.id;
      } else {
        // Si no existe en BD, verificar si ya lo agregamos al mapa local en esta ejecución
        if (mapPadres.has(telPadre)) {
          padreId = mapPadres.get(telPadre).id;
        } else {
          // Crear nuevo registro de padre
          padreId = crypto.randomUUID();
          const regPadre = {
            id: padreId,
            cedula: telPadre, // Celular es su usuario de login
            nombre: `Representante de ${atleta.nombre.split(' ')[0]}`, // Nombre descriptivo inicial
            rol: 'padre',
            club: atleta.canton,
            categoria: infoFEB.categoria
          };
          
          if (columnasUsuarios.includes('telefono')) {
            regPadre.telefono = telPadre; // Necesario para validar su contraseña
          }
          if (columnasUsuarios.includes('correo') && atleta.emailRepresentante) {
            regPadre.correo = atleta.emailRepresentante;
          }
          
          mapPadres.set(telPadre, regPadre);
        }
      }
      
      // Si el deportista es nuevo, creamos el vínculo en padres_atletas
      // (Si no es nuevo, asumimos que el vínculo ya existe o se manejará por separado)
      if (!usuarioExistente && atletaId) {
        listVinculosPadres.push({
          id: crypto.randomUUID(), // si la tabla requiere un ID único
          padre_id: padreId,
          atleta_id: atletaId
        });
      }
    }
  });
  
  const listPadresNuevos = Array.from(mapPadres.values());
  
  console.log('\n--- RESUMEN DE PROCESAMIENTO ---');
  console.log(`Deportistas nuevos a crear: ${listUsuariosNuevos.length}`);
  console.log(`Deportistas ya existentes en la BD (se omitirán): ${conteoExistentes}`);
  console.log(`Cuentas de Representantes (Padres) nuevos a crear: ${listPadresNuevos.length}`);
  console.log(`Vínculos familiares (Padre - Hijo) a establecer: ${listVinculosPadres.length}`);
  
  if (SIMULAR) {
    console.log('\n[SIMULACIÓN] No se realizaron cambios en la base de datos.');
    console.log('Para subir los datos realmente, edita scripts/migrar_deportistas.js y cambia "const SIMULAR = true" a "const SIMULAR = false", y vuelve a ejecutarlo.');
    return;
  }
  
  // 7. MIGRACIÓN REAL — Inserción en bloques
  console.log('\n🚀 Iniciando inserción en la base de datos real de Supabase...');
  
  // A. Insertar usuarios (Atletas)
  if (listUsuariosNuevos.length > 0) {
    console.log(`Insertando ${listUsuariosNuevos.length} usuarios atletas...`);
    const { error: errInsUsers } = await supabase.from('usuarios').insert(listUsuariosNuevos);
    if (errInsUsers) {
      console.error('Error insertando usuarios atletas:', errInsUsers);
      process.exit(1);
    }
  }
  
  // B. Insertar atletas (Registros deportivos)
  if (listAtletasNuevos.length > 0) {
    console.log(`Insertando ${listAtletasNuevos.length} perfiles deportivos de atletas...`);
    const { error: errInsAtletas } = await supabase.from('atletas').insert(listAtletasNuevos);
    if (errInsAtletas) {
      console.error('Error insertando perfiles atletas:', errInsAtletas);
      process.exit(1);
    }
  }
  
  // C. Insertar usuarios (Padres)
  if (listPadresNuevos.length > 0) {
    console.log(`Insertando ${listPadresNuevos.length} usuarios representantes...`);
    const { error: errInsPadres } = await supabase.from('usuarios').insert(listPadresNuevos);
    if (errInsPadres) {
      console.error('Error insertando representantes:', errInsPadres);
      process.exit(1);
    }
  }
  
  // D. Insertar vínculos familiares
  if (listVinculosPadres.length > 0) {
    console.log(`Creando ${listVinculosPadres.length} relaciones padre-atleta...`);
    const { error: errInsVinculos } = await supabase.from('padres_atletas').insert(listVinculosPadres);
    if (errInsVinculos) {
      console.error('Error creando relaciones familiares:', errInsVinculos);
      process.exit(1);
    }
  }
  
  console.log('\n✨ ¡MIGRACIÓN COMPLETADA CON ÉXITO! ✨');
  console.log(`Se han creado ${listUsuariosNuevos.length} atletas y ${listPadresNuevos.length} padres en Supabase.`);
}

run().catch(console.error);
