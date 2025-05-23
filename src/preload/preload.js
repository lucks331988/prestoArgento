// src/preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- Gestión de Ventana (Personalizada) ---
    windowMinimize: () => ipcRenderer.send('window:minimize'),
    windowToggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    windowClose: () => ipcRenderer.send('window:close'), 
    appLogout: () => ipcRenderer.send('app:logout'),     

    // --- Autenticación y Sesión de Usuario ---
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    notifyLoginSuccessful: (userData) => ipcRenderer.send('login-successful', userData),
    closeLoginWindow: () => ipcRenderer.send('close-login-window'), // Usado por loginRenderer.js
    getCurrentUser: () => ipcRenderer.invoke('user:get-current'),
    changeCurrentUserPassword: (passwords) => ipcRenderer.invoke('users:change-current-password', passwords),

    // --- Configuración de la Empresa ---
    getCompanyInfo: () => ipcRenderer.invoke('settings:get-company-info'),
    saveCompanyInfo: (info) => ipcRenderer.invoke('settings:save-company-info', info),
    getCompanyLogoPath: () => ipcRenderer.invoke('get-company-logo-path'),
    selectLogo: () => ipcRenderer.invoke('dialog:open-file-logo'),

    // --- Gestión de Usuarios (por Administrador) ---
    registerUser: (userData) => ipcRenderer.invoke('users:register', userData),
    getAllUsers: () => ipcRenderer.invoke('users:get-all'),
    getUserById: (userId) => ipcRenderer.invoke('users:get-by-id', userId),
    updateUser: (userId, userData) => ipcRenderer.invoke('users:update', userId, userData),

    // --- Gestión de Clientes ---
    addClient: (clientData) => ipcRenderer.invoke('clients:add', clientData),
    getAllClients: (activeOnly = true) => ipcRenderer.invoke('clients:get-all', activeOnly),
    getClientById: (id) => ipcRenderer.invoke('clients:get-by-id', id),
    updateClient: (id, clientData) => ipcRenderer.invoke('clients:update', id, clientData),
    deactivateClient: (id) => ipcRenderer.invoke('clients:deactivate', id),
    reactivateClient: (id) => ipcRenderer.invoke('clients:reactivate', id),
    uploadClientDocument: (clientId, documentType) => ipcRenderer.invoke('clients:upload-document', clientId, documentType),
    deleteClientDocument: (documentId) => ipcRenderer.invoke('clients:delete-document', documentId),
    getDocumentsPath: () => ipcRenderer.invoke('get-documents-path'),

    // --- Gestión de Préstamos ---
    calculateLoanDetails: (params) => ipcRenderer.invoke('loans:calculate-details', params),
    registerLoan: (loanData) => ipcRenderer.invoke('loans:register', loanData),
    getAllLoans: (filters) => ipcRenderer.invoke('loans:get-all', filters),
    getLoanById: (loanId) => ipcRenderer.invoke('loans:get-by-id', loanId),
    updateLoanStatus: (loanId, newStatus) => ipcRenderer.invoke('loans:update-status', loanId, newStatus),
    generateLoanContract: (loanId) => ipcRenderer.invoke('loans:generate-contract', loanId),

    // --- Gestión de Pagos ---
    recordPayment: (paymentData) => ipcRenderer.invoke('payments:record', paymentData),
    getAllPayments: (filters) => ipcRenderer.invoke('payments:get-all', filters),
    calculateArrears: (installmentId, dailyArrearsRate) => ipcRenderer.invoke('payments:calculate-arrears', installmentId, dailyArrearsRate),
    searchInstallmentsForPayment: (criteria) => ipcRenderer.invoke('search-installments-for-payment', criteria),
    
    // --- Backup y Restauración ---
    backupData: () => ipcRenderer.invoke('settings:backup'),
    restoreData: () => ipcRenderer.invoke('settings:restore'),

    // --- Reportes ---
    getReportData: (reportType, filters) => ipcRenderer.invoke('reports:get-data', reportType, filters),
    exportReport: (reportType, data, format) => ipcRenderer.invoke('reports:export', reportType, data, format),

    // --- Funciones de Fecha y Hora (Luxon) ---
    formatDate: (dateString, format) => ipcRenderer.invoke('format-date', dateString, format),
    formatDateTime: (dateTimeString, format) => ipcRenderer.invoke('format-date-time', dateTimeString, format),
    getCurrentDateTimeISO: () => ipcRenderer.invoke('get-current-date-time-iso'),
    addOrSubtractDaysISO: (isoDateString, days, operation) => ipcRenderer.invoke('add-or-subtract-days-iso', isoDateString, days, operation),
    
    // --- Utilidades Generales de la App ---
    openFile: (filePath) => ipcRenderer.invoke('app:open-file', filePath),
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
});
console.log('Preload script for Presto Argento loaded successfully. window.electronAPI is now available.');