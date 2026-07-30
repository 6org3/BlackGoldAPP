import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Se mira la URL ANTES de crear el cliente: supabase-js canjea el token del
// enlace y limpia el hash por su cuenta (`detectSessionInUrl`), así que para
// cuando monta cualquier componente ya no queda rastro de por dónde se entró.
//
// Hace falta distinguirlo porque el enlace de recuperación abre una sesión
// normal, indistinguible de la de alguien que simplemente ya había entrado. Sin
// esta marca, /recuperar le diría "ya verificamos tu correo" a cualquiera que
// tuviera sesión abierta, y quien quisiera PEDIR un enlace desde su propio
// teléfono no llegaría nunca al formulario.
//
// Se cubren las dos formas en que Supabase devuelve la recuperación: el flujo
// implícito (`#type=recovery`) y el PKCE (`?code=`, que solo aparece al volver
// de un enlace de Auth).
const urlDeEntrada = typeof window !== 'undefined' ? window.location : null;
export const llegoPorEnlaceDeAuth = Boolean(
  urlDeEntrada && (
    /type=recovery/.test(urlDeEntrada.hash || '') ||
    new URLSearchParams(urlDeEntrada.search || '').has('code')
  )
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
