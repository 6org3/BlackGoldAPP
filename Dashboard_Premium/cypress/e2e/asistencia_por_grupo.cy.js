// Control de Asistencia: el pase de lista se acota por GRUPO de entrenamiento.
//
// Antes se acotaba por categoría FEB, que no corresponde con quién está en la
// cancha: el grupo es el que tiene horario, y mezcla categorías a propósito.
//
// El spec NO asume nombres de grupo concretos: lee los que el club tenga de
// verdad. Así no depende de una siembra manual y sigue valiendo cuando el club
// cree sus propios grupos — ni siquiera para detectar la regresión a categoría
// FEB, que se comprueba por la forma del `value` de cada opción y no por su
// texto (un grupo puede llamarse "Sub-16" legítimamente).
describe('Asistencia — filtro por grupo de entrenamiento', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  // Un grupo se identifica por su id; una categoría FEB, por su nombre. Ver el
  // primer test: es la forma del `value` lo que separa un selector del otro.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  it('el selector identifica cada opción por id de grupo, nunca por categoría FEB', () => {
    selectGrupo().should('be.visible');
    // ≥2 = el placeholder MÁS al menos un grupo. Esta espera no es cosmética:
    // los grupos llegan por fetch y el <select> se pinta antes, con "Todos los
    // grupos" a secas. Con `at.least, 1` la aserción se cumplía con el
    // placeholder solo, el `.then()` de abajo (que no reintenta) leía una lista
    // sin grupos y el test pasaba sin comprobar absolutamente nada.
    selectGrupo().find('option').should('have.length.at.least', 2);

    selectGrupo().find('option').then(($ops) => {
      const opciones = [...$ops].map((o) => ({ texto: o.textContent.trim(), value: o.value }));
      expect(opciones[0].texto, 'la primera opción no acota').to.eq('Todos los grupos');

      // Lo que separa "acota por grupo" de "acota por categoría FEB" es el VALUE,
      // no el texto: un grupo se identifica por su id, y la lista vieja usaba el
      // nombre de la cohorte como valor ('Premini (Sub-9)'). Volver a filtrar por
      // categoría es imposible sin romper esta forma.
      //
      // Mirar el texto sería un falso rojo esperando su turno: un club puede
      // llamar "Sub-16" a un grupo con toda legitimidad, y los propios clubes
      // demo del repo ya lo hacen (simular_club_nuevo_1anio.mjs siembra 'Sub-16';
      // sembrar_club_qa_compacto.mjs, 'QAC Sub-16'). Este spec pasaba solo porque
      // la cuenta QA vive en otro club.
      const noSonGrupo = opciones.slice(1).filter((o) => !UUID_RE.test(o.value));
      expect(
        noSonGrupo,
        `opciones que no identifican a un grupo por id: ${noSonGrupo.map((o) => `${o.texto}=${o.value}`).join(', ')}`
      ).to.be.empty;
    });
  });

  it('acota el pase de lista al grupo elegido y lo nombra en el encabezado', () => {
    // Con "Todos los grupos" el encabezado no nombra ninguno.
    cy.contains('Gestión por grupos', { timeout: 15000 }).should('be.visible');

    // Mismo motivo que arriba: sin esperar a que lleguen los grupos, el
    // `.then()` leía cero y la prueba se autodescartaba por "el club no tiene
    // grupos" — un verde que no ejercía el filtro. La cuenta QA sí tiene grupos:
    // si esto falla, es que no llegan, y eso es exactamente lo que hay que saber.
    selectGrupo().find('option').should('have.length.at.least', 2);

    selectGrupo().find('option').then(($ops) => {
      const grupos = [...$ops].map((o) => o.textContent.trim()).filter((t) => t !== 'Todos los grupos');

      // Elegir un grupo debe reflejarse en el encabezado y en el conteo.
      selectGrupo().select(grupos[0]);
      cy.contains(new RegExp(`${grupos[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · \\d+ atletas`), { timeout: 15000 })
        .should('be.visible');
    });
  });
});
