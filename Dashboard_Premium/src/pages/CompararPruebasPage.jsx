import Sidebar from '../components/Sidebar';
import CompararPruebas from '../components/CompararPruebas';
import { useAuth } from '../AuthContext';

// Página admin de la vista Comparar (mockup v6): distribución de una prueba en
// la categoría, atleta vs medias y su histórico. Mismo layout que AdminAtletasPage.
export default function CompararPruebasPage() {
  const { user } = useAuth();

  return (
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10 pb-[calc(env(safe-area-inset-bottom)+24px)] relative z-0">
        {/* Premium ambient glow */}
        <div className="absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-brand/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <CompararPruebas user={user} />
      </main>
    </div>
  );
}
