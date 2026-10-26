'use strict';

const { randomUUID } = require('crypto');

function slugRoomId(title) {
    const base = String(title || 'meeting')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);
    return `${base || 'meeting'}-${randomUUID().slice(0, 8)}`;
}

function mapMeeting(row) {
    if (!row) return null;
    return {
        id: row.id,
        ownerId: row.owner_id,
        title: row.title,
        roomId: row.room_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        timezone: row.timezone,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
    };
}

function listByOwner(db, ownerId, { from, to } = {}) {
    let sql = 'SELECT * FROM meetings WHERE owner_id = ?';
    const params = [ownerId];
    if (from) {
        sql += ' AND starts_at >= ?';
        params.push(from);
    }
    if (to) {
        sql += ' AND starts_at <= ?';
        params.push(to);
    }
    sql += ' ORDER BY starts_at ASC';
    return db
        .prepare(sql)
        .all(...params)
        .map(mapMeeting);
}

function getById(db, id, ownerId) {
    return mapMeeting(db.prepare('SELECT * FROM meetings WHERE id = ? AND owner_id = ?').get(id, ownerId));
}

function createMeeting(db, ownerId, payload) {
    const title = String(payload.title || '').trim().slice(0, 120);
    if (!title) {
        const err = new Error('Title is required');
        err.status = 400;
        throw err;
    }

    const startsAt = String(payload.startsAt || '').trim();
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
        const err = new Error('Valid startsAt is required');
        err.status = 400;
        throw err;
    }

    const durationMin = Math.max(parseInt(payload.durationMinutes, 10) || 30, 5);
    const startDate = new Date(startsAt);
    const endsAt =
        payload.endsAt && !Number.isNaN(Date.parse(payload.endsAt))
            ? new Date(payload.endsAt).toISOString()
            : new Date(startDate.getTime() + durationMin * 60 * 1000).toISOString();

    const roomId = String(payload.roomId || slugRoomId(title))
        .trim()
        .slice(0, 64)
        .replace(/[^\w-]/g, '');
    if (!roomId) {
        const err = new Error('Invalid room id');
        err.status = 400;
        throw err;
    }

    const status = ['scheduled', 'instant', 'cancelled', 'completed'].includes(payload.status)
        ? payload.status
        : 'scheduled';

    const info = db
        .prepare(
            `INSERT INTO meetings (owner_id, title, room_id, starts_at, ends_at, timezone, description, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            ownerId,
            title,
            roomId,
            startDate.toISOString(),
            endsAt,
            String(payload.timezone || 'UTC').slice(0, 64),
            String(payload.description || '').slice(0, 2000),
            status
        );

    return getById(db, info.lastInsertRowid, ownerId);
}

function updateMeeting(db, id, ownerId, payload) {
    const existing = getById(db, id, ownerId);
    if (!existing) {
        const err = new Error('Meeting not found');
        err.status = 404;
        throw err;
    }

    const title = payload.title !== undefined ? String(payload.title).trim().slice(0, 120) : existing.title;
    if (!title) {
        const err = new Error('Title is required');
        err.status = 400;
        throw err;
    }

    let startsAt = existing.startsAt;
    if (payload.startsAt !== undefined) {
        if (Number.isNaN(Date.parse(payload.startsAt))) {
            const err = new Error('Invalid startsAt');
            err.status = 400;
            throw err;
        }
        startsAt = new Date(payload.startsAt).toISOString();
    }

    let endsAt = existing.endsAt;
    if (payload.endsAt !== undefined) {
        if (payload.endsAt && Number.isNaN(Date.parse(payload.endsAt))) {
            const err = new Error('Invalid endsAt');
            err.status = 400;
            throw err;
        }
        endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
    } else if (payload.durationMinutes) {
        const durationMin = Math.max(parseInt(payload.durationMinutes, 10) || 30, 5);
        endsAt = new Date(new Date(startsAt).getTime() + durationMin * 60 * 1000).toISOString();
    }

    const roomId =
        payload.roomId !== undefined
            ? String(payload.roomId).trim().slice(0, 64).replace(/[^\w-]/g, '') || existing.roomId
            : existing.roomId;

    const description =
        payload.description !== undefined
            ? String(payload.description).slice(0, 2000)
            : existing.description;

    const timezone =
        payload.timezone !== undefined ? String(payload.timezone).slice(0, 64) : existing.timezone;

    const status =
        payload.status && ['scheduled', 'instant', 'cancelled', 'completed'].includes(payload.status)
            ? payload.status
            : existing.status;

    db.prepare(
        `UPDATE meetings
         SET title = ?, room_id = ?, starts_at = ?, ends_at = ?, timezone = ?, description = ?, status = ?
         WHERE id = ? AND owner_id = ?`
    ).run(title, roomId, startsAt, endsAt, timezone, description, status, id, ownerId);

    return getById(db, id, ownerId);
}

function deleteMeeting(db, id, ownerId) {
    const info = db.prepare('DELETE FROM meetings WHERE id = ? AND owner_id = ?').run(id, ownerId);
    if (!info.changes) {
        const err = new Error('Meeting not found');
        err.status = 404;
        throw err;
    }
    return true;
}

function upcomingForOwner(db, ownerId, limit = 5) {
    const now = new Date().toISOString();
    return db
        .prepare(
            `SELECT * FROM meetings
             WHERE owner_id = ? AND status != 'cancelled' AND starts_at >= ?
             ORDER BY starts_at ASC LIMIT ?`
        )
        .all(ownerId, now, limit)
        .map(mapMeeting);
}

module.exports = {
    slugRoomId,
    listByOwner,
    getById,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    upcomingForOwner,
};
