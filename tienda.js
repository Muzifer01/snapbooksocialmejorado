import { db, auth } from './view_global.js';
import { ref, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- CARGAR DATOS DEL USUARIO ---
auth.onAuthStateChanged((user) => {
    if (user) {
        onValue(ref(db, `Users/${user.uid}`), (snap) => {
            if (snap.exists()) {
                document.getElementById('user-coins').innerText = snap.val().coins || 0;
            }
        });
    }
});

// --- NAVEGACIÓN DE PESTAÑAS ---
window.openTab = (evt, tabName) => {
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById(tabName);
    if (target) {
        target.style.display = 'block';
        evt.currentTarget.classList.add('active');
    }
};

// --- LÓGICA DE COMPRA DE MENSAJES (NUEVA) ---
window.comprarMensajes = async (cantidad, costo) => {
    const user = auth.currentUser;
    if (!user) return alert("Debes iniciar sesión para comprar.");

    const userRef = ref(db, `Users/${user.uid}`);
    const snap = await get(userRef);
    const userData = snap.val() || {};
    const misMonedas = userData.coins || 0;
    const mensajesUsados = userData.mensajesHoy || 0;

    if (misMonedas >= costo) {
        if (confirm(`¿Canjear ${costo} Coins por ${cantidad} mensajes extra?`)) {
            // Lógica: Restamos al contador de "mensajesHoy" para darle cupo nuevo.
            // Si el resultado es negativo, lo dejamos en 0.
            const nuevoContador = Math.max(0, mensajesUsados - cantidad);
            
            await update(userRef, { 
                coins: misMonedas - costo,
                mensajesHoy: nuevoContador
            });
            
            alert(`¡Éxito! Se han habilitado ${cantidad} mensajes adicionales.`);
        }
    } else {
        alert("No tienes suficientes Coins. ¡Recarga en la pestaña de Monedas!");
    }
};

// --- COMPRA DE INSIGNIAS ---
window.comprarInsignia = async (tipo, precio, emoji) => {
    const user = auth.currentUser;
    if (!user) return alert("Inicia sesión");
    
    const userRef = ref(db, `Users/${user.uid}`);
    const snap = await get(userRef);
    const coins = snap.val().coins || 0;

    if (coins >= precio) {
        if (confirm(`¿Comprar insignia ${emoji} por ${precio} coins?`)) {
            // Actualizamos monedas e insignia (premium)
            await update(userRef, { 
                coins: coins - precio, 
                premium: tipo 
            });
            alert("¡Felicidades! Ya tienes tu nueva insignia.");
        }
    } else { 
        alert("Saldo insuficiente para esta insignia."); 
    }
};

// --- MODAL DE PAGO (WHATSAPP) ---
window.abrirPopPago = (nombre, cantidad, precio) => {
    document.getElementById('m-text').innerText = `Recarga de ${cantidad}`;
    document.getElementById('pack-name').innerText = nombre;
    document.getElementById('pack-price').innerText = precio;
    
    document.getElementById('btn-comprobante').onclick = () => {
        const idUser = auth.currentUser ? auth.currentUser.uid : "INVITADO";
        const msg = encodeURIComponent(`Hola Obsidian! Acabo de pagar ${precio} por el paquete ${nombre} (${cantidad}). Mi ID de usuario es: ${idUser}. Adjunto comprobante:`);
        // Reemplaza el número 521XXXXXXXXXX por tu número real de WhatsApp
        window.location.href = `https://wa.me/521XXXXXXXXXX?text=${msg}`;
    };
    document.getElementById('custom-modal').style.display = 'flex';
};

window.cerrarPop = () => document.getElementById('custom-modal').style.display = 'none';

window.copiarClabe = () => {
    const clabe = document.getElementById('clabe-val').innerText;
    navigator.clipboard.writeText(clabe).then(() => {
        alert("CLABE copiada al portapapeles");
    });
};
