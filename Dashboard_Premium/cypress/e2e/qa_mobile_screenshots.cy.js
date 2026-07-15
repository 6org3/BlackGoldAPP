// Recorrido visual móvil (375x812): login + vistas clave de cada rol.
// Genera capturas en cypress/screenshots/qa_mobile_screenshots.cy.js/.
// Requiere cypress.env.json con SMOKE_TEST_USER y QA_ROLES (ver *.example).

const MOVIL = { width: 375, height: 812 };

const login = (creds) => {
  cy.clearAllLocalStorage();
  cy.clearAllCookies();
  cy.visit('/login');
  cy.get('input[type="text"]').first().type(creds.identificador);
  cy.get('input[type="password"]').first().type(creds.password);
  cy.get('form button[type="submit"]').click();
  cy.url({ timeout: 15000 }).should('not.include', '/login');
};

const esperarCarga = () => {
  // Deja que el Suspense/PageLoader llegue a montarse antes de comprobar su
  // ausencia; si no, la aserción pasa sobre el DOM vacío previo al spinner.
  cy.wait(600);
  cy.get('.animate-spin', { timeout: 15000 }).should('not.exist');
};

const captura = (nombre) => {
  // Pequeña espera para que terminen las animaciones de framer-motion.
  cy.wait(700);
  cy.screenshot(nombre, { capture: 'viewport', overwrite: true });
};

describe('Recorrido visual móvil', () => {
  beforeEach(() => {
    cy.viewport(MOVIL.width, MOVIL.height);
  });

  it('01 - Login', () => {
    cy.clearAllLocalStorage();
    cy.visit('/login');
    captura('01-login');
  });

  it('02..09 - Vistas de coach/owner', () => {
    const CREDS = Cypress.env('SMOKE_TEST_USER');
    login(CREDS);
    // El login lleva al home nativo del rol (rutaHomeParaRol); estas capturas son
    // del shell legacy, así que se entra a /dashboard explícitamente.
    cy.visit('/dashboard');
    esperarCarga();
    captura('02-dashboard-tripulacion');

    // Drawer de navegación
    cy.get('button[aria-label="Abrir menú"], header button.md\\:hidden').first().click();
    captura('03-drawer-navegacion');
    cy.get('button[aria-label="Cerrar menú"]').click({ force: true });

    // Modo Cancha (modal). El texto "Modo Cancha" también existe en el botón
    // del Sidebar (invisible con el drawer cerrado), así que se asierta por el
    // contenido único del paso 1 del modal.
    cy.get('button[aria-label="Abrir Modo Cancha"]').click({ force: true });
    cy.contains(/qué tipo de clase/i, { timeout: 15000 }).should('be.visible');
    captura('04-modo-cancha');
    // No hace falta cerrarlo: la siguiente visita recarga la app.

    const paginas = [
      ['/admin/atletas', '05-admin-atletas'],
      ['/admin/pagos', '06-admin-pagos'],
      ['/admin/asistencia', '07-admin-asistencia'],
      ['/admin/misiones', '08-admin-misiones'],
      ['/admin/sesiones', '09-admin-sesiones'],
      ['/admin/kpis', '10-kpis-club'],
    ];
    paginas.forEach(([ruta, nombre]) => {
      cy.visit(ruta);
      esperarCarga();
      captura(nombre);
    });
  });

  it('11 - Vista del atleta', () => {
    const CREDS = Cypress.env('QA_ROLES').atleta;
    login(CREDS);
    // El login lleva al portal Arcade (/atleta); esta captura retrata el shell
    // legacy (y su check-in diario, que el portal Arcade no monta), así que se
    // entra a /dashboard explícitamente.
    cy.visit('/dashboard');
    esperarCarga();
    captura('11-atleta-panel');
    // Si el modal de readiness diario está abierto, capturarlo y cerrarlo.
    cy.get('body').then(($body) => {
      const cerrar = $body.find('button[aria-label*="errar"], button:contains("Ahora no")');
      if (cerrar.length) {
        captura('11b-atleta-readiness');
        cy.wrap(cerrar.first()).click({ force: true });
        captura('11c-atleta-panel-sin-modal');
      }
    });
  });

  it('12 - Vista del padre', () => {
    const CREDS = Cypress.env('QA_ROLES').padre;
    login(CREDS);
    cy.url({ timeout: 15000 }).should('include', '/padre');
    esperarCarga();
    captura('12-padre-dashboard');
  });
});
