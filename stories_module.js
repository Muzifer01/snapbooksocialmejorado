/**
 * SnapBook Pro - Módulo de Historias (v6 Agrupado por Usuario estilo WhatsApp)
 * Incluye barra de progreso, temporizador, previsualización de imagen, sistema de vistas y texto.
 */
import { db, auth } from './view_global.js';
import { ref, onValue, push, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

export function initStories() {
    const storiesList = document.getElementById("stories-list");
    const uploadModal = document.getElementById("story-upload-modal");
    const viewerModal = document.getElementById("story-viewer-modal");
    const storyFile = document.getElementById("story-file");
    const storyTextInput = document.getElementById("story-text-input");
    const btnUpload = document.getElementById("btn-upload-story");
    const previewContainer = document.getElementById("preview-container");
    const fileInputLabel = document.getElementById("file-input-label");

    if (!storiesList || !uploadModal || !viewerModal) return;

    // Variables para el temporizador y navegación
    let storyTimer = null;
    let isPaused = false;
    let elapsedTime = 0;
    const STORY_DURATION = 5000; // 5 segundos por historia
    
    let currentGroupStories = [];
    let currentStoryIndex = 0;

    // Crear barra de progreso si no existe
    let progressBar = document.getElementById("story-progress-bar");
    if (!progressBar) {
        progressBar = document.createElement("div");
        progressBar.id = "story-progress-bar";
        progressBar.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            height: 3px;
            background: linear-gradient(90deg, #007aff, #00d4ff);
            width: 0%;
            z-index: 2002;
            transition: width 0.1s linear;
        `;
        viewerModal.appendChild(progressBar);
    }

    // Función para mostrar una historia específica del grupo
    function showStoryAtIndex(index) {
        if (index < 0 || index >= currentGroupStories.length) {
            closeStoryViewer();
            return;
        }

        currentStoryIndex = index;
        const s = currentGroupStories[index].data;
        const storyId = currentGroupStories[index].id;

        if (window.openStoryWithViews) {
            window.openStoryWithViews(storyId, s);
        } else {
            document.getElementById("story-img-display").src = s.image;
            document.getElementById("story-viewer-nick").innerText = s.nick;
            viewerModal.style.display = "flex";
        }
        
        startStoryTimer();
    }

    function closeStoryViewer() {
        if (storyTimer) clearInterval(storyTimer);
        viewerModal.style.display = "none";
        const viewsPanel = document.getElementById('views-panel');
        const viewsOverlay = document.getElementById('views-overlay');
        if (viewsPanel) viewsPanel.classList.remove('open');
        if (viewsOverlay) viewsOverlay.classList.remove('active');
    }

    // Función para iniciar el temporizador
    function startStoryTimer() {
        if (storyTimer) clearInterval(storyTimer);
        elapsedTime = 0;
        isPaused = false;
        progressBar.style.width = "0%";

        storyTimer = setInterval(() => {
            if (!isPaused) {
                elapsedTime += 50;
                const progress = (elapsedTime / STORY_DURATION) * 100;
                progressBar.style.width = progress + "%";

                if (elapsedTime >= STORY_DURATION) {
                    clearInterval(storyTimer);
                    // Pasar a la siguiente historia del mismo usuario
                    showStoryAtIndex(currentStoryIndex + 1);
                }
            }
        }, 50);
    }

    // Pausar/Reanudar y Navegación (Izquierda/Derecha)
    viewerModal.onmousedown = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer')) return;
        isPaused = true;
    };
    
    viewerModal.onmouseup = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer')) return;
        isPaused = false;
        
        // Navegación simple: clic izquierda (atrás), clic derecha (adelante)
        const width = window.innerWidth;
        if (e.clientX < width / 3) {
            showStoryAtIndex(currentStoryIndex - 1);
        } else if (e.clientX > (width * 2) / 3) {
            showStoryAtIndex(currentStoryIndex + 1);
        }
    };

    viewerModal.ontouchstart = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer')) return;
        isPaused = true;
    };
    
    viewerModal.ontouchend = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel') || e.target.closest('#close-viewer')) return;
        isPaused = false;
        
        const width = window.innerWidth;
        const touchX = e.changedTouches[0].clientX;
        if (touchX < width / 3) {
            showStoryAtIndex(currentStoryIndex - 1);
        } else if (touchX > (width * 2) / 3) {
            showStoryAtIndex(currentStoryIndex + 1);
        }
    };

    // Abrir/Cerrar Modales
    const openUploadBtn = document.getElementById("open-upload");
    if (openUploadBtn) {
        openUploadBtn.onclick = () => uploadModal.style.display = "flex";
    }

    const closeUploadBtn = document.getElementById("close-upload");
    if (closeUploadBtn) {
        closeUploadBtn.onclick = () => {
            uploadModal.style.display = "none";
            storyFile.value = "";
            if (storyTextInput) storyTextInput.value = "";
            previewContainer.classList.remove('active');
            fileInputLabel.classList.remove('has-image');
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
            allStories.push({ id: child.key, data: child.val() });
        });

        // Agrupar por UID
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

        // Ordenar historias dentro de cada grupo por tiempo (más antiguas primero para ver en orden)
        Object.values(groups).forEach(group => {
            group.stories.sort((a, b) => parseInt(a.data.time) - parseInt(b.data.time));
            
            // Calcular total de vistas del grupo (opcional, aquí mostramos las de la última historia o total)
            const lastStory = group.stories[group.stories.length - 1];
            const viewsCount = lastStory.data.views ? Object.keys(lastStory.data.views).length : 0;

            const item = document.createElement("div");
            item.className = "story-item";
            item.onclick = () => {
                currentGroupStories = group.stories;
                showStoryAtIndex(0);
            };
            
            item.innerHTML = `
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
                    ${viewsCount}
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
            if (!file) return alert("Selecciona una imagen");

            const text = storyTextInput ? storyTextInput.value.trim() : "";

            const originalText = btnUpload.innerText;
            btnUpload.innerText = "Publicando...";
            btnUpload.disabled = true;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const storyData = {
                    uid: user.uid,
                    nick: localStorage.getItem('nick') || "User",
                    perfil: localStorage.getItem('perfil') || "",
                    image: e.target.result,
                    text: text,
                    time: Date.now().toString(),
                    views: {}
                };
                try {
                    await push(ref(db, 'stories'), storyData);
                    uploadModal.style.display = "none";
                    storyFile.value = "";
                    if (storyTextInput) storyTextInput.value = "";
                    previewContainer.classList.remove('active');
                    fileInputLabel.classList.remove('has-image');
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
        };
    }
}
