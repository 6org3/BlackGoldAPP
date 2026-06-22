import React from 'react'
import './index.css'

function App() {
  const atletas = [
    { id: 1, nombre: 'Zoro', posicion: '3 and D', fuerza: 85, explosividad: 80, mambaScore: 92 },
    { id: 2, nombre: 'Sanji', posicion: 'Generador (1-2)', fuerza: 75, explosividad: 95, mambaScore: 88 },
    { id: 3, nombre: 'Usopp', posicion: 'Generador', fuerza: 60, explosividad: 70, mambaScore: 65 }, // Alerta Mamba
    { id: 4, nombre: 'Franky', posicion: 'Ancla Fuerte (5)', fuerza: 98, explosividad: 65, mambaScore: 90 }
  ];

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <h1>Black Gold</h1>
        <p style={{color: 'var(--text-secondary)', marginBottom: '2rem'}}>Tripulación y Táctica</p>
        <ul style={{listStyle: 'none', padding: 0, marginTop: '2rem'}}>
          <li style={{marginBottom: '1.5rem', color: 'var(--gold-primary)', fontWeight: 'bold'}}>▶ Atletas / Tripulación</li>
          <li style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>▷ Pizarra Small Ball</li>
          <li style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>▷ Rendimiento Físico</li>
          <li style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>▷ Enfermería</li>
        </ul>
      </aside>

      <main className="main-content">
        <header style={{marginBottom: '3rem', borderBottom: '1px solid #333', paddingBottom: '1rem'}}>
          <h2 style={{fontSize: '2rem', margin: 0}}>Dashboard Mamba Mentality</h2>
          <p style={{color: 'var(--text-secondary)'}}>Monitoreo de Fuerza Amazónica y Resiliencia Táctica</p>
        </header>

        <div className="stats-grid">
          {atletas.map(atleta => (
            <div key={atleta.id} className="card" style={{ borderColor: atleta.mambaScore < 70 ? 'var(--danger-red)' : '#333' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <div>
                  <h3 style={{fontSize: '1.5rem'}}>{atleta.nombre}</h3>
                  <span style={{backgroundColor: 'var(--gold-primary)', color: '#000', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold'}}>
                    {atleta.posicion}
                  </span>
                </div>
                <div style={{textAlign: 'right'}}>
                  <p className={atleta.mambaScore < 70 ? 'mamba-score danger' : 'mamba-score'}>{atleta.mambaScore}</p>
                  <small style={{color: 'var(--text-secondary)'}}>Mamba Score</small>
                </div>
              </div>

              <div style={{marginTop: '2rem'}}>
                <div style={{marginBottom: '1rem'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
                    <span style={{fontWeight: 'bold'}}>Fuerza Isométrica</span>
                    <span>{atleta.fuerza}/100</span>
                  </div>
                  <div style={{width: '100%', height: '8px', backgroundColor: '#333', borderRadius: '4px', marginTop: '6px'}}>
                    <div style={{width: `${atleta.fuerza}%`, height: '100%', backgroundColor: 'var(--gold-primary)', borderRadius: '4px'}}></div>
                  </div>
                </div>

                <div>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
                    <span style={{fontWeight: 'bold'}}>Explosividad (Small Ball)</span>
                    <span>{atleta.explosividad}/100</span>
                  </div>
                  <div style={{width: '100%', height: '8px', backgroundColor: '#333', borderRadius: '4px', marginTop: '6px'}}>
                    <div style={{width: `${atleta.explosividad}%`, height: '100%', backgroundColor: 'var(--gold-primary)', borderRadius: '4px'}}></div>
                  </div>
                </div>
              </div>
              
              {atleta.mambaScore < 70 && (
                <div style={{marginTop: '1.5rem', padding: '0.8rem', backgroundColor: 'rgba(139, 0, 0, 0.2)', border: '1px solid var(--danger-red)', borderRadius: '6px', color: '#ff9999', fontSize: '0.85rem'}}>
                  ⚠️ <strong>ALERTA TÁCTICA:</strong> Caída crítica de resiliencia. El jugador no está soportando la presión del sistema.
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
