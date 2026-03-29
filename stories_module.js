/**
 * SnapBook Pro - Módulo de Historias (v5 con Texto, Vistas y Contador)
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

    // Variables para el temporizador
    let storyTimer = null;
    let isPaused = false;
    let elapsedTime = 0;
    const STORY_DURATION = 5000; // 5 segundos

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
                    viewerModal.style.display = "none";
                    // Limpiar panel de vistas al cerrar automáticamente
                    const viewsPanel = document.getElementById('views-panel');
                    const viewsOverlay = document.getElementById('views-overlay');
                    if (viewsPanel) viewsPanel.classList.remove('open');
                    if (viewsOverlay) viewsOverlay.classList.remove('active');
                }
            }
        }, 50);
    }

    // Pausar/Reanudar al tocar (evitar pausar si se toca el botón de vistas o el panel)
    viewerModal.onmousedown = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel')) return;
        isPaused = true;
    };
    viewerModal.onmouseup = () => {
        isPaused = false;
    };
    viewerModal.ontouchstart = (e) => {
        if (e.target.closest('#btn-show-views') || e.target.closest('#views-panel')) return;
        isPaused = true;
    };
    viewerModal.ontouchend = () => {
        isPaused = false;
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
        closeViewerBtn.onclick = () => {
            if (storyTimer) clearInterval(storyTimer);
            viewerModal.style.display = "none";
            // Cerrar panel de vistas si está abierto
            const viewsPanel = document.getElementById('views-panel');
            const viewsOverlay = document.getElementById('views-overlay');
            if (viewsPanel) viewsPanel.classList.remove('open');
            if (viewsOverlay) viewsOverlay.classList.remove('active');
        };
    }

    // Escuchar Historias en Firebase
    onValue(ref(db, 'stories'), (snap) => {
        // Limpiar lista manteniendo el botón de añadir
        const addBtn = document.getElementById("open-upload");
        storiesList.innerHTML = "";
        if (addBtn) storiesList.appendChild(addBtn);

        if (!snap.exists()) return;

        snap.forEach(child => {
            const s = child.val();
            const storyId = child.key;
            const viewsCount = s.views ? Object.keys(s.views).length : 0;

            const item = document.createElement("div");
            item.className = "story-item";
            item.onclick = () => {
                // Usar la función global definida en chatglobal.html para manejar vistas y texto
                if (window.openStoryWithViews) {
                    window.openStoryWithViews(storyId, s);
                    startStoryTimer();
                } else {
                    // Fallback si la función no existe
                    if (storyTimer) clearInterval(storyTimer);
                    document.getElementById("story-img-display").src = s.image;
                    document.getElementById("story-viewer-nick").innerText = s.nick;
                    viewerModal.style.display = "flex";
                    startStoryTimer();
                }
            };
            item.innerHTML = `
                <div class="story-avatar-wrapper">
                    <div class="story-avatar-inner">
                        <img src="${s.perfil || 'https://www.w3schools.com/howto/img_avatar.png'}" onerror="this.src='https://www.w3schools.com/howto/img_avatar.png'">
                    </div>
                </div>
                <div class="story-label">${s.nick}</div>
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
                    text: text, // Guardar el texto de la historia
                    time: Date.now().toString(),
                    views: {} // Inicializar objeto de vistas vacío
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
