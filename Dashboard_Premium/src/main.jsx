import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './AuthContext'
import './index.css'
import Login from './components/Login.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Carga diferida: cada vista se descarga solo cuando se navega a ella.
const App = lazy(() => import('./App.jsx'))
const AdminAtletasPage = lazy(() => import('./pages/AdminAtletasPage.jsx'))
const AdminMisionesPage = lazy(() => import('./pages/AdminMisionesPage.jsx'))
const AdminPagosPage = lazy(() => import('./pages/AdminPagosPage.jsx'))
const AdminComunicacionesPage = lazy(() => import('./pages/AdminComunicacionesPage.jsx'))
const AdminEventosPage = lazy(() => import('./pages/AdminEventosPage.jsx'))
const AdminAsistenciaPage = lazy(() => import('./pages/AdminAsistenciaPage.jsx'))
const AdminSesionesPage = lazy(() => import('./pages/AdminSesionesPage.jsx'))
const PadreDashboard = lazy(() => import('./pages/PadreDashboard.jsx'))
const RegistroPage = lazy(() => import('./pages/RegistroPage.jsx'))
const OwnerKPIsPage = lazy(() => import('./pages/OwnerKPIsPage.jsx'))

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-zinc-950">
    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
  </div>
)

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  if (roles && !roles.includes(user.rol)) {
    // Redirigir al dashboard correspondiente
    if (user.rol === 'padre') return <Navigate to="/padre" />;
    return <Navigate to="/dashboard" />;
  }
  return children;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<RegistroPage />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach', 'atleta']}>
                <App />
              </PrivateRoute>
            }
          />
          <Route
            path="/padre"
            element={
              <PrivateRoute roles={['padre']}>
                <PadreDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/atletas"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminAtletasPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/misiones"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminMisionesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/pagos"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminPagosPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/comunicaciones"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminComunicacionesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/eventos"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminEventosPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/asistencia"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminAsistenciaPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/sesiones"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <AdminSesionesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin/kpis"
            element={
              <PrivateRoute roles={['superadmin', 'owner']}>
                <OwnerKPIsPage />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
