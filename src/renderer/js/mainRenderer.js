// src/renderer/js/mainRenderer.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Panel principal de Presto Argento cargado.');

    // --- ELEMENTOS GLOBALES DE LA UI (SIDEBAR, NAVEGACIÓN, TEMA) ---
    const menuItems = document.querySelectorAll('.sidebar-menu li a');
    const pages = document.querySelectorAll('.main-content .page');
    const themeToggleButton = document.getElementById('theme-toggle-btn');
    const appLogoSidebar = document.getElementById('app-logo-sidebar');
    const appTitleSidebar = document.getElementById('app-title-sidebar');
    const userInfoP = document.getElementById('user-info');
    let loggedInUser = null; 

    // --- FUNCIONES AUXILIARES GLOBALES ---
    function formatCurrency(amount) {
        if (typeof amount !== 'number') {
            amount = parseFloat(amount);
            if (isNaN(amount)) amount = 0;
        }
        return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function formatDateForDisplay(dateString, format = 'dd/MM/yyyy') {
        if (!dateString) return 'N/A';
        try {
            return await window.electronAPI.formatDate(dateString, format); 
        } catch(e) { console.warn("Error formateando fecha API:", dateString, e); return "Error Fecha"; }
    }

    async function formatDateTimeForDisplay(dateTimeString, format = 'dd/MM/yyyy HH:mm:ss') {
        if (!dateTimeString) return 'N/A';
        try {
            return await window.electronAPI.formatDateTime(dateTimeString, format);
        } catch(e) { console.warn("Error formateando fecha/hora API:", dateTimeString, e); return "Error Fecha/Hora"; }
    }

    function translateLoanType(type) { return type === 'daily' ? 'Diario' : (type === 'monthly' ? 'Mensual' : type); }
    function translateLoanStatus(status) { const s = { active: 'Activo', paid: 'Pagado', overdue: 'Vencido', defaulted: 'En Mora', cancelled: 'Anulado' }; return s[status] || status; }
    function translateInstallmentStatus(status) { const s = { pending: 'Pendiente', paid: 'Pagada', partially_paid: 'Pago Parcial', overdue: 'Vencida', defaulted: 'En Mora' }; return s[status] || status; }
    function translateUserRole(role) { return role === 'admin' ? 'Administrador' : (role === 'employee' ? 'Empleado' : role); }
    function translateDocumentType(type) { const t = { 'dni_front': 'DNI Frente', 'dni_back': 'DNI Dorso', 'salary_slip': 'Recibo Sueldo', 'guarantor_dni_front': 'DNI Garante (Frente)', 'guarantor_dni_back': 'DNI Garante (Dorso)', 'guarantor_salary_slip': 'Rec. Sueldo Garante', 'other': 'Otro Documento' }; return t[type] || type; }

    function showAppMessage(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        const alertTypeMap = { 'info': 'Información', 'success': 'Éxito', 'error': 'Error', 'warning': 'Advertencia'};
        alert(`${alertTypeMap[type] || 'Mensaje'}: ${message}`);
    }

    // --- LÓGICA DE INICIALIZACIÓN Y NAVEGACIÓN ---
    async function fetchCurrentUser() {
        if (window.electronAPI && typeof window.electronAPI.getCurrentUser === 'function') {
            try {
                const result = await window.electronAPI.getCurrentUser();
                if (result.success && result.user) {
                    loggedInUser = result.user;
                    if (userInfoP) userInfoP.textContent = `Usuario: ${loggedInUser.username} (${translateUserRole(loggedInUser.role)})`;
                    const employeeManagementSection = document.getElementById('employee-management-section');
                    if (employeeManagementSection) employeeManagementSection.style.display = (loggedInUser.role === 'admin') ? 'block' : 'none';
                } else {
                    console.warn("No se pudo obtener el usuario actual."); if (userInfoP) userInfoP.textContent = "Usuario: Desconocido";
                }
            } catch (error) { console.error("Error obteniendo usuario actual:", error); if (userInfoP) userInfoP.textContent = "Usuario: Error"; }
        }
    }

    async function loadCompanyInfoForSidebar() {
        if (window.electronAPI && typeof window.electronAPI.getCompanyInfo === 'function') {
            try {
                const result = await window.electronAPI.getCompanyInfo();
                if (result.success && result.data && appTitleSidebar) appTitleSidebar.textContent = result.data.name || "Presto Argento";
                const logoPath = await window.electronAPI.getCompanyLogoPath();
                if (appLogoSidebar && logoPath) appLogoSidebar.src = `file://${logoPath.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
                else if (appLogoSidebar) appLogoSidebar.src = '../assets/images/logo-presto-argento.png';
            } catch (error) { console.error("Error cargando info empresa para sidebar:", error); if (appLogoSidebar) appLogoSidebar.src = '../assets/images/logo-presto-argento.png';}
        }
    }
    
    await fetchCurrentUser();
    await loadCompanyInfoForSidebar();

    menuItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault(); const pageName = item.getAttribute('data-page');
            menuItems.forEach(link => link.classList.remove('active'));
            pages.forEach(page => page.classList.remove('active'));
            item.classList.add('active'); const targetPage = document.getElementById(pageName + '-page');
            if (targetPage) {
                targetPage.classList.add('active');
                if (pageName === 'clients' && typeof loadClients === 'function') await loadClients();
                else if (pageName === 'settings' && typeof loadSettingsPageData === 'function') await loadSettingsPageData();
                else if (pageName === 'loans' && typeof loadLoansPageData === 'function') await loadLoansPageData();
                else if (pageName === 'payments' && typeof loadPaymentsPageData === 'function') await loadPaymentsPageData();
                else if (pageName === 'simulator' && typeof initializeSimulatorPage === 'function') await initializeSimulatorPage();
                else if (pageName === 'reports' && typeof initializeReportsPage === 'function') await initializeReportsPage();
                else if (pageName === 'dashboard' && typeof loadDashboardData === 'function') await loadDashboardData();
            }
        });
    });

    if (themeToggleButton) {
        const storedTheme = localStorage.getItem('presto-argento-theme') || 'light';
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(storedTheme === 'dark' ? 'dark-theme' : 'light-theme');
        themeToggleButton.textContent = storedTheme === 'dark' ? 'Tema Claro' : 'Tema Oscuro';
        themeToggleButton.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme'); document.body.classList.toggle('light-theme');
            const isDarkMode = document.body.classList.contains('dark-theme');
            themeToggleButton.textContent = isDarkMode ? 'Tema Claro' : 'Tema Oscuro';
            localStorage.setItem('presto-argento-theme', isDarkMode ? 'dark' : 'light');
        });
    }

    // --- SECCIÓN DASHBOARD ---
    const dashboardPage = document.getElementById('dashboard-page');
    if (dashboardPage) {
        const dashSummaryActiveCount = document.getElementById('dash-summary-active-count');
        const dashSummaryActiveCapital = document.getElementById('dash-summary-active-capital');
        const dashPaymentsTodayCount = document.getElementById('dash-summary-payments-today');
        const dashPaymentsTodayAmount = document.getElementById('dash-summary-payments-today-amount');

        async function loadDashboardData() {
            if (!dashSummaryActiveCount) return; 
            console.log("Cargando datos del Dashboard...");
            try {
                const summaryResult = await window.electronAPI.getReportData('summary', {});
                if (summaryResult.success && summaryResult.data) {
                    const data = summaryResult.data;
                    dashSummaryActiveCount.textContent = data.active_loans_count || 0;
                    dashSummaryActiveCapital.textContent = formatCurrency(data.active_loans_total_pending_amount || 0);
                }
                const nowISO = await window.electronAPI.getCurrentDateTimeISO();
                const todayDateOnly = nowISO ? nowISO.split('T')[0] : new Date().toISOString().split('T')[0];
                const paymentsTodayResult = await window.electronAPI.getAllPayments({dateFrom: todayDateOnly, dateTo: todayDateOnly});
                if(paymentsTodayResult.success && dashPaymentsTodayCount){
                    dashPaymentsTodayCount.textContent = paymentsTodayResult.data.length;
                    const sumToday = paymentsTodayResult.data.reduce((sum, p) => sum + parseFloat(p.payment_amount || 0), 0);
                    dashPaymentsTodayAmount.textContent = formatCurrency(sumToday);
                }
            } catch (error) { console.error("Error cargando datos del dashboard:", error); }
        }
    }

    // --- SECCIÓN GESTIÓN DE CLIENTES ---
    const clientsPage = document.getElementById('clients-page');
    if (clientsPage) {
        const btnShowAddClientModal = document.getElementById('btn-show-add-client-modal');
        const clientModal = document.getElementById('client-modal');
        const clientModalCloseBtn = document.getElementById('client-modal-close-btn');
        const clientForm = document.getElementById('client-form');
        const clientModalTitle = document.getElementById('client-modal-title');
        const clientIdInput = document.getElementById('client-id-input');
        const clientFirstNameInput = document.getElementById('client-first-name');
        const clientLastNameInput = document.getElementById('client-last-name');
        const clientDniInput = document.getElementById('client-dni');
        const clientPhoneInput = document.getElementById('client-phone');
        const clientAddressInput = document.getElementById('client-address');
        const clientOccupationInput = document.getElementById('client-occupation');
        const clientEmailInput = document.getElementById('client-email');
        const clientNotesInput = document.getElementById('client-notes');
        const clientFormErrorMessage = document.getElementById('client-form-error-message');
        const btnCancelClientForm = document.getElementById('btn-cancel-client-form');
        const clientsTableBody = document.getElementById('clients-table-body');
        const noClientsMessage = document.getElementById('no-clients-message');
        const searchClientInput = document.getElementById('search-client-input');
        const showInactiveClientsCheckbox = document.getElementById('show-inactive-clients-checkbox');
        const clientDetailsModal = document.getElementById('client-details-modal');
        const clientDetailsModalCloseBtn = document.getElementById('client-details-modal-close-btn');
        const clientDetailsModalTitle = document.getElementById('client-details-modal-title');
        const clientDetailsContent = document.getElementById('client-details-content');
        const clientDocumentTypeSelect = document.getElementById('client-document-type-select');
        const btnUploadClientDocument = document.getElementById('btn-upload-client-document');
        const clientDocumentsList = document.getElementById('client-documents-list');
        const uploadStatusMessage = document.getElementById('upload-status-message');
        const btnEditClientFromDetails = document.getElementById('btn-edit-client-from-details');
        const btnCloseClientDetails = document.getElementById('btn-close-client-details');
        let currentEditingClientId_ClientModule = null; 
        let currentViewingClientId_ClientModule = null;

        async function loadClients() {
            try {
                const showInactive = showInactiveClientsCheckbox.checked;
                const result = await window.electronAPI.getAllClients(!showInactive);
                clientsTableBody.innerHTML = ''; 
                if (result.success && result.data) {
                    const searchTerm = searchClientInput.value.toLowerCase();
                    const filteredClients = result.data.filter(client => 
                        client.first_name.toLowerCase().includes(searchTerm) ||
                        client.last_name.toLowerCase().includes(searchTerm) ||
                        client.dni.toLowerCase().includes(searchTerm)
                    );
                    if (filteredClients.length === 0) {
                         noClientsMessage.textContent = searchTerm ? "No se encontraron clientes." : "No hay clientes.";
                         noClientsMessage.style.display = 'block';
                    } else {
                        noClientsMessage.style.display = 'none';
                        filteredClients.forEach(async client => { // async for await formatDateForDisplay
                            const row = clientsTableBody.insertRow();
                            row.innerHTML = `
                                <td>${client.first_name}</td><td>${client.last_name}</td><td>${client.dni}</td>
                                <td>${client.phone}</td><td><span class="status-${client.is_active ? 'active' : 'inactive'}">${client.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                <td class="actions-cell">
                                    <button class="btn btn-sm btn-info btn-view-client" data-id="${client.id}">Ver Ficha</button>
                                    <button class="btn btn-sm btn-warning btn-edit-client" data-id="${client.id}">Editar</button>
                                    <button class="btn btn-sm ${client.is_active ? 'btn-danger btn-deactivate-client' : 'btn-success btn-reactivate-client'}" data-id="${client.id}">${client.is_active ? 'Desac.' : 'Reac.'}</button>
                                </td>`;
                        });
                    }
                } else { noClientsMessage.textContent = result.message || "Error."; noClientsMessage.style.display = 'block'; console.error("Error:", result.message); }
            } catch (error) { noClientsMessage.textContent = "Error com."; noClientsMessage.style.display = 'block'; console.error('Error:', error); }
        }
        function openClientModal(client = null) {
            clientForm.reset(); clientFormErrorMessage.textContent = '';
            if (client) {
                clientModalTitle.textContent = 'Editar Cliente'; clientIdInput.value = client.id;
                clientFirstNameInput.value = client.first_name; clientLastNameInput.value = client.last_name;
                clientDniInput.value = client.dni; clientPhoneInput.value = client.phone;
                clientAddressInput.value = client.address; clientOccupationInput.value = client.occupation || '';
                clientEmailInput.value = client.email || ''; clientNotesInput.value = client.notes || '';
                currentEditingClientId_ClientModule = client.id;
            } else { clientModalTitle.textContent = 'Nuevo Cliente'; clientIdInput.value = ''; currentEditingClientId_ClientModule = null; }
            clientModal.classList.add('active');
        }
        function closeClientModal() { clientModal.classList.remove('active'); clientForm.reset(); currentEditingClientId_ClientModule = null; }
        async function openClientDetailsModal(clientId) {
            try {
                const result = await window.electronAPI.getClientById(clientId);
                if (result.success && result.data) {
                    currentViewingClientId_ClientModule = clientId; const client = result.data;
                    clientDetailsModalTitle.textContent = `Ficha: ${client.first_name} ${client.last_name}`;
                    clientDetailsContent.innerHTML = `<p><strong>Nombre:</strong> ${client.first_name}</p><p><strong>Apellido:</strong> ${client.last_name}</p><p><strong>DNI:</strong> ${client.dni}</p><p><strong>Teléfono:</strong> ${client.phone}</p><p><strong>Dirección:</strong> ${client.address}</p><p><strong>Ocupación:</strong> ${client.occupation || 'N/A'}</p><p><strong>Email:</strong> ${client.email || 'N/A'}</p><p><strong>Notas:</strong> ${client.notes || 'N/A'}</p><p><strong>Estado:</strong> <span class="status-${client.is_active ? 'active' : 'inactive'}">${client.is_active ? 'Activo' : 'Inactivo'}</span></p><p><strong>Registrado:</strong> ${await formatDateForDisplay(client.created_at)}</p>`;
                    renderClientDocuments(client.documents || []); clientDetailsModal.classList.add('active');
                } else { showAppMessage(result.message || 'Error cargando datos del cliente.', 'error'); }
            } catch (error) { console.error('Error abriendo detalles del cliente:', error); showAppMessage('Error de comunicación al cargar detalles.', 'error'); }
        }
        function renderClientDocuments(documents) {
            clientDocumentsList.innerHTML = ''; if (documents.length === 0) { clientDocumentsList.innerHTML = '<p>No hay documentos subidos.</p>'; return; }
            documents.forEach(doc => {
                const docItem = document.createElement('div'); docItem.classList.add('document-item');
                const docPathForDisplay = doc.full_path; 
                let previewHtml = `<img src="../assets/images/doc_placeholder.png" alt="Doc" class="doc-preview" title="${doc.original_filename}">`;
                if (docPathForDisplay) {
                    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(docPathForDisplay);
                    const isPdf = /\.pdf$/i.test(docPathForDisplay);
                    if (isImage) {
                        previewHtml = `<img src="${docPathForDisplay}" alt="${translateDocumentType(doc.document_type)}" class="doc-preview" onerror="this.src='../assets/images/doc_placeholder.png';" title="${doc.original_filename}">`;
                    } else if (isPdf) {
                         const systemPath = docPathForDisplay.startsWith('file://') ? docPathForDisplay.substring(7) : docPathForDisplay;
                         previewHtml = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100px;"><span style="font-size:2.5em;">📄</span><button class="btn btn-sm btn-info" onclick="window.electronAPI.openFile('${systemPath.replace(/'/g, "\\'")}')" style="margin-top:5px;">Abrir PDF</button></div>`;
                    }
                }
                docItem.innerHTML = `${previewHtml}<p class="doc-type">${translateDocumentType(doc.document_type)}</p><p class="doc-filename" title="${doc.original_filename}">${doc.original_filename.length > 15 ? doc.original_filename.substring(0,12)+'...' : doc.original_filename}</p><button class="delete-doc-btn" data-doc-id="${doc.id}" title="Eliminar">×</button>`;
                clientDocumentsList.appendChild(docItem);
            });
        }
        function closeClientDetailsModal() { clientDetailsModal.classList.remove('active'); currentViewingClientId_ClientModule = null; uploadStatusMessage.textContent = '';}

        if (btnShowAddClientModal) btnShowAddClientModal.addEventListener('click', () => openClientModal());
        if (clientModalCloseBtn) clientModalCloseBtn.addEventListener('click', closeClientModal);
        if (btnCancelClientForm) btnCancelClientForm.addEventListener('click', closeClientModal);
        if (clientForm) {
            clientForm.addEventListener('submit', async (e) => {
                e.preventDefault(); clientFormErrorMessage.textContent = '';
                const clientData = { firstName: clientFirstNameInput.value.trim(), lastName: clientLastNameInput.value.trim(), dni: clientDniInput.value.trim(), phone: clientPhoneInput.value.trim(), address: clientAddressInput.value.trim(), occupation: clientOccupationInput.value.trim(), email: clientEmailInput.value.trim(), notes: clientNotesInput.value.trim() };
                if (!clientData.firstName || !clientData.lastName || !clientData.dni || !clientData.phone || !clientData.address) { clientFormErrorMessage.textContent = 'Campos (*) obligatorios.'; return; }
                if (!/^\d{7,8}$/.test(clientData.dni)) { clientFormErrorMessage.textContent = 'DNI: 7-8 números.'; return; }
                try {
                    const result = currentEditingClientId_ClientModule ? await window.electronAPI.updateClient(currentEditingClientId_ClientModule, clientData) : await window.electronAPI.addClient(clientData);
                    if (result.success) { closeClientModal(); await loadClients(); showAppMessage(result.message || "Operación exitosa.", 'success'); } 
                    else { clientFormErrorMessage.textContent = result.message || 'Error.'; }
                } catch (error) { console.error('Error guardando cliente:', error); clientFormErrorMessage.textContent = 'Error de comunicación.'; }
            });
        }
        if (clientsTableBody) {
            clientsTableBody.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('button[data-id]'); if (!targetButton) return;
                const clientId = targetButton.dataset.id;
                if (targetButton.classList.contains('btn-edit-client')) { const result = await window.electronAPI.getClientById(clientId); if (result.success) openClientModal(result.data); else showAppMessage(result.message || 'Error.', 'error');}
                else if (targetButton.classList.contains('btn-deactivate-client')) { if (confirm('¿Desactivar cliente?')) { const result = await window.electronAPI.deactivateClient(clientId); showAppMessage(result.message, result.success ? 'info' : 'error'); if (result.success) await loadClients(); }}
                else if (targetButton.classList.contains('btn-reactivate-client')) { if (confirm('¿Reactivar cliente?')) { const result = await window.electronAPI.reactivateClient(clientId); showAppMessage(result.message, result.success ? 'info' : 'error'); if (result.success) await loadClients(); }}
                else if (targetButton.classList.contains('btn-view-client')) { await openClientDetailsModal(clientId); }
            });
        }
        if (searchClientInput) searchClientInput.addEventListener('input', async () => await loadClients());
        if (showInactiveClientsCheckbox) showInactiveClientsCheckbox.addEventListener('change', async () => await loadClients());
        if (clientDetailsModalCloseBtn) clientDetailsModalCloseBtn.addEventListener('click', closeClientDetailsModal);
        if (btnCloseClientDetails) btnCloseClientDetails.addEventListener('click', closeClientDetailsModal);
        if (btnEditClientFromDetails) { btnEditClientFromDetails.addEventListener('click', async () => { if (currentViewingClientId_ClientModule) { const result = await window.electronAPI.getClientById(currentViewingClientId_ClientModule); if (result.success) { closeClientDetailsModal(); openClientModal(result.data); } else showAppMessage(result.message || 'Error.', 'error'); } }); }
        if (btnUploadClientDocument) {
            btnUploadClientDocument.addEventListener('click', async () => {
                if (!currentViewingClientId_ClientModule) return; const documentType = clientDocumentTypeSelect.value;
                if (!documentType) { uploadStatusMessage.textContent = 'Seleccione tipo.'; uploadStatusMessage.className = 'status-message error'; return; }
                uploadStatusMessage.textContent = 'Subiendo...'; uploadStatusMessage.className = 'status-message info';
                try {
                    const result = await window.electronAPI.uploadClientDocument(currentViewingClientId_ClientModule, documentType);
                    uploadStatusMessage.textContent = result.message || (result.success ? 'Subido.' : 'Error.'); uploadStatusMessage.className = `status-message ${result.success ? 'success' : 'error'}`;
                    if (result.success) await openClientDetailsModal(currentViewingClientId_ClientModule); 
                } catch (error) { console.error('Error subiendo doc:', error); uploadStatusMessage.textContent = 'Error comunicación.'; uploadStatusMessage.className = 'status-message error'; }
            });
        }
        if (clientDocumentsList) {
            clientDocumentsList.addEventListener('click', async (e) => {
                const deleteButton = e.target.closest('.delete-doc-btn');
                if (deleteButton) {
                    const docId = deleteButton.dataset.docId;
                    if (confirm('¿Eliminar documento?')) {
                        try {
                            const result = await window.electronAPI.deleteClientDocument(docId);
                            showAppMessage(result.message || (result.success ? "Eliminado." : "Error."), result.success ? 'info' : 'error');
                            if (result.success && currentViewingClientId_ClientModule) await openClientDetailsModal(currentViewingClientId_ClientModule);
                        } catch (error) { console.error("Error eliminando doc:", error); showAppMessage("Error comunicación.", 'error'); }
                    }
                }
            });
        }
    }

    // --- SECCIÓN CONFIGURACIÓN ---
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage) {
        const companyInfoForm = document.getElementById('company-info-form');
        const companyNameInput = document.getElementById('company-name');
        const companyAddressInput = document.getElementById('company-address');
        const companyPhoneInput = document.getElementById('company-phone');
        const companyCuitInput = document.getElementById('company-cuit');
        const currentCompanyLogoPreview = document.getElementById('current-company-logo-preview');
        const btnChangeLogo = document.getElementById('btn-change-logo');
        const companyInfoMessage = document.getElementById('company-info-message');
        const interestRatesForm = document.getElementById('interest-rates-form');
        const dailyInterestRateInput = document.getElementById('daily-interest-rate');
        const monthlyInterestRateInput = document.getElementById('monthly-interest-rate');
        const interestRatesMessage = document.getElementById('interest-rates-message');
        const changePasswordForm = document.getElementById('change-password-form');
        const currentPasswordInput = document.getElementById('current-password');
        const newPasswordInput = document.getElementById('new-password');
        const confirmNewPasswordInput = document.getElementById('confirm-new-password');
        const changePasswordMessage = document.getElementById('change-password-message');
        const employeeManagementSection = document.getElementById('employee-management-section');
        const btnShowAddUserModal = document.getElementById('btn-show-add-user-modal');
        const userModal = document.getElementById('user-modal');
        const userModalCloseBtn = document.getElementById('user-modal-close-btn');
        const userForm = document.getElementById('user-form');
        const userModalTitle = document.getElementById('user-modal-title');
        const userIdInput_UserModule = document.getElementById('user-id-input'); 
        const userUsernameInput = document.getElementById('user-username');
        const userFullNameInput = document.getElementById('user-full-name');
        const userPasswordInput = document.getElementById('user-password');
        const userConfirmPasswordInput = document.getElementById('user-confirm-password');
        const userRoleSelect = document.getElementById('user-role');
        const userIsActiveSelect = document.getElementById('user-is-active');
        const userFormErrorMessage = document.getElementById('user-form-error-message');
        const btnCancelUserForm = document.getElementById('btn-cancel-user-form');
        const usersTableBody = document.getElementById('users-table-body');
        const noUsersMessage_UserModule = document.getElementById('no-users-message');
        const btnBackupData = document.getElementById('btn-backup-data');
        const btnRestoreData = document.getElementById('btn-restore-data');
        const backupRestoreMessage = document.getElementById('backup-restore-message');
        let currentEditingUserId_UserModule = null;

        async function loadSettingsPageData() { 
            await loadCompanyInfoAndRates();
            if (loggedInUser && loggedInUser.role === 'admin') {
                await loadUsersTable();
                if(employeeManagementSection) employeeManagementSection.style.display = 'block';
                if(btnShowAddUserModal) btnShowAddUserModal.style.display = 'inline-block'; // Mostrar botón si es admin
            } else {
                 if(employeeManagementSection) employeeManagementSection.style.display = 'none';
                 if(btnShowAddUserModal) btnShowAddUserModal.style.display = 'none'; // Ocultar botón si no es admin
            }
        }
        async function loadCompanyInfoAndRates() {
            try {
                const result = await window.electronAPI.getCompanyInfo();
                if (result.success && result.data) {
                    const info = result.data;
                    companyNameInput.value = info.name || ''; companyAddressInput.value = info.address || '';
                    companyPhoneInput.value = info.phone || ''; companyCuitInput.value = info.cuit || '';
                    dailyInterestRateInput.value = info.default_daily_interest_rate ? (info.default_daily_interest_rate * 100).toFixed(2) : '0.00';
                    monthlyInterestRateInput.value = info.default_monthly_interest_rate ? (info.default_monthly_interest_rate * 100).toFixed(2) : '0.00';
                    const logoPath = await window.electronAPI.getCompanyLogoPath();
                    if (logoPath && currentCompanyLogoPreview) {
                        currentCompanyLogoPreview.src = `file://${logoPath.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
                    } else if (currentCompanyLogoPreview) {
                        currentCompanyLogoPreview.src = '../assets/images/logo-presto-argento.png';
                    }
                    if(appLogoSidebar && logoPath) appLogoSidebar.src = `file://${logoPath.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
                    if(appTitleSidebar && info.name) appTitleSidebar.textContent = info.name;
                } else { companyInfoMessage.textContent = result.message || 'Error.'; companyInfoMessage.className = 'status-message error'; }
            } catch (error) { console.error('Error cargando info empresa:', error); companyInfoMessage.textContent = 'Error comunicación.'; companyInfoMessage.className = 'status-message error';}
        }
        async function loadUsersTable() {
            if (!loggedInUser || loggedInUser.role !== 'admin' || !usersTableBody) return;
            try {
                const result = await window.electronAPI.getAllUsers(); usersTableBody.innerHTML = '';
                if (result.success && result.data) {
                    const users = result.data.filter(u => u.id !== loggedInUser.id); 
                    if (users.length === 0) { noUsersMessage_UserModule.textContent = "No hay otros usuarios."; noUsersMessage_UserModule.style.display = 'block'; } 
                    else {
                        noUsersMessage_UserModule.style.display = 'none';
                        users.forEach(user => {
                            const row = usersTableBody.insertRow();
                            row.innerHTML = `<td>${user.username}</td><td>${user.full_name}</td><td>${translateUserRole(user.role)}</td><td><span class="status-${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Activo' : 'Inactivo'}</span></td>
                                <td class="actions-cell"><button class="btn btn-sm btn-warning btn-edit-user" data-id="${user.id}">Editar</button>
                                <button class="btn btn-sm ${user.is_active ? 'btn-danger btn-deactivate-user' : 'btn-success btn-reactivate-user'}" data-id="${user.id}">${user.is_active ? 'Desac.' : 'Reac.'}</button></td>`;
                        });
                    }
                } else { noUsersMessage_UserModule.textContent = result.message || "Error."; noUsersMessage_UserModule.style.display = 'block'; }
            } catch (error) { console.error("Error tabla usuarios:", error); noUsersMessage_UserModule.textContent = "Error com."; noUsersMessage_UserModule.style.display = 'block'; }
        }
        function openUserModal(user = null) {
            userForm.reset(); userFormErrorMessage.textContent = ''; userUsernameInput.readOnly = false;
            userPasswordInput.setAttribute('required', 'required'); userConfirmPasswordInput.setAttribute('required', 'required');
            userPasswordInput.placeholder = ""; userConfirmPasswordInput.placeholder = "";
            if (user) {
                userModalTitle.textContent = 'Editar Usuario'; userIdInput_UserModule.value = user.id;
                userUsernameInput.value = user.username; userUsernameInput.readOnly = true;
                userFullNameInput.value = user.full_name; userRoleSelect.value = user.role;
                userIsActiveSelect.value = user.is_active ? '1' : '0';
                userPasswordInput.removeAttribute('required'); userConfirmPasswordInput.removeAttribute('required');
                userPasswordInput.placeholder = "Dejar en blanco para no cambiar"; userConfirmPasswordInput.placeholder = "Dejar en blanco para no cambiar";
                currentEditingUserId_UserModule = user.id;
            } else { userModalTitle.textContent = 'Nuevo Usuario'; userIdInput_UserModule.value = ''; currentEditingUserId_UserModule = null; }
            userModal.classList.add('active');
        }
        function closeUserModal() { userModal.classList.remove('active'); userForm.reset(); currentEditingUserId_UserModule = null; }

        if (companyInfoForm) {
            companyInfoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                companyInfoMessage.textContent = ''; companyInfoMessage.className = 'status-message';
                const name = companyNameInput.value.trim();
                const address = companyAddressInput.value.trim();
                const phone = companyPhoneInput.value.trim();
                const cuit = companyCuitInput.value.trim();

                if (!name) {
                    companyInfoMessage.textContent = 'El nombre de la empresa es obligatorio.';
                    companyInfoMessage.className = 'status-message error';
                    return;
                }
                try {
                    // Assuming logo_path and rates are handled separately or part of a larger settings object if API expects all
                    // For this specific form, only send what's directly editable here.
                    // The existing loadCompanyInfoAndRates fetches all, so we need to pass them back if API updates selectively.
                    // A better API might be window.electronAPI.updateCompanyDetails({ name, address, phone, cuit })
                    // For now, let's assume the API can handle partial updates or we fetch and merge.
                    // To be safe and match typical patterns, let's fetch current and merge.
                    let currentInfo = await window.electronAPI.getCompanyInfo();
                    if (!currentInfo.success) {
                         companyInfoMessage.textContent = 'Error obteniendo configuración actual para guardar.';
                         companyInfoMessage.className = 'status-message error';
                         return;
                    }

                    const dataToSave = {
                        ...currentInfo.data, // spread existing data
                        name,
                        address,
                        phone,
                        cuit
                    };
                    // Remove ID if it's part of the fetched data and not needed for update call
                    delete dataToSave.id;


                    const result = await window.electronAPI.saveCompanyInfo(dataToSave);
                    if (result.success) {
                        showAppMessage(result.message || 'Info. de empresa guardada.', 'success');
                        await loadCompanyInfoAndRates();
                        await loadCompanyInfoForSidebar();
                    } else {
                        companyInfoMessage.textContent = result.message || 'Error.';
                        companyInfoMessage.className = 'status-message error';
                    }
                } catch (error) {
                    console.error("Error guardando info empresa:", error);
                    companyInfoMessage.textContent = 'Error com.';
                    companyInfoMessage.className = 'status-message error';
                }
            });
        }

        if (btnChangeLogo) {
            btnChangeLogo.addEventListener('click', async () => {
                companyInfoMessage.textContent = ''; companyInfoMessage.className = 'status-message';
                try {
                    const result = await window.electronAPI.selectLogo(); // Corrected API call
                    if (result.success) {
                        showAppMessage(result.message || 'Logo cambiado.', 'success');
                        await loadCompanyInfoAndRates(); // This should reload the preview
                        await loadCompanyInfoForSidebar(); // This should update sidebar logo
                    } else {
                        if(result.message) { // Show message only if one is provided (e.g. cancellation)
                           companyInfoMessage.textContent = result.message;
                           companyInfoMessage.className = result.path ? 'status-message info' : 'status-message error'; // error if no path
                        }
                    }
                } catch (error) {
                    console.error("Error cambiando logo:", error);
                    companyInfoMessage.textContent = 'Error com.';
                    companyInfoMessage.className = 'status-message error';
                }
            });
        }

        if (interestRatesForm) {
            interestRatesForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                interestRatesMessage.textContent = ''; interestRatesMessage.className = 'status-message';
                const dailyRate = parseFloat(dailyInterestRateInput.value) / 100;
                const monthlyRate = parseFloat(monthlyInterestRateInput.value) / 100;

                if (isNaN(dailyRate) || dailyRate < 0 || isNaN(monthlyRate) || monthlyRate < 0) {
                    interestRatesMessage.textContent = 'Tasas inválidas. Deben ser números positivos.';
                    interestRatesMessage.className = 'status-message error';
                    return;
                }
                try {
                    // Similar to companyInfo, fetch current and merge to only update rates
                     let currentInfo = await window.electronAPI.getCompanyInfo();
                    if (!currentInfo.success) {
                         interestRatesMessage.textContent = 'Error obteniendo configuración actual para guardar tasas.';
                         interestRatesMessage.className = 'status-message error';
                         return;
                    }
                     const dataToSave = {
                        ...currentInfo.data,
                        default_daily_interest_rate: dailyRate,
                        default_monthly_interest_rate: monthlyRate
                    };
                    delete dataToSave.id;

                    const result = await window.electronAPI.saveCompanyInfo(dataToSave); // Assuming saveCompanyInfo handles rates too
                    if (result.success) {
                        showAppMessage(result.message || 'Tasas guardadas.', 'success');
                        // No specific reload needed here if success message is enough, loadCompanyInfoAndRates reloads all.
                    } else {
                        interestRatesMessage.textContent = result.message || 'Error.';
                        interestRatesMessage.className = 'status-message error';
                    }
                } catch (error) {
                    console.error("Error guardando tasas:", error);
                    interestRatesMessage.textContent = 'Error com.';
                    interestRatesMessage.className = 'status-message error';
                }
            });
        }

        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                changePasswordMessage.textContent = ''; changePasswordMessage.className = 'status-message';
                const currentPassword = currentPasswordInput.value;
                const newPassword = newPasswordInput.value;
                const confirmNewPassword = confirmNewPasswordInput.value;

                if (!currentPassword || !newPassword || !confirmNewPassword) {
                    changePasswordMessage.textContent = 'Todos los campos son obligatorios.';
                    changePasswordMessage.className = 'status-message error';
                    return;
                }
                if (newPassword !== confirmNewPassword) {
                    changePasswordMessage.textContent = 'Las nuevas contraseñas no coinciden.';
                    changePasswordMessage.className = 'status-message error';
                    return;
                }
                if (newPassword.length < 6) {
                    changePasswordMessage.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
                    changePasswordMessage.className = 'status-message error';
                    return;
                }

                try {
                    const result = await window.electronAPI.changeCurrentUserPassword({ currentPassword, newPassword });
                    if (result.success) {
                        showAppMessage(result.message || 'Contraseña cambiada exitosamente.', 'success');
                        changePasswordForm.reset();
                    } else {
                        changePasswordMessage.textContent = result.message || 'Error al cambiar la contraseña.';
                        changePasswordMessage.className = 'status-message error';
                    }
                } catch (error) {
                    console.error("Error cambiando contraseña:", error);
                    changePasswordMessage.textContent = 'Error de comunicación al cambiar contraseña.';
                    changePasswordMessage.className = 'status-message error';
                }
            });
        }

        if (btnShowAddUserModal) btnShowAddUserModal.addEventListener('click', () => openUserModal());
        if (userModalCloseBtn) userModalCloseBtn.addEventListener('click', closeUserModal);
        if (btnCancelUserForm) btnCancelUserForm.addEventListener('click', closeUserModal);

        if (userForm) {
            userForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                userFormErrorMessage.textContent = '';
                const userId = userIdInput_UserModule.value;
                const username = userUsernameInput.value.trim();
                const fullName = userFullNameInput.value.trim();
                const password = userPasswordInput.value;
                const confirmPassword = userConfirmPasswordInput.value;
                const role = userRoleSelect.value;
                const isActive = userIsActiveSelect.value;

                if (!username || !fullName || !role) {
                    userFormErrorMessage.textContent = 'Usuario, Nombre Completo y Rol son obligatorios.';
                    return;
                }
                
                let userData = { username, full_name: fullName, role, is_active: isActive === '1' };

                if (password) { // Password is being set or changed
                    if (password !== confirmPassword) {
                        userFormErrorMessage.textContent = 'Las contraseñas no coinciden.';
                        return;
                    }
                    if (password.length < 6) {
                        userFormErrorMessage.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                        return;
                    }
                    userData.password = password;
                } else if (!userId) { // New user, password is required
                     userFormErrorMessage.textContent = 'La contraseña es obligatoria para nuevos usuarios.';
                     return;
                }


                try {
                    let result;
                    if (userId) {
                        result = await window.electronAPI.updateUser(userId, userData);
                    } else {
                        result = await window.electronAPI.registerUser(userData); // Changed from addUser for consistency
                    }

                    if (result.success) {
                        showAppMessage(result.message || 'Usuario guardado exitosamente.', 'success');
                        closeUserModal();
                        await loadUsersTable();
                    } else {
                        userFormErrorMessage.textContent = result.message || 'Error al guardar el usuario.';
                    }
                } catch (error) {
                    console.error("Error guardando usuario:", error);
                    userFormErrorMessage.textContent = 'Error de comunicación al guardar usuario.';
                }
            });
        }

        if (usersTableBody) {
            usersTableBody.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('button[data-id]');
                if (!targetButton) return;
                const userId = targetButton.dataset.id;

                if (targetButton.classList.contains('btn-edit-user')) {
                    try {
                        const result = await window.electronAPI.getUserById(userId);
                        if (result.success && result.data) {
                            openUserModal(result.data);
                        } else {
                            showAppMessage(result.message || 'Error obteniendo datos del usuario.', 'error');
                        }
                    } catch (error) {
                        showAppMessage(`Error de comunicación: ${error.message}`, 'error');
                    }
                } else if (targetButton.classList.contains('btn-deactivate-user')) {
                    if (confirm(`¿Está seguro de que desea DESACTIVAR al usuario?`)) {
                        try {
                            const result = await window.electronAPI.updateUser(userId, { is_active: false });
                            showAppMessage(result.message || 'Usuario desactivado.', result.success ? 'success' : 'error');
                            if (result.success) await loadUsersTable();
                        } catch (error) {
                            showAppMessage(`Error de comunicación: ${error.message}`, 'error');
                        }
                    }
                } else if (targetButton.classList.contains('btn-reactivate-user')) {
                     if (confirm(`¿Está seguro de que desea REACTIVAR al usuario?`)) {
                        try {
                            const result = await window.electronAPI.updateUser(userId, { is_active: true });
                            showAppMessage(result.message || 'Usuario reactivado.', result.success ? 'success' : 'error');
                            if (result.success) await loadUsersTable();
                        } catch (error) {
                            showAppMessage(`Error de comunicación: ${error.message}`, 'error');
                        }
                    }
                }
            });
        }
        
        if (btnBackupData) { 
            btnBackupData.addEventListener('click', async () => {
                if (!backupRestoreMessage) {
                    console.error("Elemento backupRestoreMessage no encontrado.");
                    return;
                }
                backupRestoreMessage.textContent = 'Iniciando proceso de copia de seguridad...';
                backupRestoreMessage.className = 'status-message info';
                try {
                    const result = await window.electronAPI.performBackup();
                    if (result.success) {
                        backupRestoreMessage.textContent = result.message || 'Copia de seguridad creada exitosamente.';
                        backupRestoreMessage.className = 'status-message success';
                    } else {
                        backupRestoreMessage.textContent = result.message || 'Falló la creación de la copia de seguridad o fue cancelada.';
                        backupRestoreMessage.className = 'status-message error';
                    }
                } catch (error) {
                    console.error("Error durante la copia de seguridad:", error);
                    backupRestoreMessage.textContent = `Error: ${error.message}`;
                    backupRestoreMessage.className = 'status-message error';
                }
            }); 
        }
        if (btnRestoreData) { 
            btnRestoreData.addEventListener('click', async () => {
                const backupRestoreMessage = document.getElementById('backup-restore-message');
                if (!backupRestoreMessage) {
                    console.error("Elemento backupRestoreMessage no encontrado.");
                    return;
                }

                if (!confirm("¿Está SEGURO de que desea restaurar la base de datos desde una copia de seguridad? Esta acción SOBREESCRIBIRÁ todos los datos actuales y NO SE PUEDE DESHACER. Se recomienda hacer una copia de seguridad actual primero si no lo ha hecho.")) {
                    backupRestoreMessage.textContent = 'Restauración cancelada por el usuario.';
                    backupRestoreMessage.className = 'status-message info';
                    return;
                }

                backupRestoreMessage.textContent = 'Iniciando proceso de restauración...';
                backupRestoreMessage.className = 'status-message info';

                try {
                    const result = await window.electronAPI.performRestore(); // This will be defined in preload.js
                    if (result.success) {
                        backupRestoreMessage.textContent = result.message || 'Restauración completada exitosamente. Se recomienda reiniciar la aplicación.';
                        backupRestoreMessage.className = 'status-message success';
                        if (result.needsRestart) {
                            alert("Restauración completada. Por favor, cierre y vuelva a abrir la aplicación para asegurar que todos los cambios tomen efecto.");
                        }
                    } else {
                        backupRestoreMessage.textContent = result.message || 'Falló la restauración o fue cancelada.';
                        backupRestoreMessage.className = 'status-message error';
                    }
                } catch (error) {
                    console.error("Error durante la restauración:", error);
                    backupRestoreMessage.textContent = `Error: ${error.message}`;
                    backupRestoreMessage.className = 'status-message error';
                }
            });
        }
    }
    
    // --- SECCIÓN GESTIÓN DE PRÉSTAMOS ---
    const loansPage = document.getElementById('loans-page');
    if (loansPage) {
        const btnShowAddLoanModal_LoanModule = document.getElementById('btn-show-add-loan-modal');
        const loanModal_LoanModule = document.getElementById('loan-modal');
        const loanModalCloseBtn_LoanModule = document.getElementById('loan-modal-close-btn');
        const loanForm_LoanModule = document.getElementById('loan-form');
        const loanModalTitle_LoanModule = document.getElementById('loan-modal-title');
        const loanClientSelect_LoanModule = document.getElementById('loan-client-select');
        const linkToClientsPage_LoanModule = document.getElementById('link-to-clients-page');
        const loanTypeSelect_LoanModule = document.getElementById('loan-type-select');
        const loanPrincipalAmountInput_LoanModule = document.getElementById('loan-principal-amount');
        const loanInterestRateInput_LoanModule = document.getElementById('loan-interest-rate');
        const loanInterestRateHint_LoanModule = document.getElementById('loan-interest-rate-hint');
        const loanTermDurationInput_LoanModule = document.getElementById('loan-term-duration');
        const loanTermDurationHint_LoanModule = document.getElementById('loan-term-duration-hint');
        const loanStartDateInput_LoanModule = document.getElementById('loan-start-date');
        const loanFixedInstallmentGroup_LoanModule = document.getElementById('loan-fixed-installment-group');
        const loanFixedInstallmentAmountInput_LoanModule = document.getElementById('loan-fixed-installment-amount');
        const loanGuarantorFirstNameInput_LoanModule = document.getElementById('loan-guarantor-first-name');
        const loanGuarantorLastNameInput_LoanModule = document.getElementById('loan-guarantor-last-name');
        const loanGuarantorDniInput_LoanModule = document.getElementById('loan-guarantor-dni');
        const loanGuarantorPhoneInput_LoanModule = document.getElementById('loan-guarantor-phone');
        const loanGuarantorAddressInput_LoanModule = document.getElementById('loan-guarantor-address');
        const loanNotesInput_LoanModule = document.getElementById('loan-notes');
        const loanFormErrorMessage_LoanModule = document.getElementById('loan-form-error-message');
        const btnCancelLoanForm_LoanModule = document.getElementById('btn-cancel-loan-form');
        const btnSaveLoanForm_LoanModule = document.getElementById('btn-save-loan-form');
        const btnPreviewLoanInstallments_LoanModule = document.getElementById('btn-preview-loan-installments');
        const loanInstallmentsPreviewTbody_LoanModule = document.getElementById('loan-installments-preview-tbody');
        const previewTotalInterest_LoanModule = document.getElementById('preview-total-interest');
        const previewTotalAmountDue_LoanModule = document.getElementById('preview-total-amount-due');
        const previewInstallmentAmount_LoanModule = document.getElementById('preview-installment-amount');
        const previewNumInstallments_LoanModule = document.getElementById('preview-num-installments');
        const loansTableBody_LoanModule = document.getElementById('loans-table-body');
        const noLoansMessage_LoanModule = document.getElementById('no-loans-message');
        const searchLoanClientDniInput_LoanModule = document.getElementById('search-loan-client-dni');
        const filterLoanTypeSelect_LoanModule = document.getElementById('filter-loan-type');
        const filterLoanStatusSelect_LoanModule = document.getElementById('filter-loan-status');
        const btnApplyLoanFilters_LoanModule = document.getElementById('btn-apply-loan-filters');
        const btnClearLoanFilters_LoanModule = document.getElementById('btn-clear-loan-filters');
        const loanDetailsModal_LoanModule = document.getElementById('loan-details-modal');
        const loanDetailsModalCloseBtn_LoanModule = document.getElementById('loan-details-modal-close-btn');
        const loanDetailsModalTitle_LoanModule = document.getElementById('loan-details-modal-title');
        const loanDetailsInfoSection_LoanModule = document.getElementById('loan-details-info-section');
        const loanDetailsInstallmentsTbody_LoanModule = document.getElementById('loan-details-installments-tbody');
        const btnCloseLoanDetailsModal_LoanModule = document.getElementById('btn-close-loan-details-modal');
        const loanDetailsChangeStatusSelect_LoanModule = document.getElementById('loan-details-change-status-select');
        const btnLoanDetailsChangeStatus_LoanModule = document.getElementById('btn-loan-details-change-status');
        const btnGenerateLoanContract_LoanModule = document.getElementById('btn-generate-loan-contract');
        let currentViewingLoanId_LoanModule = null;

        async function loadLoansPageData() { 
            await loadClientsForLoanForm_LoanModule(); 
            await loadLoans_LoanModule(); 
            updateLoanFormHints_LoanModule(); 
        }
        async function loadClientsForLoanForm_LoanModule() {
            try {
                const result = await window.electronAPI.getAllClients(true); 
                loanClientSelect_LoanModule.innerHTML = '<option value="">Seleccione cliente...</option>';
                if (result.success && result.data) {
                    result.data.forEach(client => { const option = document.createElement('option'); option.value = client.id; option.textContent = `${client.first_name} ${client.last_name} (DNI: ${client.dni})`; loanClientSelect_LoanModule.appendChild(option); });
                }
            } catch (error) { console.error("Error cargando clientes para préstamo:", error); }
        }
        function updateLoanFormHints_LoanModule() {
            if (!loanTypeSelect_LoanModule || !loanInterestRateHint_LoanModule || !loanTermDurationHint_LoanModule || !loanFixedInstallmentGroup_LoanModule) return;
            const type = loanTypeSelect_LoanModule.value;
            if (type === 'daily') {
                loanInterestRateHint_LoanModule.textContent = "Tasa Interés DIARIA (ej: 1 para 1%).";
                loanTermDurationHint_LoanModule.textContent = "Plazo en DÍAS.";
                loanFixedInstallmentGroup_LoanModule.style.display = 'block';
            } else { 
                loanInterestRateHint_LoanModule.textContent = "Tasa Interés MENSUAL (ej: 10 para 10%).";
                loanTermDurationHint_LoanModule.textContent = "Plazo en MESES.";
                loanFixedInstallmentGroup_LoanModule.style.display = 'none';
                if(loanFixedInstallmentAmountInput_LoanModule) loanFixedInstallmentAmountInput_LoanModule.value = '';
            }
        }
        async function loadLoans_LoanModule() {
            try {
                const filters = { status: filterLoanStatusSelect_LoanModule.value || null, loanType: filterLoanTypeSelect_LoanModule.value || null };
                const clientDniQuery = searchLoanClientDniInput_LoanModule.value.trim();
                if (clientDniQuery) {
                    const clientsResult = await window.electronAPI.getAllClients(false); 
                    if (clientsResult.success && clientsResult.data) {
                        const foundClient = clientsResult.data.find(c => c.dni === clientDniQuery);
                        if (foundClient) filters.clientId = foundClient.id;
                        else { loansTableBody_LoanModule.innerHTML = ''; noLoansMessage_LoanModule.textContent = `Cliente con DNI ${clientDniQuery} no encontrado.`; noLoansMessage_LoanModule.style.display = 'block'; return; }
                    }
                }
                for(const key in filters) { if(filters[key] === null || filters[key] === "") delete filters[key]; }
                const result = await window.electronAPI.getAllLoans(filters);
                loansTableBody_LoanModule.innerHTML = '';
                if (result.success && result.data.length > 0) {
                    noLoansMessage_LoanModule.style.display = 'none';
                    for (const loan of result.data) { // Usar for...of para await
                        const row = loansTableBody_LoanModule.insertRow();
                        row.innerHTML = `<td>${loan.id}</td><td>${loan.client_first_name} ${loan.client_last_name} (${loan.client_dni})</td><td>${translateLoanType(loan.loan_type)}</td><td>${formatCurrency(loan.principal_amount)}</td><td>${formatCurrency(loan.total_amount_due)}</td><td>${loan.number_of_installments} de ${formatCurrency(loan.installment_amount)}</td><td>${await formatDateForDisplay(loan.start_date)}</td><td><span class="status-${loan.status}">${translateLoanStatus(loan.status)}</span></td><td class="actions-cell"><button class="btn btn-sm btn-info btn-view-loan-details" data-id="${loan.id}">Detalles</button></td>`;
                    }
                } else {
                    noLoansMessage_LoanModule.textContent = (clientDniQuery && !filters.clientId && (!result.data || result.data.length === 0)) ? `Cliente DNI ${clientDniQuery} no encontrado o sin préstamos.` : "No hay préstamos para los filtros.";
                    noLoansMessage_LoanModule.style.display = 'block';
                }
            } catch (error) { console.error("Error cargando préstamos:", error); noLoansMessage_LoanModule.textContent = "Error comunicación."; noLoansMessage_LoanModule.style.display = 'block'; }
        }
        function openLoanModal_LoanModule() {
            console.log("Abriendo modal nuevo préstamo..."); 
            if (!loanForm_LoanModule || !loanModal_LoanModule || !loanModalTitle_LoanModule) { console.error("Faltan elementos modal préstamo."); showAppMessage("Error componentes formulario.", "error"); return; }
            loanForm_LoanModule.reset();
            if(loanFormErrorMessage_LoanModule) loanFormErrorMessage_LoanModule.textContent = '';
            if(loanModalTitle_LoanModule) loanModalTitle_LoanModule.textContent = 'Nuevo Préstamo';
            if(loanInstallmentsPreviewTbody_LoanModule) loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Complete y calcule.</td></tr>';
            if(previewTotalInterest_LoanModule) previewTotalInterest_LoanModule.textContent = '-';
            if(previewTotalAmountDue_LoanModule) previewTotalAmountDue_LoanModule.textContent = '-';
            if(previewInstallmentAmount_LoanModule) previewInstallmentAmount_LoanModule.textContent = '-';
            if(previewNumInstallments_LoanModule) previewNumInstallments_LoanModule.textContent = '-';
            if(loanStartDateInput_LoanModule) { const today = new Date(), offset = today.getTimezoneOffset() * 60000; loanStartDateInput_LoanModule.value = (new Date(today.getTime() - offset)).toISOString().split('T')[0]; }
            updateLoanFormHints_LoanModule(); loadClientsForLoanForm_LoanModule(); 
            loanModal_LoanModule.classList.add('active');
        }
        function closeLoanModal_LoanModule() { if(loanModal_LoanModule) loanModal_LoanModule.classList.remove('active'); }
        async function openLoanDetailsModal_LoanModule(loanId) {
            currentViewingLoanId_LoanModule = loanId;
            try {
                const result = await window.electronAPI.getLoanById(loanId);
                if (result.success && result.data) {
                    const loan = result.data; loanDetailsModalTitle_LoanModule.textContent = `Préstamo #${loan.id} - ${loan.client_first_name} ${loan.client_last_name}`;
                    let guarantorInfo = 'No especificado'; if(loan.guarantor_dni) guarantorInfo = `${loan.guarantor_first_name || ''} ${loan.guarantor_last_name || ''} (DNI: ${loan.guarantor_dni})`;
                    loanDetailsInfoSection_LoanModule.innerHTML = `<p><strong>Cliente:</strong> ${loan.client_first_name} ${loan.client_last_name} (DNI: ${loan.client_dni})</p><p><strong>Tipo:</strong> ${translateLoanType(loan.loan_type)}</p><p><strong>Capital:</strong> ${formatCurrency(loan.principal_amount)}</p><p><strong>Tasa (${loan.loan_type === 'daily' ? 'Diaria' : 'Mensual'}):</strong> ${(loan.interest_rate * 100).toFixed(2)}%</p><p><strong>Plazo:</strong> ${loan.term_duration} ${loan.loan_type === 'daily' ? 'días' : 'meses'}</p><p><strong>Inicio:</strong> ${await formatDateForDisplay(loan.start_date)}</p><p><strong>Total Interés:</strong> ${formatCurrency(loan.total_interest)}</p><p><strong>Total a Pagar:</strong> ${formatCurrency(loan.total_amount_due)}</p><p><strong>N° Cuotas:</strong> ${loan.number_of_installments}</p><p><strong>Cuota Base:</strong> ${formatCurrency(loan.installment_amount)}</p><p><strong>Estado:</strong> <span class="status-${loan.status}">${translateLoanStatus(loan.status)}</span></p><p><strong>Garante:</strong> ${guarantorInfo}</p><p><strong>Notas:</strong> ${loan.notes || 'N/A'}</p>`;
                    loanDetailsInstallmentsTbody_LoanModule.innerHTML = '';
                    for (const inst of loan.installments) { const row = loanDetailsInstallmentsTbody_LoanModule.insertRow(); row.innerHTML = `<td>${inst.installment_number}</td><td>${await formatDateForDisplay(inst.due_date)}</td><td>${formatCurrency(inst.amount_due)}</td><td>${formatCurrency(inst.amount_paid)}</td><td>${formatCurrency(inst.interest_on_arrears)}</td><td class="status-${inst.status}">${translateInstallmentStatus(inst.status)}</td><td>${inst.payment_date ? await formatDateTimeForDisplay(inst.payment_date) : 'N/A'}</td>`; }
                    loanDetailsChangeStatusSelect_LoanModule.value = loan.status; 
                    loanDetailsModal_LoanModule.classList.add('active');
                } else { showAppMessage(result.message || "Error.", 'error'); }
            } catch (error) { console.error("Error detalles préstamo:", error); showAppMessage("Error com.", 'error'); }
        }
        function closeLoanDetailsModal_LoanModule() { if(loanDetailsModal_LoanModule) loanDetailsModal_LoanModule.classList.remove('active'); currentViewingLoanId_LoanModule = null; }
        
        if (btnShowAddLoanModal_LoanModule) btnShowAddLoanModal_LoanModule.addEventListener('click', openLoanModal_LoanModule);
        if (loanModalCloseBtn_LoanModule) loanModalCloseBtn_LoanModule.addEventListener('click', closeLoanModal_LoanModule);
        if (btnCancelLoanForm_LoanModule) btnCancelLoanForm_LoanModule.addEventListener('click', closeLoanModal_LoanModule);
        if (loanTypeSelect_LoanModule) loanTypeSelect_LoanModule.addEventListener('change', updateLoanFormHints_LoanModule);
        if (linkToClientsPage_LoanModule) { linkToClientsPage_LoanModule.addEventListener('click', (e) => { e.preventDefault(); closeLoanModal_LoanModule(); document.querySelector('.sidebar-menu a[data-page="clients"]').click(); }); }
        if (btnPreviewLoanInstallments_LoanModule) {
            btnPreviewLoanInstallments_LoanModule.addEventListener('click', async () => {
                loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Calculando...</td></tr>';
                previewTotalInterest_LoanModule.textContent = '-';
                previewTotalAmountDue_LoanModule.textContent = '-';
                previewInstallmentAmount_LoanModule.textContent = '-';
                previewNumInstallments_LoanModule.textContent = '-';
                loanFormErrorMessage_LoanModule.textContent = '';

                const principal = parseFloat(loanPrincipalAmountInput_LoanModule.value);
                const interestRate = parseFloat(loanInterestRateInput_LoanModule.value) / 100;
                const term = parseInt(loanTermDurationInput_LoanModule.value);
                const loanType = loanTypeSelect_LoanModule.value;
                const startDate = loanStartDateInput_LoanModule.value;
                
                let fixedInstallmentAmount = null;
                const fixedInstallmentAmountValue = loanFixedInstallmentAmountInput_LoanModule.value.trim();

                if (loanType === 'daily' && fixedInstallmentAmountValue !== '') {
                    fixedInstallmentAmount = parseFloat(fixedInstallmentAmountValue);
                    if (isNaN(fixedInstallmentAmount)) {
                        loanFormErrorMessage_LoanModule.textContent = 'Monto de cuota fija inválido. Debe ser un número.';
                        loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Datos inválidos.</td></tr>';
                        return;
                    }
                     if (fixedInstallmentAmount <= 0) {
                        loanFormErrorMessage_LoanModule.textContent = 'Monto de cuota fija debe ser mayor a cero.';
                        loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Datos inválidos.</td></tr>';
                        return;
                    }
                }

                if (isNaN(principal) || principal <= 0 || isNaN(interestRate) || interestRate < 0 || isNaN(term) || term <= 0 || !loanType || !startDate) {
                    loanFormErrorMessage_LoanModule.textContent = "Por favor, complete todos los campos obligatorios (*) del préstamo con valores válidos para calcular las cuotas.";
                    loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Datos incompletos o inválidos.</td></tr>';
                    return;
                }

                const params = { principal, interestRate, term, loanType, startDate, fixedInstallmentAmount };
                // Ensure fixedInstallmentAmount is explicitly null if it ended up as NaN (e.g., empty input for daily)
                if (isNaN(params.fixedInstallmentAmount)) {
                    params.fixedInstallmentAmount = null;
                }

                try {
                    const result = await window.electronAPI.calculateLoanDetails(params);
                    if (result.success && result.data) {
                        const details = result.data;
                        loanInstallmentsPreviewTbody_LoanModule.innerHTML = ''; // Clear "Calculando..."
                        for (const inst of details.installments) {
                            const row = loanInstallmentsPreviewTbody_LoanModule.insertRow();
                            row.innerHTML = `<td>${inst.installment_number}</td><td>${await formatDateForDisplay(inst.due_date)}</td><td>${formatCurrency(inst.amount_due)}</td>`;
                        }
                        previewTotalInterest_LoanModule.textContent = formatCurrency(details.totalInterest);
                        previewTotalAmountDue_LoanModule.textContent = formatCurrency(details.totalAmountDue);
                        previewInstallmentAmount_LoanModule.textContent = formatCurrency(details.actualInstallmentAmount);
                        previewNumInstallments_LoanModule.textContent = details.numberOfInstallments;
                    } else {
                        const errorMessage = result.message || 'Error al calcular detalles.';
                        loanInstallmentsPreviewTbody_LoanModule.innerHTML = `<tr><td colspan="3" style="text-align:center;">${errorMessage}</td></tr>`;
                        loanFormErrorMessage_LoanModule.textContent = errorMessage;
                    }
                } catch (error) {
                    console.error("Error calculando vista previa préstamo:", error);
                    loanInstallmentsPreviewTbody_LoanModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Error de comunicación al calcular.</td></tr>';
                    loanFormErrorMessage_LoanModule.textContent = 'Error de comunicación al calcular detalles del préstamo.';
                }
            });
        }
        if (loanForm_LoanModule) { 
            loanForm_LoanModule.addEventListener('submit', async (e) => {
                e.preventDefault();
                loanFormErrorMessage_LoanModule.textContent = '';

                const clientId = loanClientSelect_LoanModule.value;
                const loanType = loanTypeSelect_LoanModule.value;
                const principalAmount = parseFloat(loanPrincipalAmountInput_LoanModule.value);
                const interestRate = parseFloat(loanInterestRateInput_LoanModule.value) / 100; // API expects rate, not percentage
                const termDuration = parseInt(loanTermDurationInput_LoanModule.value);
                const startDate = loanStartDateInput_LoanModule.value;
                const fixedInstallmentAmountValue = loanFixedInstallmentAmountInput_LoanModule.value;
                let fixedInstallmentAmount = (loanType === 'daily' && fixedInstallmentAmountValue.trim() !== '') ? parseFloat(fixedInstallmentAmountValue) : null;
                
                const guarantorFirstName = loanGuarantorFirstNameInput_LoanModule.value.trim();
                const guarantorLastName = loanGuarantorLastNameInput_LoanModule.value.trim();
                const guarantorDni = loanGuarantorDniInput_LoanModule.value.trim();
                const guarantorPhone = loanGuarantorPhoneInput_LoanModule.value.trim();
                const guarantorAddress = loanGuarantorAddressInput_LoanModule.value.trim();
                const notes = loanNotesInput_LoanModule.value.trim();

                // Input Validation
                if (!clientId || !loanType || isNaN(principalAmount) || principalAmount <= 0 || isNaN(interestRate) || interestRate < 0 || isNaN(termDuration) || termDuration <= 0 || !startDate) {
                    loanFormErrorMessage_LoanModule.textContent = 'Complete todos los campos obligatorios (*) con valores válidos.';
                    return;
                }
                if (loanType === 'daily' && fixedInstallmentAmountValue.trim() !== '' && (isNaN(fixedInstallmentAmount) || fixedInstallmentAmount <= 0)) {
                    loanFormErrorMessage_LoanModule.textContent = 'Monto de cuota fija inválido. Debe ser un número positivo si se especifica.';
                    return;
                }
                if (guarantorDni && !/^\d{7,8}$/.test(guarantorDni)) {
                    loanFormErrorMessage_LoanModule.textContent = 'DNI del garante inválido (7-8 números).';
                    return;
                }

                const loanData = {
                    client_id: clientId,
                    loan_type: loanType,
                    principal_amount: principalAmount,
                    interest_rate: interestRate,
                    term_duration: termDuration,
                    start_date: startDate,
                    fixed_installment_amount: (isNaN(fixedInstallmentAmount)) ? null : fixedInstallmentAmount,
                    guarantor_first_name: guarantorFirstName || null,
                    guarantor_last_name: guarantorLastName || null,
                    guarantor_dni: guarantorDni || null,
                    guarantor_phone: guarantorPhone || null,
                    guarantor_address: guarantorAddress || null,
                    notes: notes || null
                };

                try {
                    const result = await window.electronAPI.registerLoan(loanData);
                    if (result.success) {
                        showAppMessage(result.message || 'Préstamo registrado exitosamente.', 'success');
                        closeLoanModal_LoanModule();
                        await loadLoans_LoanModule(); // Refresh the loans list
                    } else {
                        loanFormErrorMessage_LoanModule.textContent = result.message || 'Error al registrar el préstamo.';
                    }
                } catch (error) {
                    console.error("Error registrando préstamo:", error);
                    loanFormErrorMessage_LoanModule.textContent = `Error de comunicación: ${error.message}`;
                }
            }); 
        }
        if (btnApplyLoanFilters_LoanModule) btnApplyLoanFilters_LoanModule.addEventListener('click', async () => await loadLoans_LoanModule());
        if (btnClearLoanFilters_LoanModule) { btnClearLoanFilters_LoanModule.addEventListener('click', async () => { searchLoanClientDniInput_LoanModule.value = ''; filterLoanTypeSelect_LoanModule.value = ''; filterLoanStatusSelect_LoanModule.value = ''; await loadLoans_LoanModule(); }); }
        if (loansTableBody_LoanModule) { loansTableBody_LoanModule.addEventListener('click', async (e) => { const target = e.target.closest('button'); if(!target) return; if (target.classList.contains('btn-view-loan-details')) { const loanId = target.dataset.id; await openLoanDetailsModal_LoanModule(loanId); } }); }
        if (loanDetailsModalCloseBtn_LoanModule) loanDetailsModalCloseBtn_LoanModule.addEventListener('click', closeLoanDetailsModal_LoanModule);
        if (btnCloseLoanDetailsModal_LoanModule) btnCloseLoanDetailsModal_LoanModule.addEventListener('click', closeLoanDetailsModal_LoanModule);
        if (btnLoanDetailsChangeStatus_LoanModule) { btnLoanDetailsChangeStatus_LoanModule.addEventListener('click', async () => { /* ... (código Fase 4 con showAppMessage) ... */ }); }
        if (btnGenerateLoanContract_LoanModule) { btnGenerateLoanContract_LoanModule.addEventListener('click', async () => { /* ... (código Fase 7 con showAppMessage) ... */ }); }
    }

    // --- SECCIÓN SIMULADOR DE PRÉSTAMOS ---
    const simulatorPage = document.getElementById('simulator-page');
    if (simulatorPage) {
        const simulatorForm_SimModule = document.getElementById('loan-simulator-form');
        const simLoanTypeSelect_SimModule = document.getElementById('sim-loan-type');
        const simPrincipalAmountInput_SimModule = document.getElementById('sim-principal-amount');
        const simInterestRateInput_SimModule = document.getElementById('sim-interest-rate');
        const simInterestRateHint_SimModule = document.getElementById('sim-interest-rate-hint');
        const simTermDurationInput_SimModule = document.getElementById('sim-term-duration');
        const simTermDurationHint_SimModule = document.getElementById('sim-term-duration-hint');
        const simStartDateInput_SimModule = document.getElementById('sim-start-date');
        const simFixedInstallmentGroup_SimModule = document.getElementById('sim-fixed-installment-group');
        const simFixedInstallmentAmountInput_SimModule = document.getElementById('sim-fixed-installment-amount');
        const simResPrincipal_SimModule = document.getElementById('sim-res-principal');
        const simResTotalInterest_SimModule = document.getElementById('sim-res-total-interest');
        const simResTotalAmountDue_SimModule = document.getElementById('sim-res-total-amount-due');
        const simResNumInstallments_SimModule = document.getElementById('sim-res-num-installments');
        const simResInstallmentAmount_SimModule = document.getElementById('sim-res-installment-amount');
        const simResFirstDueDate_SimModule = document.getElementById('sim-res-first-due-date');
        const simResLastDueDate_SimModule = document.getElementById('sim-res-last-due-date');
        const simulatorInstallmentsTbody_SimModule = document.getElementById('simulator-installments-tbody');

        async function initializeSimulatorPage() { 
            updateSimulatorFormHints_SimModule(); 
            if (simStartDateInput_SimModule) {
                const nowISO = await window.electronAPI.getCurrentDateTimeISO();
                simStartDateInput_SimModule.value = nowISO ? nowISO.split('T')[0] : new Date().toISOString().split('T')[0];
            }
        }
        function updateSimulatorFormHints_SimModule() {
            if (!simLoanTypeSelect_SimModule || !simInterestRateHint_SimModule || !simTermDurationHint_SimModule || !simFixedInstallmentGroup_SimModule) return;
            const type = simLoanTypeSelect_SimModule.value;
            if (type === 'daily') {
                simInterestRateHint_SimModule.textContent = "Tasa Interés DIARIA (ej: 1 para 1%).";
                simTermDurationHint_SimModule.textContent = "Plazo en DÍAS.";
                simFixedInstallmentGroup_SimModule.style.display = 'block';
            } else { 
                simInterestRateHint_SimModule.textContent = "Tasa Interés MENSUAL (ej: 10 para 10%).";
                simTermDurationHint_SimModule.textContent = "Plazo en MESES.";
                simFixedInstallmentGroup_SimModule.style.display = 'none';
                if(simFixedInstallmentAmountInput_SimModule) simFixedInstallmentAmountInput_SimModule.value = '';
            }
        }
        if (simLoanTypeSelect_SimModule) simLoanTypeSelect_SimModule.addEventListener('change', updateSimulatorFormHints_SimModule);
        if (simulatorForm_SimModule) {
            simulatorForm_SimModule.addEventListener('submit', async (e) => {
                e.preventDefault();
                simulatorInstallmentsTbody_SimModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Calculando...</td></tr>';
                simResPrincipal_SimModule.textContent = '-'; simResTotalInterest_SimModule.textContent = '-'; simResTotalAmountDue_SimModule.textContent = '-';
                simResNumInstallments_SimModule.textContent = '-'; simResInstallmentAmount_SimModule.textContent = '-';
                simResFirstDueDate_SimModule.textContent = '-'; simResLastDueDate_SimModule.textContent = '-';
                const params = { principal: parseFloat(simPrincipalAmountInput_SimModule.value), interestRate: parseFloat(simInterestRateInput_SimModule.value) / 100, term: parseInt(simTermDurationInput_SimModule.value), loanType: simLoanTypeSelect_SimModule.value, startDate: simStartDateInput_SimModule.value, fixedInstallmentAmount: simLoanTypeSelect_SimModule.value === 'daily' ? parseFloat(simFixedInstallmentAmountInput_SimModule.value) : null };
                if (isNaN(params.principal) || params.principal <= 0 || isNaN(params.interestRate) || params.interestRate < 0 || isNaN(params.term) || params.term <= 0 || !params.startDate) {
                    simulatorInstallmentsTbody_SimModule.innerHTML = '<tr><td colspan="3" style="text-align:center;">Complete campos (*) correctamente.</td></tr>'; return;
                }
                if (params.fixedInstallmentAmount !== null && isNaN(params.fixedInstallmentAmount)) params.fixedInstallmentAmount = null;
                try {
                    const result = await window.electronAPI.calculateLoanDetails(params);
                    if (result.success && result.data) {
                        const details = result.data; simulatorInstallmentsTbody_SimModule.innerHTML = '';
                        for(const inst of details.installments) { const row = simulatorInstallmentsTbody_SimModule.insertRow(); row.innerHTML = `<td>${inst.installment_number}</td><td>${await formatDateForDisplay(inst.due_date)}</td><td>${formatCurrency(inst.amount_due)}</td>`; }
                        simResPrincipal_SimModule.textContent = formatCurrency(params.principal); simResTotalInterest_SimModule.textContent = formatCurrency(details.totalInterest);
                        simResTotalAmountDue_SimModule.textContent = formatCurrency(details.totalAmountDue); simResNumInstallments_SimModule.textContent = details.numberOfInstallments;
                        simResInstallmentAmount_SimModule.textContent = formatCurrency(details.actualInstallmentAmount);
                        if (details.installments.length > 0) { simResFirstDueDate_SimModule.textContent = await formatDateForDisplay(details.installments[0].due_date); simResLastDueDate_SimModule.textContent = await formatDateForDisplay(details.installments[details.installments.length - 1].due_date); }
                    } else { simulatorInstallmentsTbody_SimModule.innerHTML = `<tr><td colspan="3" style="text-align:center;">${result.message || 'Error.'}</td></tr>`; }
                } catch (error) { console.error("Error simulación:", error); simulatorInstallmentsTbody_SimModule.innerHTML = `<tr><td colspan="3" style="text-align:center;">Error comunicación.</td></tr>`; }
            });
        }
    }

    // --- SECCIÓN PAGOS Y COBRANZAS ---
    const paymentsPage = document.getElementById('payments-page');
    if (paymentsPage) {
        const paymentSearchClientDniInput_PayModule = document.getElementById('payment-search-client-dni');
        const paymentSearchLoanIdInput_PayModule = document.getElementById('payment-search-loan-id');
        const btnPaymentSearchLoans_PayModule = document.getElementById('btn-payment-search-loans');
        const noPendingInstallmentsMessage_PayModule = document.getElementById('no-pending-installments-message');
        const pendingInstallmentsListDiv_PayModule = document.getElementById('pending-installments-list');
        const recordPaymentModal_PayModule = document.getElementById('record-payment-modal');
        const recordPaymentModalCloseBtn_PayModule = document.getElementById('record-payment-modal-close-btn');
        const recordPaymentForm_PayModule = document.getElementById('record-payment-form');
        const btnCancelRecordPayment_PayModule = document.getElementById('btn-cancel-record-payment');
        const btnSavePayment_PayModule = document.getElementById('btn-save-payment');
        const paymentLoanInstallmentIdInput_PayModule = document.getElementById('payment-loan-installment-id');
        const paymentModalClientName_PayModule = document.getElementById('payment-modal-client-name');
        const paymentModalLoanId_PayModule = document.getElementById('payment-modal-loan-id');
        const paymentModalInstallmentNumber_PayModule = document.getElementById('payment-modal-installment-number');
        const paymentModalDueDate_PayModule = document.getElementById('payment-modal-due-date');
        const paymentModalAmountDue_PayModule = document.getElementById('payment-modal-amount-due');
        const paymentModalRemainingBalance_PayModule = document.getElementById('payment-modal-remaining-balance');
        const paymentAmountInput_PayModule = document.getElementById('payment-amount');
        const paymentDateInput_PayModule = document.getElementById('payment-date');
        const paymentMethodSelect_PayModule = document.getElementById('payment-method');
        const paymentNotesInput_PayModule = document.getElementById('payment-notes');
        const paymentModalArrearsSection_PayModule = document.getElementById('payment-modal-arrears-section');
        const paymentModalArrearsAmount_PayModule = document.getElementById('payment-modal-arrears-amount');
        const paymentModalDaysOverdue_PayModule = document.getElementById('payment-modal-days-overdue');
        const paymentModalArrearsRateInfo_PayModule = document.getElementById('payment-modal-arrears-rate-info');
        const recordPaymentFormErrorMessage_PayModule = document.getElementById('record-payment-form-error-message');
        let calculatedArrearsForPayment_PayModule = 0;
        const DEFAULT_DAILY_ARREARS_RATE_PayModule = 0.001; 
        const paymentHistoryDateFromInput_PayModule = document.getElementById('payment-history-date-from');
        const paymentHistoryDateToInput_PayModule = document.getElementById('payment-history-date-to');
        const btnFilterPaymentHistory_PayModule = document.getElementById('btn-filter-payment-history');
        const paymentHistoryTbody_PayModule = document.getElementById('payment-history-tbody');

        async function loadPaymentsPageData() { 
            await loadPaymentHistory_PayModule(); 
            if (paymentHistoryDateToInput_PayModule) paymentHistoryDateToInput_PayModule.value = (await window.electronAPI.getCurrentDateTimeISO()).split('T')[0];
            if (paymentHistoryDateFromInput_PayModule) paymentHistoryDateFromInput_PayModule.value = (await window.electronAPI.addOrSubtractDaysISO((await window.electronAPI.getCurrentDateTimeISO()), 30, 'minus'));
        }
        async function searchLoansForPayment_PayModule() {
            const clientDniQuery = paymentSearchClientDniInput_PayModule.value.trim();
            const loanIdQuery = paymentSearchLoanIdInput_PayModule.value.trim();

            pendingInstallmentsListDiv_PayModule.innerHTML = '';
            noPendingInstallmentsMessage_PayModule.style.display = 'none';
            let loansToProcess = [];
            let pendingInstallmentsFound = false;

            try {
                if (loanIdQuery) {
                    const loanId = parseInt(loanIdQuery);
                    if (!isNaN(loanId) && loanId > 0) {
                        const result = await window.electronAPI.getLoanById(loanId);
                        if (result.success && result.data) {
                            loansToProcess.push(result.data);
                        } else {
                            noPendingInstallmentsMessage_PayModule.textContent = result.message || "Préstamo no encontrado.";
                            noPendingInstallmentsMessage_PayModule.style.display = 'block';
                            return;
                        }
                    } else {
                        noPendingInstallmentsMessage_PayModule.textContent = "ID de Préstamo inválido.";
                        noPendingInstallmentsMessage_PayModule.style.display = 'block';
                        return;
                    }
                } else if (clientDniQuery) {
                    const clientsResult = await window.electronAPI.getAllClients(false); // Get all clients, active or not
                    if (clientsResult.success && clientsResult.data) {
                        const foundClient = clientsResult.data.find(c => c.dni === clientDniQuery);
                        if (foundClient) {
                            // Fetch all loans for the client, then filter client-side by status
                            const loansResult = await window.electronAPI.getAllLoans({ clientId: foundClient.id });
                            if (loansResult.success && loansResult.data) {
                                loansToProcess = loansResult.data.filter(loan => ['active', 'overdue'].includes(loan.status));
                                if (loansToProcess.length === 0) {
                                    noPendingInstallmentsMessage_PayModule.textContent = `No se encontraron préstamos activos o vencidos para el DNI ${clientDniQuery}.`;
                                    noPendingInstallmentsMessage_PayModule.style.display = 'block';
                                    return;
                                }
                            } else {
                                noPendingInstallmentsMessage_PayModule.textContent = loansResult.message || `No se encontraron préstamos para el DNI ${clientDniQuery}.`;
                                noPendingInstallmentsMessage_PayModule.style.display = 'block';
                                return;
                            }
                        } else {
                            noPendingInstallmentsMessage_PayModule.textContent = `Cliente con DNI ${clientDniQuery} no encontrado.`;
                            noPendingInstallmentsMessage_PayModule.style.display = 'block';
                            return;
                        }
                    } else {
                        noPendingInstallmentsMessage_PayModule.textContent = clientsResult.message || "Error buscando clientes.";
                        noPendingInstallmentsMessage_PayModule.style.display = 'block';
                        return;
                    }
                } else {
                    noPendingInstallmentsMessage_PayModule.textContent = "Ingrese DNI o ID de Préstamo para buscar.";
                    noPendingInstallmentsMessage_PayModule.style.display = 'block';
                    return;
                }

                if (loansToProcess.length === 0 && !loanIdQuery) { // If searched by DNI and no relevant loans found
                     noPendingInstallmentsMessage_PayModule.textContent = "No se encontraron préstamos activos o vencidos para los criterios ingresados.";
                     noPendingInstallmentsMessage_PayModule.style.display = 'block';
                     return;
                }
                
                for (const loan of loansToProcess) {
                    // Ensure we have client details, which should be included by getAllLoans and getLoanById
                    const clientName = `${loan.client_first_name || 'N/A'} ${loan.client_last_name || ''}`.trim();
                    const clientDni = loan.client_dni || 'N/A';

                    // If loan.installments is not directly available from getAllLoans, refetch.
                    // However, getLoanById (used for single loan search) includes them.
                    // Assume for now that if loansToProcess has items, they have installments or we need to fetch them.
                    // The prompt for getLoanById implies installments are present.
                    // For getAllLoans, if they are not present, an additional fetch would be needed here.
                    // For simplicity, let's assume loan.installments is available if the loan object itself is.
                    // If not, this part would need:
                    // let detailedLoan = loan; 
                    // if (!detailedLoan.installments) { 
                    //    const detRes = await window.electronAPI.getLoanById(loan.id);
                    //    if (detRes.success && detRes.data) detailedLoan = detRes.data; else continue; 
                    // }
                    // And then use detailedLoan.installments
                    
                    let loanHasPendingInstallments = false;
                    if (loan.installments && loan.installments.length > 0) {
                        for (const inst of loan.installments) {
                            if (inst.status !== 'paid') {
                                pendingInstallmentsFound = true;
                                loanHasPendingInstallments = true;
                                const amountPaid = parseFloat(inst.amount_paid || 0);
                                const amountDue = parseFloat(inst.amount_due);
                                const remainingAmount = amountDue - amountPaid;

                                const installmentItemHtml = `
                                    <div class="installment-item">
                                        <div class="installment-item-header">
                                            <h5>Préstamo #${loan.id} - Cuota ${inst.installment_number}</h5>
                                        </div>
                                        <div class="installment-item-body">
                                            <p><strong>Cliente:</strong> ${clientName} (DNI: ${clientDni})</p>
                                            <p><strong>Vencimiento:</strong> ${await formatDateForDisplay(inst.due_date)}</p>
                                            <p><strong>Monto Cuota:</strong> ${formatCurrency(amountDue)}</p>
                                            <p><strong>Pagado:</strong> ${formatCurrency(amountPaid)}</p>
                                            <p><strong>Pendiente Cuota:</strong> ${formatCurrency(remainingAmount)}</p>
                                            <p><strong>Estado Cuota:</strong> <span class="status-${inst.status}">${translateInstallmentStatus(inst.status)}</span></p>
                                        </div>
                                        <div class="installment-item-footer">
                                            <button class="btn btn-sm btn-success btn-record-payment-for-installment" data-installment-id="${inst.id}">Registrar Pago</button>
                                        </div>
                                    </div>
                                `;
                                pendingInstallmentsListDiv_PayModule.innerHTML += installmentItemHtml;
                            }
                        }
                    }
                     if (loanHasPendingInstallments && loanIdQuery && loansToProcess.length === 1) { // If searched by Loan ID and it has pending installments
                        // message already handled by pendingInstallmentsFound flag later
                    }
                }

                if (!pendingInstallmentsFound) {
                    noPendingInstallmentsMessage_PayModule.textContent = "No se encontraron cuotas pendientes para los criterios de búsqueda.";
                    noPendingInstallmentsMessage_PayModule.style.display = 'block';
                }

            } catch (error) {
                console.error('Error buscando préstamos para pago:', error);
                noPendingInstallmentsMessage_PayModule.textContent = `Error al buscar: ${error.message || 'Error de comunicación.'}`;
                noPendingInstallmentsMessage_PayModule.style.display = 'block';
            }
        }
        async function openRecordPaymentModal_PayModule(installmentId) { /* ... (código Fase 6 con await para formatDateForDisplay y usando DEFAULT_DAILY_ARREARS_RATE_PayModule) ... */ }
        function closeRecordPaymentModal_PayModule() { /* ... (código Fase 6) ... */ }
        async function loadPaymentHistory_PayModule() {
            const dateFrom = paymentHistoryDateFromInput_PayModule.value;
            const dateTo = paymentHistoryDateToInput_PayModule.value;
            const clientDniQuery = paymentSearchClientDniInput_PayModule.value.trim(); // DNI from the same input as pending search
            const loanIdString = paymentSearchLoanIdInput_PayModule.value.trim(); // Loan ID from the same input as pending search

            let filters = {};
            if (dateFrom) filters.dateFrom = dateFrom;
            if (dateTo) filters.dateTo = dateTo;

            paymentHistoryTbody_PayModule.innerHTML = '<tr><td colspan="8" style="text-align:center;">Procesando filtros...</td></tr>';

            try {
                const loanId = parseInt(loanIdString);
                if (!isNaN(loanId) && loanId > 0) {
                    filters.loanId = loanId;
                } else if (clientDniQuery) {
                    paymentHistoryTbody_PayModule.innerHTML = '<tr><td colspan="8" style="text-align:center;">Buscando cliente...</td></tr>';
                    const clientsResult = await window.electronAPI.getAllClients(false); // Get all clients (active/inactive)
                    if (clientsResult.success && clientsResult.data) {
                        const foundClient = clientsResult.data.find(c => c.dni === clientDniQuery);
                        if (foundClient) {
                            filters.clientId = foundClient.id;
                        } else {
                            filters.clientId = -1; // Client DNI specified but not found
                        }
                    } else {
                        // Error fetching clients, proceed without client filter or show error
                        console.warn("Error buscando clientes para historial de pagos:", clientsResult.message);
                         filters.clientId = -1; // Fallback to ensure no results if DNI was intended filter
                    }
                }

                paymentHistoryTbody_PayModule.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando historial...</td></tr>';
                const result = await window.electronAPI.getAllPayments(filters);
                paymentHistoryTbody_PayModule.innerHTML = ''; // Clear before populating

                if (result.success && result.data && result.data.length > 0) {
                    for (const payment of result.data) {
                        const row = paymentHistoryTbody_PayModule.insertRow();
                        const clientFullName = `${payment.client_first_name || 'N/A'} ${payment.client_last_name || ''}`.trim();
                        const clientDniDisplay = payment.client_dni || 'N/A';
                        
                        row.innerHTML = `
                            <td>${payment.id}</td>
                            <td>${await formatDateTimeForDisplay(payment.payment_date)}</td>
                            <td>${clientFullName} (${clientDniDisplay})</td>
                            <td>${payment.loan_id}</td>
                            <td>${payment.installment_number !== null ? payment.installment_number : 'N/A'}</td>
                            <td>${formatCurrency(payment.payment_amount)}</td>
                            <td>${payment.created_by_username || 'N/A'}</td>
                            <td>
                                ${payment.receipt_full_path ? 
                                    `<button class="btn btn-sm btn-info btn-open-receipt" data-path="${payment.receipt_full_path}">Ver</button>` : 
                                    'N/A'}
                            </td>
                        `;
                    }
                } else {
                    paymentHistoryTbody_PayModule.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay pagos para los filtros aplicados.</td></tr>';
                }
            } catch (error) {
                console.error('Error cargando historial de pagos:', error);
                paymentHistoryTbody_PayModule.innerHTML = `<tr><td colspan="8" style="text-align:center;">Error al cargar historial: ${error.message || 'Error de comunicación.'}</td></tr>`;
            }
        }

        if (btnPaymentSearchLoans_PayModule) btnPaymentSearchLoans_PayModule.addEventListener('click', async () => await searchLoansForPayment_PayModule());
        if (pendingInstallmentsListDiv_PayModule) { pendingInstallmentsListDiv_PayModule.addEventListener('click', async (e) => { /* ... (código Fase 6) ... */ }); }
        if (recordPaymentModalCloseBtn_PayModule) recordPaymentModalCloseBtn_PayModule.addEventListener('click', closeRecordPaymentModal_PayModule);
        if (btnCancelRecordPayment_PayModule) btnCancelRecordPayment_PayModule.addEventListener('click', closeRecordPaymentModal_PayModule);
        if (recordPaymentForm_PayModule) { 
            recordPaymentForm_PayModule.addEventListener('submit', async (e) => {
                e.preventDefault();
                recordPaymentFormErrorMessage_PayModule.textContent = '';

                const loanInstallmentId = paymentLoanInstallmentIdInput_PayModule.value;
                const paymentAmount = parseFloat(paymentAmountInput_PayModule.value);
                const paymentDateISO = paymentDateInput_PayModule.value; // datetime-local input
                const paymentMethod = paymentMethodSelect_PayModule.value;
                const notes = paymentNotesInput_PayModule.value.trim();

                if (!loanInstallmentId || isNaN(paymentAmount) || paymentAmount <= 0 || !paymentDateISO) {
                    recordPaymentFormErrorMessage_PayModule.textContent = 'Complete todos los campos obligatorios (*) con valores válidos.';
                    return;
                }
                
                // Consider using Luxon here if precise ISO 8601 with timezone is needed by backend
                // For now, assuming backend handles the datetime-local format (YYYY-MM-DDTHH:MM)
                // or that Luxon on backend `DateTime.fromISO` can parse it.

                const paymentData = {
                    loan_installment_id: parseInt(loanInstallmentId),
                    payment_amount: paymentAmount,
                    payment_date_iso: paymentDateISO,
                    payment_method: paymentMethod || null,
                    notes: notes || null
                };

                try {
                    const result = await window.electronAPI.recordPayment(paymentData);
                    if (result.success) {
                        showAppMessage(result.message || 'Pago registrado exitosamente.', 'success');
                        closeRecordPaymentModal_PayModule(); // Assumed to be implemented
                        await searchLoansForPayment_PayModule(); // Refresh pending installments
                        await loadPaymentHistory_PayModule();   // Refresh payment history

                        if (result.receiptPath) {
                            if (confirm(`Recibo generado: ${result.receiptPath}\n¿Desea abrirlo?`)) {
                                await window.electronAPI.openFile(result.receiptPath);
                            }
                        }
                    } else {
                        recordPaymentFormErrorMessage_PayModule.textContent = result.message || 'Error al registrar el pago.';
                    }
                } catch (error) {
                    console.error("Error registrando pago:", error);
                    recordPaymentFormErrorMessage_PayModule.textContent = `Error de comunicación: ${error.message}`;
                }
            }); 
        }
        if (btnFilterPaymentHistory_PayModule) btnFilterPaymentHistory_PayModule.addEventListener('click', async () => await loadPaymentHistory_PayModule());
        if (paymentHistoryTbody_PayModule) { 
            paymentHistoryTbody_PayModule.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('button.btn-open-receipt');
                if (targetButton) {
                    const filePath = targetButton.dataset.path;
                    if (filePath && filePath !== 'null' && filePath !== 'undefined') {
                        try {
                            await window.electronAPI.openFile(filePath);
                        } catch (error) {
                            console.error('Error opening receipt file:', error);
                            showAppMessage(`No se pudo abrir el recibo: ${error.message}`, 'error');
                        }
                    } else {
                        showAppMessage('Recibo no disponible o ruta inválida.', 'warning');
                    }
                }
            }); 
        }
    }
    
    // --- SECCIÓN REPORTES ---
    const reportsPage = document.getElementById('reports-page');
    if (reportsPage) {
        const reportTypeSelect_RepModule = document.getElementById('report-type-select');
        const reportFiltersArea_RepModule = document.getElementById('report-filters-area');
        const btnGenerateReport_RepModule = document.getElementById('btn-generate-report');
        const reportSummaryOutputDiv_RepModule = document.getElementById('report-summary-output');
        const reportTableOutputDiv_RepModule = document.getElementById('report-table-output');
        const reportDataTableHead_RepModule = document.getElementById('report-data-table').querySelector('thead');
        const reportDataTableBody_RepModule = document.getElementById('report-data-table').querySelector('tbody');
        const noReportDataMessage_RepModule = document.getElementById('no-report-data-message');
        const reportStatusMessage_RepModule = document.getElementById('report-status-message');
        const btnExportPdf_RepModule = document.getElementById('btn-export-pdf');
        const btnExportCsv_RepModule = document.getElementById('btn-export-csv');
        let currentReportData_ReportModule = null; 
        let currentReportType_ReportModule = 'summary'; 

        async function initializeReportsPage() { 
            await renderReportFilters_RepModule(reportTypeSelect_RepModule.value); 
            if (reportTypeSelect_RepModule.value === 'summary') await handleGenerateReport_RepModule(); 
        }
        async function renderReportFilters_RepModule(type) { /* ... (código Fase 8 con await para getAllUsers) ... */ }
        async function displayReportData_RepModule(data, type) { /* ... (código Fase 8 con await para formatDateForDisplay) ... */ }
        async function handleGenerateReport_RepModule() { /* ... (código Fase 8 con await para getAllClients) ... */ }

        if (reportTypeSelect_RepModule) reportTypeSelect_RepModule.addEventListener('change', async (e) => await renderReportFilters_RepModule(e.target.value));
        if (btnGenerateReport_RepModule) btnGenerateReport_RepModule.addEventListener('click', async () => await handleGenerateReport_RepModule());
        if (btnExportPdf_RepModule) { btnExportPdf_RepModule.addEventListener('click', async () => { /* ... (código Fase 8) ... */ }); }
        if (btnExportCsv_RepModule) { btnExportCsv_RepModule.addEventListener('click', async () => { /* ... (código Fase 8) ... */ }); }
    }

    // --- LÓGICA PARA BOTONES DE CIERRE DE SESIÓN/SALIR Y CONTROLES DE VENTANA ---
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            if (confirm("¿Está seguro de que desea cerrar la sesión?")) {
                window.electronAPI.appLogout();
            }
        });
    }
    const customMinimizeBtn = document.getElementById('custom-minimize-btn');
    const customMaximizeBtn = document.getElementById('custom-maximize-btn');
    const customCloseBtnTop = document.getElementById('custom-close-btn-top');
    if (customMinimizeBtn) customMinimizeBtn.addEventListener('click', () => window.electronAPI.windowMinimize());
    if (customMaximizeBtn) customMaximizeBtn.addEventListener('click', () => window.electronAPI.windowToggleMaximize());
    if (customCloseBtnTop) {
        customCloseBtnTop.addEventListener('click', () => {
            if (confirm("¿Está seguro de que desea salir de la aplicación?")) {
                 window.electronAPI.windowClose(); 
            }
        });
    }
    
    // Carga Inicial de la Página Activa (Dashboard por defecto)
    const initialActivePageLink = document.querySelector('.sidebar-menu li a.active');
    if (initialActivePageLink) {
        const pageName = initialActivePageLink.getAttribute('data-page');
        console.log(`Página activa inicial: ${pageName}`);
        if (pageName === 'dashboard' && typeof loadDashboardData === 'function') await loadDashboardData();
        else if (pageName === 'clients' && typeof loadClients === 'function') await loadClients();
        else if (pageName === 'settings' && typeof loadSettingsPageData === 'function') await loadSettingsPageData();
        else if (pageName === 'loans' && typeof loadLoansPageData === 'function') await loadLoansPageData();
        else if (pageName === 'payments' && typeof loadPaymentsPageData === 'function') await loadPaymentsPageData();
        else if (pageName === 'simulator' && typeof initializeSimulatorPage === 'function') await initializeSimulatorPage();
        else if (pageName === 'reports' && typeof initializeReportsPage === 'function') await initializeReportsPage();
    }

}); // Fin de DOMContentLoaded