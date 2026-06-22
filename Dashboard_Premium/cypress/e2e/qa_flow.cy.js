describe('Black Gold QA Flow', () => {
  const CEDULA_TEST = '1234567890'; // Cédula de Coach o admin

  it('Navega por el flujo completo: Login -> Dashboard -> Cancha -> KPIs', () => {
    // 1. LOGIN
    cy.visit('http://localhost:5173/login');
    cy.get('input').first().type(CEDULA_TEST);
    cy.get('button').contains(/entrar/i).click();

    // 2. DASHBOARD
    cy.url({ timeout: 10000 }).should('include', '/dashboard');
    cy.contains(/dashboard premium/i, { timeout: 10000 }).should('be.visible');
    
    // Verificamos que carguen los datos
    cy.get('.animate-spin').should('not.exist');
    
    // 3. MODO CANCHA
    cy.get('a[href="/cancha"], nav button').contains(/cancha/i).click({ force: true });
    cy.url().should('include', '/cancha');
    cy.contains(/modo cancha/i, { timeout: 10000 }).should('be.visible');

    // 4. KPIs DEL CLUB
    cy.get('a[href="/admin/kpis"], nav button').contains(/kpi/i).click({ force: true });
    cy.url().should('include', '/kpis');
    cy.contains(/kpi/i, { timeout: 10000 }).should('be.visible');
    
    cy.log('Flujo de QA completado exitosamente.');
  });
});
