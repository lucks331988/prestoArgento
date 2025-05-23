// src/main/settingsManager.js
const fs = require('fs-extra'); // Usaremos fs-extra por su conveniencia (ej. copySync, remove)
const path = require('path');
const { app, dialog } = require('electron');
const archiver = require('archiver'); // Para crear archivos ZIP
const extract = require('extract-zip'); // Para extraer archivos ZIP

const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const dbFileName = 'presto_argento.sqlite3';
const dbPath = path.join(prestoArgentoDataPath, dbFileName);

// Nombres de las carpetas de datos importantes DENTRO de PrestoArgentoData
const documentsDirName = 'documents';
const companyInfoDirName = 'company_info';
const contractsDirName = 'contracts';
const receiptsDirName = 'receipts';

// Rutas completas a estas carpetas
const documentsPath = path.join(prestoArgentoDataPath, documentsDirName);
const companyInfoPathDir = path.join(prestoArgentoDataPath, companyInfoDirName);
const contractsPathDir = path.join(prestoArgentoDataPath, contractsDirName);
const receiptsPathDir = path.join(prestoArgentoDataPath, receiptsDirName);


/**
 * Crea un backup de la base de datos y los directorios de datos relevantes.
 * @param {BrowserWindow} parentWindow - Ventana padre para el diálogo.
 * @returns {Promise<object>}
 */
async function backupDatabaseAndDocuments(parentWindow) {
    try {
        const { filePath: backupFilePath } = await dialog.showSaveDialog(parentWindow, {
            title: 'Guardar Backup de Presto Argento',
            defaultPath: `PrestoArgento_Backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.zip`,
            filters: [{ name: 'Archivos ZIP', extensions: ['zip'] }]
        });

        if (!backupFilePath) {
            return { success: false, message: 'Backup cancelado por el usuario.' };
        }

        const output = fs.createWriteStream(backupFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } }); // Nivel de compresión alto

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`Backup creado: ${backupFilePath}, Tamaño: ${archive.pointer()} bytes`);
                resolve({ success: true, message: `Backup creado exitosamente en: ${backupFilePath}` });
            });

            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    console.warn('Archiver warning (archivo no encontrado durante backup):', err);
                } else {
                    // No rechazar por warnings simples, pero sí loguear.
                    console.warn('Archiver warning:', err);
                }
            });
            
            archive.on('error', (err) => {
                reject({ success: false, message: `Error al crear el archivo ZIP: ${err.message}`});
            });

            archive.pipe(output);

            // Añadir base de datos
            if (fs.existsSync(dbPath)) {
                archive.file(dbPath, { name: dbFileName });
            } else {
                 console.warn(`Archivo de base de datos no encontrado en ${dbPath} para backup.`);
            }

            // Añadir directorios de datos si existen
            const directoriesToBackup = [
                { diskPath: documentsPath, zipPath: documentsDirName },
                { diskPath: companyInfoPathDir, zipPath: companyInfoDirName },
                { diskPath: contractsPathDir, zipPath: contractsDirName },
                { diskPath: receiptsPathDir, zipPath: receiptsDirName },
            ];

            directoriesToBackup.forEach(dirInfo => {
                if (fs.existsSync(dirInfo.diskPath)) {
                    archive.directory(dirInfo.diskPath, dirInfo.zipPath);
                } else {
                    console.warn(`Directorio ${dirInfo.diskPath} no encontrado para backup.`);
                }
            });

            archive.finalize();
        });

    } catch (error) {
        console.error('Error en backupDatabaseAndDocuments:', error);
        return { success: false, message: `Error al crear backup: ${error.message}` };
    }
}


/**
 * Restaura la base de datos y documentos desde un backup.
 * ADVERTENCIA: Esta operación es destructiva y reemplazará los datos actuales.
 * @param {BrowserWindow} parentWindow - Ventana padre para el diálogo.
 * @returns {Promise<object>}
 */
async function restoreDatabaseAndDocuments(parentWindow) {
    let tempRestoreDir = path.join(app.getPath('temp'), `presto-argento-restore-${Date.now()}`);
    try {
        const { filePaths } = await dialog.showOpenDialog(parentWindow, {
            title: 'Seleccionar Archivo de Backup para Restaurar',
            properties: ['openFile'],
            filters: [{ name: 'Archivos ZIP', extensions: ['zip'] }]
        });

        if (!filePaths || filePaths.length === 0) {
            return { success: false, message: 'Restauración cancelada por el usuario.' };
        }
        const backupZipPath = filePaths[0];

        const confirmation = await dialog.showMessageBox(parentWindow, {
            type: 'warning',
            title: 'Confirmar Restauración',
            message: '¿Está seguro de que desea restaurar desde este backup? TODOS LOS DATOS ACTUALES SERÁN REEMPLAZADOS. Se recomienda encarecidamente hacer un backup de sus datos actuales antes de proceder.',
            buttons: ['Cancelar', 'Restaurar Ahora'],
            defaultId: 0, // Índice del botón por defecto (Cancelar)
            cancelId: 0   // Índice del botón que se considera cancelación
        });

        if (confirmation.response === 0) { // 0 es Cancelar
            return { success: false, message: 'Restauración cancelada por el usuario.' };
        }
        
        await fs.ensureDir(tempRestoreDir);
        await extract(backupZipPath, { dir: tempRestoreDir });

        const restoredDbPath = path.join(tempRestoreDir, dbFileName);
        if (!fs.existsSync(restoredDbPath)) {
            await fs.remove(tempRestoreDir); 
            return { success: false, message: `El archivo de backup no contiene una base de datos válida ('${dbFileName}').` };
        }

        // --- SECCIÓN CRÍTICA: Detener acceso a BD y reemplazar archivos ---
        // Idealmente, cerrar la conexión a la BD aquí (dbModule.db.close())
        // Pero esto requiere que dbModule exponga un método close() y un reOpen() o que la app se reinicie.
        // Por ahora, confiamos en que el reinicio forzoso maneje la reconexión.
        console.log("Iniciando reemplazo de archivos para restauración...");

        // Backup de emergencia de los datos actuales (opcional pero MUY recomendado)
        const emergencyBackupDir = path.join(prestoArgentoDataPath, `_emergency_backup_${DateTime.now().toFormat('yyyyMMdd_HHmmss')}`);
        try {
            if (fs.existsSync(prestoArgentoDataPath)) { // Si existe la carpeta de datos
                 await fs.copy(prestoArgentoDataPath, emergencyBackupDir);
                 console.log(`Backup de emergencia de datos actuales creado en: ${emergencyBackupDir}`);
            }
        } catch (emergErr) {
            console.error("Error crítico creando backup de emergencia de datos actuales:", emergErr);
            // Considerar no continuar si el backup de emergencia falla, o advertir severamente.
        }

        // Eliminar datos actuales (directorios principales)
        const currentDataDirs = [documentsPath, companyInfoPathDir, contractsPathDir, receiptsPathDir];
        for (const dir of currentDataDirs) {
            if (fs.existsSync(dir)) await fs.remove(dir);
        }
        if (fs.existsSync(dbPath)) await fs.remove(dbPath); // Eliminar la BD actual

        // Copiar los archivos restaurados desde temp a la ubicación de datos de la app
        await fs.copy(restoredDbPath, dbPath);
        
        const restoredDirsToCopy = [
            { tempPath: path.join(tempRestoreDir, documentsDirName), finalPath: documentsPath },
            { tempPath: path.join(tempRestoreDir, companyInfoDirName), finalPath: companyInfoPathDir },
            { tempPath: path.join(tempRestoreDir, contractsDirName), finalPath: contractsPathDir },
            { tempPath: path.join(tempRestoreDir, receiptsDirName), finalPath: receiptsPathDir },
        ];

        for (const dirInfo of restoredDirsToCopy) {
            if (fs.existsSync(dirInfo.tempPath)) {
                await fs.copy(dirInfo.tempPath, dirInfo.finalPath);
            }
        }
        
        await fs.remove(tempRestoreDir); // Limpiar directorio temporal
        console.log("Archivos restaurados. La aplicación se reiniciará.");

        dialog.showMessageBox(parentWindow, {
            type: 'info',
            title: 'Restauración Completa',
            message: 'La restauración se ha completado. La aplicación se cerrará. Por favor, reiníciela para aplicar los cambios.',
            buttons: ['OK']
        }).then(() => {
            app.relaunch(); 
            app.exit();     
        });
        
        return { success: true, message: 'Restauración iniciada. La aplicación se reiniciará.' };

    } catch (error) {
        console.error('Error en restoreDatabaseAndDocuments:', error);
        if (fs.existsSync(tempRestoreDir)) { // Intenta limpiar si falla
            try { await fs.remove(tempRestoreDir); } catch (cleanupError) { console.error("Error limpiando directorio temporal:", cleanupError); }
        }
        return { success: false, message: `Error al restaurar: ${error.message}` };
    }
}

module.exports = {
    backupDatabaseAndDocuments,
    restoreDatabaseAndDocuments
};