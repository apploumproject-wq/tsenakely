import initSqlJs, {type Database, type SqlJsStatic} from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {hashPassword, verifyPassword} from '../utils/crypto';
import {loadSqliteBytes, saveSqliteBytes} from './storage';
import type {
  AppSettings,
  CartItem,
  DailySalesPoint,
  DashboardSummary,
  PrinterConnectionMode,
  PrinterPaperWidth,
  Product,
  Sale,
  SaleDetail,
  SaleWithDetails,
  StatisticsSummary,
  StockMovement,
  StockMovementType,
  TopProductStat,
  User,
  UserRole,
} from './types';

const INITIAL_PRODUCTS: Array<{
  name: string;
  price: number;
  stock_qty: number;
  min_stock: number;
  category: string;
}> = [
  {name: 'Glace double', price: 3000, stock_qty: 25, min_stock: 5, category: 'Glaces'},
  {name: 'Glace simple', price: 1500, stock_qty: 30, min_stock: 5, category: 'Glaces'},
  {name: 'Popcorn', price: 2000, stock_qty: 20, min_stock: 5, category: 'Snacks'},
  {name: 'Pain ordoeuvre GM', price: 2000, stock_qty: 15, min_stock: 4, category: 'Pâtisserie'},
  {name: 'Pain ordoeuvre PM', price: 1500, stock_qty: 20, min_stock: 5, category: 'Pâtisserie'},
];

const DEFAULT_SETTINGS: AppSettings = {
  shop_name: 'TSENAKELY',
  currency: 'Ar',
  shop_phone: '',
  shop_address: '',
  shop_logo_data_url: '',
  receipt_footer: 'Merci pour votre achat !',
  low_stock_alert_enabled: true,
  printer_connection_mode: 'BLUETOOTH',
  printer_paper_width: '58',
  printer_device_name: '',
  printer_auto_print_sale: false,
};

function rowToObject<T>(
  columns: string[],
  values: (string | number | Uint8Array | null)[]
): T {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = values[i];
  }
  return obj as T;
}

function queryAll<T>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results: T[] = [];
    const cols = stmt.getColumnNames();
    while (stmt.step()) {
      const row = stmt.get();
      results.push(rowToObject<T>(cols, row));
    }
    return results;
  } finally {
    stmt.free();
  }
}

function queryOne<T>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

class TsenakelyDatabase {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
      });

      const savedBytes = await loadSqliteBytes();
      let candidate: Database;

      if (savedBytes !== null) {
        if (savedBytes.byteLength === 0) {
          throw new Error(
            'Le fichier SQLite local est vide. Aucune réinitialisation automatique n’a été effectuée afin de protéger vos ventes.'
          );
        }

        try {
          candidate = new this.SQL.Database(savedBytes);
          const requiredTables = queryAll<{name: string}>(
            candidate,
            `SELECT name FROM sqlite_master WHERE type = 'table'`
          ).map((table) => table.name);
          const integrity = queryOne<{integrity_check: string}>(
            candidate,
            'PRAGMA integrity_check'
          );
          if (integrity?.integrity_check !== 'ok') {
            candidate.close();
            throw new Error(
              'Le contrôle d’intégrité de la base SQLite enregistrée a échoué. Restaurez une sauvegarde valide avant de continuer.'
            );
          }

          const required = [
            'schema_migrations',
            'app_settings',
            'users',
            'products',
            'sales',
            'sale_details',
            'stock_movements',
          ];
          const missing = required.filter((name) => !requiredTables.includes(name));

          if (missing.length > 0) {
            candidate.close();
            throw new Error(
              `La base SQLite enregistrée ne contient pas les tables attendues (${missing.join(', ')}). Restaurez une sauvegarde valide avant de continuer.`
            );
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('tables attendues')) {
            throw error;
          }
          throw new Error(
            'Impossible de lire la base SQLite enregistrée. Vos données n’ont pas été remplacées. Restaurez une sauvegarde valide avant de réessayer.'
          );
        }
      } else {
        candidate = new this.SQL.Database();
      }

      this.db = candidate;
      await this.ensureSchemaAndSeed();
    })();

    try {
      await this.initPromise;
    } catch (err) {
      const dbToClose = this.db as Database | null;
      if (dbToClose) dbToClose.close();
      this.db = null;
      this.SQL = null;
      this.initPromise = null;
      throw err;
    }
  }

  private getDb(): Database {
    if (!this.db) {
      throw new Error('La base de données locale n’est pas encore initialisée.');
    }
    return this.db;
  }

  private async persist(): Promise<void> {
    const db = this.getDb();
    const bytes = db.export();
    await saveSqliteBytes(bytes);
  }

  /**
   * Restore the pre-operation snapshot if durable storage rejects a commit.
   * IndexedDB writes are atomic; the in-memory copy must not get ahead of disk.
   */
  private async persistOrRestore(snapshot: Uint8Array): Promise<void> {
    try {
      await this.persist();
    } catch (error) {
      try {
        if (!this.SQL) {
          throw new Error('Le moteur SQLite n’est plus disponible.');
        }
        // Build and validate the rollback copy before replacing the active handle.
        const previousDb = new this.SQL.Database(snapshot);
        previousDb.run('PRAGMA foreign_keys = ON;');
        const integrity = queryOne<{integrity_check: string}>(
          previousDb,
          'PRAGMA integrity_check'
        );
        if (integrity?.integrity_check !== 'ok') {
          previousDb.close();
          throw new Error('La copie de restauration SQLite est invalide.');
        }
        this.db?.close();
        this.db = previousDb;
      } catch (restoreError) {
        // Never continue serving reads/writes from a database whose durable
        // save failed and whose in-memory rollback could not be verified.
        this.db?.close();
        this.db = null;
        this.initPromise = null;
        throw new Error(
          'La sauvegarde locale a échoué et la restauration en mémoire a également échoué. TSENAKELY a bloqué les opérations pour éviter d’aggraver la perte de données. Vérifiez le stockage et rechargez l’application avant de reprendre les opérations.',
          {cause: restoreError}
        );
      }
      throw new Error(
        'La sauvegarde locale a échoué. Les modifications de cette opération ont été annulées en mémoire ; vérifiez le stockage de votre appareil avant de réessayer.',
        {cause: error}
      );
    }
  }

  private async ensureSchemaAndSeed(): Promise<void> {
    const db = this.getDb();
    db.run('PRAGMA foreign_keys = ON;');

    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('ADMIN', 'VENDEUR')),
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        price REAL NOT NULL CHECK(price >= 0),
        stock_qty INTEGER NOT NULL DEFAULT 0 CHECK(stock_qty >= 0),
        min_stock INTEGER NOT NULL DEFAULT 5 CHECK(min_stock >= 0),
        image_data_url TEXT,
        category TEXT NOT NULL DEFAULT 'Autres',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS production_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL, produced_at TEXT NOT NULL, closed_at TEXT,
        total_cost REAL NOT NULL DEFAULT 0, sold_quantity INTEGER, revenue REAL,
        profit REAL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED'))
      );
      CREATE TABLE IF NOT EXISTS production_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL, name TEXT NOT NULL,
        purchase_quantity REAL NOT NULL, purchase_unit TEXT NOT NULL, purchase_price REAL NOT NULL,
        used_quantity REAL NOT NULL, used_unit TEXT NOT NULL, used_cost REAL NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES production_batches(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_number TEXT NOT NULL UNIQUE,
        sale_date TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        total_amount REAL NOT NULL CHECK(total_amount >= 0),
        amount_paid REAL NOT NULL CHECK(amount_paid >= 0),
        change_given REAL NOT NULL CHECK(change_given >= 0),
        status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'CANCELLED')),
        cancelled_at TEXT,
        cancelled_by TEXT,
        cancel_reason TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        customer_address TEXT
      );

      CREATE TABLE IF NOT EXISTS sale_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        unit_price REAL NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        subtotal REAL NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        movement_type TEXT NOT NULL CHECK(movement_type IN ('INITIAL', 'RESTOCK', 'ADJUSTMENT', 'SALE', 'CANCEL_RESTORE')),
        qty_change INTEGER NOT NULL,
        qty_before INTEGER NOT NULL,
        qty_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
      CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
      CREATE INDEX IF NOT EXISTS idx_sale_details_sale_id ON sale_details(sale_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);
    `);

    const productColumns = queryAll<{name: string}>(db, `PRAGMA table_info(products)`).map((column) => column.name);
    const saleColumns = queryAll<{name: string}>(db, `PRAGMA table_info(sales)`).map((column) => column.name);
    let schemaChanged = false;
    if (!productColumns.includes('product_type')) { db.run(`ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'FINISHED'`); schemaChanged = true; }
    if (!productColumns.includes('image_data_url')) { db.run(`ALTER TABLE products ADD COLUMN image_data_url TEXT`); schemaChanged = true; }
    if (!productColumns.includes('category')) {
      db.run(`ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'Autres'`);
      db.run(`UPDATE products SET category = CASE
        WHEN lower(name) LIKE '%glace%' THEN 'Glaces'
        WHEN lower(name) LIKE '%pain%' OR lower(name) LIKE '%pâtisserie%' OR lower(name) LIKE '%patisserie%' THEN 'Pâtisserie'
        WHEN lower(name) LIKE '%popcorn%' THEN 'Snacks'
        ELSE 'Autres'
      END`);
      schemaChanged = true;
    }
    for (const column of ['customer_name', 'customer_phone', 'customer_email', 'customer_address']) {
      if (!saleColumns.includes(column)) { db.run(`ALTER TABLE sales ADD COLUMN ${column} TEXT`); schemaChanged = true; }
    }
    if (schemaChanged) await this.persist();

    const seeded = queryOne<{id: string}>(
      db,
      `SELECT id FROM schema_migrations WHERE id = ?`,
      ['initial_seed_v1']
    );

    if (!seeded) {
      const now = new Date().toISOString();
      const defaultAdminHash = await hashPassword('admin123');

      db.run('BEGIN TRANSACTION;');
      try {
        // 1. Compte administrateur par défaut
        const existingUser = queryOne<{id: number}>(
          db,
          `SELECT id FROM users WHERE username = ?`,
          ['admin']
        );
        if (!existingUser) {
          db.run(
            `INSERT INTO users (username, full_name, role, password_hash, is_active, created_at)
             VALUES (?, ?, ?, ?, 1, ?)`,
            ['admin', 'Administrateur', 'ADMIN', defaultAdminHash, now]
          );
        }

        // 2. Paramètres initiaux
        const entries = Object.entries(DEFAULT_SETTINGS);
        for (const [k, v] of entries) {
          db.run(
            `INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`,
            [k, String(v)]
          );
        }

        // 3. Catalogue initial (première installation uniquement)
        for (const item of INITIAL_PRODUCTS) {
          db.run(
            `INSERT INTO products (name, price, stock_qty, min_stock, category, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [item.name, item.price, item.stock_qty, item.min_stock, item.category, now, now]
          );
          const inserted = queryOne<{id: number}>(
            db,
            `SELECT last_insert_rowid() as id`
          );
          if (inserted) {
            db.run(
              `INSERT INTO stock_movements (product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
               VALUES (?, ?, 'INITIAL', ?, 0, ?, 'Stock initial à l’installation', 'Système', ?)`,
              [inserted.id, item.name, item.stock_qty, item.stock_qty, now]
            );
          }
        }

        db.run(
          `INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`,
          ['initial_seed_v1', now]
        );
        db.run('COMMIT;');
      } catch (err) {
        db.run('ROLLBACK;');
        throw err;
      }

      await this.persist();
    }
  }

  // ===================== AUTHENTIFICATION =====================

  async isUsingDefaultAdminPassword(): Promise<boolean> {
    await this.init();
    const db = this.getDb();
    const row = queryOne<{password_hash: string}>(
      db,
      `SELECT password_hash FROM users WHERE username = 'admin' AND is_active = 1`
    );
    if (!row) return false;
    return verifyPassword('admin123', row.password_hash);
  }

  async authenticate(username: string, password: string): Promise<User | null> {
    await this.init();
    const db = this.getDb();
    const trimmed = username.trim();
    if (!trimmed || !password) return null;

    const row = queryOne<{
      id: number;
      username: string;
      full_name: string;
      role: UserRole;
      password_hash: string;
      is_active: number;
      created_at: string;
    }>(
      db,
      `SELECT id, username, full_name, role, password_hash, is_active, created_at
       FROM users WHERE username = ? COLLATE NOCASE`,
      [trimmed]
    );

    if (!row || row.is_active !== 1) return null;
    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) return null;

    return {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      role: row.role,
      is_active: row.is_active === 1,
      created_at: row.created_at,
    };
  }

  async getUserById(id: number): Promise<User | null> {
    await this.init();
    const db = this.getDb();
    const row = queryOne<{
      id: number;
      username: string;
      full_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
    }>(
      db,
      `SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = ?`,
      [id]
    );
    if (!row || row.is_active !== 1) return null;
    return {
      ...row,
      is_active: row.is_active === 1,
    };
  }

  // ===================== UTILISATEURS =====================

  async getUsers(): Promise<User[]> {
    await this.init();
    const db = this.getDb();
    const rows = queryAll<{
      id: number;
      username: string;
      full_name: string;
      role: UserRole;
      is_active: number;
      created_at: string;
    }>(
      db,
      `SELECT id, username, full_name, role, is_active, created_at
       FROM users ORDER BY role ASC, full_name ASC`
    );
    return rows.map((r) => ({...r, is_active: r.is_active === 1}));
  }

  async createUser(input: {
    username: string;
    full_name: string;
    role: UserRole;
    password: string;
  }): Promise<User> {
    await this.init();
    const db = this.getDb();
    const username = input.username.trim();
    const fullName = input.full_name.trim();
    if (!username || username.length < 3) {
      throw new Error("Le nom d'utilisateur doit contenir au moins 3 caractères.");
    }
    if (!fullName) {
      throw new Error('Le nom complet est obligatoire.');
    }
    if (!input.password || input.password.length < 4) {
      throw new Error('Le mot de passe doit contenir au moins 4 caractères.');
    }
    const existing = queryOne<{id: number}>(
      db,
      `SELECT id FROM users WHERE username = ? COLLATE NOCASE`,
      [username]
    );
    if (existing) {
      throw new Error(`L'identifiant « ${username} » existe déjà.`);
    }

    const hash = await hashPassword(input.password);
    const now = new Date().toISOString();
    const previousSnapshot = db.export();
    db.run(
      `INSERT INTO users (username, full_name, role, password_hash, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [username, fullName, input.role, hash, now]
    );
    const created = queryOne<{id: number}>(db, `SELECT last_insert_rowid() as id`);
    await this.persistOrRestore(previousSnapshot);
    return {
      id: created!.id,
      username,
      full_name: fullName,
      role: input.role,
      is_active: true,
      created_at: now,
    };
  }

  async updateUser(
    id: number,
    input: {
      username: string;
      full_name: string;
      role: UserRole;
      is_active: boolean;
    },
    currentAdminId: number
  ): Promise<void> {
    await this.init();
    const db = this.getDb();
    const username = input.username.trim();
    const fullName = input.full_name.trim();
    if (!username || username.length < 3) {
      throw new Error("Le nom d'utilisateur doit contenir au moins 3 caractères.");
    }
    if (!fullName) {
      throw new Error('Le nom complet est obligatoire.');
    }

    const duplicate = queryOne<{id: number}>(
      db,
      `SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?`,
      [username, id]
    );
    if (duplicate) {
      throw new Error(`L'identifiant « ${username} » est déjà utilisé.`);
    }

    // Empêcher la désactivation ou rétrogradation du dernier administrateur actif
    const currentTarget = queryOne<{role: UserRole; is_active: number}>(
      db,
      `SELECT role, is_active FROM users WHERE id = ?`,
      [id]
    );
    if (!currentTarget) throw new Error('Utilisateur introuvable.');

    if (
      currentTarget.role === 'ADMIN' &&
      (input.role !== 'ADMIN' || !input.is_active)
    ) {
      const otherAdmins = queryOne<{cnt: number}>(
        db,
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id != ?`,
        [id]
      );
      if (!otherAdmins || otherAdmins.cnt === 0) {
        throw new Error(
          'Impossible de modifier ou désactiver le dernier administrateur actif.'
        );
      }
      if (id === currentAdminId && !input.is_active) {
        throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
      }
    }

    const previousSnapshot = db.export();
    db.run(
      `UPDATE users SET username = ?, full_name = ?, role = ?, is_active = ? WHERE id = ?`,
      [username, fullName, input.role, input.is_active ? 1 : 0, id]
    );
    await this.persistOrRestore(previousSnapshot);
  }

  async resetUserPassword(id: number, newPassword: string): Promise<void> {
    await this.init();
    if (!newPassword || newPassword.length < 4) {
      throw new Error('Le mot de passe doit contenir au moins 4 caractères.');
    }
    const db = this.getDb();
    const hash = await hashPassword(newPassword);
    const previousSnapshot = db.export();
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, id]);
    await this.persistOrRestore(previousSnapshot);
  }

  async changeOwnPassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    await this.init();
    if (!newPassword || newPassword.length < 4) {
      throw new Error(
        'Le nouveau mot de passe doit contenir au moins 4 caractères.'
      );
    }
    const db = this.getDb();
    const row = queryOne<{password_hash: string}>(
      db,
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (!row) throw new Error('Utilisateur introuvable.');
    const ok = await verifyPassword(currentPassword, row.password_hash);
    if (!ok) {
      throw new Error('Le mot de passe actuel est incorrect.');
    }
    const hash = await hashPassword(newPassword);
    const previousSnapshot = db.export();
    db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, userId]);
    await this.persistOrRestore(previousSnapshot);
  }

  async deleteUser(id: number, currentAdminId: number): Promise<void> {
    await this.init();
    if (id === currentAdminId) {
      throw new Error('Vous ne pouvez pas supprimer votre compte connecté.');
    }
    const db = this.getDb();
    const target = queryOne<{role: UserRole; is_active: number}>(
      db,
      `SELECT role, is_active FROM users WHERE id = ?`,
      [id]
    );
    if (!target) throw new Error('Utilisateur introuvable.');
    if (target.role === 'ADMIN' && target.is_active === 1) {
      const otherAdmins = queryOne<{cnt: number}>(
        db,
        `SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id != ?`,
        [id]
      );
      if (!otherAdmins || otherAdmins.cnt === 0) {
        throw new Error('Impossible de supprimer le dernier administrateur.');
      }
    }
    const previousSnapshot = db.export();
    db.run(`DELETE FROM users WHERE id = ?`, [id]);
    await this.persistOrRestore(previousSnapshot);
  }

  // ===================== FABRICATIONS MAISON =====================
  async setProductType(productId: number, productType: 'FINISHED' | 'HOMEMADE'): Promise<void> {
    await this.init(); const db = this.getDb();
    const active = queryOne<{id:number}>(db, `SELECT id FROM production_batches WHERE product_id=? AND status='ACTIVE'`, [productId]);
    if (active && productType === 'FINISHED') throw new Error('Clôturez la fabrication en cours avant de convertir ce produit.');
    const snapshot=db.export(); db.run(`UPDATE products SET product_type=?, updated_at=? WHERE id=?`, [productType,new Date().toISOString(),productId]); await this.persistOrRestore(snapshot);
  }
  async getProductionBatches(): Promise<import('./types').ProductionBatch[]> {
    await this.init(); const db=this.getDb();
    const batches=queryAll<Omit<import('./types').ProductionBatch,'ingredients'>>(db,`SELECT * FROM production_batches ORDER BY produced_at DESC,id DESC`);
    return batches.map(batch=>({...batch,ingredients:queryAll<import('./types').ProductionIngredient>(db,`SELECT * FROM production_ingredients WHERE batch_id=? ORDER BY id ASC`,[batch.id])}));
  }
  async startProduction(productId:number, producedAt:string, ingredients:import('./types').ProductionIngredientInput[]):Promise<number>{
    await this.init(); const db=this.getDb();
    const product=queryOne<Product>(db,`SELECT * FROM products WHERE id=?`,[productId]);
    if(!product) throw new Error('Produit introuvable.');
    if(product.product_type!=='HOMEMADE') throw new Error('Ce produit n’est pas configuré en fabrication maison.');
    if(queryOne<{id:number}>(db,`SELECT id FROM production_batches WHERE product_id=? AND status='ACTIVE'`,[productId])) throw new Error('Une fabrication est déjà en cours pour ce produit. Clôturez-la avant d’en démarrer une autre.');
    if(!producedAt || Number.isNaN(Date.parse(producedAt))) throw new Error('La date de fabrication est invalide.');
    if(!ingredients.length) throw new Error('Ajoutez au moins un ingrédient.');
    let totalCost=0;
    const prepared=ingredients.map(item=>{
      if(!item.name.trim() || ![item.purchase_quantity,item.purchase_price,item.used_quantity].every(v=>Number.isFinite(v)&&v>0) || !item.purchase_unit.trim() || !item.used_unit.trim()) throw new Error('Vérifiez le nom, les quantités, les unités et les prix de chaque ingrédient.');
      if(item.used_unit!==item.purchase_unit) throw new Error(`Les unités de « ${item.name} » doivent être identiques pour calculer le coût correctement.`);
      if(item.used_quantity>item.purchase_quantity) throw new Error(`La quantité utilisée de « ${item.name} » dépasse la quantité achetée.`);
      const usedCost=Math.round(item.used_quantity/item.purchase_quantity*item.purchase_price); totalCost+=usedCost; return {...item,usedCost};
    });
    const snapshot=db.export(); let transactionActive=false; db.run('BEGIN TRANSACTION;'); transactionActive=true;
    try{
      db.run(`INSERT INTO production_batches(product_id,product_name,produced_at,total_cost,status) VALUES(?,?,?,?,'ACTIVE')`,[productId,product.name,new Date(producedAt).toISOString(),totalCost]);
      const batchId=queryOne<{id:number}>(db,`SELECT last_insert_rowid() as id`)!.id;
      for(const item of prepared) db.run(`INSERT INTO production_ingredients(batch_id,name,purchase_quantity,purchase_unit,purchase_price,used_quantity,used_unit,used_cost) VALUES(?,?,?,?,?,?,?,?)`,[batchId,item.name.trim(),item.purchase_quantity,item.purchase_unit,item.purchase_price,item.used_quantity,item.used_unit,item.usedCost]);
      db.run('COMMIT;'); transactionActive=false; await this.persistOrRestore(snapshot); return batchId;
    }catch(error){if(transactionActive)db.run('ROLLBACK;');throw error;}
  }
  async closeProduction(batchId:number):Promise<void>{
    await this.init(); const db=this.getDb();
    const batch=queryOne<import('./types').ProductionBatch>(db,`SELECT * FROM production_batches WHERE id=? AND status='ACTIVE'`,[batchId]);
    if(!batch) throw new Error('Cette fabrication est introuvable ou déjà clôturée.');
    const now=new Date().toISOString();
    const sales=queryOne<{quantity:number;revenue:number}>(db,`SELECT COALESCE(SUM(sd.quantity),0) as quantity,COALESCE(SUM(sd.subtotal),0) as revenue FROM sale_details sd INNER JOIN sales s ON s.id=sd.sale_id WHERE sd.product_id=? AND s.status='COMPLETED' AND s.sale_date>=? AND s.sale_date<=?`,[batch.product_id,batch.produced_at,now]);
    const quantity=sales?.quantity??0, revenue=sales?.revenue??0, snapshot=db.export();
    db.run(`UPDATE production_batches SET closed_at=?,sold_quantity=?,revenue=?,profit=?,status='CLOSED' WHERE id=?`,[now,quantity,revenue,revenue-batch.total_cost,batchId]);
    await this.persistOrRestore(snapshot);
  }
  // ===================== PRODUITS & STOCKS =====================

  async getProductCategories(): Promise<string[]> {
    await this.init();
    const db = this.getDb();
    const saved = queryOne<{value: string}>(
      db,
      `SELECT value FROM app_settings WHERE key = ?`,
      ['product_categories']
    );
    let configured: string[] = [];
    try {
      const parsed: unknown = saved ? JSON.parse(saved.value) : [];
      if (Array.isArray(parsed)) {
        configured = parsed.filter((value): value is string => typeof value === 'string');
      }
    } catch {
      configured = [];
    }
    const existing = queryAll<{category: string}>(
      db,
      `SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE`
    ).map((row) => row.category);
    return Array.from(new Set(['Autres', 'Boissons', 'Glaces', 'Pâtisserie', 'Snacks', ...configured, ...existing]
      .map((value) => value.trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }

  async addProductCategory(categoryName: string): Promise<string[]> {
    await this.init();
    const category = categoryName.trim().replace(/\\s+/g, ' ');
    if (!category) throw new Error('Le nom de la catégorie est obligatoire.');
    if (category.length > 40) throw new Error('La catégorie ne doit pas dépasser 40 caractères.');
    const db = this.getDb();
    const categories = await this.getProductCategories();
    if (categories.some((item) => item.toLocaleLowerCase('fr') === category.toLocaleLowerCase('fr'))) {
      throw new Error(`La catégorie « ${category} » existe déjà.`);
    }
    const next = [...categories, category].sort((a, b) => a.localeCompare(b, 'fr'));
    const previousSnapshot = db.export();
    db.run(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['product_categories', JSON.stringify(next)]
    );
    await this.persistOrRestore(previousSnapshot);
    return next;
  }

  async getProducts(search = ''): Promise<Product[]> {
    await this.init();
    const db = this.getDb();
    const q = search.trim();
    if (q) {
      return queryAll<Product>(
        db,
        `SELECT * FROM products WHERE name LIKE ? ORDER BY name ASC`,
        [`%${q}%`]
      );
    }
    return queryAll<Product>(db, `SELECT * FROM products ORDER BY name ASC`);
  }

  async addProduct(
    input: {
      name: string;
      price: number;
      stock_qty: number;
      min_stock: number;
      image_data_url?: string | null;
      category?: string;
    },
    actorName: string
  ): Promise<Product> {
    await this.init();
    const db = this.getDb();
    const name = input.name.trim();
    const category = (input.category || 'Autres').trim() || 'Autres';
    if (!name) throw new Error('Le nom du produit est obligatoire.');
    if (input.price < 0 || Number.isNaN(input.price)) {
      throw new Error('Le prix de vente doit être positif ou nul.');
    }
    if (input.stock_qty < 0 || !Number.isInteger(input.stock_qty)) {
      throw new Error('La quantité en stock doit être un entier positif.');
    }
    if (input.min_stock < 0 || !Number.isInteger(input.min_stock)) {
      throw new Error('Le stock minimum doit être un entier positif.');
    }

    const dup = queryOne<{id: number}>(
      db,
      `SELECT id FROM products WHERE name = ? COLLATE NOCASE`,
      [name]
    );
    if (dup) {
      throw new Error(`Le produit « ${name} » existe déjà.`);
    }

    const now = new Date().toISOString();
    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      db.run(
        `INSERT INTO products (name, price, stock_qty, min_stock, image_data_url, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, Math.round(input.price), input.stock_qty, input.min_stock, input.image_data_url ?? null, category, now, now]
      );
      const row = queryOne<{id: number}>(db, `SELECT last_insert_rowid() as id`);
      const productId = row!.id;
      if (input.stock_qty > 0) {
        db.run(
          `INSERT INTO stock_movements (product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
           VALUES (?, ?, 'INITIAL', ?, 0, ?, 'Création du produit', ?, ?)`,
          [productId, name, input.stock_qty, input.stock_qty, actorName, now]
        );
      }
      db.run('COMMIT;');
      transactionActive = false;
      await this.persistOrRestore(previousSnapshot);
      return {
        id: productId,
        product_type: 'FINISHED',
        name,
        price: Math.round(input.price),
        stock_qty: input.stock_qty,
        min_stock: input.min_stock,
        category,
        created_at: now,
        updated_at: now,
      };
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
      }
      throw err;
    }
  }

  async updateProduct(
    id: number,
    input: {
      name: string;
      price: number;
      min_stock: number;
      image_data_url?: string | null;
      category?: string;
    }
  ): Promise<void> {
    await this.init();
    const db = this.getDb();
    const name = input.name.trim();
    const category = (input.category || 'Autres').trim() || 'Autres';
    if (!name) throw new Error('Le nom du produit est obligatoire.');
    if (input.price < 0 || Number.isNaN(input.price)) {
      throw new Error('Le prix doit être positif.');
    }
    if (input.min_stock < 0 || !Number.isInteger(input.min_stock)) {
      throw new Error('Le stock minimum doit être un entier positif.');
    }

    const dup = queryOne<{id: number}>(
      db,
      `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND id != ?`,
      [name, id]
    );
    if (dup) {
      throw new Error(`Un autre produit porte déjà le nom « ${name} ».`);
    }

    const now = new Date().toISOString();
    const previousSnapshot = db.export();
    db.run(
      `UPDATE products SET name = ?, price = ?, min_stock = ?, image_data_url = ?, category = ?, updated_at = ? WHERE id = ?`,
      [name, Math.round(input.price), input.min_stock, input.image_data_url ?? null, category, now, id]
    );
    await this.persistOrRestore(previousSnapshot);
  }

  async adjustStock(
    productId: number,
    delta: number,
    reason: string,
    actorName: string,
    type: StockMovementType = delta >= 0 ? 'RESTOCK' : 'ADJUSTMENT'
  ): Promise<Product> {
    await this.init();
    const db = this.getDb();
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error('La variation de stock doit être un entier non nul.');
    }
    const product = queryOne<Product>(
      db,
      `SELECT * FROM products WHERE id = ?`,
      [productId]
    );
    if (!product) throw new Error('Produit introuvable.');

    const newQty = product.stock_qty + delta;
    if (newQty < 0) {
      throw new Error(
        `Stock insuffisant : le stock actuel (${product.stock_qty}) ne peut pas devenir négatif.`
      );
    }

    const now = new Date().toISOString();
    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      db.run(
        `UPDATE products SET stock_qty = ?, updated_at = ? WHERE id = ?`,
        [newQty, now, productId]
      );
      db.run(
        `INSERT INTO stock_movements (product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          product.name,
          type,
          delta,
          product.stock_qty,
          newQty,
          reason.trim() || (delta > 0 ? 'Réapprovisionnement' : 'Ajustement manuel'),
          actorName,
          now,
        ]
      );
      db.run('COMMIT;');
      transactionActive = false;
      await this.persistOrRestore(previousSnapshot);
      return {
        ...product,
        stock_qty: newQty,
        updated_at: now,
      };
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
      }
      throw err;
    }
  }

  async deleteProduct(id: number): Promise<void> {
    await this.init();
    const db = this.getDb();
    const previousSnapshot = db.export();
    db.run(`DELETE FROM products WHERE id = ?`, [id]);
    await this.persistOrRestore(previousSnapshot);
  }

  async getStockMovements(limit = 100): Promise<StockMovement[]> {
    await this.init();
    const db = this.getDb();
    return queryAll<StockMovement>(
      db,
      `SELECT * FROM stock_movements ORDER BY created_at DESC, id DESC LIMIT ?`,
      [limit]
    );
  }

  // ===================== VENTES (POS & HISTORIQUE) =====================

  async createSale(
    user: User,
    items: CartItem[],
    amountPaid: number,
    customer?: {name?: string; phone?: string; email?: string; address?: string}
  ): Promise<SaleWithDetails> {
    await this.init();
    const db = this.getDb();

    if (items.length === 0) {
      throw new Error('Le panier est vide.');
    }
    if (Number.isNaN(amountPaid) || amountPaid < 0) {
      throw new Error('Le montant payé est invalide.');
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      let totalAmount = 0;
      const verifiedItems: Array<{
        product: Product;
        quantity: number;
        subtotal: number;
      }> = [];

      for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`Quantité invalide pour ${item.product.name}.`);
        }
        const liveProduct = queryOne<Product>(
          db,
          `SELECT * FROM products WHERE id = ?`,
          [item.product.id]
        );
        if (!liveProduct) {
          throw new Error(`Produit introuvable : ${item.product.name}.`);
        }
        if (liveProduct.product_type !== 'HOMEMADE' && liveProduct.stock_qty < item.quantity) {
          throw new Error(
            `Stock insuffisant pour « ${liveProduct.name} » (disponible : ${liveProduct.stock_qty}, demandé : ${item.quantity}).`
          );
        }
        const subtotal = Math.round(liveProduct.price * item.quantity);
        totalAmount += subtotal;
        verifiedItems.push({
          product: liveProduct,
          quantity: item.quantity,
          subtotal,
        });
      }

      const paidRounded = Math.round(amountPaid);
      if (paidRounded < totalAmount) {
        throw new Error(
          `Montant payé insuffisant (${paidRounded} Ar < ${totalAmount} Ar).`
        );
      }

      const changeGiven = paidRounded - totalAmount;

      // Génération numéro unique de vente : VNT-YYYYMMDD-XXXX
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
        2,
        '0'
      )}${String(now.getDate()).padStart(2, '0')}`;
      const countTodayRow = queryOne<{cnt: number}>(
        db,
        `SELECT COUNT(*) as cnt FROM sales WHERE sale_number LIKE ?`,
        [`VNT-${ymd}-%`]
      );
      const seq = (countTodayRow?.cnt ?? 0) + 1;
      const saleNumber = `VNT-${ymd}-${String(seq).padStart(4, '0')}`;

      db.run(
        `INSERT INTO sales (sale_number, sale_date, user_id, user_name, total_amount, amount_paid, change_given, status, customer_name, customer_phone, customer_email, customer_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)`,
        [saleNumber, nowIso, user.id, user.full_name, totalAmount, paidRounded, changeGiven,
          customer?.name?.trim() || null, customer?.phone?.trim() || null,
          customer?.email?.trim() || null, customer?.address?.trim() || null]
      );

      const saleIdRow = queryOne<{id: number}>(
        db,
        `SELECT last_insert_rowid() as id`
      );
      const saleId = saleIdRow!.id;

      const details: SaleDetail[] = [];

      for (const entry of verifiedItems) {
        db.run(
          `INSERT INTO sale_details (sale_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            entry.product.id,
            entry.product.name,
            entry.product.price,
            entry.quantity,
            entry.subtotal,
          ]
        );
        const detIdRow = queryOne<{id: number}>(
          db,
          `SELECT last_insert_rowid() as id`
        );
        details.push({
          id: detIdRow!.id,
          sale_id: saleId,
          product_id: entry.product.id,
          product_name: entry.product.name,
          unit_price: entry.product.price,
          quantity: entry.quantity,
          subtotal: entry.subtotal,
        });

        if (entry.product.product_type !== 'HOMEMADE') {
          const newStock = entry.product.stock_qty - entry.quantity;
          db.run(
            `UPDATE products SET stock_qty = ?, updated_at = ? WHERE id = ?`,
            [newStock, nowIso, entry.product.id]
          );
          db.run(
            `INSERT INTO stock_movements (product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
             VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?, ?)`,
            [entry.product.id, entry.product.name, -entry.quantity, entry.product.stock_qty, newStock, `Vente ${saleNumber}`, user.full_name, nowIso]
          );
        }
      }

      db.run('COMMIT;');
      transactionActive = false;
      await this.persistOrRestore(previousSnapshot);

      return {
        id: saleId,
        sale_number: saleNumber,
        sale_date: nowIso,
        user_id: user.id,
        user_name: user.full_name,
        total_amount: totalAmount,
        amount_paid: paidRounded,
        change_given: changeGiven,
        status: 'COMPLETED',
        cancelled_at: null,
        cancelled_by: null,
        cancel_reason: null,
        customer_name: customer?.name?.trim() || null,
        customer_phone: customer?.phone?.trim() || null,
        customer_email: customer?.email?.trim() || null,
        customer_address: customer?.address?.trim() || null,
        details,
      };
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
      }
      throw err;
    }
  }

  async getSales(options?: {
    search?: string;
    status?: 'ALL' | 'COMPLETED' | 'CANCELLED';
  }): Promise<SaleWithDetails[]> {
    await this.init();
    const db = this.getDb();

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (options?.status && options.status !== 'ALL') {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options?.search && options.search.trim()) {
      const q = `%${options.search.trim()}%`;
      conditions.push('(sale_number LIKE ? OR user_name LIKE ?)');
      params.push(q, q);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sales = queryAll<Sale>(
      db,
      `SELECT * FROM sales ${whereClause} ORDER BY sale_date DESC, id DESC`,
      params
    );

    if (sales.length === 0) return [];

    const detailsAll = queryAll<SaleDetail>(
      db,
      `SELECT * FROM sale_details ORDER BY id ASC`
    );
    const detailsBySale = new Map<number, SaleDetail[]>();
    for (const d of detailsAll) {
      const arr = detailsBySale.get(d.sale_id) ?? [];
      arr.push(d);
      detailsBySale.set(d.sale_id, arr);
    }

    return sales.map((s) => ({
      ...s,
      details: detailsBySale.get(s.id) ?? [],
    }));
  }

  async getSalesInRange(
    startIso?: string,
    endIso?: string
  ): Promise<SaleWithDetails[]> {
    await this.init();
    const db = this.getDb();

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];
    if (startIso) {
      conditions.push('sale_date >= ?');
      params.push(startIso);
    }
    if (endIso) {
      conditions.push('sale_date <= ?');
      params.push(endIso);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sales = queryAll<Sale>(
      db,
      `SELECT * FROM sales ${whereClause} ORDER BY sale_date DESC, id DESC`,
      params
    );

    if (sales.length === 0) return [];

    const detailsAll = queryAll<SaleDetail>(
      db,
      `SELECT * FROM sale_details ORDER BY id ASC`
    );
    const detailsBySale = new Map<number, SaleDetail[]>();
    for (const d of detailsAll) {
      const arr = detailsBySale.get(d.sale_id) ?? [];
      arr.push(d);
      detailsBySale.set(d.sale_id, arr);
    }

    return sales.map((s) => ({
      ...s,
      details: detailsBySale.get(s.id) ?? [],
    }));
  }

  async cancelSale(
    saleId: number,
    adminUser: User,
    reason: string
  ): Promise<void> {
    await this.init();
    if (adminUser.role !== 'ADMIN') {
      throw new Error(
        "Seul un administrateur peut annuler une vente enregistrée."
      );
    }

    const db = this.getDb();
    const nowIso = new Date().toISOString();

    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      const sale = queryOne<Sale>(db, `SELECT * FROM sales WHERE id = ?`, [
        saleId,
      ]);
      if (!sale) throw new Error('Vente introuvable.');
      if (sale.status === 'CANCELLED') {
        throw new Error('Cette vente est déjà annulée.');
      }

      const details = queryAll<SaleDetail>(
        db,
        `SELECT * FROM sale_details WHERE sale_id = ?`,
        [saleId]
      );

      db.run(
        `UPDATE sales SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?`,
        [
          nowIso,
          adminUser.full_name,
          reason.trim() || 'Annulation administrateur',
          saleId,
        ]
      );

      for (const detail of details) {
        if (detail.product_id !== null) {
          const prod = queryOne<Product>(
            db,
            `SELECT * FROM products WHERE id = ?`,
            [detail.product_id]
          );
          if (prod) {
            const restoredQty = prod.stock_qty + detail.quantity;
            db.run(
              `UPDATE products SET stock_qty = ?, updated_at = ? WHERE id = ?`,
              [restoredQty, nowIso, prod.id]
            );
            db.run(
              `INSERT INTO stock_movements (product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
               VALUES (?, ?, 'CANCEL_RESTORE', ?, ?, ?, ?, ?, ?)`,
              [
                prod.id,
                prod.name,
                detail.quantity,
                prod.stock_qty,
                restoredQty,
                `Annulation vente ${sale.sale_number}`,
                adminUser.full_name,
                nowIso,
              ]
            );
          }
        }
      }

      db.run('COMMIT;');
      transactionActive = false;
      await this.persistOrRestore(previousSnapshot);
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
      }
      throw err;
    }
  }

  // ===================== TABLEAU DE BORD & STATISTIQUES =====================

  async getDashboardSummary(): Promise<DashboardSummary> {
    await this.init();
    const db = this.getDb();

    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).toISOString();
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).toISOString();

    const todayRow = queryOne<{revenue: number; cnt: number}>(
      db,
      `SELECT COALESCE(SUM(total_amount), 0) as revenue, COUNT(*) as cnt
       FROM sales
       WHERE status = 'COMPLETED' AND sale_date >= ? AND sale_date <= ?`,
      [todayStart, todayEnd]
    );

    const products = queryAll<Product>(
      db,
      `SELECT * FROM products ORDER BY name ASC`
    );

    const totalProducts = products.length;
    const totalStockUnits = products.reduce((sum, p) => sum + p.stock_qty, 0);
    const outOfStockCount = products.filter((p) => p.stock_qty === 0).length;
    const lowStockCount = products.filter(
      (p) => p.stock_qty > 0 && p.stock_qty <= p.min_stock
    ).length;
    const alertProducts = products.filter((p) => p.stock_qty <= p.min_stock);

    // 7 derniers jours
    const sevenDaysStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
      0,
      0,
      0,
      0
    );
    const recentCompletedSales = queryAll<Sale>(
      db,
      `SELECT * FROM sales WHERE status = 'COMPLETED' AND sale_date >= ? ORDER BY sale_date ASC`,
      [sevenDaysStart.toISOString()]
    );

    const dayBuckets = new Map<string, DailySalesPoint>();
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - i
      );
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(d.getDate()).padStart(2, '0')}`;
      dayBuckets.set(key, {
        date: key,
        label: `${dayNames[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`,
        revenue: 0,
        count: 0,
      });
    }

    for (const s of recentCompletedSales) {
      const d = new Date(s.sale_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = dayBuckets.get(key);
      if (bucket) {
        bucket.revenue += s.total_amount;
        bucket.count += 1;
      }
    }

    // Dernières ventes (5)
    const allSales = await this.getSales();
    const recentSales = allSales.slice(0, 5);

    // Produits les plus vendus (global réel)
    const topRaw = queryAll<{
      product_id: number | null;
      product_name: string;
      total_qty: number;
      total_revenue: number;
    }>(
      db,
      `SELECT sd.product_id, sd.product_name, SUM(sd.quantity) as total_qty, SUM(sd.subtotal) as total_revenue
       FROM sale_details sd
       INNER JOIN sales s ON s.id = sd.sale_id
       WHERE s.status = 'COMPLETED'
       GROUP BY sd.product_name
       ORDER BY total_qty DESC, total_revenue DESC
       LIMIT 5`
    );
    const totalRevAll = topRaw.reduce((acc, r) => acc + r.total_revenue, 0);
    const topProducts: TopProductStat[] = topRaw.map((r) => ({
      ...r,
      share_percent:
        totalRevAll > 0 ? Math.round((r.total_revenue / totalRevAll) * 100) : 0,
    }));

    return {
      todayRevenue: todayRow?.revenue ?? 0,
      todaySalesCount: todayRow?.cnt ?? 0,
      totalProducts,
      totalStockUnits,
      outOfStockCount,
      lowStockCount,
      recentSales,
      topProducts,
      last7Days: Array.from(dayBuckets.values()),
      alertProducts,
    };
  }

  async getStatistics(
    startIso: string,
    endIso: string
  ): Promise<StatisticsSummary> {
    await this.init();
    const db = this.getDb();

    const salesInRange = queryAll<Sale>(
      db,
      `SELECT * FROM sales
       WHERE status = 'COMPLETED' AND sale_date >= ? AND sale_date <= ?
       ORDER BY sale_date ASC`,
      [startIso, endIso]
    );

    const totalRevenue = salesInRange.reduce((s, r) => s + r.total_amount, 0);
    const salesCount = salesInRange.length;
    const averageBasket = salesCount > 0 ? Math.round(totalRevenue / salesCount) : 0;

    const itemStatsRaw = queryAll<{
      product_id: number | null;
      product_name: string;
      total_qty: number;
      total_revenue: number;
    }>(
      db,
      `SELECT sd.product_id, sd.product_name, SUM(sd.quantity) as total_qty, SUM(sd.subtotal) as total_revenue
       FROM sale_details sd
       INNER JOIN sales s ON s.id = sd.sale_id
       WHERE s.status = 'COMPLETED' AND s.sale_date >= ? AND s.sale_date <= ?
       GROUP BY sd.product_name
       ORDER BY total_qty DESC, total_revenue DESC`,
      [startIso, endIso]
    );

    const totalItemsSold = itemStatsRaw.reduce((sum, r) => sum + r.total_qty, 0);

    const topProducts: TopProductStat[] = itemStatsRaw.map((r) => ({
      ...r,
      share_percent:
        totalRevenue > 0
          ? Math.round((r.total_revenue / totalRevenue) * 100)
          : 0,
    }));

    // Produits les moins vendus : inclut aussi les produits du catalogue ayant 0 vente sur la période
    const allCatalog = queryAll<Product>(db, `SELECT * FROM products ORDER BY name ASC`);
    const soldMap = new Map<string, TopProductStat>();
    for (const t of topProducts) {
      soldMap.set(t.product_name.toLowerCase(), t);
    }
    const allProductSales: TopProductStat[] = allCatalog.map((p) => {
      const existing = soldMap.get(p.name.toLowerCase());
      if (existing) return existing;
      return {
        product_id: p.id,
        product_name: p.name,
        total_qty: 0,
        total_revenue: 0,
        share_percent: 0,
      };
    });
    const leastSoldProducts = [...allProductSales]
      .sort((a, b) => a.total_qty - b.total_qty || a.total_revenue - b.total_revenue)
      .slice(0, 5);

    // Série temporelle adaptative (par jour)
    const startD = new Date(startIso);
    const endD = new Date(endIso);
    const diffDays = Math.max(
      1,
      Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))
    );

    const seriesMap = new Map<string, DailySalesPoint>();

    if (diffDays <= 45) {
      const cursor = new Date(
        startD.getFullYear(),
        startD.getMonth(),
        startD.getDate()
      );
      const endDateOnly = new Date(
        endD.getFullYear(),
        endD.getMonth(),
        endD.getDate()
      );
      while (cursor <= endDateOnly) {
        const key = `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1
        ).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        seriesMap.set(key, {
          date: key,
          label: `${String(cursor.getDate()).padStart(2, '0')}/${String(
            cursor.getMonth() + 1
          ).padStart(2, '0')}`,
          revenue: 0,
          count: 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const s of salesInRange) {
        const d = new Date(s.sale_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          '0'
        )}-${String(d.getDate()).padStart(2, '0')}`;
        const b = seriesMap.get(key);
        if (b) {
          b.revenue += s.total_amount;
          b.count += 1;
        }
      }
    } else {
      // Regroupement mensuel si période > 45 jours
      const monthNames = [
        'Jan',
        'Fév',
        'Mar',
        'Avr',
        'Mai',
        'Juin',
        'Juil',
        'Août',
        'Sep',
        'Oct',
        'Nov',
        'Déc',
      ];
      const cursor = new Date(startD.getFullYear(), startD.getMonth(), 1);
      const endMonth = new Date(endD.getFullYear(), endD.getMonth(), 1);
      while (cursor <= endMonth) {
        const key = `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1
        ).padStart(2, '0')}`;
        seriesMap.set(key, {
          date: key,
          label: `${monthNames[cursor.getMonth()]} ${String(
            cursor.getFullYear()
          ).slice(-2)}`,
          revenue: 0,
          count: 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      for (const s of salesInRange) {
        const d = new Date(s.sale_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          '0'
        )}`;
        const b = seriesMap.get(key);
        if (b) {
          b.revenue += s.total_amount;
          b.count += 1;
        }
      }
    }

    return {
      totalRevenue,
      salesCount,
      totalItemsSold,
      averageBasket,
      topProducts,
      leastSoldProducts,
      revenueSeries: Array.from(seriesMap.values()),
    };
  }

  // ===================== PARAMÈTRES =====================

  async getSettings(): Promise<AppSettings> {
    await this.init();
    const db = this.getDb();
    const rows = queryAll<{key: string; value: string}>(
      db,
      `SELECT key, value FROM app_settings`
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const mode = map.get('printer_connection_mode');
    const width = map.get('printer_paper_width');
    return {
      shop_name: map.get('shop_name') ?? DEFAULT_SETTINGS.shop_name,
      currency: map.get('currency') ?? DEFAULT_SETTINGS.currency,
      shop_phone: map.get('shop_phone') ?? DEFAULT_SETTINGS.shop_phone,
      shop_address: map.get('shop_address') ?? DEFAULT_SETTINGS.shop_address,
      shop_logo_data_url:
        map.get('shop_logo_data_url') ?? DEFAULT_SETTINGS.shop_logo_data_url,
      receipt_footer:
        map.get('receipt_footer') ?? DEFAULT_SETTINGS.receipt_footer,
      low_stock_alert_enabled:
        (map.get('low_stock_alert_enabled') ?? 'true') === 'true',
      printer_connection_mode:
        mode === 'USB' || mode === 'SYSTEM'
          ? (mode as PrinterConnectionMode)
          : 'BLUETOOTH',
      printer_paper_width:
        width === '80' ? ('80' as PrinterPaperWidth) : '58',
      printer_device_name: map.get('printer_device_name') ?? '',
      printer_auto_print_sale:
        (map.get('printer_auto_print_sale') ?? 'false') === 'true',
    };
  }

  async updateSettings(next: AppSettings): Promise<void> {
    await this.init();
    const db = this.getDb();
    const entries: Array<[string, string]> = [
      ['shop_name', next.shop_name.trim() || 'TSENAKELY'],
      ['currency', next.currency.trim() || 'Ar'],
      ['shop_phone', next.shop_phone.trim()],
      ['shop_address', next.shop_address.trim()],
      ['shop_logo_data_url', next.shop_logo_data_url || ''],
      ['receipt_footer', next.receipt_footer.trim()],
      ['low_stock_alert_enabled', String(next.low_stock_alert_enabled)],
      ['printer_connection_mode', next.printer_connection_mode || 'BLUETOOTH'],
      ['printer_paper_width', next.printer_paper_width === '80' ? '80' : '58'],
      ['printer_device_name', next.printer_device_name || ''],
      ['printer_auto_print_sale', String(next.printer_auto_print_sale)],
    ];
    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      for (const [k, v] of entries) {
        db.run(
          `INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [k, v]
        );
      }

      if (Array.isArray(parsed.production_batches)) {
        for (const b of parsed.production_batches as Array<{id:number;product_id:number;product_name:string;produced_at:string;closed_at:string|null;total_cost:number;sold_quantity:number|null;revenue:number|null;profit:number|null;status:string}>) {
          db.run(`INSERT INTO production_batches(id,product_id,product_name,produced_at,closed_at,total_cost,sold_quantity,revenue,profit,status) VALUES(?,?,?,?,?,?,?,?,?,?)`,[b.id,b.product_id,b.product_name,b.produced_at,b.closed_at??null,b.total_cost,b.sold_quantity??null,b.revenue??null,b.profit??null,b.status]);
        }
      }
      if (Array.isArray(parsed.production_ingredients)) {
        for (const i of parsed.production_ingredients as Array<{id:number;batch_id:number;name:string;purchase_quantity:number;purchase_unit:string;purchase_price:number;used_quantity:number;used_unit:string;used_cost:number}>) {
          db.run(`INSERT INTO production_ingredients(id,batch_id,name,purchase_quantity,purchase_unit,purchase_price,used_quantity,used_unit,used_cost) VALUES(?,?,?,?,?,?,?,?,?)`,[i.id,i.batch_id,i.name,i.purchase_quantity,i.purchase_unit,i.purchase_price,i.used_quantity,i.used_unit,i.used_cost]);
        }
      }
      db.run('COMMIT;');
      transactionActive = false;
      await this.persistOrRestore(previousSnapshot);
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
      }
      throw err;
    }
  }

  // ===================== SAUVEGARDE, RESTAURATION & EXPORT CSV =====================

  async exportSqliteBytes(): Promise<Uint8Array> {
    await this.init();
    const db = this.getDb();
    return db.export();
  }

  async importSqliteBytes(bytes: Uint8Array): Promise<void> {
    await this.init();
    if (!this.SQL) throw new Error('Moteur SQLite non disponible.');
    const candidate = new this.SQL.Database(bytes);
    const previousDb = this.db;
    try {
      const integrity = queryOne<{integrity_check: string}>(
        candidate,
        'PRAGMA integrity_check'
      );
      if (integrity?.integrity_check !== 'ok') {
        throw new Error('Le contrôle d’intégrité SQLite a échoué.');
      }

      const tables = queryAll<{name: string}>(
        candidate,
        `SELECT name FROM sqlite_master WHERE type='table'`
      );
      const tableNames = new Set(tables.map((t) => t.name));
      const required = [
        'schema_migrations',
        'app_settings',
        'users',
        'products',
        'sales',
        'sale_details',
        'stock_movements',
      ];
      for (const req of required) {
        if (!tableNames.has(req)) {
          throw new Error(
            `Fichier de sauvegarde invalide : table « ${req} » manquante.`
          );
        }
      }

      // Keep the current database alive until the imported copy is validated
      // and durably written. On any failure, restore the original reference.
      this.db = candidate;
      await this.ensureSchemaAndSeed();
      await this.persist();
      previousDb?.close();
    } catch (err) {
      this.db = previousDb;
      candidate.close();
      throw err;
    }
  }

  async exportJsonBackup(): Promise<string> {
    await this.init();
    const db = this.getDb();
    const payload = {
      app: 'TSENAKELY',
      version: 1,
      exported_at: new Date().toISOString(),
      app_settings: queryAll(db, `SELECT * FROM app_settings`),
      users: queryAll(db, `SELECT * FROM users`),
      products: queryAll(db, `SELECT * FROM products`),
      sales: queryAll(db, `SELECT * FROM sales`),
      sale_details: queryAll(db, `SELECT * FROM sale_details`),
      stock_movements: queryAll(db, `SELECT * FROM stock_movements`),
      production_batches: queryAll(db, `SELECT * FROM production_batches`),
      production_ingredients: queryAll(db, `SELECT * FROM production_ingredients`),
    };
    return JSON.stringify(payload, null, 2);
  }

  async importJsonBackup(jsonText: string): Promise<void> {
    await this.init();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('Fichier JSON corrompu ou illisible.');
    }

    if (
      parsed.app !== 'TSENAKELY' ||
      !Array.isArray(parsed.users) ||
      !Array.isArray(parsed.products) ||
      !Array.isArray(parsed.sales) ||
      !Array.isArray(parsed.sale_details) ||
      !Array.isArray(parsed.stock_movements)
    ) {
      throw new Error(
        'Le fichier JSON ne correspond pas à une sauvegarde valide TSENAKELY.'
      );
    }

    const db = this.getDb();
    const previousSnapshot = db.export();
    let transactionActive = false;
    db.run('PRAGMA foreign_keys = OFF;');
    db.run('BEGIN TRANSACTION;');
    transactionActive = true;
    try {
      db.run(`DELETE FROM sale_details`);
      db.run(`DELETE FROM sales`);
      db.run(`DELETE FROM production_ingredients`);
      db.run(`DELETE FROM production_batches`);
      db.run(`DELETE FROM stock_movements`);
      db.run(`DELETE FROM products`);
      db.run(`DELETE FROM users`);
      db.run(`DELETE FROM app_settings`);

      if (Array.isArray(parsed.app_settings)) {
        for (const s of parsed.app_settings as Array<{
          key: string;
          value: string;
        }>) {
          db.run(`INSERT INTO app_settings (key, value) VALUES (?, ?)`, [
            s.key,
            s.value,
          ]);
        }
      }

      for (const u of parsed.users as Array<{
        id: number;
        username: string;
        full_name: string;
        role: string;
        password_hash: string;
        is_active: number;
        created_at: string;
      }>) {
        db.run(
          `INSERT INTO users (id, username, full_name, role, password_hash, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            u.id,
            u.username,
            u.full_name,
            u.role,
            u.password_hash,
            u.is_active,
            u.created_at,
          ]
        );
      }

      for (const p of parsed.products as Array<{
        id: number;
        name: string;
        product_type?: 'FINISHED' | 'HOMEMADE';
        category?: string;
        price: number;
        stock_qty: number;
        min_stock: number;
        image_data_url?: string | null;
        created_at: string;
        updated_at: string;
      }>) {
        db.run(
          `INSERT INTO products (id, name, product_type, price, stock_qty, min_stock, image_data_url, category, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.name,
            p.product_type ?? 'FINISHED',
            p.price,
            p.stock_qty,
            p.min_stock,
            p.image_data_url ?? null,
            p.category ?? 'Autres',
            p.created_at,
            p.updated_at,
          ]
        );
      }

      for (const s of parsed.sales as Array<{
        id: number;
        sale_number: string;
        sale_date: string;
        user_id: number;
        user_name: string;
        total_amount: number;
        amount_paid: number;
        change_given: number;
        status: string;
        cancelled_at: string | null;
        cancelled_by: string | null;
        cancel_reason: string | null;
        customer_name?: string | null;
        customer_phone?: string | null;
        customer_email?: string | null;
        customer_address?: string | null;
      }>) {
        db.run(
          `INSERT INTO sales (id, sale_number, sale_date, user_id, user_name, total_amount, amount_paid, change_given, status, cancelled_at, cancelled_by, cancel_reason, customer_name, customer_phone, customer_email, customer_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id,
            s.sale_number,
            s.sale_date,
            s.user_id,
            s.user_name,
            s.total_amount,
            s.amount_paid,
            s.change_given,
            s.status,
            s.cancelled_at ?? null,
            s.cancelled_by ?? null,
            s.cancel_reason ?? null,
            s.customer_name ?? null,
            s.customer_phone ?? null,
            s.customer_email ?? null,
            s.customer_address ?? null,
          ]
        );
      }

      for (const d of parsed.sale_details as Array<{
        id: number;
        sale_id: number;
        product_id: number | null;
        product_name: string;
        unit_price: number;
        quantity: number;
        subtotal: number;
      }>) {
        db.run(
          `INSERT INTO sale_details (id, sale_id, product_id, product_name, unit_price, quantity, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            d.id,
            d.sale_id,
            d.product_id ?? null,
            d.product_name,
            d.unit_price,
            d.quantity,
            d.subtotal,
          ]
        );
      }

      for (const m of parsed.stock_movements as Array<{
        id: number;
        product_id: number | null;
        product_name: string;
        movement_type: string;
        qty_change: number;
        qty_before: number;
        qty_after: number;
        reason: string;
        user_name: string;
        created_at: string;
      }>) {
        db.run(
          `INSERT INTO stock_movements (id, product_id, product_name, movement_type, qty_change, qty_before, qty_after, reason, user_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id,
            m.product_id ?? null,
            m.product_name,
            m.movement_type,
            m.qty_change,
            m.qty_before,
            m.qty_after,
            m.reason,
            m.user_name,
            m.created_at,
          ]
        );
      }

      db.run('COMMIT;');
      transactionActive = false;
      db.run('PRAGMA foreign_keys = ON;');
      await this.persistOrRestore(previousSnapshot);
    } catch (err) {
      if (transactionActive) {
        db.run('ROLLBACK;');
        db.run('PRAGMA foreign_keys = ON;');
      }
      throw err;
    }
  }

  async exportSalesCsv(): Promise<string> {
    const sales = await this.getSales();
    const esc = (val: string | number | null | undefined) => {
      const str = String(val ?? '');
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = [
      'Numéro de vente',
      'Date et heure',
      'Vendeur',
      'Statut',
      'Produits vendus',
      'Montant total (Ar)',
      'Montant payé (Ar)',
      'Monnaie rendue (Ar)',
      'Annulé par',
      'Motif annulation',
    ].join(';');

    const rows = sales.map((s) => {
      const productsList = s.details
        .map((d) => `${d.product_name} x${d.quantity} (${d.unit_price} Ar)`)
        .join(' | ');
      return [
        esc(s.sale_number),
        esc(s.sale_date),
        esc(s.user_name),
        esc(s.status === 'COMPLETED' ? 'Validée' : 'Annulée'),
        esc(productsList),
        esc(s.total_amount),
        esc(s.amount_paid),
        esc(s.change_given),
        esc(s.cancelled_by ?? ''),
        esc(s.cancel_reason ?? ''),
      ].join(';');
    });

    // UTF-8 BOM pour ouverture directe dans Excel avec accents français
    return '\uFEFF' + [header, ...rows].join('\r\n');
  }
}

export const tsenakelyDb = new TsenakelyDatabase();
