import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';

const CLUBES = ['Black Gold', 'Titanes FC', 'Vipers AC'];
const CATEGORIAS = ['Sub-6', 'Sub-8', 'Sub-10', 'Sub-12', 'Sub-15'];
const POSICIONES = ['Base', 'Escolta', 'Alero', 'Ala-Pívot', 'Pívot'];

const ETAPAS = ['Iniciación', 'Especialización', 'Alto Rendimiento'];
const MENTALIDADES = ['Competitivo / Intenso', 'Estable / Resistente', 'Explosivo / Reactivo', 'Analítico / Concentrado'];
const RECUPERACION = ['Óptimo', 'Óptimo', 'Óptimo', 'Agotamiento Activo', 'Fatiga Silenciosa']; // Weighted towards Óptimo
const INTOLERANCIAS = ['Ninguna', 'Ninguna', 'Ninguna', 'Intolerancia a la Flexión', 'Intolerancia a la Extensión', 'Intolerancia a la Rotación con Extensión', 'Intolerancia a la Carga']; // Weighted towards Ninguna

const NOMBRES = ['Juan', 'Pedro', 'Miguel', 'Luis', 'Carlos', 'Andrés', 'Felipe', 'Santiago', 'Diego', 'Mateo', 'Sebastián', 'Alejandro', 'Daniel', 'David', 'Lucas', 'Nicolás', 'Martín', 'Gabriel', 'Tomás', 'Emiliano', 'Joaquín', 'Samuel', 'Benjamín', 'Leonardo', 'Maximiliano'];
const APELLIDOS = ['García', 'Rodríguez', 'Martínez', 'López', 'González', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Álvarez', 'Romero', 'Torres', 'Suárez', 'Ramírez', 'Flores', 'Vargas', 'Rojas', 'Molina', 'Castro', 'Ortiz', 'Silva', 'Ríos', 'Morales', 'Herrera'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getEdadByCategoria(categoria) {
  switch (categoria) {
    case 'Sub-6': return getRandomInt(5, 6);
    case 'Sub-8': return getRandomInt(7, 8);
    case 'Sub-10': return getRandomInt(9, 10);
    case 'Sub-12': return getRandomInt(11, 12);
    case 'Sub-15': return getRandomInt(13, 15);
    default: return 10;
  }
}

function getMetricRangeByCategoria(categoria) {
  switch (categoria) {
    case 'Sub-6': return { min: 10, max: 30 };
    case 'Sub-8': return { min: 20, max: 40 };
    case 'Sub-10': return { min: 30, max: 60 };
    case 'Sub-12': return { min: 40, max: 80 };
    case 'Sub-15': return { min: 60, max: 95 };
    default: return { min: 50, max: 50 };
  }
}

let sqlOut = `-- =====================================================\n`;
sqlOut += `-- Black Gold — Seed Masivo de Atletas\n`;
sqlOut += `-- Genera ~300 atletas distribuidos en 3 clubes y 5 categorías\n`;
sqlOut += `-- =====================================================\n\n`;

// To prevent foreign key constraints errors from breaking if order is weird, we'll use a transaction
sqlOut += `BEGIN;\n\n`;

let usuariosSQL = `INSERT INTO usuarios (id, cedula, nombre, rol, club, categoria) VALUES\n`;
let atletasSQL = `INSERT INTO atletas (id, usuario_id, edad, posicion, fuerza, explosividad, flexibilidad, eficiencia_tactica, resiliencia_psicologica, nutricion, hidratacion, xp_total, etapa_formacion, perfil_mental, estado_recuperacion, intolerancia_milo, alerta_talon, deporte) VALUES\n`;

const usuariosRows = [];
const atletasRows = [];

CLUBES.forEach(club => {
  CATEGORIAS.forEach(categoria => {
    // 15 to 20 athletes per category
    const numAtletas = getRandomInt(15, 20);
    
    for (let i = 0; i < numAtletas; i++) {
      const usuarioId = randomUUID();
      const atletaId = randomUUID();
      
      const cedula = getRandomInt(1000000000, 9999999999).toString();
      const nombre = `${getRandomItem(NOMBRES)} ${getRandomItem(APELLIDOS)}`;
      
      // Usuario
      usuariosRows.push(`('${usuarioId}', '${cedula}', '${nombre}', 'atleta', '${club}', '${categoria}')`);
      
      // Atleta params
      const edad = getEdadByCategoria(categoria);
      const pos = getRandomItem(POSICIONES);
      const range = getMetricRangeByCategoria(categoria);
      
      const fz = getRandomInt(range.min, range.max);
      const ex = getRandomInt(range.min, range.max);
      const fl = getRandomInt(range.min, range.max);
      const et = getRandomInt(range.min, range.max);
      const rp = getRandomInt(range.min, range.max);
      const nu = getRandomInt(range.min, range.max);
      const hd = getRandomInt(range.min, range.max);
      const xp = getRandomInt(0, 5000);
      
      const etapa = getRandomItem(ETAPAS);
      const mental = getRandomItem(MENTALIDADES);
      const recup = getRandomItem(RECUPERACION);
      const milon = getRandomItem(INTOLERANCIAS);
      const talon = Math.random() < 0.1 ? 'TRUE' : 'FALSE'; // 10% chance of heel drop alert
      const deporte = 'Baloncesto';
      
      atletasRows.push(`('${atletaId}', '${usuarioId}', ${edad}, '${pos}', ${fz}, ${ex}, ${fl}, ${et}, ${rp}, ${nu}, ${hd}, ${xp}, '${etapa}', '${mental}', '${recup}', '${milon}', ${talon}, '${deporte}')`);
    }
  });
});

usuariosSQL += usuariosRows.join(',\n') + ';\n\n';
atletasSQL += atletasRows.join(',\n') + ';\n\n';

sqlOut += usuariosSQL;
sqlOut += atletasSQL;

sqlOut += `COMMIT;\n`;

writeFileSync('seed_massive.sql', sqlOut, 'utf8');
console.log(`Generado seed_massive.sql con ${usuariosRows.length} atletas.`);
