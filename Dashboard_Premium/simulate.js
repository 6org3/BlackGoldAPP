import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: atletas, error } = await supabase.from('atletas').select('id, xp_total').limit(5);
  if (error) {
    console.error(error);
    return;
  }
  
  const xpToAdd = [800, 2600, 5200, 7800, 1500]; // Random amounts to simulate different attendance
  
  for (let i = 0; i < atletas.length; i++) {
    const a = atletas[i];
    const newXP = (a.xp_total || 0) + xpToAdd[i];
    await supabase.from('atletas').update({ xp_total: newXP }).eq('id', a.id);
    console.log(`Atleta ID: ${a.id} | XP Anterior: ${a.xp_total || 0} -> XP Nuevo: ${newXP} (+${xpToAdd[i]} XP)`);
  }
}

run();
