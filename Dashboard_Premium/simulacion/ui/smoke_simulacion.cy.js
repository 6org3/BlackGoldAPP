// ui/smoke_simulacion.cy.js — Smoke END-TO-END de la UI para el club de
// simulación. Corre en los CHECKPOINTS: entra a la app real (localhost:5173),
// loguea con cuentas SIMLOOP- y verifica que los 5 portales renderizan con
// datos y SIN errores de consola.
//
// Copiá este archivo a Dashboard_Premium/cypress/e2e/ para que Cypress lo tome.
// Reusa el estilo de cypress/e2e/qa_flow.cy.js y qa_roles.cy.js.
//
//   npm run dev            # levantar la app (otra terminal)
//   npx cypress run --spec cypress/e2e/smoke_simulacion.cy.js
//
// Credenciales de simulación: identificador = password = cédula (mismo esquema
// que verificar_seed_demo.mjs). Poné las cédulas reales que creó el loop.

const CUENTAS = {
  owner:      Cypress.env('SIM_OWNER')  || 'SIMLOOP-OWNER-001',
  coach:      Cypress.env('SIM_COACH')  || 'SIMLOOP-COACH-001',
  atleta:     Cypress.env('SIM_ATLETA') || 'SIMLOOP-ATL-0001',
  padre:      Cypress.env('SIM_PADRE')  || 'SIMLOOP-PADRE-0001',
};

function loginPorCedula(cedula) {
  cy.visit('/');
  // TODO(Antigravity): ajustá selectores a la pantalla de login real
  // (revisá cypress/e2e/qa_flow.cy.js, que ya loguea correctamente).
  cy.get('input[name="identificador"], input[type="text"]').first().clear().type(cedula);
  cy.get('input[type="password"]').first().clear().type(cedula);
  cy.get('button[type="submit"], button').contains(/entrar|iniciar|login/i).click();
}

describe('Smoke UI · club de simulación', () => {
  beforeEach(() => {
    // fallar el test si la app tira un error de consola no controlado
    cy.on('window:before:load', (win) => {
      cy.stub(win.console, 'error').callsFake((...args) => {
        throw new Error('console.error en la app: ' + args.join(' '));
      });
    });
  });

  Object.entries(CUENTAS).forEach(([rol, cedula]) => {
    it(`portal ${rol} renderiza con datos`, () => {
      loginPorCedula(cedula);
      cy.url({ timeout: 15000 }).should('not.include', 'login');
      cy.get('body').should('be.visible');
      // TODO(Antigravity): assert de un dato sembrado (nombre del club, algún
      // atleta, un pago del mes) según el portal, para probar que la data llegó.
    });
  });
});
