// src/main/main.js
const { app, BrowserWindow, ipcMain, screen, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Importar módulos locales
const dbModule = require('./database');
const authModule = require('./auth');
const userManager = require('./userManager');
const clientManager = require('./clientManager');
const loanManager = require('./loanManager');
const paymentManager = require('./paymentManager');
const settingsManager = require('./settingsManager');
const reportManager = require('./reportManager');
const dateUtils = require('./utils'); // Import the new utils


// Variables Globales
let loginWindow;
let mainWindow;
const IS_DEV = process.env.NODE_ENV === 'development';
let currentUser = null;

// Configuración de Directorios de Datos
const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const documentsPathDir = path.join(prestoArgentoDataPath, 'documents');
const companyInfoPathDir = path.join(prestoArgentoDataPath, 'company_info');
const contractsPathDir = path.join(prestoArgentoDataPath, 'contracts');
const receiptsPathDir = path.join(prestoArgentoDataPath, 'receipts');


function ensureAppDirectories() {
    const dirsToCreate = [
        prestoArgentoDataPath,
        documentsPathDir, 
        path.join(documentsPathDir, 'clients'), 
        companyInfoPathDir,
        contractsPathDir,
        receiptsPathDir
    ];
    dirsToCreate.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Directorio creado en: ${dir}`);
        }
    });
}

async function createInitialAdminUser() {
    const adminUsername = 'admin';
    try {
        const adminExists = await authModule.findUserByUsername(adminUsername);
        if (!adminExists) {
            const defaultAdminPassword = 'admin';
            const registrationResult = await authModule._internalRegisterAdmin(
                adminUsername,
                defaultAdminPassword,
                'Administrador del Sistema'
            );
            if (registrationResult.success) {
                console.log(`Usuario administrador '${adminUsername}' creado con contraseña por defecto.`);
                await dbModule.run('UPDATE company_info SET admin_username = ? WHERE id = 1', [adminUsername]);
                if (!process.env.CI && !process.env.TEST) {
                    dialog.showMessageBox(null, {
                        type: 'info',
                        title: 'Administrador Creado',
                        message: `Se ha creado un usuario administrador por defecto:\n\nUsuario: ${adminUsername}\nContraseña: ${defaultAdminPassword}\n\nPor favor, cambie esta contraseña lo antes posible desde la sección de configuración.`,
                        buttons: ['OK']
                    }).catch(err => console.error("Error mostrando diálogo de admin:", err));
                }
            } else {
                console.error('Error al crear el usuario administrador inicial:', registrationResult.message);
            }
        } else {
            console.log(`Usuario administrador '${adminUsername}' ya existe.`);
            const companyInfo = await dbModule.get('SELECT admin_username FROM company_info WHERE id = 1');
            if (companyInfo && companyInfo.admin_username !== adminUsername) {
                await dbModule.run('UPDATE company_info SET admin_username = ? WHERE id = 1', [adminUsername]);
            }
        }
    } catch (error) {
        console.error('Error en createInitialAdminUser:', error);
    }
}

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 400,
        height: 650, 
        resizable: false,
        maximizable: false,
        frame: false, 
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true, 
            nodeIntegration: false, 
        },
        icon: path.join(app.getAppPath(), 'src/renderer/assets/images/logo-presto-argento.png')
    });

    loginWindow.loadFile(path.join(__dirname, '../renderer/views/login.html'));
    loginWindow.setTitle('Presto Argento - Iniciar Sesión');

    // if (IS_DEV) {
    //     loginWindow.webContents.openDevTools({ mode: 'detach' });
    // }

    loginWindow.on('closed', () => {
        loginWindow = null;
        if (!mainWindow) {
            app.quit();
        }
    });
}

function createMainWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow({
        width: Math.round(width * 0.85), 
        height: Math.round(height * 0.85),
        minWidth: 1024,
        minHeight: 700,
        frame: false,       // Quita el marco estándar de la ventana
        titleBarStyle: 'hidden', // Para macOS, con frame:false es menos relevante pero no daña
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(app.getAppPath(), 'src/renderer/assets/images/logo-presto-argento.png')
    });

    // Quitar el menú de aplicación si no es macOS
    if (process.platform !== 'darwin') {
      Menu.setApplicationMenu(null); 
    }
    // O específicamente para esta ventana:
    // mainWindow.setMenu(null);


    mainWindow.loadFile(path.join(__dirname, '../renderer/views/main_window.html'));
    mainWindow.setTitle('Presto Argento - Panel Principal');

    // if (IS_DEV) {
    //    mainWindow.webContents.openDevTools({ mode: 'detach' });
    // }

    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit();
    });
}

app.whenReady().then(async () => {
    ensureAppDirectories(); 
    currentUser = null;

    try {
        await dbModule.initDatabase(); 
        console.log("Base de datos inicializada correctamente.");
        await createInitialAdminUser(); 
    } catch (error) {
        console.error("Error fatal durante la inicialización de la base de datos o creación de admin:", error);
        dialog.showErrorBox("Error Crítico", "No se pudo inicializar la aplicación. Por favor, contacte al soporte.\nDetalles: " + error.message);
        app.quit();
        return; 
    }

    createLoginWindow(); 

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            if (mainWindow) createMainWindow(); 
            else createLoginWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- Manejadores IPC ---
// Autenticación y Sesión
ipcMain.handle('auth:login', async (event, credentials) => await authModule.loginUser(credentials.username, credentials.password));
ipcMain.on('login-successful', (event, userData) => {
    console.log('Login exitoso para:', userData.username);
    currentUser = userData; 
    if (loginWindow) loginWindow.close();
    createMainWindow();
});
ipcMain.on('close-login-window', () => {
    if (loginWindow) loginWindow.close();
});
ipcMain.handle('user:get-current', async () => currentUser ? { success: true, user: currentUser } : { success: false });

// Configuración Empresa
ipcMain.handle('settings:get-company-info', async () => {
    try {
        let info = await dbModule.get('SELECT name, address, phone, cuit, logo_path, default_daily_interest_rate, default_monthly_interest_rate FROM company_info WHERE id = 1');
        if (!info) {
            info = { name: 'Presto Argento', address: '', phone: '', cuit: '', logo_path: null, default_daily_interest_rate: 0.01, default_monthly_interest_rate: 0.10 };
        }
        return { success: true, data: info };
    } catch (error) {
        console.error('Error obteniendo información de la empresa:', error);
        return { success: false, message: error.message };
    }
});
ipcMain.handle('settings:save-company-info', async (event, companyData) => {
    try {
        const { name, address, phone, cuit, logo_path, default_daily_interest_rate, default_monthly_interest_rate } = companyData;
        if (!name) return { success: false, message: "El nombre de la empresa es obligatorio." };
        await dbModule.run(
            `UPDATE company_info SET name = ?, address = ?, phone = ?, cuit = ?, logo_path = ?, default_daily_interest_rate = ?, default_monthly_interest_rate = ? WHERE id = 1`,
            [name, address, phone, cuit, logo_path, default_daily_interest_rate, default_monthly_interest_rate]
        );
        return { success: true, message: 'Información de la empresa guardada correctamente.' };
    } catch (error) {
        console.error('Error guardando información de la empresa:', error);
        return { success: false, message: `Error al guardar: ${error.message}` };
    }
});
ipcMain.handle('dialog:open-file-logo', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parentWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, path: null };
    const originalPath = result.filePaths[0];
    const fileExtension = path.extname(originalPath);
    const newLogoFilename = `logo_empresa${fileExtension}`;
    const destinationPath = path.join(companyInfoPathDir, newLogoFilename);
    try {
        fs.copyFileSync(originalPath, destinationPath);
        await dbModule.run('UPDATE company_info SET logo_path = ? WHERE id = 1', [destinationPath]);
        return { success: true, path: destinationPath, message: 'Logo actualizado correctamente.' };
    } catch (error) {
        console.error('Error al copiar o guardar el nuevo logo:', error);
        return { success: false, path: null, message: `Error al procesar el logo: ${error.message}` };
    }
});
ipcMain.handle('get-company-logo-path', async () => {
    try {
        const companyInfo = await dbModule.get('SELECT logo_path FROM company_info WHERE id = 1');
        if (companyInfo && companyInfo.logo_path && fs.existsSync(companyInfo.logo_path)) {
            return companyInfo.logo_path;
        }
    } catch (error) {
        console.error("Error obteniendo ruta del logo personalizado:", error);
    }
    const defaultLogoInAssets = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'images', 'logo-presto-argento.png');
    if (fs.existsSync(defaultLogoInAssets)) {
        return defaultLogoInAssets;
    }
    console.error("FALLBACK LOGO NOT FOUND AT:", defaultLogoInAssets);
    return path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'images', 'doc_placeholder.png');
});

// Gestión de Usuarios
ipcMain.handle('users:register', async (event, userData) => {
    if (!currentUser) return { success: false, message: "No hay usuario autenticado para realizar esta acción." };
    return await userManager.registerUser(userData, currentUser);
});
ipcMain.handle('users:get-all', async () => {
    try { return { success: true, data: await userManager.getAllUsers() }; }
    catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('users:get-by-id', async (event, userId) => {
    try {
        const user = await userManager.getUserById(userId);
        return user ? { success: true, data: user } : { success: false, message: 'Usuario no encontrado.'};
    } catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('users:update', async (event, userIdToUpdate, dataToUpdate) => {
    if (!currentUser) return { success: false, message: "No hay usuario autenticado." };
    return await userManager.updateUser(userIdToUpdate, dataToUpdate, currentUser);
});
ipcMain.handle('users:change-current-password', async (event, { currentPassword, newPassword }) => {
    if (!currentUser) return { success: false, message: 'No hay usuario autenticado.' };
    return await userManager.changeCurrentUserPassword(currentUser.id, currentPassword, newPassword);
});

// Gestión de Clientes
ipcMain.handle('clients:add', async (event, clientData) => await clientManager.addClient(clientData));
ipcMain.handle('clients:get-all', async (event, activeOnly = true) => {
    try { return { success: true, data: await clientManager.getAllClients(activeOnly) }; }
    catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('clients:get-by-id', async (event, clientId) => {
    try {
        const client = await clientManager.getClientById(clientId);
        return client ? { success: true, data: client } : { success: false, message: 'Cliente no encontrado.' };
    } catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('clients:update', async (event, clientId, clientData) => await clientManager.updateClient(clientId, clientData));
ipcMain.handle('clients:deactivate', async (event, clientId) => await clientManager.deactivateClient(clientId));
ipcMain.handle('clients:reactivate', async (event, clientId) => await clientManager.reactivateClient(clientId));
ipcMain.handle('clients:upload-document', async (event, clientId, documentType) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(parentWindow, {
        properties: ['openFile'],
        filters: [ { name: 'Imágenes y PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }, { name: 'Todos los archivos', extensions: ['*'] } ]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Subida cancelada.' };
    const filePath = result.filePaths[0];
    const originalFilename = path.basename(filePath);
    return await clientManager.uploadClientDocument(clientId, documentType, filePath, originalFilename);
});
ipcMain.handle('clients:delete-document', async (event, documentId) => await clientManager.deleteClientDocument(documentId));
ipcMain.handle('get-documents-path', async () => {
    return path.join(documentsPathDir, 'clients');
});

// Gestión de Préstamos
ipcMain.handle('loans:calculate-details', (event, params) => {
    let rateForCalc = params.interestRate; 
    if (params.loanType === 'monthly') {
        rateForCalc = params.interestRate * 12; 
    }
    try {
        const details = loanManager.calculateLoanDetails(
            params.principal, rateForCalc, params.term,
            params.loanType, params.startDate, params.fixedInstallmentAmount
        );
        return { success: true, data: details };
    } catch (error) {
        console.error("Error en loans:calculate-details IPC:", error);
        return { success: false, message: error.message };
    }
});
ipcMain.handle('loans:register', async (event, loanData) => {
    if (!currentUser) return { success: false, message: "No hay usuario autenticado." };
    return await loanManager.registerLoan(loanData, currentUser.id);
});
ipcMain.handle('loans:get-all', async (event, filters = {}) => {
    try { return { success: true, data: await loanManager.getAllLoans(filters) }; }
    catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('loans:get-by-id', async (event, loanId) => {
    try {
        const loan = await loanManager.getLoanById(loanId);
        return loan ? { success: true, data: loan } : { success: false, message: 'Préstamo no encontrado.' };
    } catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('loans:update-status', async (event, loanId, newStatus) => {
    if (!currentUser) return { success: false, message: "No hay usuario autenticado." };
    return await loanManager.updateLoanStatus(loanId, newStatus, currentUser.id);
});
ipcMain.handle('loans:generate-contract', async (event, loanId) => await loanManager.generateLoanContract(loanId));

// Gestión de Pagos
ipcMain.handle('payments:record', async (event, paymentData) => {
    if (!currentUser) return { success: false, message: "No hay usuario autenticado." };
    return await paymentManager.recordPayment(paymentData, currentUser.id);
});
ipcMain.handle('payments:get-all', async (event, filters = {}) => {
    try { return { success: true, data: await paymentManager.getAllPayments(filters) }; }
    catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('payments:calculate-arrears', async (event, installmentId, dailyArrearsRate) => {
    return await paymentManager.calculateArrears(installmentId, dailyArrearsRate);
});
ipcMain.handle('payments:get-loans-with-pending-installments', async (event, filters) => {
    try {
        const data = await paymentManager.getLoansWithPendingInstallments(filters);
        return { success: true, data };
    } catch (error) {
        console.error('Error en IPC payments:get-loans-with-pending-installments:', error);
        return { success: false, message: error.message };
    }
});
   
// Backup y Restauración
ipcMain.handle('settings:backup', async (event) => {
    return await settingsManager.backupDatabaseAndDocuments(BrowserWindow.fromWebContents(event.sender));
});
ipcMain.handle('settings:restore', async (event) => {
    return await settingsManager.restoreDatabaseAndDocuments(BrowserWindow.fromWebContents(event.sender));
});

// Reportes
ipcMain.handle('reports:get-data', async (event, reportType, filters) => {
    try {
        let data;
        if (reportType === 'loans') data = await reportManager.getLoansReportData(filters);
        else if (reportType === 'payments') data = await reportManager.getPaymentsReportData(filters);
        else if (reportType === 'summary') data = await reportManager.getGeneralSummaryData(filters);
        else return { success: false, message: 'Tipo de reporte no válido.' };
        return { success: true, data };
    } catch (error) {
        return { success: false, message: `Error generando datos del reporte: ${error.message}` };
    }
});
ipcMain.handle('reports:export', async (event, reportType, data, format) => {
    return await reportManager.exportReport(reportType, data, format, BrowserWindow.fromWebContents(event.sender));
});

// --- MANEJADORES IPC PARA CONTROLES DE VENTANA PERSONALIZADOS ---
ipcMain.on('window:minimize', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.on('window:toggle-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window:close', () => { 
    app.quit();
});

ipcMain.on('app:logout', () => { 
    if (mainWindow) {
        mainWindow.close(); 
    }
    currentUser = null; 
    if (loginWindow && !loginWindow.isDestroyed()) { // Prevenir error si ya se cerró
        loginWindow.close();
    }
    createLoginWindow(); 
});
// --- FIN DE MANEJADORES PARA CONTROLES DE VENTANA ---

// Utilidades de App (las que ya teníamos)
ipcMain.handle('app:open-file', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error(`Error al abrir archivo ${filePath}:`, error);
        return { success: false, message: `No se pudo abrir el archivo: ${error.message}` };
    }
});
ipcMain.handle('dialog:showSaveDialog', async (event, options) => {
    return await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), options);
});
ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    return await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), options);
});

// Date/Time Utilities from utils.js
ipcMain.handle('util:formatDate', (event, isoDate, format) => {
    return dateUtils.formatDate(isoDate, format);
});
ipcMain.handle('util:formatDateTime', (event, isoDateTime, format) => {
    return dateUtils.formatDateTime(isoDateTime, format);
});
ipcMain.handle('util:getCurrentDateTimeISO', () => {
    return dateUtils.getCurrentDateTimeISO();
});
ipcMain.handle('util:addOrSubtractDaysISO', (event, isoDate, days, operation) => {
    return dateUtils.addOrSubtractDaysISO(isoDate, days, operation);
});


// Aceleración por hardware
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
app.disableHardwareAcceleration(false);