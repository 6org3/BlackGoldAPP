import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { CopilotoProvider } from './CopilotoLauncher';
import { useAuth } from '../AuthContext';
import { BOTTOM_NAV_POR_ROL } from '../lib/bottomNavConfig';

/**
 * AdminShell — gemelo de HomeShell para las páginas /admin/*: monta el mismo
 * cableado persistente (CopilotoProvider + Sidebar + BottomNav móvil por rol)
 * PERO sin la cabecera saludo/eyebrow, porque cada módulo admin ya trae su
 * propio encabezado. Antes cada page repetía su shell (Sidebar + main) sin
 * BottomNav ni Copiloto, así que al navegar desde un home se perdían.
 *
 * No se unifica con HomeShell todavía a propósito: HomeShell necesita header
 * con hamburguesa móvil y pasa `ocultarFabModoCancha` al Sidebar (contexto del
 * home nativo); fusionarlos por banderas ensuciaría ambos. Follow-up.
 *
 * Props:
 * - padding: clases de padding del <main> (default 'p-6 md:p-10'); usar '' si
 *   el componente interno ya trae su propio padding.
 * - conGlow: pinta el glow ambiental dorado (solo desktop) dentro del main.
 * - fabElevado: sube el FAB del Copiloto en móvil por encima de un footer
 *   sticky del módulo (p.ej. Guardar en Asistencia).
 */
export default function AdminShell({ children, padding = 'p-6 md:p-10', conGlow = false, fabElevado = false }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const itemsNav = BOTTOM_NAV_POR_ROL[user?.rol] || null;
  const activo = itemsNav?.find((it) => location.pathname.startsWith(it.ruta))?.key;

  return (
    <CopilotoProvider fabElevado={fabElevado}>
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      <main className={`flex-1 overflow-y-auto overflow-x-hidden relative z-0 ${padding} ${itemsNav ? 'pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-[calc(env(safe-area-inset-bottom)+24px)]' : 'pb-[calc(env(safe-area-inset-bottom)+24px)]'}`}>
        {conGlow && (
          <div className="hidden md:block absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-brand/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        )}

        <div className="relative z-10">{children}</div>
      </main>

      {itemsNav && (
        <BottomNav items={itemsNav} activo={activo} onSelect={(key) => {
          const item = itemsNav.find((it) => it.key === key);
          if (item) navigate(item.ruta);
        }} />
      )}
    </div>
    </CopilotoProvider>
  );
}
