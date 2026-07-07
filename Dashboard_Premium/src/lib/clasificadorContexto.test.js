import { describe, it, expect } from 'vitest';
import { clasificarContextoMision } from '../../../packages/analytics-core/clasificadorContexto.js';

// Casos oro derivados de la exploración 2026-07-07 (universo real de misiones del club).
describe('clasificarContextoMision', () => {
  it('sentadilla con barra / 1RM → cancha (ejercicio de gym, no-misión)', () => {
    const r = clasificarContextoMision({
      titulo: 'Titanes de la sentadilla',
      descripcion: 'Sentadilla trasera con barra 3-4 series de 3-5 rep al 80-85% 1RM; el coach valida la carga.',
      pilar: 'fuerza',
    });
    expect(r.contextoSugerido).toBe('cancha');
    expect(r.esCanchaNoMision).toBe(true);
  });

  it('form shooting contra la pared → casa (tiro sin aro)', () => {
    const r = clasificarContextoMision({
      titulo: 'Tiro tumbado en casa',
      descripcion: 'Acostado en la cama, lanza el balón hacia arriba con backspin; luego form shooting contra la pared, sin canasta.',
      pilar: 'tiro',
    });
    expect(r.contextoSugerido).toBe('casa');
    expect(r.esCanchaNoMision).toBe(false);
  });

  it('ver video de análisis → casa (contenido)', () => {
    const r = clasificarContextoMision({
      titulo: 'Ojo de águila',
      descripcion: 'Mira 3 clips de video esta semana y anota en tu diario dónde estaba el espacio libre.',
      pilar: 'youtube',
    });
    expect(r.contextoSugerido).toBe('casa');
  });

  it('hábito de sueño/recuperación → casa', () => {
    const r = clasificarContextoMision({
      titulo: 'Rutina de sueño',
      descripcion: 'Apaga las pantallas 60 min antes de dormir y mantén una hora fija; registra tus horas en el diario.',
      pilar: 'recuperacion',
    });
    expect(r.contextoSugerido).toBe('casa');
  });

  it('basura IA: youtube + sin justificación + describe gym → esBasura', () => {
    const r = clasificarContextoMision({
      titulo: '[IA] Cimientos de potencia',
      descripcion: 'Sentadilla trasera con barra baja al 80%, prensa de piernas y zancadas búlgaras con mancuerna.',
      pilar: 'youtube',
      is_ai_generated: true,
      justificacion: null,
    });
    expect(r.esBasura).toBe(true);
    expect(r.confianza).toBe(1);
    expect(r.contextoSugerido).toBe('cancha');
  });

  it('contenido legítimo de youtube CON justificación no es basura', () => {
    const r = clasificarContextoMision({
      titulo: 'Estudia el pick and roll',
      descripcion: 'Mira este video y responde el quiz sobre las lecturas del bloqueo directo.',
      pilar: 'youtube',
      is_ai_generated: true,
      justificacion: 'El video-análisis desarrolla la lectura táctica [trabajo_casa_atleta.md › Video análisis en casa].',
      quiz: [{ pregunta: '¿Qué es un roll?', opciones: ['a', 'b'], correcta: 0 }],
    });
    expect(r.esBasura).toBe(false);
    expect(r.contextoSugerido).toBe('casa');
  });

  it('lane agility con conos → cancha (sub-pilar agilidad + material)', () => {
    const r = clasificarContextoMision({
      titulo: 'Lane agility',
      descripcion: 'Recorre el circuito de conos midiendo el tiempo con cronómetro; prueba de la batería.',
      pilar: 'agilidad',
    });
    expect(r.contextoSugerido).toBe('cancha');
    expect(r.esCanchaNoMision).toBe(true);
  });

  it('respiración/visualización → casa (resiliencia mental)', () => {
    const r = clasificarContextoMision({
      titulo: 'Infla el globo',
      descripcion: 'Respiración diafragmática 3 minutos y visualización guiada antes de dormir.',
      pilar: 'resiliencia',
    });
    expect(r.contextoSugerido).toBe('casa');
  });

  it('circuito de autocarga sin material → casa', () => {
    const r = clasificarContextoMision({
      titulo: 'Guerrero de la sala',
      descripcion: 'Circuito en la sala con peso corporal: sentadilla a la silla, plancha y puente de glúteo, sin material.',
      pilar: 'fuerza',
    });
    expect(r.contextoSugerido).toBe('casa');
    expect(r.esCanchaNoMision).toBe(false);
  });

  it('misión ambigua sin señales claras → ambos', () => {
    const r = clasificarContextoMision({
      titulo: 'Trabajo de movilidad',
      descripcion: 'Haz una rutina de movilidad general.',
      pilar: 'movilidad',
    });
    expect(['casa', 'ambos']).toContain(r.contextoSugerido);
  });

  it('devuelve señales explicables y confianza en [0,1]', () => {
    const r = clasificarContextoMision({
      titulo: 'Sentadilla con barra',
      descripcion: 'Barra olímpica, 5x5, coach revisa la técnica.',
      pilar: 'fuerza',
    });
    expect(Array.isArray(r.señales)).toBe(true);
    expect(r.señales.length).toBeGreaterThan(0);
    expect(r.confianza).toBeGreaterThanOrEqual(0);
    expect(r.confianza).toBeLessThanOrEqual(1);
  });
});
