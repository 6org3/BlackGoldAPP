// Rebote por rol no autorizado: al entrar a una ruta que su rol no admite,
// PrivateRoute (src/main.jsx) manda al home nativo del rol vía rutaHomeParaRol()
// —la misma fuente que la raíz, el Sidebar y el login—, no al shell legacy.
//
// Existe porque esa rama del router no tenía ninguna cobertura: revertirla al
// código anterior (`if (user.rol === 'padre') ... return <Navigate to="/dashboard" />`)
// dejaba toda la suite en verde. Los casos de atleta y coach de aquí son los que
// fijan el destino nuevo: verificados por mutación, con el código viejo fallan.
//
// El `replace` del <Navigate> no se asierta: al volver atrás se entra otra vez a
// la ruta prohibida y el rebote se dispara de nuevo, así que la URL final es la
// misma con replace que sin él. Una aserción sobre el botón atrás pasaría en los
// dos casos — no probaría nada.
describe('Rebote por rol no autorizado', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  before(function () {
    if (!ROLES_CONFIG) {
      throw new Error(
        'Falta cypress.env.json con credenciales de prueba. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta real por rol.'
      );
    }
  });

  const login = (creds) => {
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
  };

  // rutaProhibida: ruta cuyo PrivateRoute no admite ese rol (src/main.jsx).
  // home: donde rutaHomeParaRol() dice que debe aterrizar (src/lib/featureFlags.js).
  const CASOS = [
    // Flag del home nativo activo: el rol vuelve a su portal Arcade. Antes caían
    // en /dashboard, así que estos dos son los que detectan una regresión.
    { key: 'atleta', name: 'Atleta', rutaProhibida: '/coach', home: '/atleta' },
    { key: 'coach', name: 'Coach', rutaProhibida: '/sistema', home: '/coach' },
    // Flag apagado (padre): se queda en su portal de siempre. El destino coincide
    // con el del código viejo — documenta la promesa del comentario de main.jsx
    // ("padre se queda en /padre"), pero no discrimina.
    { key: 'padre', name: 'Padre', rutaProhibida: '/coach', home: '/padre' },
  ];

  CASOS.forEach((caso) => {
    it(`${caso.name}: ${caso.rutaProhibida} rebota a ${caso.home}`, () => {
      login(ROLES_CONFIG[caso.key]);

      cy.visit(caso.rutaProhibida);
      cy.url({ timeout: 15000 }).should('include', caso.home);
    });
  });
});
