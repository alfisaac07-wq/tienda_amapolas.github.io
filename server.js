const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "amapolas.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

class SqliteSessionStore extends session.Store {
  get(sessionId, callback) {
    db.get("SELECT data, expires_at FROM sessions WHERE sid = ?", [sessionId], (error, row) => {
      if (error) return callback(error);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        return db.run("DELETE FROM sessions WHERE sid = ?", [sessionId], (deleteError) => {
          if (deleteError) return callback(deleteError);
          callback(null, null);
        });
      }
      try {
        callback(null, JSON.parse(row.data));
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  set(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? Date.parse(sessionData.cookie.expires)
      : Date.now() + Number(sessionData.cookie?.maxAge || 2 * 60 * 60 * 1000);
    db.run(
      `INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data`,
      [sessionId, expiresAt, JSON.stringify(sessionData)],
      callback
    );
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? Date.parse(sessionData.cookie.expires)
      : Date.now() + Number(sessionData.cookie?.maxAge || 2 * 60 * 60 * 1000);
    db.run("UPDATE sessions SET expires_at = ? WHERE sid = ?", [expiresAt, sessionId], callback);
  }

  destroy(sessionId, callback = () => {}) {
    db.run("DELETE FROM sessions WHERE sid = ?", [sessionId], callback);
  }
}

const adminUsername = process.env.ADMIN_USERNAME || "admin";
const production = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (production ? "" : crypto.randomBytes(32).toString("hex"));
const loginAttempts = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;

if (production && !sessionSecret) {
  throw new Error("SESSION_SECRET debe configurarse antes de iniciar en producción.");
}

const defaultCategories = [
  "Damas",
  "Caballeros",
  "Infantil",  
  "Bebés",
  "Juguetería",
  "Librería y útiles escolares",
  "Hogar",
  "Navidad y regalos",
];

const demoProduct = {
  id: "demo-product",
  name: "",
  category: defaultCategories[0],
  price: 0,
  image: "",
  availability: "sold-out",
  stock: 0,
  featured: true
};

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function ensureDatabase() {
  await runSql(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL DEFAULT 0,
    image TEXT,
    availability TEXT DEFAULT 'available',
    stock INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );`);

  await runSql(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);

  await runSql(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );`);

  await runSql(`CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );`);
  await runSql("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);

  const existingAdmin = await getSql("SELECT * FROM admin_users WHERE username = ?", [adminUsername]);
  const configuredAdminPassword = process.env.ADMIN_PASSWORD || "";
  if (configuredAdminPassword.length < 12 || configuredAdminPassword.length > 128) {
    throw new Error("Configure ADMIN_PASSWORD con entre 12 y 128 caracteres antes de iniciar el servidor.");
  }
  const passwordHash = bcrypt.hashSync(configuredAdminPassword, 12);
  if (!existingAdmin) {
    await runSql("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", [adminUsername, passwordHash]);
  } else {
    await runSql("UPDATE admin_users SET password_hash = ? WHERE id = ?", [passwordHash, existingAdmin.id]);
  }

  const demoCleanup = await getSql("SELECT value FROM settings WHERE key = 'demo_catalog_reset_v1'");
  if (!demoCleanup) {
    await runSql("BEGIN IMMEDIATE");
    try {
      await runSql("DELETE FROM products");
      await runSql(
        `INSERT INTO products (id, name, category, price, image, availability, stock, featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          demoProduct.id,
          demoProduct.name,
          demoProduct.category,
          demoProduct.price,
          demoProduct.image,
          demoProduct.availability,
          demoProduct.stock,
          demoProduct.featured ? 1 : 0
        ]
      );
      await runSql("INSERT INTO settings (key, value) VALUES ('demo_catalog_reset_v1', '1')");
      await runSql("COMMIT");
    } catch (error) {
      await runSql("ROLLBACK");
      throw error;
    }
  } else {
    const currentCount = await getSql("SELECT COUNT(*) AS count FROM products");
    if (!Number(currentCount?.count || 0)) {
      await runSql(
        `INSERT INTO products (id, name, category, price, image, availability, stock, featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          demoProduct.id,
          demoProduct.name,
          demoProduct.category,
          demoProduct.price,
          demoProduct.image,
          demoProduct.availability,
          demoProduct.stock,
          demoProduct.featured ? 1 : 0
        ]
      );
    }
  }

  const versionSetting = await getSql("SELECT value FROM settings WHERE key = 'catalog_version'");
  if (!versionSetting) {
    await runSql("INSERT INTO settings (key, value) VALUES ('catalog_version', '1')");
  }
}

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store"
  });
  next();
});
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: production ? "__Host-amapolas.sid" : "amapolas.sid",
  store: new SqliteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: production, path: "/", maxAge: 1000 * 60 * 60 * 2 }
}));

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ ok: false, message: "Debe iniciar sesión como administrador." });
  }
  next();
}

function requireSameOrigin(req, res, next) {
  const requestOrigin = req.get("origin");
  const referer = req.get("referer");
  let source;
  try {
    source = requestOrigin || (referer ? new URL(referer).origin : "");
  } catch {
    source = "";
  }
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  if (!source || source !== expectedOrigin) {
    return res.status(403).json({ ok: false, message: "Solicitud rechazada por verificación de origen." });
  }
  next();
}

function limitLoginAttempts(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (loginAttempts.size > 2000) {
    for (const [attemptKey, attempt] of loginAttempts) {
      if (now - attempt.startedAt >= loginWindowMs) loginAttempts.delete(attemptKey);
    }
  }
  const state = loginAttempts.get(key);
  if (state && now - state.startedAt >= loginWindowMs) loginAttempts.delete(key);
  const activeState = loginAttempts.get(key);
  if (activeState && activeState.count >= maxLoginAttempts) {
    const retryAfter = Math.ceil((activeState.startedAt + loginWindowMs - now) / 1000);
    res.set("Retry-After", String(Math.max(1, retryAfter)));
    return res.status(429).json({ ok: false, message: "Demasiados intentos. Espere 15 minutos antes de volver a intentarlo." });
  }
  req.loginAttemptKey = key;
  next();
}

function recordFailedLogin(key) {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || now - existing.startedAt >= loginWindowMs) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return;
  }
  existing.count += 1;
}

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price) || 0,
    image: row.image || "",
    availability: row.availability || "available",
    stock: Number(row.stock) || 0,
    featured: Boolean(Number(row.featured))
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "online" });
});

app.post("/api/admin/login", requireSameOrigin, limitLoginAttempts, async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || username.length > 100 || !password || password.length > 128) {
      recordFailedLogin(req.loginAttemptKey);
      return res.status(401).json({ ok: false, message: "Credenciales inválidas." });
    }

    const user = await getSql("SELECT * FROM admin_users WHERE username = ?", [adminUsername]);
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || username !== adminUsername || !passwordMatches) {
      recordFailedLogin(req.loginAttemptKey);
      return res.status(401).json({ ok: false, message: "Credenciales inválidas." });
    }

    loginAttempts.delete(req.loginAttemptKey);
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.admin = { username: user.username };
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.json({ ok: true, user: { username: user.username } });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", requireSameOrigin, requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(production ? "__Host-amapolas.sid" : "amapolas.sid", { httpOnly: true, sameSite: "strict", secure: production, path: "/" });
    res.json({ ok: true });
  });
});

app.get("/api/admin/session", (req, res) => {
  res.json({ loggedIn: Boolean(req.session?.admin), user: req.session?.admin || null });
});

app.get("/api/products", async (req, res) => {
  const rows = await allSql("SELECT * FROM products ORDER BY name ASC");
  res.json(rows.map(normalizeProduct));
});

app.post("/api/products", requireSameOrigin, requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const productId = String(payload.id || `product-${crypto.randomUUID()}`).trim();
  const name = String(payload.name || "").trim();
  const category = String(payload.category || defaultCategories[0]).trim();
  const price = Number(payload.price);
  const image = String(payload.image || "").trim();
  const availability = payload.availability || "available";
  const stock = Number(payload.stock);
  const featured = Boolean(payload.featured);

  if ((!name && productId !== demoProduct.id) || name.length > 200) {
    return res.status(400).json({ ok: false, message: "El nombre es obligatorio y no puede superar 200 caracteres." });
  }
  if (!productId || productId.length > 100 || !category || category.length > 100) {
    return res.status(400).json({ ok: false, message: "El identificador o la categoría no son válidos." });
  }
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ ok: false, message: "El precio y las existencias deben ser valores válidos y no negativos." });
  }
  if (!["available", "few", "sold-out"].includes(availability)) {
    return res.status(400).json({ ok: false, message: "La disponibilidad seleccionada no es válida." });
  }
  if (image.length > 9 * 1024 * 1024) {
    return res.status(413).json({ ok: false, message: "La imagen supera el tamaño máximo permitido." });
  }
  if (image.startsWith("data:") && !/^data:image\/(?:jpeg|png|gif|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image)) {
    return res.status(400).json({ ok: false, message: "El archivo debe ser una imagen PNG, JPG, GIF, WebP o AVIF válida." });
  }
  if (image && !image.startsWith("data:")) {
    let imageUrl;
    try {
      imageUrl = new URL(image, "http://localhost");
    } catch {
      return res.status(400).json({ ok: false, message: "La dirección de la imagen no es válida." });
    }
    if (!["http:", "https:"].includes(imageUrl.protocol)) {
      return res.status(400).json({ ok: false, message: "El protocolo de la imagen no es válido." });
    }
  }

  const product = {
    id: productId,
    name,
    category,
    price,
    image,
    availability,
    stock,
    featured: featured ? 1 : 0
  };

  await runSql(
    `INSERT INTO products (id, name, category, price, image, availability, stock, featured, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(id)
     DO UPDATE SET name = excluded.name, category = excluded.category, price = excluded.price, image = excluded.image,
       availability = excluded.availability, stock = excluded.stock, featured = excluded.featured, updated_at = datetime('now')`,
    [product.id, product.name, product.category, product.price, product.image, product.availability, product.stock, product.featured]
  );

  res.json({ ok: true, product: normalizeProduct(product) });
});

app.delete("/api/products/:id", requireSameOrigin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const result = await runSql("DELETE FROM products WHERE id = ?", [id]);
  if (!result.changes) {
    return res.status(404).json({ ok: false, message: "Producto no encontrado." });
  }
  res.json({ ok: true });
});

app.post("/api/admin/publish", requireSameOrigin, requireAdmin, async (req, res) => {
  const now = new Date().toISOString();
  const currentVersionRow = await getSql("SELECT value FROM settings WHERE key = 'catalog_version'");
  const currentVersion = Number(currentVersionRow?.value || 1);
  const nextVersion = currentVersion + 1;

  await runSql("INSERT INTO settings (key, value) VALUES ('catalog_published_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [now]);
  await runSql("INSERT INTO settings (key, value) VALUES ('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(nextVersion)]);

  res.json({ ok: true, publishedAt: now, version: nextVersion });
});

app.get("/api/admin/publish-status", async (req, res) => {
  const publishedAt = await getSql("SELECT value FROM settings WHERE key = 'catalog_published_at'");
  const version = await getSql("SELECT value FROM settings WHERE key = 'catalog_version'");
  res.json({
    publishedAt: publishedAt?.value || null,
    version: Number(version?.value || 1)
  });
});

app.get(["/carrito", "/carrito.html"], (req, res) => {
  res.redirect(302, "/productos.html");
});

app.get("/gestion", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(rootDir, "admin.html"));
  });
});

app.get("/admin.html", (req, res) => {
  res.status(404).send("No encontrado.");
});

const staticPages = ["/", "/index.html", "/productos.html", "/contacto.html"];
for (const page of staticPages) {
  app.get(page, (req, res) => {
    const file = page === "/" ? "index.html" : page.replace(/^\//, "");
    res.sendFile(path.join(rootDir, file));
  });
}

app.use(express.static(rootDir, { index: false }));

app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, "index.html"));
});

async function startServer() {
  await ensureDatabase();
  app.listen(PORT, () => {
    console.log(`Servidor de Tienda Las Amapolas en http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("No se pudo iniciar el servidor.", error);
  process.exit(1);
});
