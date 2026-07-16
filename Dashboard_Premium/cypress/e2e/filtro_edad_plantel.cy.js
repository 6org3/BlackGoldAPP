// Filtro por rango de edad en el Plantel (convive con el de Categoría FEB).
//
// Lo que se verifica no es "salen N atletas" (depende del padrón sembrado, que
// cambia), sino el CONTRATO: que la UI traduzca el rango de edad a un filtro
// sobre `usuarios.fecha_nacimiento` en la query — que es justamente lo que hace
// al filtro inmune a la columna `categoria_feb` congelada.
describe('Plantel — filtro por rango de edad', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  before(function () {
    if (!ROLES_CONFIG) {
      throw new Error(
        'Falta cypress.env.json con credenciales de prueba. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta real por rol.'
      );
    }
  });

  beforeEach(() => {
    const creds = ROLES_CONFIG.coach;
    cy.viewport(1440, 900); // en lg+ el panel de filtros está siempre visible
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
  });

  it('traduce el rango de edad a un filtro sobre fecha_nacimiento', () => {
    cy.intercept('GET', '**/rest/v1/atletas*').as('atletas');

    cy.visit('/dashboard');
    cy.wait('@atletas', { timeout: 15000 });

    cy.get('#filtro-edad-min', { timeout: 15000 }).should('be.visible').type('10');
    cy.get('#filtro-edad-max').type('12');

    const hoy = new Date();
    const iso = (edad) => {
      const d = new Date(hoy.getFullYear() - edad, hoy.getMonth(), hoy.getDate());
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Los filtros no van debounced: `.type('10')` teclea dígito a dígito y
    // dispara una query intermedia con edad=1. Por eso se afirma sobre el
    // conjunto de llamadas con `.should()` (que Cypress reintenta) buscando la
    // que lleva el rango completo, en vez de sobre "la última" en un instante
    // arbitrario de la ráfaga.
    cy.get('@atletas.all', { timeout: 15000 }).should((llamadas) => {
      const urls = llamadas.map((l) => decodeURIComponent(l.request.url));
      // >= 10 años ⇒ nacido en o antes de hoy-10; <= 12 ⇒ nacido después de hoy-13.
      const conRango = urls.filter(
        (u) => u.includes(`usuarios.fecha_nacimiento=lte.${iso(10)}`) &&
               u.includes(`usuarios.fecha_nacimiento=gt.${iso(13)}`)
      );
      expect(conRango, 'alguna query lleva el rango 10-12 traducido a fechas').to.not.be.empty;
    });
  });

  it('el rango cuenta como un filtro activo y se limpia al vaciarlo', () => {
    cy.visit('/dashboard');
    cy.get('#filtro-edad-min', { timeout: 15000 }).should('be.visible').type('14');

    // El contador vive en el botón "Filtros", que solo se muestra por debajo de
    // lg: se comprueba en viewport móvil, que es donde el usuario lo ve.
    cy.viewport(390, 844);
    cy.contains('button', 'Filtros').find('span').last().should('have.text', '1');

    cy.viewport(1440, 900);
    cy.get('#filtro-edad-min').clear();
    cy.viewport(390, 844);
    cy.contains('button', 'Filtros').should('not.contain.text', '1');
  });

  it('no acota cuando el campo queda vacío', () => {
    cy.intercept('GET', '**/rest/v1/atletas*').as('atletas');
    cy.visit('/dashboard');
    cy.wait('@atletas', { timeout: 15000 });

    // Re-query entre type y clear: el re-render de React desengancha el nodo y
    // encadenar `.clear()` sobre el sujeto viejo revienta.
    cy.get('#filtro-edad-min', { timeout: 15000 }).should('be.visible').type('9');
    cy.get('#filtro-edad-min').clear();

    // Tras vaciar, la última query debe volver a no acotar por fecha.
    cy.get('@atletas.all', { timeout: 15000 }).should((llamadas) => {
      const ultima = decodeURIComponent(llamadas[llamadas.length - 1].request.url);
      expect(ultima, 'sin rango no debe filtrar por fecha').to.not.include('usuarios.fecha_nacimiento');
    });
  });
});
