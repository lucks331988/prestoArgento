// src/main/loanManager.js
const dbUtil = require('./database');
const { DateTime } = require('luxon'); // Para manejo de fechas robusto
const PdfPrinter = require('pdfmake');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Configuración de PdfPrinter y fuentes (similar a paymentManager)
const resourcesPath = process.env.NODE_ENV === 'development' ? path.join(__dirname, '../..') : process.resourcesPath;
const fonts = {
    Roboto: {
        normal: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Regular.ttf'),
        bold: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Medium.ttf'),
        italics: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Italic.ttf'),
        bolditalics: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-MediumItalic.ttf')
    }
};
const printer = new PdfPrinter(fonts);

const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const contractsBasePath = path.join(prestoArgentoDataPath, 'contracts'); // contracts/loan_ID/contract.pdf

// Asegurar que el directorio de contratos exista
if (!fs.existsSync(contractsBasePath)) {
    fs.mkdirSync(contractsBasePath, { recursive: true });
}


/**
 * Calcula los detalles de un préstamo, incluyendo cuotas.
 * @param {number} principal - Monto capital.
 * @param {number} effectivePeriodRate - Tasa de interés EFECTIVA para el período de la cuota (ej. 0.01 para 1% diario, 0.10 para 10% mensual).
 * @param {number} term - Duración (en meses para mensual, en días para diario).
 * @param {string} loanType - 'monthly' o 'daily'.
 * @param {string} startDateString - Fecha de inicio 'YYYY-MM-DD'.
 * @param {number} [fixedInstallmentAmount] - Opcional, si la cuota es fija (préstamo diario puede tenerla)
 * @returns {object} - { installments: [], totalInterest, totalAmountDue, actualInstallmentAmount, numberOfInstallments }
 */
function calculateLoanDetails(principal, effectivePeriodRate, term, loanType, startDateString, fixedInstallmentAmount = null) {
    const startDate = DateTime.fromISO(startDateString);
    let installments = [];
    let totalInterest = 0;
    let totalAmountDue = 0;
    let actualInstallmentAmount = 0; // La cuota base o más frecuente
    let numberOfInstallments = 0;

    if (loanType === 'monthly') {
        numberOfInstallments = term; // 'term' es en meses
        const monthlyRate = effectivePeriodRate; // La tasa que llega ya es mensual

        if (monthlyRate === 0) { // Préstamo sin interés
            actualInstallmentAmount = parseFloat((principal / numberOfInstallments).toFixed(2));
            totalInterest = 0;
        } else {
            // Fórmula de cuota fija (Anualidad) - Préstamo Francés
            // I = Tasa de interés periódica (mensual en este caso)
            // N = Número total de períodos (meses)
            // C = P * [ I * (1+I)^N ] / [ (1+I)^N – 1]
            actualInstallmentAmount = parseFloat(
                (principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfInstallments))) /
                (Math.pow(1 + monthlyRate, numberOfInstallments) - 1)
            .toFixed(2));
            
            totalInterest = parseFloat(((actualInstallmentAmount * numberOfInstallments) - principal).toFixed(2));
        }
        
        totalAmountDue = parseFloat((principal + totalInterest).toFixed(2));

        let remainingBalance = principal;
        for (let i = 1; i <= numberOfInstallments; i++) {
            const dueDate = startDate.plus({ months: i });
            let interestForPeriod = 0;
            let principalForPeriod = 0;
            let currentInstallment = actualInstallmentAmount;

            if (monthlyRate > 0) {
                interestForPeriod = parseFloat((remainingBalance * monthlyRate).toFixed(2));
                // El capital de esta cuota es la cuota total menos el interés de esta cuota
                principalForPeriod = parseFloat((currentInstallment - interestForPeriod).toFixed(2)); 
            } else {
                interestForPeriod = 0;
                principalForPeriod = currentInstallment;
            }
            
            // Ajuste para la última cuota para cuadrar exactamente con el capital restante
            if (i === numberOfInstallments) {
                principalForPeriod = parseFloat(remainingBalance.toFixed(2));
                currentInstallment = parseFloat((principalForPeriod + interestForPeriod).toFixed(2)); // La cuota puede variar ligeramente
            }

            installments.push({
                installment_number: i,
                due_date: dueDate.toISODate(),
                amount_due: currentInstallment,
            });
            remainingBalance -= principalForPeriod;
        }

    } else if (loanType === 'daily') {
        // Préstamo Diario
        // effectivePeriodRate aquí es la TASA DIARIA EFECTIVA (ej. 0.01 para 1% diario)
        // 'term' es la cantidad de DÍAS.
        numberOfInstallments = term;
        totalInterest = parseFloat((principal * effectivePeriodRate * numberOfInstallments).toFixed(2)); // Interés simple total
        totalAmountDue = parseFloat((principal + totalInterest).toFixed(2));

        if (fixedInstallmentAmount && fixedInstallmentAmount > 0) {
            actualInstallmentAmount = parseFloat(fixedInstallmentAmount.toFixed(2));
            // Recalcular número de cuotas si la cuota es fija y podría no cubrir el total en 'term' días
            // o si el plazo es implícito por la cantidad de cuotas fijas.
            // Para este modelo, asumimos que 'term' es el número de cuotas si fixedInstallmentAmount está dado.
            numberOfInstallments = Math.ceil(totalAmountDue / actualInstallmentAmount);

            let sumPaid = 0;
            for (let i = 1; i <= numberOfInstallments; i++) {
                const dueDate = startDate.plus({ days: i });
                let currentAmount = actualInstallmentAmount;
                if (i === numberOfInstallments) { // Última cuota ajustada
                    currentAmount = parseFloat((totalAmountDue - sumPaid).toFixed(2));
                }
                installments.push({
                    installment_number: i,
                    due_date: dueDate.toISODate(),
                    amount_due: currentAmount,
                });
                sumPaid += currentAmount;
            }
        } else { // Si no hay cuota fija, se divide el total en el número de días del plazo
            actualInstallmentAmount = parseFloat((totalAmountDue / numberOfInstallments).toFixed(2));
            let sumOfInstallments = 0;
            for (let i = 1; i <= numberOfInstallments; i++) {
                const dueDate = startDate.plus({ days: i });
                let currentInstallmentAmt = actualInstallmentAmount;
                if (i === numberOfInstallments) { // Ajustar última cuota por redondeo
                    currentInstallmentAmt = parseFloat((totalAmountDue - sumOfInstallments).toFixed(2));
                }
                installments.push({
                    installment_number: i,
                    due_date: dueDate.toISODate(),
                    amount_due: currentInstallmentAmt,
                });
                sumOfInstallments += currentInstallmentAmt;
            }
        }
    } else {
        throw new Error("Tipo de préstamo no soportado para cálculo.");
    }
    
    // Verificación final y ajuste de la última cuota para cuadrar exactamente
    if (installments.length > 0) {
        const sumOfCalculatedInstallments = installments.reduce((sum, inst) => sum + inst.amount_due, 0);
        const difference = parseFloat((totalAmountDue - sumOfCalculatedInstallments).toFixed(2));
        if (Math.abs(difference) > 0.001 && installments.length > 0) { // Pequeño umbral para evitar ajustes innecesarios por precisión flotante
            installments[installments.length - 1].amount_due = parseFloat((installments[installments.length - 1].amount_due + difference).toFixed(2));
        }
    }

    return {
        installments,
        totalInterest: parseFloat(totalInterest.toFixed(2)),
        totalAmountDue: parseFloat(totalAmountDue.toFixed(2)),
        actualInstallmentAmount: parseFloat(actualInstallmentAmount.toFixed(2)),
        numberOfInstallments
    };
}


/**
 * Registra un nuevo préstamo y sus cuotas.
 * @param {object} loanData - { client_id, loan_type, principal_amount, interest_rate (efectiva para el período), term_duration, start_date, guarantor_*, notes, fixed_installment_amount (opcional para diario) }
 * @param {number} userId - ID del usuario que crea el préstamo.
 * @returns {Promise<object>}
 */
async function registerLoan(loanData, userId) {
    const {
        client_id, loan_type, principal_amount, interest_rate, term_duration, start_date,
        guarantor_first_name, guarantor_last_name, guarantor_dni, guarantor_phone, guarantor_address,
        notes, fixed_installment_amount // Nuevo campo para cuota fija en préstamos diarios
    } = loanData;

    if (!client_id || !loan_type || !principal_amount || interest_rate === undefined || !term_duration || !start_date) {
        return { success: false, message: "Faltan datos obligatorios para el préstamo." };
    }
    if (principal_amount <= 0) return { success: false, message: "El monto del préstamo debe ser positivo." };
    if (term_duration <= 0) return { success: false, message: "La duración del préstamo debe ser positiva." };

    // 'interest_rate' que llega es la tasa efectiva para el período (diaria si loan_type='daily', mensual si loan_type='monthly')
    const calculatedDetails = calculateLoanDetails(
        principal_amount,
        interest_rate, 
        term_duration,
        loan_type,
        start_date,
        loan_type === 'daily' ? fixed_installment_amount : null // Pasar cuota fija solo para diarios
    );

    try {
        await dbUtil.run('BEGIN TRANSACTION');

        const loanResult = await dbUtil.run(
            `INSERT INTO loans (client_id, loan_type, principal_amount, interest_rate, term_duration, 
                                total_interest, total_amount_due, installment_amount, number_of_installments, 
                                start_date, created_by_user_id, status,
                                guarantor_first_name, guarantor_last_name, guarantor_dni, guarantor_phone, guarantor_address, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                client_id, loan_type, principal_amount, interest_rate, calculatedDetails.numberOfInstallments, // Usar numberOfInstallments calculado si la cuota es fija
                calculatedDetails.totalInterest, calculatedDetails.totalAmountDue,
                calculatedDetails.actualInstallmentAmount, calculatedDetails.numberOfInstallments,
                start_date, userId, 'active',
                guarantor_first_name || null, guarantor_last_name || null, guarantor_dni || null, guarantor_phone || null, guarantor_address || null,
                notes || null
            ]
        );

        const loanId = loanResult.lastID;
        if (!loanId) {
            await dbUtil.run('ROLLBACK');
            return { success: false, message: 'Error al guardar el préstamo principal.' };
        }

        for (const inst of calculatedDetails.installments) {
            await dbUtil.run(
                'INSERT INTO loan_installments (loan_id, installment_number, due_date, amount_due) VALUES (?, ?, ?, ?)',
                [loanId, inst.installment_number, inst.due_date, inst.amount_due]
            );
        }

        await dbUtil.run('COMMIT');
        return { 
            success: true, 
            loanId, 
            message: 'Préstamo registrado exitosamente con sus cuotas.',
            details: calculatedDetails 
        };

    } catch (error) {
        await dbUtil.run('ROLLBACK');
        console.error('Error en registerLoan:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Obtiene todos los préstamos con información básica del cliente.
 * @param {object} filters - Opcional: { status, clientId, loanType, dateFrom, dateTo }
 * @returns {Promise<Array<object>>}
 */
async function getAllLoans(filters = {}) {
    try {
        let params = [];
        let sql = `
            SELECT 
                l.id, l.client_id, c.first_name as client_first_name, c.last_name as client_last_name, c.dni as client_dni,
                l.loan_type, l.principal_amount, l.interest_rate, l.term_duration, l.total_amount_due,
                l.number_of_installments, l.installment_amount, l.start_date, l.status, l.created_at
            FROM loans l
            JOIN clients c ON l.client_id = c.id
        `;
        
        let whereClauses = [];
        if (filters.status) { whereClauses.push('l.status = ?'); params.push(filters.status); }
        if (filters.clientId) { whereClauses.push('l.client_id = ?'); params.push(filters.clientId); }
        if (filters.loanType) { whereClauses.push('l.loan_type = ?'); params.push(filters.loanType); }
        if (filters.dateFrom) { whereClauses.push('date(l.start_date) >= date(?)'); params.push(filters.dateFrom); }
        if (filters.dateTo) { whereClauses.push('date(l.start_date) <= date(?)'); params.push(filters.dateTo); }

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }
        sql += ' ORDER BY l.start_date DESC, l.id DESC';

        const loans = await dbUtil.all(sql, params);
        return loans;
    } catch (error) {
        console.error('Error en getAllLoans:', error);
        throw error;
    }
}

/**
 * Obtiene un préstamo por su ID, incluyendo todas sus cuotas.
 * @param {number} loanId
 * @returns {Promise<object|null>}
 */
async function getLoanById(loanId) {
    try {
        const loan = await dbUtil.get(
            `SELECT l.*, c.first_name as client_first_name, c.last_name as client_last_name, c.dni as client_dni 
             FROM loans l 
             JOIN clients c ON l.client_id = c.id
             WHERE l.id = ?`, [loanId]
        );
        if (!loan) return null;

        const installments = await dbUtil.all(
            'SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number ASC',
            [loanId]
        );
        loan.installments = installments;
        return loan;
    } catch (error) {
        console.error('Error en getLoanById:', error);
        throw error;
    }
}

/**
 * Actualiza el estado de un préstamo.
 * @param {number} loanId
 * @param {string} newStatus
 * @param {number} userId - ID del usuario que realiza la acción.
 * @returns {Promise<object>}
 */
async function updateLoanStatus(loanId, newStatus, userId) {
    const validStatuses = ['active', 'paid', 'overdue', 'defaulted', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
        return { success: false, message: 'Estado de préstamo no válido.' };
    }
    try {
        const result = await dbUtil.run(
            'UPDATE loans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, loanId]
        );
        if (result.changes > 0) {
            return { success: true, message: `Estado del préstamo actualizado a ${newStatus}.` };
        }
        return { success: false, message: 'Préstamo no encontrado o estado sin cambios.' };
    } catch (error) {
        console.error('Error en updateLoanStatus:', error);
        return { success: false, message: `Error interno: ${error.message}` };
    }
}

/**
 * Genera el contrato de préstamo en PDF.
 * @param {number} loanId
 * @returns {Promise<object>} - { success: boolean, filePath: string|null, message: string }
 */
async function generateLoanContract(loanId) {
    try {
        const loan = await getLoanById(loanId);
        if (!loan) return { success: false, filePath: null, message: "Préstamo no encontrado." };
        const client = await dbUtil.get("SELECT * FROM clients WHERE id = ?", [loan.client_id]);
        if (!client) return { success: false, filePath: null, message: "Cliente no encontrado." };
        const companyInfo = await dbUtil.get("SELECT * FROM company_info WHERE id = 1") || {};
        const today = DateTime.now();

        const numberToWords = num => num.toString(); // Placeholder simple

        let installmentsTableBody = [
            [{text: 'N° Cuota', style: 'tableHeader'}, {text: 'Vencimiento', style: 'tableHeader'}, {text: 'Monto', style: 'tableHeader'}]
        ];
        if (loan.installments) {
            loan.installments.forEach(inst => {
                installmentsTableBody.push([
                    inst.installment_number.toString(),
                    DateTime.fromISO(inst.due_date).toFormat('dd/MM/yyyy'),
                    inst.amount_due.toLocaleString('es-AR', {style:'currency', currency:'ARS'})
                ]);
            });
        }

        const docDefinition = {
            pageSize: 'A4', pageMargins: [40, 60, 40, 60],
            header: { text: `Contrato N° ${loan.id} - ${companyInfo.name || 'Presto Argento'}`, alignment: 'center', fontSize: 9, italics: true, margin: [0, 30, 0, 0] },
            footer: (currentPage, pageCount) => ({ text: `Página ${currentPage} de ${pageCount}`, alignment: 'center', fontSize: 9, margin: [0,0,0,30]}),
            content: [
                { text: 'CONTRATO DE PRÉSTAMO PERSONAL', style: 'contractTitle', alignment: 'center', margin: [0, 0, 0, 20] },
                { text: `En ${companyInfo.address ? companyInfo.address.split(',').pop().trim() : '__________'}, a ${today.toFormat("dd 'de' MMMM 'de' yyyy")}.`, margin: [0,0,0,15]},
                { text: 'PARTES:', style: 'sectionTitle' },
                { ol: [ `${companyInfo.name || 'Presto Argento'}, CUIT ${companyInfo.cuit || '__________'}, con domicilio en ${companyInfo.address || '__________'}, "EL PRESTAMISTA".`, `${client.first_name} ${client.last_name}, DNI ${client.dni}, con domicilio en ${client.address || '__________'}, "EL DEUDOR".`, ...(loan.guarantor_dni ? [`${loan.guarantor_first_name || ''} ${loan.guarantor_last_name || ''}, DNI ${loan.guarantor_dni || '__________'}, con domicilio en ${loan.guarantor_address || '__________'}, "EL GARANTE".`] : []) ], margin: [0,0,0,15]},
                { text: 'CLÁUSULAS:', style: 'sectionTitle' },
                { text: [{text: '1. OBJETO: ', bold: true}, `EL PRESTAMISTA otorga a EL DEUDOR $${loan.principal_amount.toLocaleString('es-AR')} (${numberToWords(loan.principal_amount)} pesos).`], margin:[0,0,0,10], alignment: 'justify' },
                { text: [{text: '2. DEVOLUCIÓN: ', bold: true}, `${loan.number_of_installments} cuotas de $${loan.installment_amount.toLocaleString('es-AR')} (${numberToWords(loan.installment_amount)} pesos) c/u. Tasa ${loan.loan_type === 'daily' ? 'diaria' : 'mensual'} del ${(loan.interest_rate * 100).toFixed(2)}%. Total a devolver $${loan.total_amount_due.toLocaleString('es-AR')}. Primer vcto: ${DateTime.fromISO(loan.installments[0].due_date).toFormat('dd/MM/yyyy')}.`], margin:[0,0,0,10], alignment: 'justify' },
                { text: 'PLAN DE PAGOS:', style: 'subsectionTitle'}, { table: { body: installmentsTableBody, widths: ['auto', '*', 'auto'] }, layout: 'lightHorizontalLines', margin:[0,0,0,10]},
                { text: [{text: '3. MORA: ', bold: true}, `Interés punitorio diario del [DEFINIR TASA MORA]% sobre saldos impagos.`], margin:[0,0,0,10], alignment: 'justify' },
                // ... (Más cláusulas)
                { text: 'Firmas ...', margin: [0,30,0,0] }, // Placeholder firmas
                 {
                    columns: [
                        { stack: [ {text: '\n\n\n_________________________', alignment: 'center'}, {text: 'FIRMA DEUDOR', alignment: 'center'}, {text: `${client.first_name} ${client.last_name}`, alignment: 'center'}, {text: `DNI: ${client.dni}`, alignment: 'center'} ] },
                        { stack: [ {text: '\n\n\n_________________________', alignment: 'center'}, {text: 'FIRMA PRESTAMISTA', alignment: 'center'}, {text: `${companyInfo.name || 'Presto Argento'}`, alignment: 'center'} ] },
                        ...(loan.guarantor_dni ? 
                            [{ stack: [ {text: '\n\n\n_________________________', alignment: 'center'}, {text: 'FIRMA GARANTE', alignment: 'center'}, {text: `${loan.guarantor_first_name || ''} ${loan.guarantor_last_name || ''}`, alignment: 'center'}, {text: `DNI: ${loan.guarantor_dni}`, alignment: 'center'} ] }] 
                            : [{text:''}] 
                        )
                    ], columnGap: 10, margin: [0, 20, 0, 0]
                }
            ],
            styles: { contractTitle: { fontSize: 16, bold: true }, sectionTitle: { fontSize: 12, bold: true, margin: [0,10,0,5] }, subsectionTitle: { fontSize: 11, bold: true, margin: [0,8,0,3] }, tableHeader: { bold: true, fontSize: 9, fillColor: '#eeeeee' } },
            defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 }
        };

        const loanContractsPath = path.join(contractsBasePath, `loan_${loan.id}`);
        if (!fs.existsSync(loanContractsPath)) fs.mkdirSync(loanContractsPath, { recursive: true });
        const contractFilePath = path.join(loanContractsPath, `contrato_prestamo_${loan.id}_cliente_${client.dni}_${Date.now()}.pdf`);
        
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const writeStream = fs.createWriteStream(contractFilePath);
        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => resolve({ success: true, filePath: contractFilePath, message: 'Contrato PDF generado.' }));
            writeStream.on('error', (err) => { console.error("Error escribiendo PDF contrato:", err); reject({ success: false, filePath: null, message: `Error PDF: ${err.message}` }); });
        });
    } catch (error) {
        console.error('Error en generateLoanContract:', error);
        return { success: false, filePath: null, message: `Error interno generando contrato: ${error.message}` };
    }
}

module.exports = {
    calculateLoanDetails,
    registerLoan,
    getAllLoans,
    getLoanById,
    updateLoanStatus,
    generateLoanContract
};