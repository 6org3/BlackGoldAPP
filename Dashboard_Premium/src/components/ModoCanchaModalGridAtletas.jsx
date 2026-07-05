import { Check, User } from 'lucide-react';

export default function ModoCanchaModalGridAtletas({
  atletasResumed,
  evaluadosIds,
  setAtletaEvaluando,
  setStep,
  handleCerrarClase,
  saving
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-brand font-bold uppercase tracking-widest text-center mb-2">Evaluaciones Subjetivas</p>
      <p className="text-xs text-center text-fg-secondary mb-4">Selecciona a un atleta si destacó en actitud o esfuerzo. Luego cierra la clase para otorgar XP grupal a todos.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {atletasResumed.map(a => {
          const yaEvaluado = evaluadosIds.includes(a.atleta_id);
          // Nombre + inicial del apellido para distinguir atletas con el mismo
          // primer nombre ("Juan P." vs "Juan G."). En nombres de 4 tokens el
          // apellido paterno es el tercero; en los de 2, el segundo.
          const partes = a.nombre.trim().split(/\s+/);
          const inicialApellido = partes.length > 1 ? `${(partes[2] || partes[1]).charAt(0)}.` : '';
          return (
            <button key={a.atleta_id} onClick={() => { setAtletaEvaluando(a); setStep(5); }}
              className={`p-4 rounded-panel border flex flex-col items-center text-center transition-all ${
                yaEvaluado
                ? 'bg-success/10 border-success/30 opacity-70 hover:opacity-100'
                : 'bg-white/5 border-white/10 hover:border-brand/50 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,215,0,0.1)]'
              }`}>
              <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center ${yaEvaluado ? 'bg-success/20 text-success-soft' : 'bg-white/10 text-white'}`}>
                {yaEvaluado ? <Check size={20} /> : <User size={20} />}
              </div>
              <span className={`text-xs font-bold uppercase tracking-widest truncate w-full ${yaEvaluado ? 'text-success-soft' : 'text-white'}`}>{partes[0]} {inicialApellido}</span>
            </button>
          );
        })}
      </div>

      <div className="animate-in fade-in zoom-in duration-500 mt-8 pt-4 border-t border-white/10">
          <button onClick={handleCerrarClase} disabled={saving} className="w-full bg-success text-black font-black uppercase tracking-widest py-4 rounded-control flex items-center justify-center hover:bg-success-soft transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          {saving ? 'Cerrando...' : 'Clase Finalizada - Repartir XP'}
          </button>
      </div>
    </div>
  );
}
