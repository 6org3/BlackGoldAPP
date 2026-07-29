import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import ModalShell from './arcade/ModalShell';
import MicroLabel from './arcade/MicroLabel';
import HexAvatar from './arcade/HexAvatar';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';
import { prepararImagen, ErrorFoto } from '../lib/imagenPerfil';
import { subirFotoAtleta, eliminarFotoAtleta } from '../api/fotosAtletasService';
import { useFotoUrl } from '../hooks/useFotoUrl';

/**
 * Tomar o elegir la foto de identificación de un atleta.
 *
 * Captura con el input nativo y no con getUserMedia: en móvil —que es donde
 * están padres y coaches— `capture="user"` abre la cámara del teléfono con su
 * UI de siempre (previsualizar, repetir) y cero código de permisos. En
 * escritorio ese atributo se ignora, así que ahí solo se ofrece elegir archivo:
 * prometer cámara y abrir el explorador sería peor que no ofrecerla.
 */

const esTactil = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function FotoAtletaModal({ atletaId, nombre, fotoPath, onClose, onGuardada }) {
  const inputRef = useRef(null);
  const { url: urlActual } = useFotoUrl(fotoPath);

  const [estado, setEstado] = useState('inicial'); // inicial|procesando|previa|subiendo|listo
  const [error, setError] = useState(null);
  const [previa, setPrevia] = useState(null); // { blob, url }
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const tactil = esTactil();

  // La object URL de la vista previa se revoca al cambiarla o al desmontar; si
  // no, cada foto repetida deja un blob retenido en memoria.
  useEffect(() => () => { if (previa?.url) URL.revokeObjectURL(previa.url); }, [previa]);

  const abrirSelector = (conCamara) => {
    setError(null);
    const input = inputRef.current;
    if (!input) return;
    if (conCamara) input.setAttribute('capture', 'user');
    else input.removeAttribute('capture');
    input.click();
  };

  const alElegir = async (e) => {
    const file = e.target.files?.[0];
    // Se limpia siempre para permitir reintentar con el MISMO archivo (si no,
    // el input no dispara change la segunda vez).
    e.target.value = '';
    if (!file) return;

    setEstado('procesando');
    setError(null);
    try {
      const { blob, ext } = await prepararImagen(file);
      setPrevia({ blob, ext, url: URL.createObjectURL(blob) });
      setEstado('previa');
    } catch (err) {
      setError(err instanceof ErrorFoto ? err.message : 'No pudimos preparar esa imagen.');
      setEstado('inicial');
    }
  };

  const confirmar = async () => {
    if (!previa) return;
    setEstado('subiendo');
    setError(null);
    try {
      // Ya está recortada y comprimida para la vista previa: se reutiliza tal
      // cual en vez de volver a procesar el original.
      const { path } = await subirFotoAtleta(atletaId, null, {
        preparada: { blob: previa.blob, ext: previa.ext },
      });
      setEstado('listo');
      onGuardada?.(path);
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      setError(mensajeDeError(err));
      setEstado('previa');
    }
  };

  const quitar = async () => {
    setEstado('subiendo');
    setError(null);
    try {
      await eliminarFotoAtleta(atletaId);
      setEstado('listo');
      onGuardada?.(null);
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      setError(mensajeDeError(err));
      setEstado('inicial');
      setConfirmandoQuitar(false);
    }
  };

  const ocupado = estado === 'procesando' || estado === 'subiendo';
  const inicial = nombre?.charAt(0)?.toUpperCase() || '?';
  const srcHex = previa?.url || urlActual || null;

  return (
    <ModalShell
      onClose={ocupado ? () => {} : onClose}
      title="Foto de identificación"
      eyebrow={nombre || 'Atleta'}
      icon={Camera}
      maxWidth="max-w-sm"
      align="end"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={alElegir}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="flex flex-col items-center gap-4">
        <HexAvatar size={96} src={srcHex} initial={inicial} alt="" />

        <MicroLabel style={{ textAlign: 'center' }} color={estado === 'listo' ? C.ok : C.text3}>
          {textoEstado(estado, fotoPath, previa)}
        </MicroLabel>

        {error && (
          <div
            className="w-full px-3 py-2 text-xs"
            role="alert"
            style={{ background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger, clipPath: cut(6) }}
          >
            {error}
          </div>
        )}

        {estado === 'previa' && !ocupado && (
          <div className="w-full flex flex-col gap-2">
            <button type="button" onClick={confirmar} className="cut-focus w-full min-h-11 font-black uppercase tracking-widest text-sm"
              style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
              Usar esta foto
            </button>
            <button type="button" onClick={() => { setPrevia(null); setEstado('inicial'); }}
              className="cut-focus w-full min-h-11 text-xs uppercase tracking-widest"
              style={{ background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text2, clipPath: cut(6) }}>
              Repetir
            </button>
          </div>
        )}

        {estado === 'inicial' && !confirmandoQuitar && (
          <div className="w-full flex flex-col gap-2">
            {tactil && (
              <button type="button" onClick={() => abrirSelector(true)}
                className="cut-focus w-full min-h-11 inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest text-sm"
                style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
                <Camera size={16} strokeWidth={2.5} /> Tomar foto
              </button>
            )}
            <button type="button" onClick={() => abrirSelector(false)}
              className="cut-focus w-full min-h-11 inline-flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
              style={
                tactil
                  ? { background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text2, clipPath: cut(6) }
                  : { clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink, fontWeight: 900 }
              }>
              <ImageIcon size={16} strokeWidth={2.5} />
              {tactil ? 'Elegir de galería' : 'Elegir archivo'}
            </button>

            {fotoPath && (
              <button type="button" onClick={() => setConfirmandoQuitar(true)}
                className="cut-focus w-full min-h-11 inline-flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                style={{ background: 'transparent', border: `1px solid ${BORDER.danger}`, color: C.danger, clipPath: cut(6) }}>
                <Trash2 size={15} strokeWidth={2.5} /> Quitar foto
              </button>
            )}
          </div>
        )}

        {/* Confirmación EN LÍNEA y no un ModalHUD anidado: dos trampas de foco
            superpuestas se pelean por el Tab y por el retorno del foco. */}
        {confirmandoQuitar && !ocupado && (
          <div className="w-full flex flex-col gap-2">
            <p className="text-xs text-center" style={{ color: C.text2 }}>
              ¿Quitar la foto de {nombre || 'este atleta'}?
            </p>
            <button type="button" onClick={quitar}
              className="cut-focus w-full min-h-11 font-black uppercase tracking-widest text-sm"
              style={{ background: C.dangerDeep, border: 'none', color: C.onDanger, clipPath: cut(8) }}>
              Sí, quitar
            </button>
            <button type="button" onClick={() => setConfirmandoQuitar(false)}
              className="cut-focus w-full min-h-11 text-xs uppercase tracking-widest"
              style={{ background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text2, clipPath: cut(6) }}>
              Cancelar
            </button>
          </div>
        )}

        {previa && estado === 'previa' && (
          <MicroLabel size={11} color={C.text3}>{kb(previa.blob.size)}</MicroLabel>
        )}
      </div>
    </ModalShell>
  );
}

function textoEstado(estado, fotoPath, previa) {
  if (estado === 'procesando') return 'Preparando imagen…';
  // Indeterminado a propósito: supabase-js sube con fetch y no expone
  // progreso; con ~40 KB una barra sería una mentira animada.
  if (estado === 'subiendo') return 'Guardando…';
  if (estado === 'listo') return '✓ Foto actualizada';
  if (estado === 'previa' && previa) return 'Así se verá';
  return fotoPath ? 'Foto actual' : 'Sin foto';
}

function mensajeDeError(err) {
  const texto = String(err?.message || '');
  if (/permiso|permission|policy|row-level/i.test(texto)) {
    return 'No tienes permiso para cambiar esta foto.';
  }
  if (/network|fetch|Failed to fetch/i.test(texto)) {
    return 'No hay conexión. Intenta de nuevo.';
  }
  if (/exceeded|maximum allowed size|too large/i.test(texto)) {
    return 'La imagen pesa demasiado. Prueba con otra.';
  }
  return 'No pudimos guardar la foto. Intenta de nuevo.';
}
