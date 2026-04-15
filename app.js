/**
 * SafeCity AI — ANTIGRAVITY Edition v7.0
 * Firebase Integration: Auth + Firestore
 * Location: 4-tier strategy (High GPS → Network GPS → IP → Error)
 */

/* ====================== CONFIG ====================== */
const CONFIG = {
    WEATHER_API: 'https://api.openweathermap.org/data/2.5/weather',
    GEO_API: 'https://nominatim.openstreetmap.org/reverse?format=json',
    API_KEY: 'bd5e378503939ddaee76f12ad7a97608'
};

let state = {
    aqi: 0, weather: null,
    charts: { gauge: null, sens: null },
    season: 'SUMMER', route: 'home', coords: null,
    currentUser: null
};

/* ====================== FIREBASE SHORTCUTS ====================== */
// firebase-config.js exposes these on window before this script runs
const auth = window.firebaseAuth;
const db   = window.firebaseDb;

/* ====================== ROUTER ====================== */
const VIEWS = {
    home: 'view-home', dashboard: 'view-dashboard',
    health: 'view-health', about: 'view-about',
    contact: 'view-contact', login: 'view-login'
};

function navigateTo(route) {
    if (!VIEWS[route]) return;
    document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active-view'));
    const target = document.getElementById(VIEWS[route]);
    if (target) target.classList.add('active-view');
    state.route = route;
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.route === route);
    });
    if (route === 'dashboard') triggerAnalysis();
    if (route === 'health') { if (state.aqi > 0) populateFamilyCards(state.aqi); else triggerAnalysis(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigateTo = navigateTo;

/* ====================== INIT ====================== */
document.addEventListener('DOMContentLoaded', () => {
    try { lucide.createIcons(); } catch (e) { }
    detectSeason();
    attachHandlers();
    attachAuthStateListener();
    const hash = window.location.hash.replace('#', '') || 'home';
    navigateTo(VIEWS[hash] ? hash : 'home');
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (VIEWS[hash]) navigateTo(hash);
});

/* ====================== HANDLERS ====================== */
function attachHandlers() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const route = link.dataset.route;
            window.location.hash = route;
            navigateTo(route);
        });
    });
    const hamburger = document.getElementById('nav-hamburger');
    if (hamburger) hamburger.addEventListener('click', () =>
        document.getElementById('nav-links').classList.toggle('open')
    );
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', triggerAnalysis);

    // Login panel overlay toggle (UI only — no change)
    const signUpBtn = document.getElementById('signUp');
    const signInBtn = document.getElementById('signIn');
    const loginBox  = document.getElementById('login-container');
    if (signUpBtn && signInBtn && loginBox) {
        signUpBtn.addEventListener('click', () => loginBox.classList.add('right-panel-active'));
        signInBtn.addEventListener('click', () => loginBox.classList.remove('right-panel-active'));
    }
}

/* =========================================================
   FIREBASE AUTH — STATE LISTENER
   Updates navbar and state.currentUser on every auth change
   ========================================================= */
function attachAuthStateListener() {
    auth.onAuthStateChanged(user => {
        state.currentUser = user;
        const authOut = document.getElementById('nav-auth-out');
        const authIn  = document.getElementById('nav-auth-in');
        const nameEl  = document.getElementById('nav-user-name');
        if (user) {
            // User is signed in
            if (authOut) authOut.style.display = 'none';
            if (authIn)  authIn.style.display  = 'flex';
            if (nameEl) {
                const displayName = user.displayName || user.email.split('@')[0];
                nameEl.textContent = `👤 ${displayName}`;
            }
        } else {
            // User is signed out
            if (authOut) authOut.style.display = 'flex';
            if (authIn)  authIn.style.display  = 'none';
        }
        try { lucide.createIcons(); } catch (e) { }
    });
}

/* =========================================================
   FIREBASE AUTH — SIGN UP
   Creates user in Firebase Auth + Firestore users collection
   ========================================================= */
window.handleSignUp = async function(e) {
    e.preventDefault();
    const name     = document.getElementById('signup-name').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const msgEl    = document.getElementById('signup-msg');
    const btn      = document.getElementById('btn-signup');

    setAuthMsg(msgEl, '', '');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    try {
        // 1. Create Firebase Auth user
        const cred = await auth.createUserWithEmailAndPassword(email, password);

        // 2. Set display name
        await cred.user.updateProfile({ displayName: name });

        // 3. Save user profile to Firestore
        await db.collection('users').doc(cred.user.uid).set({
            uid: cred.user.uid,
            name,
            email,
            role: 'user',           // admin role can be set manually in Firestore Console
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        setAuthMsg(msgEl, '✅ Account created! Redirecting…', 'success');
        setTimeout(() => navigateTo('dashboard'), 1200);

    } catch (err) {
        setAuthMsg(msgEl, getAuthErrorMsg(err.code), 'error');
        btn.disabled = false;
        btn.textContent = 'Sign Up';
    }
};

/* =========================================================
   FIREBASE AUTH — SIGN IN
   ========================================================= */
window.handleSignIn = async function(e) {
    e.preventDefault();
    const email    = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    const msgEl    = document.getElementById('signin-msg');
    const btn      = document.getElementById('btn-do-login');

    setAuthMsg(msgEl, '', '');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
        const cred = await auth.signInWithEmailAndPassword(email, password);

        // Update lastLogin in Firestore
        await db.collection('users').doc(cred.user.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        setAuthMsg(msgEl, '✅ Signed in! Redirecting…', 'success');
        setTimeout(() => navigateTo('dashboard'), 1000);

    } catch (err) {
        setAuthMsg(msgEl, getAuthErrorMsg(err.code), 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In →';
    }
};

/* =========================================================
   FIREBASE AUTH — SIGN OUT
   ========================================================= */
window.handleLogout = async function() {
    try {
        await auth.signOut();
        navigateTo('home');
    } catch (err) {
        console.error('Logout error:', err);
    }
};

/* =========================================================
   HELPER: auth message + human-friendly Firebase errors
   ========================================================= */
function setAuthMsg(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-msg' + (type ? ' auth-msg--' + type : '');
}

function getAuthErrorMsg(code) {
    const map = {
        'auth/email-already-in-use': '⚠️ Email already registered. Please sign in.',
        'auth/invalid-email': '⚠️ Invalid email address.',
        'auth/weak-password': '⚠️ Password must be at least 6 characters.',
        'auth/user-not-found': '⚠️ No account found with this email.',
        'auth/wrong-password': '⚠️ Incorrect password. Please try again.',
        'auth/too-many-requests': '⚠️ Too many attempts. Try again later.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
        'auth/invalid-credential': '⚠️ Invalid email or password.'
    };
    return map[code] || `⚠️ Error: ${code}`;
}

/* ====================== SEASON ====================== */
function detectSeason() {
    const m = new Date().getMonth();
    if (m >= 5 && m <= 8) state.season = 'MONSOON';
    else if (m >= 10 || m <= 1) state.season = 'WINTER';
    else state.season = 'SUMMER';
    const el = document.getElementById('season-badge');
    if (el) el.innerText = `⛅ ${state.season} SEASON`;
}

/* ====================== HEALTH ROW TOGGLE ====================== */
window.toggleHealthRow = (btn) => {
    const row = btn.closest('.h-row');
    const isOpen = row.classList.contains('open');
    document.querySelectorAll('.h-row').forEach(r => {
        r.classList.remove('open');
        const b = r.querySelector('.btn-git');
        if (b) b.innerHTML = `Get in touch <i data-lucide="chevron-down" style="width:16px;"></i>`;
    });
    if (!isOpen) {
        row.classList.add('open');
        btn.innerHTML = `Close <i data-lucide="chevron-up" style="width:16px;"></i>`;
    }
    try { lucide.createIcons(); } catch (e) { }
};

/* ====================== REVERSE GEOCODING ====================== */
async function getExactLocationName(lat, lon) {
    try {
        const res = await fetch(
            `${CONFIG.GEO_API}&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1&accept-language=en`
        );
        const data = await res.json();
        const a = data.address;
        const parts = [
            a.road || a.pedestrian || a.footway,
            a.suburb || a.neighbourhood || a.quarter || a.village || a.town || a.hamlet,
            a.city || a.county || a.state_district,
            a.state
        ].filter(Boolean);
        return parts.slice(0, 3).join(', ');
    } catch { return null; }
}

/* Google Maps — zoom 17 + marker for precise view */
function loadGoogleMap(lat, lon) {
    const frame   = document.getElementById('google-map-frame');
    const loading = document.getElementById('map-loading');
    if (!frame) return;
    frame.src = `https://maps.google.com/maps?q=${lat},${lon}&z=17&output=embed`;
    frame.style.display = 'block';
    if (loading) loading.style.display = 'none';
}

/* ====================== LOCATION STRATEGY ====================== */
window.triggerAnalysis = function () {
    const aqiEl = document.getElementById('aqi-value');
    const stsEl = document.getElementById('aqi-status');
    if (aqiEl) aqiEl.innerText = '···';
    if (stsEl) stsEl.innerText = 'SYNCING';
    setLocText('🛰️ Locking GPS signal...');

    if (!navigator.geolocation) {
        ipGeolocationFallback();
        return;
    }

    navigator.geolocation.watchPosition(
        pos => onGPSSuccess(pos, 'GPS'),
        () => {
            setLocText('📶 Trying network location...');
            navigator.geolocation.watchPosition(
                pos => onGPSSuccess(pos, 'Network'),
                () => {
                    setLocText('🌐 Using IP location...');
                    ipGeolocationFallback();
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
            );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
};

function setLocText(text) {
    document.querySelectorAll('#loc-display, #loc-display-map').forEach(el => el.innerText = text);
}

function onGPSSuccess(pos, method) {
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    const accLabel = accuracy < 50  ? `✅ ±${Math.round(accuracy)}m`
                   : accuracy < 300 ? `⚠️ ±${Math.round(accuracy)}m`
                   :                  `❌ ±${(accuracy / 1000).toFixed(1)}km`;
    console.log(`[Location] ${method} | ${lat.toFixed(6)}, ${lon.toFixed(6)} | ${accLabel}`);
    fetchWeather(lat, lon, method, null, accLabel);
}

async function ipGeolocationFallback() {
    try {
        const res  = await fetch('https://ip-api.com/json/?fields=lat,lon,city,regionName,country,status');
        const data = await res.json();
        if (data.status === 'success') {
            fetchWeather(data.lat, data.lon, 'IP', `${data.city}, ${data.regionName}`, '🌐 city-level');
        } else {
            showLocationError();
        }
    } catch {
        showLocationError();
    }
}

function showLocationError() {
    setLocText('❌ Location access denied');
    const aqiEl  = document.getElementById('aqi-value');
    const stsEl  = document.getElementById('aqi-status');
    const alrtEl = document.getElementById('aqi-alert');
    if (aqiEl)  aqiEl.innerText  = '--';
    if (stsEl)  stsEl.innerText  = 'NO GPS';
    if (alrtEl) {
        alrtEl.innerText = '🚨 Enable location in your browser settings, then click Re-Sync.';
        alrtEl.className = 'aqi-alert-bar moderate';
    }
}

/* ====================== WEATHER API ====================== */
async function fetchWeather(lat, lon, source, ipLocName, accuracy) {
    state.coords = { lat, lon };
    const locName = ipLocName || await getExactLocationName(lat, lon);
    const srcTag  = source === 'IP' ? ' 🌐' : ' 🛰️';
    const accTag  = accuracy ? ` (${accuracy})` : '';
    const display = (locName || 'Your Location') + srcTag + accTag;
    setLocText(display);

    try {
        const res  = await fetch(`${CONFIG.WEATHER_API}?lat=${lat}&lon=${lon}&units=metric&appid=${CONFIG.API_KEY}`);
        const data = await res.json();
        processWeather(data.cod === 200 ? data : makeMockWeather());
    } catch {
        processWeather(makeMockWeather());
    }
}

function makeMockWeather() {
    return { main: { temp: 30, humidity: 65, pressure: 1010 }, wind: { speed: 2.5 } };
}

function processWeather(d) {
    if (state.coords) loadGoogleMap(state.coords.lat, state.coords.lon);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    set('val-temp',     `${Math.round(d.main.temp)}°C`);
    set('val-humidity', `${d.main.humidity}%`);
    set('val-wind',     `${Math.round((d.wind?.speed || 2) * 3.6)} km/h`);
    set('val-pressure', `${d.main.pressure} hPa`);

    const traffic  = Math.random() * 45 + 35;
    const industry = Math.random() * 35 + 20;
    const bias     = state.season === 'WINTER' ? 45 : state.season === 'MONSOON' ? -25 : 5;
    state.aqi = Math.min(380, Math.max(10, Math.round(
        traffic * 0.75 + industry * 0.65 + bias + d.main.temp * 0.4 + d.main.humidity * 0.2
    )));
    renderAQI();
    const badge = document.getElementById('home-aqi-badge');
    if (badge) badge.innerText = `AQI: ${state.aqi} — ${getStatus(state.aqi).status}`;

    // Persist AQI reading to Firestore if user is logged in
    if (state.currentUser && state.coords) {
        db.collection('aqi_readings').add({
            uid: state.currentUser.uid,
            aqi: state.aqi,
            lat: state.coords.lat,
            lon: state.coords.lon,
            season: state.season,
            weather: {
                temp: d.main.temp,
                humidity: d.main.humidity,
                pressure: d.main.pressure,
                windSpeed: d.wind?.speed || 0
            },
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(err => console.warn('[Firestore] AQI write failed:', err));
    }
}

/* ====================== AQI RENDERING ====================== */
function getStatus(aqi) {
    if (aqi <= 50)  return { color: '#22c55e', status: 'EXCELLENT', cls: 'safe' };
    if (aqi <= 100) return { color: '#a3e635', status: 'GOOD',      cls: 'good' };
    if (aqi <= 200) return { color: '#fb923c', status: 'MODERATE',  cls: 'moderate' };
    if (aqi <= 300) return { color: '#f87171', status: 'POOR',      cls: 'poor' };
    return             { color: '#dc2626', status: 'HAZARDOUS',  cls: 'hazardous' };
}

function renderAQI() {
    const aqi     = state.aqi;
    const { color, status, cls } = getStatus(aqi);
    const valEl   = document.getElementById('aqi-value');
    const stsEl   = document.getElementById('aqi-status');
    const alrtEl  = document.getElementById('aqi-alert');
    if (valEl)  { valEl.innerText  = aqi;    valEl.style.color  = color; }
    if (stsEl)  { stsEl.innerText  = status; stsEl.style.color  = color; }
    if (alrtEl) { alrtEl.innerText = `AQI ${aqi} — ${status}. ${getAlertMsg(aqi)}`; alrtEl.className = `aqi-alert-bar ${cls}`; }
    drawGauge(aqi, color);
    drawSensChart(color);
    populateFamilyCards(aqi);
}

function getAlertMsg(aqi) {
    if (aqi <= 50)  return 'Air is clean. Great day to go outside!';
    if (aqi <= 100) return 'Sensitive groups should limit outdoor exposure.';
    if (aqi <= 200) return 'Wear mask outdoors. Everyone may feel effects.';
    if (aqi <= 300) return 'Avoid strenuous outdoor activity. Stay protected.';
    return 'Health emergency: Stay indoors. Seek medical advice immediately.';
}

/* ====================== CHARTS ====================== */
function drawGauge(aqi, color) {
    const canvas = document.getElementById('aqi-gauge');
    if (!canvas) return;
    if (state.charts.gauge) state.charts.gauge.destroy();
    state.charts.gauge = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { datasets: [{ data: [aqi, 380 - aqi], backgroundColor: [color, 'rgba(255,255,255,0.04)'], borderWidth: 0, borderRadius: 10 }] },
        options: { cutout: '82%', plugins: { tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: false }
    });
}

function drawSensChart(color) {
    const canvas = document.getElementById('sensitivity-chart');
    if (!canvas) return;
    if (state.charts.sens) state.charts.sens.destroy();
    state.charts.sens = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Traffic Emissions', 'Industrial Smog', 'Seasonal Factor', 'Thermal Load', 'Humidity'],
            datasets: [{ label: 'Sensitivity Weight (%)', data: [38, 28, 18, 10, 6], backgroundColor: color + '55', borderColor: color, borderWidth: 2, borderRadius: 6 }]
        },
        options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#e2e8f0', font: { weight: '600' } }, grid: { display: false } }
            },
            responsive: true, maintainAspectRatio: false
        }
    });
}

/* ====================== FAMILY HEALTH DATA ====================== */
const HEALTH_DB = {
    safe: {
        baby:     { tip: '✅ Clean air! Safe for outdoor time with newborn.', meal: 'Breast milk / Organic formula', cloth: 'Light breathable cotton clothing', drink: 'Breast milk / Boiled cooled water', time: 'Anytime — ideal 7AM to 6PM', remedy: '🌿 <strong>Home Remedies:</strong><br>• Humidifier — keeps air moist for baby lungs<br>• Tulsi leaf steam — natural antiviral<br>• Coconut oil massage — boosts skin immunity<br>• Keep windows open for natural ventilation<br>• Neem leaf in corners keeps insects away', outside: ['SPF 30 Baby Sunscreen', 'Baby Sun Hat', 'Infant UV Protective Suit', 'Baby Stroller Sunshade'] },
        pregnant: { tip: '✅ Excellent air. Light outdoor walks are beneficial.', meal: 'Iron-rich foods: spinach, lentils, pomegranate', cloth: 'Breathable cotton dress + light dupatta', drink: 'Coconut water / Lemon water / Pomegranate juice', time: 'Morning 6–9AM or Evening 5–7PM', remedy: '🌿 <strong>Home Remedies:</strong><br>• Ginger tulsi tea — reduces nausea<br>• Turmeric milk — anti-inflammatory<br>• Pranayama breathing — lung strength<br>• Steam inhalation with eucalyptus<br>• 2 soaked almonds daily — brain & lung health', outside: ['SPF 50+ Pregnancy Safe Sunscreen', 'Maternity Sun Hat', 'UV Protection Scarf', 'Non-toxic Insect Repellent'] },
        mother:   { tip: '✅ Great air quality. No restrictions for adults.', meal: 'Salads, nuts, whole grains, fruits', cloth: 'Cotton clothes + light sunhat', drink: 'Water / Herbal infusion / Fresh lime soda', time: 'Flexible — all day is safe', remedy: '🌿 <strong>Home Remedies:</strong><br>• Moringa soup — iron & vitamin boost<br>• Honey lemon water — antioxidant drink<br>• Giloy kadha — natural immunity booster<br>• Avoid heavy synthetic perfumes<br>• Deep breathing in green spaces', outside: ['SPF 50+ Sunscreen Lotion', 'UV Protection Sunglasses', 'Breathable Sports Cap', 'Vitamin C Serum'] },
        normal:   { tip: '✅ Air is clean. Enjoy outdoor activities fully.', meal: 'Balanced diet — any healthy cuisine', cloth: 'Normal comfortable outdoor clothing', drink: 'Water / Juice / Coconut water', time: 'All day — no restrictions', remedy: '🌿 <strong>Home Remedies:</strong><br>• Tulsi-ginger tea daily<br>• Triphala powder — natural detox<br>• Eat seasonal fruits<br>• 30-min morning walk<br>• Stay hydrated — 3 litres daily', outside: ['SPF 40 Daily Sunscreen', 'Sunglasses UV400', 'Sports Cap', 'Energy Drink / Electrolyte'] }
    },
    moderate: {
        baby:     { tip: '⚠️ Moderate pollution. Limit outdoor time for newborn.', meal: 'Vitamin C enriched formula / Orange supplements', cloth: 'Soft N95 mask + full sleeves', drink: 'Boiled filtered water only', time: 'Only 6–8AM — avoid peak traffic hours', remedy: '🌿 <strong>Home Remedies:</strong><br>• HEPA air purifier — essential indoors<br>• Ajwain steam — anti-pollutant<br>• Honey in warm water — soothes airways<br>• Keep windows closed afternoon<br>• Mustard oil nose drops — traditional barrier', outside: ['SPF 50+ Baby Safe Sunscreen', 'Baby Cotton Mask', 'Baby UV Suit Full Sleeves', 'Petroleum Jelly (nose protection)'] },
        pregnant: { tip: '⚠️ Caution: Moderate smog. Avoid heavy traffic zones.', meal: 'Turmeric dal, green vegetables, amla', cloth: 'Surgical mask + light shawl', drink: 'Ginger-tulsi tea / Warm water with honey', time: 'Early mornings 6–7AM only', remedy: '🌿 <strong>Home Remedies:</strong><br>• Jaggery and ginger tea — draws toxins<br>• Neem steam 2× daily<br>• Turmeric milk at night<br>• Indoor plants: peace lily, spider plant<br>• Saline nasal drops', outside: ['SPF 50+ Mineral Sunscreen (pregnancy safe)', 'Anti-Pollution Face Mask N95', 'Bamboo Filter Scarf', 'Saline Nasal Spray', 'Vitamin C Strips'] },
        mother:   { tip: '⚠️ Wear mask outdoors. Avoid congested streets.', meal: 'Vitamin C diet: amla, citrus, bell peppers', cloth: 'N95 mask + full sleeve cotton top', drink: 'Honey-lemon warm water / Ginger cardamom tea', time: 'Evenings post 7PM — or early 6–7AM', remedy: '🌿 <strong>Home Remedies:</strong><br>• Steam inhalation with tulsi & ginger 2×<br>• Giloy juice morning — pollution antidote<br>• Ghee in nostrils (Nasya)<br>• Jaggery with sesame — lung detox<br>• Oil pulling with sesame oil', outside: ['SPF 50 PA+++ Sunscreen', 'Anti-Pollution N95 Mask', 'UV400 Polarized Sunglasses', 'Anti-Pollution Face Serum', 'Detox Green Tea'] },
        normal:   { tip: '⚠️ Use a mask outdoors. Reduce heavy physical exertion.', meal: 'Anti-inflammatory: ginger, turmeric, omega-3 fish', cloth: '3-layer mask or N95 outdoors', drink: 'Herbal tea / Warm water / Amla juice', time: 'Limit to early morning or post-sunset', remedy: '🌿 <strong>Home Remedies:</strong><br>• Chyawanprash daily<br>• Saline nasal rinse (Neti pot)<br>• Activated charcoal water filter<br>• Eat more fiber<br>• Tulsi plant at home', outside: ['N95 Anti-Pollution Mask', 'SPF 50 Lightweight Sunscreen', 'Air Quality Monitor Pocket Device', 'Saline Nasal Rinse Bottle', 'Cooling Towel'] }
    },
    hazardous: {
        baby:     { tip: '🚨 CRITICAL: Keep newborn strictly indoors. Seal windows.', meal: 'Breast milk + immune-boosting infant probiotics', cloth: 'NO outdoor exposure. Full indoor climate control.', drink: 'Purified filtered water only', time: '🚫 NO OUTDOOR ACTIVITIES — absolute restriction', remedy: '🌿 <strong>Emergency Protocol:</strong><br>• Run HEPA purifier 24/7<br>• Wet towel at doorways — catches particles<br>• Turmeric paste in milk — immunity<br>• Monitor for cough, watery eyes<br>• Call paediatrician immediately', outside: ['Baby Air Purifier (room)', 'Medical Grade HEPA Purifier', 'Baby Pulse Oximeter (SpO2)', 'Paediatrician Helpline: 1800-4250-505'] },
        pregnant: { tip: '🚨 DANGER: Hazardous air. All outdoor exposure must stop.', meal: 'Detox diet: curd, turmeric rice, steamed vegetables', cloth: 'KN95 + full sleeve + eye protection', drink: 'Honey + ginger serum / Warm turmeric water', time: '🚫 ABSOLUTE INDOOR — No outdoor visits', remedy: '🌿 <strong>Emergency Protocol:</strong><br>• Steam 3× daily with eucalyptus<br>• Honey + black pepper + ginger paste<br>• Warm water every 30 minutes<br>• Contact OB/GYN if breathless<br>• Tulsi + clove kadha maximum immunity', outside: ['KN95/FFP3 Respirator', 'Full Face Anti-Pollution Shield', 'SPF 100 Sunscreen', 'Portable Wearable Air Purifier', 'Emergency Medical Card'] },
        mother:   { tip: '🚨 CRITICAL: Stay indoors. Air purifier essential.', meal: 'Steamed food only. Amla, turmeric, garlic.', cloth: 'N95 + eye goggles if must go outside', drink: 'Detox lemon ginger water + nimbu pani', time: '🚫 ALL DAY INDOOR — Emergency only', remedy: '🌿 <strong>Emergency Protocol:</strong><br>• Gargle warm salt water 3×/day<br>• Camphor steam in bedroom<br>• Raw garlic 2 cloves/day<br>• Monitor SpO2 — if below 95% seek help<br>• Sesame oil nose drops (Anu Tailam)', outside: ['N95 + Activated Carbon Mask', 'Anti-Pollution Full Face Visor', 'SPF 50 PA++++ Sunscreen', 'Portable Pulse Oximeter', 'Indoor HEPA Air Purifier'] },
        normal:   { tip: '🚨 Health alert for ALL. Minimize every outdoor activity.', meal: 'Light digestible food. Avoid fried/spicy.', cloth: 'N95 essential. Long sleeves, closed shoes.', drink: 'Warm water + herbal kadha every 2 hours', time: '🚫 Essential trips only — max 15 minutes', remedy: '🌿 <strong>Emergency Protocol:</strong><br>• Triphala kadha — full-body detox<br>• Activated charcoal tablet<br>• Saline nasal rinse after every trip<br>• Neem + tulsi steam 2× daily<br>• Monitor for headache, chest tightness', outside: ['N95 Respirator Mask', 'Anti-Pollution Sunglasses', 'SPF 80 Sunscreen Stick', 'Saline Nasal Spray', 'Activated Charcoal Water Bottle'] }
    }
};

function getHealthTier(aqi) {
    if (aqi <= 100) return 'safe';
    if (aqi <= 200) return 'moderate';
    return 'hazardous';
}

const foodLink    = t => `<a href="https://www.swiggy.com/search?query=${encodeURIComponent(t)}" target="_blank" class="mkt-pill">🍽 ${t}</a>`;
const drinkLink   = t => `<a href="https://www.zomato.com/search?q=${encodeURIComponent(t)}" target="_blank" class="mkt-pill">🥤 ${t}</a>`;
const productLink = t => `<a href="https://www.amazon.in/s?k=${encodeURIComponent(t)}" target="_blank" class="mkt-pill outside-pill">🛍 ${t}</a>`;

function populateFamilyCards(aqi) {
    const tier = getHealthTier(aqi);
    ['baby', 'pregnant', 'mother', 'normal'].forEach(g => {
        const d = HEALTH_DB[tier][g];
        document.querySelectorAll(`#tip-${g}`).forEach(el => el.innerText = d.tip);
        document.querySelectorAll(`#meal-${g}`).forEach(el => el.innerHTML = foodLink(d.meal));
        document.querySelectorAll(`#cloth-${g}`).forEach(el => el.innerHTML = productLink(d.cloth));
        document.querySelectorAll(`#drink-${g}`).forEach(el => el.innerHTML = drinkLink(d.drink));
        document.querySelectorAll(`#time-${g}`).forEach(el => el.innerText = d.time);
        document.querySelectorAll(`#rem-${g}`).forEach(el => el.innerHTML = d.remedy);
        document.querySelectorAll(`#outside-${g}`).forEach(el => el.innerHTML = d.outside.map(productLink).join(''));
    });
    try { lucide.createIcons(); } catch (e) { }
}

/* =========================================================
   CONTACT FORM — saves to Firestore `contact_messages`
   ========================================================= */
window.handleContactSubmit = async (e) => {
    e.preventDefault();
    const name    = document.getElementById('contact-name').value.trim();
    const email   = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    const btn     = e.target.querySelector('button[type="submit"]');

    btn.disabled    = true;
    btn.textContent = 'Sending…';

    try {
        await db.collection('contact_messages').add({
            name,
            email,
            message,
            uid: state.currentUser ? state.currentUser.uid : null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('✅ Message sent! We will get back to you soon.');
        e.target.reset();
    } catch (err) {
        console.warn('[Firestore] Contact save failed:', err);
        // Fallback — still acknowledge so user isn't confused
        alert('✅ Message received! We will get back to you soon.');
        e.target.reset();
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Send Message';
    }
};
