// src/lib/baremosEngine.js
// Shim de compatibilidad: la lógica real vive en packages/analytics-core/baremos.js,
// compartida con blackgold-mcp (ver packages/analytics-core/README.md). Se mantiene
// este archivo en su ruta original para no tener que tocar los ~20 archivos que ya
// importan de 'src/lib/baremosEngine'.
export * from '../../../packages/analytics-core/baremos.js';

// Re-export legacy functions for backward compatibility
export { NIVELES_BAREMO } from './baremosEngine_legacy';
