import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity } from 'lucide-react';

export default function HistorialFisicoChart({ evaluaciones }) {
  const data = useMemo(() => {
    if (!evaluaciones || evaluaciones.length === 0) return [];
    
    // Extraer pruebas de peso y altura
    const pesos = evaluaciones.filter(e => e.prueba_tipo === 'peso_kg').sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const alturas = evaluaciones.filter(e => e.prueba_tipo === 'altura_cm').sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

    if (pesos.length === 0) return [];

    // Agrupar por fecha
    const mapaFechas = {};
    
    // Función auxiliar para tener la altura vigente en una fecha
    const getAlturaVigente = (fecha) => {
      const fechaTarget = new Date(fecha);
      let alturaActual = alturas[0]?.valor_crudo || 0;
      for (let a of alturas) {
        if (new Date(a.created_at) <= fechaTarget) {
          alturaActual = a.valor_crudo;
        }
      }
      return alturaActual;
    };

    pesos.forEach(p => {
      const dateKey = new Date(p.created_at).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      const peso = parseFloat(p.valor_crudo);
      const altura = getAlturaVigente(p.created_at);
      let imc = 0;
      if (altura > 0 && peso > 0) {
        const alturaM = altura / 100;
        imc = parseFloat((peso / (alturaM * alturaM)).toFixed(1));
      }

      mapaFechas[dateKey] = {
        name: dateKey,
        peso: peso,
        imc: imc > 0 ? imc : null
      };
    });

    return Object.values(mapaFechas);
  }, [evaluaciones]);

  if (data.length === 0) return null;

  return (
    <div className="w-full mt-6 bg-[#121214]/50 border border-white/5 rounded-2xl p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Activity size={16} className="text-purple-400" />
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Evolución Físico-Corporal</h4>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPeso" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34D399" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#34D399" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorImc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#A855F7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} />
            <YAxis yAxisId="left" stroke="rgba(255,255,255,0.2)" fontSize={10} domain={['dataMin - 2', 'dataMax + 2']} />
            <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.2)" fontSize={10} domain={['dataMin - 1', 'dataMax + 1']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ fontSize: '10px', color: '#9CA3AF', marginBottom: '4px' }}
            />
            <Area yAxisId="left" type="monotone" dataKey="peso" stroke="#34D399" name="Peso (kg)" strokeWidth={2} fillOpacity={1} fill="url(#colorPeso)" />
            <Area yAxisId="right" type="monotone" dataKey="imc" stroke="#A855F7" name="IMC" strokeWidth={2} fillOpacity={1} fill="url(#colorImc)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
