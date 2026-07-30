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
  const lista = Array.isArray(credenciales) ? credenciales : [credenciales];
  if (!lista.length || !lista[0]) return null;

  const copiarTodo = () => {
    const texto = lista
      .map((c) => [c.rol || c.nombre, c.usuario && `usuario: ${c.usuario}`, `contraseña: ${c.password}`]
        .filter(Boolean).join(' · '))
      .join('\n');
    navigator.clipboard?.writeText(texto);
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
            {lista.length > 1 ? 'Contraseñas emitidas' : `Contraseña de ${lista[0].nombre}`} · se muestran una sola vez
          </MicroLabel>

          {lista.map((c, i) => (
            <div key={c.password ?? i} className="mt-3">
              {lista.length > 1 && (
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

          <div className="mt-3">
            <button
              onClick={copiarTodo}
              className="cut-focus min-h-11 px-4 font-black text-2xs uppercase tracking-widest"
              style={{ clipPath: cut(6), background: GRAD.goldCTA, color: C.ink, border: 'none' }}
            >
              {lista.length > 1 ? 'Copiar todo' : 'Copiar'}
            </button>
          </div>

          <p className="mt-2 text-xs font-bold" style={{ color: C.text3 }}>
            Entrégalas tú — nadie más puede volver a verlas. Se les pedirá cambiarlas
            la primera vez que entren.
          </p>
        </div>
        <button
          onClick={onCerrar}
          aria-label="Ya las copié"
          className="cut-focus p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center"
          style={{ color: C.gold }}
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}
