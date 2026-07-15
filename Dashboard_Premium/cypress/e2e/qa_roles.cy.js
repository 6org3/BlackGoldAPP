describe('QA Flow - 3 Roles', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  // dashboardText: texto REAL y estable de cada layout (verificado contra la UI
  // actual — los textos anteriores 'Dashboard Premium'/'Nivel de Desarrollo'/
  // 'Centro de Control' no existían en ningún componente y hacían fallar la suite).
  // El de Padre se elige de la cabecera de VistaPadreArcade, que se pinta antes
  // que los datos del hijo: los rótulos de las secciones ('PRÓXIMO EVENTO',
  // 'PAGOS · MENSUALIDAD') solo aparecen una vez cargado el detalle.
  const ROLES = [
    { key: 'coach', name: 'Coach', expectedUrl: '/dashboard', dashboardText: 'Tripulación' },
    { key: 'atleta', name: 'Atleta', expectedUrl: '/dashboard', dashboardText: 'Radar de Pilares' },
    { key: 'padre', name: 'Padre', expectedUrl: '/padre', dashboardText: 'MI REPRESENTADO', logoutEnMenuPerfil: true },
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

      // Cerrar sesión. El texto del botón difiere por rol, así que se usa
      // data-testid="btn-logout" en vez de texto. En coach y atleta el botón está
      // en el propio shell; en padre vive dentro del menú de perfil de Arcade HUD
      // (ArcadePerfilMenu), que solo monta su panel al abrirlo — de ahí el click
      // previo en el avatar.
      if (rol.logoutEnMenuPerfil) cy.get('[data-testid="btn-perfil"]').click();
      cy.get('[data-testid="btn-logout"]').click({ force: true });
      cy.url({ timeout: 10000 }).should('include', '/login');
    });
  });
});
