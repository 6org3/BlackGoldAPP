// Control de Asistencia: el pase de lista se acota por GRUPO de entrenamiento.
//
// Antes se acotaba por categoría FEB, que no corresponde con quién está en la
// cancha: el grupo es el que tiene horario, y mezcla categorías a propósito.
//
// El spec NO asume nombres de grupo concretos: lee los que el club tenga de
// verdad. Así no depende de una siembra manual y sigue valiendo cuando el club
// cree sus propios grupos.
describe('Asistencia — filtro por grupo de entrenamiento', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  // Categorías FEB: ninguna puede aparecer como opción del selector.
  const CATEGORIAS_FEB = ['Sub-9', 'Sub-11', 'Sub-14', 'Sub-16', 'Sub-18', 'Premini', 'Mini', 'Menores', 'Prejuvenil', 'Juvenil', 'Mayores'];

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
    cy.viewport(1440, 900);
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
    cy.visit('/admin/asistencia');
  });

  const selectGrupo = () => cy.get('select[aria-label="Filtrar por grupo de entrenamiento"]', { timeout: 15000 });

  it('el selector ofrece grupos del club, nunca categorías FEB', () => {
    selectGrupo().should('be.visible');
    selectGrupo().find('option').should('have.length.at.least', 1);

    selectGrupo().find('option').then(($ops) => {
      const textos = [...$ops].map((o) => o.textContent.trim());
      expect(textos[0], 'la primera opción no acota').to.eq('Todos los grupos');

      // Una categoría FEB como opción significaría que la pantalla volvió a
      // filtrar por cohorte de edad en vez de por grupo.
      const sospechosas = textos.filter((t) =>
        t !== 'Todos los grupos' && CATEGORIAS_FEB.some((c) => t.includes(c))
      );
      expect(sospechosas, `opciones que parecen categoría FEB: ${sospechosas.join(', ')}`).to.be.empty;
    });
  });

  it('acota el pase de lista al grupo elegido y lo nombra en el encabezado', () => {
    // Con "Todos los grupos" el encabezado no nombra ninguno.
    cy.contains('Gestión por grupos', { timeout: 15000 }).should('be.visible');

    selectGrupo().find('option').then(($ops) => {
      const grupos = [...$ops].map((o) => o.textContent.trim()).filter((t) => t !== 'Todos los grupos');
      if (grupos.length === 0) {
        cy.log('El club no tiene grupos: nada que acotar.');
        return;
      }
      // Elegir un grupo debe reflejarse en el encabezado y en el conteo.
      selectGrupo().select(grupos[0]);
      cy.contains(new RegExp(`${grupos[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · \\d+ atletas`), { timeout: 15000 })
        .should('be.visible');
    });
  });
});
