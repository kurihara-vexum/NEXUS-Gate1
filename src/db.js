import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(100) NOT NULL,
  body TEXT NOT NULL,
  requester_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'PENDING', 'DONE')),
  assignee_id INTEGER NULL REFERENCES users(id),
  priority VARCHAR(10) NOT NULL DEFAULT 'MIDDLE' CHECK (priority IN ('HIGH', 'MIDDLE', 'LOW')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS inquiry_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id),
  changed_by INTEGER NOT NULL REFERENCES users(id),
  field_name VARCHAR(20) NOT NULL CHECK (field_name IN ('status', 'assignee')),
  old_value VARCHAR(50) NULL,
  new_value VARCHAR(50) NULL,
  changed_at TEXT NOT NULL
);
`;

export function createDatabase(filename = "data/nexus.sqlite", { seed = true } = {}) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA);
  if (seed) seedDatabase(db);
  return db;
}

export function seedDatabase(db) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (row.count > 0) return;

  const now = "2026-07-29T01:15:00.000Z";
  db.exec("BEGIN");
  try {
    const insertUser = db.prepare("INSERT INTO users (name, role, is_active) VALUES (?, ?, ?)");
    insertUser.run("管理 太郎", "ADMIN", 1);
    insertUser.run("佐藤 花子", "MEMBER", 1);
    insertUser.run("鈴木 一郎", "MEMBER", 1);
    insertUser.run("無効 ユーザー", "MEMBER", 0);

    const insertInquiry = db.prepare(`
      INSERT INTO inquiries
        (title, body, requester_name, status, assignee_id, priority, created_at, updated_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertInquiry.run("プリンタが印刷できません", "3階の複合機で印刷しようとするとエラーになります。", "山田 太郎", "NEW", null, "MIDDLE", now, now, null);
    insertInquiry.run("VPNに接続できません", "自宅から社内VPNへ接続できません。", "高橋 美咲", "IN_PROGRESS", 2, "HIGH", now, now, null);
    insertInquiry.run("ソフトウェア利用申請", "業務用ソフトウェアの利用許可をお願いします。", "田中 健", "PENDING", 3, "LOW", now, now, null);
    insertInquiry.run("PC交換のお願い", "端末交換が完了しました。", "伊藤 葵", "DONE", 2, "MIDDLE", now, now, "2026-07-29T02:00:00.000Z");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resetDatabase(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      DELETE FROM inquiry_histories;
      DELETE FROM inquiries;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  seedDatabase(db);
}
