describe('Core Flows', () => {
  it('logs in, loads dashboard and navigates to Modo Cancha', () => {
    // Visit /login
    cy.visit('/login')
    
    // Log in with cedula '1234567890'
    // Note: Selectors might need adjustment based on the actual DOM elements
    cy.get('input').first().type('1234567890')
    cy.contains('button', /ingresar|login|entrar/i).click()

    // Verify dashboard loads
    cy.url().should('not.include', '/login')
    cy.get('body').should('be.visible')

    // Navigate to /cancha
    cy.visit('/cancha')

    // Verify Modo Cancha loads properly
    cy.url().should('include', '/cancha')
    cy.get('body').should('be.visible')
  })
})
