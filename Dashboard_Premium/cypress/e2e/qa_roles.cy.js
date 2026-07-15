describe('QA Flow - 5 Roles', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  // expectedUrl: el destino del login sale de rutaHomeParaRol() (featureFlags.js),
  // la misma fuente que usan RootRedirect (main.jsx) y el ítem "Inicio" del
  // Sidebar. Con los homes Arcade activos, coach y atleta ya no aterrizan en el
  // shell legacy /dashboard: el formulario lleva al mismo portal que la raíz.
  //
  // dashboardText: texto hardcodeado y siempre presente del portal — no derivado
  // de datos (nombre, KPIs, próxima sesión), que una cuenta de prueba vacía haría
  // desaparecer, ni tapado por el estado de carga. Además debe ser EXCLUSIVO de
  // ese portal: 'Black Gold' aparecería igual en el shell legacy, así que no
  // detectaría un aterrizaje en /dashboard.
  //
  // logout: los portales Arcade (atleta, padre, dueño) montan la salida dentro del
  // menú de perfil del avatar, que no existe en el DOM hasta abrirlo; los homes
  // sobre HomeShell (coach, sistema) la tienen en el Sidebar (data-testid propio).
  const ROLES = [
    { key: 'superadmin', name: 'Superadmin', expectedUrl: '/sistema', dashboardText: 'Cerebro del club', logout: 'sidebar' },
    { key: 'owner', name: 'Owner', expectedUrl: '/club', dashboardText: 'RETENCIÓN', logout: 'menu' },
    { key: 'coach', name: 'Coach', expectedUrl: '/coach', dashboardText: 'Atletas a mirar hoy', logout: 'sidebar' },
    { key: 'atleta', name: 'Atleta', expectedUrl: '/atleta', dashboardText: 'Mi Base', logout: 'menu' },
    { key: 'padre', name: 'Padre', expectedUrl: '/padre', dashboardText: 'MI REPRESENTADO', logout: 'menu' },
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
    it(`Prueba el flujo de acceso para el rol: ${rol.name}`, function () {
      const creds = ROLES_CONFIG[rol.key];
      // Un cypress.env.json anterior a la cobertura de owner/superadmin no trae su
      // entrada. Se salta en vez de romper con un TypeError opaco: queda como
      // pending en el resumen, visible, no como un falso verde.
      if (!creds) {
        cy.log(`Sin credenciales para el rol ${rol.key} en QA_ROLES — prueba omitida (ver cypress.env.json.example)`);
        this.skip();
      }

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

      // Cerrar sesión.
      if (rol.logout === 'menu') {
        cy.get('[aria-label="Menú de perfil"]', { timeout: 15000 }).click();
        cy.get('[data-testid="btn-logout"]').click();
      } else {
        cy.get('[data-testid="btn-logout-sidebar"]').click({ force: true });
      }
      cy.url({ timeout: 10000 }).should('include', '/login');
    });
  });
});
