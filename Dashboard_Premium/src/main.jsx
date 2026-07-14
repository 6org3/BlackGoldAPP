import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { AuthProvider, useAuth } from './AuthContext'
import { rutaHomeParaRol } from './lib/featureFlags'
import './index.css'
import Login from './components/Login.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import PageLoader from './components/PageLoader.jsx'

// En Android, beforeinstallprompt suele dispararse justo tras el load (antes
// de que el usuario termine el login). Se captura a nivel módulo para que
// InstallPrompt pueda ofrecer la instalación aunque monte más tarde.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__bgDeferredPrompt = e
})

// Tras un deploy, un chunk lazy del build anterior puede ya no existir en el
// servidor: recargar trae el build nuevo en vez de morir en el ErrorBoundary.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const ultimaRecarga = Number(sessionStorage.getItem('bg-preload-reload') || 0)
  if (Date.now() - ultimaRecarga > 10000) {
    sessionStorage.setItem('bg-preload-reload', String(Date.now()))
    window.location.reload()
  }
})

// Registro manual del Service Worker (injectRegister: false en vite.config.js),
// solo en build de producción: en dev no existe un /sw.js real (404 -> HTML del
// SPA fallback -> MIME type inválido); VitePWA ya registra su propio dev-sw ahí.
// El SW nuevo hace skipWaiting()+clientsClaim() en cuanto activa (workbox,
// registerType: 'autoUpdate'), pero eso por sí solo NO recarga la pestaña ya
// abierta. Instalada en el celular, la app casi nunca se cierra del todo, así
// que sin este listener se queda mostrando el build viejo indefinidamente.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let recargandoPorSW = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargandoPorSW) return
    recargandoPorSW = true
    window.location.reload()
  })

  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // La revisión pasiva del navegador tarda hasta ~24h; forzarla cada vez
    // que la app vuelve a primer plano hace que un deploy se note en minutos.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  })
}

// Carga diferida: cada vista se descarga solo cuando se navega a ella.
const App = lazy(() => import('./App.jsx'))
const AdminAtletasPage = lazy(() => import('./pages/AdminAtletasPage.jsx'))
const AdminMisionesPage = lazy(() => import('./pages/AdminMisionesPage.jsx'))
const AdminPagosPage = lazy(() => import('./pages/AdminPagosPage.jsx'))
const AdminComunicacionesPage = lazy(() => import('./pages/AdminComunicacionesPage.jsx'))
const AdminEventosPage = lazy(() => import('./pages/AdminEventosPage.jsx'))
const AdminAsistenciaPage = lazy(() => import('./pages/AdminAsistenciaPage.jsx'))
const AdminSesionesPage = lazy(() => import('./pages/AdminSesionesPage.jsx'))
const CompararPruebasPage = lazy(() => import('./pages/CompararPruebasPage.jsx'))
// Vista Padre en estilo "Arcade HUD" con datos reales de Supabase (fase 5 completa).
const VistaPadreArcade = lazy(() => import('./components/arcade/VistaPadreArcade.jsx'))
// Portal Atleta en estilo "Arcade HUD" (rediseño del handoff): 5 pantallas
// mock-first + cableado real (misiones/eventos/pilares/XP).
const VistaAtletaArcade = lazy(() => import('./components/arcade/VistaAtletaArcade.jsx'))
const RegistroPage = lazy(() => import('./pages/RegistroPage.jsx'))
// Pantalla de cuenta pendiente/rechazada (v33): PrivateRoute la muestra en vez
// de cualquier ruta privada hasta que el owner apruebe la solicitud.
const CuentaEnRevision = lazy(() => import('./components/CuentaEnRevision.jsx'))
const OwnerKPIsPage = lazy(() => import('./pages/OwnerKPIsPage.jsx'))
const CoachHomePage = lazy(() => import('./pages/CoachHomePage.jsx'))
// Panel Dueño en estilo "Arcade HUD" (rediseño del handoff): 5 paneles mock-first
// + cableado real (KPIs/finanzas/asistencia). ClubHomePage.jsx queda como legacy.
const VistaDuenoArcade = lazy(() => import('./components/arcade/VistaDuenoArcade.jsx'))
const SistemaHomePage = lazy(() => import('./pages/SistemaHomePage.jsx'))
// Banco de pruebas de las primitivas densas del Arcade (Ola 0, design_system_arcade.md §6).
// Solo en dev: nunca se incluye en el bundle de producción ni se enlaza desde la nav.
const ArcadeDensidadDemo = import.meta.env.DEV
  ? lazy(() => import('./components/arcade/PantallaArcadeDensidad.jsx'))
  : null

// La PWA instalada abre en '/': si supabase-js aún tiene sesión válida no hay
// que volver a pedir credenciales, se entra directo al panel según el rol.
// El destino por rol respeta los feature flags del rediseño (homes nativos
// /sistema, /club, /coach); con el flag apagado se conserva el destino
// previo (/padre para padres, /dashboard para el resto).
const RootRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={rutaHomeParaRol(user.rol)} replace />;
};

const PrivateRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;

  // Cuenta aún no aprobada por el club (v33): atleta o padre solo ven la
  // pantalla de revisión/rechazo, en cualquier ruta privada.
  if (user.estado === 'pendiente' || user.estado === 'rechazado') {
    return <CuentaEnRevision estado={user.estado} />;
  }

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
      {/* reducedMotion="user": Framer Motion respeta prefers-reduced-motion
          (los transforms saltan al valor final; los fades de opacity se
          conservan). El CSS global ya lo hace en index.css — esto cubre las
          animaciones JS (VARIANTS/MOTION de designTokens.js). */}
      <MotionConfig reducedMotion="user">
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
                <VistaPadreArcade />
              </PrivateRoute>
            }
          />
          {/* Homes por rol (PR3 del rediseño, blueprint §2.1) */}
          <Route
            path="/coach"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <CoachHomePage />
              </PrivateRoute>
            }
          />
          <Route
            path="/club"
            element={
              <PrivateRoute roles={['superadmin', 'owner']}>
                <VistaDuenoArcade />
              </PrivateRoute>
            }
          />
          <Route
            path="/sistema"
            element={
              <PrivateRoute roles={['superadmin']}>
                <SistemaHomePage />
              </PrivateRoute>
            }
          />
          {/* Portal Atleta Arcade HUD (rediseño del handoff). El shell legacy
              AthleteLayout sigue disponible en /dashboard como respaldo. */}
          <Route
            path="/atleta"
            element={
              <PrivateRoute roles={['atleta']}>
                <VistaAtletaArcade />
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
            path="/admin/comparar"
            element={
              <PrivateRoute roles={['superadmin', 'owner', 'coach']}>
                <CompararPruebasPage />
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
          {import.meta.env.DEV && ArcadeDensidadDemo && (
            <Route path="/dev/arcade-densidad" element={<ArcadeDensidadDemo />} />
          )}
          <Route path="/" element={<RootRedirect />} />
          {/* Cualquier URL desconocida (typo, deep-link viejo) vuelve al
              redirect raíz en vez de renderizar una pantalla negra. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <InstallPrompt />
      </BrowserRouter>
      </AuthProvider>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
