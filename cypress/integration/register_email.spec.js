it('email send code case', function() {
    cy.visit('/register');

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('input[name=email]').type('testtestest@gmail.com');

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('not.have.class', 'disabled');
});

it('email normal case', async function() {
    const mailbox = await cy.task('createTestMailBox');

    cy.visit('/register');

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('have.class', 'disabled');

    cy.get('input[name=email]').type('aerostorm1@gmail.com');

    cy.get('p[class=CreateAccount__send-code-block] > a ').should('not.have.class', 'disabled');

    cy.get('p[class=CreateAccount__send-code-block] > a ').click();

    const verificationCode = await new Promise((resolve) => {
        mail.on('mail', mails => {
            return mails[0].body.split(' ')[2];
        });
    });

    cy.get('input[name=email]').type(verificationCode);

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
