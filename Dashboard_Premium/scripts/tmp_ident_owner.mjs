import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/)
  .map(l=>l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
  .map(m=>[m[1],m[2].replace(/^["']|["']$/g,'')]));
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const { data: o } = await db.from('usuarios').select('id,cedula,nombre,correo,auth_user_id,club')
  .eq('rol','owner').eq('club','Nueva Loja Basket').eq('estado','activo').not('auth_user_id','is',null).limit(1).single();
const { data: c } = await db.auth.admin.getUserById(o.auth_user_id);
console.log(JSON.stringify({ cedula: o.cedula, nombre: o.nombre, marca: c.user.app_metadata?.debe_cambiar_password ?? null }));
