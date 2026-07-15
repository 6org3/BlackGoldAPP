// El dueño llega a sus módulos /admin/* desde el HUD de /club — y vuelve.
//
// /club (VistaDuenoArcade) es el único home de staff que NO monta HomeShell, así
// que no hereda el Sidebar con la nav completa; su bottom-nav son tabs internas
// del HUD, no rutas. Desde que el login manda al owner siempre a /club (#84), el
// rol se quedó sin camino visible a Pagos, Comunicaciones, Eventos, Sesiones,
// KPIs y Comparar. Estas pruebas fijan las dos puertas que lo resuelven:
// la Consola de gestión del header (acceso completo) y los atajos contextuales
// de cada panel (SalidaAdmin), más la vuelta al home correcto.
describe('Dueño · acceso a /admin desde el HUD', () => {
  const OWNER = Cypress.env('SMOKE_TEST_USER');

  before(function () {
    if (!OWNER) {
      throw new Error(
        'Falta cypress.env.json con SMOKE_TEST_USER. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta owner real.'
      );
    }
  });

  beforeEach(() => {
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(OWNER.identificador);
    cy.get('input[type="password"]').first().type(OWNER.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('include', '/club');
  });

  it('la consola del header lista los 10 módulos y navega a cada uno', () => {
    cy.get('button[aria-label="Consola de gestión"]').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      // Los 10 destinos de PrivateRoute: si se añade una ruta admin y no entra
      // aquí, vuelve a quedar sin puerta desde /club.
      ['ATLETAS', 'MISIONES', 'PAGOS', 'KPIS', 'SESIONES', 'ASISTENCIA',
        'EVENTOS', 'COMPARAR', 'EQUIPO', 'COMUNICACIONES'].forEach((t) => {
        cy.contains('button', t).should('be.visible');
      });
    });

    // La navegación real, no solo el pintado del tile.
    cy.get('[role="dialog"]').contains('button', 'PAGOS').click();
    cy.url({ timeout: 15000 }).should('include', '/admin/pagos');
    cy.get('[role="dialog"]').should('not.exist'); // la consola se cierra al salir
  });

  it('el volver de un módulo admin devuelve al HUD del dueño, no al shell legacy', () => {
    cy.get('button[aria-label="Consola de gestión"]').click();
    cy.get('[role="dialog"]').contains('button', 'EQUIPO').click();
    cy.url({ timeout: 15000 }).should('include', '/admin/equipo');

    // Antes apuntaba fijo a /dashboard: dejaba al dueño en el shell legacy,
    // que no es de donde venía.
    cy.get('button[aria-label="Volver al inicio"]').first().click();
    cy.url({ timeout: 15000 }).should('include', '/club');
    cy.url().should('not.include', '/dashboard');
  });

  it('el atajo de Finanzas lleva al control de pagos', () => {
    // Por el hex central de la bottom-nav, vía aria-label: su etiqueta visible es
    // un <span> hermano del <button>, no un hijo, así que contains('button',…)
    // no lo alcanza — engancharía la alerta 'FINANZAS ►' del Resumen, que solo
    // aparece si ese día hay pagos vencidos.
    cy.get('nav button[aria-label="FINANZAS"]').click();
    cy.contains('button', 'CONTROL DE PAGOS').scrollIntoView().click();
    cy.url({ timeout: 15000 }).should('include', '/admin/pagos');
  });

  it('los paneles con módulo equivalente ofrecen su salida', () => {
    cy.get('nav button[aria-label="FINANZAS"]').click();
    cy.contains('button', 'CONTROL DE PAGOS').should('exist');

    cy.contains('nav button', 'ASISTENCIA').click();
    cy.contains('button', 'PASAR ASISTENCIA').should('exist');

    cy.contains('nav button', 'RETENCIÓN').click();
    cy.contains('button', 'ABRIR COMUNICACIONES').should('exist');

    cy.contains('nav button', 'EQUIPO').click();
    cy.contains('button', 'GESTIONAR EQUIPO').should('exist');
  });
});
