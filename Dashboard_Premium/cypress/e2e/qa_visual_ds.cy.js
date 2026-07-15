// Pasada visual del Black Gold Design System: los 4 roles (owner, coach,
// atleta, padre) tras la migración a tokens (fases 1-4). Captura las vistas
// clave en móvil (375x812) y las más ricas también en desktop (1280x800).
// Genera capturas en cypress/screenshots/qa_visual_ds.cy.js/.
// Requiere cypress.env.json con SMOKE_TEST_USER y QA_ROLES.

const MOVIL = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

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
  cy.wait(600);
  cy.get('.animate-spin', { timeout: 15000 }).should('not.exist');
};

const captura = (nombre) => {
  cy.wait(700); // animaciones framer-motion
  cy.screenshot(nombre, { capture: 'viewport', overwrite: true });
};

const cerrarReadinessSiAparece = () => {
  // El check-in diario aparece con retraso tras cargar datos del atleta
  // (también reaparece tras un reload). Damos margen antes de buscarlo.
  cy.wait(1200);
  cy.get('body').then(($body) => {
    const cerrar = $body.find('button[aria-label="Cerrar check-in"]');
    if (cerrar.length) cy.wrap(cerrar.first()).click({ force: true });
  });
};

describe('DS · Owner', () => {
  it('dashboard y KPIs del club (móvil + desktop)', () => {
    cy.viewport(MOVIL.width, MOVIL.height);
    login(Cypress.env('SMOKE_TEST_USER'));
    // El login lleva al home nativo del rol (rutaHomeParaRol); esta captura es del
    // shell legacy, así que se entra a /dashboard explícitamente.
    cy.visit('/dashboard');
    esperarCarga();
    captura('owner-01-dashboard-movil');

    cy.visit('/admin/kpis');
    esperarCarga();
    captura('owner-02-kpis-movil');

    cy.viewport(DESKTOP.width, DESKTOP.height);
    cy.visit('/admin/kpis');
    esperarCarga();
    captura('owner-03-kpis-desktop');
  });
});

describe('DS · Coach', () => {
  it('dashboard con tarjetas de atleta (móvil + desktop)', () => {
    cy.viewport(MOVIL.width, MOVIL.height);
    login(Cypress.env('QA_ROLES').coach);
    // El login lleva al home nativo del rol (/coach); estas capturas son del
    // shell legacy, así que se entra a /dashboard explícitamente.
    cy.visit('/dashboard');
    esperarCarga();
    captura('coach-01-dashboard-movil');

    cy.viewport(DESKTOP.width, DESKTOP.height);
    cy.visit('/dashboard');
    esperarCarga();
    captura('coach-02-dashboard-desktop');

    cy.visit('/admin/misiones');
    esperarCarga();
    captura('coach-03-misiones-desktop');
  });
});

describe('DS · Atleta', () => {
  // Navega a una tab del atleta (bottom nav en móvil, sidebar en desktop),
  // espera a que el header de la tab lo confirme, y captura ya asentado.
  const irATab = (label, nombre) => {
    cy.get('nav:visible').contains('button', label).click({ force: true });
    esperarCarga();
    // Header de la tab (h2) confirma el cambio antes de capturar.
    cy.contains('h2', new RegExp(label, 'i'), { timeout: 15000 }).should('be.visible');
    cy.wait(1000); // asienta la animación de entrada de framer-motion
    captura(nombre);
  };

  it('inicio, misiones y KPIs (móvil) + misiones desktop', () => {
    cy.viewport(MOVIL.width, MOVIL.height);
    login(Cypress.env('QA_ROLES').atleta);
    // El login lleva al portal Arcade (/atleta); esta pasada recorre las tabs del
    // shell legacy (Inicio/Misiones/KPIs), así que se entra a /dashboard.
    cy.visit('/dashboard');
    esperarCarga();
    cerrarReadinessSiAparece();
    // Espera a que el shell del atleta esté montado (bottom nav visible) y
    // deja asentar la animación de entrada antes de la primera captura.
    cy.get('nav:visible').contains('button', 'Inicio', { timeout: 15000 }).should('be.visible');
    cy.wait(1200);
    captura('atleta-01-inicio-movil');

    irATab('Misiones', 'atleta-02-misiones-movil');
    irATab('KPIs', 'atleta-03-kpis-movil');

    cy.viewport(DESKTOP.width, DESKTOP.height);
    cy.reload();
    esperarCarga();
    cerrarReadinessSiAparece();
    irATab('Misiones', 'atleta-04-misiones-desktop');
  });
});

describe('DS · Padre', () => {
  it('portal del padre (móvil + desktop)', () => {
    cy.viewport(MOVIL.width, MOVIL.height);
    login(Cypress.env('QA_ROLES').padre);
    cy.url({ timeout: 15000 }).should('include', '/padre');
    esperarCarga();
    captura('padre-01-dashboard-movil');

    cy.viewport(DESKTOP.width, DESKTOP.height);
    cy.reload();
    esperarCarga();
    captura('padre-02-dashboard-desktop');
  });
});
