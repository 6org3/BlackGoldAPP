import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('atletas').select('id, nombre, xp_total').limit(10);
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}

run();
