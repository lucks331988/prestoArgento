// __tests__/integration/userAuth.integration.test.js
const userManager = require('../../src/main/userManager');
const authModule = require('../../src/main/auth');
const dbUtil = require('../../src/main/database'); // For potential cleanup

describe('User Registration and Login Integration', () => {
    const testUsername = `testuser_${Date.now()}`;
    const testPassword = 'Password123!';
    const testFullName = 'Test User Full Name';
    let createdUserId = null;

    // Mock admin user for registration
    const mockAdminUser = {
        id: 'admin_id_001', // Can be any mock ID
        username: 'mockadmin',
        role: 'admin'
    };

    beforeAll(async () => {
        // Initialize the database and create tables before any tests run
        try {
            // Ensure the mock for electron.app.getPath('userData') is working for db path
            // The mock should already be in __mocks__/electron.js
            await dbUtil.initDatabase();
            console.log('Integration Test: Database initialized.');
        } catch (err) {
            console.error('Integration Test: Error initializing database:', err);
            // Throwing here will prevent tests from running if DB init fails
            throw err; 
        }
    });

    afterAll(async () => {
        // Cleanup: Remove the test user from the database
        if (createdUserId) {
            try {
                await dbUtil.run('DELETE FROM users WHERE id = ?', [createdUserId]);
                console.log(`Cleaned up user ID: ${createdUserId}`);
            } catch (err) {
                console.error('Error during user cleanup:', err);
            }
        }
        // Close the database connection
        try {
            await dbUtil.closeDatabaseConnection();
            console.log('Integration Test: Database connection closed.');
        } catch (err) {
            console.error('Integration Test: Error closing database connection:', err);
        }
    });

    test('should allow a new user to be registered and then log in successfully', async () => {
        // 1. Register User
        const regResult = await userManager.registerUser(
            { username: testUsername, password: testPassword, fullName: testFullName, role: 'employee' },
            mockAdminUser 
        );
        expect(regResult.success).toBe(true);
        expect(regResult.userId).toBeDefined();
        createdUserId = regResult.userId; // Save for cleanup

        // 2. Login with the new user
        const loginResult = await authModule.loginUser(testUsername, testPassword);
        expect(loginResult.success).toBe(true);
        expect(loginResult.user).toBeDefined();
        expect(loginResult.user.username).toBe(testUsername);
        expect(loginResult.user.full_name).toBe(testFullName);
        expect(loginResult.user.role).toBe('employee');
        expect(loginResult.user.password_hash).toBeUndefined(); // Ensure hash is not returned
    });

    test('should fail to log in with incorrect password after registration', async () => {
        // Assumes user from previous test was registered (or use a new one for full isolation if preferred)
        // If not depending on previous test, this test would also need to register a user first.
        // For simplicity here, we'll assume the previous test's user (testUsername) exists.
        if (!createdUserId) {
            // This state can occur if the first test fails before setting createdUserId.
            // To make this test more robust and independent, you could register a new user here.
            // However, for this initial setup, we'll proceed with a warning.
            console.warn("Skipping test for incorrect password as user registration might have failed or not run yet.");
            // Or, throw an error to clearly indicate a dependency issue if strict test order isn't guaranteed
            // and this test MUST run after a successful registration.
            // throw new Error("User was not created from previous test, cannot test incorrect password login.");
            return; 
        }

        const loginResult = await authModule.loginUser(testUsername, 'WrongPassword123');
        expect(loginResult.success).toBe(false);
        expect(loginResult.message).toBe('Contraseña incorrecta.');
    });
});
