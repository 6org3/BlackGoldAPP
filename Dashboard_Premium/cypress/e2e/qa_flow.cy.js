describe('Black Gold QA Flow', () => {
  const CREDS = Cypress.env('SMOKE_TEST_USER');

  before(function () {
    if (!CREDS) {
      throw new Error(
        'Falta cypress.env.json con SMOKE_TEST_USER (ver cypress.env.json.example): una cuenta ' +
        'de prueba con rol owner o superadmin (necesario para /admin/kpis).'
      );
    }
  });

  it('Navega por el flujo completo: Login -> Dashboard -> Modo Cancha -> KPIs', () => {
    // 1. LOGIN
    cy.visit('/login');
    cy.get('input[type="text"]').first().type(CREDS.identificador);
    cy.get('input[type="password"]').first().type(CREDS.password);
    cy.get('form button[type="submit"]').click();

    // 2. DASHBOARD
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
    // Texto real del header del dashboard (el anterior 'Dashboard Premium' no
    // existe en la UI — solo en el <title> del documento, que contains no ve).
    cy.contains(/tripulación/i, { timeout: 10000 }).should('be.visible');

    // Verificamos que carguen los datos
    cy.get('.animate-spin').should('not.exist');

    // 3. MODO CANCHA
    // Nota: "Modo Cancha" es un takeover (arcade/ModoCanchaArcade.jsx) que se abre sobre /dashboard,
    // NO una ruta propia — antes este spec esperaba (incorrectamente) que la URL cambiara
    // a "/cancha", algo que nunca existió en el router (ver src/main.jsx). Se verifica el
    // modal por su contenido, no por la URL.
    cy.get('nav button').contains(/cancha/i).click({ force: true });
    cy.contains(/modo cancha/i, { timeout: 10000 }).should('be.visible');

    // 4. KPIs DEL CLUB
    cy.get('a[href="/admin/kpis"], nav button').contains(/kpi/i).click({ force: true });
    cy.url().should('include', '/kpis');
    cy.contains(/kpi/i, { timeout: 10000 }).should('be.visible');

    cy.log('Flujo de QA completado exitosamente.');
  });
});
