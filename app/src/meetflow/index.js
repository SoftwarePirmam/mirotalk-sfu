'use strict';

const Logger = require('../Logger');
const log = new Logger('MeetFlow');
const { getDb } = require('./db');
const users = require('./users');
const { createMeetflowRouter } = require('./routes');
const { requireAuthPage, getSessionUser } = require('./session');

function initMeetflow({ app, config, views, htmlInjector, roomList }) {
    const mf = config?.ui?.brand?.meetflow;
    if (!mf || mf.enabled === false) {
        log.info('MeetFlow app layer disabled');
        return { enabled: false };
    }

    const db = getDb(mf.dbPath);

    app.use('/api/app', createMeetflowRouter({ db, config, roomList }));

    app.get('/dashboard', requireAuthPage, (req, res) => {
        if (htmlInjector && views.dashboard) {
            htmlInjector.injectHtml(views.dashboard, res);
        } else {
            res.sendFile(views.dashboard);
        }
    });

    app.get('/register', (req, res) => {
        // Registration disabled for now — only seeded/admin accounts
        if (!mf.allowRegister) {
            return res.redirect('/login');
        }
        const user = getSessionUser(req);
        if (user) return res.redirect('/dashboard');
        if (htmlInjector && views.register) {
            htmlInjector.injectHtml(views.register, res);
        } else {
            res.sendFile(views.register);
        }
    });

    users
        .seedAdminIfEmpty(db, {
            email: mf.adminEmail,
            password: mf.adminPassword,
            displayName: mf.adminName,
        })
        .then((seeded) => {
            if (seeded) log.info('Seeded MeetFlow admin user', { email: seeded.email });
        })
        .catch((err) => {
            log.error('Failed to seed MeetFlow admin', err.message);
        });

    log.info('MeetFlow app layer ready', { dbPath: mf.dbPath });
    return { enabled: true, db };
}

module.exports = { initMeetflow, getSessionUser, requireAuthPage };
