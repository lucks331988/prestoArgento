// src/main/userManager.js
const bcrypt = require('bcrypt');
const dbUtil = require('./database');

const saltRounds = 10;

/**
 * Registra un nuevo usuario. Solo el admin puede crear otros admins o empleados.
 * @param {object} userData - { username, password, fullName, role }
 * @param {object} performingUser - El usuario que realiza la acción (para verificar permisos)
 * @returns {Promise<object>}
 */
async function registerUser(userData, performingUser) {
    // Solo un admin puede registrar nuevos usuarios
    if (!performingUser || performingUser.role !== 'admin') {
        return { success: false, message: 'Acción no autorizada. Se requiere rol de administrador.' };
    }

    const { username, password, fullName, role } = userData;
    if (!username || !password || !fullName || !role) {
        return { success: false, message: 'Nombre de usuario, contraseña, nombre completo y rol son requeridos.' };
    }
    if (!['admin', 'employee'].includes(role)) {
        return { success: false, message: 'Rol inválido. Debe ser "admin" o "employee".' };
    }
     if (password.length < 6) { // Política de contraseña básica
        return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }


    try {
        const existingUser = await dbUtil.get('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return { success: false, message: 'El nombre de usuario ya existe.' };
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const result = await dbUtil.run(
            'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, fullName, role]
        );

        if (result.lastID) {
            return { success: true, userId: result.lastID, message: `Usuario ${username} (${role}) registrado exitosamente.` };
        }
        return { success: false, message: 'Error al registrar el usuario en la base de datos.' };
    } catch (error) {
        console.error('Error en userManager.registerUser:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
             return { success: false, message: 'El nombre de usuario ya existe (error de BD).' };
        }
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Obtiene todos los usuarios (sin sus hashes de contraseña).
 * @returns {Promise<Array<object>>}
 */
async function getAllUsers() {
    try {
        const users = await dbUtil.all('SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users ORDER BY username');
        return users;
    } catch (error) {
        console.error('Error en getAllUsers:', error);
        throw error; // Re-lanzar para que el manejador IPC lo capture
    }
}

/**
 * Obtiene un usuario por ID (sin hash de contraseña).
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getUserById(userId) {
    try {
        const user = await dbUtil.get('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', [userId]);
        return user;
    } catch (error) {
        console.error('Error en getUserById:', error);
        return null;
    }
}

/**
 * Actualiza los datos de un usuario.
 * @param {number} userIdToUpdate - ID del usuario a actualizar.
 * @param {object} dataToUpdate - { fullName, role, isActive, newPassword (opcional) }
 * @param {object} performingUser - El usuario que realiza la acción.
 * @returns {Promise<object>}
 */
async function updateUser(userIdToUpdate, dataToUpdate, performingUser) {
    if (!performingUser || performingUser.role !== 'admin') {
        return { success: false, message: 'Acción no autorizada. Se requiere rol de administrador.' };
    }
    
    // Un admin no puede desactivarse a sí mismo o cambiar su propio rol si es el único admin activo
    if (parseInt(userIdToUpdate, 10) === performingUser.id) {
        // Chequeo para isActive
        if (dataToUpdate.hasOwnProperty('isActive') && !dataToUpdate.isActive) {
            const activeAdmins = await dbUtil.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", [performingUser.id]);
            if (activeAdmins.count === 0) {
                return { success: false, message: 'No se puede desactivar al único administrador activo.' };
            }
        }
        // Chequeo para role
        if (dataToUpdate.role && dataToUpdate.role !== 'admin') {
             const activeAdmins = await dbUtil.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", [performingUser.id]);
            if (activeAdmins.count === 0) { // Si va a cambiar su rol y es el único admin
                return { success: false, message: 'No se puede cambiar el rol del único administrador activo a no-administrador.' };
            }
        }
    }


    const { fullName, role, isActive, newPassword } = dataToUpdate;
    let fieldsToUpdate = [];
    let params = [];

    if (fullName !== undefined && fullName.trim() !== '') { fieldsToUpdate.push('full_name = ?'); params.push(fullName.trim()); }
    if (role !== undefined) {
        if (!['admin', 'employee'].includes(role)) return { success: false, message: 'Rol inválido.' };
        fieldsToUpdate.push('role = ?'); params.push(role);
    }
    if (isActive !== undefined) { fieldsToUpdate.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    
    if (newPassword) {
        if (newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        fieldsToUpdate.push('password_hash = ?'); params.push(hashedPassword);
    }

    if (fieldsToUpdate.length === 0) {
        return { success: true, message: 'No hay datos para actualizar.' }; // O false si se considera un error
    }

    params.push(userIdToUpdate); // Para el WHERE id = ?

    try {
        const sql = `UPDATE users SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        const result = await dbUtil.run(sql, params);

        if (result.changes > 0) {
            return { success: true, message: 'Usuario actualizado exitosamente.' };
        }
        return { success: false, message: 'Usuario no encontrado o datos sin cambios.' };
    } catch (error) {
        console.error('Error en updateUser:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Cambia la contraseña del usuario actualmente logueado.
 * @param {number} userId - ID del usuario logueado.
 * @param {string} currentPassword - Contraseña actual para verificación.
 * @param {string} newPassword - Nueva contraseña.
 * @returns {Promise<object>}
 */
async function changeCurrentUserPassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
        return { success: false, message: 'La contraseña actual y la nueva son requeridas.'};
    }
    if (newPassword.length < 6) { 
        return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.'};
    }

    try {
        const user = await dbUtil.get('SELECT password_hash FROM users WHERE id = ?', [userId]);
        if (!user) {
            return { success: false, message: 'Usuario no encontrado.' };
        }

        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
            return { success: false, message: 'La contraseña actual es incorrecta.' };
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
        await dbUtil.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashedNewPassword, userId]);
        
        return { success: true, message: 'Contraseña cambiada exitosamente.' };
    } catch (error) {
        console.error('Error en changeCurrentUserPassword:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

module.exports = {
    registerUser,
    getAllUsers,
    getUserById,
    updateUser,
    changeCurrentUserPassword,
};