'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let db = null;

function getDb(dbPath) {
    if (db) return db;

    const resolved = path.resolve(dbPath || './data/syncroom.db');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });

    db = new DatabaseSync(resolved);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            room_id TEXT NOT NULL,
            starts_at TEXT NOT NULL,
            ends_at TEXT,
            timezone TEXT DEFAULT 'UTC',
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_meetings_owner ON meetings(owner_id);
        CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);
    `);

    return db;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, closeDb };
