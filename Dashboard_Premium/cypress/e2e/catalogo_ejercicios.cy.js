/**
 * Cobertura E2E del catálogo de ejercicios (PR #127/#130): el selector +
 * historial de AdminSesiones, y el paso "Objetivo de la sesión" del Modo Cancha
 * (PantallaObjetivo) — que solo se ejecuta si el coach ve plantillas en
 * catalogo_sesiones. Cada spec siembra su propia precondición (task en Node, ver
 * cypress.config.js) contra el "QA Demo Club", así es repetible sin depender de
 * que alguien recuerde correr un script.
 *
 * Requiere:
 *   - dev server en http://localhost:5173 (baseUrl de cypress.config.js)
 *   - cypress.env.json con QA_ROLES.coach (gitignored)
 *
 * Cada corrida crea datos reales en el QA Demo Club (plantillas, una sesión de
 * historial y, en los flujos de cancha, sesiones que se cierran al terminar).
 * Es intencional y seguro (club ficticio).
 */
describe('Catálogo de ejercicios — selector, historial y Modo Cancha', () => {
  const QA = Cypress.env('QA_ROLES');

  before(function () {
    if (!QA || !QA.coach) {
      throw new Error('Falta cypress.env.json con QA_ROLES.coach (ver cypress.env.json.example).');
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

  it('AdminSesiones — selector de drills (badges + expandir sin seleccionar) e historial con chips', () => {
    let drillsReales;
    cy.task('sembrarSesionControlHistorialQA').then((i) => {
      drillsReales = i.drillsReales;
    });

    login(QA.coach);
    cy.visit('/admin/sesiones');
    cy.get('.animate-spin', { timeout: 20000 }).should('not.exist');

    // El selector solo se pinta con un tipo NO-Evaluación; el default de
    // objetivoTipo es 'Técnico', así que ya está visible sin tocar nada. El club
    // QA no tiene grupos → se ofrecen todos los drills del tipo, sin filtro de nivel.
    cy.contains(/Ejercicios \(\d+ disponibles\)/, { timeout: 20000 }).should('be.visible');

    // Al menos un badge de nivel del catálogo real. El primer match puede caer
    // fuera del scroll visible de la lista (overflow-y-auto, max-h-48/64):
    // scrollIntoView antes de pedir visibilidad.
    cy.contains(/⚡ Desarrollo|🌱 Micro|👑 Elite/, { timeout: 20000 }).scrollIntoView().should('be.visible');

    // Expandir la descripción ("Ver más") NO debe togglear la selección del drill:
    // el botón anidado hace stopPropagation. Se apunta a un drill por NOMBRE EXACTO
    // del catálogo real (no .first()/:contains genérico sobre "Ver más": con 32
    // drills Técnico en la lista, el selector CSS :contains() y cy.contains()
    // dentro de .within() resolvían el "primer" match de forma INCONSISTENTE entre
    // sí — el clic terminaba togglenado un drill distinto al que se verificaba
    // después. Un nombre exacto es determinista.
    cy.contains('button[aria-pressed]', '5-10-5 pro agility', { timeout: 20000 }).as('drill');
    cy.get('@drill').should('have.attr', 'aria-pressed', 'false').scrollIntoView();
    cy.get('@drill').within(() => {
      cy.contains('button', 'Ver más').click({ force: true });
    });
    cy.get('@drill').should('have.attr', 'aria-pressed', 'false');
    cy.get('@drill').contains('Ver menos').should('exist');

    // Clic en el drill contenedor (esquina superior, lejos del botón anidado) → sí selecciona.
    cy.get('@drill').click('topLeft', { force: true });
    cy.get('@drill').should('have.attr', 'aria-pressed', 'true');
    cy.contains(/ejercicio\(s\) seleccionado\(s\)/i).should('be.visible');

    // Historial: la sesión sembrada con sus 2 drills reales + el chip de huérfano.
    // scrollIntoView: es otra sección de la página, con su propio contenedor con
    // overflow, y el scroll de la interacción con el selector no la deja a la vista.
    cy.contains('[QA] Historial con drills', { timeout: 20000 }).scrollIntoView().should('be.visible');
    cy.then(() => {
      cy.contains(drillsReales[0]).scrollIntoView().should('be.visible');
      cy.contains(drillsReales[1]).scrollIntoView().should('be.visible');
    });
    cy.contains('Ejercicio eliminado').scrollIntoView().should('be.visible');
  });

  it('Modo Cancha — una plantilla [QA] guía la sesión (flujo completo con PLAN DE SESIÓN)', () => {
    let plantillas;
    cy.task('sembrarPlantillasCanchaQA').then((i) => {
      plantillas = i.plantillas;
    });

    cy.viewport(412, 860);
    cy.intercept('POST', '**/rest/v1/sesiones_programadas*').as('insSesion');
    cy.intercept('POST', '**/rest/v1/asistencia*').as('insAsistencia');

    login(QA.coach);
    cy.visit('/dashboard');
    cy.get('.animate-spin', { timeout: 20000 }).should('not.exist');

    // Al abrir Modo Cancha, useCanchaSession dispara un Promise.all de 5 fetches
    // (roster, sesiones activas, agenda de hoy, plantillas, mapa de drills);
    // SET_PLANTILLAS solo se dispara cuando TODAS resuelven, no solo la de
    // plantillas — por eso se espera a las 5, no una sola (si no, PICK_LEVEL
    // puede leer hasPlantillas=false por la carrera y auto-omitir el paso).
    // Los intercepts se registran recién aquí (no antes de visit) para no
    // capturar la carga inicial del propio /dashboard (CoachHomePage también
    // pide 'atletas').
    cy.intercept('GET', '**/rest/v1/atletas*').as('getRoster');
    cy.intercept('GET', '**/rest/v1/sesiones_programadas*').as('getSesionesActivas');
    cy.intercept('GET', '**/rest/v1/sesiones_control*').as('getPlanificadasHoy');
    cy.intercept('GET', '**/rest/v1/catalogo_sesiones*').as('getPlantillas');
    cy.intercept('GET', '**/rest/v1/ejercicios_catalogo*').as('getEjerciciosMap');

    cy.get('[aria-label="Abrir Modo Cancha"]', { timeout: 20000 }).click({ force: true });
    // main.jsx monta en <StrictMode>: en dev, el useEffect del Promise.all se
    // dispara DOS veces (monta→limpia→remonta); la 1ª ronda queda descartada por
    // el guard `alive` y nunca dispara SET_PLANTILLAS. Esperar solo 1 ocurrencia
    // de cada alias consumía esa ronda inútil y dejaba el test corriendo antes de
    // que la ronda real (la 2ª) resolviera. Se esperan 2 de cada.
    cy.wait([
      '@getRoster', '@getRoster',
      '@getSesionesActivas', '@getSesionesActivas',
      '@getPlanificadasHoy', '@getPlanificadasHoy',
      '@getPlantillas', '@getPlantillas',
      '@getEjerciciosMap', '@getEjerciciosMap',
    ], { timeout: 20000 });
    // cy.wait() de red resuelve en cuanto el navegador VE la respuesta, no cuando
    // React termina de procesar el .then() del Promise.all (parseo + 2 dispatches
    // + render) que recién ahí deja state.hasPlantillas listo. Buffer corto y
    // explícito para esa brecha framework, confirmada real: verificado a mano
    // (fuera de Cypress) que el paso Objetivo SÍ aparece siempre correctamente.
    cy.wait(400);

    cy.get('[aria-label="GRUPAL NIVELES"]', { timeout: 15000 }).click({ force: true });
    cy.get('[aria-label^="Bloque Desarrollo"]', { timeout: 15000 }).click({ force: true });

    // Paso 2 · Objetivo de la sesión (solo existe con plantillas visibles).
    cy.contains(/Objetivo de la sesión/i, { timeout: 15000 }).should('be.visible');
    cy.contains('[QA] Físico - Fuerza').should('be.visible');
    cy.contains('button', /CONTINUAR SIN PLANTILLA/i).should('be.visible');

    // Elegir la plantilla [QA] → su preview de drills + el footer pasa a CONTINUAR.
    cy.get('[aria-label^="Elegir plantilla [QA] Físico - Fuerza"]').click({ force: true });
    cy.then(() => {
      cy.contains(plantillas[0].drills[0]).should('be.visible');
    });
    cy.contains('button', /^CONTINUAR$/i).click({ force: true });

    // Paso lista → presente el atleta QA → iniciar.
    cy.contains('PRESENTES', { timeout: 15000 }).should('be.visible');
    cy.contains(/QA Atleta Demo/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label="Presente"]').first().click({ force: true });
    cy.contains('button', /INICIAR SESIÓN/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });

    cy.wait('@insSesion').its('response.statusCode').should('be.oneOf', [200, 201]);
    cy.wait('@insAsistencia').its('response.statusCode').should('be.oneOf', [200, 201]);

    // Sesión activa con PLAN DE SESIÓN (drills de la plantilla elegida).
    cy.contains(/SESIÓN EN FOCO/i, { timeout: 15000 }).should('be.visible');
    cy.contains(/PLAN DE SESIÓN/i).should('be.visible');
    cy.then(() => {
      cy.contains(plantillas[0].drills[0]).should('be.visible');
    });

    // Cerrar la sesión — imprescindible para no dejar una [EN_CURSO] colgada.
    cy.contains('button', /TERMINAR Y EVALUAR/i).click({ force: true });
    cy.contains(/DESTACADOS DE HOY/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label^="Marcar como destacado"]', { timeout: 15000 }).first().click({ force: true });
    cy.contains('button', /FINALIZAR/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });
    cy.contains(/CLASE FINALIZADA/i, { timeout: 15000 }).should('be.visible');
  });

  it('Modo Cancha — "Continuar sin plantilla" arranca la sesión sin PLAN DE SESIÓN', () => {
    cy.task('sembrarPlantillasCanchaQA');

    cy.viewport(412, 860);
    cy.intercept('POST', '**/rest/v1/sesiones_programadas*').as('insSesion');
    cy.intercept('POST', '**/rest/v1/asistencia*').as('insAsistencia');

    login(QA.coach);
    cy.visit('/dashboard');
    cy.get('.animate-spin', { timeout: 20000 }).should('not.exist');

    // Ver el comentario del it anterior: hay que esperar los 5 fetches del
    // Promise.all de useCanchaSession, no solo el de plantillas.
    cy.intercept('GET', '**/rest/v1/atletas*').as('getRoster');
    cy.intercept('GET', '**/rest/v1/sesiones_programadas*').as('getSesionesActivas');
    cy.intercept('GET', '**/rest/v1/sesiones_control*').as('getPlanificadasHoy');
    cy.intercept('GET', '**/rest/v1/catalogo_sesiones*').as('getPlantillas');
    cy.intercept('GET', '**/rest/v1/ejercicios_catalogo*').as('getEjerciciosMap');

    cy.get('[aria-label="Abrir Modo Cancha"]', { timeout: 20000 }).click({ force: true });
    // main.jsx monta en <StrictMode>: en dev, el useEffect del Promise.all se
    // dispara DOS veces (monta→limpia→remonta); la 1ª ronda queda descartada por
    // el guard `alive` y nunca dispara SET_PLANTILLAS. Esperar solo 1 ocurrencia
    // de cada alias consumía esa ronda inútil y dejaba el test corriendo antes de
    // que la ronda real (la 2ª) resolviera. Se esperan 2 de cada.
    cy.wait([
      '@getRoster', '@getRoster',
      '@getSesionesActivas', '@getSesionesActivas',
      '@getPlanificadasHoy', '@getPlanificadasHoy',
      '@getPlantillas', '@getPlantillas',
      '@getEjerciciosMap', '@getEjerciciosMap',
    ], { timeout: 20000 });
    // cy.wait() de red resuelve en cuanto el navegador VE la respuesta, no cuando
    // React termina de procesar el .then() del Promise.all (parseo + 2 dispatches
    // + render) que recién ahí deja state.hasPlantillas listo. Buffer corto y
    // explícito para esa brecha framework, confirmada real: verificado a mano
    // (fuera de Cypress) que el paso Objetivo SÍ aparece siempre correctamente.
    cy.wait(400);

    cy.get('[aria-label="GRUPAL NIVELES"]', { timeout: 15000 }).click({ force: true });
    cy.get('[aria-label^="Bloque Desarrollo"]', { timeout: 15000 }).click({ force: true });

    // Objetivo → seguir SIN elegir plantilla.
    cy.contains(/Objetivo de la sesión/i, { timeout: 15000 }).should('be.visible');
    cy.contains('button', /CONTINUAR SIN PLANTILLA/i).click({ force: true });

    // Pasar lista → presente → iniciar.
    cy.contains('PRESENTES', { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label="Presente"]').first().click({ force: true });
    cy.contains('button', /INICIAR SESIÓN/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });
    cy.wait('@insSesion').its('response.statusCode').should('be.oneOf', [200, 201]);
    cy.wait('@insAsistencia').its('response.statusCode').should('be.oneOf', [200, 201]);

    // Sesión activa: SIN plantilla → no hay panel PLAN DE SESIÓN.
    cy.contains(/SESIÓN EN FOCO/i, { timeout: 15000 }).should('be.visible');
    cy.contains(/PLAN DE SESIÓN/i).should('not.exist');

    // Cerrar la sesión.
    cy.contains('button', /TERMINAR Y EVALUAR/i).click({ force: true });
    cy.contains(/DESTACADOS DE HOY/i, { timeout: 15000 }).should('be.visible');
    cy.get('[aria-label^="Marcar como destacado"]', { timeout: 15000 }).first().click({ force: true });
    cy.contains('button', /FINALIZAR/i, { timeout: 10000 }).should('not.be.disabled').click({ force: true });
    cy.contains(/CLASE FINALIZADA/i, { timeout: 15000 }).should('be.visible');
  });
});
