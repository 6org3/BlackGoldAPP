import fs from 'fs';
const envFile = fs.readFileSync('.env', 'utf-8');
let URL = '';
let KEY = '';
envFile.split('\n').forEach(line => {
  if(line.startsWith('VITE_SUPABASE_URL=')) URL = line.split('=')[1].trim();
  if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) KEY = line.split('=')[1].trim();
});

async function run() {
  const res = await fetch(`${URL}/rest/v1/atletas?select=*,usuarios!atletas_usuario_id_fkey(nombre)&limit=50`, {
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`
    }
  });
  const data = await res.json();
  console.log("Atletas in DB:", JSON.stringify(data, null, 2));
}
run();
