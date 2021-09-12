it('vk normal case', function() {
    cy.visit('/register');

    const checkSubmitDisabled = () => {
        cy.contains('Создать аккаунт').should('have.attr', 'disabled');
        cy.contains('Создать аккаунт').should('have.class', 'disabled');
    };
    checkSubmitDisabled();

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('span[title=VK]').click();
    checkSubmitDisabled();

    cy.wait(3000);

    // TODO: Here should be wait until authorized

    const name = 'cytest1' + Cypress._.random(1, 9999);

    cy.get('input[name=name]').type(name);
    checkSubmitDisabled();

    cy.get('code[class=GeneratedPasswordInput__generated_password]')
        .invoke('text')
        .then((password) => {
            console.log(password);
            cy.get('input[name=confirmPassword]').type(password);
    });
    checkSubmitDisabled();

    cy.get('input[name=box1]').should('not.be.checked');
    cy.get('input[name=box1]').check();

    cy.get('input[name=box1]').should('be.checked');
    cy.contains('Создать аккаунт').should('not.have.attr', 'disabled');
    cy.contains('Создать аккаунт').should('not.have.class', 'disabled');
    cy.contains('Создать аккаунт').click();
});

it('facebook normal case', function() {
    cy.visit('/register');

    const checkSubmitDisabled = () => {
        cy.contains('Создать аккаунт').should('have.attr', 'disabled');
        cy.contains('Создать аккаунт').should('have.class', 'disabled');
    };
    checkSubmitDisabled();

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('span[title=Facebook]').click();
    checkSubmitDisabled();

    cy.wait(3000);

    // TODO: Here should be wait until authorized

    const name = 'cytest1' + Cypress._.random(1, 9999);

    cy.get('input[name=name]').type(name);
    checkSubmitDisabled();

    cy.get('code[class=GeneratedPasswordInput__generated_password]')
        .invoke('text')
        .then((password) => {
            console.log(password);
            cy.get('input[name=confirmPassword]').type(password);
    });
    checkSubmitDisabled();

    cy.get('input[name=box1]').should('not.be.checked');
    cy.get('input[name=box1]').check();

    cy.get('input[name=box1]').should('be.checked');
    cy.contains('Создать аккаунт').should('not.have.attr', 'disabled');
    cy.contains('Создать аккаунт').should('not.have.class', 'disabled');
    cy.contains('Создать аккаунт').click();
});

it('mailru normal case', function() {
    cy.visit('/register');

    const checkSubmitDisabled = () => {
        cy.contains('Создать аккаунт').should('have.attr', 'disabled');
        cy.contains('Создать аккаунт').should('have.class', 'disabled');
    };
    checkSubmitDisabled();

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('span[title=Mail.Ru]').click();
    checkSubmitDisabled();

    cy.wait(3000);

    // TODO: Here should be wait until authorized

    const name = 'cytest1' + Cypress._.random(1, 9999);

    cy.get('input[name=name]').type(name);
    checkSubmitDisabled();

    cy.get('code[class=GeneratedPasswordInput__generated_password]')
        .invoke('text')
        .then((password) => {
            console.log(password);
            cy.get('input[name=confirmPassword]').type(password);
    });
    checkSubmitDisabled();

    cy.get('input[name=box1]').should('not.be.checked');
    cy.get('input[name=box1]').check();

    cy.get('input[name=box1]').should('be.checked');
    cy.contains('Создать аккаунт').should('not.have.attr', 'disabled');
    cy.contains('Создать аккаунт').should('not.have.class', 'disabled');
    cy.contains('Создать аккаунт').click();
});

it('yandex normal case', function() {
    cy.visit('/register');

    const checkSubmitDisabled = () => {
        cy.contains('Создать аккаунт').should('have.attr', 'disabled');
        cy.contains('Создать аккаунт').should('have.class', 'disabled');
    };
    checkSubmitDisabled();

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('span[title=Yandex]').click();
    checkSubmitDisabled();

    cy.wait(3000);

    // TODO: Here should be wait until authorized

    const name = 'cytest1' + Cypress._.random(1, 9999);

    cy.get('input[name=name]').type(name);
    checkSubmitDisabled();

    cy.get('code[class=GeneratedPasswordInput__generated_password]')
        .invoke('text')
        .then((password) => {
            console.log(password);
            cy.get('input[name=confirmPassword]').type(password);
    });
    checkSubmitDisabled();

    cy.get('input[name=box1]').should('not.be.checked');
    cy.get('input[name=box1]').check();

    cy.get('input[name=box1]').should('be.checked');
    cy.contains('Создать аккаунт').should('not.have.attr', 'disabled');
    cy.contains('Создать аккаунт').should('not.have.class', 'disabled');
    cy.contains('Создать аккаунт').click();
});
