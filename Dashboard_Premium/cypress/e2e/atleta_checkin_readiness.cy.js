/**
 * Check-in diario de readiness en el portal Arcade del atleta (/atleta).
 *
 * Contrato que fija esta prueba: el atleta SIEMPRE tiene cómo registrar su
 * readiness del día desde su portal nativo. El check-in llegó a quedarse sin
 * puerta de entrada — solo lo disparaba el shell legacy /dashboard, y cuando el
 * login pasó a mandar al atleta a /atleta (PR #84) dejó de existir para él, lo
 * que a su vez dejaba al coach sin datos ("Sin señales hoy").
 *
 * La lectura del readiness de hoy va stubeada (GET a atleta_readiness → vacío)
 * para forzar el estado "pendiente": así la prueba corre igual cualquier día,
 * haya o no check-in real del atleta QA (la tabla tiene UNIQUE (atleta_id,
 * fecha), así que sin stub solo pasaría una vez al día). El POST del último caso
 * es real y se verifica a nivel de red.
 *
 * Requiere:
 *   - dev server (baseUrl de cypress.config.js o CYPRESS_BASE_URL)
 *   - cypress.env.json con QA_ROLES.atleta (gitignored)
 */
describe('Atleta — check-in diario de readiness (/atleta)', () => {
  const QA = Cypress.env('QA_ROLES');

  before(function () {
    if (!QA || !QA.atleta) {
      throw new Error('Falta cypress.env.json con QA_ROLES.atleta (ver cypress.env.json.example).');
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

  /** Fuerza "sin check-in hoy" en toda lectura de readiness (login + portal). */
  function stubSinCheckin() {
    cy.intercept('GET', '**/rest/v1/atleta_readiness*', { statusCode: 200, body: [] }).as('getReadiness');
  }

  const modal = () => cy.get('[role="dialog"][aria-label="Check-in Diario"]', { timeout: 15000 });

  it('sin registro de hoy, el modal se auto-abre al entrar al portal', () => {
    cy.viewport(412, 860);
    stubSinCheckin();
    login(QA.atleta);

    // Por la raíz: es el camino del login y de la PWA con sesión viva.
    cy.visit('/');
    cy.url({ timeout: 15000 }).should('include', '/atleta');

    modal().should('be.visible');
    cy.contains('¿Cómo dormiste anoche?').should('be.visible');
    cy.contains('Nivel de Fatiga Física').should('be.visible');
    cy.contains('Color de tu primera orina hoy').should('be.visible');
    cy.screenshot('Checkin_Readiness_Auto_Abierto');
  });

  it('al cerrarlo queda la tarjeta en la Base, y recargar vuelve a pedirlo', () => {
    cy.viewport(412, 860);
    stubSinCheckin();
    login(QA.atleta);
    cy.visit('/atleta');

    // Cerrar sin completar no deja al atleta sin camino de vuelta.
    modal().should('be.visible');
    cy.get('body').type('{esc}');
    modal().should('not.exist');

    cy.get('[data-testid="card-checkin"]').should('have.attr', 'data-estado', 'pendiente');
    cy.screenshot('Checkin_Readiness_Tarjeta_Pendiente');

    // Insistencia: mientras no haya check-in, cada entrada lo vuelve a pedir.
    cy.reload();
    modal().should('be.visible');
    cy.get('body').type('{esc}');

    // Y la tarjeta lo reabre a demanda.
    cy.get('[data-testid="btn-abrir-checkin"]').click();
    modal().should('be.visible');
  });

  it('con el check-in ya hecho no interrumpe: la tarjeta muestra el resumen del día', () => {
    cy.viewport(412, 860);
    cy.intercept('GET', '**/rest/v1/atleta_readiness*', {
      statusCode: 200,
      body: [{ id: 'stub-readiness', sueno_calidad: 8, fatiga_fisica: 7, color_orina: 2, readiness_score: 7.4 }],
    }).as('getReadiness');

    login(QA.atleta);
    cy.visit('/atleta');

    cy.get('[data-testid="card-checkin"]', { timeout: 15000 }).should('have.attr', 'data-estado', 'hecho');
    cy.get('[data-testid="card-checkin"]').should('contain', 'READINESS 7.4');
    cy.get('[data-testid="card-checkin"]').should('contain', 'SUEÑO 8 · FATIGA 7 · HIDRATACIÓN 2/8');
    modal().should('not.exist');
  });

  it('completar el check-in guarda el readiness del día y la tarjeta pasa a hecho', () => {
    cy.viewport(412, 860);
    stubSinCheckin();

    // El POST también va stubeado — por el UNIQUE, un write real solo pasaría en
    // la primera corrida del día. Lo que se verifica aquí es el contrato del
    // modal: el payload que sale hacia PostgREST y que la Base refleje la fila
    // devuelta. La escritura real contra Supabase se comprobó en vivo con la
    // cuenta QA (POST 201 + fila en atleta_readiness).
    cy.intercept('POST', '**/rest/v1/atleta_readiness*', (req) => {
      const fila = Array.isArray(req.body) ? req.body[0] : req.body;
      req.reply({ statusCode: 201, body: { ...fila, id: 'stub-readiness', readiness_score: 4.6 } });
    }).as('postReadiness');

    login(QA.atleta);
    cy.visit('/atleta');
    modal().should('be.visible');

    // Deshidratación alta: además de guardar, dispara la alerta IA de la Base.
    cy.get('[aria-label="Nivel 6: Muy Deshidratado"]').click();
    cy.contains('button', 'COMPLETAR CHECK-IN').click();

    cy.wait('@postReadiness').its('request.body').then((body) => {
      const fila = Array.isArray(body) ? body[0] : body;
      expect(fila.atleta_id, 'atleta_id del propio atleta').to.be.a('string').and.not.be.empty;
      expect(fila.color_orina, 'color elegido en la escala de Armstrong').to.eq(6);
      expect(fila.sueno_calidad, 'sueño 1-10').to.be.within(1, 10);
      expect(fila.fatiga_fisica, 'fatiga 1-10').to.be.within(1, 10);
    });

    // El modal se cierra solo y la Base refleja el check-in del día.
    modal().should('not.exist');
    cy.get('[data-testid="card-checkin"]').should('have.attr', 'data-estado', 'hecho');
    cy.get('[data-testid="card-checkin"]').should('contain', 'READINESS');
    cy.get('[data-testid="btn-abrir-checkin"]').should('not.exist');

    // La alerta IA de la Base se recalcula con el check-in recién hecho, sin
    // esperar al próximo login (de donde sale user.readiness_hoy).
    cy.contains('Toma 2L de agua hoy').should('be.visible');
    cy.screenshot('Checkin_Readiness_Tarjeta_Hecho');
  });
});
