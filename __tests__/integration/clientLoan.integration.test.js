// __tests__/integration/clientLoan.integration.test.js
const clientManager = require('../../src/main/clientManager');
const loanManager = require('../../src/main/loanManager');
const dbUtil = require('../../src/main/database');
const authModule = require('../../src/main/auth'); // Added missing import
const { DateTime } = require('luxon'); // For start_date

// Electron's app module needs to be mocked for clientManager's baseClientsDocumentsPath
// and for database.js to get userData path.
// This should be picked up from __mocks__/electron.js if it's set up correctly.

describe('Client Creation and Loan Registration Integration', () => {
    const suiteTestAdminUsername = `cl_test_admin_${Date.now()}`;
    const suiteTestAdminPassword = 'securePassword123';
    let mockCurrentUser = { id: null, username: suiteTestAdminUsername, role: 'admin' }; // ID will be set in beforeAll

    // Correct DNI generation: take last 8 digits of timestamp for uniqueness and format compliance
    const clientDni = Date.now().toString().slice(-8); 
    const loanData = {
        loan_type: 'monthly',
        principal_amount: 5000,
        interest_rate: 0.05, // 5% monthly
        term_duration: 6, // months
        start_date: DateTime.now().toISODate(), // Today's date
        notes: 'Integration test loan',
        fixed_installment_amount: null, // Not a fixed installment loan for this test
    };
    let testClientId = null;
    let testLoanId = null;

    beforeAll(async () => {
        try {
            await dbUtil.initDatabase(); 
            console.log('ClientLoan Integration Test: Database initialized.');

            // Create a dedicated admin user for this test suite to avoid conflicts
            const adminRegResult = await authModule._internalRegisterAdmin(
                suiteTestAdminUsername,
                suiteTestAdminPassword,
                'Suite Test Admin'
            );
            if (adminRegResult.success && adminRegResult.userId) {
                mockCurrentUser.id = adminRegResult.userId;
                console.log(`ClientLoan Integration Test: Created suite-specific admin user ID: ${mockCurrentUser.id}`);
            } else {
                console.error('ClientLoan Integration Test: Failed to create suite-specific admin user.', adminRegResult.message);
                throw new Error('Failed to create suite-specific admin user for tests.');
            }
        } catch (err) {
            console.error('ClientLoan Integration Test: Error in beforeAll:', err);
            throw err;
        }
    });

    afterAll(async () => {
        // Cleanup
        if (testLoanId) {
            try {
                await dbUtil.run('DELETE FROM loans WHERE id = ?', [testLoanId]);
                console.log(`Cleaned up loan ID: ${testLoanId}`);
            } catch (err) {
                console.error('Error during loan cleanup:', err);
            }
        }
        if (testClientId) {
            try {
                await dbUtil.run('DELETE FROM clients WHERE id = ?', [testClientId]);
                console.log(`Cleaned up client ID: ${testClientId}`);
            } catch (err) {
                console.error('Error during client cleanup:', err);
            }
        }
        // Cleanup the suite-specific admin user
        if (mockCurrentUser.id) {
            try {
                await dbUtil.run('DELETE FROM users WHERE id = ?', [mockCurrentUser.id]);
                console.log(`Cleaned up suite-specific admin user ID: ${mockCurrentUser.id}`);
            } catch (err) {
                console.error('Error during suite-specific admin user cleanup:', err);
            }
        }
        try {
            await dbUtil.closeDatabaseConnection();
            console.log('ClientLoan Integration Test: Database connection closed.');
        } catch (err) {
            console.error('ClientLoan Integration Test: Error closing database connection:', err);
        }
    });

    test('should allow creating a client and then registering a loan for that client', async () => {
        // 1. Create Client
        const clientDetails = {
            firstName: 'Integ',
            lastName: 'TestClient',
            dni: clientDni,
            phone: '1234567890',
            address: '123 Test St',
            occupation: 'Tester',
            email: `integ-${clientDni}@test.com`,
            notes: 'Integration test client'
        };
        const addClientResult = await clientManager.addClient(clientDetails);
        console.log('Add Client Result:', addClientResult);
        expect(addClientResult.success).toBe(true);
        expect(addClientResult.clientId).toBeDefined();
        testClientId = addClientResult.clientId;

        // 2. Register Loan
        const currentLoanData = { ...loanData, client_id: testClientId };
        const registerLoanResult = await loanManager.registerLoan(currentLoanData, mockCurrentUser.id);
        console.log('Register Loan Result:', registerLoanResult);
        expect(registerLoanResult.success).toBe(true);
        expect(registerLoanResult.loanId).toBeDefined();
        testLoanId = registerLoanResult.loanId;

        // 3. Verify Loan Data (Optional but Recommended)
        const retrievedLoan = await loanManager.getLoanById(testLoanId);
        expect(retrievedLoan).not.toBeNull();
        expect(retrievedLoan.client_id).toBe(testClientId);
        expect(retrievedLoan.principal_amount).toBe(loanData.principal_amount);
        expect(retrievedLoan.interest_rate).toBe(loanData.interest_rate);
        expect(retrievedLoan.term_duration).toBe(loanData.term_duration); // This is number_of_installments for fixed installment daily loans
        expect(retrievedLoan.number_of_installments).toBe(loanData.term_duration); // For simple monthly/daily, term_duration = number_of_installments
        expect(retrievedLoan.installments).toBeDefined();
        expect(retrievedLoan.installments.length).toBe(loanData.term_duration);
        
        // Verify installment details if needed
        const expectedInstallmentAmount = registerLoanResult.details.actualInstallmentAmount;
        expect(retrievedLoan.installments[0].amount_due).toBeCloseTo(expectedInstallmentAmount, 2);
    });
});
