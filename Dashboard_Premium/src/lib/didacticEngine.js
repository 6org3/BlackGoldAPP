// src/lib/didacticEngine.js
// Shim de compatibilidad: la lógica real vive en packages/analytics-core/didactica.js,
// compartida con blackgold-mcp (un solo motor de recomendación — ver
// packages/analytics-core/README.md). Se mantiene este archivo en su ruta original para
// no tocar los componentes que ya importan de 'src/lib/didacticEngine'.
export * from '../../../packages/analytics-core/didactica.js';
