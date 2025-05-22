// src/main/paymentManager.js
const path = require('path');
const fs = require('fs');
const dbUtil = require('./database');
const { DateTime } = require('luxon');
const PdfPrinter = require('pdfmake');
const { app } = require('electron');

// Configuración de rutas para recibos
const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const receiptsBasePath = path.join(prestoArgentoDataPath, 'receipts'); // receipts/loan_ID/receipt_paymentID.pdf

// Asegurar que el directorio de recibos exista
if (!fs.existsSync(receiptsBasePath)) {
    fs.mkdirSync(receiptsBasePath, { recursive: true });
}

// Configuración básica para pdfmake (fuentes)
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


/**
 * Genera un recibo de pago en PDF.
 * @param {object} paymentDetails - { payment_id, client_name, client_dni, payment_amount, payment_date_iso, payment_method, notes }
 * @param {object} loanDetails - { id, year, principal_amount, number_of_installments, installment_amount }
 * @param {object} installmentDetails - { installment_number, due_date, amount_due, interest_on_arrears }
 * @param {object} companyInfo - { name, cuit, address, phone, email }
 * @param {string} operatorUsername - Nombre del usuario operador.
 * @returns {Promise<string|null>} - Ruta al archivo PDF generado o null en caso de error.
 */
async function generatePaymentReceipt(paymentDetails, loanDetails, installmentDetails, companyInfo, operatorUsername) {
    const loanReceiptDir = path.join(receiptsBasePath, `loan_${loanDetails.id}`);
    if (!fs.existsSync(loanReceiptDir)) {
        fs.mkdirSync(loanReceiptDir, { recursive: true });
    }
    const receiptFileName = `recibo_pago_${paymentDetails.payment_id}_${Date.now()}.pdf`;
    const receiptPath = path.join(loanReceiptDir, receiptFileName);

    const paymentDateOnlyFormatted = DateTime.fromISO(paymentDetails.payment_date_iso).toFormat("dd/MM/yyyy");
    const paymentTimeFormatted = DateTime.fromISO(paymentDetails.payment_date_iso).toFormat("hh:mm a");
    const emissionDateTimeFormatted = DateTime.now().toFormat("dd/MM/yyyy HH:mm:ss");
    const loanNumberFormatted = `PR-${loanDetails.year || new Date().getFullYear()}-${String(loanDetails.id).padStart(5, '0')}`;
    const installmentDueDateFormatted = DateTime.fromISO(installmentDetails.due_date).toFormat('dd/MM/yyyy');

    const paymentMethodTranslations = {
        cash: 'Efectivo',
        transfer: 'Transferencia',
        debit_card: 'Tarjeta de Débito',
        credit_card: 'Tarjeta de Crédito',
        other: 'Otro'
    };
    const paymentMethodDisplay = paymentMethodTranslations[paymentDetails.payment_method] || paymentDetails.payment_method || 'No especificado';

    const docDefinition = {
        content: [
            { text: '📄 Comprobante de Pago de Cuota de Préstamo', style: 'mainTitle', alignment: 'center', margin: [0, 0, 0, 20] },
            
            { text: `Recibo N°: P-${paymentDetails.payment_id}`, alignment: 'right' },
            { text: `Fecha de Emisión: ${emissionDateTimeFormatted}`, alignment: 'right', margin: [0, 0, 0, 15] },

            { text: 'Datos del Cliente:', style: 'sectionHeader' },
            { text: `Nombre del Cliente: ${paymentDetails.client_name}` },
            { text: `DNI: ${paymentDetails.client_dni}`, margin: [0, 0, 0, 10] },

            { text: 'Información del Préstamo:', style: 'sectionHeader' },
            { text: `Número de Préstamo: ${loanNumberFormatted}`, margin: [0, 0, 0, 10] },

            { text: '💰 Detalle del Pago:', style: 'sectionHeader' },
            {
                ul: [
                    `Monto Total del Préstamo: ${loanDetails.principal_amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`,
                    `Cuotas Totales: ${loanDetails.number_of_installments}`,
                    `Cuota N.º: ${installmentDetails.installment_number} de ${loanDetails.number_of_installments}`,
                    `Monto de la Cuota: ${loanDetails.installment_amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`,
                    `Intereses incluidos: Sí`,
                    `Fecha de Vencimiento de la Cuota: ${installmentDueDateFormatted}`,
                    `Fecha de Pago: ${paymentDateOnlyFormatted}`, // As per spec, though also in header
                    `Recargo por atraso: ${parseFloat(installmentDetails.interest_on_arrears || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`,
                    { text: `Monto Total Pagado: ${paymentDetails.payment_amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`, style: 'amountPaid', bold: true }
                ], margin: [0, 0, 0, 10]
            },
            
            { text: 'Forma de Pago:', style: 'sectionHeaderNoMargin' },
            { text: paymentMethodDisplay, margin: [0,0,0,10]},

            { text: 'Operador:', style: 'sectionHeaderNoMargin' },
            { text: operatorUsername || 'N/A', margin: [0,0,0,10]},

            { text: '✅ Observaciones:', style: 'sectionHeaderNoMargin' },
            { text: paymentDetails.notes ? `${paymentDetails.notes}\nGracias por su pago. Recuerde conservar este comprobante.` : 'Gracias por su pago. Recuerde conservar este comprobante.', margin: [0,0,0,20] },
            
            { text: '💼 Información del Emisor:', style: 'sectionHeader' },
            { text: `Empresa: ${companyInfo.name || 'Créditos TuAyuda'}` },
            { text: `CUIT: ${companyInfo.cuit || '30-71589745-4'}` },
            { text: `Dirección: ${companyInfo.address || 'Av. San Martín 456, El Colorado, Formosa'}` },
            { text: `Teléfono: ${companyInfo.phone || '(370) 123-4567'}` },
            { text: `Email: ${companyInfo.email || 'contacto@tuayuda.com'}`, margin: [0,0,0,25] },
            
            { text: '_________________________', alignment: 'center', margin: [0, 20, 0, 0] },
            { text: 'Firma y Aclaración (Emisor)', alignment: 'center' },
        ],
        styles: {
            mainTitle: { fontSize: 18, bold: true },
            header: { fontSize: 16, bold: true }, // Kept for potential future use
            subheader: { fontSize: 9, italics: true }, // Kept for potential future use
            title: { fontSize: 14, bold: true }, // Kept for potential future use
            sectionHeader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
            sectionHeaderNoMargin: { fontSize: 12, bold: true, margin: [0, 0, 0, 2] },
            amountPaid: { fontSize: 13, bold: true }
        },
        defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.3 }
    };

    try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const writeStream = fs.createWriteStream(receiptPath);
        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => resolve(receiptPath));
            writeStream.on('error', (err) => {
                console.error("Error escribiendo PDF de recibo:", err);
                reject(err);
            });
        });
    } catch (error) {
        console.error("Error generando PDF de recibo:", error);
        return null;
    }
}


/**
 * Registra un pago para una cuota.
 * @param {object} paymentData - { loan_installment_id, payment_amount, payment_date_iso (YYYY-MM-DDTHH:MM:SSZ), payment_method, notes }
 * @param {number} userId - ID del usuario que registra el pago.
 * @returns {Promise<object>}
 */
async function recordPayment(paymentData, userId) {
    const { loan_installment_id, payment_amount, payment_date_iso, payment_method, notes } = paymentData;

    if (!loan_installment_id || !payment_amount || payment_amount <= 0 || !payment_date_iso) {
        return { success: false, message: "Faltan datos obligatorios para el pago o el monto es inválido." };
    }

    try {
        const installment = await dbUtil.get(
            `SELECT li.*, l.client_id, l.id as loan_main_id
             FROM loan_installments li
             JOIN loans l ON li.loan_id = l.id
             WHERE li.id = ?`,
            [loan_installment_id]
        );

        if (!installment) {
            return { success: false, message: 'Cuota no encontrada.' };
        }
        if (installment.status === 'paid') {
            return { success: false, message: 'Esta cuota ya ha sido pagada en su totalidad.' };
        }

        const totalOwedForInstallment = parseFloat(installment.amount_due) + parseFloat(installment.interest_on_arrears || 0);
        const currentPaidAmount = parseFloat(installment.amount_paid || 0);
        const remainingDebtForInstallment = parseFloat((totalOwedForInstallment - currentPaidAmount).toFixed(2));
        
        if (payment_amount > remainingDebtForInstallment + 0.01) { // 0.01 de margen por redondeos
            return { success: false, message: `El monto del pago (${payment_amount.toFixed(2)}) excede el saldo pendiente de la cuota (${remainingDebtForInstallment.toFixed(2)}). Considere registrar la mora primero si aplica.` };
        }

        await dbUtil.run('BEGIN TRANSACTION');

        const paymentResult = await dbUtil.run(
            `INSERT INTO payments (loan_installment_id, loan_id, client_id, payment_amount, payment_date, payment_method, notes, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [loan_installment_id, installment.loan_main_id, installment.client_id, payment_amount, payment_date_iso, payment_method || null, notes || null, userId]
        );
        const paymentId = paymentResult.lastID;

        if (!paymentId) {
            await dbUtil.run('ROLLBACK');
            return { success: false, message: 'Error al registrar el pago en la base de datos.' };
        }

        const newTotalPaidForInstallment = parseFloat((currentPaidAmount + payment_amount).toFixed(2));
        let newInstallmentStatus = installment.status;

        if (newTotalPaidForInstallment >= totalOwedForInstallment - 0.01) { 
            newInstallmentStatus = 'paid';
        } else if (newTotalPaidForInstallment > 0) {
            newInstallmentStatus = 'partially_paid';
        }
        // El estado 'overdue' se maneja por un proceso que verifique fechas de vencimiento vs hoy.

        await dbUtil.run(
            'UPDATE loan_installments SET amount_paid = ?, status = ?, payment_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newTotalPaidForInstallment, newInstallmentStatus, payment_date_iso, loan_installment_id]
        );

        // Verificar si todo el préstamo está pagado
        if (newInstallmentStatus === 'paid') {
            const unpaidInstallments = await dbUtil.get(
                "SELECT COUNT(*) as count FROM loan_installments WHERE loan_id = ? AND status != 'paid'",
                [installment.loan_main_id]
            );
            if (unpaidInstallments.count === 0) {
                await dbUtil.run("UPDATE loans SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [installment.loan_main_id]);
                console.log(`Préstamo ${installment.loan_main_id} marcado como pagado.`);
            }
        }
        
        let receiptPath = null;
        try {
            // Fetch all necessary data for the new receipt format
            const currentInstallmentDetails = await dbUtil.get(
                `SELECT id as installment_db_id, loan_id, installment_number, due_date, amount_due, interest_on_arrears 
                 FROM loan_installments WHERE id = ?`,
                [loan_installment_id]
            );

            const loanDetailsFromDb = await dbUtil.get(
                `SELECT id, client_id, principal_amount, number_of_installments, installment_amount, start_date 
                 FROM loans WHERE id = ?`,
                [currentInstallmentDetails.loan_id]
            );

            const clientDetails = await dbUtil.get(
                `SELECT first_name, last_name, dni FROM clients WHERE id = ?`,
                [loanDetailsFromDb.client_id]
            );

            const companyDetails = await dbUtil.get(
                `SELECT name, cuit, address, phone, email FROM company_info WHERE id = 1`
            ) || { name: 'Créditos TuAyuda', cuit: '30-71589745-4', address: 'Av. San Martín 456, El Colorado, Formosa', phone: '(370) 123-4567', email: 'contacto@tuayuda.com' }; // Fallback
            
            const operatorDetails = await dbUtil.get(
                `SELECT username FROM users WHERE id = ?`,
                [userId]
            ) || { username: 'N/A' }; // Fallback

            // Prepare data structures for generatePaymentReceipt
            const paymentInfoForReceipt = {
                payment_id: paymentId,
                client_name: `${clientDetails.first_name} ${clientDetails.last_name}`,
                client_dni: clientDetails.dni,
                payment_amount: payment_amount,
                payment_date_iso: payment_date_iso,
                payment_method: payment_method,
                notes: notes || ''
            };

            const loanInfoForReceipt = {
                id: loanDetailsFromDb.id,
                year: DateTime.fromISO(loanDetailsFromDb.start_date).year,
                principal_amount: loanDetailsFromDb.principal_amount,
                number_of_installments: loanDetailsFromDb.number_of_installments,
                installment_amount: loanDetailsFromDb.installment_amount
            };

            const installmentInfoForReceipt = {
                installment_number: currentInstallmentDetails.installment_number,
                due_date: currentInstallmentDetails.due_date,
                amount_due: currentInstallmentDetails.amount_due,
                interest_on_arrears: currentInstallmentDetails.interest_on_arrears || 0
            };
            
            receiptPath = await generatePaymentReceipt(
                paymentInfoForReceipt, 
                loanInfoForReceipt, 
                installmentInfoForReceipt, 
                companyDetails, 
                operatorDetails.username
            );

            if (receiptPath) {
                await dbUtil.run('UPDATE payments SET receipt_path = ? WHERE id = ?', [receiptPath, paymentId]);
            }
        } catch (receiptError) {
            console.error("Error generando o guardando ruta del recibo detallado:", receiptError);
            // No hacer rollback por error de recibo, el pago ya está en DB.
        }

        await dbUtil.run('COMMIT');
        return { 
            success: true, 
            paymentId, 
            message: 'Pago registrado exitosamente.',
            receiptPath: receiptPath 
        };

    } catch (error) {
        await dbUtil.run('ROLLBACK');
        console.error('Error en recordPayment:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Obtiene todos los pagos, opcionalmente filtrados.
 * @param {object} filters - { clientId, loanId, dateFrom, dateTo }
 * @returns {Promise<Array<object>>}
 */
async function getAllPayments(filters = {}) {
    try {
        let params = [];
        let sql = `
            SELECT 
                p.id, p.payment_date, p.payment_amount, p.payment_method, p.notes, p.receipt_path,
                p.loan_installment_id, li.installment_number,
                p.loan_id, 
                p.client_id, c.first_name as client_first_name, c.last_name as client_last_name, c.dni as client_dni,
                u.username as created_by_username
            FROM payments p
            JOIN loan_installments li ON p.loan_installment_id = li.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN users u ON p.created_by_user_id = u.id
        `;
        
        let whereClauses = [];
        if (filters.clientId) { whereClauses.push('p.client_id = ?'); params.push(filters.clientId); }
        if (filters.loanId) { whereClauses.push('p.loan_id = ?'); params.push(filters.loanId); }
        if (filters.dateFrom) { whereClauses.push("date(p.payment_date) >= date(?)"); params.push(filters.dateFrom); } // Compara solo la parte de la fecha
        if (filters.dateTo) { whereClauses.push("date(p.payment_date) <= date(?)"); params.push(filters.dateTo); }

        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }
        sql += ' ORDER BY p.payment_date DESC, p.id DESC';

        const payments = await dbUtil.all(sql, params);
        return payments.map(p => ({
            ...p, 
            // Asegurar que la ruta del recibo sea utilizable por el frontend
            receipt_full_path: p.receipt_path ? `file://${p.receipt_path.replace(/\\/g, '/')}` : null 
        }));
    } catch (error) {
        console.error('Error en getAllPayments:', error);
        throw error;
    }
}

/**
 * Calcula interés por mora para una cuota.
 * @param {number} installmentId
 * @param {number} dailyArrearsRate - Tasa de mora diaria (ej: 0.001 para 0.1% diario).
 * @returns {Promise<object>} - { success, arrearsAmount, daysOverdue, message }
 */
async function calculateArrears(installmentId, dailyArrearsRate = 0.001) { 
    try {
        const installment = await dbUtil.get(
            'SELECT amount_due, amount_paid, due_date, status, interest_on_arrears FROM loan_installments WHERE id = ?',
            [installmentId]
        );

        if (!installment) return { success: false, message: "Cuota no encontrada." };
        // Si ya tiene mora calculada y guardada, podríamos devolverla o recalcular. Por ahora, recalculamos.
        // if (installment.interest_on_arrears > 0) return { success: true, arrearsAmount: installment.interest_on_arrears, message: "Mora ya aplicada."}

        if (installment.status === 'paid') return { success: true, arrearsAmount: 0, daysOverdue: 0, message: "La cuota ya está pagada." };

        const dueDate = DateTime.fromISO(installment.due_date).endOf('day'); // Considerar vencida al final del día
        const today = DateTime.now().startOf('day');
        
        if (today <= dueDate) return { success: true, arrearsAmount: 0, daysOverdue: 0, message: "La cuota no está vencida." };

        const daysOverdue = Math.floor(today.diff(dueDate, 'days').days);
        if (daysOverdue <= 0) return { success: true, arrearsAmount: 0, daysOverdue: 0, message: "La cuota no está vencida (cálculo días)." };
        
        // La mora se calcula sobre el capital pendiente de la cuota (amount_due - amount_paid_capital)
        // Si amount_paid ya incluye pagos de mora anteriores, este cálculo se complica.
        // Simplificación: mora sobre (amount_due - amount_paid que NO sea mora)
        const principalOwedForInstallment = parseFloat(installment.amount_due) - parseFloat(installment.amount_paid || 0);
        
        if (principalOwedForInstallment <= 0) return { success: true, arrearsAmount: 0, daysOverdue, message: "El capital de la cuota está cubierto." };

        const arrearsAmount = parseFloat((principalOwedForInstallment * dailyArrearsRate * daysOverdue).toFixed(2));
        
        // Opcional: actualizar `interest_on_arrears` en la BD aquí, pero puede ser mejor
        // hacerlo solo cuando se va a registrar un pago que incluya la mora.
        // await dbUtil.run('UPDATE loan_installments SET interest_on_arrears = ? WHERE id = ?', [arrearsAmount, installmentId]);

        return { success: true, arrearsAmount, daysOverdue };
    } catch (error) {
        console.error("Error calculando mora:", error);
        return { success: false, message: `Error calculando mora: ${error.message}` };
    }
}

module.exports = {
    recordPayment,
    getAllPayments,
    calculateArrears,
};