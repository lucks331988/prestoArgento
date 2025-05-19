// src/renderer/js/loginRenderer.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessageDiv = document.getElementById('error-message');
    const closeButton = document.getElementById('close-btn');
    const companyLogoImg = document.getElementById('company-logo');

    // Cargar logo de la empresa (si está personalizado)
    async function loadCompanyLogo() {
        try {
            // Asegurarse que la API está disponible (preload.js cargado)
            if (window.electronAPI && typeof window.electronAPI.getCompanyLogoPath === 'function') {
                const logoPath = await window.electronAPI.getCompanyLogoPath();
                // Es importante convertir las barras invertidas a barras normales para src de img en Windows
                // y anteponer 'file://' para que el navegador lo interprete como un archivo local.
                // También añadir un timestamp para evitar problemas de caché si el logo cambia.
                companyLogoImg.src = `file://${logoPath.replace(/\\/g, '/')}?t=${new Date().getTime()}`;
            } else {
                 console.warn("electronAPI.getCompanyLogoPath no está disponible aún.");
                 companyLogoImg.src = '../assets/images/logo-presto-argento.png'; // Fallback
            }
        } catch (error) {
            console.error('Error cargando el logo de la empresa:', error);
            companyLogoImg.src = '../assets/images/logo-presto-argento.png'; // Fallback
        }
    }

    loadCompanyLogo();


    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Evitar el envío tradicional del formulario
            errorMessageDiv.textContent = ''; // Limpiar mensajes de error previos

            const username = usernameInput.value.trim();
            const password = passwordInput.value; // No hacer trim a la contraseña

            if (!username || !password) {
                errorMessageDiv.textContent = 'Por favor, ingrese usuario y contraseña.';
                return;
            }

            try {
                // Usar la API expuesta por preload.js para llamar a la función de login en el proceso principal
                const result = await window.electronAPI.login({ username, password });

                if (result.success) {
                    console.log('Login exitoso desde renderer:', result.user);
                    // Notificar al proceso principal que el login fue exitoso para que cierre esta ventana y abra la principal
                    window.electronAPI.notifyLoginSuccessful(result.user);
                } else {
                    errorMessageDiv.textContent = result.message || 'Usuario o contraseña incorrectos.';
                    passwordInput.value = ''; // Limpiar campo de contraseña en caso de error
                    usernameInput.focus(); // Poner foco en usuario
                }
            } catch (error) {
                console.error('Error durante el login:', error);
                errorMessageDiv.textContent = 'Error de comunicación con el sistema. Intente nuevamente.';
            }
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            window.electronAPI.closeLoginWindow();
        });
    }
});