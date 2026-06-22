import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getCredentials() {
  const roles = ['superadmin', 'owner', 'coach', 'atleta', 'padre'];
  
  for (const rol of roles) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('nombre, rol, correo, telefono, cedula, contrasena_hash')
      .eq('rol', rol)
      .limit(2);
      
    if (error) {
      console.error('Error fetching', rol, error);
      continue;
    }
    
    console.log(`\n--- ROL: ${rol.toUpperCase()} ---`);
    if (data.length === 0) {
      console.log('No users found for this role.');
    }
    data.forEach(user => {
      let passwordInfo = '';
      if (rol === 'atleta') passwordInfo = `Contraseña: ${user.cedula} (es su cédula)`;
      else if (rol === 'padre') passwordInfo = `Contraseña: ${user.telefono} (es su teléfono)`;
      else passwordInfo = `Contraseña: ${user.contrasena_hash} (almacenada en BD)`;
      
      console.log(`Nombre: ${user.nombre}`);
      console.log(`Identificador (Login): ${user.correo || user.cedula || user.telefono}`);
      console.log(`Cédula: ${user.cedula || 'N/A'}`);
      console.log(`Correo: ${user.correo || 'N/A'}`);
      console.log(`Teléfono: ${user.telefono || 'N/A'}`);
      console.log(passwordInfo);
      console.log('---------------------------');
    });
  }
}

getCredentials();
