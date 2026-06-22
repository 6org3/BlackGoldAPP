const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

async function checkRaw() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/usuarios?nombre=ilike.*Angela Solange*&select=*`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const users = await response.json();
    console.log("Raw user data:", users);
  } catch (err) {
    console.error(err);
  }
}

checkRaw();
