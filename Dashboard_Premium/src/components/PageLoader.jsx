import { Loader2 } from 'lucide-react';

// Loader de página completa compartido: lo usan el Suspense de rutas
// (main.jsx) y el bootstrap de sesión (AuthContext) para que la app nunca
// muestre una pantalla negra vacía mientras carga en redes lentas.
const PageLoader = () => (
  <div role="status" aria-label="Cargando" className="flex items-center justify-center min-h-dvh bg-zinc-950">
    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
  </div>
);

export default PageLoader;
