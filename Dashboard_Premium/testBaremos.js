import { calcularBaremo, calcularIndicesAntropometricos } from './src/lib/baremosEngine.js';

// TEST 1: ABDOMINALES (Más es mejor)
// Mínimo = 10, Máximo = 50. Amplitud = 8
console.log('--- TEST 1: ABDOMINALES (Más es mejor) [MIN: 10, MAX: 50] ---');
const abdominales = [
  { nombre: 'Mateo', repeticiones: 45 },
  { nombre: 'Santiago', repeticiones: 35 },
  { nombre: 'Alejandro', repeticiones: 28 },
  { nombre: 'Diego', repeticiones: 22 },
  { nombre: 'Nicolás', repeticiones: 15 },
];

abdominales.forEach(a => {
  const baremo = calcularBaremo(a.repeticiones, 10, 50, 'mas_es_mejor');
  console.log(`${a.nombre} (${a.repeticiones} reps) -> ${baremo.nombre} [Radar: ${baremo.porcentajeRadar}%]`);
});


// TEST 2: VELOCIDAD 50m (Menos es mejor)
// Mínimo (Mejor) = 8.15, Máximo (Peor) = 9.28. Amplitud = 0.28
console.log('\n--- TEST 2: VELOCIDAD 50m (Menos es mejor) [MIN(Mejor): 8.15, MAX(Peor): 9.28] ---');
const velocidad = [
  { nombre: 'Mateo', tiempo: 8.2 },
  { nombre: 'Santiago', tiempo: 8.6 },
  { nombre: 'Alejandro', tiempo: 8.85 },
  { nombre: 'Diego', tiempo: 9.15 },
  { nombre: 'Nicolás', tiempo: 9.25 },
];

velocidad.forEach(a => {
  const baremo = calcularBaremo(a.tiempo, 8.15, 9.28, 'menos_es_mejor');
  console.log(`${a.nombre} (${a.tiempo} seg) -> ${baremo.nombre} [Radar: ${baremo.porcentajeRadar}%]`);
});

// TEST 3: ÍNDICES ANTROPOMÉTRICOS
console.log('\n--- TEST 3: ÍNDICES ANTROPOMÉTRICOS ---');
const antro = calcularIndicesAntropometricos(85, 175, 185); 
console.log(`Talla Pie: 175cm, Sentado: 85cm, Envergadura: 185cm`);
console.log(`Índice Córmico: ${antro.cormico} -> ${antro.perfilCormico}`);
console.log(`Índice de Brazada: ${antro.brazada} -> ${antro.perfilBrazada}`);
