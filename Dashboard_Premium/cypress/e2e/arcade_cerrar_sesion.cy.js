// Salida de sesión de los portales Arcade HUD.
//
// Al converger a Arcade HUD, los portales nativos de atleta y padre quedaron sin
// ninguna forma de cerrar sesión: el botón vivía en el shell legacy AthleteLayout
// (/dashboard) y no se portó. Estas pruebas fijan el contrato: desde el home del
// rol, el avatar abre el menú de perfil y el menú cierra la sesión.
//
// El portal del dueño (/club) comparte el mismo menú, pero cypress.env.json no
// trae credenciales owner/superadmin, así que aquí no se cubre.
describe('Arcade HUD - cerrar sesión', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  const ROLES = [
    { key: 'atleta', name: 'Atleta', home: '/atleta' },
    { key: 'padre', name: 'Padre', home: '/padre' },
  ];

  before(function () {
    if (!ROLES_CONFIG) {
      throw new Error(
        'Falta cypress.env.json con credenciales de prueba. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta real por rol.'
      );
    }
  });

  ROLES.forEach((rol) => {
    it(`${rol.name}: el avatar del HUD abre el menú de perfil y cierra la sesión`, () => {
      const creds = ROLES_CONFIG[rol.key];

      cy.visit('/login');
      cy.clearLocalStorage();
      cy.clearCookies();

      cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
      cy.get('input[type="password"]').first().type(creds.password);
      cy.get('form button[type="submit"]').click();
      cy.url({ timeout: 15000 }).should('not.include', '/login');

      // Se entra por la raíz además del formulario: es el camino de la PWA
      // instalada / la sesión viva, y el que dejaba al portal sin salida. Desde
      // que Login.jsx también resuelve el destino con rutaHomeParaRol, ambos
      // caminos llegan al mismo home Arcade — esta visita lo fija.
      cy.visit('/');
      cy.url({ timeout: 15000 }).should('include', rol.home);

      // El menú está cerrado hasta tocar el avatar: la acción destructiva no
      // cuelga de un toque accidental en el hero.
      cy.get('[data-testid="btn-logout"]').should('not.exist');

      cy.get('[aria-label="Menú de perfil"]', { timeout: 15000 })
        .should('have.attr', 'aria-expanded', 'false')
        .click();

      cy.get('[role="menu"]').should('be.visible');
      cy.screenshot(`Menu_Perfil_${rol.name}`);
      cy.get('[data-testid="btn-logout"]').click();

      cy.url({ timeout: 10000 }).should('include', '/login');

      // La sesión queda realmente cerrada: volver al home del rol rebota al login.
      cy.visit(rol.home);
      cy.url({ timeout: 10000 }).should('include', '/login');
    });
  });

  // Paridad con el shell legacy: el menú del atleta también edita el perfil.
  it('Atleta: el menú de perfil abre el modal de editar perfil', () => {
    const creds = ROLES_CONFIG.atleta;

    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();

    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');

    cy.visit('/');
    cy.url({ timeout: 15000 }).should('include', '/atleta');

    cy.get('[aria-label="Menú de perfil"]', { timeout: 15000 }).click();
    cy.contains('button', 'EDITAR PERFIL').click();

    cy.contains(/editar perfil/i, { timeout: 10000 }).should('be.visible');
    // El modal precarga los datos de la sesión, no un formulario vacío.
    cy.get('input').filter(':visible').first().should('not.have.value', '');
    // Y el menú se cierra al abrirlo: no quedan dos capas encimadas.
    cy.get('[role="menu"]').should('not.exist');
  });

  // El portal del dueño monta el mismo menú en el hex "BG" de su cabecera. Solo
  // corre si SMOKE_TEST_USER tiene rol owner/superadmin; con cualquier otro rol
  // PrivateRoute rebota a /dashboard y la prueba se salta.
  it('Dueño: el avatar del HUD cierra la sesión en /club', function () {
    const creds = Cypress.env('SMOKE_TEST_USER');
    if (!creds) this.skip();

    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();

    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');

    cy.visit('/club');
    cy.url({ timeout: 15000 }).then((url) => {
      if (!url.includes('/club')) {
        cy.log('SMOKE_TEST_USER no es owner/superadmin — se omite el portal del dueño');
        this.skip();
      }
    });

    cy.get('[aria-label="Menú de perfil"]', { timeout: 15000 }).click();
    cy.get('[role="menu"]').should('be.visible');
    cy.screenshot('Menu_Perfil_Dueno');
    cy.get('[data-testid="btn-logout"]').click();
    cy.url({ timeout: 10000 }).should('include', '/login');
  });
});
