const fs = require('fs');
const path = require('path');
const config = require('./config');

const STATS_FILE = path.join(__dirname, 'stats.json');

let data = {};
try {
    if (fs.existsSync(STATS_FILE)) {
        data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    }
} catch (e) {
    console.error('Не удалось загрузить stats.json:', e);
    data = {};
}

const activeVoice = new Map();

function getUser(userId) {
    if (!data[userId]) {
        data[userId] = {
            voiceSeconds: 0,
            days: {},
            lastSeen: null,
            currentRole: config.EVOLUTION_ROLES[0].name
        };
    }
    return data[userId];
}

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saveStats() {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Не удалось сохранить stats.json:', e);
    }
}

setInterval(saveStats, 30_000);

// =========================
// ГОЛОС
// =========================
function startVoice(userId) {
    if (!activeVoice.has(userId)) activeVoice.set(userId, Date.now());
}

// Возвращает true, если сессия была записана (>= 10 сек)
function endVoice(userId) {
    if (!activeVoice.has(userId)) return false;
    const start = activeVoice.get(userId);
    const duration = Math.floor((Date.now() - start) / 1000);
    activeVoice.delete(userId);
    if (duration < 10) return false;

    const user = getUser(userId);
    user.voiceSeconds += duration;

    const key = todayKey();
    if (!user.days[key]) user.days[key] = { voiceSeconds: 0 };
    user.days[key].voiceSeconds += duration;

    return true;
}

function getLiveVoice(userId) {
    if (!activeVoice.has(userId)) return 0;
    return Math.floor((Date.now() - activeVoice.get(userId)) / 1000);
}

// =========================
// АКТИВНЫЕ ДНИ (только голос)
// =========================
function getActiveDays(userId) {
    const user = getUser(userId);
    const { minVoiceMinutes } = config.ACTIVE_DAY;
    const minVoiceSeconds = minVoiceMinutes * 60;

    let count = 0;
    for (const day of Object.values(user.days)) {
        if (day.voiceSeconds >= minVoiceSeconds) count++;
    }
    return count;
}

function getVoiceHours(userId) {
    const user = getUser(userId);
    return (user.voiceSeconds + getLiveVoice(userId)) / 3600;
}

// =========================
// ЭВОЛЮЦИЯ
// =========================
function getEligibleRole(userId) {
    const days = getActiveDays(userId);
    const hours = getVoiceHours(userId);
    for (let i = config.EVOLUTION_ROLES.length - 1; i >= 0; i--) {
        const role = config.EVOLUTION_ROLES[i];
        if (days >= role.days && hours >= role.voiceHours) return role;
    }
    return config.EVOLUTION_ROLES[0];
}

// =========================
// ТОПЫ
// =========================
function getTop(metric = 'voice', limit = 10, offset = 0) {
    const list = Object.entries(data).map(([userId, user]) => {
        const live = getLiveVoice(userId);
        return {
            userId,
            voiceSeconds: user.voiceSeconds + live,
            activeDays: getActiveDays(userId),
            role: getEligibleRole(userId).name
        };
    });

    if (metric === 'voice') list.sort((a, b) => b.voiceSeconds - a.voiceSeconds);
    if (metric === 'days')  list.sort((a, b) => b.activeDays - a.activeDays);

    return {
        total: list.length,
        items: list.slice(offset, offset + limit)
    };
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return `${s} сек`;
}

module.exports = {
    startVoice, endVoice,
    getActiveDays, getVoiceHours, getEligibleRole,
    getTop, formatTime, saveStats, getUser
};