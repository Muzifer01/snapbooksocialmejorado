import { db, auth } from './firebase-config.js?v=14';
import { ref, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. ETIQUETA DE PLATAFORMA (CON IPHONE EN COLOR CAFÉ)
function getPlatformBadge(multi) {
    if (!multi) return "";
    let badgeColor = "#5c5c5e"; 
    let platformText = multi;

    // Lógica de detección y colores
    if (/android/i.test(multi)) { 
        badgeColor = "#A4C639"; 
        platformText = "Android"; 
    }
    else if (/iphone/i.test(multi)) { 
        badgeColor = "#6F4E37"; // COLOR CAFÉ SELECCIONADO
        platformText = "iPhone"; 
    }
    else if (/mac/i.test(multi)) { 
        badgeColor = "#8E44AD"; 
        platformText = "Mac"; 
    }
    else if (/pc|windows/i.test(multi)) { 
        badgeColor = "#0078D7"; 
        platformText = "PC"; 
    }

    return `
        <div class="platform-badge" style="background:${badgeColor}; color:white; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:bold; margin-left:8px; display:inline-flex; align-items:center; text-transform:uppercase; letter-spacing:0.5px;">
            ${platformText}
        </div>`;
}

export function createPostCard(post, postId) {
    const nick = post.nick || "Usuario";
    const perfil = post.perfil || ""; 
    const text = post.text || post.mensaje || "";
    const image = post.image || "";
    const multi = post.multi || "";
    const card = document.createElement('div');
    card.className = 'post-card';
    
    // PROTECCIÓN: Bloqueo de menú contextual
    card.oncontextmenu = () => false;

    // Estructura de Avatar Protegido
    const avatarContent = perfil 
        ? `<div style="position:relative; width:40px; height:40px;">
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:2;"></div>
                <img src="${perfil}" class="post-avatar-img" draggable="false" style="user-select:none; -webkit-user-drag:none; border-radius:50%; width:100%; height:100%; object-fit:cover;">
           </div>` 
        : `<div class="post-avatar-placeholder" style="width:40px; height:40px; background:#f0f2f5; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#007AFF;">${nick.charAt(0).toUpperCase()}</div>`;

    // Estructura de Imagen de Post Protegida (Capa invisible anti-guardado)
    const imageContent = image 
        ? `<div class="img-wrapper" style="position:relative; margin-top:10px; line-height:0; overflow:hidden; border-radius:12px;">
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:5;"></div>
                <img src="${image}" class="post-published-image" draggable="false" 
                     style="width:100%; max-height:450px; object-fit:cover; user-select:none; -webkit-user-drag:none; pointer-events:none;">
           </div>` 
        : "";

    card.innerHTML = `
        <div class="post-header" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <div class="post-avatar">${avatarContent}</div>
            <div class="post-meta">
                <div style="display:flex; align-items:center;">
                    <span class="post-nick" style="font-weight:bold; color:#1c1e21;">${nick}</span>
                    ${getPlatformBadge(multi)}
                </div>
                <span class="post-time" style="font-size:11px; color:#65676b;">Reciente</span>
            </div>
        </div>
        <div class="post-body" style="padding:5px 0; color:#1c1e21; font-size:15px; user-select:none;">${text}</div>
        ${imageContent}
        <div class="post-footer" style="display:flex; gap:25px; margin-top:12px; border-top:1px solid #f0f0f0; padding-top:10px;">
            <div class="action-btn" id="like-btn-${postId}" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                <img src="https://img.icons8.com/m_rounded/512/65676b/like.png" id="like-icon-${postId}" style="width:22px;"> 
                <span id="like-count-${postId}" style="font-size:14px; font-weight:600; color:#65676b;">0</span>
            </div>
            
            <div class="action-btn" id="comment-btn-${postId}" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                <img src="https://img.icons8.com/m_rounded/512/65676b/speech-bubble.png" style="width:22px;"> 
                <span id="comment-count-${postId}" style="font-size:14px; font-weight:600; color:#65676b;">0</span>
            </div>
        </div>
    `;

    // --- LÓGICA DE LIKES (REAL-TIME) ---
    const likeRef = ref(db, `Likes/${postId}`);
    const btnLike = card.querySelector(`#like-btn-${postId}`);
    const iconLike = card.querySelector(`#like-icon-${postId}`);
    const countLike = card.querySelector(`#like-count-${postId}`);

    onValue(likeRef, (snapshot) => {
        const likes = snapshot.val() || {};
        const totalLikes = Object.keys(likes).length;
        countLike.innerText = totalLikes > 0 ? totalLikes : "0";

        const me = auth.currentUser;
        if (me && likes[me.uid]) {
            iconLike.src = "https://img.icons8.com/m_rounded/512/007AFF/like.png"; // Azul SnapBook
            countLike.style.color = "#007AFF";
        } else {
            iconLike.src = "https://img.icons8.com/m_rounded/512/65676b/like.png"; // Gris original
            countLike.style.color = "#65676b";
        }
    });

    btnLike.onclick = () => {
        const currentUser = auth.currentUser;
        if (!currentUser) return alert("Debes iniciar sesión para reaccionar");
        const myLikeRef = ref(db, `Likes/${postId}/${currentUser.uid}`);
        onValue(myLikeRef, (snapshot) => {
            if (snapshot.exists()) { 
                remove(myLikeRef); 
            } else { 
                set(myLikeRef, true); 
            }
        }, { onlyOnce: true });
    };

    // --- LÓGICA DE COMENTARIOS ---
    const commentRef = ref(db, `Comments/${postId}`);
    const countComm = card.querySelector(`#comment-count-${postId}`);
    const btnComment = card.querySelector(`#comment-btn-${postId}`);

    onValue(commentRef, (snapshot) => {
        const comments = snapshot.val() || {};
        const totalComments = Object.keys(comments).length;
        countComm.innerText = totalComments > 0 ? totalComments : "0";
    });

    btnComment.onclick = () => {
        window.location.href = `comments.html?id=${postId}`;
    };

    return card;
}