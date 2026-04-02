// view_global.js - El "Cerebro" de SnapBook (Firebase + Límites + Insignias)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- CONFIGURACIÓN DE TU FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDN89D9cljm0e8OzrPtloYOUcOY7XSXBqg",
    authDomain: "socialtest-3d114.firebaseapp.com",
    databaseURL: "https://socialtest-3d114-default-rtdb.firebaseio.com",
    projectId: "socialtest-3d114",
    storageBucket: "socialtest-3d114.firebasestorage.app",
    messagingSenderId: "779140232754",
    appId: "1:779140232754:android:8b1d492ce1970d98e26e2b"
};

const app = initializeApp(firebaseConfig);

// App Check — bloquea bots, scripts y peticiones no autorizadas
// try/catch por si ya fue inicializado desde firebase-config.js
try {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider("6Le606IsAAAANIeRgiQmQwMhl3k55X61pAB1nOA"),
        isTokenAutoRefreshEnabled: true
    });
} catch(e) { /* App Check ya inicializado */ }

const db = getDatabase(app);
const auth = getAuth(app);

// --- 1. LÓGICA DE INSIGNIAS ---
/**
 * Retorna el emoji correspondiente si el usuario ha comprado en la tienda
 */
export async function getUserBadge(uid) {
    try {
        const userRef = ref(db, `Users/${uid}`);
        const snap = await get(userRef);
        if (snap.exists()) {
            const tipo = snap.val().premium;
            if (tipo === 'verificado') return '<span style="color:#007aff; margin-left:4px;">✔️</span>';
            if (tipo === 'corona') return '<span style="color:#FFD700; margin-left:4px;">👑</span>';
            if (tipo === 'diamante') return '<span style="color:#b9f2ff; margin-left:4px;">💎</span>';
            if (tipo === 'vip') return '<span style="color:#FFD700; margin-left:4px;">⭐</span>';
        }
        return ""; 
    } catch (e) { return ""; }
}

// --- 2. SISTEMA DE LÍMITES DIARIOS ---
/**
 * Verifica si el usuario puede enviar mensajes hoy (15 para normales, Infinito para Premium)
 */
export async function canUserSendMessage(uid) {
    try {
        const userRef = ref(db, `Users/${uid}`);
        const snap = await get(userRef);
        const data = snap.val() || {};

        // Si ya compró algo (Cualquier insignia), es ilimitado
        if (data.premium && data.premium !== "") return { canSend: true };

        const hoy = new Date().toISOString().split('T')[0];
        const lastDate = data.lastMessageDate || "";
        let count = data.dailyMessageCount || 0;

        // Resetear contador si es un día nuevo
        if (lastDate !== hoy) {
            await update(userRef, { lastMessageDate: hoy, dailyMessageCount: 0 });
            return { canSend: true, remaining: 15 };
        }

        // Límite de 15 mensajes
        if (count >= 15) {
            return { 
                canSend: false, 
                message: "Límite de 15 mensajes diarios alcanzado. ¡Compra VIP o una insignia para chat ilimitado!" 
            };
        }

        return { canSend: true, remaining: 15 - count };
    } catch (e) { return { canSend: true }; }
}

/**
 * Incrementa el contador de mensajes (solo si no es premium)
 */
export async function incrementMessageCount(uid) {
    try {
        const userRef = ref(db, `Users/${uid}`);
        const snap = await get(userRef);
        if (snap.exists() && !snap.val().premium) {
            const currentCount = snap.val().dailyMessageCount || 0;
            await update(userRef, { dailyMessageCount: currentCount + 1 });
        }
    } catch (e) { console.error(e); }
}

// --- 3. LÓGICA DE RESPUESTA (REPLY) ---
let activeReply = null;
export function setReplyData(nick, text) { 
    activeReply = { replyNick: nick, replyText: text }; 
    return activeReply; 
}
export function getReplyData() { 
    const data = activeReply; 
    activeReply = null; 
    return data; 
}
export function clearReplyData() { activeReply = null; }

// --- 4. DETECCIÓN DE PLATAFORMA ---
export function getPlatformName() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("com.medicamentos")) return "APP";
    if (ua.includes("android")) return "ANDROID";
    if (ua.includes("iphone") || ua.includes("ipad")) return "IPHONE";
    return "WEB"; 
}

export { db, auth, app };