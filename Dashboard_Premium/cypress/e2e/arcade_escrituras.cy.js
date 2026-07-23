/**
 * Escrituras reales del rediseño Arcade HUD (fase 5) contra Supabase, con
 * cuentas QA ("QA Demo Club"). Verifica los writes a NIVEL DE RED: cada
 * POST/PATCH a PostgREST debe volver 2xx — sin necesidad de consultar la BD.
 *
 * Requiere:
 *   - dev server en http://localhost:5173 (baseUrl de cypress.config.js)
 *   - cypress.env.json con QA_ROLES.coach y QA_ROLES.padre (gitignored)
 *
 * Cada corrida crea datos reales en el QA Demo Club (una sesión + asistencia +
 * observación + XP para el atleta QA). Es intencional y seguro (club ficticio).
 */
describe('Arcade HUD — escrituras reales (fase 5)', () => {
  const QA = Cypress.env('QA_ROLES');

  before(function () {
    if (!QA || !QA.coach || !QA.padre) {
      throw new Error('Falta cypress.env.json con QA_ROLES.coach y QA_ROLES.padre (ver cypress.env.json.example).');
    }
  });

  function login(creds) {
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.visit('/login');
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]', { timeout: 15000 })
      .first()
      .should('be.enabled')
      .type(creds.identificador);
    cy.get('input[type="password"]').first().should('be.enabled').type(creds.password, { log: false });
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
  }

  it('Coach — Modo Cancha escribe sesión, asistencia, evaluación y XP', () => {
    cy.viewport(412, 860);

    // Espías de las escrituras (sin `times`: cy.wait las consume en orden).
    cy.intercept('POST', '**/rest/v1/sesiones_programadas*').as('insSesion');
    cy.intercept('POST', '**/rest/v1/asistencia*').as('insAsistencia');
    cy.intercept('POST', '**/rest/v1/observaciones_cancha*').as('insObservacion');
    cy.intercept('PATCH', '**/rest/v1/atletas*').as('patchAtleta');
    cy.intercept('PATCH', '**/rest/v1/sesiones_programadas*').as('patchSesion');

    login(QA.coach);

    // /dashboard tiene el FAB de Modo Cancha (móvil) para el coach.
    cy.visit('/dashboard');
    cy.get('.animate-spin', { timeout: 20000 }).should('not.exist');

    // Abrir el takeover Arcade.
    cy.get('[aria-label="Abrir Modo Cancha"]', { timeout: 20000 }).click({ force: true });
    cy.get('[aria-label="GRUPAL NIVELES"]', { timeout: 15000 }).should('be.visible');

    // 1. Tipo de clase → Grupal por niveles.
    cy.get('[aria-label="GRUPAL NIVELES"]').click({ force: true });

    // 2. Bloque de nivel → Desarrollo (nivel del atleta QA).
    cy.get('[aria-label^="Bloque Desarrollo"]', { timeout: 15000 }).click({ force: true });

    // 2b. Paso "Objetivo de la sesión" (opcional): aparece cuando el coach QA ve
    // plantillas en catalogo_sesiones (hay semillas globales, y el seed de
    // catalogo_ejercicios.cy.js agrega plantillas del club → hasPlantillas=true).
    // Este spec no evalúa ese paso: si aparece, se sigue sin plantilla. Sin este
    // guard, el flujo quedaría atascado antes de "Pasar lista".
    cy.get('body').then(($b) => {
      if (/Objetivo de la sesión/i.test($b.text())) {
        cy.contains('button', /CONTINUAR SIN PLANTILLA|^CONTINUAR$/i).click({ force: true });
      }
    });

    // 3. Pasar lista → esperar el roster real y marcar presente al atleta
    //    (con su toggle P directo — más robusto que "Todos" ante el clip-path).
    cy.contains('PRESENTES', { timeout: 15000 }).should('be.visible');
    cy.contains(/QA Atleta Demo/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label="Presente"]').first().click({ force: true });
    // El footer solo se habilita si la asistencia quedó marcada (reintenta).
    cy.contains('button', /INICIAR SESIÓN/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });

    // → escrituras de arranque
    cy.wait('@insSesion').its('response.statusCode').should('be.oneOf', [200, 201]);
    cy.wait('@insAsistencia').its('response.statusCode').should('be.oneOf', [200, 201]);

    // 4. Sesión activa → Terminar y evaluar.
    cy.contains(/SESIÓN EN FOCO/i, { timeout: 15000 }).should('be.visible');
    cy.contains('button', /TERMINAR Y EVALUAR/i).click({ force: true });

    // 5. Cierre → marcar destacado y abrir su evaluación.
    cy.contains(/DESTACADOS DE HOY/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label^="Marcar como destacado"]', { timeout: 15000 }).first().click({ force: true });
    cy.get('[aria-label^="Evaluar a"]', { timeout: 10000 }).first().click({ force: true });

    // 6. Evaluar → 5★ en los 4 ejes (desbloquea insignias) y guardar.
    cy.contains(/EVALUACIÓN SUBJETIVA/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label="5 de 5"]').each(($star) => cy.wrap($star).click({ force: true }));
    cy.contains('button', /GUARDAR EVALUACIÓN/i).click({ force: true });

    // → escrituras de evaluación (observación + XP)
    cy.wait('@insObservacion').its('response.statusCode').should('be.oneOf', [200, 201]);
    cy.wait('@patchAtleta').its('response.statusCode').should('be.oneOf', [200, 204]);

    // 7. Cierre → Finalizar (cierra la sesión + XP de asistencia).
    cy.contains(/DESTACADOS DE HOY/i, { timeout: 15000 }).should('be.visible');
    cy.contains('button', /FINALIZAR/i).click({ force: true });

    // → escritura de cierre (estado Completada)
    cy.wait('@patchSesion').its('response.statusCode').should('be.oneOf', [200, 204]);

    // 8. Fin.
    cy.contains(/CLASE FINALIZADA/i, { timeout: 15000 }).should('be.visible');
    cy.contains(/\+.*XP/i).should('be.visible');
  });

  it('Coach — reanuda una sesión activa (reconstruye asistencia) y la cierra con XP', () => {
    // Este test CONSUME su precondición: cierra la sesión, que deja de estar
    // activa. Por eso la siembra él mismo (task en Node, ver cypress.config.js)
    // en vez de depender de `node scripts/sembrar_sesion_activa_qa.js` a mano:
    // así solo pasaba la primera corrida tras sembrar y quedaba rojo el resto,
    // sin que nada estuviera roto. El seed es idempotente (borra la previa).
    // Va dentro del it y no en un beforeEach del describe a propósito: los otros
    // dos tests no la necesitan, y al de "escribe sesión" una sesión activa
    // colgando le cambiaría el landing del Modo Cancha.
    cy.task('sembrarSesionActivaQA');

    cy.viewport(412, 860);
    cy.intercept('PATCH', '**/rest/v1/atletas*').as('patchAtleta');
    cy.intercept('PATCH', '**/rest/v1/sesiones_programadas*').as('patchSesion');

    login(QA.coach);
    cy.visit('/dashboard');
    cy.get('.animate-spin', { timeout: 20000 }).should('not.exist');
    cy.get('[aria-label="Abrir Modo Cancha"]', { timeout: 20000 }).click({ force: true });

    // Entrar a la sesión activa sembrada (reanudar).
    cy.contains(/SESIONES ACTIVAS/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label^="Entrar a"]', { timeout: 10000 }).first().click({ force: true });

    // Sesión en foco → terminar y evaluar.
    cy.contains(/SESIÓN EN FOCO/i, { timeout: 15000 }).should('be.visible');
    cy.contains('button', /TERMINAR Y EVALUAR/i).click({ force: true });

    // Cierre: la asistencia reconstruida hace aparecer al atleta presente.
    // Se lo marca destacado (habilita Finalizar) y se cierra SIN evaluar → solo
    // XP base de asistencia.
    cy.contains(/DESTACADOS DE HOY/i, { timeout: 15000 }).should('be.visible');
    cy.contains(/QA Atleta Demo/i, { timeout: 10000 }).should('be.visible');
    cy.get('[aria-label^="Marcar como destacado"]', { timeout: 10000 }).first().click({ force: true });
    cy.contains('button', /FINALIZAR/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });

    // Cierre real: XP base a los presentes + sesión Completada.
    cy.wait('@patchAtleta').its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait('@patchSesion').its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.contains(/CLASE FINALIZADA/i, { timeout: 15000 }).should('be.visible');
  });

  it('Padre — la vista carga con datos reales y confirma asistencia si hay evento', () => {
    cy.viewport(412, 860);
    cy.intercept('PATCH', '**/rest/v1/evento_convocados*').as('rsvp');

    login(QA.padre);
    cy.url({ timeout: 15000 }).should('include', '/padre');

    // Lectura real del representado.
    cy.contains(/MI REPRESENTADO/i, { timeout: 20000 }).should('be.visible');
    cy.contains(/QA Atleta Demo/i, { timeout: 20000 }).should('be.visible');
    cy.contains(/SUS \d+ PILARES/i).should('be.visible');

    // RSVP solo si el atleta QA tiene un evento próximo (si no, se omite).
    cy.get('body').then(($b) => {
      if (/CONFIRMAR ASISTENCIA/i.test($b.text())) {
        cy.contains('button', /CONFIRMAR ASISTENCIA/i).click({ force: true });
        cy.wait('@rsvp').its('response.statusCode').should('be.oneOf', [200, 204]);
        cy.contains(/ASISTENCIA CONFIRMADA/i).should('be.visible');
      } else {
        cy.log('El atleta QA no tiene evento próximo — se omite la escritura de RSVP.');
      }
    });
  });
});
