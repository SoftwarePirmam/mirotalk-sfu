'use strict';

const Logger = require('../Logger');
const log = new Logger('Syncroom');
const { getDb } = require('./db');
const users = require('./users');
const { createSyncroomRouter } = require('./routes');
const { requireAuthPage, getSessionUser } = require('./session');

function initSyncroom({ app, config, views, htmlInjector, roomList }) {
    const mf = config?.ui?.brand?.syncroom;
    if (!mf || mf.enabled === false) {
        log.info('Syncroom app layer disabled');
        return { enabled: false };
    }

    const db = getDb(mf.dbPath);

    app.use('/api/app', createSyncroomRouter({ db, config, roomList }));

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
            if (seeded) log.info('Seeded Syncroom admin user', { email: seeded.email });
        })
        .catch((err) => {
            log.error('Failed to seed Syncroom admin', err.message);
        });

    log.info('Syncroom app layer ready', { dbPath: mf.dbPath });
    return { enabled: true, db };
}

module.exports = { initSyncroom, getSessionUser, requireAuthPage };
