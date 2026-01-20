import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { storage } from "./config.js";
import { state } from "./state.js";

// Funções de UI e Auxiliares
export const utils = {
    haptic: () => {
        if (navigator.vibrate) navigator.vibrate(50); 
    },

    formatText: (text) => {
        if(!text) return '';
        if (text && text.toUpperCase() === text && /[a-zA-Z]/.test(text)) {
             return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        }
        return text;
    },
    
    compressImage: (file) => {
        return new Promise((resolve) => {
            if (!file || !file.type.startsWith('image/')) {
                resolve(file);
                return;
            }
            try {
                const maxWidth = 1080; 
                const quality = 0.9;   
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;
                        if (width > maxWidth) {
                            height = Math.round(height * (maxWidth / width));
                            width = maxWidth;
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        canvas.toBlob((blob) => {
                            if (!blob) { resolve(file); return; } 
                            const newFile = new File([blob], "image.jpg", {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(newFile);
                        }, 'image/jpeg', quality);
                    };
                    img.onerror = () => resolve(file); 
                };
                reader.onerror = () => resolve(file); 
            } catch (e) {
                console.warn("Erro na compressão:", e);
                resolve(file); 
            }
        });
    },

    uploadImage: async (file, folderName) => {
        if (!file) return null;
        try {
            window.app.toast("Processando imagem...");
            
            let fileToUpload = file;
            try {
                fileToUpload = await window.app.compressImage(file);
            } catch (e) {
                console.warn("Compressão falhou, usando original", e);
            }
            
            window.app.toast("Enviando...");
            
            const ext = 'jpg';
            const safeName = `${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
            
            let path = `${folderName}/${safeName}`;
            if (state.currentUser && state.currentUser.email) {
                path = `${folderName}/${state.currentUser.email}/${safeName}`;
            }

            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, fileToUpload);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Erro no Upload:", error);
            
            let msg = "Erro ao enviar imagem.";
            if(error.code === 'storage/unauthorized') msg = "Sem permissão para enviar.";
            if(error.code === 'storage/quota-exceeded') msg = "Cota de armazenamento cheia (tente amanhã).";
            if(error.code === 'storage/retry-limit-exceeded') msg = "Internet instável. Tente novamente.";
            if(error.code === 'storage/invalid-argument') msg = "Arquivo inválido.";

            window.app.toast(msg); 
            return null;
        }
    },

    deleteFile: async (url) => {
        if (!url) return;
        try {
            const fileRef = ref(storage, url);
            await deleteObject(fileRef);
        } catch (error) {
            console.warn("Aviso ao apagar arquivo:", error.message);
        }
    },

    escape: (str) => {
        if (!str) return '';
        return str.toString().replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
    },

    screen: (id) => { 
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
        const el = document.getElementById(id); 
        if(el) el.classList.add('active'); 
    },

    nav: (tab) => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
        document.getElementById('tab-'+tab).classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        
        if(tab === 'home') window.app.renderHome();
        if(tab === 'workouts') window.app.renderWorkoutsList();
        if(tab === 'social') window.app.loadFeed();
        if(tab === 'news') window.app.loadNews();
        if(tab === 'health') window.app.loadHealthTab(); 
        
        window.app.haptic();
    },

    toast: (msg) => { 
        const t = document.getElementById('toast-container'); 
        t.innerHTML = `<div class="toast show">${msg}</div>`; 
        setTimeout(() => t.innerHTML='', 3000); 
    },
    
    showPrompt: (title, callback) => {
        const el = document.getElementById('modal-prompt');
        document.getElementById('prompt-title').innerText = title;
        const inp = document.getElementById('prompt-input');
        inp.value = '';
        el.classList.add('active');
        inp.focus();
        const okBtn = document.getElementById('prompt-confirm');
        const cancelBtn = document.getElementById('prompt-cancel');
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        document.getElementById('prompt-confirm').onclick = () => { const val = document.getElementById('prompt-input').value; if(val) callback(val); el.classList.remove('active'); };
        document.getElementById('prompt-cancel').onclick = () => el.classList.remove('active');
    },
    
    showConfirm: (text, callback) => {
        const el = document.getElementById('modal-confirm');
        document.getElementById('confirm-text').innerText = text;
        el.classList.add('active');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        document.getElementById('confirm-ok').onclick = () => { callback(); el.classList.remove('active'); };
        document.getElementById('confirm-cancel').onclick = () => el.classList.remove('active');
    },

    playVideo: (url) => {
        let embed = url;
        if (url.includes('github.com') && url.includes('/blob/')) {
            embed = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            document.getElementById('video-container').innerHTML = `<video src="${embed}" controls autoplay style="width:100%; height:100%;"></video>`;
        }
        else if(url.includes('youtu')) { 
            const id = url.split('/').pop().split('?')[0]; 
            embed = `https://www.youtube.com/embed/${id}?autoplay=1`; 
            document.getElementById('video-container').innerHTML = `<iframe src="${embed}" style="width:100%; height:100%; border:0;" allow="autoplay; fullscreen"></iframe>`; 
        } 
        else { 
            document.getElementById('video-container').innerHTML = `<video src="${url}" controls autoplay style="width:100%; height:100%;"></video>`; 
        }
        document.getElementById('modal-video').classList.add('active');
    },

    goToLogin: () => window.app.screen('view-login'),
    goToRegister: () => window.app.screen('view-register'),
    goToLanding: () => window.app.screen('view-landing'),
};
