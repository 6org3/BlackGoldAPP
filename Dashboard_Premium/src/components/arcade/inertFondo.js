/**
 * Marca el fondo de la app como inerte mientras hay un diálogo modal abierto.
 *
 * Los modales del HUD (ModalShell / ModalHUD) se montan por portal a <body>,
 * así que el fondo es el árbol de #root. Sin `inert`, ese fondo sigue siendo
 * tabulable y visible para los lectores de pantalla aunque el backdrop lo tape.
 *
 * Esto cubre además un hueco del ciclado de Tab: la trampa de foco compara
 * `document.activeElement` contra el primer y el último focusable del panel, y
 * cuando el foco cae en <body> (al pulsar una zona muerta del diálogo) no
 * coincide con ninguno y el Tab del navegador se escapa al fondo. Con el fondo
 * inerte no hay dónde escapar.
 *
 * Cuenta los diálogos abiertos: con modales encadenados (prompt → alert), el
 * cierre del segundo no debe devolverle la vida al fondo si el primero sigue
 * abierto.
 */
let abiertos = 0;

/** Marca el fondo inerte y devuelve la función que lo revierte. */
export default function bloquearFondo() {
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  abiertos += 1;
  if (root && abiertos === 1) root.setAttribute('inert', '');

  let liberado = false;
  return () => {
    if (liberado) return; // el cleanup de un efecto no debe descontar dos veces
    liberado = true;
    abiertos = Math.max(0, abiertos - 1);
    if (root && abiertos === 0) root.removeAttribute('inert');
  };
}
