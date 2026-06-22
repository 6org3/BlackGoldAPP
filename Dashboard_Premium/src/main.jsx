import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import './index.css'
import App from './App.jsx'
import Login from './components/Login.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AdminAtletasPage from './pages/AdminAtletasPage.jsx'
import AdminMisionesPage from './pages/AdminMisionesPage.jsx'
import AdminPagosPage from './pages/AdminPagosPage.jsx'
import AdminComunicacionesPage from './pages/AdminComunicacionesPage.jsx'
import PadreDashboard from './pages/PadreDashboard.jsx'
import RegistroPage from './pages/RegistroPage.jsx'
import OwnerKPIsPage from './pages/OwnerKPIsPage.jsx'

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
            path="/admin/kpis"
            element={
              <PrivateRoute roles={['superadmin', 'owner']}>
                <OwnerKPIsPage />
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
