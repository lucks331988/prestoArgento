// __tests__/unit/loanManager.test.js
const { calculateLoanDetails } = require('../../src/main/loanManager'); // Adjust path as needed
const { DateTime } = require('luxon'); // Required by loanManager

describe('loanManager.calculateLoanDetails', () => {
    // Test case 1: Monthly loan with interest
    test('should correctly calculate details for a monthly loan with interest', () => {
        const principal = 1000;
        const monthlyRate = 0.10; // 10% monthly
        const term = 3; // 3 months
        const startDate = '2024-01-01';
        const details = calculateLoanDetails(principal, monthlyRate, term, 'monthly', startDate);

        // For P=1000, I=10%, N=3: Installment = 1000 * [0.1 * (1+0.1)^3] / [(1+0.1)^3 - 1]
        // Installment = 1000 * [0.1 * 1.331] / [1.331 - 1] = 1000 * 0.1331 / 0.331 = 133.1 / 0.331 = 402.1148...
        // Rounded to 402.11
        // Total Due = 402.11 * 3 = 1206.33
        // Total Interest = 1206.33 - 1000 = 206.33
        expect(details.numberOfInstallments).toBe(3);
        expect(details.actualInstallmentAmount).toBeCloseTo(402.11, 2); 
        expect(details.totalAmountDue).toBeCloseTo(1206.33, 2);
        expect(details.totalInterest).toBeCloseTo(206.33, 2);
        expect(details.installments.length).toBe(3);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });

    // Test case 2: Daily loan with interest (calculated installment)
    test('should correctly calculate details for a daily loan with interest', () => {
        const principal = 1000;
        const dailyRate = 0.01; // 1% daily
        const term = 10; // 10 days
        const startDate = '2024-01-01';
        const details = calculateLoanDetails(principal, dailyRate, term, 'daily', startDate);
        
        // Interest = 1000 * 0.01 * 10 = 100. Total Due = 1100. Installment = 110.
        expect(details.numberOfInstallments).toBe(10);
        expect(details.actualInstallmentAmount).toBeCloseTo(110.00, 2);
        expect(details.totalAmountDue).toBeCloseTo(1100.00, 2);
        expect(details.totalInterest).toBeCloseTo(100.00, 2);
        expect(details.installments.length).toBe(10);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });

    // Test case 3: Daily loan with fixed installment amount
    test('should correctly calculate details for a daily loan with a fixed installment amount', () => {
        const principal = 1000;
        const dailyRate = 0.01; // 1% daily
        const term = 10; // This term is initially for interest calculation
        const startDate = '2024-01-01';
        const fixedInstallment = 150;
        const details = calculateLoanDetails(principal, dailyRate, term, 'daily', startDate, fixedInstallment);

        // Total Interest = 1000 * 0.01 * 10 = 100 (assuming interest calc still uses original term for simple interest)
        // Total Due = 1000 + 100 = 1100
        // Number of Installments = ceil(1100 / 150) = ceil(7.33) = 8 installments
        // Actual Installment = 150
        expect(details.numberOfInstallments).toBe(8); // 7 installments of 150, last one 50
        expect(details.actualInstallmentAmount).toBeCloseTo(150.00, 2);
        expect(details.totalAmountDue).toBeCloseTo(1100.00, 2); // (150*7 + 50) = 1050 + 50 = 1100
        expect(details.totalInterest).toBeCloseTo(100.00, 2);
        expect(details.installments.length).toBe(8);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
        expect(details.installments[7].amount_due).toBeCloseTo(50.00, 2); // Last installment check
    });

    // Test case 4: Monthly loan with zero interest
    test('should correctly calculate details for a monthly loan with zero interest', () => {
        const principal = 1200;
        const monthlyRate = 0; // 0% monthly
        const term = 4; // 4 months
        const startDate = '2024-01-01';
        const details = calculateLoanDetails(principal, monthlyRate, term, 'monthly', startDate);

        // Installment = 1200 / 4 = 300
        // Total Due = 1200
        // Total Interest = 0
        expect(details.numberOfInstallments).toBe(4);
        expect(details.actualInstallmentAmount).toBeCloseTo(300.00, 2);
        expect(details.totalAmountDue).toBeCloseTo(1200.00, 2);
        expect(details.totalInterest).toBeCloseTo(0.00, 2);
        expect(details.installments.length).toBe(4);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });

    // Test case 5: Monthly loan, 1-month term
    test('should correctly calculate details for a monthly loan with a 1-month term', () => {
        const principal = 500;
        const monthlyRate = 0.05; // 5% monthly
        const term = 1; // 1 month
        const startDate = '2024-03-01';
        const details = calculateLoanDetails(principal, monthlyRate, term, 'monthly', startDate);

        // Interest = 500 * 0.05 = 25
        // Total Due = 500 + 25 = 525
        // Installment = 525
        expect(details.numberOfInstallments).toBe(1);
        expect(details.actualInstallmentAmount).toBeCloseTo(525.00, 2);
        expect(details.totalAmountDue).toBeCloseTo(525.00, 2);
        expect(details.totalInterest).toBeCloseTo(25.00, 2);
        expect(details.installments.length).toBe(1);
        expect(details.installments[0].amount_due).toBeCloseTo(525.00, 2);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });

    // Test case 6: Daily loan, 1-day term
    test('should correctly calculate details for a daily loan with a 1-day term', () => {
        const principal = 200;
        const dailyRate = 0.02; // 2% daily
        const term = 1; // 1 day
        const startDate = '2024-03-01';
        const details = calculateLoanDetails(principal, dailyRate, term, 'daily', startDate);

        // Interest = 200 * 0.02 * 1 = 4
        // Total Due = 200 + 4 = 204
        // Installment = 204
        expect(details.numberOfInstallments).toBe(1);
        expect(details.actualInstallmentAmount).toBeCloseTo(204.00, 2);
        expect(details.totalAmountDue).toBeCloseTo(204.00, 2);
        expect(details.totalInterest).toBeCloseTo(4.00, 2);
        expect(details.installments.length).toBe(1);
        expect(details.installments[0].amount_due).toBeCloseTo(204.00, 2);
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });

    // Test case 7: Daily loan, fixed installment greater than total due
    test('should result in 1 installment if fixed installment is greater than total due', () => {
        const principal = 300;
        const dailyRate = 0.01; // 1% daily
        const term = 5; // 5 days for interest calculation
        const startDate = '2024-03-01';
        const fixedInstallment = 400; // Fixed installment is greater than total due
        const details = calculateLoanDetails(principal, dailyRate, term, 'daily', startDate, fixedInstallment);

        // Interest = 300 * 0.01 * 5 = 15
        // Total Due = 300 + 15 = 315
        // Since fixedInstallment (400) > totalDue (315), it should be 1 installment of 315
        expect(details.numberOfInstallments).toBe(1); 
        // The 'actualInstallmentAmount' in this specific logic branch of calculateLoanDetails
        // still reflects the 'fixedInstallment' if provided, even if the last (and only) installment is adjusted.
        // This behavior could be debated, but we test the current logic.
        expect(details.actualInstallmentAmount).toBeCloseTo(fixedInstallment, 2); 
        expect(details.totalAmountDue).toBeCloseTo(315.00, 2);
        expect(details.totalInterest).toBeCloseTo(15.00, 2);
        expect(details.installments.length).toBe(1);
        expect(details.installments[0].amount_due).toBeCloseTo(315.00, 2); // The only installment should be the total due
        const sumOfInstallments = details.installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        expect(sumOfInstallments).toBeCloseTo(details.totalAmountDue, 2);
    });
});
