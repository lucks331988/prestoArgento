// src/main/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const userDataPath = app.getPath('userData');
const prestoArgentoDataPath = path.join(userDataPath, 'PrestoArgentoData');
const dbPath = path.join(prestoArgentoDataPath, 'presto_argento.sqlite3');

// Asegurar que el directorio de datos existe antes de intentar crear/abrir la BD
if (!fs.existsSync(prestoArgentoDataPath)) {
    fs.mkdirSync(prestoArgentoDataPath, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error al abrir la base de datos Presto Argento:', err.message);
    } else {
        console.log(`Conectado a la base de datos SQLite Presto Argento en: ${dbPath}`);
        // Habilitar claves foráneas
        db.exec('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if (pragmaErr) {
                console.error("No se pudo habilitar PRAGMA foreign_keys:", pragmaErr.message);
            }
        });
    }
});

const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tabla de Usuarios
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'employee')) DEFAULT 'employee',
                    is_active INTEGER DEFAULT 1, -- 1 para activo, 0 para inactivo/eliminado lógicamente
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => { if (err) return reject(`Error creando tabla users: ${err.message}`); console.log("Tabla 'users' verificada/creada."); });

            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_users_updated_at
                AFTER UPDATE ON users FOR EACH ROW
                BEGIN
                    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `, (err) => { if (err) console.warn("Advertencia trigger 'update_users_updated_at':", err.message); });


            // Tabla de Información de la Empresa
            db.run(`
                CREATE TABLE IF NOT EXISTS company_info (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    name TEXT DEFAULT 'Presto Argento',
                    address TEXT,
                    phone TEXT,
                    cuit TEXT,
                    logo_path TEXT,
                    default_daily_interest_rate REAL DEFAULT 0.01,
                    default_monthly_interest_rate REAL DEFAULT 0.10,
                    admin_username TEXT, 
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => { 
                if (err) return reject(`Error creando tabla company_info: ${err.message}`);
                console.log("Tabla 'company_info' verificada/creada.");
                // Insertar datos por defecto si la tabla está vacía
                db.get("SELECT COUNT(*) as count FROM company_info WHERE id = 1", (err, row) => {
                    if (err) return reject(`Error verificando company_info: ${err.message}`);
                    if (row.count === 0) {
                        db.run(`INSERT INTO company_info (id, name) VALUES (1, 'Presto Argento')`, (insertErr) => {
                            if (insertErr) return reject(`Error insertando datos por defecto en company_info: ${insertErr.message}`);
                            console.log("Datos por defecto insertados en 'company_info'.");
                        });
                    }
                });
            });

            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_company_info_updated_at
                AFTER UPDATE ON company_info FOR EACH ROW
                BEGIN
                    UPDATE company_info SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `, (err) => { if (err) console.warn("Advertencia trigger 'update_company_info_updated_at':", err.message);});

            // Tabla de Clientes
            db.run(`
                CREATE TABLE IF NOT EXISTS clients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    first_name TEXT NOT NULL, last_name TEXT NOT NULL, dni TEXT UNIQUE NOT NULL,
                    phone TEXT NOT NULL, address TEXT NOT NULL, occupation TEXT,
                    email TEXT, notes TEXT, is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => { if (err) return reject(`Error creando tabla clients: ${err.message}`); console.log("Tabla 'clients' verificada/creada."); });
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_clients_updated_at
                AFTER UPDATE ON clients FOR EACH ROW
                BEGIN
                    UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `, (err) => { if (err) console.warn("Advertencia trigger 'update_clients_updated_at':", err.message);});

            // Tabla de Documentos de Clientes
            db.run(`
                CREATE TABLE IF NOT EXISTS client_documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    client_id INTEGER NOT NULL,
                    document_type TEXT NOT NULL CHECK(document_type IN ('dni_front', 'dni_back', 'salary_slip', 'guarantor_dni_front', 'guarantor_dni_back', 'guarantor_salary_slip', 'other')),
                    file_path TEXT NOT NULL,
                    original_filename TEXT,
                    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
                )
            `, (err) => { if (err) return reject(`Error creando tabla client_documents: ${err.message}`); console.log("Tabla 'client_documents' verificada/creada."); });

            // Tabla de Préstamos (loans)
            db.run(`
                CREATE TABLE IF NOT EXISTS loans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL,
                    loan_type TEXT NOT NULL CHECK(loan_type IN ('daily', 'monthly')),
                    principal_amount REAL NOT NULL, interest_rate REAL NOT NULL, term_duration INTEGER NOT NULL,
                    total_interest REAL NOT NULL, total_amount_due REAL NOT NULL,
                    installment_amount REAL NOT NULL, number_of_installments INTEGER NOT NULL,
                    start_date DATE NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paid', 'overdue', 'defaulted', 'cancelled')),
                    guarantor_first_name TEXT, guarantor_last_name TEXT, guarantor_dni TEXT,
                    guarantor_phone TEXT, guarantor_address TEXT, notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by_user_id INTEGER,
                    FOREIGN KEY (client_id) REFERENCES clients(id),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
                )
            `, (err) => { if (err) return reject(`Error creando tabla loans: ${err.message}`); console.log("Tabla 'loans' verificada/creada."); });

            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_loans_updated_at
                AFTER UPDATE ON loans FOR EACH ROW
                BEGIN
                    UPDATE loans SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `, (err) => { if (err) console.warn("Advertencia trigger 'update_loans_updated_at':", err.message);});

            // Tabla de Cuotas de Préstamos (loan_installments)
            db.run(`
                CREATE TABLE IF NOT EXISTS loan_installments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, loan_id INTEGER NOT NULL,
                    installment_number INTEGER NOT NULL, due_date DATE NOT NULL, amount_due REAL NOT NULL,
                    amount_paid REAL DEFAULT 0, interest_on_arrears REAL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'partially_paid', 'overdue', 'defaulted')),
                    payment_date DATETIME, notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
                )
            `, (err) => { if (err) return reject(`Error creando tabla loan_installments: ${err.message}`); console.log("Tabla 'loan_installments' verificada/creada."); });

            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_loan_installments_updated_at
                AFTER UPDATE ON loan_installments FOR EACH ROW
                BEGIN
                    UPDATE loan_installments SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `, (err) => { if (err) console.warn("Advertencia trigger 'update_loan_installments_updated_at':", err.message);});

            // Tabla de Pagos (payments)
            db.run(`
                CREATE TABLE IF NOT EXISTS payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    loan_installment_id INTEGER NOT NULL, loan_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
                    payment_amount REAL NOT NULL, payment_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    payment_method TEXT, notes TEXT, receipt_path TEXT,
                    created_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (loan_installment_id) REFERENCES loan_installments(id),
                    FOREIGN KEY (loan_id) REFERENCES loans(id),
                    FOREIGN KEY (client_id) REFERENCES clients(id),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
                )
            `, (err) => { 
                if (err) return reject(`Error creando tabla payments: ${err.message}`);
                console.log("Tabla 'payments' verificada/creada.");
                resolve(); // Resuelve la promesa después de que se haya intentado crear la última tabla
            });
        });
    });
};

// Funciones de utilidad genéricas para ejecutar consultas
const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) { // No usar arrow function aquí para acceder a this.lastID/changes
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

module.exports = {
    db, // Exportar la instancia de la base de datos conectada
    initDatabase,
    get,
    all,
    run,
    getDBFilePath: () => dbPath, // Added function to get DB path
    closeDatabase: () => { // Added function to close DB
        return new Promise((resolve, reject) => {
            if (db && db.open) {
                db.close((err) => {
                    if (err) {
                        console.error('Error closing the database:', err.message);
                        return reject(err);
                    }
                    console.log('Database connection closed.');
                    resolve(true);
                });
            } else {
                resolve(false); // DB already closed or not initialized
            }
        });
    }
};