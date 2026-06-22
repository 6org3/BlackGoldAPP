const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

async function getMisiones() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/misiones?select=*`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const misiones = await response.json();
    console.log("Misiones list:", misiones);
    
    // Group by tipo
    const tipos = {};
    misiones.forEach(m => {
      tipos[m.tipo] = (tipos[m.tipo] || 0) + 1;
    });
    console.log("Tipos found in misiones table:", tipos);
  } catch (err) {
    console.error(err);
  }
}

getMisiones();
