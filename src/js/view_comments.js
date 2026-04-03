import { db, auth } from './firebase-config.js?v=14';
import { ref, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { createCommentItem } from './view_comments.js'; 

// 1. Obtener ID del post
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

const listContainer = document.getElementById('comments-list');
const inputComment = document.getElementById('input-comment');
const btnSend = document.getElementById('btn-send-comment');

if (!postId) {
    alert("Post no encontrado");
    window.location.href = "index.html";
}

// --- DETECTOR MEJORADO (Igual al Chat Global) ---
function getPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    // Forzamos la detección de Android incluso en navegador móvil
    if (ua.includes("android")) return "ANDROID"; 
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "IPHONE";
    if (ua.includes("macintosh") || ua.includes("mac os")) return "MAC";
    return "PC";
}

// --- LECTURA EN TIEMPO REAL ---
const commentsRef = ref(db, `Comments/${postId}`);
onValue(commentsRef, (snapshot) => {
    listContainer.innerHTML = ""; 
    
    if (snapshot.exists()) {
        snapshot.forEach((child) => {
            const data = child.val();
            // Pasamos el objeto a view_comments.js para que pinte el color verde si es ANDROID
            const commentElement = createCommentItem(data);
            listContainer.appendChild(commentElement);
        });
        
        const scrollArea = document.getElementById('main-scroll');
        if(scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
    } else {
        listContainer.innerHTML = `<p style="color:#8E8E93; text-align:center; margin-top:40px; font-size:14px;">No hay comentarios todavía.</p>`;
    }
});

// --- LÓGICA DE ENVÍO ACTUALIZADA ---
btnSend.onclick = async () => {
    const textValue = inputComment.value.trim();
    const user = auth.currentUser;

    if (!user) return alert("Inicia sesión para comentar");
    if (!textValue) return; 

    try {
        const newCommentRef = push(ref(db, `Comments/${postId}`));
        const commentId = newCommentRef.key;

        // Estructura de MAP exacta para que no salga 'undefined'
        const commentData = {
            comment_id: commentId,
            nick: localStorage.getItem('nick') || "Usuario",
            perfil: localStorage.getItem('perfil') || "",
            uid: user.uid,
            text: textValue, // Aseguramos que se guarde como 'text'
            time: Date.now().toString(),
            multi: getPlatform() // Aquí enviará "ANDROID" si estás en el cel
        };

        await set(newCommentRef, commentData);
        inputComment.value = "";
        
    } catch (error) {
        console.error("Error al enviar:", error);
    }
};

inputComment.addEventListener("keypress", (e) => {
    if (e.key === "Enter") btnSend.click();
});