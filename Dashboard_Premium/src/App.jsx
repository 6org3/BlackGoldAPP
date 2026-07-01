import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './components/Sidebar';
import AtletaCard from './components/AtletaCard';
import AthleteGridCard from './components/AthleteGridCard';
import MisionesPanel from './components/MisionesPanel';
import AthleteLayout from './components/AthleteLayout';
import { fetchTodosLosAtletas } from './api/atletasService';
import { useAuth } from './AuthContext';
import { Loader2, LogOut, LayoutGrid, ArrowUpDown, X, Search, Menu, Target, ListFilter, Shield, User } from 'lucide-react';
import MicroCard from './components/MicroCard';
import InstallPrompt from './components/InstallPrompt';
import AsignadorMisiones from './components/AsignadorMisiones';
import ReadinessModal from './components/ReadinessModal';
import EditarPerfilModal from './components/EditarPerfilModal';
import { useNavigate } from 'react-router-dom';
import { calcularCategoriaFEB } from './api/utilsAtletas';

const FASE_ORDEN = { 'Micro': 0, 'Desarrollo': 1, 'Elite': 2 };

const categorias = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
const posiciones = ['Todas', 'Generador', 'Escolta', 'Alero Físico', 'Ala-Pívot', 'Ancla Fuerte'];
const nivelesDesarrollo = ['Todos', 'Micro', 'Desarrollo', 'Elite'];
const generos = ['Todos', 'Masculino', 'Femenino'];

function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordenarPor, setOrdenarPor] = useState('overall');
  const [selectedAtleta, setSelectedAtleta] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAsignador, setShowAsignador] = useState(false);
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState({
    categoria: 'Todas',
    posicion: 'Todas',
    nivelDesarrollo: 'Todos',
    genero: 'Todos',
  });

  const loadData = useCallback(async () => {
    if (user.rol === 'atleta') {
      const uCat = { ...user, categoria: calcularCategoriaFEB(user.fecha_nacimiento || user.edad) };
      setAtletas([uCat]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
      const data = await fetchTodosLosAtletas(user); 
      
      const dataConCategorias = (data || []).map(a => ({
        ...a,
        categoria: calcularCategoriaFEB(a.fecha_nacimiento || a.edad) || a.categoria
      }));
      
      setAtletas(dataConCategorias);
    } catch (err) {
      console.error("Error al cargar datos:", err);
      setAtletas([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMore = () => {
    setPage(p => p + 1);
  };

  useEffect(() => {
    setPage(1);
  }, [busqueda, filtros, ordenarPor]);

  useEffect(() => { 
    loadData(); 
    
    // Check readiness diario si es atleta (a partir de las 6:00 AM)
    if (user.rol === 'atleta' && user.atleta_id) {
      const horaActual = new Date().getHours();
      if (horaActual >= 6) {
        import('./api/readinessService').then(({ fetchReadinessHoy }) => {
          fetchReadinessHoy(user.atleta_id).then(data => {
            if (!data) {
              setShowReadinessModal(true);
            }
          }).catch(err => console.error("Error checking readiness", err));
        });
      }
    }
  }, [loadData, user]);

  const handleFiltroChange = (key, value) => {
    setFiltros(prev => ({ ...prev, [key]: value }));
  };

  // Filtrar
  const atletasFiltrados = atletas.filter(a => {
    // Búsqueda
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const matchName = (a.nombre || '').toLowerCase().includes(q);
      const matchCedula = (a.cedula || '').toLowerCase().includes(q);
      if (!matchName && !matchCedula) return false;
    }

    // Filtros
    if (filtros.categoria !== 'Todas') {
      const catFiltro = filtros.categoria;
      const catAtleta = a.categoria || '';
      if (catAtleta !== catFiltro && !catFiltro.includes(catAtleta) && !catAtleta.includes(catFiltro)) {
        return false;
      }
    }
    if (filtros.posicion !== 'Todas' && a.posicion !== filtros.posicion) return false;
    if (filtros.nivelDesarrollo !== 'Todos' && a.nivel_desarrollo !== filtros.nivelDesarrollo) return false;
    if (filtros.genero !== 'Todos' && a.genero !== filtros.genero) return false;
    return true;
  });

  // Ordenar
  const atletasOrdenados = [...atletasFiltrados].sort((a, b) => {
    switch (ordenarPor) {
      case 'nombre': return (a.nombre || '').localeCompare(b.nombre || '');
      case 'edad': return (a.edad || 0) - (b.edad || 0);
      case 'nivel_desarrollo': {
        const fA = FASE_ORDEN[a.nivel_desarrollo] ?? 0;
        const fB = FASE_ORDEN[b.nivel_desarrollo] ?? 0;
        return fB - fA;
      }
      case 'overall': return (b.overall_score || 0) - (a.overall_score || 0);
      case 'talla': return (b.talla_cm || 0) - (a.talla_cm || 0);
      default: return 0;
    }
  });

  const ITEMS_PER_PAGE = 12;
  const atletasPaginados = atletasOrdenados.slice(0, page * ITEMS_PER_PAGE);
  const currentHasMore = atletasPaginados.length < atletasOrdenados.length;

  const handleLogout = () => { logout(); navigate('/login'); };

  // Vista exclusiva para atletas — layout propio con sidebar + tabs
  if (!loading && user.rol === 'atleta') {
    const atleta = atletasOrdenados[0] || null;
    return (
      <>
        <AthleteLayout atleta={atleta} todosLosAtletas={atletas} />
        {showReadinessModal && (
          <ReadinessModal
            atletaId={user.atleta_id}
            onClose={() => setShowReadinessModal(false)}
            onComplete={() => console.log('Readiness guardado')}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden text-white selection:bg-[#FFD700] selection:text-black">
      {user.rol !== 'atleta' && (
        <Sidebar
          filtros={filtros}
          onFiltroChange={handleFiltroChange}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-12 relative">
        <div className="absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-[#FFD700]/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#D4AF37]/5 blur-[120px] pointer-events-none rounded-full mix-blend-screen"></div>

        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[500px] bg-emerald-500/5 blur-[120px] pointer-events-none rounded-full mix-blend-screen"></div>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 relative z-10 gap-6">
          <div className="flex items-center">
            <button 
              className="md:hidden mr-4 text-[#FFD700] p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-1.5 h-6 bg-[#FFD700] rounded-full shadow-[0_0_10px_rgba(255,215,0,0.5)]"></div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500">
                  {user.rol === 'atleta' ? 'Mi Central' : 'Tripulación'}
                </h1>
              </div>
              <p className="text-gray-400 text-xs md:text-sm font-bold tracking-widest uppercase flex items-center">
                <Shield size={14} className="mr-2 text-[#FFD700]" />
                {user.rol === 'atleta' ? 'Panel de Rendimiento' : 'Centro de Mando Élite'}
              </p>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{user.rol}</span>
              <span className="font-black text-sm uppercase tracking-wide flex items-center">
                {user.nombre}
                <div className="w-2 h-2 rounded-full bg-emerald-500 ml-3 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => setShowEditProfile(true)}
                className="group flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-300"
                title="Editar Perfil"
              >
                <User size={16} className="text-gray-400 group-hover:text-white transition-colors" />
                <span className="hidden sm:inline text-xs font-bold text-gray-400 group-hover:text-white uppercase tracking-widest">Editar Perfil</span>
              </button>
              <button
                onClick={handleLogout}
                className="group p-3 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-all duration-300"
                title="Cerrar sesión"
                data-testid="btn-logout"
              >
                <LogOut size={16} className="text-gray-400 group-hover:text-red-400 transition-colors" />
              </button>
            </div>
          </motion.div>
        </header>

        {/* Premium Dashboard Toolbar */}
        {user.rol !== 'atleta' && !loading && (
          <div className="flex flex-wrap items-center justify-between mb-8 relative z-10 gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md">
            
            {/* Buscador */}
            <div className="w-full lg:w-1/4 min-w-[200px]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar cédula o nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full bg-[#121214] border border-[#FFD700]/30 text-white text-[11px] font-bold tracking-wide rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-[#FFD700]/60 focus:shadow-[0_0_15px_rgba(255,215,0,0.15)] transition-all"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto pb-2 lg:pb-0">
              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Género</span>
                <select value={filtros.genero} onChange={e => handleFiltroChange('genero', e.target.value)}
                  className="bg-[#121214] border border-[#FFD700]/30 text-white text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.05)]">
                  {generos.map(g => <option key={g} value={g}>{g === 'Todos' ? 'Todos' : g}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Categoría FEB</span>
                <select value={filtros.categoria} onChange={e => handleFiltroChange('categoria', e.target.value)}
                  className="bg-[#121214] border border-[#FFD700]/30 text-[#FFD700] text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none shadow-[0_0_10px_rgba(255,215,0,0.1)]">
                  {categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'Todas' : c}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Posición</span>
                <select value={filtros.posicion} onChange={e => handleFiltroChange('posicion', e.target.value)}
                  className="bg-[#121214] border border-white/10 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none hover:border-white/30 transition-colors">
                  {posiciones.map(p => <option key={p} value={p}>{p === 'Todas' ? 'Todas' : p}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 ml-1">Nivel</span>
                <select value={filtros.nivelDesarrollo} onChange={e => handleFiltroChange('nivelDesarrollo', e.target.value)}
                  className="bg-[#121214] border border-white/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer appearance-none hover:border-emerald-500/30 transition-colors">
                  {nivelesDesarrollo.map(n => <option key={n} value={n}>{n === 'Todos' ? 'Todos' : n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-3 w-full lg:w-auto mt-2 lg:mt-0 pt-2 lg:pt-0 border-t border-white/10 lg:border-none">
              <div className="flex flex-col items-end w-full lg:w-auto">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest mb-1 mr-1">Ordenar Por</span>
                <div className="flex items-center space-x-2 bg-[#121214] border border-white/10 rounded-xl px-3 py-1.5">
                  <ListFilter size={14} className="text-[#FFD700]" />
                  <select
                    value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)}
                    className="bg-transparent border-none text-[10px] text-white font-bold uppercase tracking-widest focus:outline-none cursor-pointer"
                  >
                    <option value="overall" className="bg-[#121214]">Experiencia Total</option>
                    <option value="nombre" className="bg-[#121214]">Nombre</option>
                    <option value="edad" className="bg-[#121214]">Edad</option>
                    <option value="nivel_desarrollo" className="bg-[#121214]">Nivel Desarrollo</option>
                  </select>
                </div>
              </div>
              
              <button 
                onClick={() => setShowAsignador(true)}
                className="flex items-center justify-center space-x-2 bg-[#FFD700]/10 border border-[#FFD700]/50 text-[#FFD700] hover:bg-[#FFD700]/20 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)] shrink-0 self-end"
              >
                <Target size={16} />
                <span className="hidden md:inline">Misiones</span>
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-[#FFD700]">
            <Loader2 className="w-16 h-16 animate-spin mb-6 opacity-80" />
            <p className="font-bold tracking-[0.3em] uppercase text-xs animate-pulse">Sincronizando Supabase...</p>
          </div>
        ) : (
          <>
            <div className="mb-12 relative z-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {atletasPaginados.map(atleta => (
                  <AthleteGridCard key={atleta.id} atleta={atleta} onClick={() => setSelectedAtleta(atleta)} />
                ))}
              </div>
              {currentHasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={loadMore}
                    className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-[#FFD700]/10 hover:border-[#FFD700]/30 hover:text-[#FFD700] text-gray-400 font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    Cargar Más
                  </button>
                </div>
              )}
            </div>
            {atletasFiltrados.length === 0 && (
              <div className="text-center py-20 relative z-10">
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No hay atletas con esos filtros</p>
              </div>
            )}
          </>
        )}

        {/* Modal Perfil Específico */}
        {selectedAtleta && (
          <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 pt-16 md:pt-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <button 
              onClick={() => setSelectedAtleta(null)}
              className="fixed top-4 right-4 z-[110] flex items-center space-x-2 text-white bg-black/50 hover:bg-black/80 p-2 pr-4 rounded-full border border-white/10 backdrop-blur-md transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]"
            >
              <div className="bg-red-500/20 text-red-400 rounded-full p-1"><X size={16} /></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-100">Cerrar</span>
            </button>
            <div className="relative w-full max-w-xl my-8 mt-16 md:mt-8">
              {['Premini (Sub-9)', 'Mini (Sub-11)'].includes(selectedAtleta.categoria)
                ? <MicroCard atleta={selectedAtleta} />
                : <AtletaCard atleta={selectedAtleta} index={0} todosLosAtletas={atletas} />
              }
            </div>
          </div>
        )}
        {/* PWA Install Prompt */}
        <InstallPrompt />

        {showAsignador && (
          <AsignadorMisiones 
            todosLosAtletas={atletas} 
            onClose={() => setShowAsignador(false)} 
          />
        )}

        {showReadinessModal && (
          <ReadinessModal 
            atletaId={user.atleta_id}
            onClose={() => setShowReadinessModal(false)}
            onComplete={() => {
              // Si se requiere refrescar, se puede llamar loadData
              console.log('Readiness guardado');
            }}
          />
        )}

        {/* Modal Editar Perfil */}
        {showEditProfile && (
          <EditarPerfilModal onClose={() => setShowEditProfile(false)} onRefresh={() => window.location.reload()} />
        )}
      </main>
    </div>
  );
}

export default App;
