import { defineConfig } from "cypress";
import { sembrarSesionActivaQA } from "./scripts/sembrar_sesion_activa_qa.js";
import { sembrarReadinessHoyQA } from "./scripts/sembrar_readiness_qa.js";
import { sembrarPlantillasCanchaQA, sembrarSesionControlHistorialQA } from "./scripts/sembrar_catalogo_sesiones_qa.js";

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on) {
      // Tasks de seed: un spec que necesita estado previo en la base lo pide
      // aquí en vez de depender de que alguien recuerde correr un script. Corren
      // en Node, así que la SERVICE_ROLE_KEY nunca llega al navegador.
      on('task', {
        // Deja al coach QA con una sesión [EN_CURSO] y su atleta presente. El
        // spec que la usa la CONSUME (la cierra), así que la vuelve a pedir en
        // cada corrida; el seed es idempotente (borra la previa antes de crear).
        sembrarSesionActivaQA: () => sembrarSesionActivaQA(),

        // Deja hecho el check-in del día del atleta QA. Sin él, /atleta auto-abre
        // el modal de readiness (#89) y su overlay tapa el HUD: los specs que solo
        // pasan por el portal para otra cosa se ponían rojos al cambiar el día.
        sembrarReadinessHoyQA: () => sembrarReadinessHoyQA(),

        // Deja 2 plantillas [QA] en catalogo_sesiones (con drills reales) para que
        // el paso "Objetivo de la sesión" del Modo Cancha se ejecute en navegador.
        // Idempotente (borra las [QA] previas del club antes de insertar).
        sembrarPlantillasCanchaQA: () => sembrarPlantillasCanchaQA(),

        // Deja una sesión de historial [QA] en sesiones_control con 2 drills reales
        // + un id huérfano, para el selector/historial de AdminSesiones (chips de
        // drills y "Ejercicio eliminado"). Idempotente.
        sembrarSesionControlHistorialQA: () => sembrarSesionControlHistorialQA(),
      });
    },
  },
});
