import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, Save, Flag } from 'lucide-react';
import { normalizarValor } from '../lib/baremosEngine';
import { labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';

// Paso 6 del Modo Cancha (fase P3b): captura grupal POR ESTACIÓN (decisión del
// owner): se monta una prueba y se capturan todos los atletas presentes, luego la
// siguiente. Cada input muestra el tier en vivo con el MISMO motor del modal
// individual (normalizarValor + perfil género/nivel del atleta). Los atletas sin
// resultado se saltan (no todos hacen todas las pruebas).
export default function ModoCanchaModalCapturaEvaluacion({
  pruebas,
  atletasPresentes,
  capturas,
  setCapturas,
  estacionIdx,
  setEstacionIdx,
  estacionesGuardadas,
  registradoPor,
  handleGuardarEstacion,
  handleFinalizarEvaluacion,
  saving,
}) {
  const prueba = pruebas[estacionIdx] || null;
  const inputs = prueba?.inputs_requeridos?.length
    ? prueba.inputs_requeridos
    : [{ id: 'unico', label: `Medida en ${prueba?.unidad || 'pts'}` }];

  const baremoParam = useMemo(() => prueba && ({
    ...prueba,
    tipo: prueba.invertido ? 'menos_es_mejor' : 'mas_es_mejor',
    label: prueba.nombre,
  }), [prueba]);

  const valoresDe = (atletaId) => capturas[prueba?.id]?.[atletaId] || {};

  const setValor = (atletaId, inputId, valor) => {
    setCapturas(prev => ({
      ...prev,
      [prueba.id]: {
        ...(prev[prueba.id] || {}),
        [atletaId]: { ...(prev[prueba.id]?.[atletaId] || {}), [inputId]: valor },
      },
    }));
  };

  // Preview de tier por atleta (mismo cálculo que el submit — un solo motor).
  const previewDe = (atleta) => {
    const vals = [];
    for (const input of inputs) {
      const v = valoresDe(atleta.atleta_id)[input.id];
      if (v === undefined || v === '') return null;
      vals.push(parseFloat(v));
    }
    if (vals.some(isNaN)) return null;
    return normalizarValor(baremoParam, vals, atleta.categoria || 'Todas', {
      nivel_desarrollo: atleta.nivel_desarrollo ?? null,
      genero: atleta.genero ?? null,
    });
  };

  const registrosEstacion = () => {
    const registros = [];
    atletasPresentes.forEach(a => {
      const res = previewDe(a);
      if (!res || res.noAplica) return; // sin resultado completo o sin baremo aplicable
      inputs.forEach(input => {
        registros.push({
          atleta_id: a.atleta_id,
          prueba_tipo: prueba.nombre,
          valor_crudo: parseFloat(valoresDe(a.atleta_id)[input.id]),
          lado: input.id,
          unidad: prueba.unidad,
          pilar: prueba.pilar,
          sub_pilar: prueba.sub_pilar,
          tren: prueba.tren || null,
          tier: res.tier,
          puntuacion_normalizada: res.puntuacion,
          notas: null,
          registrado_por: registradoPor,
        });
      });
    });
    return registros;
  };

  if (!prueba) return <p className="text-center text-gray-500 text-sm">Sin pruebas seleccionadas.</p>;

  const guardada = estacionesGuardadas.includes(prueba.id);
  const capturados = atletasPresentes.filter(a => { const r = previewDe(a); return r && !r.noAplica; }).length;

  return (
    <div className="space-y-4">
      {/* Navegación de estaciones */}
      <div className="flex items-center justify-between">
        <button onClick={() => setEstacionIdx(Math.max(0, estacionIdx - 1))} disabled={estacionIdx === 0}
          aria-label="Estación anterior"
          className="p-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-0 px-2">
          <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-[0.3em]">
            Estación {estacionIdx + 1}/{pruebas.length} {guardada && '· ✓ guardada'}
          </p>
          <p className="text-white font-black text-sm truncate">{prueba.nombre}</p>
          <p className="text-[10px] text-gray-500">{labelSubPilar(prueba.sub_pilar)} · {prueba.unidad}</p>
        </div>
        <button onClick={() => setEstacionIdx(Math.min(pruebas.length - 1, estacionIdx + 1))} disabled={estacionIdx >= pruebas.length - 1}
          aria-label="Estación siguiente"
          className="p-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Lista de atletas con inputs */}
      <div className="space-y-2 max-h-[45dvh] overflow-y-auto overscroll-contain pr-1">
        {atletasPresentes.map(a => {
          const res = previewDe(a);
          return (
            <div key={a.atleta_id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{a.nombre}</p>
                <p className="text-[9px] text-gray-500">{a.categoria}{a.nivel_desarrollo ? ` · ${a.nivel_desarrollo}` : ''}</p>
              </div>
              {inputs.map(input => (
                <input key={input.id} type="number" inputMode="decimal" placeholder={inputs.length > 1 ? input.id : prueba.unidad}
                  value={valoresDe(a.atleta_id)[input.id] ?? ''}
                  onChange={e => setValor(a.atleta_id, input.id, e.target.value)}
                  className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-base md:text-sm text-white text-center focus:outline-none focus:border-[#FFD700]/50" />
              ))}
              <span className={`w-16 text-center text-[9px] font-black uppercase rounded-full px-1 py-1 flex-shrink-0 ${
                !res ? 'text-gray-600'
                  : res.noAplica ? 'text-orange-400'
                  : `text-black`
              }`} style={res && !res.noAplica ? { backgroundColor: res.tierConfig?.color || '#FFD700' } : {}}>
                {!res ? '—' : res.noAplica ? 'N/A' : `${res.puntuacion}`}
              </span>
            </div>
          );
        })}
        {atletasPresentes.length === 0 && (
          <p className="text-xs text-gray-600 italic text-center py-6">No hay atletas presentes en esta sesión.</p>
        )}
      </div>

      {/* Acciones */}
      <button onClick={() => handleGuardarEstacion(prueba, registrosEstacion())}
        disabled={saving || guardada || capturados === 0}
        className="w-full py-4 bg-[#FFD700] text-black font-black uppercase tracking-widest rounded-xl flex items-center justify-center hover:bg-[#D4AF37] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {guardada
          ? <><Check size={16} className="mr-2" /> Estación guardada</>
          : <><Save size={16} className="mr-2" /> Guardar estación ({capturados}/{atletasPresentes.length} atletas)</>}
      </button>

      <button onClick={handleFinalizarEvaluacion} disabled={saving || estacionesGuardadas.length === 0}
        className="w-full py-3 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-widest text-xs rounded-xl flex items-center justify-center hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <Flag size={14} className="mr-2" /> Finalizar evaluación ({estacionesGuardadas.length}/{pruebas.length} estaciones)
      </button>
    </div>
  );
}
