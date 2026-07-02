import { Flame, Zap as ZapIcon, MessageCircle, Snowflake } from 'lucide-react';

export const INSIGNIAS = [
  { id: 'mamba', label: 'Mamba Mentality', icon: <Flame size={16} className="text-orange-500" />, desc: 'Foco y determinación', xp: 50 },
  { id: 'hustle', label: 'Motor Inagotable', icon: <ZapIcon size={16} className="text-[#FFD700]" />, desc: 'Esfuerzo al 100%', xp: 40 },
  { id: 'lider', label: 'Líder', icon: <MessageCircle size={16} className="text-blue-400" />, desc: 'Comunicación positiva', xp: 40 },
  { id: 'ice', label: 'Sangre Fría', icon: <Snowflake size={16} className="text-cyan-300" />, desc: 'Resiliencia ante el error', xp: 50 }
];

export const OBJETIVOS_CLASE = [
  'Físico - Fuerza',
  'Físico - Explosividad',
  'Físico - Velocidad/Agilidad',
  'Físico - Resistencia',
  'Eficiencia Táctica',
  'Resiliencia Psicológica',
  'Liderazgo y Comunicación'
];
