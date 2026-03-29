/**
 * SnapBook Pro - Módulo de Historias (v11 con Auto-Destrucción a 24 Horas)
 * Incluye barras de progreso, reacciones, comentarios, menciones, compartir, historias de texto, y expiración automática.
 */
import { db, auth } from './view_global.js';
import { ref, onValue, push, set, get, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Definición de fondos degradados disponibles
const BACKGROUND_GRADIENTS = {
    purple: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    pink: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    ocean: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    sunset: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    neon: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    pastel: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
};

// Constante para 24 horas en milisegundos
const STORY_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 86,400,000 ms

export function initStories() {
    const storiesList = document.getElementById("stories-list");
    const uploadModal = document.getElementById("story-upload-modal");
    const viewerModal = document.getElementById("story-viewer-modal");
    const storyFile = document.getElementById("story-file");
    const storyTextInput = document.getElementById("story-text-input");
    const btnUpload = document.getElementById("btn-upload-story");
    const previewContainer = document.getElementById("preview-container");
    const fileInputLabel = document.getElementById("file-input-label");
    const backgroundSelector = document.querySelector(".background-selector");
    const backgroundColors = document.getElementById("background-colors");
    const textPreviewContainer = document.getElementById("text-preview-container");
    const textPreview = document.getElementById("text-preview");

    if (!storiesList || !uploadModal || !viewerModal) return;

    const SEEN_STORIES_KEY = 'snapbook_seen_stories';
    let selectedBackground = null;
    let expiryCheckInterval = null;

    const getSeenStories = () => {
        try {
            return JSON.parse(localStorage.getItem(SEEN_STORIES_KEY) || '[]');
        } catch {
            return [];
        }
    };
    const saveSeenStories = (ids) => localStorage.setItem(SEEN_STORIES_KEY, JSON.stringify(ids.slice(-500)));
    const markStoryAsSeenLocally = (storyId) => {
        const seen = new Set(getSeenStories());
        seen.add(storyId);
        saveSeenStories([...seen]);
    };
    const hasSeenStory = (storyId) => getSeenStories().includes(storyId);
    const isValidStoryFile = (file) => {
        if (!file) return false;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        if (!validTypes.includes(file.type)) {
            alert('Selecciona una imagen JPG, PNG o WEBP');
            return false;
        }
        const maxSize = 3 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('La imagen es demasiado grande. Máximo 3 MB.');
            return false;
        }
        return true;
    };
    window.validateStoryFile = isValidStoryFile;

    // Función para verificar si una historia ha expirado
    function isStoryExpired(storyTime) {
        const now = Date.now();
        const storyAge = now - parseInt(storyTime);
        return storyAge > STORY_EXPIRY_TIME;
    }

    // Función para calcular tiempo restante
    function getTimeRemaining(storyTime) {
        const now = Date.now();
        const storyAge = now - parseInt(storyTime);
        const timeRemaining = STORY_EXPIRY_TIME - storyAge;

        if (timeRemaining <= 0) return null;

        const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
        const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

        if (hours > 0) {
            return `Expira en ${hours}h ${minutes}m`;
        } else {
            return `Expira en ${minutes}m`;
        }
    }

    // Función para limpiar historias expiradas de Firebase
    async function cleanExpiredStories() {
        try {
            const storiesRef = ref(db, 'stories');
            const snapshot = await get(storiesRef);

            if (!snapshot.exists()) return;

            snapshot.forEach(child => {
                const story = child.val();
                if (isStoryExpired(story.time)) {
                    // Eliminar la historia expirada
                    remove(ref(db, `stories/${child.key}`));
                }
            });
        } catch (err) {
            console.error("Error limpiando historias expiradas:", err);
        }
    }

    // Variables para el temporizador y navegación
    let storyTimer = null;
    let isPaused = false;
    let elapsedTime = 0;
    const STORY_DURATION = 5000;
    
    let currentGroupStories = [];
    let currentStoryIndex = 0;
    let currentStoryId = null;
    let currentStoryData = null;

    // Crear contenedor de barras de progreso segmentadas
    let progressBarsContainer = document.getElementById("story-progress-bars-container");
    if (!progressBarsContainer) {
        progressBarsContainer = document.createElement("div");
        progressBarsContainer.id = "story-progress-bars-container";
        progressBarsContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            display: flex;
            gap: 2px;
            padding: 2px;
            background: rgba(0, 0, 0, 0.3);
            z-index: 2002;
            flex-wrap: wrap;
            align-content: flex-start;
        `;
        viewerModal.appendChild(progressBarsContainer);
    }

    // Elementos de reacciones, comentarios y compartir
    const reactionsPanel = document.getElementById("story-reactions-panel");
    const commentPanel = document.getElementById("story-comment-panel");
    const commentInput = document.getElementById("story-comment-input");
    const btnSendComment = document.getElementById("btn-send-comment");
    const btnReactions = document.getElementById("btn-reactions");
    const btnComment = document.getElementById("btn-comment");
    const btnShareStory = document.getElementById("btn-share-story");
    const reactionsCommentsPanel = document.getElementById("reactions-comments-panel");
    const closeReactionsComments = document.getElementById("close-reactions-comments");
    const reactionsList = document.getElementById("reactions-list");
    const commentsList = document.getElementById("comments-list");
    const shareModal = document.getElementById("share-modal");
    const btnShareConfirm = document.getElementById("btn-share-confirm");
    const btnShareCancel = document.getElementById("btn-share-cancel");
    const storyExpiryTime = document.getElementById("story-expiry-time");

    // Función para detectar menciones en un texto
    function detectMentions(text) {
        const mentionRegex = /@(\w+)/g;
        return text.match(mentionRegex) || [];
    }

    // Función para resaltar menciones en HTML
    function highlightMentions(text) {
        const mentionRegex = /(@\w+)/g;
        return text.replace(mentionRegex, '<span class="mention">$1</span>');
    }

    // Función para enviar notificación de mención
    async function sendMentionNotification(mentionedNick, mentionerNick, storyId, isComment = false) {
        try {
            const usersRef = ref(db, 'Users');
            let mentionedUid = null;

            const snapshot = await get(usersRef);
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const user = child.val();
                    if (user.nick && user.nick.toLowerCase() === mentionedNick.toLowerCase()) {
                        mentionedUid = child.key;
                    }
                });
            }

            if (mentionedUid) {
                const notificationMessage = isComment 
                    ? `¡${mentionerNick} te mencionó en un comentario de historia!`
                    : `¡${mentionerNick} te mencionó en una historia!`;

                const notificationData = {
                    uid: auth.currentUser.uid,
                    nick: mentionerNick,
                    perfil: localStorage.getItem('perfil') || '',
                    text: `🔔 ${notificationMessage}`,
                    multi: "WEB",
                    time: Date.now().toString(),
                    isVerificado: false,
                    type: "mention_notification"
                };

                await push(ref(db, `messages/${mentionedUid}`), notificationData);
            }
        } catch (err) {
            console.error("Error enviando notificación de mención:", err);
        }
    }

    // Función para crear las barras segmentadas
    function createProgressBars(totalStories) {
        progressBarsContainer.innerHTML = "";
        for (let i = 0; i < totalStories; i++) {
            const bar = document.createElement("div");
            bar.className = `story-progress-segment segment-${i}`;
            bar.style.cssText = `
                flex: 1;
                height: 3px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 1.5px;
                transition: background 0.1s linear;
                min-width: 20px;
            `;
            progressBarsContainer.appendChild(bar);
        }
    }

    // Función para actualizar las barras de progreso
    function updateProgressBars(currentIndex, progress) {
        const segments = progressBarsContainer.querySelectorAll('.story-progress-segment');
        segments.forEach((segment, index) => {
            if (index < currentIndex) {
                segment.style.background = 'rgba(255, 255, 255, 0.9)';
            } else if (index === currentIndex) {
                segment.style.background = `linear-gradient(90deg, rgba(255, 255, 255, 0.9) ${progress}%, rgba(255, 255, 255, 0.3) ${progress}%)`;
            } else {
                segment.style.background = 'rgba(255, 255, 255, 0.3)';
            }
        });
    }

    // Función para cargar reacciones y comentarios
    async function loadReactionsAndComments(storyId) {
        try {
            const storyRef = ref(db, `stories/${storyId}`);
            const snapshot = await get(storyRef);
            if (!snapshot.exists()) return;

            const storyData = snapshot.val();
            const reactions = storyData.reactions || {};
            const comments = storyData.comments || {};

            const reactionsArray = Object.entries(reactions).reduce((acc, [emoji, users]) => {
                const count = Object.keys(users).length;
                acc.push({ emoji, count, users });
                return acc;
            }, []);

            if (reactionsArray.length === 0) {
                reactionsList.innerHTML = '<div class="empty-reactions">Sin reacciones aún</div>';
            } else {
                reactionsList.innerHTML = reactionsArray.map(r => 
                    `<div class="reaction-item">${r.emoji} <span class="reaction-count">${r.count}</span></div>`
                ).join('');
            }

            const commentsArray = Object.entries(comments).map(([key, comment]) => ({
                ...comment,
                id: key
            })).sort((a, b) => parseInt(b.time || 0) - parseInt(a.time || 0));

            if (commentsArray.length === 0) {
                commentsList.innerHTML = '<div class="empty-comments">Sin comentarios aún</div>';
            } else {
                commentsList.innerHTML = commentsArray.map(c => {
                    const timeAgo = formatTimeAgo(c.time);
                    const highlightedText = highlightMentions(escapeHTML(c.text));
                    const plat = (c.multi || 'WEB').toUpperCase();
                    const platformColors = { ANDROID: '#2ecc71', IPHONE: '#6F4E37', MAC: '#9b59b6', PC: '#3498db', WEB: '#3a3a3c', APP: '#e67e22' };
                    const platColor = platformColors[plat] || '#3a3a3c';
                    const likes = c.likes ? Object.keys(c.likes).length : 0;
                    const myLike = c.likes && auth.currentUser && c.likes[auth.currentUser.uid] ? 'liked' : '';
                    return `
                        <div class="comment-item" style="border-left-color:${platColor};">
                            <div class="comment-nick" style="color:${platColor};">💬 ${escapeHTML(c.nick || 'Usuario')} <span style="font-size:10px;color:#8e8e93;">${plat}</span></div>
                            <div class="comment-text">${highlightedText}</div>
                            <div class="comment-actions">
                                <button class="comment-like-btn ${myLike}" data-comment-id="${c.id}" data-story-id="${storyId}">❤️ ${likes}</button>
                                <button class="comment-reply-btn" data-comment-id="${c.id}">💬 Responder</button>
                            </div>
                            <div class="comment-time">${timeAgo}</div>
                            ${c.replies ? Object.entries(c.replies).map(([rkey, r]) => `
                                <div class="comment-reply-item">
                                    <div class="comment-nick" style="font-size:12px;color:#00d4ff;">↳ ${escapeHTML(r.nick || 'Usuario')}</div>
                                    <div class="comment-text" style="font-size:13px;">${highlightMentions(escapeHTML(r.text))}</div>
                                    <div class="comment-time">${formatTimeAgo(r.time)}</div>
                                </div>
                            `).join('') : ''}
                        </div>
                    `;
                }).join('');
                
                // Event listeners para likes
                commentsList.querySelectorAll('.comment-like-btn').forEach(btn => {
                    btn.onclick = async () => {
                        const commentId = btn.dataset.commentId;
                        const storyIdData = btn.dataset.storyId;
                        if (!auth.currentUser) return;
                        const likeRef = ref(db, `stories/${storyIdData}/comments/${commentId}/likes/${auth.currentUser.uid}`);
                        const snap = await get(likeRef);
                        if (snap.exists()) {
                            await remove(likeRef);
                        } else {
                            await set(likeRef, true);
                        }
                        await loadReactionsAndComments(storyIdData);
                    };
                });
                
                // Event listeners para responder
                commentsList.querySelectorAll('.comment-reply-btn').forEach(btn => {
                    btn.onclick = () => {
                        const text = prompt('Escribe tu respuesta:');
                        if (!text || !auth.currentUser) return;
                        const commentId = btn.dataset.commentId;
                        const replyRef = ref(db, `stories/${storyId}/comments/${commentId}/replies`);
                        push(replyRef, {
                            uid: auth.currentUser.uid,
                            nick: localStorage.getItem('nick') || 'Usuario',
                            text: text,
                            time: Date.now().toString()
                        }).then(() => loadReactionsAndComments(storyId));
                    };
                });
            }
        } catch (err) {
            console.error("Error cargando reacciones y comentarios:", err);
        }
    }

    // Función para enviar reacción
    async function sendReaction(emoji) {
        if (!currentStoryId || !auth.currentUser) return;

        try {
            const user = auth.currentUser;
            const reactionRef = ref(db, `stories/${currentStoryId}/reactions/${emoji}/${user.uid}`);
            await set(reactionRef, {
                nick: localStorage.getItem('nick') || 'Usuario',
                time: Date.now().toString()
            });

            reactionsPanel.classList.remove('active');
            await loadReactionsAndComments(currentStoryId);
        } catch (err) {
            console.error("Error al enviar reacción:", err);
        }
    }

    // Función para enviar comentario
    async function sendComment() {
        const text = commentInput.value.trim();
        if (!text || !currentStoryId || !auth.currentUser) return;

        try {
            const user = auth.currentUser;
            const nick = localStorage.getItem('nick') || 'Usuario';
            const perfil = localStorage.getItem('perfil') || '';

            const mentions = detectMentions(text);
            
            // Obtener plataforma del usuario
            const userRef = ref(db, `Users/${user.uid}`);
            const userSnap = await get(userRef);
            const userData = userSnap.val() || {};
            const multi = userData.multi || 'WEB';

            const commentData = {
                uid: user.uid,
                nick: nick,
                perfil: perfil,
                text: text,
                multi: multi,
                time: Date.now().toString(),
                likes: {},
                replies: {}
            };

            const commentRef = ref(db, `stories/${currentStoryId}/comments`);
            await push(commentRef, commentData);

            const chatCommentData = {
                uid: user.uid,
                nick: nick,
                perfil: perfil,
                text: `💬 ${text} (comentario en historia)`,
                multi: "WEB",
                time: Date.now().toString(),
                isVerificado: false
            };
            await push(ref(db, 'chatglobar'), chatCommentData);

            if (currentStoryData && currentStoryData.uid !== user.uid) {
                const privateMessageData = {
                    uid: user.uid,
                    nick: nick,
                    perfil: perfil,
                    text: `💬 ${text} (comentario en tu historia)`,
                    multi: "WEB",
                    time: Date.now().toString(),
                    isVerificado: false,
                    recipientUid: currentStoryData.uid
                };
                await push(ref(db, `messages/${currentStoryData.uid}`), privateMessageData);
            }

            for (const mention of mentions) {
                const mentionedNick = mention.substring(1);
                await sendMentionNotification(mentionedNick, nick, currentStoryId, true);
            }

            commentInput.value = "";
            commentPanel.classList.remove('active');
            await loadReactionsAndComments(currentStoryId);
        } catch (err) {
            console.error("Error al enviar comentario:", err);
            alert("Error al enviar comentario");
        }
    }

    // Función para compartir historia en el chat
    async function shareStoryToChat() {
        if (!currentStoryData || !auth.currentUser) return;

        try {
            const user = auth.currentUser;
            const nick = localStorage.getItem('nick') || 'Usuario';
            const perfil = localStorage.getItem('perfil') || '';

            const shareMessage = {
                uid: user.uid,
                nick: nick,
                perfil: perfil,
                text: `📸 Compartió una historia: ${currentStoryData.text || 'Sin descripción'}`,
                multi: "WEB",
                time: Date.now().toString(),
                isVerificado: false,
                storyImage: currentStoryData.image,
                storyId: currentStoryId
            };

            await push(ref(db, 'chatglobar'), shareMessage);

            showShareToast("✈️ Historia compartida en el chat");
            shareModal.style.display = "none";
        } catch (err) {
            console.error("Error al compartir historia:", err);
            alert("Error al compartir");
        }
    }

    // Función para mostrar notificación de compartir
    function showShareToast(message) {
        const toast = document.createElement("div");
        toast.className = "share-toast";
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    // Función para mostrar una historia específica del grupo
    function showStoryAtIndex(index) {
        if (index < 0 || index >= currentGroupStories.length) {
            closeStoryViewer();
            return;
        }

        currentStoryIndex = index;
        const s = currentGroupStories[index].data;
        currentStoryId = currentGroupStories[index].id;
        currentStoryData = s;
        window._currentStoryData = s;
        markStoryAsSeenLocally(currentStoryId);

        // Verificar si la historia ha expirado
        if (isStoryExpired(s.time)) {
            alert("Esta historia ha expirado");
            closeStoryViewer();
            return;
        }

        createProgressBars(currentGroupStories.length);

        reactionsPanel.classList.remove('active');
        commentPanel.classList.remove('active');
        reactionsCommentsPanel.classList.remove('open');
        shareModal.style.display = "none";

        // Detectar si es una historia de texto o de imagen
        if (s.isTextStory && s.backgroundColor) {
            const storyImgDisplay = document.getElementById("story-img-display");
            storyImgDisplay.style.display = "none";
            
            let textOnlyElement = document.getElementById("story-text-only-display");
            if (!textOnlyElement) {
                textOnlyElement = document.createElement("div");
                textOnlyElement.id = "story-text-only-display";
                textOnlyElement.className = "story-text-only";
                viewerModal.appendChild(textOnlyElement);
            }
            textOnlyElement.style.background = s.backgroundColor;
            textOnlyElement.textContent = s.text;
            textOnlyElement.style.display = "flex";
        } else {
            const textOnlyElement = document.getElementById("story-text-only-display");
            if (textOnlyElement) textOnlyElement.style.display = "none";
            
            const storyImgDisplay = document.getElementById("story-img-display");
            storyImgDisplay.src = s.image;
            storyImgDisplay.style.display = "block";
        }

        document.getElementById("story-viewer-nick").innerText = s.nick;

        // Mostrar tiempo restante
        const timeRemaining = getTimeRemaining(s.time);
        if (storyExpiryTime) {
            storyExpiryTime.textContent = timeRemaining || "Expirando...";
        }

        if (window.openStoryWithViews) {
            window.openStoryWithViews(currentStoryId, s);
        } else {
            viewerModal.style.display = "flex";
        }

        // Mostrar encuesta si existe
        const pollOverlay = document.getElementById('story-poll-overlay');
        if (pollOverlay && s.poll) {
            pollOverlay.innerHTML = `
                <div class="poll-question">${escapeHTML(s.poll.question)}</div>
                ${s.poll.options.map((opt, i) => {
                    const votes = s.poll.votes && s.poll.votes[i] ? Object.keys(s.poll.votes[i]).length : 0;
                    const totalVotes = s.poll.options.reduce((sum, _, idx) => sum + (s.poll.votes && s.poll.votes[idx] ? Object.keys(s.poll.votes[idx]).length : 0), 0);
                    const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    const hasVoted = s.poll.votes && s.poll.votes[i] && auth.currentUser && s.poll.votes[i][auth.currentUser.uid];
                    return `
                        <div class="poll-option ${hasVoted ? 'voted' : ''}" onclick="votePoll('${currentStoryId}', ${i})">
                            <span class="poll-option-text">${escapeHTML(opt)}</span>
                            <span class="poll-option-percent">${percent}%</span>
                            <div class="poll-bar"><div class="poll-bar-fill" style="width:${percent}%"></div></div>
                        </div>
                    `;
                }).join('')}
            `;
            pollOverlay.style.display = 'block';
        } else if (pollOverlay) {
            pollOverlay.style.display = 'none';
        }
        
        // Mostrar cuenta regresiva si existe
        const countdownOverlay = document.getElementById('story-countdown-overlay');
        if (countdownOverlay && s.countdown) {
            countdownOverlay.innerHTML = `
                <div class="countdown-label">${escapeHTML(s.countdown.title)}</div>
                <div class="countdown-timer" id="countdown-timer"></div>
            `;
            countdownOverlay.style.display = 'block';
            updateCountdown(s.countdown.datetime);
        } else if (countdownOverlay) {
            countdownOverlay.style.display = 'none';
        }
        
        // Mostrar pregúntame si existe
        const askmeOverlay = document.getElementById('story-askme-overlay');
        if (askmeOverlay && s.askme) {
            askmeOverlay.innerHTML = `
                <div class="askme-prompt">${escapeHTML(s.askme.prompt)}</div>
                <div class="askme-input-row">
                    <input type="text" class="askme-input" id="askme-answer" placeholder="Tu respuesta..." maxlength="100">
                    <button class="askme-send-btn" onclick="sendAskmeAnswer('${currentStoryId}')">Enviar</button>
                </div>
            `;
            askmeOverlay.style.display = 'block';
        } else if (askmeOverlay) {
            askmeOverlay.style.display = 'none';
        }

        const storyTextDisplay = document.getElementById("story-text-display");
        if (storyTextDisplay && s.text && !s.isTextStory) {
            storyTextDisplay.innerHTML = highlightMentions(escapeHTML(s.text));
        }
        
        loadReactionsAndComments(currentStoryId);
        startStoryTimer();
    }

    function closeStoryViewer() {
        if (storyTimer) clearInterval(storyTimer);
        viewerModal.style.display = "none";
        const viewsPanel = document.getElementById('views-panel');
        const viewsOverlay = document.getElementById('views-overlay');
        if (viewsPanel) viewsPanel.classList.remove('open');
        if (viewsOverlay) viewsOverlay.classList.remove('active');
        reactionsPanel.classList.remove('active');
        commentPanel.classList.remove('active');
        reactionsCommentsPanel.classList.remove('open');
        shareModal.style.display = "none";
        currentStoryId = null;
        currentStoryData = null;
    }

    // Función para iniciar el temporizador
    function startStoryTimer() {
        if (storyTimer) clearInterval(storyTimer);
        elapsedTime = 0;
        isPaused = false;
        updateProgressBars(currentStoryIndex, 0);

        storyTimer = setInterval(() => {
            if (!isPaused) {
                elapsedTime += 50;
                const progress = (elapsedTime / STORY_DURATION) * 100;
                updateProgressBars(currentStoryIndex, progress);

                if (elapsedTime >= STORY_DURATION) {
                    clearInterval(storyTimer);
                    showStoryAtIndex(currentStoryIndex + 1);
                }
            }
        }, 50);
    }

    // Pausar/Reanudar y Navegación (Izquierda/Derecha)
    viewerModal.onmousedown = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer') || e.target.closest('#btn-reactions') || e.target.closest('#btn-comment') || e.target.closest('#btn-share-story') || e.target.closest('.story-reactions-panel') || e.target.closest('.story-comment-panel')) return;
        isPaused = true;
    };
    
    viewerModal.onmouseup = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer') || e.target.closest('#btn-reactions') || e.target.closest('#btn-comment') || e.target.closest('#btn-share-story') || e.target.closest('.story-reactions-panel') || e.target.closest('.story-comment-panel')) return;
        isPaused = false;
        
        const width = window.innerWidth;
        if (e.clientX < width / 3) {
            showStoryAtIndex(currentStoryIndex - 1);
        } else if (e.clientX > (width * 2) / 3) {
            showStoryAtIndex(currentStoryIndex + 1);
        }
    };

    viewerModal.ontouchstart = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer') || e.target.closest('#btn-reactions') || e.target.closest('#btn-comment') || e.target.closest('#btn-share-story') || e.target.closest('.story-reactions-panel') || e.target.closest('.story-comment-panel')) return;
        isPaused = true;
    };
    
    viewerModal.ontouchend = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer') || e.target.closest('#btn-reactions') || e.target.closest('#btn-comment') || e.target.closest('#btn-share-story') || e.target.closest('.story-reactions-panel') || e.target.closest('.story-comment-panel')) return;
        isPaused = false;
        
        const width = window.innerWidth;
        const touchX = e.changedTouches[0].clientX;
        if (touchX < width / 3) {
            showStoryAtIndex(currentStoryIndex - 1);
        } else if (touchX > (width * 2) / 3) {
            showStoryAtIndex(currentStoryIndex + 1);
        }
    };

    // Event listeners para reacciones y comentarios
    if (btnReactions) {
        btnReactions.onclick = () => {
            reactionsPanel.classList.toggle('active');
            commentPanel.classList.remove('active');
        };
    }

    if (btnComment) {
        btnComment.onclick = () => {
            commentPanel.classList.toggle('active');
            reactionsPanel.classList.remove('active');
            if (commentPanel.classList.contains('active')) {
                commentInput.focus();
            }
        };
    }

    if (btnShareStory) {
        btnShareStory.onclick = () => {
            shareModal.style.display = "flex";
        };
    }

    if (btnSendComment) {
        btnSendComment.onclick = sendComment;
        commentInput.onkeypress = (e) => {
            if (e.key === 'Enter') sendComment();
        };
    }

    if (btnShareConfirm) {
        btnShareConfirm.onclick = shareStoryToChat;
    }

    if (btnShareCancel) {
        btnShareCancel.onclick = () => {
            shareModal.style.display = "none";
        };
    }

    const emojiButtons = document.querySelectorAll('.emoji-btn');
    emojiButtons.forEach(btn => {
        btn.onclick = async () => {
            const emoji = btn.getAttribute('data-emoji');
            await sendReaction(emoji);
        };
    });

    if (closeReactionsComments) {
        closeReactionsComments.onclick = () => {
            reactionsCommentsPanel.classList.remove('open');
        };
    }

    // --- SELECTOR DE FONDOS PARA HISTORIAS DE TEXTO ---
    const bgColorButtons = document.querySelectorAll('.bg-color-btn');
    bgColorButtons.forEach(btn => {
        btn.onclick = () => {
            bgColorButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedBackground = btn.getAttribute('data-bg');
            
            if (storyTextInput.value.trim()) {
                textPreviewContainer.style.display = "flex";
                textPreview.style.background = selectedBackground;
                textPreview.textContent = storyTextInput.value;
            }
        };
    });

    storyTextInput.oninput = () => {
        if (selectedBackground && storyTextInput.value.trim()) {
            textPreviewContainer.style.display = "flex";
            textPreview.style.background = selectedBackground;
            textPreview.textContent = storyTextInput.value;
        } else {
            textPreviewContainer.style.display = "none";
        }
    };

    fileInputLabel.onclick = () => storyFile.click();
    const btnChangeImage = document.getElementById("btn-change-image");
    if (btnChangeImage) {
        btnChangeImage.onclick = () => storyFile.click();
    }

    storyFile.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (window.validateStoryFile && !window.validateStoryFile(file)) {
                storyFile.value = '';
                previewContainer.classList.remove('active');
                fileInputLabel.classList.remove('has-image');
                backgroundSelector.classList.remove('active');
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById("preview-image").src = event.target.result;
                previewContainer.classList.add('active');
                fileInputLabel.classList.add('has-image');
                backgroundSelector.classList.remove('active');
                textPreviewContainer.style.display = "none";
                selectedBackground = null;
            };
            reader.readAsDataURL(file);
        }
    };

    // Abrir/Cerrar Modales
    const openUploadBtn = document.getElementById("open-upload");
    if (openUploadBtn) {
        openUploadBtn.onclick = () => {
            uploadModal.style.display = "flex";
            backgroundSelector.classList.add('active');
        };
    }

    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) uploadModal.style.display = 'none';
    });

    const closeUploadBtn = document.getElementById("close-upload");
    if (closeUploadBtn) {
        closeUploadBtn.onclick = () => {
            uploadModal.style.display = "none";
            storyFile.value = "";
            if (storyTextInput) storyTextInput.value = "";
            previewContainer.classList.remove('active');
            fileInputLabel.classList.remove('has-image');
            backgroundSelector.classList.remove('active');
            textPreviewContainer.style.display = "none";
            selectedBackground = null;
            bgColorButtons.forEach(b => b.classList.remove('selected'));
        };
    }

    const closeViewerBtn = document.getElementById("close-viewer");
    if (closeViewerBtn) {
        closeViewerBtn.onclick = closeStoryViewer;
    }

    // Escuchar Historias en Firebase y Agrupar por Usuario
    onValue(ref(db, 'stories'), (snap) => {
        const addBtn = document.getElementById("open-upload");
        storiesList.innerHTML = "";
        if (addBtn) storiesList.appendChild(addBtn);

        if (!snap.exists()) return;

        const allStories = [];
        snap.forEach(child => {
            const story = child.val();
            // Filtrar historias expiradas
            if (!isStoryExpired(story.time)) {
                allStories.push({ id: child.key, data: story });
            }
        });

        const groups = {};
        allStories.forEach(s => {
            const uid = s.data.uid;
            if (!groups[uid]) {
                groups[uid] = {
                    uid: uid,
                    nick: s.data.nick,
                    perfil: s.data.perfil,
                    stories: []
                };
            }
            groups[uid].stories.push(s);
        });

        const orderedGroups = Object.values(groups)
            .map(group => {
                group.stories.sort((a, b) => parseInt(a.data.time) - parseInt(b.data.time));
                const lastStory = group.stories[group.stories.length - 1];
                const viewsCount = lastStory.data.views ? Object.keys(lastStory.data.views).length : 0;
                const unseenCount = group.stories.filter(story => !hasSeenStory(story.id)).length;
                return { ...group, lastStory, viewsCount, unseenCount };
            })
            .sort((a, b) => {
                if ((a.unseenCount > 0) !== (b.unseenCount > 0)) return a.unseenCount > 0 ? -1 : 1;
                return parseInt(b.lastStory.data.time || 0) - parseInt(a.lastStory.data.time || 0);
            });

        orderedGroups.forEach(group => {
            const item = document.createElement("div");
            item.className = `story-item ${group.unseenCount === 0 ? 'seen' : ''} ${group.stories.length > 1 ? 'has-multiple' : ''}`;
            item.onclick = () => {
                currentGroupStories = group.stories;
                const firstUnseenIndex = group.stories.findIndex(story => !hasSeenStory(story.id));
                showStoryAtIndex(firstUnseenIndex >= 0 ? firstUnseenIndex : 0);
            };
            
            item.innerHTML = `
                <span class="story-count-badge">${group.stories.length}</span>
                <div class="story-avatar-wrapper">
                    <div class="story-avatar-inner">
                        <img src="${group.perfil || 'https://www.w3schools.com/howto/img_avatar.png'}" onerror="this.src='https://www.w3schools.com/howto/img_avatar.png'">
                    </div>
                </div>
                <div class="story-label">${group.nick}</div>
                <div class="story-views-badge">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                    ${group.viewsCount}
                </div>
            `;
            storiesList.appendChild(item);
        });
    });

    // Subir Historia
    if (btnUpload) {
        btnUpload.onclick = async () => {
            const user = auth.currentUser;
            if (!user) return alert("Debes estar conectado");
            
            const file = storyFile.files[0];
            const text = storyTextInput ? storyTextInput.value.trim() : "";

            if (!file && !text) return alert("Selecciona una imagen o escribe un texto");
            if (file && !isValidStoryFile(file)) return;

            const mentions = detectMentions(text);
            
            // Obtener datos del editor (filtros, encuesta, etc)
            const editorData = window.getEditorData ? window.getEditorData() : {};

            const originalText = btnUpload.innerText;
            btnUpload.innerText = "Publicando...";
            btnUpload.disabled = true;

            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    let imageData = e.target.result;
                    // Si hay imagen editada (con dibujo), usar esa
                    if (editorData.editedImage) imageData = editorData.editedImage;
                    
                    const storyData = {
                        uid: user.uid,
                        nick: localStorage.getItem('nick') || "User",
                        perfil: localStorage.getItem('perfil') || "",
                        image: imageData,
                        text: text,
                        time: Date.now().toString(),
                        views: {},
                        reactions: {},
                        comments: {},
                        isTextStory: false,
                        filter: editorData.filter,
                        poll: editorData.poll,
                        countdown: editorData.countdown,
                        askme: editorData.askme,
                        highlighted: false
                    };
                    try {
                        await push(ref(db, 'stories'), storyData);
                        
                        // Limpiar historias expiradas
                        await cleanExpiredStories();

                        const nick = localStorage.getItem('nick') || "User";
                        for (const mention of mentions) {
                            const mentionedNick = mention.substring(1);
                            await sendMentionNotification(mentionedNick, nick, null, false);
                        }

                        uploadModal.style.display = "none";
                        storyFile.value = "";
                        if (storyTextInput) storyTextInput.value = "";
                        previewContainer.classList.remove('active');
                        fileInputLabel.classList.remove('has-image');
                        backgroundSelector.classList.remove('active');
                        textPreviewContainer.style.display = "none";
                        selectedBackground = null;
                        bgColorButtons.forEach(b => b.classList.remove('selected'));
                        alert("¡Historia publicada!");
                        btnUpload.innerText = originalText;
                        btnUpload.disabled = false;
                    } catch (err) {
                        console.error("Error al subir historia:", err);
                        alert("Error al publicar");
                        btnUpload.innerText = originalText;
                        btnUpload.disabled = false;
                    }
                };
                reader.readAsDataURL(file);
            } else {
                if (!selectedBackground) return alert("Selecciona un fondo para tu historia de texto");

                const storyData = {
                    uid: user.uid,
                    nick: localStorage.getItem('nick') || "User",
                    perfil: localStorage.getItem('perfil') || "",
                    text: text,
                    backgroundColor: selectedBackground,
                    time: Date.now().toString(),
                    views: {},
                    reactions: {},
                    comments: {},
                    isTextStory: true
                };

                try {
                    await push(ref(db, 'stories'), storyData);
                    
                    // Limpiar historias expiradas
                    await cleanExpiredStories();

                    const nick = localStorage.getItem('nick') || "User";
                    for (const mention of mentions) {
                        const mentionedNick = mention.substring(1);
                        await sendMentionNotification(mentionedNick, nick, null, false);
                    }

                    uploadModal.style.display = "none";
                    if (storyTextInput) storyTextInput.value = "";
                    backgroundSelector.classList.remove('active');
                    textPreviewContainer.style.display = "none";
                    selectedBackground = null;
                    bgColorButtons.forEach(b => b.classList.remove('selected'));
                    alert("¡Historia publicada!");
                    btnUpload.innerText = originalText;
                    btnUpload.disabled = false;
                } catch (err) {
                    console.error("Error al subir historia:", err);
                    alert("Error al publicar");
                    btnUpload.innerText = originalText;
                    btnUpload.disabled = false;
                }
            }
        };
    }
}

// Funciones auxiliares
const formatTimeAgo = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - parseInt(ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora mismo";
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs} h`;
    return `Hace ${Math.floor(hrs / 24)} d`;
};

const escapeHTML = (value = '') => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

window.formatTimeAgo = formatTimeAgo;
window.escapeHTML = escapeHTML;


// Funciones globales para encuestas, countdown, pregúntame
window.votePoll = async (storyId, optionIndex) => {
    if (!auth.currentUser) return alert('Debes estar conectado');
    const voteRef = ref(db, `stories/${storyId}/poll/votes/${optionIndex}/${auth.currentUser.uid}`);
    await set(voteRef, true);
    // Recargar historia
    const storyRef = ref(db, `stories/${storyId}`);
    const snap = await get(storyRef);
    if (snap.exists()) {
        const s = snap.val();
        window._currentStoryData = s;
    }
};

window.updateCountdown = (targetTime) => {
    const timer = document.getElementById('countdown-timer');
    if (!timer) return;
    const update = () => {
        const now = Date.now();
        const diff = targetTime - now;
        if (diff <= 0) {
            timer.innerHTML = '<div class="countdown-unit"><div class="countdown-number">¡YA!</div></div>';
            return;
        }
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        timer.innerHTML = `
            ${days > 0 ? `<div class="countdown-unit"><div class="countdown-number">${days}</div><div class="countdown-text">Días</div></div>` : ''}
            <div class="countdown-unit"><div class="countdown-number">${hours}</div><div class="countdown-text">Horas</div></div>
            <div class="countdown-unit"><div class="countdown-number">${minutes}</div><div class="countdown-text">Min</div></div>
            <div class="countdown-unit"><div class="countdown-number">${seconds}</div><div class="countdown-text">Seg</div></div>
        `;
    };
    update();
    setInterval(update, 1000);
};

window.sendAskmeAnswer = async (storyId) => {
    const input = document.getElementById('askme-answer');
    if (!input || !input.value.trim() || !auth.currentUser) return;
    
    const answerRef = ref(db, `stories/${storyId}/askme/answers`);
    await push(answerRef, {
        uid: auth.currentUser.uid,
        nick: localStorage.getItem('nick') || 'Usuario',
        text: input.value.trim(),
        time: Date.now().toString()
    });
    input.value = '';
    alert('¡Respuesta enviada!');
};

// Botón destacar historia
const btnHighlight = document.getElementById('btn-highlight');
if (btnHighlight) {
    btnHighlight.onclick = async () => {
        if (!currentStoryId || !auth.currentUser) return;
        const highlightRef = ref(db, `stories/${currentStoryId}/highlighted`);
        const snap = await get(highlightRef);
        if (snap.exists()) {
            await remove(highlightRef);
            btnHighlight.classList.remove('saved');
        } else {
            await set(highlightRef, {
                uid: auth.currentUser.uid,
                time: Date.now().toString()
            });
            btnHighlight.classList.add('saved');
        }
    };
}

// Reacciones animadas (emojis voladores)
window.createFlyingReaction = (emoji, sourceEl) => {
    const el = document.createElement('div');
    el.className = 'flying-emoji';
    el.textContent = emoji;
    const rect = sourceEl.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
};

// Actualizar emoji buttons para crear animación
if (document.querySelectorAll('.emoji-btn')) {
    document.querySelectorAll('.emoji-btn').forEach(btn => {
        const originalOnclick = btn.onclick;
        btn.onclick = async function() {
            const emoji = this.getAttribute('data-emoji');
            window.createFlyingReaction(emoji, this);
            if (originalOnclick) await originalOnclick.call(this);
        };
    });
}
