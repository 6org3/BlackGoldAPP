const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

async function fetchUsers() {
  const roles = ['superadmin', 'owner', 'coach', 'atleta', 'padre'];
  
  for (const rol of roles) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/usuarios?rol=eq.${rol}&select=nombre,rol,correo,telefono,cedula,contrasena_hash&limit=2`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      const data = await response.json();
      
      console.log(`\n--- ROL: ${rol.toUpperCase()} ---`);
      if (!data || data.length === 0) {
        console.log('No users found for this role.');
        continue;
      }
      
      data.forEach(user => {
        let passwordInfo = '';
        if (rol === 'atleta') passwordInfo = `Contraseña: ${user.cedula}`;
        else if (rol === 'padre') passwordInfo = `Contraseña: ${user.telefono}`;
        else passwordInfo = `Contraseña: ${user.contrasena_hash}`;
        
        console.log(`Nombre: ${user.nombre}`);
        console.log(`Identificador (Login): ${user.correo || user.cedula || user.telefono}`);
        console.log(`Cédula: ${user.cedula || 'N/A'}`);
        console.log(`Correo: ${user.correo || 'N/A'}`);
        console.log(`Teléfono: ${user.telefono || 'N/A'}`);
        console.log(passwordInfo);
        console.log('---------------------------');
      });
    } catch (e) {
      console.error(e);
    }
  }
}

fetchUsers();
