// Gestión de grupos de entrenamiento (/admin/grupos, v37).
//
// Es la primera pantalla desde la que se pueden crear grupos: hasta ahora solo
// existían por seed o a mano en la base. Lo que se verifica es la regla de
// negocio que la pantalla encarna, no el pixel.
describe('/admin/grupos — gestión de grupos', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');
  // Nombre único por corrida: el spec crea grupos de verdad y los limpia al
  // final; si algo falla a medias, un nombre fijo bloquearía la siguiente
  // corrida por el UNIQUE(club, nombre).
  const SUFIJO = `${Cypress._.random(1e6)}`;
  const EXTRA = `E2E Extra ${SUFIJO}`;

  before(function () {
    if (!ROLES_CONFIG) throw new Error('Falta cypress.env.json con credenciales de prueba.');
  });

  beforeEach(() => {
    const creds = ROLES_CONFIG.coach;
    cy.viewport(1440, 950);
    cy.visit('/login');
    cy.clearLocalStorage();
    cy.clearCookies();
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password);
    cy.get('form button[type="submit"]').click();
    cy.url({ timeout: 15000 }).should('not.include', '/login');
    cy.visit('/admin/grupos');
    cy.contains('Grupos de', { timeout: 15000 }).should('be.visible');
  });

  it('el coach entra y ve los tres principales, creados o como hueco', () => {
    cy.contains('la membresía básica cubre uno de estos').should('be.visible');
    // Los tres niveles están siempre: o con su grupo, o con el hueco "Crear".
    ['Micro', 'Desarrollo', 'Elite'].forEach((n) => cy.contains(n).should('exist'));
    cy.contains('se cobran aparte de la membresía básica').should('be.visible');
  });

  it('exige el precio: un grupo sin precio no se crea', () => {
    cy.contains('button', 'Nuevo Grupo').click();
    cy.get('input[placeholder="Ej. Elite Mañana"]').type(`Sin precio ${SUFIJO}`);
    cy.get('input[placeholder="Ej. L-M-V 17:00"]').type('X 10:00');
    cy.contains('button', 'Crear Grupo').click();
    // v37 quitó el DEFAULT 30.00 justo para que esto no pase inadvertido.
    cy.get('[role="alert"]', { timeout: 10000 }).should('contain.text', 'precio');
    // El formulario sigue abierto con lo escrito: un error no debe tirar el trabajo.
    cy.get('input[placeholder="Ej. Elite Mañana"]').should('have.value', `Sin precio ${SUFIJO}`);
  });

  it('crea un grupo extra y lo muestra como facturable aparte', () => {
    cy.contains('button', 'Nuevo Grupo').click();
    cy.get('input[placeholder="Ej. Elite Mañana"]').type(EXTRA);
    cy.get('input[placeholder="Ej. L-M-V 17:00"]').type('S 09:00');
    cy.get('input[placeholder="Ej. 30"]').type('15');
    cy.contains('button', 'Crear Grupo').click();

    cy.get('[role="status"]', { timeout: 15000 }).should('contain.text', 'se cobra aparte');
    cy.contains(EXTRA).should('be.visible');
    // Un grupo sin es_principal es "Extra" y arranca vacío.
    cy.contains(EXTRA).closest('div').parent().within(() => {
      cy.contains('Extra').should('exist');
    });

    // Limpieza: el spec crea grupos de verdad en el club, así que se lleva lo
    // suyo. Sin esto cada corrida deja un grupo huérfano en los datos del club.
    cy.get(`button[aria-label="Eliminar ${EXTRA}"]`).click();
    cy.contains('button', 'Eliminar').click();
    // Por el botón de la fila, no por el nombre: el banner de éxito ("… eliminado")
    // también contiene el nombre, así que buscarlo como texto nunca desaparece.
    cy.get(`button[aria-label="Eliminar ${EXTRA}"]`, { timeout: 15000 }).should('not.exist');
  });

  it('crea un principal desde su hueco y no deja un segundo del mismo nivel', () => {
    // Se toma el primer nivel que el club tenga LIBRE, leído del propio DOM: así
    // el spec no depende de qué haya creado una corrida anterior. El hueco es el
    // flujo real del dueño que empieza de cero.
    cy.get('button[aria-label^="Crear el grupo principal"]').first().then(($btn) => {
      const nivel = $btn.attr('aria-label').replace('Crear el grupo principal ', '');

      // 1) Crear desde el hueco: el formulario llega con nivel y "principal" ya puestos.
      cy.wrap($btn).click();
      cy.get('input[type="checkbox"]').should('be.checked');
      cy.get('input[placeholder="Ej. L-M-V 17:00"]').type('L 16:00');
      cy.get('input[placeholder="Ej. 30"]').type('20');
      cy.contains('button', 'Crear Grupo').click();
      cy.get('[role="status"]', { timeout: 15000 }).should('contain.text', `principal de nivel ${nivel}`);

      // 2) Un segundo principal del MISMO nivel: el índice único parcial lo
      //    rechaza, y el mensaje debe ser legible, no un código de Postgres.
      cy.contains('button', 'Nuevo Grupo').click();
      cy.get('input[placeholder="Ej. Elite Mañana"]').type(`E2E Bis ${SUFIJO}`);
      cy.get('input[placeholder="Ej. L-M-V 17:00"]').type('J 18:00');
      cy.get('input[placeholder="Ej. 30"]').type('20');
      cy.get('select').last().select(nivel);
      cy.get('input[type="checkbox"]').check();
      cy.contains('button', 'Crear Grupo').click();

      cy.get('[role="alert"]', { timeout: 15000 })
        .should('contain.text', 'principal')
        .and('not.contain.text', '23505')          // nada de códigos de Postgres
        .and('not.contain.text', 'duplicate key');

      // 3) Limpieza por la UI, que de paso prueba el borrado: un grupo vacío sí
      //    se elimina (con atletas dentro la base lo impide, a propósito), y el
      //    hueco del principal debe volver a aparecer.
      cy.get('button[aria-label="Cerrar formulario"]').click(); // icono: el texto vive en el aria-label
      cy.get(`button[aria-label="Eliminar ${nivel}"]`, { timeout: 10000 }).click();
      cy.contains('button', 'Eliminar').click();
      cy.get(`button[aria-label="Crear el grupo principal ${nivel}"]`, { timeout: 15000 }).should('exist');
    });
  });
});
