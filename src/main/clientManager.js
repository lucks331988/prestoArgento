// src/main/clientManager.js
const path = require('path');
const fs = require('fs');
const dbUtil = require('./database');
const { app } = require('electron'); // app para getPath

// Directorio base donde se guardarán los documentos de los clientes
const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const baseClientsDocumentsPath = path.join(prestoArgentoDataPath, 'documents', 'clients'); // documents/clients/client_DNI/filename.ext

// Asegurar que el directorio base de documentos de clientes exista
if (!fs.existsSync(baseClientsDocumentsPath)) {
    fs.mkdirSync(baseClientsDocumentsPath, { recursive: true });
}

/**
 * Agrega un nuevo cliente a la base de datos.
 * @param {object} clientData - Datos del cliente (firstName, lastName, dni, phone, address, occupation, email, notes)
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function addClient(clientData) {
    const { firstName, lastName, dni, phone, address, occupation, email, notes } = clientData;
    if (!firstName || !lastName || !dni || !phone || !address) {
        return { success: false, message: 'Nombre, Apellido, DNI, Teléfono y Dirección son obligatorios.' };
    }
    if (!/^\d{7,8}$/.test(dni)) { // Validación de formato DNI
        return { success: false, message: 'El DNI debe contener 7 u 8 números.' };
    }

    try {
        const existingClient = await dbUtil.get('SELECT id FROM clients WHERE dni = ?', [dni]);
        if (existingClient) {
            return { success: false, message: `Ya existe un cliente con el DNI ${dni}.` };
        }

        const result = await dbUtil.run(
            'INSERT INTO clients (first_name, last_name, dni, phone, address, occupation, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [firstName.trim(), lastName.trim(), dni.trim(), phone.trim(), address.trim(), occupation?.trim() || null, email?.trim() || null, notes?.trim() || null]
        );

        if (result.lastID) {
            // Crear directorio para los documentos del cliente usando su DNI
            const clientDocPathSpecific = path.join(baseClientsDocumentsPath, dni.trim());
            if (!fs.existsSync(clientDocPathSpecific)) {
                fs.mkdirSync(clientDocPathSpecific, { recursive: true });
            }
            return { success: true, clientId: result.lastID, message: 'Cliente agregado exitosamente.' };
        } else {
            return { success: false, message: 'Error al agregar el cliente en la base de datos.' };
        }
    } catch (error) {
        console.error('Error en addClient:', error);
        if (error.message && error.message.includes('UNIQUE constraint failed: clients.dni')) {
            return { success: false, message: `Ya existe un cliente con el DNI ${dni}.` };
        }
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Obtiene todos los clientes.
 * @param {boolean} activeOnly - Si es true, solo devuelve clientes activos. Default true.
 * @returns {Promise<Array<object>>} - Lista de clientes.
 */
async function getAllClients(activeOnly = true) {
    try {
        let sql = 'SELECT id, first_name, last_name, dni, phone, address, occupation, email, notes, is_active, created_at, updated_at FROM clients';
        const params = [];
        if (activeOnly) {
            sql += ' WHERE is_active = 1';
        }
        sql += ' ORDER BY last_name, first_name';
        const clients = await dbUtil.all(sql, params);
        return clients;
    } catch (error) {
        console.error('Error en getAllClients:', error);
        throw error; 
    }
}

/**
 * Obtiene un cliente por su ID, incluyendo sus documentos.
 * @param {number} clientId
 * @returns {Promise<object|null>} - Datos del cliente o null si no se encuentra.
 */
async function getClientById(clientId) {
    try {
        const client = await dbUtil.get('SELECT * FROM clients WHERE id = ?', [clientId]);
        if (client) {
            const documents = await dbUtil.all('SELECT id, document_type, file_path, original_filename, uploaded_at FROM client_documents WHERE client_id = ? ORDER BY uploaded_at DESC', [clientId]);
            client.documents = documents.map(doc => ({
                ...doc,
                full_path: `file://${path.join(baseClientsDocumentsPath, client.dni.toString(), doc.file_path).replace(/\\/g, '/')}`
            }));
        }
        return client;
    } catch (error) {
        console.error('Error en getClientById:', error);
        throw error;
    }
}

/**
 * Actualiza los datos de un cliente existente.
 * @param {number} clientId
 * @param {object} clientData - Datos a actualizar.
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function updateClient(clientId, clientData) {
    const { firstName, lastName, dni, phone, address, occupation, email, notes, isActive } = clientData;
     if (!firstName || !lastName || !dni || !phone || !address) {
        return { success: false, message: 'Nombre, Apellido, DNI, Teléfono y Dirección son obligatorios.' };
    }
    if (!/^\d{7,8}$/.test(dni)) { // Validación de formato DNI
        return { success: false, message: 'El DNI debe contener 7 u 8 números.' };
    }

    try {
        // Verificar si el nuevo DNI (si cambió) ya existe para otro cliente
        const clientToUpdate = await dbUtil.get('SELECT dni FROM clients WHERE id = ?', [clientId]);
        if (!clientToUpdate) {
            return { success: false, message: 'Cliente no encontrado para actualizar.' };
        }

        if (dni !== clientToUpdate.dni) { // Si el DNI cambió
            const existingClientWithNewDNI = await dbUtil.get('SELECT id FROM clients WHERE dni = ? AND id != ?', [dni, clientId]);
            if (existingClientWithNewDNI) {
                return { success: false, message: `El nuevo DNI ${dni} ya está asignado a otro cliente.` };
            }
            // Renombrar carpeta de documentos si el DNI cambia
            const oldClientDocPath = path.join(baseClientsDocumentsPath, clientToUpdate.dni.toString());
            const newClientDocPath = path.join(baseClientsDocumentsPath, dni.trim());

            if (fs.existsSync(oldClientDocPath) && oldClientDocPath !== newClientDocPath) {
                try {
                    if (fs.existsSync(newClientDocPath)) {
                        // If a directory already exists for the new DNI, this is a conflict.
                        // This scenario should ideally be rare and might indicate orphaned data.
                        // For safety, prevent DNI update if target directory for new DNI already exists and isn't empty (or handle merging if appropriate, though merging is complex)
                        // For now, we'll treat it as a conflict that prevents the DNI change.
                        console.warn(`Conflicto: La carpeta para el nuevo DNI ${newClientDocPath} ya existe. No se puede renombrar automáticamente.`);
                        return { success: false, message: `Conflicto: Ya existe un directorio para el nuevo DNI ${dni}. No se actualizó el DNI.` };
                    } else {
                        fs.renameSync(oldClientDocPath, newClientDocPath);
                        console.log(`Carpeta de documentos renombrada de ${oldClientDocPath} a ${newClientDocPath}`);
                    }
                } catch (renameError) {
                    console.error('Error renombrando carpeta de documentos del cliente:', renameError);
                    return { success: false, message: 'Error al renombrar el directorio de documentos del cliente. No se actualizó el DNI.' };
                }
            } else if (!fs.existsSync(oldClientDocPath) && !fs.existsSync(newClientDocPath)) {
                // If the old document path didn't exist, create the new one (e.g., for a client who never had documents yet)
                try {
                    fs.mkdirSync(newClientDocPath, { recursive: true });
                    console.log(`Directorio de documentos creado para el nuevo DNI en: ${newClientDocPath}`);
                } catch (mkdirError) {
                    console.error(`Error creando el directorio de documentos para el nuevo DNI ${dni}:`, mkdirError);
                    return { success: false, message: `Error al crear el directorio de documentos para el nuevo DNI ${dni}. No se actualizó el DNI.`};
                }
            }
            // If oldClientDocPath === newClientDocPath, no action needed.
            // If oldClientDocPath doesn't exist but newClientDocPath does, also no action (already exists).
        }
        
        const result = await dbUtil.run(
            `UPDATE clients SET 
                first_name = ?, last_name = ?, dni = ?, phone = ?, address = ?, 
                occupation = ?, email = ?, notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [firstName.trim(), lastName.trim(), dni.trim(), phone.trim(), address.trim(), 
             occupation?.trim() || null, email?.trim() || null, notes?.trim() || null, 
             (isActive !== undefined ? (isActive ? 1 : 0) : 1) , clientId]
        );

        if (result.changes > 0) {
            return { success: true, message: 'Cliente actualizado exitosamente.' };
        } else {
            // Podría ser que el cliente no exista o que los datos sean idénticos
            const exists = await dbUtil.get('SELECT id FROM clients WHERE id = ?', [clientId]);
            return exists ? { success: true, message: 'Datos sin cambios.'} : { success: false, message: 'Cliente no encontrado.' };
        }
    } catch (error) {
        console.error('Error en updateClient:', error);
         if (error.message && error.message.includes('UNIQUE constraint failed: clients.dni')) {
            return { success: false, message: `El DNI ${dni} ya está asignado a otro cliente (error BD).` };
        }
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Da de baja lógica a un cliente (is_active = 0).
 * @param {number} clientId
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function deactivateClient(clientId) {
    try {
        const result = await dbUtil.run('UPDATE clients SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [clientId]);
        if (result.changes > 0) {
            return { success: true, message: 'Cliente desactivado exitosamente.' };
        } else {
            return { success: false, message: 'Cliente no encontrado.' };
        }
    } catch (error) {
        console.error('Error en deactivateClient:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Reactiva un cliente (is_active = 1).
 * @param {number} clientId
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function reactivateClient(clientId) {
    try {
        const result = await dbUtil.run('UPDATE clients SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [clientId]);
        if (result.changes > 0) {
            return { success: true, message: 'Cliente reactivado exitosamente.' };
        } else {
            return { success: false, message: 'Cliente no encontrado.' };
        }
    } catch (error) {
        console.error('Error en reactivateClient:', error);
        return { success: false, message: `Error interno del servidor: ${error.message}` };
    }
}

/**
 * Sube un documento para un cliente.
 * @param {number} clientId
 * @param {string} documentType - Tipo de documento (dni_front, etc.)
 * @param {string} sourceFilePath - Ruta del archivo original en el sistema del usuario.
 * @param {string} originalFilename - Nombre original del archivo.
 * @returns {Promise<object>} - Resultado de la operación.
 */
async function uploadClientDocument(clientId, documentType, sourceFilePath, originalFilename) {
    try {
        const client = await dbUtil.get('SELECT dni FROM clients WHERE id = ?', [clientId]);
        if (!client) {
            return { success: false, message: 'Cliente no encontrado.' };
        }

        const clientDNI = client.dni.toString();
        const clientSpecificDocDir = path.join(baseClientsDocumentsPath, clientDNI);

        // Asegurarse de que el directorio específico del cliente exista
        if (!fs.existsSync(clientSpecificDocDir)) {
            fs.mkdirSync(clientSpecificDocDir, { recursive: true });
        }

        const fileExtension = path.extname(originalFilename);
        const newFilename = `${documentType}_${Date.now()}${fileExtension}`;
        const destinationPath = path.join(clientSpecificDocDir, newFilename);
        
        fs.copyFileSync(sourceFilePath, destinationPath);

        // Guardar en la base de datos (solo el nombre del archivo, no la ruta completa)
        const result = await dbUtil.run(
            'INSERT INTO client_documents (client_id, document_type, file_path, original_filename) VALUES (?, ?, ?, ?)',
            [clientId, documentType, newFilename, originalFilename]
        );

        if (result.lastID) {
            return { 
                success: true, 
                documentId: result.lastID, 
                message: 'Documento subido exitosamente.',
                full_path: `file://${destinationPath.replace(/\\/g, '/')}` // Para visualización inmediata
            };
        } else {
            if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath); // Limpiar si falla la BD
            return { success: false, message: 'Error al guardar la información del documento.' };
        }
    } catch (error) {
        console.error('Error en uploadClientDocument:', error);
        return { success: false, message: `Error interno al subir el documento: ${error.message}` };
    }
}

/**
 * Elimina un documento de un cliente.
 * @param {number} documentId
 * @returns {Promise<object>}
 */
async function deleteClientDocument(documentId) {
    try {
        const doc = await dbUtil.get(
            'SELECT cd.file_path, c.dni FROM client_documents cd JOIN clients c ON cd.client_id = c.id WHERE cd.id = ?', 
            [documentId]
        );
        if (!doc) {
            return { success: false, message: "Documento no encontrado." };
        }

        const filePathToDelete = path.join(baseClientsDocumentsPath, doc.dni.toString(), doc.file_path);

        const dbResult = await dbUtil.run('DELETE FROM client_documents WHERE id = ?', [documentId]);

        if (dbResult.changes > 0) {
            if (fs.existsSync(filePathToDelete)) {
                try {
                    fs.unlinkSync(filePathToDelete);
                } catch (fileError) {
                    console.error(`Error eliminando archivo físico ${filePathToDelete}:`, fileError);
                    // No hacer fallar la operación completa si solo falla la eliminación del archivo, pero loguearlo.
                }
            }
            return { success: true, message: "Documento eliminado correctamente." };
        } else {
            return { success: false, message: "No se pudo eliminar el documento de la base de datos." };
        }
    } catch (error) {
        console.error('Error en deleteClientDocument:', error);
        return { success: false, message: `Error interno: ${error.message}` };
    }
}

module.exports = {
    addClient,
    getAllClients,
    getClientById,
    updateClient,
    deactivateClient,
    reactivateClient,
    uploadClientDocument,
    deleteClientDocument
};