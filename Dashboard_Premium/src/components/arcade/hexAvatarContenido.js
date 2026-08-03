/**
 * Qué se pinta dentro del hexágono de HexAvatar.
 *
 * Va en su propio módulo (y no junto al componente) por dos motivos: Fast
 * Refresh exige que un archivo de componente no exporte otra cosa, y así la
 * decisión queda testeable en el entorno `node` de Vitest, sin jsdom.
 *
 * Precedencia `children` > `src` > `initial`: los ~25 call sites que pasan un
 * icono lucide como children (ModalShell, ModalHUD, cabeceras Admin*) no son
 * atletas y deben quedar intactos aunque algún día reciban un src por error.
 */
export function resolverContenidoAvatar({ src, fallo, children, initial }) {
  if (children != null) return 'children';
  if (src && !fallo) return 'foto';
  return initial != null ? 'initial' : 'vacio';
}
