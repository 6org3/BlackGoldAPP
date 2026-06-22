describe('QA Flow - 3 Roles', () => {
  const ROLES = [
    {
      name: 'Coach',
      identificador: 'coach@blackgold.com',
      password: 'coach123',
      expectedUrl: '/dashboard',
      dashboardText: 'Dashboard Premium'
    },
    {
      name: 'Atleta',
      identificador: '2150635882',
      password: '2150635882',
      expectedUrl: '/dashboard',
      dashboardText: 'Nivel de Desarrollo'
    },
    {
      name: 'Padre',
      identificador: '0982174698',
      password: '0982174698',
      expectedUrl: '/padre',
      dashboardText: 'Centro de Control'
    }
  ];

  ROLES.forEach(rol => {
    it(`Prueba el flujo de acceso para el rol: ${rol.name}`, () => {
      cy.visit('http://localhost:5173/login');
      cy.clearLocalStorage();
      cy.clearCookies();

      cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(rol.identificador);
      cy.get('input[type="password"]').first().type(rol.password);
      cy.get('button').contains(/poneglyph|entrar/i).click();

      cy.url({ timeout: 15000 }).should('include', rol.expectedUrl);
      cy.contains(new RegExp(rol.dashboardText, 'i'), { timeout: 15000 }).should('be.visible');
      
      // Tomamos screenshot como evidencia de que cargó correctamente
      cy.screenshot(`Acceso_Exitoso_${rol.name}`);
      
      // Cerrar sesión
      cy.get('button').contains(/salir|logout/i).click({force: true});
      cy.url({ timeout: 10000 }).should('include', '/login');
    });
  });
});
