Cypress.on('window:before:load', win => {
    cy.spy(win.console, 'log');
});

it('/register: query in URL: invite_code', function() {
    cy.visit('/register?invite=5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS');

    cy.get('input[name=invite_code]').invoke('val')
        .then(value => assert.equal(value, '5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS'));

    cy.contains('Такого чека нет').should('not.have.class', 'success');

    cy.window().then(win => {
        expect(win.console.log).to.have.not.calledWith('Referrer account will be ', '5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS');
    });
});

it('/register: query in URL: invite referrer', function() {
    cy.visit('/register?invite=lex');

    cy.get('input[name=invite_code]').should('not.exist');

    cy.contains('Такого чека нет').should('not.exist');

    cy.window().then(win => {
        expect(win.console.log).to.have.calledWith('Referrer account will be ', 'lex');
    });
});

it('/prizmtalk: query in URL: invite_code', function() {
    cy.visit('/prizmtalk?invite=5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS');

    cy.get('input[name=invite_code]').invoke('val')
        .then(value => assert.equal(value, '5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS'));

    cy.contains('Такого чека нет').should('not.have.class', 'success');

    cy.window().then(win => {
        expect(win.console.log).to.have.not.calledWith('Referrer account will be ', '5K1aJ8JayUA7c2Ptg9Y2DetKxSvXGXa5GCcvYeHtn1Xh3v4egPS');
    });
});

it('/prizmtalk/register: query in URL: invite referrer', function() {
    cy.visit('/prizmtalk/register?invite=lex');

    cy.get('input[name=invite_code]').should('not.exist');

    cy.contains('Такого чека нет').should('not.exist');

    cy.window().then(win => {
        expect(win.console.log).to.have.calledWith('Referrer account will be ', 'lex');
    });
});
