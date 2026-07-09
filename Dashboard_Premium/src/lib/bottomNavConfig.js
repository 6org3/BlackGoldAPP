// bottomNavConfig — ítems de la BottomNav móvil por rol de staff, apuntando
// a rutas reales (main.jsx: homes PR3 + módulos admin ya existentes). Mismo
// criterio que el mockup v6 (.bnav línea 114): 4 ítems, el primero siempre
// el home nativo del rol.
import { Home, Users, TrendingUp, Target, Building2, DollarSign, BarChart3, Cpu } from 'lucide-react';

export const BOTTOM_NAV_POR_ROL = {
  coach: [
    { key: 'home', label: 'Inicio', Icono: Home, ruta: '/coach' },
    { key: 'plantel', label: 'Plantel', Icono: Users, ruta: '/admin/atletas' },
    { key: 'comparar', label: 'Comparar', Icono: TrendingUp, ruta: '/admin/comparar' },
    { key: 'misiones', label: 'Misiones', Icono: Target, ruta: '/admin/misiones' },
  ],
  owner: [
    { key: 'home', label: 'Club', Icono: Building2, ruta: '/club' },
    { key: 'plantel', label: 'Plantel', Icono: Users, ruta: '/admin/atletas' },
    { key: 'comparar', label: 'Comparar', Icono: TrendingUp, ruta: '/admin/comparar' },
    { key: 'pagos', label: 'Pagos', Icono: DollarSign, ruta: '/admin/pagos' },
  ],
  superadmin: [
    { key: 'home', label: 'Sistema', Icono: Cpu, ruta: '/sistema' },
    { key: 'plantel', label: 'Plantel', Icono: Users, ruta: '/admin/atletas' },
    { key: 'comparar', label: 'Comparar', Icono: TrendingUp, ruta: '/admin/comparar' },
    { key: 'kpis', label: 'KPIs', Icono: BarChart3, ruta: '/admin/kpis' },
  ],
};
