// __tests__/integration/payment.integration.test.js

// Mock process.resourcesPath for testing environment
// This needs to be done before requiring paymentManager because it uses it at the module level.
const path = require('path'); 
process.resourcesPath = path.join(__dirname, '..', '..', 'mock_resources'); // Provide a dummy path

const clientManager = require('../../src/main/clientManager');
const loanManager = require('../../src/main/loanManager');
const paymentManager = require('../../src/main/paymentManager');
const dbUtil = require('../../src/main/database');
const authModule = require('../../src/main/auth');
const { DateTime } = require('luxon');

describe('Payment Recording Integration', () => {
    const suiteTestAdminUsername = `pay_test_admin_${Date.now()}`;
    const suiteTestAdminPassword = 'securePassword123';
    let mockCurrentUser = { id: null, username: suiteTestAdminUsername, role: 'admin' };

    beforeAll(async () => {
        try {
            await dbUtil.initDatabase();
            console.log('Payment Integration Test: Database initialized.');

            const adminRegResult = await authModule._internalRegisterAdmin(
                suiteTestAdminUsername,
                suiteTestAdminPassword,
                'Suite Payment Test Admin'
            );
            if (adminRegResult.success && adminRegResult.userId) {
                mockCurrentUser.id = adminRegResult.userId;
                console.log(`Payment Integration Test: Created suite-specific admin user ID: ${mockCurrentUser.id}`);
            } else {
                throw new Error(`Failed to create suite-specific admin user: ${adminRegResult.message}`);
            }
        } catch (err) {
            console.error('Payment Integration Test: Error in beforeAll:', err);
            throw err;
        }
    });
    
    // Helper function to set up client, loan, and first installment
    async function setupClientAndLoanWithInstallment(loanPrincipal = 1000, loanTerm = 2, loanType = 'monthly', interestRate = 0.1) {
        // Corrected DNI: Use only last 8 digits of timestamp to ensure it's numeric and valid length
        const clientDni = Date.now().toString().slice(-8); 
        const clientDetails = {
            firstName: 'PayTest', lastName: 'Client', dni: clientDni,
            phone: '123450000', address: '1 Pay St', occupation: 'Payer',
            email: `pay-${clientDni}@test.com`, notes: 'Payment test client'
        };
        const addClientResult = await clientManager.addClient(clientDetails);
        if (!addClientResult.success) throw new Error(`Failed to create client: ${addClientResult.message}`);
        const clientId = addClientResult.clientId;

        const loanData = {
            client_id: clientId,
            loan_type: loanType,
            principal_amount: loanPrincipal,
            interest_rate: interestRate, 
            term_duration: loanTerm, 
            start_date: DateTime.now().toISODate(),
            notes: 'Payment integration test loan'
        };
        const registerLoanResult = await loanManager.registerLoan(loanData, mockCurrentUser.id);
        if (!registerLoanResult.success) {
            await dbUtil.run('DELETE FROM clients WHERE id = ?', [clientId]);
            throw new Error(`Failed to register loan: ${registerLoanResult.message}`);
        }
        const loanId = registerLoanResult.loanId;

        const retrievedLoan = await loanManager.getLoanById(loanId);
        if (!retrievedLoan || !retrievedLoan.installments || retrievedLoan.installments.length === 0) {
            await dbUtil.run('DELETE FROM loans WHERE id = ?', [loanId]); // Cleanup loan if installments are missing
            await dbUtil.run('DELETE FROM clients WHERE id = ?', [clientId]);
            throw new Error('Loan or installments not found after registration.');
        }
        const firstInstallmentId = retrievedLoan.installments[0].id;
        const firstInstallmentAmountDue = retrievedLoan.installments[0].amount_due;
        
        return { clientId, loanId, installmentId: firstInstallmentId, installmentAmountDue: firstInstallmentAmountDue, allInstallments: retrievedLoan.installments };
    }

    afterAll(async () => {
        try {
            if (mockCurrentUser.id) {
                await dbUtil.run('DELETE FROM users WHERE id = ?', [mockCurrentUser.id]);
                console.log(`Cleaned up suite-specific admin user ID: ${mockCurrentUser.id}`);
            }
            // Note: Individual tests are responsible for cleaning up their own clients/loans/payments
            // to ensure test isolation, especially if setupClientAndLoanWithInstallment creates unique data each time.
            await dbUtil.closeDatabaseConnection();
            console.log('Payment Integration Test: Database connection closed.');
        } catch (err) {
            console.error('Payment Integration Test: Error during afterAll cleanup:', err);
        }
    });
    
    // No beforeEach for suite-level vars; each test manages its own data.

    test('should successfully record a full payment for an installment', async () => {
        let setupData;
        try {
            setupData = await setupClientAndLoanWithInstallment(); 
            const { installmentId, installmentAmountDue } = setupData;

            const paymentData = {
                loan_installment_id: installmentId,
                payment_amount: installmentAmountDue,
                payment_date_iso: DateTime.now().toISO(), 
                payment_method: 'cash',
                notes: 'Full payment test'
            };

            const recordPaymentResult = await paymentManager.recordPayment(paymentData, mockCurrentUser.id);
            console.log('Record Payment Result (Test 1):', recordPaymentResult);
            expect(recordPaymentResult.success).toBe(true);
            expect(recordPaymentResult.paymentId).toBeDefined();

            const paymentInDb = await dbUtil.get('SELECT * FROM payments WHERE id = ?', [recordPaymentResult.paymentId]);
            expect(paymentInDb).not.toBeNull();
            expect(paymentInDb.payment_amount).toBe(installmentAmountDue);
            expect(paymentInDb.loan_installment_id).toBe(installmentId);

            const installmentInDb = await dbUtil.get('SELECT * FROM loan_installments WHERE id = ?', [installmentId]);
            expect(installmentInDb).not.toBeNull();
            expect(installmentInDb.status).toBe('paid');
            expect(installmentInDb.amount_paid).toBe(installmentAmountDue);
        } finally {
            // Cleanup for this test's specific data
            if (setupData) {
                await dbUtil.run('DELETE FROM payments WHERE loan_id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM loan_installments WHERE loan_id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM loans WHERE id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM clients WHERE id = ?', [setupData.clientId]);
            }
        }
    });

    test('should update loan to paid if all installments are paid', async () => {
        let setupData;
        try {
            setupData = await setupClientAndLoanWithInstallment(700, 1, 'monthly', 0.05); 
            const { clientId, loanId, allInstallments } = setupData;
            const firstInstallment = allInstallments[0];
            
            const paymentData = {
                loan_installment_id: firstInstallment.id,
                payment_amount: firstInstallment.amount_due,
                payment_date_iso: DateTime.now().toISO(),
                payment_method: 'transfer',
                notes: 'Full payment for single installment loan'
            };

            const recordPaymentResult = await paymentManager.recordPayment(paymentData, mockCurrentUser.id);
            console.log('Record Payment Result (Test 2):', recordPaymentResult);
            expect(recordPaymentResult.success).toBe(true);
            expect(recordPaymentResult.paymentId).toBeDefined();

            const paymentInDb = await dbUtil.get('SELECT * FROM payments WHERE id = ?', [recordPaymentResult.paymentId]);
            expect(paymentInDb).not.toBeNull();
            expect(paymentInDb.payment_amount).toBe(firstInstallment.amount_due);

            const installmentInDb = await dbUtil.get('SELECT * FROM loan_installments WHERE id = ?', [firstInstallment.id]);
            expect(installmentInDb).not.toBeNull();
            expect(installmentInDb.status).toBe('paid');

            const loanInDb = await dbUtil.get('SELECT * FROM loans WHERE id = ?', [loanId]);
            expect(loanInDb).not.toBeNull();
            expect(loanInDb.status).toBe('paid');
        } finally {
            // Cleanup for this test's specific data
            if (setupData) {
                await dbUtil.run('DELETE FROM payments WHERE loan_id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM loan_installments WHERE loan_id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM loans WHERE id = ?', [setupData.loanId]);
                await dbUtil.run('DELETE FROM clients WHERE id = ?', [setupData.clientId]);
            }
        }
    });
});
