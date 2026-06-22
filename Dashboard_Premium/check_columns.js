import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('atletas').select('id, nivel_desarrollo, modo_vista').limit(1);
  console.log("Check atletas:", data, error);
}
check();
