import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firstRow(result) {
  if (!result || !result[0] || !result[0].values || result[0].values.length === 0) return null;
  const { columns, values } = result[0];
  const row = {};
  columns.forEach((c, i) => {
    row[c] = values[0][i];
  });
  return row;
}

function allRows(result) {
  if (!result || !result[0]) return [];
  const { columns, values } = result[0];
  return values.map((v) => {
    const row = {};
    columns.forEach((c, i) => {
      row[c] = v[i];
    });
    return row;
  });
}

export async function openDb() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, "data.sqlite");

  let db;
  if (fs.existsSync(dbPath)) {
    const file = fs.readFileSync(dbPath);
    db = new SQL.Database(file);
  } else {
    db = new SQL.Database();
  }

  const api = {
    dbPath,
    db,
    save() {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    },
    exec(sql) {
      db.exec(sql);
      api.save();
    },
    get(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const result = [];
      while (stmt.step()) {
        result.push(stmt.getAsObject());
        break;
      }
      stmt.free();
      return result.length ? result[0] : null;
    },
    all(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    run(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.run(params);
      stmt.free();
      api.save();
    },
  };

  // schema
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      role TEXT,
      student_id INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      kelas TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS violations (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL,
      jenis TEXT NOT NULL,
      poin INTEGER NOT NULL,
      tanggal INTEGER NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sanctions (
      id INTEGER PRIMARY KEY,
      tingkat TEXT NOT NULL,
      keterangan TEXT NOT NULL,
      min_poin INTEGER NOT NULL,
      max_poin INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_sanction_records (
      sanction_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(sanction_id, student_id),
      FOREIGN KEY(sanction_id) REFERENCES sanctions(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `);

  // lightweight migration: add columns if DB existed before
  const userCols = db.exec("PRAGMA table_info(users)");
  const cols = new Set((userCols?.[0]?.values || []).map((v) => String(v[1])));
  if (!cols.has("role")) db.exec("ALTER TABLE users ADD COLUMN role TEXT");
  if (!cols.has("student_id")) db.exec("ALTER TABLE users ADD COLUMN student_id INTEGER");

  const violationCols = db.exec("PRAGMA table_info(violations)");
  const vCols = new Set((violationCols?.[0]?.values || []).map((v) => String(v[1])));
  if (!vCols.has("status")) db.exec("ALTER TABLE violations ADD COLUMN status TEXT DEFAULT 'approved'");

  // seed sanctions
  const cnt = firstRow(db.exec("SELECT COUNT(*) as n FROM sanctions"))?.n ?? 0;
  if (Number(cnt) === 0) {
    const seed = [
      [1, "Ringan", "Surat peringatan ringan", 1, 4],
      [2, "Sedang", "Kerja bakti sekolah", 5, 9],
      [3, "Berat", "Pemanggilan orang tua siswa", 10, 999],
    ];
    const stmt = db.prepare("INSERT INTO sanctions (id, tingkat, keterangan, min_poin, max_poin) VALUES (?, ?, ?, ?, ?)");
    for (const row of seed) stmt.run(row);
    stmt.free();
  }

  // seed one teacher + one student user (only if missing)
  const hasGuru = firstRow(db.exec("SELECT COUNT(*) as n FROM users WHERE username='guru'"))?.n ?? 0;
  if (Number(hasGuru) === 0) {
    const stmt = db.prepare("INSERT INTO users (username, password, role, student_id, created_at) VALUES (?, ?, ?, ?, ?)");
    stmt.run(["guru", "12345", "teacher", null, Date.now()]);
    stmt.free();
  }

  const hasMurid = firstRow(db.exec("SELECT COUNT(*) as n FROM users WHERE username='murid'"))?.n ?? 0;
  if (Number(hasMurid) === 0) {
    // ensure a student row exists for this account
    const existingStudent = firstRow(db.exec("SELECT id as id FROM students WHERE name='Murid Demo' LIMIT 1"));
    let sid = existingStudent?.id;
    if (!sid) {
      sid = Date.now();
      const st = db.prepare("INSERT INTO students (id, name, kelas, created_at) VALUES (?, ?, ?, ?)");
      st.run([sid, "Murid Demo", "X-1", Date.now()]);
      st.free();
    }
    const stmt = db.prepare("INSERT INTO users (username, password, role, student_id, created_at) VALUES (?, ?, ?, ?, ?)");
    stmt.run(["murid", "12345", "student", sid, Date.now()]);
    stmt.free();
  }

  api.save();
  return api;
}

