// src/api/registroPublicoService.js
import { supabase } from './supabaseClient';
import { calcularEdad, calcularCategoriaFEB } from './utilsAtletas';

// ============================
// REGISTRO PÚBLICO (Formulario Padre)
// ============================

export const registrarDesdeFormularioPublico = async (datosAtleta, datosPadre = null) => {
  const edad = calcularEdad(datosAtleta.fecha_nacimiento);
  const categoriaAsignada = calcularCategoriaFEB(datosAtleta.fecha_nacimiento);

  // 1. Crear usuario atleta
  const { data: nuevoAtletaUsuario, error: errUsuAtleta } = await supabase
    .from('usuarios')
    .insert({
      cedula: datosAtleta.cedula,
      nombre: datosAtleta.nombre,
      correo: datosAtleta.correo || null,
      telefono: datosAtleta.telefono || null,
      fecha_nacimiento: datosAtleta.fecha_nacimiento,
      rol: 'atleta',
      club: datosAtleta.club || 'Black Gold',
      categoria: categoriaAsignada,
      genero: datosAtleta.genero || 'Masculino'
    })
    .select()
    .single();

  if (errUsuAtleta) {
    if (errUsuAtleta.code === '23505' || errUsuAtleta.message.includes('unique constraint')) {
      throw new Error(`La cédula "${datosAtleta.cedula}" ya se encuentra registrada en el sistema. Por favor, verifica los datos.`);
    }
    throw new Error('Error al registrar usuario atleta: ' + errUsuAtleta.message);
  }

  // 2. Crear registro atleta
  const { data: nuevoAtleta, error: errAtleta } = await supabase
    .from('atletas')
    .insert({
      usuario_id: nuevoAtletaUsuario.id,
      edad: edad,
      posicion: datosAtleta.posicion || 'N/A'
    })
    .select()
    .single();

  if (errAtleta) throw new Error('Error al registrar métricas del atleta: ' + errAtleta.message);

  // 3. Crear y vincular Padre/Representante si se proporcionaron los datos
  if (datosPadre && datosPadre.telefono) {
    const padreCedula = `PADRE_${datosPadre.telefono}`;

    // Revisar si ya existe el padre
    let padreId = null;
    const { data: padreExistente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('cedula', padreCedula)
      .single();

    if (padreExistente) {
      padreId = padreExistente.id;
    } else {
      // Crear nuevo padre
      const { data: nuevoPadre, error: errPadre } = await supabase
        .from('usuarios')
        .insert({
          cedula: padreCedula,
          nombre: datosPadre.nombre,
          correo: datosPadre.correo,
          telefono: datosPadre.telefono,
          rol: 'padre',
          club: datosAtleta.club || 'Black Gold'
        })
        .select()
        .single();

      if (errPadre) {
        if (errPadre.code === '23505' || errPadre.message.includes('unique constraint')) {
          throw new Error(`El teléfono del representante "${datosPadre.telefono}" ya está registrado con otro padre.`);
        }
        throw new Error('Error al registrar representante: ' + errPadre.message);
      }
      padreId = nuevoPadre.id;
    }

    // Vincular en padres_atletas
    if (padreId) {
      const { error: errVinculo } = await supabase
        .from('padres_atletas')
        .insert({ padre_id: padreId, atleta_id: nuevoAtleta.id });
      if (errVinculo) throw new Error('Error al vincular el representante con el atleta: ' + errVinculo.message);
    }
  }

  return { success: true, atletaId: nuevoAtleta.id };
};
