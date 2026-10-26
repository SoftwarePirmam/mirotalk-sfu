'use strict';

const express = require('express');
const users = require('./users');
const meetings = require('./meetings');
const {
    signSession,
    setSessionCookie,
    clearSessionCookie,
    getSessionUser,
    requireAuth,
} = require('./session');

function createMeetflowRouter({ db, config, roomList }) {
    const router = express.Router();
    const mf = config?.ui?.brand?.meetflow || {};
    const sessionDays = mf.sessionDays || 14;

    router.get('/auth/me', (req, res) => {
        const user = getSessionUser(req);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const row = users.findById(db, user.id);
        if (!row) {
            clearSessionCookie(res);
            return res.status(401).json({ message: 'Unauthorized' });
        }
        res.json({ user: users.publicUser(row), allowRegister: mf.allowRegister !== false });
    });

    router.post('/auth/register', async (req, res) => {
        try {
            if (mf.allowRegister === false) {
                return res.status(403).json({ message: 'Registration is disabled' });
            }
            const { email, password, displayName } = req.body || {};
            const user = await users.createUser(db, { email, password, displayName });
            const { token, maxAgeMs } = signSession(user, sessionDays);
            setSessionCookie(res, token, maxAgeMs);
            res.status(201).json({ user });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Registration failed' });
        }
    });

    router.post('/auth/login', async (req, res) => {
        try {
            const { email, password } = req.body || {};
            const user = await users.authenticate(db, email, password);
            const { token, maxAgeMs } = signSession(user, sessionDays);
            setSessionCookie(res, token, maxAgeMs);
            res.json({ user });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Login failed' });
        }
    });

    router.post('/auth/logout', (req, res) => {
        clearSessionCookie(res);
        res.json({ ok: true });
    });

    router.get('/meetings', requireAuth, (req, res) => {
        try {
            const { from, to } = req.query || {};
            const list = meetings.listByOwner(db, req.meetflowUser.id, { from, to });
            res.json({ meetings: list });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to list meetings' });
        }
    });

    router.get('/meetings/upcoming', requireAuth, (req, res) => {
        try {
            const list = meetings.upcomingForOwner(db, req.meetflowUser.id, 8);
            res.json({ meetings: list });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to list upcoming meetings' });
        }
    });

    router.post('/meetings', requireAuth, (req, res) => {
        try {
            const meeting = meetings.createMeeting(db, req.meetflowUser.id, req.body || {});
            res.status(201).json({ meeting });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to create meeting' });
        }
    });

    router.post('/meetings/instant', requireAuth, (req, res) => {
        try {
            const title = (req.body && req.body.title) || 'Instant meeting';
            const meeting = meetings.createMeeting(db, req.meetflowUser.id, {
                title,
                startsAt: new Date().toISOString(),
                durationMinutes: 60,
                status: 'instant',
                roomId: req.body?.roomId,
            });
            res.status(201).json({ meeting });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to start meeting' });
        }
    });

    router.get('/meetings/:id', requireAuth, (req, res) => {
        try {
            const meeting = meetings.getById(db, Number(req.params.id), req.meetflowUser.id);
            if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
            res.json({ meeting });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to get meeting' });
        }
    });

    router.patch('/meetings/:id', requireAuth, (req, res) => {
        try {
            const meeting = meetings.updateMeeting(db, Number(req.params.id), req.meetflowUser.id, req.body || {});
            res.json({ meeting });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to update meeting' });
        }
    });

    router.delete('/meetings/:id', requireAuth, (req, res) => {
        try {
            meetings.deleteMeeting(db, Number(req.params.id), req.meetflowUser.id);
            res.json({ ok: true });
        } catch (err) {
            res.status(err.status || 500).json({ message: err.message || 'Failed to delete meeting' });
        }
    });

    router.get('/live-rooms', requireAuth, (req, res) => {
        try {
            const live = [];
            if (roomList && typeof roomList.forEach === 'function') {
                roomList.forEach((room, roomId) => {
                    const peers = room?.getPeers ? room.getPeers() : room?.peers;
                    const peerCount = peers ? (peers.size !== undefined ? peers.size : Object.keys(peers).length) : 0;
                    live.push({ roomId, peerCount });
                });
            }
            res.json({ rooms: live, count: live.length });
        } catch (err) {
            res.status(500).json({ message: 'Failed to read live rooms' });
        }
    });

    return router;
}

module.exports = { createMeetflowRouter };
