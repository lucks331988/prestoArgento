// src/main/reportManager.js
const dbUtil = require('./database');
const { DateTime } = require('luxon');
const PdfPrinter = require('pdfmake');
const Papa = require('papaparse'); // Para CSV
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

// Configuración de fuentes para pdfmake (asumiendo la estructura del build)
// Esta ruta es crucial y puede necesitar ajustes dependiendo de cómo electron-builder empaquete.
// El objetivo es que process.resourcesPath apunte al directorio raíz de la app desempaquetada.
const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '../..');

const fonts = {
    Roboto: {
        normal: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Regular.ttf'),
        bold: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Medium.ttf'),
        italics: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-Italic.ttf'),
        bolditalics: path.join(resourcesPath, 'node_modules/pdfmake/build/pdfmake/Roboto-MediumItalic.ttf')
    }
};
// Verificar si las fuentes existen en las rutas esperadas, si no, intentar un fallback o loguear un error.
Object.values(fonts.Roboto).forEach(fontPath => {
    if (!fs.existsSync(fontPath)) {
        console.warn(`Fuente PDF no encontrada en: ${fontPath}. El PDF podría no generarse correctamente.`);
        // Podrías tener rutas alternativas aquí si es necesario para diferentes escenarios de empaquetado.
    }
});
const printer = new PdfPrinter(fonts);


/**
 * Obtiene datos para el reporte de préstamos.
 * @param {object} filters - { dateFrom, dateTo, loanType, clientId, loanStatus, createdByUserId }
 * @returns {Promise<Array<object>>}
 */
async function getLoansReportData(filters = {}) {
    let sql = `
        SELECT
            l.id as "ID Préstamo",
            c.first_name || ' ' || c.last_name as "Cliente",
            c.dni as "DNI Cliente",
            CASE l.loan_type WHEN 'daily' THEN 'Diario' ELSE 'Mensual' END as "Tipo",
            l.principal_amount as "Monto Capital",
            (l.interest_rate * 100) as "Tasa Interés (%)",
            l.term_duration as "Plazo",
            l.total_amount_due as "Total a Devolver",
            strftime('%d/%m/%Y', l.start_date) as "Fecha Inicio",
            (SELECT strftime('%d/%m/%Y', MAX(li.due_date)) FROM loan_installments li WHERE li.loan_id = l.id) as "Fecha Fin Estimada",
            CASE l.status 
                WHEN 'active' THEN 'Activo' WHEN 'paid' THEN 'Pagado' WHEN 'overdue' THEN 'Vencido' 
                WHEN 'defaulted' THEN 'En Mora' WHEN 'cancelled' THEN 'Anulado' ELSE l.status 
            END as "Estado",
            u.username as "Registrado por"
        FROM loans l
        JOIN clients c ON l.client_id = c.id
        LEFT JOIN users u ON l.created_by_user_id = u.id
    `;
    const params = [];
    const whereClauses = [];

    if (filters.dateFrom) { whereClauses.push("date(l.start_date) >= date(?)"); params.push(filters.dateFrom); }
    if (filters.dateTo) { whereClauses.push("date(l.start_date) <= date(?)"); params.push(filters.dateTo); }
    if (filters.loanType) { whereClauses.push("l.loan_type = ?"); params.push(filters.loanType); }
    if (filters.clientId) { whereClauses.push("l.client_id = ?"); params.push(filters.clientId); }
    if (filters.loanStatus) { whereClauses.push("l.status = ?"); params.push(filters.loanStatus); }
    if (filters.createdByUserId) { whereClauses.push("l.created_by_user_id = ?"); params.push(filters.createdByUserId); }

    if (whereClauses.length > 0) {
        sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY l.start_date DESC, l.id DESC";

    try {
        const data = await dbUtil.all(sql, params);
        // Formatear montos y tasas para la tabla de datos crudos (antes de exportar o mostrar)
        return data.map(row => ({
            ...row,
            "Monto Capital": parseFloat(row["Monto Capital"] || 0).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            "Total a Devolver": parseFloat(row["Total a Devolver"] || 0).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            "Tasa Interés (%)": parseFloat(row["Tasa Interés (%)"] || 0).toFixed(2)
        }));
    } catch (error) {
        console.error("Error obteniendo datos para reporte de préstamos:", error);
        throw error;
    }
}

/**
 * Obtiene datos para el reporte de cobranzas (pagos).
 * @param {object} filters - { dateFrom, dateTo, clientId, createdByUserId }
 * @returns {Promise<Array<object>>}
 */
async function getPaymentsReportData(filters = {}) {
     let sql = `
        SELECT
            p.id as "ID Pago",
            strftime('%d/%m/%Y %H:%M', p.payment_date) as "Fecha Pago",
            c.first_name || ' ' || c.last_name as "Cliente",
            c.dni as "DNI Cliente",
            p.loan_id as "ID Préstamo",
            li.installment_number as "N° Cuota",
            p.payment_amount as "Monto Pagado",
            p.payment_method as "Método",
            u.username as "Registrado por"
        FROM payments p
        JOIN clients c ON p.client_id = c.id
        JOIN loan_installments li ON p.loan_installment_id = li.id
        LEFT JOIN users u ON p.created_by_user_id = u.id
    `;
    const params = [];
    const whereClauses = [];

    if (filters.dateFrom) { whereClauses.push("date(p.payment_date) >= date(?)"); params.push(filters.dateFrom); }
    if (filters.dateTo) { whereClauses.push("date(p.payment_date) <= date(?)"); params.push(filters.dateTo); }
    if (filters.clientId) { whereClauses.push("p.client_id = ?"); params.push(filters.clientId); }
    if (filters.createdByUserId) { whereClauses.push("p.created_by_user_id = ?"); params.push(filters.createdByUserId); }
    
    if (whereClauses.length > 0) {
        sql += " WHERE " + whereClauses.join(" AND ");
    }
    sql += " ORDER BY p.payment_date DESC, p.id DESC";

    try {
        const data = await dbUtil.all(sql, params);
        return data.map(row => ({
            ...row,
            "Monto Pagado": parseFloat(row["Monto Pagado"] || 0).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})
        }));
    } catch (error) {
        console.error("Error obteniendo datos para reporte de cobranzas:", error);
        throw error;
    }
}

/**
 * Obtiene datos para el resumen general.
 * @param {object} filters - { dateFrom, dateTo } (para filtrar totales por período)
 * @returns {Promise<object>}
 */
async function getGeneralSummaryData(filters = {}) {
    try {
        const summary = {};
        let loanDateFilter = "";
        const loanParams = [];
        let paymentDateFilter = "";
        const paymentParams = [];

        if (filters.dateFrom) {
            loanDateFilter += ` AND date(l.start_date) >= date(?) `;
            loanParams.push(filters.dateFrom);
            paymentDateFilter += ` AND date(p.payment_date) >= date(?) `;
            paymentParams.push(filters.dateFrom);
        }
        if (filters.dateTo) {
            loanDateFilter += ` AND date(l.start_date) <= date(?) `;
            loanParams.push(filters.dateTo);
            paymentDateFilter += ` AND date(p.payment_date) <= date(?) `;
            paymentParams.push(filters.dateTo);
        }
        
        // Préstamos Activos (capital pendiente)
        const activeLoans = await dbUtil.get(
            `SELECT COUNT(l.id) as count, SUM(l.total_amount_due - IFNULL((SELECT SUM(pay.payment_amount) FROM payments pay WHERE pay.loan_id = l.id), 0)) as total_pending_amount 
             FROM loans l WHERE l.status = 'active' ${loanDateFilter}`, loanParams); // Use loanDateFilter directly (applies to l.start_date)
        summary.active_loans_count = activeLoans.count || 0;
        summary.active_loans_total_pending_amount = activeLoans.total_pending_amount || 0;

        // Préstamos Pagados (filtrados por l.start_date si loanDateFilter está activo)
        const paidLoans = await dbUtil.get(`SELECT COUNT(*) as count, SUM(l.principal_amount) as total_principal FROM loans l WHERE l.status = 'paid' ${loanDateFilter}`, loanParams);
        summary.paid_loans_count = paidLoans.count || 0;
        summary.paid_loans_total_principal = paidLoans.total_principal || 0;
        
        // Préstamos Vencidos/En Mora (filtrados por l.start_date si loanDateFilter está activo)
        const overdueLoans = await dbUtil.get(`SELECT COUNT(*) as count, SUM(l.principal_amount) as total_principal FROM loans l WHERE (l.status = 'overdue' OR l.status = 'defaulted') ${loanDateFilter}`, loanParams);
        summary.overdue_loans_count = overdueLoans.count || 0;
        summary.overdue_loans_total_principal = overdueLoans.total_principal || 0;

        // Total Capital Prestado en el período (basado en fecha de inicio del préstamo)
        const totalCapitalGiven = await dbUtil.get(`SELECT SUM(l.principal_amount) as total FROM loans l WHERE 1=1 ${loanDateFilter}`, loanParams);
        summary.total_capital_prestado_periodo = totalCapitalGiven.total || 0;
        
        // Total Intereses Cobrados en el período
        // Esto es una aproximación. Suma de todos los pagos menos el capital devuelto en esos pagos.
        // Para una mayor precisión, se necesitaría desglosar cada pago en capital e interés.
        // Simplificación: Total de pagos en el período - (Capital de préstamos cuyas cuotas se pagaron en el período)
        // Otra simplificación: Suma de (payment_amount - (payment_amount * principal_loan / total_due_loan))
        // O más simple: Total intereses teóricos de préstamos iniciados en el período.
        const totalTheoreticalInterest = await dbUtil.get(`SELECT SUM(l.total_interest) as total FROM loans l WHERE 1=1 ${loanDateFilter}`, loanParams);
        summary.total_theoretical_interest_periodo = totalTheoreticalInterest.total || 0;

        return summary;
    } catch (error) {
        console.error("Error obteniendo resumen general:", error);
        throw error;
    }
}


/**
 * Exporta datos a un archivo (PDF o CSV).
 * @param {string} reportType - 'loans', 'payments'
 * @param {Array<object>} data - Datos a exportar.
 * @param {string} format - 'pdf' o 'csv'.
 * @param {BrowserWindow} parentWindow - Ventana padre para el diálogo de guardado.
 * @returns {Promise<object>} - { success, filePath, message }
 */
async function exportReport(reportType, data, format, parentWindow) {
    if (!data || data.length === 0) {
        return { success: false, message: "No hay datos para exportar." };
    }

    const reportTitle = reportType === 'loans' ? 'Préstamos' : 'Cobranzas';
    const defaultFileName = `Reporte_${reportTitle}_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}.${format}`;
    
    const { filePath } = await dialog.showSaveDialog(parentWindow, {
        title: `Guardar Reporte de ${reportTitle}`,
        defaultPath: defaultFileName,
        filters: format === 'pdf' ? 
                 [{ name: 'Archivos PDF', extensions: ['pdf'] }] : 
                 [{ name: 'Archivos CSV (Excel)', extensions: ['csv'] }]
    });

    if (!filePath) {
        return { success: false, message: "Exportación cancelada por el usuario." };
    }

    try {
        if (format === 'csv') {
            const csv = Papa.unparse(data, {
                header: true,
                quotes: true, // Poner comillas alrededor de todos los campos
                delimiter: ";" // Usar punto y coma para mejor compatibilidad con Excel en español
            });
            // BOM para UTF-8 para que Excel lo abra bien con acentos
            fs.writeFileSync(filePath, "\uFEFF" + csv, { encoding: 'utf8' });
        } else if (format === 'pdf') {
            const headers = Object.keys(data[0]).map(key => ({ text: key, style: 'tableHeader' }));
            const body = [headers];
            data.forEach(row => {
                // En los datos para PDF, no queremos los números formateados como moneda con $, sino como números.
                // O podemos dejar el formateo que ya viene de getLoansReportData/getPaymentsReportData.
                // Por ahora, usamos los datos tal cual vienen (ya formateados).
                const rowData = Object.values(row).map(val => (val !== null && val !== undefined ? val.toString() : ''));
                body.push(rowData);
            });

            const docDefinition = {
                pageOrientation: 'landscape',
                content: [
                    { text: `Reporte de ${reportTitle}`, style: 'header' },
                    { text: `Generado el: ${DateTime.now().toFormat("dd/MM/yyyy HH:mm:ss")}`, style: 'subheader', margin: [0,0,0,20]},
                    {
                        table: {
                            headerRows: 1,
                            body: body,
                        },
                        layout: 'lightHorizontalLines'
                    }
                ],
                styles: {
                    header: { fontSize: 18, bold: true, alignment: 'center', margin: [0,0,0,10] },
                    subheader: { fontSize: 9, alignment: 'center'},
                    tableHeader: { bold: true, fontSize: 8, fillColor: '#eeeeee' } // Tamaño de fuente más pequeño para cabeceras
                },
                defaultStyle: { font: 'Roboto', fontSize: 7 } // Tamaño de fuente más pequeño para el cuerpo
            };
            const pdfDoc = printer.createPdfKitDocument(docDefinition);
            const writeStream = fs.createWriteStream(filePath);
            pdfDoc.pipe(writeStream);
            pdfDoc.end();

            return new Promise((resolve, reject) => {
                writeStream.on('finish', () => resolve({ success: true, filePath, message: `Reporte PDF generado.`}));
                writeStream.on('error', (err) => reject({ success: false, message: `Error escribiendo PDF: ${err.message}`}));
            });
        }
        return { success: true, filePath, message: `Reporte ${format.toUpperCase()} generado.`};
    } catch (error) {
        console.error(`Error exportando reporte a ${format.toUpperCase()}:`, error);
        return { success: false, message: `Error al exportar: ${error.message}` };
    }
}

module.exports = {
    getLoansReportData,
    getPaymentsReportData,
    getGeneralSummaryData,
    exportReport
};