// Membresía de un atleta (v38): qué grupo cubre su cuota y qué extras se le
// cobran aparte.
//
// La regla que se verifica: la cuota cubre UN grupo principal (la básica) y
// cualquier extra suma al total. El importe tiene que estar a la vista, porque
// activar un add-on sube la factura de una familia.
describe('Membresía del atleta — básica y add-ons', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  before(function () {
    if (!ROLES_CONFIG) throw new Error('Falta cypress.env.json con credenciales de prueba.');
  });

  beforeEach(() => {
    const creds = ROLES_CONFIG.coach;
    cy.viewport(1440, 950);
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
    cy.visit('/admin/atletas');
    // La lista solo se puebla con un filtro activo (no se baja el roster entero).
    cy.get('input[type="search"]', { timeout: 15000 }).type('QA Atleta Demo');
    cy.get('button[title^="Membresía"]', { timeout: 15000 }).first().click();
    cy.contains('Membresía', { timeout: 15000 }).should('be.visible');
  });

  it('muestra el grupo básico, los extras y el total al mes', () => {
    cy.contains('Grupo básico').should('be.visible');
    cy.contains('lo cubre la cuota').should('be.visible');
    cy.contains('se cobran aparte').should('be.visible');
    cy.contains('Total al mes').should('be.visible');
  });

  it('asignar la básica fija la cuota, y un extra la suma', () => {
    // 1) Asignar el principal Micro ($25) como básica.
    cy.get('button[aria-label="Grupo básico Micro"]', { timeout: 15000 }).click();
    cy.get('button[aria-label="Grupo básico Micro"]', { timeout: 15000 }).should('have.attr', 'aria-pressed', 'true');
    cy.contains('Cuota $25.00').should('be.visible');

    // 2) Encender un extra: el total sube, no lo sustituye.
    cy.get('input[aria-label="Grupo extra QADC Tarde"]').check();
    cy.contains('extras $25.00', { timeout: 15000 }).should('be.visible');
    // $25 de cuota + $25 del extra.
    cy.contains('$50.00').should('be.visible');

    // 3) Apagarlo: vuelve a la cuota sola.
    cy.get('input[aria-label="Grupo extra QADC Tarde"]').uncheck();
    cy.contains('Cuota $25.00', { timeout: 15000 }).should('be.visible');
    cy.contains('extras').should('not.exist');
  });

  it('un grupo extra no puede ser la básica', () => {
    // Los extras solo aparecen como checkbox, nunca como opción de básica: la
    // RPC lo rechazaría, pero la UI ni siquiera lo ofrece.
    cy.get('button[aria-label="Grupo básico QADC Tarde"]').should('not.exist');
    cy.get('input[aria-label="Grupo extra QADC Tarde"]').should('exist');
  });
});
