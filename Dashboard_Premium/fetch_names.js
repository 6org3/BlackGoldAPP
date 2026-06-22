import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const ids = [
    'd49b33f9-9b07-49a4-92f5-b98b163a70c3',
    'e21e72e9-6e87-46f9-b130-2b6c3b7e9870',
    'e61602e8-0b52-4f1d-82f3-e49e5231aba6',
    'fb5d91b3-3853-4cb3-bdd1-a3a85996eca8',
    '4c322800-be7d-4bf8-8859-fdf6751d6f57'
  ];
  
  const { data, error } = await supabase
    .from('atletas')
    .select('id, xp_total, usuarios!inner(nombre)')
    .in('id', ids);
    
  if (error) {
    console.error(error);
    return;
  }
  
  for (const a of data) {
    console.log(`Nombre: ${a.usuarios.nombre} | XP Total Simulada: ${a.xp_total}`);
  }
}

run();
