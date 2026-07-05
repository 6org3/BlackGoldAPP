// src/api/tablas.js
// Nombres de tablas cuya confusión ha sido una trampa de mantenimiento real.
//
// Hay DOS catálogos con nombres ESPEJO (invertidos) que son DOMINIOS DISTINTOS y NO
// deben fusionarse:
//
//   TABLA_PRUEBAS_EVALUACION       = 'catalogo_ejercicios'
//     Pruebas científicas de evaluación (columnas thresholds, baremo_key, sub_pilar,
//     tren…). Las usa EvaluacionModal / NuevaPruebaModal y el sync desde BAREMOS.
//
//   TABLA_EJERCICIOS_ENTRENAMIENTO = 'ejercicios_catalogo'
//     Drills/ejercicios de una sesión de entrenamiento (columnas tipo,
//     grupos_recomendados, descripcion). Los usa Control de Sesiones (AdminSesiones).
//
// Usar estas constantes en vez de los literales evita invertir los nombres por error.
// (Un rename de la tabla física en producción para eliminar el espejo sería una
// migración aparte, con coordinación de deploy — ver docs/unificacion_sesiones_cancha_evaluacion.md.)
export const TABLA_PRUEBAS_EVALUACION = 'catalogo_ejercicios';
export const TABLA_EJERCICIOS_ENTRENAMIENTO = 'ejercicios_catalogo';
