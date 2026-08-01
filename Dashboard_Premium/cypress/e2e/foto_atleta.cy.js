/**
 * Foto de identificación del atleta (v61/v62).
 *
 * Requiere las migraciones v61 (columna `foto_path` + RPC
 * establecer_foto_atleta) y v62 (bucket fotos-atletas + políticas) aplicadas:
 * sin ellas, la subida falla con un error de PostgREST.
 *
 * El caso negativo importante — un padre cambiando la foto de un atleta que no
 * es su hijo, un coach sobre uno de otro club, o el acceso directo a Storage —
 * NO se prueba aquí: es una regla de servidor y vive en suiteFotos(), dentro
 * de scripts/validar_rls_por_rol.js, que la ataca sin pasar por la UI.
 */
describe('Foto de identificación', () => {
  const ROLES_CONFIG = Cypress.env('QA_ROLES');

  // PNG 1x1 válido: el pipeline lo decodifica, recorta y reencoda igual que a
  // una foto de 8 MB. Se genera en memoria para no versionar un binario.
  const PNG_1PX =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const archivo = () => ({
    contents: Cypress.Buffer.from(PNG_1PX, 'base64'),
    fileName: 'retrato.png',
    mimeType: 'image/png',
  });

  before(function () {
    if (!ROLES_CONFIG) {
      throw new Error(
        'Falta cypress.env.json con credenciales de prueba. Copia cypress.env.json.example ' +
        'a cypress.env.json (gitignored) y completa una cuenta real por rol.'
      );
    }
  });

  const entrar = (rol) => {
    const creds = ROLES_CONFIG[rol];
    cy.visit('/login');
    cy.get('input[type="text"], input[type="email"], input[placeholder*="ejemplo"]').first().type(creds.identificador);
    cy.get('input[type="password"]').first().type(creds.password, { log: false });
    cy.get('button[type="submit"]').click();
  };

  it('el staff sube la foto de un atleta desde el plantel', () => {
    entrar('owner');
    cy.visit('/admin/atletas');

    // El badge de cámara del avatar abre el modal.
    cy.get('[aria-label^="Cambiar foto"]', { timeout: 15000 }).first().click();
    cy.contains(/foto de identificación/i).should('be.visible');

    // El input está oculto a propósito (lo dispara el CTA), de ahí el force.
    cy.get('input[type="file"]').selectFile(archivo(), { force: true });

    cy.contains(/así se verá/i, { timeout: 10000 }).should('be.visible');
    cy.contains(/usar esta foto/i).click();
    cy.contains(/foto actualizada/i, { timeout: 15000 }).should('be.visible');

    // Persiste: tras recargar, el avatar pinta una <img> con URL firmada.
    cy.reload();
    cy.get('[aria-label^="Cambiar foto"]', { timeout: 15000 }).first().find('img')
      .should('have.attr', 'src').and('include', 'token=');
  });

  it('el atleta cambia su foto desde el menú de perfil', () => {
    entrar('atleta');
    cy.url({ timeout: 15000 }).should('include', '/atleta');

    cy.get('[aria-label="Menú de perfil"]').click();
    cy.get('[data-testid="btn-cambiar-foto"]').click();
    cy.contains(/foto de identificación/i).should('be.visible');

    cy.get('input[type="file"]').selectFile(archivo(), { force: true });
    cy.contains(/usar esta foto/i, { timeout: 10000 }).click();
    cy.contains(/foto actualizada/i, { timeout: 15000 }).should('be.visible');
  });

  it('el padre cambia la foto de su hijo desde su tarjeta', () => {
    entrar('padre');
    cy.url({ timeout: 15000 }).should('include', '/padre');

    // Para el padre el punto de entrada es el avatar del hijo, no "Editar
    // perfil" (que editaría al padre).
    cy.get('[aria-label^="Cambiar foto"]', { timeout: 15000 }).first().click();
    cy.get('input[type="file"]').selectFile(archivo(), { force: true });
    cy.contains(/usar esta foto/i, { timeout: 10000 }).click();
    cy.contains(/foto actualizada/i, { timeout: 15000 }).should('be.visible');
  });

  it('se puede quitar la foto, con confirmación en línea', () => {
    entrar('owner');
    cy.visit('/admin/atletas');

    cy.get('[aria-label^="Cambiar foto"]', { timeout: 15000 }).first().click();
    cy.contains(/quitar foto/i).click();
    // La confirmación vive dentro del mismo modal: dos trampas de foco
    // superpuestas se pelearían por el Tab.
    cy.contains(/sí, quitar/i).click();
    cy.contains(/foto actualizada/i, { timeout: 15000 }).should('be.visible');
  });
});
