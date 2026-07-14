import AdminShell from '../components/AdminShell';
import CompararPruebas from '../components/CompararPruebas';
import { useAuth } from '../AuthContext';

// Página admin de la vista Comparar (mockup v6): distribución de una prueba en
// la categoría, atleta vs medias y su histórico.
export default function CompararPruebasPage() {
  const { user } = useAuth();

  return (
    <AdminShell>
      <CompararPruebas user={user} />
    </AdminShell>
  );
}
