import { useState, useEffect } from 'react';

export const DURACION_CLASE = 60 * 60; // 1 hora en segundos

export function useModoCanchaModalClock(isOpen, step) {
  const [currentTime, setCurrentTime] = useState(new Date()); // Ticker global

  // Ticker global que actualiza currentTime cada segundo
  useEffect(() => {
    if (!isOpen || step !== 0) return;
    const intervalo = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, [isOpen, step]);

  const formatTiempo = (segundos) => {
    if (segundos === null) return '--:--';
    const m = Math.floor(Math.abs(segundos) / 60);
    const s = Math.abs(segundos) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const calcularTiemposSession = (session) => {
    const [h, m, s] = (session.hora_inicio || '00:00:00').split(':').map(Number);
    const inicio = new Date(currentTime);
    inicio.setHours(h, m, s, 0);
    const transcurridos = Math.floor((currentTime - inicio) / 1000);
    const restantes = DURACION_CLASE - transcurridos;
    const finDate = new Date(inicio.getTime() + DURACION_CLASE * 1000);
    const horaFin = `${String(finDate.getHours()).padStart(2,'0')}:${String(finDate.getMinutes()).padStart(2,'0')}`;
    return {
      transcurridos: Math.max(0, transcurridos),
      restantes: Math.max(0, restantes),
      terminada: restantes <= 0,
      horaFin
    };
  };

  return { currentTime, formatTiempo, calcularTiemposSession };
}
