'use strict';

const api = axios.create({ withCredentials: true });

let currentUser = null;
let allMeetings = [];
let calCursor = new Date();
let selectedDay = new Date();

const views = {
    overview: document.getElementById('view-overview'),
    meetings: document.getElementById('view-meetings'),
    calendar: document.getElementById('view-calendar'),
};

const titles = {
    overview: 'Overview',
    meetings: 'Meetings',
    calendar: 'Calendar',
};

function esc(v) {
    return typeof filterXSS === 'function' ? filterXSS(String(v ?? '')) : String(v ?? '');
}

function fmtWhen(iso) {
    try {
        return new Date(iso).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function joinUrl(roomId) {
    return `${window.location.origin}/join/?room=${encodeURIComponent(roomId)}`;
}

function showView(name) {
    Object.keys(views).forEach((key) => {
        views[key].classList.toggle('mf-hidden', key !== name);
    });
    document.querySelectorAll('.mf-nav button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === name);
    });
    document.getElementById('mfPageTitle').textContent = titles[name] || 'Dashboard';
    if (name === 'calendar') renderCalendar();
}

async function ensureAuth() {
    try {
        const { data } = await api.get('/api/app/auth/me');
        currentUser = data.user;
        document.getElementById('mfUserLabel').textContent =
            `${currentUser.displayName || 'User'} · ${currentUser.email}`;
    } catch {
        window.location.href = '/login?next=/dashboard';
    }
}

function renderMeetingRows(target, meetings) {
    if (!meetings.length) {
        target.innerHTML = '<div class="mf-empty">No meetings yet. Create one to get started.</div>';
        return;
    }
    target.innerHTML = `
        <table class="mf-table">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>When</th>
                    <th>Room</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${meetings
                    .map(
                        (m) => `
                    <tr>
                        <td>
                            <strong>${esc(m.title)}</strong>
                            <div class="mf-muted">${esc(m.status)}${m.description ? ' · ' + esc(m.description) : ''}</div>
                        </td>
                        <td>${esc(fmtWhen(m.startsAt))}</td>
                        <td><code>${esc(m.roomId)}</code></td>
                        <td>
                            <div class="mf-row-actions">
                                <a class="mf-btn primary" href="${joinUrl(m.roomId)}">Join</a>
                                <button class="mf-btn" type="button" data-copy="${esc(m.roomId)}">Copy link</button>
                                <button class="mf-btn danger" type="button" data-del="${m.id}">Delete</button>
                            </div>
                        </td>
                    </tr>`
                    )
                    .join('')}
            </tbody>
        </table>`;

    target.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(joinUrl(btn.dataset.copy));
                btn.textContent = 'Copied';
                setTimeout(() => (btn.textContent = 'Copy link'), 1200);
            } catch {
                alert('Could not copy link');
            }
        };
    });
    target.querySelectorAll('[data-del]').forEach((btn) => {
        btn.onclick = async () => {
            if (!confirm('Delete this meeting?')) return;
            await api.delete(`/api/app/meetings/${btn.dataset.del}`);
            await refreshAll();
        };
    });
}

async function refreshAll() {
    const [meetingsRes, upcomingRes, liveRes] = await Promise.all([
        api.get('/api/app/meetings'),
        api.get('/api/app/meetings/upcoming'),
        api.get('/api/app/live-rooms'),
    ]);
    allMeetings = meetingsRes.data.meetings || [];
    const upcoming = upcomingRes.data.meetings || [];
    document.getElementById('statUpcoming').textContent = String(upcoming.length);
    document.getElementById('statTotal').textContent = String(allMeetings.length);
    document.getElementById('statLive').textContent = String(liveRes.data.count || 0);
    renderMeetingRows(document.getElementById('overviewList'), upcoming.slice(0, 5));
    renderMeetingRows(document.getElementById('meetingsList'), allMeetings);
    renderCalendar();
}

function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function meetingsOnDay(day) {
    const key = ymd(day);
    return allMeetings.filter((m) => ymd(new Date(m.startsAt)) === key);
}

function renderCalendar() {
    const label = document.getElementById('calLabel');
    const grid = document.getElementById('calGrid');
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    label.textContent = new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < 7; i++) {
        cells.push(`<div class="mf-cal-dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</div>`);
    }

    for (let i = 0; i < startPad; i++) {
        const dayNum = prevDays - startPad + i + 1;
        cells.push(`<div class="mf-cal-day outside"><div class="num">${dayNum}</div></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const selected = ymd(date) === ymd(selectedDay);
        const has = meetingsOnDay(date).length > 0;
        cells.push(`
            <div class="mf-cal-day ${selected ? 'selected' : ''}" data-day="${ymd(date)}">
                <div class="num">${d}</div>
                ${has ? '<div class="mf-cal-dot"></div>' : ''}
            </div>`);
    }

    while (cells.length % 7 !== 0) {
        const n = cells.length - 7 - startPad - daysInMonth + 1;
        cells.push(`<div class="mf-cal-day outside"><div class="num">${n > 0 ? n : ''}</div></div>`);
    }

    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-day]').forEach((el) => {
        el.onclick = () => {
            const [y, m, d] = el.dataset.day.split('-').map(Number);
            selectedDay = new Date(y, m - 1, d);
            renderCalendar();
        };
    });

    const dayMeetings = meetingsOnDay(selectedDay);
    document.getElementById('calDayTitle').textContent = `Meetings on ${selectedDay.toLocaleDateString()}`;
    renderMeetingRows(document.getElementById('calDayList'), dayMeetings);

    const startsInput = document.getElementById('mStartsAt');
    if (startsInput && !startsInput.value) {
        const local = new Date(selectedDay);
        local.setHours(10, 0, 0, 0);
        startsInput.value = toLocalInput(local);
    }
}

function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
    return new Date(value).toISOString();
}

document.querySelectorAll('.mf-nav button').forEach((btn) => {
    btn.onclick = () => showView(btn.dataset.view);
});

document.getElementById('mfLogoutBtn').onclick = async () => {
    await api.post('/api/app/auth/logout');
    window.location.href = '/login';
};

document.getElementById('mfInstantBtn').onclick = async () => {
    const { data } = await api.post('/api/app/meetings/instant', { title: 'Instant meeting' });
    window.location.href = joinUrl(data.meeting.roomId);
};

document.getElementById('meetingForm').onsubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById('mTitle').value.trim();
    const roomId = document.getElementById('mRoomId').value.trim();
    const startsAt = fromLocalInput(document.getElementById('mStartsAt').value);
    const durationMinutes = Number(document.getElementById('mDuration').value) || 30;
    const description = document.getElementById('mDescription').value.trim();
    await api.post('/api/app/meetings', { title, roomId: roomId || undefined, startsAt, durationMinutes, description });
    e.target.reset();
    document.getElementById('mDuration').value = '30';
    await refreshAll();
    showView('meetings');
};

document.getElementById('calPrev').onclick = () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
};
document.getElementById('calNext').onclick = () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
};

(async function boot() {
    await ensureAuth();
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    document.getElementById('mStartsAt').value = toLocalInput(now);
    await refreshAll();
})();
