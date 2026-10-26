'use strict';

const bcrypt = require('bcryptjs');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .toLowerCase();
}

function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: row.created_at,
    };
}

function countUsers(db) {
    return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

function findByEmail(db, email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
}

function findById(db, id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function createUser(db, { email, password, displayName }) {
    const normalized = normalizeEmail(email);
    if (!EMAIL_RE.test(normalized)) {
        const err = new Error('Invalid email address');
        err.status = 400;
        throw err;
    }
    if (!password || String(password).length < 8) {
        const err = new Error('Password must be at least 8 characters');
        err.status = 400;
        throw err;
    }
    const name = String(displayName || normalized.split('@')[0]).trim().slice(0, 80);
    if (!name) {
        const err = new Error('Display name is required');
        err.status = 400;
        throw err;
    }
    if (findByEmail(db, normalized)) {
        const err = new Error('An account with this email already exists');
        err.status = 409;
        throw err;
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const info = db
        .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
        .run(normalized, passwordHash, name);

    return publicUser(findById(db, info.lastInsertRowid));
}

async function authenticate(db, email, password) {
    const row = findByEmail(db, email);
    if (!row) {
        const err = new Error('Invalid email or password');
        err.status = 401;
        throw err;
    }
    const ok = await bcrypt.compare(String(password || ''), row.password_hash);
    if (!ok) {
        const err = new Error('Invalid email or password');
        err.status = 401;
        throw err;
    }
    return publicUser(row);
}

async function seedAdminIfEmpty(db, { email, password, displayName }) {
    if (countUsers(db) > 0) return null;
    return createUser(db, { email, password, displayName });
}

module.exports = {
    normalizeEmail,
    publicUser,
    countUsers,
    findByEmail,
    findById,
    createUser,
    authenticate,
    seedAdminIfEmpty,
};
