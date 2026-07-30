import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, X } from 'lucide-react';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

// Contraseñas recién emitidas, mostradas UNA sola vez.
//
// El servidor no las guarda en ningún lado: si esto se cierra sin copiarlas, la
// única salida es regenerar el acceso. Nació como bloque suelto dentro de
// AdminEquipo (v41, solo para coach y dueño); se extrajo aquí al dejar de
// derivarse la contraseña de la cédula, porque ahora también el alta de un
// atleta y la de su representante emiten una — y son dos a la vez.
//
// `credenciales`: [{ nombre, rol?, usuario?, password }]
export default function BannerCredenciales({ credenciales, onCerrar }) {
  // 'idle' | 'copiado' | 'fallo'. El portapapeles no está disponible fuera de
  // contexto seguro ni con el permiso denegado, y writeText RECHAZA: sin
  // acusar recibo, el staff cree que copió y cierra el banner con la única
  // copia de la contraseña dentro.
  const [copia, setCopia] = useState('idle');
  const lista = Array.isArray(credenciales) ? credenciales : [credenciales];
  if (!lista.length || !lista[0]) return null;

  const varias = lista.length > 1;

  const copiarTodo = async () => {
    const texto = lista
      .map((c) => [c.rol || c.nombre, c.usuario && `usuario: ${c.usuario}`, `contraseña: ${c.password}`]
        .filter(Boolean).join(' · '))
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopia('copiado');
      setTimeout(() => setCopia('idle'), 4000);
    } catch {
      setCopia('fallo');
    }
  };

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mb-6 p-4"
      style={{ clipPath: cut(10), background: TINT.gold, border: `1px solid ${BORDER.goldStrong}` }}
    >
      <div className="flex items-start gap-3">
        <KeyRound size={18} className="shrink-0 mt-0.5" style={{ color: C.gold }} />
        <div className="flex-1 min-w-0">
          <MicroLabel style={{ color: C.gold }}>
            {varias
              ? 'Contraseñas emitidas · se muestran una sola vez'
              : `Contraseña de ${lista[0].nombre} · se muestra una sola vez`}
          </MicroLabel>

          {lista.map((c, i) => (
            <div key={c.password ?? i} className="mt-3">
              {varias && (
                <MicroLabel size={10} style={{ color: C.text2, display: 'block', marginBottom: 4 }}>
                  {c.rol ? `${c.rol} — ${c.nombre}` : c.nombre}
                </MicroLabel>
              )}
              {c.usuario && (
                <p className="text-xs mb-1" style={{ color: C.text3 }}>
                  Usuario: <code className="select-all font-mono" style={{ color: C.text }}>{c.usuario}</code>
                </p>
              )}
              <code
                className="inline-block text-lg font-black tracking-widest px-3 py-2 select-all break-all"
                style={{ background: C.ink, color: C.gold, clipPath: cut(6) }}
              >
                {c.password}
              </code>
            </div>
          ))}

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={copiarTodo}
              className="cut-focus min-h-11 px-4 font-black text-2xs uppercase tracking-widest"
              style={{ clipPath: cut(6), background: GRAD.goldCTA, color: C.ink, border: 'none' }}
            >
              {copia === 'copiado' ? 'Copiado' : varias ? 'Copiar todo' : 'Copiar'}
            </button>
            <span aria-live="polite" className="text-xs font-bold" style={{ color: copia === 'fallo' ? C.danger : C.text3 }}>
              {copia === 'copiado' && (varias ? 'Copiadas al portapapeles.' : 'Copiada al portapapeles.')}
              {copia === 'fallo' && 'No se pudo copiar: selecciona el texto y cópialo a mano.'}
            </span>
          </div>

          <p className="mt-2 text-xs font-bold" style={{ color: C.text3 }}>
            {varias
              ? 'Entrégalas tú — nadie más puede volver a verlas. Se les pedirá cambiarlas la primera vez que entren.'
              : 'Entrégala tú — nadie más puede volver a verla. Se le pedirá cambiarla la primera vez que entre.'}
          </p>
        </div>
        <button
          onClick={onCerrar}
          aria-label={varias ? 'Ya las copié' : 'Ya la copié'}
          className="cut-focus p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center"
          style={{ color: C.gold }}
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}
