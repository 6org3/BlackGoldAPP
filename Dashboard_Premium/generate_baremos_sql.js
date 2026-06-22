import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const baremosPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src', 'lib', 'baremosEngine.js');
const fileContent = fs.readFileSync(baremosPath, 'utf8');

// Use simple eval to extract the BAREMOS object (since it's a local trusted file)
let BAREMOS;
const match = fileContent.match(/const BAREMOS = (\{[\s\S]*?\n\});/);
if (match) {
  // We need to carefully parse or eval the object literal
  const objStr = match[1];
  // Since it's JS, eval is easiest
  BAREMOS = eval(`(${objStr})`);
}

if (!BAREMOS) {
  console.error('No se pudo extraer BAREMOS');
  process.exit(1);
}

const sqlStatements = [];
sqlStatements.push('-- Archivo Auto-generado de Seed para catalogo_ejercicios');

for (const [key, obj] of Object.entries(BAREMOS)) {
  const nombre = obj.label.replace(/'/g, "''");
  const desc = obj.descripcion ? obj.descripcion.replace(/'/g, "''") : '';
  const pilar = obj.pilar;
  const sub_pilar = obj.sub_pilar;
  const tren = obj.tren ? `'${obj.tren}'` : 'NULL';
  const unidad = obj.unidad;
  const invertido = obj.tipo === 'menos_es_mejor' ? 'true' : 'false';
  const thresholds = JSON.stringify(obj.thresholds).replace(/'/g, "''");
  const inputs = obj.inputs_requeridos ? `'${JSON.stringify(obj.inputs_requeridos).replace(/'/g, "''")}'::jsonb` : 'NULL';
  
  // Guardamos con la key_original
  sqlStatements.push(`INSERT INTO catalogo_ejercicios (id, nombre, descripcion, pilar, sub_pilar, tren, unidad, invertido, thresholds, inputs_requeridos, club_id) VALUES (gen_random_uuid(), '${nombre}', '${desc}', '${pilar}', '${sub_pilar}', ${tren}, '${unidad}', ${invertido}, '${thresholds}'::jsonb, ${inputs}, NULL);`);
}

const outputPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed_ejercicios.sql');
fs.writeFileSync(outputPath, sqlStatements.join('\n'));
console.log('SQL generado en', outputPath);
