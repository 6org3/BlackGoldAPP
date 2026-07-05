import { useEffect } from 'react';
import { supabase } from '../api/supabaseClient';

// ── Carga datos del atleta ──────────────
export function useMisionesPanelAtletaData(atletaId, setAtletaData) {
  useEffect(() => {
    const loadAtleta = async () => {
      const { data } = await supabase
        .from('atletas')
        .select('*, usuarios!atletas_usuario_id_fkey(nombre, categoria)')
        .eq('usuario_id', atletaId)
        .single();

      if (data) {
        // Solo las columnas que consumen radarCalc/didacticEngine y este hook,
        // acotadas a las 100 más recientes (aquí solo importa la última por prueba).
        const { data: evaluaciones } = await supabase
          .from('evaluaciones_pruebas')
          .select('prueba_tipo, valor_crudo, puntuacion_normalizada, sub_pilar, created_at')
          .eq('atleta_id', data.id)
          .order('created_at', { ascending: false })
          .limit(100);

        const latestEvals = {};
        (evaluaciones || []).forEach(e => {
          if (!latestEvals[e.prueba_tipo]) latestEvals[e.prueba_tipo] = e;
        });

        const hoy = new Date().toISOString().split('T')[0];
        const { data: readinessData } = await supabase
          .from('atleta_readiness')
          .select('*')
          .eq('atleta_id', data.id)
          .eq('fecha', hoy)
          .maybeSingle();

        let estadoRecuperacion = data.estado_recuperacion || 'Óptimo';
        if (readinessData) {
          if (readinessData.readiness_score < 4) estadoRecuperacion = 'Agotamiento Activo';
          else if (readinessData.readiness_score < 7) estadoRecuperacion = 'Fatiga Silenciosa';
        } else if (latestEvals['Carga Subjetiva y Sueño']) {
          const rec = latestEvals['Carga Subjetiva y Sueño'].valor_crudo;
          if (rec < 4) estadoRecuperacion = 'Agotamiento Activo';
          else if (rec < 6) estadoRecuperacion = 'Fatiga Silenciosa';
        }

        setAtletaData({
          ...data,
          nombre: data.usuarios?.nombre,
          categoria: data.usuarios?.categoria,
          estado_recuperacion: estadoRecuperacion,
          readiness_hoy: readinessData,
          _evaluaciones: Object.values(latestEvals),
        });
      }
    };
    loadAtleta();
  }, [atletaId, setAtletaData]);
}
