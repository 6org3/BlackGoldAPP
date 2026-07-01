describe('QA Flow - 3 Roles', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  const ROLES = [
    { key: 'coach', name: 'Coach', expectedUrl: '/dashboard', dashboardText: 'Dashboard Premium' },
    { key: 'atleta', name: 'Atleta', expectedUrl: '/dashboard', dashboardText: 'Nivel de Desarrollo' },
    { key: 'padre', name: 'Padre', expectedUrl: '/padre', dashboardText: 'Centro de Control' },
  ];

  before(function () {
    if (!ROLES_CONFIG) {
      throw new Error(
        'Falta cypress.env.json con credenciales de prueba. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta real por rol. No se versionan ' +
        'credenciales reales en este spec por seguridad (ver Fase 0 del plan de remediación).'
      );
    }
  });

  ROLES.forEach(rol => {
    it(`Prueba el flujo de acceso para el rol: ${rol.name}`, () => {
      const creds = ROLES_CONFIG[rol.key];

      cy.visit('/login');
      cy.clearLocalStorage();
      cy.clearCookies();

      cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
      cy.get('input[type="password"]').first().type(creds.password);
      // Selector robusto: el texto del botón ("Desbloquear Poneglyph") es de marca y
      // puede cambiar; el atributo type="submit" dentro del único <form> no.
      cy.get('form button[type="submit"]').click();

      cy.url({ timeout: 15000 }).should('include', rol.expectedUrl);
      cy.contains(new RegExp(rol.dashboardText, 'i'), { timeout: 15000 }).should('be.visible');

      // Tomamos screenshot como evidencia de que cargó correctamente
      cy.screenshot(`Acceso_Exitoso_${rol.name}`);

      // Cerrar sesión. El texto del botón difiere por rol ("Cerrar sesión" sin texto
      // visible en coach, "Cerrar Sesión" en atleta, "Desconectar" en padre), así que
      // se usa data-testid="btn-logout" (presente en los 3 layouts) en vez de texto.
      cy.get('[data-testid="btn-logout"]').click({ force: true });
      cy.url({ timeout: 10000 }).should('include', '/login');
    });
  });
});
