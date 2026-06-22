const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

async function testTables() {
  try {
    const r1 = await fetch(`${supabaseUrl}/rest/v1/misiones_atletas?select=*&limit=1`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    });
    console.log("misiones_atletas response status:", r1.status);
    
    const r2 = await fetch(`${supabaseUrl}/rest/v1/progreso_misiones?select=*&limit=1`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` }
    });
    console.log("progreso_misiones response status:", r2.status);
  } catch (err) {
    console.error(err);
  }
}

testTables();
