// __tests__/unit/paymentManager.test.js

// Mock process.resourcesPath for testing environment
const path = require('path'); 
process.resourcesPath = path.join(__dirname, '..', '..', 'mock_resources'); 

jest.mock('../../src/main/database', () => ({
    get: jest.fn(),
    run: jest.fn(), 
}));
const dbUtil = require('../../src/main/database');
const { calculateArrears } = require('../../src/main/paymentManager');
const { DateTime } = require('luxon');

describe('paymentManager.calculateArrears', () => {
    beforeEach(() => {
        dbUtil.get.mockClear();
        dbUtil.run.mockClear(); 
    });

    // Test Case 1: Installment not yet overdue.
    test('should return 0 arrears if installment is not yet overdue', async () => {
        const futureDate = DateTime.now().plus({ days: 5 }).toISODate();
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.001 }); 
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 0, due_date: futureDate, status: 'pending', interest_on_arrears: 0 
        });

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.arrearsAmount).toBe(0);
        expect(result.daysOverdue).toBe(0); // Correct: diff will be negative, floored to 0 or handled by initial check
        expect(result.message).toBe("La cuota no está vencida.");
        expect(dbUtil.run).not.toHaveBeenCalled(); 
    });

    // Test Case 2: Installment paid.
    test('should return 0 arrears if installment is already paid', async () => {
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.001 });
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 1000, due_date: '2024-01-01', status: 'paid', interest_on_arrears: 0 
        });

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.arrearsAmount).toBe(0);
        expect(result.message).toBe("La cuota ya está pagada.");
        expect(dbUtil.run).not.toHaveBeenCalled();
    });

    // Test Case 3: Installment overdue, no payment, standard rate.
    test('should calculate arrears and update DB for an overdue installment with no payment', async () => {
        // Due date was 10 full days ago. today.diff(dueDate.endOfDay()).days will be 9.something, floored to 9.
        const pastDate = DateTime.now().minus({ days: 10 }).startOf('day').toISODate(); // Due at start of that day
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.001 });
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 0, due_date: pastDate, status: 'overdue', interest_on_arrears: 0 
        });
        dbUtil.run.mockResolvedValueOnce({ changes: 1 }); 

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.daysOverdue).toBe(9); // Corrected expectation
        expect(result.arrearsAmount).toBeCloseTo(9.00, 2); // 1000 * 0.001 * 9
        expect(dbUtil.run).toHaveBeenCalledWith(
            'UPDATE loan_installments SET interest_on_arrears = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [9.00, 1]
        );
    });

    // Test Case 4: Installment overdue, partial payment, different rate.
    test('should calculate arrears and update DB for an overdue installment with partial payment and different rate', async () => {
        // Due date was 5 full days ago. daysOverdue will be 4.
        const pastDate = DateTime.now().minus({ days: 5 }).startOf('day').toISODate();
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.002 });
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 200, due_date: pastDate, status: 'overdue', interest_on_arrears: 0 
        });
        dbUtil.run.mockResolvedValueOnce({ changes: 1 });

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.daysOverdue).toBe(4); // Corrected expectation
        expect(result.arrearsAmount).toBeCloseTo(6.40, 2); // (1000 - 200) * 0.002 * 4 = 6.40
        expect(dbUtil.run).toHaveBeenCalledWith(
            'UPDATE loan_installments SET interest_on_arrears = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [6.40, 1]
        );
    });

    // Test Case 5: Installment overdue, but principal covered.
    test('should return 0 arrears if principal is covered, even if overdue', async () => {
        // Due date was 3 full days ago. daysOverdue will be 2.
        const pastDate = DateTime.now().minus({ days: 3 }).startOf('day').toISODate();
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.001 });
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 1000, due_date: pastDate, status: 'partially_paid', interest_on_arrears: 0 
        });

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.arrearsAmount).toBe(0);
        expect(result.daysOverdue).toBe(2); // Corrected expectation
        expect(result.message).toBe("El capital de la cuota está cubierto.");
        expect(dbUtil.run).not.toHaveBeenCalled();
    });

    // Test Case 6: DB update for arrears fails
    test('should return error if DB update for arrears fails', async () => {
        const pastDate = DateTime.now().minus({ days: 10 }).startOf('day').toISODate();
        dbUtil.get.mockResolvedValueOnce({ default_daily_arrears_rate: 0.001 });
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 1000, amount_paid: 0, due_date: pastDate, status: 'overdue', interest_on_arrears: 0 
        });
        dbUtil.run.mockRejectedValueOnce(new Error('DB update failed'));

        const result = await calculateArrears(1);
        expect(result.success).toBe(false);
        expect(result.message).toContain("Error al actualizar la mora en la base de datos: DB update failed");
    });

     // Test Case 7: Company info not found or rate is invalid (fallback to 0.001)
     test('should use fallback rate if company info rate is invalid or not found', async () => {
        const pastDate = DateTime.now().minus({ days: 10 }).startOf('day').toISODate();
        dbUtil.get.mockResolvedValueOnce(null); // No company_info
        dbUtil.get.mockResolvedValueOnce({ 
            amount_due: 500, amount_paid: 0, due_date: pastDate, status: 'overdue', interest_on_arrears: 0 
        });
        dbUtil.run.mockResolvedValueOnce({ changes: 1 });

        const result = await calculateArrears(1);
        expect(result.success).toBe(true);
        expect(result.daysOverdue).toBe(9); // Corrected expectation
        expect(result.arrearsAmount).toBeCloseTo(4.50, 2); // 500 * 0.001 (fallback rate) * 9 = 4.50
        expect(dbUtil.run).toHaveBeenCalledWith(
            'UPDATE loan_installments SET interest_on_arrears = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [4.50, 1]
        );
    });
});
