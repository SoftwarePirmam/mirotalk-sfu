'use strict';

const jwt = require('jsonwebtoken');
const { getJwtKeys } = require('../JwtSecret');

const COOKIE_NAME = 'syncroom_session';

function sessionMaxAgeMs(sessionDays) {
    return Math.max(Number(sessionDays) || 14, 1) * 24 * 60 * 60 * 1000;
}

function signSession(user, sessionDays) {
    const keys = getJwtKeys();
    const maxAgeMs = sessionMaxAgeMs(sessionDays);
    const token = jwt.sign(
        {
            sub: String(user.id),
            email: user.email,
            displayName: user.displayName,
            purpose: 'syncroom',
        },
        keys.syncroom,
        { expiresIn: Math.floor(maxAgeMs / 1000) }
    );
    return { token, maxAgeMs };
}

function verifySessionToken(token) {
    if (!token) return null;
    try {
        const keys = getJwtKeys();
        const payload = jwt.verify(token, keys.syncroom);
        if (payload.purpose !== 'syncroom') return null;
        return {
            id: Number(payload.sub),
            email: payload.email,
            displayName: payload.displayName,
        };
    } catch {
        return null;
    }
}

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) out[key] = decodeURIComponent(val);
    });
    return out;
}

function getSessionUser(req) {
    const cookies = parseCookies(req);
    return verifySessionToken(cookies[COOKIE_NAME]);
}

function setSessionCookie(res, token, maxAgeMs) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`
    );
}

function clearSessionCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function requireAuth(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    req.syncroomUser = user;
    next();
}

function requireAuthPage(req, res, next) {
    const user = getSessionUser(req);
    if (!user) {
        return res.redirect('/login?next=/dashboard');
    }
    req.syncroomUser = user;
    next();
}

module.exports = {
    COOKIE_NAME,
    signSession,
    verifySessionToken,
    getSessionUser,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
    requireAuthPage,
};
