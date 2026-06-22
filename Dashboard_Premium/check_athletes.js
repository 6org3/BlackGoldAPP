const supabaseUrl = 'https://rpacqduboxkhetdlcgxb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwYWNxZHVib3hraGV0ZGxjZ3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Nzg2NTIsImV4cCI6MjA5NjE1NDY1Mn0.wlBiWaTnaWOGPIRxUAZCFwineLG4Nv5Lz6oghbZ_cWA';

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return 0;
  const hoy = new Date();
  const fechaNac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - fechaNac.getFullYear();
  const mes = hoy.getMonth() - fechaNac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
    edad--;
  }
  return edad;
}

function calcularCategoriaFEB(fechaNacimiento) {
  let edad;
  if (typeof fechaNacimiento === 'number') {
    edad = fechaNacimiento;
  } else {
    edad = calcularEdad(fechaNacimiento);
  }
  if (edad <= 9) return 'Premini (Sub-9)';
  if (edad <= 11) return 'Mini (Sub-11)';
  if (edad <= 14) return 'Menores (Sub-14)';
  if (edad <= 16) return 'Prejuvenil (Sub-16)';
  if (edad <= 18) return 'Juvenil (Sub-18)';
  return 'Mayores';
}

async function checkAthletes() {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/atletas?select=*,usuarios!atletas_usuario_id_fkey(*)`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const data = await response.json();
    console.log(`Total athletes in DB: ${data.length}`);
    
    console.log("\n--- VALENTINA AND SANTIAGO ---");
    data.forEach(a => {
      const nombre = a.usuarios?.nombre || '';
      if (nombre.toLowerCase().includes('valentina') || nombre.toLowerCase().includes('santiago')) {
        console.log({
          nombre,
          genero: a.usuarios?.genero,
          fecha_nacimiento: a.usuarios?.fecha_nacimiento,
          categoria_db: a.usuarios?.categoria,
          edad_db: a.edad,
          edad_calculada: calcularEdad(a.usuarios?.fecha_nacimiento),
          categoria_calculada: calcularCategoriaFEB(a.usuarios?.fecha_nacimiento)
        });
      }
    });

    console.log("\n--- ATHLETES WITH CALC AGE <= 14 ---");
    data.forEach(a => {
      const calcEdad = calcularEdad(a.usuarios?.fecha_nacimiento);
      if (calcEdad <= 14 && a.usuarios) {
        console.log({
          nombre: a.usuarios.nombre,
          genero: a.usuarios.genero,
          fecha_nacimiento: a.usuarios.fecha_nacimiento,
          categoria_db: a.usuarios.categoria,
          edad_db: a.edad,
          edad_calculada: calcEdad,
          categoria_calculada: calcularCategoriaFEB(a.usuarios.fecha_nacimiento)
        });
      }
    });
  } catch (err) {
    console.error(err);
  }
}

checkAthletes();
