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
    
    // CORREÇÃO CRÍTICA: Função necessária para o Admin não travar
    escape: (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
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
                            resolve(blob);
                        }, file.type, quality);
                    };
                };
            } catch (e) { resolve(file); }
        });
    },

    uploadImage: async (file, path) => {
        if(!file) return null;
        const compressed = await utils.compressImage(file);
        const storageRef = ref(storage, `images/${path}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, compressed);
        return await getDownloadURL(storageRef);
    },

    deleteFile: async (url) => {
        if(!url) return;
        try {
            const fileRef = ref(storage, url);
            await deleteObject(fileRef);
        } catch(e) { console.log("Erro ao deletar arquivo", e); }
    },

    toast: (msg) => {
        const t = document.createElement('div');
        t.className = 'toast show';
        t.innerText = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    },

    showConfirm: (text, callback) => {
        const el = document.getElementById('modal-confirm');
        document.getElementById('confirm-text').innerText = text;
        el.classList.add('active');
        // Clona botões para remover listeners antigos
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        
        document.getElementById('confirm-ok').onclick = () => { callback(); document.getElementById('modal-confirm').classList.remove('active'); };
        document.getElementById('confirm-cancel').onclick = () => document.getElementById('modal-confirm').classList.remove('active');
    },

    showPrompt: (title, callback) => {
        const el = document.getElementById('modal-prompt');
        document.getElementById('prompt-title').innerText = title;
        document.getElementById('prompt-input').value = '';
        el.classList.add('active');
        
        const okBtn = document.getElementById('prompt-confirm');
        const cancelBtn = document.getElementById('prompt-cancel');
        okBtn.replaceWith(okBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));

        document.getElementById('prompt-confirm').onclick = () => { 
            callback(document.getElementById('prompt-input').value); 
            el.classList.remove('active'); 
        };
        document.getElementById('prompt-cancel').onclick = () => el.classList.remove('active');
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
    
    screen: (id) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if(el) el.classList.add('active');
        window.scrollTo(0, 0);
    },

    nav: (tab) => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        
        document.getElementById(`tab-${tab}`).classList.remove('hidden');
        const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
        if(btn) btn.classList.add('active');
        
        if(tab === 'social') window.app.loadFeed();
        if(tab === 'news') window.app.loadNews();
        if(tab === 'workouts') window.app.loadUserWorkouts(); 
        if(tab === 'health') window.app.checkHealthBadges();
        
        window.app.haptic();
    }
};
