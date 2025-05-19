// src/main/auth.js
const bcrypt = require('bcrypt');
const dbUtil = require('./database'); // Usaremos las funciones get, run de database.js

const saltRounds = 10; // Costo del hashing

/**
 * Registra internamente el usuario administrador inicial.
 * NO usar para registro desde la UI. Para eso está userManager.registerUser.
 * @param {string} username
 * @param {string} password
 * @param {string} fullName
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function _internalRegisterAdmin(username, password, fullName) {
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const result = await dbUtil.run(
            'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, fullName, 'admin'] // Rol 'admin' por defecto aquí
        );
        if (result.lastID) {
            return { success: true, userId: result.lastID };
        }
        return { success: false, message: 'Error registrando admin interno.' };
    } catch (error) {
        console.error('Error en _internalRegisterAdmin:', error);
        // Si es error de constraint UNIQUE, puede que ya exista, lo cual es manejado por findUserByUsername antes.
        // Pero si la BD falla por otra razón, este error es importante.
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}


/**
 * Verifica las credenciales de un usuario.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object>} - Información del usuario si el login es exitoso, o un mensaje de error.
 */
async function loginUser(username, password) {
    try {
        const user = await dbUtil.get('SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?', [username]);

        if (!user) {
            return { success: false, message: 'Usuario no encontrado.' };
        }

        if (!user.is_active) {
            return { success: false, message: 'La cuenta de usuario está desactivada.' };
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            // No devolver el hash de la contraseña al renderer
            const { password_hash, ...userData } = user;
            return { success: true, user: userData };
        } else {
            return { success: false, message: 'Contraseña incorrecta.' };
        }
    } catch (error) {
        console.error('Error en loginUser:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Busca un usuario por su username (usado para verificar existencia antes de crear admin).
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function findUserByUsername(username) {
    try {
        const user = await dbUtil.get('SELECT id, username, full_name, role, is_active FROM users WHERE username = ?', [username]);
        return user; // Devuelve el usuario o null/undefined si no se encuentra
    } catch (error) {
        console.error('Error en findUserByUsername:', error);
        return null; // En caso de error, asumir que no se encontró o falló la búsqueda
    }
}


module.exports = {
    _internalRegisterAdmin, // Para uso exclusivo de main.js en la creación del admin inicial
    loginUser,
    findUserByUsername
};