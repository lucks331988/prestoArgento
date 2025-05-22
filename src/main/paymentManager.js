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

// Helper function to format currency
function formatCurrency(amount) {
    if (typeof amount !== 'number') {
        amount = parseFloat(amount);
    }
    if (isNaN(amount)) {
        return 'N/A'; // Or some other placeholder
    }
    return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Genera un recibo de pago en PDF.
 * @param {object} receiptData - Data for the receipt.
 * @param {object} companyInfo - { name, address, phone, cuit, email (optional) }
 * @returns {Promise<string|null>} - Ruta al archivo PDF generado o null en caso de error.
 */
async function generatePaymentReceipt(receiptData, companyInfo) {
    const loanReceiptDir = path.join(receiptsBasePath, `loan_${receiptData.loan_id}`);
    if (!fs.existsSync(loanReceiptDir)) {
        fs.mkdirSync(loanReceiptDir, { recursive: true });
    }
    const receiptFileName = `recibo_pago_${receiptData.payment_id}_${Date.now()}.pdf`;
    const receiptPath = path.join(loanReceiptDir, receiptFileName);

    const docDefinition = {
        content: [
            { text: '📄 Comprobante de Pago de Cuota de Préstamo', style: 'mainTitle', alignment: 'center', margin: [0, 0, 0, 20] },

            { text: `Nombre del Cliente: ${receiptData.client_name}` },
            { text: `DNI: ${receiptData.client_dni}` },
            { text: `Número de Préstamo: PR-${receiptData.loan_id}` },
            { text: `Fecha del Pago: ${DateTime.fromISO(receiptData.payment_date_iso).toFormat("dd/MM/yyyy")}` },
            { text: `Hora del Pago: ${DateTime.fromISO(receiptData.payment_date_iso).toFormat("hh:mm a")}` },

            { text: '---', style: 'separator', margin: [0, 10, 0, 10] },

            { text: '💰 Detalle del Pago:', style: 'sectionTitle', margin: [0, 0, 0, 5] },
            {
                ul: [
                    `Monto Total del Préstamo: ${formatCurrency(receiptData.loan_principal_amount)}`,
                    `Cuotas Totales: ${receiptData.loan_number_of_installments}`,
                    `Cuota N.º: ${receiptData.installment_number} de ${receiptData.loan_number_of_installments}`,
                    `Monto de la Cuota: ${formatCurrency(receiptData.installment_amount_due)}`,
                    `Intereses incluidos: Sí`, // Assuming 'Sí' for now
                    `Fecha de Vencimiento de la Cuota: ${DateTime.fromISO(receiptData.installment_due_date).toFormat("dd/MM/yyyy")}`,
                    `Fecha de Pago: ${DateTime.fromISO(receiptData.payment_date_iso).toFormat("dd/MM/yyyy")}`,
                    `Recargo por atraso: ${formatCurrency(receiptData.arrears_amount || 0)}`,
                    `Monto Total Pagado: ${formatCurrency(receiptData.total_amount_paid_for_transaction)}`,
                ],
                margin: [0, 0, 0, 10]
            },

            { text: '---', style: 'separator', margin: [0, 10, 0, 10] },

            { text: '💼 Información del Emisor:', style: 'sectionTitle', margin: [0, 0, 0, 5] },
            {
                ul: [
                    `Empresa: ${companyInfo.name || 'N/A'}`,
                    `CUIT: ${companyInfo.cuit || 'N/A'}`,
                    `Dirección: ${companyInfo.address || 'N/A'}`,
                    `Teléfono: ${companyInfo.phone || 'N/A'}`,
                    `Email: ${companyInfo.email || 'N/A'}`,
                ],
                margin: [0, 0, 0, 10]
            },

            { text: '---', style: 'separator', margin: [0, 10, 0, 10] },

            `Método de Pago: ${receiptData.payment_method || 'N/A'}`,
            `Operador: ${receiptData.operator_username || 'N/A'}`,
            // Notes are now part of the main content flow as per the new structure
             ...(receiptData.notes ? [{text: `\nNotas Adicionales: ${receiptData.notes}`}] : []),
             { text: '\n\n\n_________________________', alignment: 'center', margin: [0, 40, 0, 0] },
             { text: 'Firma y Aclaración (Prestamista)', alignment: 'center' },
        ],
        styles: {
            mainTitle: { fontSize: 18, bold: true },
            separator: { fontSize: 10, bold: true, alignment: 'center' },
            sectionTitle: { fontSize: 14, bold: true },
            // Old styles (header, subheader, title, sectionHeader, amountPaid) are removed.
        },
        defaultStyle: { font: 'Roboto', fontSize: 10 }
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
            const clientInfo = await dbUtil.get("SELECT first_name, last_name, dni FROM clients WHERE id = ?", [installment.client_id]);
            const companyInfoResult = await dbUtil.get("SELECT name, address, phone, cuit FROM company_info WHERE id = 1");
            const companyInfo = companyInfoResult || {};
            
            const receiptDetails = {
                payment_id: paymentId,
                loan_id: installment.loan_main_id,
                client_name: `${clientInfo.first_name} ${clientInfo.last_name}`,
                client_dni: clientInfo.dni,
                installment_number: installment.installment_number,
                payment_amount: payment_amount,
                payment_date_iso: payment_date_iso, // Usar ISO para DateTime en generatePaymentReceipt
                notes: notes || ''
            };
            receiptPath = await generatePaymentReceipt(receiptDetails, companyInfo);
            if (receiptPath) {
                await dbUtil.run('UPDATE payments SET receipt_path = ? WHERE id = ?', [receiptPath, paymentId]);
            }
        } catch (receiptError) {
            console.error("Error generando o guardando ruta del recibo:", receiptError);
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
    getLoansWithPendingInstallments,
};

/**
 * Obtiene préstamos con cuotas pendientes o parcialmente pagadas, incluyendo información del cliente.
 * @param {object} filters - { clientId, loanId, clientDni }
 * @returns {Promise<Array<object>>}
 */
async function getLoansWithPendingInstallments(filters = {}) {
    try {
        let loanCondition = "";
        const params = [];

        if (filters.loanId) {
            loanCondition = "l.id = ?";
            params.push(filters.loanId);
        } else if (filters.clientId) {
            loanCondition = "l.client_id = ?";
            params.push(filters.clientId);
        } else if (filters.clientDni) {
            const client = await dbUtil.get('SELECT id FROM clients WHERE dni = ?', [filters.clientDni]);
            if (client) {
                loanCondition = "l.client_id = ?";
                params.push(client.id);
            } else {
                return []; // Cliente no encontrado por DNI, no hay préstamos que mostrar
            }
        } else {
            // Si no hay filtros específicos de préstamo o cliente, podríamos devolver todos los préstamos
            // con cuotas pendientes, o requerir un filtro. Por ahora, devolvemos vacío si no hay filtro.
            // Opcionalmente, se podría modificar para buscar todos si no hay filtro específico.
            // Para este caso, la lógica del renderer implica que se buscará por DNI o LoanID.
            return []; 
        }

        const loans = await dbUtil.all(
            `SELECT l.id, l.client_id, l.status as loan_status,
                    c.first_name as client_first_name, c.last_name as client_last_name, c.dni as client_dni
             FROM loans l
             JOIN clients c ON l.client_id = c.id
             WHERE ${loanCondition} AND (l.status = 'active' OR l.status = 'overdue' OR l.status = 'defaulted')`,
            params
        );

        if (!loans || loans.length === 0) {
            return [];
        }

        const resultLoans = [];
        for (const loan of loans) {
            const installments = await dbUtil.all(
                `SELECT * FROM loan_installments 
                 WHERE loan_id = ? AND (status = 'pending' OR status = 'partially_paid' OR status = 'overdue' OR status = 'defaulted')
                 ORDER BY installment_number ASC`,
                [loan.id]
            );

            if (installments && installments.length > 0) {
                resultLoans.push({
                    ...loan,
                    installments: installments
                });
            }
        }
        return resultLoans;
    } catch (error) {
        console.error('Error en getLoansWithPendingInstallments:', error);
        throw error; // Re-lanzar para que el manejador IPC lo capture
    }
}