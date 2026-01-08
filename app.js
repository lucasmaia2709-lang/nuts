import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, onSnapshot, updateDoc, deleteDoc, arrayUnion, arrayRemove, query, limit, startAfter, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- ÁREA DE CONFIGURAÇÃO ---
const firebaseConfig = { 
    apiKey: "AIzaSyDti6glq6Yw_mz_RV8JC167wPyOkbSDs-s", 
    authDomain: "nuts-aea26.firebaseapp.com", 
    projectId: "nuts-aea26", 
    storageBucket: "nuts-aea26.firebasestorage.app", 
    messagingSenderId: "790944551064", 
    appId: "1:790944551064:web:eec0a496c599a58cc040ed" 
};

window.addEventListener('load', () => {
  document.body.style.height = '100vh';

  requestAnimationFrame(() => {
    document.body.style.height = '100dvh';
  });
});


// INICIALIZAÇÃO
const appInit = initializeApp(firebaseConfig);
const auth = getAuth(appInit);
const db = getFirestore(appInit);
const storage = getStorage(appInit);

// ID do App
const appId = 'nuts-app-v1'; 

// URL DO CLOUDFLARE WORKER
const CF_WORKER_URL = "https://nuts.lucasabreucotefis.workers.dev"; 

// CONSTANTES E CONFIGURAÇÕES
const C_USERS = 'expliq_users_v9';
const C_POSTS = 'expliq_posts_v9';
const C_NEWS = 'expliq_news_v9';
const C_QUOTES = 'expliq_quotes_v9';
const C_TEMPLATES = 'expliq_templates_v9';
const C_VIDEOS = 'expliq_strength_videos_v9'; 

// !!! SEGURANÇA ADMIN !!!
const ADMIN_EMAILS = ["lucas_maia9@hotmail.com","giselleguima1@hotmail.com","edgarzanin@outlook.com"]; 

let currentUser = null;
let currentMonth = new Date();
let selectedDayDate = null; 
let allUsersCache = []; // Cache simplificado para usuários

// Variáveis temporárias
let tempPostFile = null;
let tempNewsFile = null;

// Estados de UI Admin
let expandedUsers = new Set();
let expandedRaces = new Set();
let expandedTemplates = new Set();

// Estados de Edição
let currentAdmUser = null;
let currentAdmRaceIdx = null;
let isEditingTemplate = false;
let currentTemplateId = null;
let editingWorkoutIndex = null;
let allNews = [];

// Estado de Edição de Prova (Aluno)
let editingStudentRaceIndex = null;

// Estado de Conclusão de Treino
let pendingFinishWorkoutTitle = null; // Título do treino que está sendo concluído
let selectedPainLevel = null; // Nível de dor selecionado

// Variáveis de Paginação Admin
let lastVisibleUser = null;
let isLoadingUsers = false;

window.app = {
    admUsersCache: {}, // Cache local para acesso rápido aos dados dos usuários no admin

    init: async () => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.app.loadUser(user.email);
            } else {
                window.app.screen('view-landing');
            }
        });
        window.app.renderCalendar();
    },
    
    // --- HAPTICS (Feedback Tátil) ---
    haptic: () => {
        if (navigator.vibrate) {
            navigator.vibrate(50); // Vibração leve
        }
    },

    // --- FUNÇÃO AUXILIAR PARA CORRIGIR TEXTO EM CAIXA ALTA ---
    formatText: (text) => {
        if(!text) return '';
        if (text && text.toUpperCase() === text && /[a-zA-Z]/.test(text)) {
             return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        }
        return text;
    },
    
    compressImage: (file) => {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }
            const maxWidth = 1080; 
            const quality = 0.7;   
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
                        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    }, 'image/jpeg', quality);
                };
                img.onerror = () => resolve(file);
            };
            reader.onerror = () => resolve(file);
        });
    },

    uploadImage: async (file, folderName) => {
        if (!file) return null;
        try {
            window.app.toast("Otimizando imagem...");
            const compressedFile = await window.app.compressImage(file);
            
            window.app.toast("Enviando...");
            const fileName = `${Date.now()}_${compressedFile.name}`;
            
            let path = `${folderName}/${fileName}`;
            if (currentUser) {
                path = `${folderName}/${currentUser.email}/${fileName}`;
            }

            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Erro no Upload:", error);
            window.app.toast("Erro ao enviar imagem.");
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

    goToLogin: () => window.app.screen('view-login'),
    goToRegister: () => window.app.screen('view-register'),
    goToLanding: () => window.app.screen('view-landing'),

    handleRegister: async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const pass = document.getElementById('reg-pass').value;
        try {
            await createUserWithEmailAndPassword(auth, email, pass);
            const newUser = { name, email, active: false, avatar: null, races: [], notes: {}, created: Date.now() };
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), newUser);
            await signOut(auth);
            window.app.toast("Cadastro realizado! Faça login.");
            window.app.screen('view-login');
        } catch(err) { 
            window.app.toast('Erro ao cadastrar.'); 
            console.error(err);
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        const email = document.getElementById('log-email').value.trim().toLowerCase();
        const pass = document.getElementById('log-pass').value;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, user.email);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                const newUser = { name: "Aluno(a)", email: user.email, active: false, avatar: null, races: [], notes: {}, created: Date.now() };
                await setDoc(docRef, newUser);
            }
        } catch(err) { 
            window.app.toast('Email ou senha incorretos.'); 
        }
    },

    forgotPassword: () => {
        window.app.showPrompt("Digite seu email para recuperar:", (email) => {
            const e = email.trim();
            sendPasswordResetEmail(auth, e)
            .then(() => window.app.toast("Email de recuperação enviado!"))
            .catch(e => window.app.toast("Erro: " + e.message));
        });
    },

    loadUser: (email) => {
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), (docSnap) => {
            if(docSnap.exists()) {
                currentUser = docSnap.data();
                const btnAdmin = document.getElementById('btn-admin-access');
                if(btnAdmin) btnAdmin.style.display = ADMIN_EMAILS.includes(currentUser.email) ? 'block' : 'none';
                
                // --- REMOVIDO LISTENER GLOBAL DO ADMIN PARA MELHORAR PERFORMANCE ---
                // Agora o Admin carrega usuários por demanda na aba de Admin.

                if (document.getElementById('view-admin').classList.contains('active')) return;
                
                if(!currentUser.active && !ADMIN_EMAILS.includes(currentUser.email)) { 
                    window.app.screen('view-pending'); 
                    return; 
                }
                const av = currentUser.avatar;
                const himg = document.getElementById('header-avatar-img');
                const htxt = document.getElementById('header-avatar-txt');
                if(av) { himg.src=av; himg.style.display='block'; htxt.style.display='none'; }
                else { himg.style.display='none'; htxt.style.display='block'; htxt.innerText=currentUser.name[0]; }
                window.app.screen('view-app');
                window.app.nav('home');
            }
        });
    },

    logout: () => { signOut(auth).then(() => { currentUser = null; window.app.screen('view-landing'); }); },
    
    openProfile: () => {
        if(!currentUser) return;
        window.app.screen('view-profile');
        
        document.getElementById('profile-name-big').innerText = currentUser.name;
        document.getElementById('profile-email-big').innerText = currentUser.email.toLowerCase();
        const img = document.getElementById('profile-img-big');
        if(currentUser.avatar) { img.src=currentUser.avatar; img.style.display='block'; }
        else { img.style.display='none'; }
        
        document.getElementById('prof-birth').value = currentUser.birthDate || '';
        document.getElementById('prof-city').value = currentUser.city || '';
        document.getElementById('prof-country').value = currentUser.country || '';
        document.getElementById('prof-height').value = currentUser.height || '';
        
        window.app.renderWeightUI();
        window.app.toggleEditProfile(false);

        const hList = document.getElementById('profile-history');
        hList.innerHTML = '';
        (currentUser.races || []).forEach((r, i) => {
            const done = r.workouts.filter(w=>w.done).length;
            const total = r.workouts.length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;
            const dateStr = r.date ? new Date(r.date).toLocaleDateString() : 'Sem data';

            hList.innerHTML += `
            <div style="margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;">
                    <div>
                        <strong style="font-size:14px;">${r.name}</strong>
                        <button onclick="window.app.openEditRaceDate(${i})" style="border:none; background:none; color:var(--text-sec); cursor:pointer; font-size:12px; margin-left:5px;"><i class="fa-solid fa-pencil"></i></button>
                        <div style="font-size:11px; color:#888;">${dateStr}</div>
                    </div>
                    <span style="font-size:12px; font-weight:600; color:var(--primary);">${pct}%</span>
                </div>
                <div style="height:6px; background:#eee; border-radius:3px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:var(--primary);"></div>
                </div>
            </div>`;
        });

        const btnAddRace = document.getElementById('btn-add-race');
        if(btnAddRace) {
            const todayStr = new Date().toISOString().split('T')[0];
            const hasActiveGoal = (currentUser.races || []).some(r => r.date >= todayStr);
            
            if (hasActiveGoal) {
                btnAddRace.style.display = 'none';
            } else {
                btnAddRace.style.display = 'block';
            }
        }
    },

    openEditRaceDate: (index) => {
        if (!currentUser || !currentUser.races || !currentUser.races[index]) return;
        editingStudentRaceIndex = index;
        const race = currentUser.races[index];
        
        document.getElementById('edit-race-date-input').value = race.date || '';
        document.getElementById('modal-edit-date').classList.add('active');
    },

    saveRaceDate: async () => {
        if (editingStudentRaceIndex === null || !currentUser) return;
        
        const newDate = document.getElementById('edit-race-date-input').value;
        if (!newDate) return window.app.toast("Selecione uma data.");

        const races = currentUser.races;
        races[editingStudentRaceIndex].date = newDate;

        window.app.toast("Atualizando data...");
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { races });
            window.app.toast("Data atualizada!");
            document.getElementById('modal-edit-date').classList.remove('active');
            window.app.renderHome(); 
            window.app.openProfile();
            window.app.haptic();
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao salvar.");
        }
    },

    toggleEditProfile: (isEditing) => {
        const inputs = document.querySelectorAll('#profile-form-container input');
        inputs.forEach(inp => inp.disabled = !isEditing);
        
        const btnEdit = document.getElementById('btn-edit-profile');
        const actionBtns = document.getElementById('profile-edit-actions');
        
        if (isEditing) {
            btnEdit.style.display = 'none';
            actionBtns.style.display = 'flex';
        } else {
            btnEdit.style.display = 'block';
            actionBtns.style.display = 'none';
        }
    },

    saveProfile: async () => {
        if(!currentUser) return;
        
        const birthDate = document.getElementById('prof-birth').value;
        const city = document.getElementById('prof-city').value;
        const country = document.getElementById('prof-country').value;
        const height = document.getElementById('prof-height').value;
        
        let updates = { birthDate, city, country, height };

        window.app.toast("Salvando perfil...");
        
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), updates);
            currentUser = { ...currentUser, ...updates };
            window.app.toast("Perfil atualizado!");
            window.app.toggleEditProfile(false);
            window.app.haptic();
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao salvar.");
        }
    },

    renderWeightUI: () => {
        if(!currentUser) return;
        let history = currentUser.weightHistory || [];
        history = history.filter(h => h.value !== undefined && h.value !== null && !isNaN(h.value));
        history.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        const displayEl = document.getElementById('display-current-weight');
        if (history.length > 0) {
            const currentWeight = history[0].value;
            displayEl.innerHTML = `${currentWeight} <span style="font-size: 16px; font-weight: 400; color: var(--text-sec);">kg</span>`;
        } else {
            displayEl.innerHTML = '--';
        }

        const listContainer = document.getElementById('weight-history-list');
        listContainer.innerHTML = '';
        if(history.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; color:#999; font-size:12px; margin-top:10px;">Nenhum registro.</p>';
        } else {
            history.forEach(h => {
                const dateStr = new Date(h.date).toLocaleDateString();
                listContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed #eee; font-size:14px; color:var(--text-main);">
                    <span>${dateStr}</span>
                    <strong>${h.value} kg</strong>
                </div>`;
            });
        }
    },

    openWeightModal: () => {
        document.getElementById('new-weight-input').value = '';
        document.getElementById('modal-add-weight').classList.add('active');
        document.getElementById('new-weight-input').focus();
    },

    saveNewWeight: async () => {
        const val = parseFloat(document.getElementById('new-weight-input').value);
        if(!val || isNaN(val)) return window.app.toast("Digite um peso válido.");

        const newEntry = {
            date: new Date().toISOString(),
            value: val
        };

        let history = currentUser.weightHistory || [];
        history.push(newEntry);
        
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { 
                weightHistory: history 
            });
            currentUser.weightHistory = history;
            window.app.renderWeightUI();
            document.getElementById('modal-add-weight').classList.remove('active');
            window.app.toast("Peso registrado!");
            window.app.haptic();
        } catch(e) {
            console.error(e);
            window.app.toast("Erro ao salvar peso.");
        }
    },

    closeProfile: () => window.app.screen('view-app'),
    
    uploadAvatar: async (input) => {
        if(input.files && input.files[0]) {
            window.app.toast("Trocando foto...");
            if(currentUser.avatar) {
                await window.app.deleteFile(currentUser.avatar);
            }
            const imgUrl = await window.app.uploadImage(input.files[0], 'avatars');
            if(imgUrl) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { avatar: imgUrl });
                window.app.toast("Foto atualizada!");
                window.app.openProfile();
            }
        }
    },
    
    showAddRaceModal: () => document.getElementById('modal-add-race').classList.add('active'),
    
    addStudentRace: async () => {
        const name = document.getElementById('new-race-name').value;
        const distEl = document.getElementById('new-race-dist');
        const dist = distEl ? parseFloat(distEl.value) : 10; 
        
        const timeEl = document.getElementById('new-race-est-time');
        const estTime = timeEl ? timeEl.value : "Não informado";
        
        const strengthVideoEl = document.getElementById('new-race-strength-video');
        const strengthVideo = strengthVideoEl ? strengthVideoEl.value : "";

        const date = document.getElementById('new-race-date').value;

        if(!name || !date) return window.app.toast("Preencha o nome e data.");

        const today = new Date();
        const raceDateObj = new Date(date);
        
        const startDateObj = new Date();
        startDateObj.setDate(today.getDate() + 1);
        const startDateStr = startDateObj.toISOString().split('T')[0];

        const diffTime = raceDateObj - startDateObj;
        if (diffTime <= 0) return window.app.toast("Data deve ser futura.");

        window.app.toast("Seu professor está criando seu treino...");
        const btn = document.querySelector('#modal-add-race button.btn-primary');
        if(btn) { btn.disabled = true; btn.innerText = "Gerando..."; }

        try {
            const response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    dist: dist,
                    estTime: estTime,
                    startDate: startDateStr,
                    raceDate: date,
                    strengthVideo: strengthVideo 
                })
            });

            if (!response.ok) {
                let errorDetails = "Erro desconhecido";
                try {
                    const errorJson = await response.json();
                    errorDetails = errorJson.error || JSON.stringify(errorJson);
                } catch(e) {
                    errorDetails = await response.text();
                }
                throw new Error(`Worker Error: ${errorDetails}`);
            }

            const aiWorkoutsRaw = await response.json();
            
            if (!Array.isArray(aiWorkoutsRaw)) {
                if (aiWorkoutsRaw.error) throw new Error(aiWorkoutsRaw.error);
                throw new Error("Formato inválido recebido da IA.");
            }

            const generatedWorkouts = aiWorkoutsRaw.map(w => ({
                title: w.title,
                desc: w.desc,
                video: w.video || "", 
                done: false,
                scheduledDate: w.date,
                type: w.type || (w.title.toLowerCase().includes('fortalecimento') ? 'strength' : 'run') 
            }));

            if (generatedWorkouts.length === 0) throw new Error("Erro ao gerar seu treino.");

            const races = currentUser.races || [];
            races.push({ 
                name, 
                date, 
                targetDistance: dist,
                estimatedTime: estTime,
                workouts: generatedWorkouts, 
                created: new Date().toISOString() 
            });

            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { races });
            
            document.getElementById('modal-add-race').classList.remove('active');
            window.app.toast('Planilha criada com sucesso!');
            window.app.openProfile();
            window.app.haptic();

        } catch (error) {
            console.error("ERRO:", error);
            window.app.toast("Erro: " + error.message);
        } finally {
            if(btn) { btn.disabled = false; btn.innerText = "Criar"; }
        }
    },

    changeMonth: (dir) => { currentMonth.setMonth(currentMonth.getMonth() + dir); window.app.renderCalendar(); },
    renderCalendar: () => {
        if(!currentUser) return;
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m+1, 0).getDate();
        
        document.getElementById('cal-month-title').innerText = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
        
        const grid = document.getElementById('calendar-days');
        grid.innerHTML = '';
        
        const activeRace = (currentUser.races && currentUser.races.length) ? currentUser.races[currentUser.races.length-1] : null;
        const workouts = activeRace ? activeRace.workouts : [];
        const notes = currentUser.notes || {};
        const todayStr = new Date().toISOString().split('T')[0];

        for(let i=0; i<firstDay; i++) { grid.innerHTML += `<div class="cal-cell other-month"></div>`; }
        for(let d=1; d<=daysInMonth; d++) {
            const dateObj = new Date(y, m, d);
            const dateStr = dateObj.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            let cellClass = 'cal-cell';
            if(isToday) cellClass += ' today';
            let dotHtml = '';
            let workoutData = null;
            
            const scheduled = workouts.find(w => w.scheduledDate === dateStr);
            const doneHere = workouts.find(w => w.done && w.completedAt === dateStr);
            
            let modalData = { studentRaces: [] }; 

            if (scheduled) {
                 cellClass += ' has-workout'; 
                 dotHtml += `<div class="cal-dot"></div>`;
                 modalData = { ...scheduled, studentRaces: [] }; 
                 if(scheduled.done) cellClass += ' done';
            }
            else if(doneHere) { 
                 cellClass += ' done'; 
                 dotHtml += `<div class="cal-dot"></div>`; 
                 modalData = { ...doneHere, studentRaces: [] }; 
            } 
            
            if(notes[dateStr]) { dotHtml += `<div class="cal-note-indicator"></div>`; }

            // NOTA: Para admin, como agora paginamos, o calendário não mostra TODAS as provas de todos alunos.
            // Apenas mostra dos que já foram carregados no cache (allUsersCache agora é window.app.admUsersCache convertido em array)
            if (ADMIN_EMAILS.includes(currentUser.email)) {
                // Convertendo objeto de cache em array para iterar
                const loadedUsers = Object.values(window.app.admUsersCache);
                let hasStudentRace = false;
                
                loadedUsers.forEach(u => {
                    if (u.races) {
                        u.races.forEach(r => {
                            if (r.date === dateStr) {
                                hasStudentRace = true;
                                modalData.studentRaces.push({ studentName: u.name, raceName: r.name });
                            }
                        });
                    }
                });
                
                if (hasStudentRace) {
                    dotHtml += `<div class="cal-race-marker" title="Prova de aluno"></div>`;
                }
            }
            
            const el = document.createElement('div');
            el.className = cellClass;
            el.innerText = d;
            el.innerHTML += dotHtml;
            const dataToPass = JSON.parse(JSON.stringify(modalData));
            el.onclick = () => window.app.openDayDetail(dateStr, dataToPass);
            grid.appendChild(el);
        }
    },

    openDayDetail: (dateStr, workoutData) => {
        selectedDayDate = dateStr;
        const modal = document.getElementById('modal-day-detail');
        document.getElementById('day-det-title').innerText = `Dia ${dateStr.split('-').reverse().join('/')}`;
        let content = '';

        if(workoutData && (workoutData.title || workoutData.desc)) {
            content += `<div style="background:#f5f5f5; padding:15px; border-radius:10px; margin-bottom:15px;">
                <h4 style="margin:0 0 5px 0;">${workoutData.title}</h4>
                <p style="margin:0; font-size:13px; color:#666;">${workoutData.desc}</p>
                ${workoutData.done ? '<strong style="color:var(--success); font-size:12px;">Concluído</strong>' : '<span style="color:var(--orange); font-size:12px;">Pendente</span>'}
            </div>`;
        } else if (!workoutData || (!workoutData.title && (!workoutData.studentRaces || workoutData.studentRaces.length === 0))) { 
            content += `<p style="color:#999; text-align:center; margin-bottom:15px;">Sem treino registrado para este dia.</p>`; 
        }

        if (workoutData && workoutData.studentRaces && workoutData.studentRaces.length > 0) {
            content += `<div style="margin-top:15px;">
                <h4 style="font-size:14px; color:var(--primary); margin-bottom:10px;">Provas de Alunos:</h4>`;
            workoutData.studentRaces.forEach(race => {
                content += `<div style="background:#fff; border:1px solid #eee; padding:10px; border-radius:8px; margin-bottom:5px; font-size:13px;">
                    <strong>${race.studentName}</strong><br>
                    <span style="color:#666;">${race.raceName}</span>
                </div>`;
            });
            content += `</div>`;
        }

        document.getElementById('day-det-content').innerHTML = content;
        const notes = currentUser.notes || {};
        document.getElementById('day-det-note').value = notes[dateStr] || '';
        modal.classList.add('active');
    },

    saveDayNote: async () => {
        const note = document.getElementById('day-det-note').value;
        const notes = currentUser.notes || {};
        if(note.trim() === '') delete notes[selectedDayDate];
        else notes[selectedDayDate] = note;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { notes });
        window.app.toast("Nota salva!");
        document.getElementById('modal-day-detail').classList.remove('active');
        window.app.renderCalendar();
    },

    renderHome: () => { window.app.renderCalendar(); window.app.renderTodayCard(); window.app.loadQuote(); window.app.loadHomeNews(); },
    
    loadHomeNews: () => {
        // Skeleton para noticias
        const container = document.getElementById('home-latest-news');
        container.innerHTML = `<h3 style="font-size: 16px; margin: 0 0 15px;">Última Novidade</h3><div class="skeleton" style="width:100%; height:200px; border-radius:12px;"></div>`;

        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const news = []; snap.forEach(d => news.push({id: d.id, ...d.data()})); news.sort((a,b) => b.created - a.created);
            
            if(news.length > 0) {
                const n = news[0];
                container.innerHTML = `
                    <h3 style="font-size: 16px; margin: 0 0 15px;">Última Novidade</h3>
                    <div class="card news-card" style="margin-bottom:0;" onclick="window.app.openNewsDetail('${n.id}')">
                        ${n.img ? `<img src="${n.img}" class="news-img" style="height:150px;">` : ''}
                        <div class="news-content" style="padding:15px;">
                            <div class="news-date" style="font-size:10px;">${new Date(n.created).toLocaleDateString()}</div>
                            <h3 class="news-title" style="font-size:16px;">${window.app.formatText(n.title)}</h3>
                        </div>
                    </div>`;
                    allNews = news; 
            } else { container.innerHTML = ''; }
        });
    },

    openStrengthVideosModal: () => {
        const list = document.getElementById('strength-video-list');
        list.innerHTML = '<p style="text-align:center; color:#666;">Carregando...</p>';
        document.getElementById('modal-strength-videos').classList.add('active');

        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS), (snap) => {
            list.innerHTML = '';
            if(snap.empty) {
                list.innerHTML = '<p style="text-align:center; color:#666;">Nenhum vídeo cadastrado.</p>';
                return;
            }
            snap.forEach(d => {
                const v = d.data();
                const safeLink = window.app.escape(v.link);
                list.innerHTML += `
                <div style="background:#f9f9f9; padding:15px; border-radius:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:600; font-size:14px;">${v.title}</span>
                    <button onclick="window.app.playVideo('${safeLink}')" style="background:var(--primary); color:#FFF; border:none; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fa-solid fa-play" style="font-size:12px;"></i></button>
                </div>`;
            });
        });
    },

    renderTodayCard: (specificWorkout = null) => {
        const activeRace = (currentUser.races && currentUser.races.length) ? currentUser.races[currentUser.races.length-1] : null;
        if(!activeRace || activeRace.workouts.length === 0) { 
            document.getElementById('today-workout-card').innerHTML = `
                <div class="card" style="text-align:center; padding:40px 20px;">
                    <i class="fa-regular fa-clock" style="font-size:40px; color:var(--primary); margin-bottom:20px; opacity:0.8;"></i>
                    <p style="font-size:16px; color:var(--text-sec); font-weight:500;">Aguardando seu professor lançar os treinos...</p>
                </div>`; 
            return; 
        }
        
        const todayStr = new Date().toISOString().split('T')[0];
        let target = specificWorkout;
        if (!target) target = activeRace.workouts.find(w => w.scheduledDate === todayStr);
        if (!target) target = activeRace.workouts.find(w => w.done && w.completedAt === todayStr);
        if (!target) target = activeRace.workouts.find(w => !w.done && (!w.scheduledDate || w.scheduledDate >= todayStr));
        
        const container = document.getElementById('today-workout-card');
        const totalW = activeRace.workouts.length;
        const doneW = activeRace.workouts.filter(w => w.done).length;
        const pct = totalW > 0 ? (doneW / totalW) * 100 : 0;
        const raceDate = activeRace.date ? new Date(activeRace.date).toLocaleDateString() : 'Sem Data';
        let cardHtml = '';
        
        const safeTitle = target ? window.app.escape(target.title) : '';
        const safeVideo = target && target.video ? window.app.escape(target.video) : '';
        
        if(target) {
            const doneBtn = target.done ? `<button class="btn" style="background:rgba(255,255,255,0.2); color:#FFF; flex:1; cursor:default;" disabled><i class="fa-solid fa-check"></i> Feito</button>` : `<button onclick="window.app.finishWorkout('${safeTitle}')" class="btn" style="background:#FFF; color:var(--text-main); flex:1;">Concluir</button>`;
            let dateDisplay = "";
            if(target.scheduledDate) {
                const dParts = target.scheduledDate.split('-');
                dateDisplay = `<span style="font-size:12px; color:rgba(255,255,255,0.7); margin-left:8px; font-weight:400;">${dParts[2]}/${dParts[1]}</span>`;
            }

            let actionBtn = '';
            if (target.type === 'strength' || target.title.toLowerCase().includes('fortalecimento')) {
                actionBtn = `<button onclick="window.app.openStrengthVideosModal()" class="btn" style="background:rgba(255,255,255,0.4); color:var(--text-main); padding:0 20px; width:auto; display:flex; gap:8px;"><i class="fa-solid fa-dumbbell"></i> Ver Exercícios</button>`;
            } else if (safeVideo) {
                actionBtn = `<button onclick="window.app.playVideo('${safeVideo}')" class="btn" style="background:rgba(255,255,255,0.4); color:var(--text-main); padding:0 20px; width:auto; display:flex; gap:8px;"><i class="fa-solid fa-play"></i> Vídeo</button>`;
            }

            cardHtml = `<div class="card" style="background: #9cafcc; color: var(--text-main); border: none; padding:30px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:25px;">
                    <div>
                        <h2 style="margin:0; font-size:24px; line-height:1.2; color:var(--text-main);">${target.title} ${dateDisplay}</h2>
                        <p style="opacity:0.9; font-size:15px; margin-top:8px; font-weight:400; color:var(--text-main);">${target.desc}</p>
                    </div>
                    <div style="background:rgba(255,255,255,0.4); width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                        <i class="fa-solid fa-person-running" style="font-size:24px; color:var(--text-main);"></i>
                    </div>
                </div>
                <div style="display:flex; gap:15px;">
                    ${doneBtn}
                    ${actionBtn}
                </div>
            </div>`;
        } else {
            cardHtml = `<div class="card" style="text-align:center; color:var(--success); padding:40px;"><i class="fa-solid fa-circle-check" style="font-size:48px; margin-bottom:15px;"></i><br><strong style="font-size:18px;">Todos os treinos concluídos!</strong></div>`;
        }
        container.innerHTML = cardHtml + `
            <div style="margin-top:20px; font-size:12px; display:flex; justify-content:space-between; color:var(--text-sec); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;"><span>${doneW}/${totalW} Treinos</span> <span>Meta: ${raceDate}</span></div>
            <div class="progress-container"><div class="progress-bar" style="width:${pct}%"></div></div>
        `;
    },

    finishWorkout: (wTitle) => {
        pendingFinishWorkoutTitle = wTitle;
        selectedPainLevel = null;
        document.getElementById('workout-feedback-text').value = '';
        window.app.renderPainScale();
        document.getElementById('modal-finish-workout').classList.add('active');
    },

    renderPainScale: () => {
        const container = document.getElementById('pain-scale-container');
        container.innerHTML = '';
        for(let i=0; i<=7; i++) {
            const isActive = i === selectedPainLevel;
            const bg = isActive ? 'var(--primary)' : '#FFF';
            const color = isActive ? '#FFF' : 'var(--text-main)';
            const border = isActive ? 'none' : '1px solid #CCC';
            
            container.innerHTML += `
            <button onclick="window.app.setPainLevel(${i})" style="width:35px; height:35px; border-radius:50%; border:${border}; background:${bg}; color:${color}; font-weight:600; cursor:pointer;">${i}</button>
            `;
        }
    },

    setPainLevel: (lvl) => {
        selectedPainLevel = lvl;
        window.app.renderPainScale();
    },

    confirmFinishWorkout: async () => {
        if (!pendingFinishWorkoutTitle) return;
        const notes = document.getElementById('workout-feedback-text').value.trim();
        
        if (selectedPainLevel === null) return window.app.toast("Selecione o nível de dor.");
        if (selectedPainLevel > 0 && !notes) return window.app.toast("Descreva o que doeu (Obrigatório para dor > 0).");

        const races = [...currentUser.races];
        const rIdx = races.length - 1;
        const wIdx = races[rIdx].workouts.findIndex(w => w.title === pendingFinishWorkoutTitle && !w.done);
        
        if(wIdx > -1) {
            races[rIdx].workouts[wIdx].done = true;
            races[rIdx].workouts[wIdx].completedAt = new Date().toISOString().split('T')[0];
            
            if (selectedPainLevel > 0 || notes) {
                races[rIdx].workouts[wIdx].feedback = {
                    painLevel: selectedPainLevel,
                    notes: notes,
                    timestamp: Date.now()
                };
            }

            currentUser.races = races;
            
            window.app.renderHome(); 
            if(!document.getElementById('tab-workouts').classList.contains('hidden')) {
                window.app.renderWorkoutsList();
            }
            
            window.app.toast("Treino concluído! Bom descanso.");
            window.app.haptic();
            document.getElementById('modal-finish-workout').classList.remove('active');
            
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { races });
        }
    },

    loadQuote: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s)=>{
            const quotes = [];
            s.forEach(d=>quotes.push(d.data().text));
            if(quotes.length>0) {
                document.getElementById('daily-quote').innerText = quotes[Math.floor(Math.random()*quotes.length)];
            } else {
                document.getElementById('daily-quote').innerText = "O único treino ruim é aquele que não aconteceu.";
            }
        });
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

    renderWorkoutsList: () => {
        const activeRace = (currentUser.races && currentUser.races.length) ? currentUser.races[currentUser.races.length-1] : null;
        const list = document.getElementById('workouts-list');
        
        if(!activeRace) { list.innerHTML = ''; return; }
        const pendingCount = activeRace.workouts.filter(w => !w.done).length;
        
        list.innerHTML = `
        <div class="card" style="background:var(--primary); color:#FFF; margin-bottom:25px; padding:25px; display:flex; align-items:center; justify-content:space-between;">
            <div>
                <h2 style="margin:0; font-size:36px; color:#FFF;">${pendingCount}</h2>
                <p style="margin:0; opacity:0.9; font-size:14px; color:#FFF;">Treinos Restantes</p>
            </div>
            <i class="fa-solid fa-list-check" style="font-size:40px; opacity:0.5; color:#FFF;"></i>
        </div>`;

        const todayStr = new Date().toISOString().split('T')[0];

        activeRace.workouts.forEach((w, i) => {
            const color = w.done ? 'var(--success)' : '#E0E0E0';
            const icon = w.done ? 'fa-circle-check' : 'fa-circle';
            const safeVideo = w.video ? window.app.escape(w.video) : '';
            const safeTitle = window.app.escape(w.title);
            
            let dateBadge = '';
            if(w.scheduledDate) {
                 const dParts = w.scheduledDate.split('-');
                 dateBadge = `<span style="font-size:10px; color:#FFF; background:var(--primary); padding:2px 6px; border-radius:6px; margin-left:8px; font-weight:600;">${dParts[2]}/${dParts[1]}</span>`;
            }
            
            let videoBtn = '';
            if (w.type === 'strength' || w.title.toLowerCase().includes('fortalecimento')) {
                videoBtn = `<button onclick="window.app.openStrengthVideosModal()" style="border:1px solid var(--secondary); background:transparent; color:var(--text-main); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-dumbbell" style="color:var(--primary);"></i> Ver Exercícios</button>`;
            } else if (safeVideo) {
                videoBtn = `<button onclick="window.app.playVideo('${safeVideo}')" style="border:1px solid var(--secondary); background:transparent; color:var(--text-main); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-play" style="color:var(--primary);"></i> Vídeo</button>`;
            }

            let finishBtn = '';
            if(!w.done && (!w.scheduledDate || w.scheduledDate <= todayStr)) {
                finishBtn = `<button onclick="event.stopPropagation(); window.app.finishWorkout('${safeTitle}')" style="border:1px solid var(--success); background:transparent; color:var(--success); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; margin-right: 8px;"><i class="fa-solid fa-check"></i> Concluir</button>`;
            }

            list.innerHTML += `<div class="card" style="display:flex; align-items:flex-start; gap: 15px; opacity: ${w.done?0.6:1}; padding:20px;">
                <div style="color:${color}; font-size:24px; margin-top:2px;"><i class="fa-solid ${icon}"></i></div>
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:16px;">${w.title} ${dateBadge}</h4>
                    <p style="margin:0; font-size:13px; color:var(--text-sec); margin-top:4px;">${w.desc}</p>
                    <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
                        ${finishBtn}
                        ${videoBtn}
                    </div>
                </div>
            </div>`;
        });
    },

    loadFeed: () => {
        const feed = document.getElementById('social-feed');
        // --- SKELETON LOADING ---
        feed.innerHTML = '';
        for(let i=0; i<3; i++) {
            feed.innerHTML += `
            <div class="card" style="padding:15px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px;">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex:1;">
                        <div class="skeleton skeleton-text" style="width:50%"></div>
                        <div class="skeleton skeleton-text" style="width:30%"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-img" style="border-radius:12px;"></div>
            </div>`;
        }

        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), (snap) => {
            feed.innerHTML = '';
            const posts = [];
            snap.forEach(d => posts.push({id:d.id, ...d.data()}));
            posts.sort((a,b) => b.created - a.created);
            
            posts.forEach(p => {
                const imgUrl = p.img || p.image; 
                const isOwner = currentUser && p.email === currentUser.email;
                const isAdmin = currentUser && ADMIN_EMAILS.includes(currentUser.email);
                
                let deleteBtn = '';
                if (isOwner || isAdmin) {
                    deleteBtn = `<button onclick="window.app.deletePost('${p.id}')" style="border:none; background:none; color:var(--red); font-size:14px; margin-left:auto;"><i class="fa-solid fa-trash"></i></button>`;
                }

                const likes = p.likes || [];
                const isLiked = currentUser && likes.includes(currentUser.email);
                const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
                const likeColor = isLiked ? 'color:var(--red);' : 'color:var(--text-main);';

                const comments = p.comments || [];
                let commentsHtml = '';
                comments.forEach((c, idx) => {
                    const canDelComm = (currentUser && c.email === currentUser.email) || isAdmin;
                    commentsHtml += `
                    <div style="font-size:13px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:flex-start;">
                        <span><strong style="color:var(--text-main);">${c.userName}</strong> <span style="color:#555;">${c.text}</span></span>
                        ${canDelComm ? `<button onclick="window.app.deleteComment('${p.id}', ${idx})" style="border:none; background:none; color:#ccc; font-size:10px; cursor:pointer;">✕</button>` : ''}
                    </div>`;
                });

                feed.innerHTML += `
                <div class="card" style="padding:0; overflow:hidden; margin-bottom:25px;">
                    <div style="padding:15px; display:flex; align-items:center; gap:12px;">
                        <div style="width:35px; height:35px; border-radius:50%; background:#EEE; overflow:hidden;">${p.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;">` : ''}</div>
                        <div>
                            <strong style="font-size:14px; display:block; color:var(--text-main);">${p.userName}</strong>
                            <span style="font-size:11px; color:var(--text-sec);">${new Date(p.created).toLocaleDateString()}</span>
                        </div>
                        ${deleteBtn}
                    </div>
                    ${imgUrl ? `<img src="${imgUrl}" style="width:100%; max-height:450px; object-fit:cover; display:block;">` : ''}
                    <div style="padding:15px;">
                        <div style="display:flex; gap:20px; margin-bottom:10px; align-items: center;">
                            <button onclick="window.app.toggleLike('${p.id}')" style="border:none; background:none; font-size:22px; cursor:pointer; ${likeColor} display:flex; align-items:center; gap:8px; padding:0;">
                                <i class="${likeIcon}"></i>
                                <span style="font-size:15px; font-weight:600; color:var(--text-main);">${likes.length}</span>
                            </button>
                            <button onclick="document.getElementById('comment-input-${p.id}').focus()" style="border:none; background:none; font-size:22px; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:8px; padding:0;">
                                <i class="fa-regular fa-comment"></i>
                                <span style="font-size:15px; font-weight:600; color:var(--text-main);">${comments.length}</span>
                            </button>
                        </div>
                        <p style="margin:0 0 10px 0; font-size:14px; line-height:1.5; color:var(--text-main);">
                            <strong style="margin-right:5px;">${p.userName}</strong>${p.text}
                        </p>
                        <div style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                            ${commentsHtml}
                        </div>
                        <div style="display:flex; margin-top:10px; gap:10px;">
                            <input id="comment-input-${p.id}" type="text" placeholder="Adicione um comentário..." style="flex:1; border:none; outline:none; font-size:13px; background:transparent;">
                            <button onclick="window.app.submitComment('${p.id}')" style="border:none; background:none; color:var(--primary); font-weight:600; font-size:13px; cursor:pointer;">Publicar</button>
                        </div>
                    </div>
                </div>`;
            });
        });
    },

    toggleLike: async (postId) => {
        if(!currentUser) return;
        window.app.haptic(); // HAPTIC
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if(postSnap.exists()) {
            const p = postSnap.data();
            const likes = p.likes || [];
            if(likes.includes(currentUser.email)) {
                await updateDoc(postRef, { likes: arrayRemove(currentUser.email) });
            } else {
                await updateDoc(postRef, { likes: arrayUnion(currentUser.email) });
            }
        }
    },

    submitComment: async (postId) => {
        if(!currentUser) return;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input.value.trim();
        if(!text) return;
        const newComment = { userName: currentUser.name, email: currentUser.email, text: text, created: Date.now() };
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        await updateDoc(postRef, { comments: arrayUnion(newComment) });
        input.value = '';
        window.app.haptic();
    },

    deleteComment: async (postId, commentIndex) => {
        if(!confirm("Apagar comentário?")) return;
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if(postSnap.exists()) {
            const p = postSnap.data();
            const comments = p.comments || [];
            const newComments = comments.filter((_, idx) => idx !== commentIndex);
            await updateDoc(postRef, { comments: newComments });
        }
    },

    deletePost: async (postId) => {
        window.app.showConfirm("Excluir publicação?", async () => {
            const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
            const snap = await getDoc(postRef);
            if(snap.exists() && snap.data().img) await window.app.deleteFile(snap.data().img);
            await deleteDoc(postRef);
            window.app.toast("Publicação removida.");
        });
    },

    openCreatePost: () => window.app.screen('view-create-post'),
    closeCreatePost: () => window.app.screen('view-app'),
    previewPostImg: (input) => { 
        if(input.files && input.files[0]) {
            tempPostFile = input.files[0];
            const url = URL.createObjectURL(tempPostFile);
            const prev = document.getElementById('post-img-preview'); 
            prev.style.backgroundImage = `url(${url})`; 
            prev.style.display = 'block'; 
        }
    },
    submitPost: async () => {
        const text = document.getElementById('post-text').value;
        if(!text && !tempPostFile) return;
        document.getElementById('btn-submit-post').disabled = true;
        window.app.toast("Enviando...");
        let imgUrl = null;
        if(tempPostFile) imgUrl = await window.app.uploadImage(tempPostFile, 'posts');
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS)), { 
            userName: currentUser.name, email: currentUser.email, avatar: currentUser.avatar, text: text, img: imgUrl, likes: [], comments: [], created: Date.now() 
        });
        document.getElementById('post-text').value = ''; 
        tempPostFile = null; 
        document.getElementById('post-img-preview').style.display = 'none'; 
        document.getElementById('btn-submit-post').disabled = false;
        window.app.closeCreatePost();
        window.app.haptic();
    },

    loadNews: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const feed = document.getElementById('news-feed'); feed.innerHTML = '';
            const news = []; snap.forEach(d => news.push({id: d.id, ...d.data()})); 
            news.sort((a,b) => b.created - a.created);
            allNews = news; 
            
            news.forEach(n => { 
                feed.innerHTML += `
                <div class="card news-card" onclick="window.app.openNewsDetail('${n.id}')">
                    ${n.img ? `<img src="${n.img}" class="news-img">` : ''}
                    <div class="news-content">
                        <div class="news-date">${new Date(n.created).toLocaleDateString()}</div>
                        <h3 class="news-title">${window.app.formatText(n.title)}</h3>
                    </div>
                </div>`; 
            });
        });
    },

    openNewsDetail: (id) => {
        const n = allNews.find(item => item.id === id);
        if(!n) return;
        
        const imgContainer = document.getElementById('news-det-img-container');
        if(n.img) {
            imgContainer.style.backgroundImage = `url('${n.img}')`;
            imgContainer.style.display = 'block';
        } else {
            imgContainer.style.display = 'none';
        }
        
        document.getElementById('news-det-date').innerText = new Date(n.created).toLocaleDateString();
        document.getElementById('news-det-title').innerText = window.app.formatText(n.title);
        document.getElementById('news-det-body').innerText = window.app.formatText(n.body);
        
        document.querySelector('.nav-bar').style.display = 'none';
        const detailScreen = document.getElementById('view-news-detail');
        detailScreen.classList.add('active');
        detailScreen.style.overflowY = 'auto';
        detailScreen.scrollTop = 0;

        // CORREÇÃO: Fundo branco ao abrir notícia para evitar faixa azul
        document.body.style.backgroundColor = '#FFF';
    },

    closeNewsDetail: () => {
        document.getElementById('view-news-detail').classList.remove('active');
        document.querySelector('.nav-bar').style.display = 'flex';

        // CORREÇÃO: Restaura fundo azul ao fechar
        document.body.style.backgroundColor = '#9cafcc';
    },

    loadAdmin: () => { 
        document.getElementById('view-admin').classList.add('active'); 
        window.app.admTab('users'); 
        
        // CORREÇÃO: Fundo branco no admin para evitar faixa azul
        document.body.style.backgroundColor = '#FFF';
    },

    closeAdmin: () => {
        window.app.screen('view-landing');
        
        // CORREÇÃO: Restaura fundo azul ao sair do admin
        document.body.style.backgroundColor = '#9cafcc';
    },

    admTab: (t) => {
        document.querySelectorAll('[id^="adm-content"]').forEach(e=>e.classList.add('hidden'));
        document.getElementById('adm-content-'+t).classList.remove('hidden');
        document.querySelectorAll('.admin-tab-btn').forEach(b=>b.classList.remove('active'));
        document.getElementById('btn-adm-'+t).classList.add('active');
        if(t === 'users') window.app.admLoadUsers();
        if(t === 'news') window.app.admLoadNewsHistory();
        if(t === 'quotes') window.app.admLoadQuotes();
        if(t === 'templates') window.app.admLoadTemplates();
        if(t === 'videos') window.app.admLoadStrengthVideos();
    },
    
    // --- LÓGICA DE PAGINAÇÃO DE USUÁRIOS (SUBSTITUI O ANTIGO admLoadUsers) ---
    
    admLoadUsers: async () => {
        const list = document.getElementById('adm-users-list');
        list.innerHTML = ''; 
        lastVisibleUser = null; 
        window.app.admUsersCache = {}; 
        
        // Remove botão "carregar mais" antigo se existir
        const oldBtn = document.getElementById('btn-load-more-users');
        if(oldBtn) oldBtn.remove();
        
        await window.app.admFetchNextUsers();
        
        // Adiciona botão "Carregar Mais" no final da lista
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'btn-load-more-users';
        loadMoreBtn.innerText = 'Carregar mais alunos';
        loadMoreBtn.className = 'btn btn-outline';
        loadMoreBtn.style.marginTop = '20px';
        loadMoreBtn.style.width = '100%';
        loadMoreBtn.onclick = window.app.admFetchNextUsers;
        document.getElementById('adm-content-users').appendChild(loadMoreBtn);
    },

    admFetchNextUsers: async () => {
        if (isLoadingUsers) return;
        isLoadingUsers = true;
        
        const list = document.getElementById('adm-users-list');
        
        try {
            let q;
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', C_USERS);
            
            // Ordenar por nome para ficar organizado e consistente
            if (lastVisibleUser) {
                // Busca os próximos 20 após o último
                q = query(usersRef, orderBy('name'), startAfter(lastVisibleUser), limit(20));
            } else {
                // Busca os primeiros 20
                q = query(usersRef, orderBy('name'), limit(20));
            }

            const documentSnapshots = await getDocs(q);
            const btn = document.getElementById('btn-load-more-users');

            if (documentSnapshots.empty) {
                if(btn) {
                    btn.innerText = "Fim da lista";
                    btn.disabled = true;
                }
                isLoadingUsers = false;
                return;
            } else {
                if(btn) {
                    btn.innerText = "Carregar mais alunos";
                    btn.disabled = false;
                }
            }

            lastVisibleUser = documentSnapshots.docs[documentSnapshots.docs.length - 1];

            let html = '';
            documentSnapshots.forEach(d => {
                const u = d.data();
                const docId = d.id;
                const safeId = window.app.escape(docId);
                window.app.admUsersCache[docId] = u; 
                
                // Helper function para gerar o HTML do card
                html += window.app.createAdmUserCardHTML(u, docId, safeId);
            });

            list.insertAdjacentHTML('beforeend', html);

        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            window.app.toast("Erro ao listar alunos.");
        } finally {
            isLoadingUsers = false;
        }
    },

    createAdmUserCardHTML: (u, docId, safeId) => {
        const isUserOpen = expandedUsers.has(docId) ? 'open' : ''; 
        const checked = u.active ? 'checked' : '';
        
        let totalWorkouts = 0;
        let doneWorkouts = 0;
        if(u.races && u.races.length > 0) {
            u.races.forEach(r => {
                if(r.workouts) {
                    totalWorkouts += r.workouts.length;
                    doneWorkouts += r.workouts.filter(w => w.done).length;
                }
            });
        }
        const globalPct = totalWorkouts > 0 ? Math.round((doneWorkouts / totalWorkouts) * 100) : 0;
        
        let goalsHtml = '';
        if(u.races && u.races.length > 0) {
            u.races.forEach((r, rIdx) => {
                const raceKey = `${docId}-${rIdx}`; 
                const isRaceOpen = expandedRaces.has(raceKey) ? 'open' : '';
                
                let workoutsHtml = '';
                if(r.workouts && r.workouts.length > 0) {
                    r.workouts.forEach((w, wIdx) => {
                        let wDate = "";
                        if(w.scheduledDate) { 
                            const dp = w.scheduledDate.split('-'); 
                            wDate = `<span style="font-size:10px; color:#666; background:#eee; padding:2px 5px; border-radius:4px;">${dp[2]}/${dp[1]}</span>`; 
                        }
                        
                        const isDone = w.done;
                        const statusIcon = isDone ? '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc"></i>';
                        const undoBtn = isDone ? `<button onclick="window.app.admToggleWorkoutStatus('${safeId}', ${rIdx}, ${wIdx}, false)" style="color:var(--text-sec); font-size:10px; border:1px solid #ddd; border-radius:4px; padding:2px 5px; cursor:pointer; margin-right:5px; background:#fff;">Desfazer</button>` : '';
                        
                        let feedbackHtml = '';
                        if(w.feedback && (w.feedback.painLevel !== undefined || w.feedback.notes)) {
                            feedbackHtml = `
                            <div style="font-size:11px; color:var(--text-sec); background:#fff5eb; padding:6px; border-radius:6px; margin-top:5px; border-left:3px solid var(--primary);">
                                <div style="font-weight:700;">Nível de Dor: ${w.feedback.painLevel}/7</div>
                                <div style="margin-top:2px;">${w.feedback.notes || 'Sem observações.'}</div>
                            </div>`;
                        }

                        workoutsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #eee; padding:8px 0;">
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    ${statusIcon}
                                    <div style="display:flex; flex-direction:column;">
                                        <span onclick="window.app.admShowWorkoutDetail('${safeId}', ${rIdx}, ${wIdx})" style="font-size:12px; font-weight:600; cursor:pointer; text-decoration:underline; color:var(--primary);">${wDate} ${w.title}</span>
                                    </div>
                                </div>
                                ${feedbackHtml}
                            </div>
                            <div style="display:flex; align-items:center; margin-left:10px;">
                                ${undoBtn}
                                <button onclick="window.app.admDeleteWorkoutInline('${safeId}', ${rIdx}, ${wIdx})" style="color:var(--red); border:none; background:none; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
                            </div>
                        </div>`;
                    });
                } else { 
                    workoutsHtml = '<p style="font-size:11px; color:#999;">Sem treinos.</p>'; 
                }
                
                workoutsHtml += `<div style="display:flex; gap:5px; margin-top:10px; justify-content:flex-end;"><button onclick="window.app.admAddWorkoutInline('${safeId}', ${rIdx})" class="adm-btn-small" style="background:#f0f0f0;">+ Treino</button><button onclick="window.app.admImportTemplateInline('${safeId}', ${rIdx})" class="adm-btn-small" style="background:#f0f0f0;">+ Modelo</button></div>`;
                
                goalsHtml += `
                <div class="adm-item-box">
                    <div class="adm-row-header" onclick="window.app.admToggleGoal('${raceKey}')">
                        <strong>${r.name}</strong>
                        <i class="fa-solid fa-chevron-down" style="font-size:12px; opacity:0.5;"></i>
                    </div>
                    <div id="goal-content-${raceKey}" class="adm-nested ${isRaceOpen}">
                        ${workoutsHtml}
                        <div style="text-align:right; margin-top:5px;"><button onclick="window.app.admDelRaceInline('${safeId}', ${rIdx})" style="font-size:10px; color:red; border:none; background:none; cursor:pointer;">Excluir Objetivo</button></div>
                    </div>
                </div>`;
            });
        } else { 
            goalsHtml = '<p style="font-size:12px; color:#999; padding:10px;">Sem objetivos.</p>'; 
        }
        
        return `
        <div class="card" style="padding:15px; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:15px; padding-bottom:5px;">
                <input type="checkbox" class="check-toggle" ${checked} onchange="window.app.admToggleStatus('${safeId}', this.checked)">
                <div style="flex:1; cursor:pointer;" onclick="window.app.admToggleUser('${safeId}')">
                    <span style="font-weight:700; font-size:16px;">${u.name}</span><br>
                    <span style="font-size:12px; color:#888;">${u.email}</span>
                    
                    <div class="progress-container" style="height:6px; margin-top:8px; background:#eee;">
                        <div class="progress-bar colored" style="width:${globalPct}%;"></div>
                    </div>
                    <div style="font-size:9px; color:#999; margin-top:3px; text-align:right;">${doneWorkouts}/${totalWorkouts} Concluídos</div>
                </div>
                <button onclick="window.app.admDeleteUserQuick('${safeId}')" style="border:none; background:none; color:var(--red); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div id="user-content-${docId}" class="adm-nested ${isUserOpen}" style="border-left:none; padding-left:0; margin-top:15px;">
                ${goalsHtml}
                <button onclick="window.app.admAddRaceInline('${safeId}')" style="width:100%; border:2px dashed #eee; background:none; padding:12px; font-size:13px; margin-top:10px; color:var(--primary); font-weight:600; border-radius:12px; cursor:pointer;">+ Novo Objetivo</button>
            </div>
        </div>`;
    },

    // --- LÓGICA DE VÍDEOS ADMIN ---
    admAddStrengthVideo: async () => {
        const title = document.getElementById('adm-video-title').value;
        const link = document.getElementById('adm-video-link').value;
        if(!title || !link) return window.app.toast("Preencha título e link");
        
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS)), { 
            title, link, created: Date.now() 
        });
        window.app.toast("Vídeo cadastrado!");
        document.getElementById('adm-video-title').value = '';
        document.getElementById('adm-video-link').value = '';
    },

    admLoadStrengthVideos: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS), (snap) => {
            const list = document.getElementById('adm-videos-list');
            list.innerHTML = '';
            snap.forEach(d => {
                const v = d.data();
                const safeLink = window.app.escape(v.link);
                list.innerHTML += `
                <div style="background:#fff; border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${v.title}</strong><br>
                        <a href="#" onclick="window.app.playVideo('${safeLink}')" style="font-size:12px; color:var(--primary);">Ver Vídeo</a>
                    </div>
                    <button onclick="window.app.admDeleteStrengthVideo('${d.id}')" style="color:var(--red); border:none; background:none; cursor:pointer;">X</button>
                </div>`;
            });
        });
    },

    admDeleteStrengthVideo: async (id) => {
        if(confirm("Apagar vídeo?")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id));
        }
    },

    admToggleWorkoutStatus: async (docId, rIdx, wIdx, status) => {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId));
        if(snap.exists()) {
            const u = snap.data();
            if(u.races && u.races[rIdx] && u.races[rIdx].workouts && u.races[rIdx].workouts[wIdx]) {
                u.races[rIdx].workouts[wIdx].done = status;
                if(!status) {
                    delete u.races[rIdx].workouts[wIdx].completedAt;
                }
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races });
                window.app.toast(status ? "Treino concluído manualmente" : "Treino reativado!");
            }
        }
    },

    admShowWorkoutDetail: (userId, rIdx, wIdx) => {
        const user = window.app.admUsersCache[userId];
        if (!user || !user.races[rIdx] || !user.races[rIdx].workouts[wIdx]) return;

        const w = user.races[rIdx].workouts[wIdx];
        
        document.getElementById('adm-workout-det-title').innerText = w.title;
        document.getElementById('adm-workout-det-desc').innerText = w.desc;
        const vidContainer = document.getElementById('adm-workout-det-video-container');
        
        if (w.video) {
            const safeVideo = window.app.escape(w.video);
            vidContainer.style.display = 'block';
            vidContainer.innerHTML = `<button onclick="window.app.playVideo('${safeVideo}')" class="btn btn-primary" style="font-size:14px;"><i class="fa-solid fa-play"></i> Ver Vídeo</button>`;
        } else {
            vidContainer.style.display = 'none';
        }
        
        document.getElementById('modal-adm-workout-detail').classList.add('active');
    },
    
    admToggleUser: (docId) => { if(expandedUsers.has(docId)) expandedUsers.delete(docId); else expandedUsers.add(docId); const el = document.getElementById(`user-content-${docId}`); if(el) el.classList.toggle('open'); },
    admToggleGoal: (key) => { if(expandedRaces.has(key)) expandedRaces.delete(key); else expandedRaces.add(key); const el = document.getElementById(`goal-content-${key}`); if(el) el.classList.toggle('open'); },
    admToggleStatus: async (docId, status) => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { active: status }); window.app.toast(status ? "Aluno Aprovado" : "Aluno Bloqueado"); },
    admAddWorkoutInline: (docId, rIdx) => { currentAdmUser = docId; currentAdmRaceIdx = rIdx; isEditingTemplate = false; editingWorkoutIndex = null; document.getElementById('modal-workout-title').innerText = "Novo Treino"; document.getElementById('new-w-title').value = ''; document.getElementById('new-w-desc').value = ''; document.getElementById('new-w-video').value = ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    
    saveSingleWorkout: async () => {
        const title = document.getElementById('new-w-title').value;
        const desc = document.getElementById('new-w-desc').value;
        const video = document.getElementById('new-w-video').value;
        if(!title) return window.app.toast('Título obrigatório');
        if (isEditingTemplate) {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, currentTemplateId));
            const t = snap.data();
            if (editingWorkoutIndex !== null) t.workouts[editingWorkoutIndex] = { title, desc, video, done: false }; 
            else t.workouts.push({ title, desc, video, done: false });
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, currentTemplateId), { workouts: t.workouts });
        } else {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser));
            const u = snap.data();
            if (!u.races[currentAdmRaceIdx].workouts) u.races[currentAdmRaceIdx].workouts = [];
            u.races[currentAdmRaceIdx].workouts.push({title, desc, video, done:false});
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser), { races: u.races });
        }
        document.getElementById('modal-add-single-workout').classList.remove('active');
        window.app.toast("Salvo com sucesso!");
    },

    admImportTemplateInline: (docId, rIdx) => {
        currentAdmUser = docId; currentAdmRaceIdx = rIdx;
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (s) => {
            const list = document.getElementById('template-select-list'); list.innerHTML = '';
            s.forEach(d => {
                const t = d.data();
                list.innerHTML += `<label style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; cursor:pointer;"><input type="radio" name="selected_template" value="${d.id}" style="margin-right:15px; width:18px; height:18px;"><div><strong style="font-size:16px;">${t.name}</strong><br><span style="font-size:12px; color:#888;">${t.workouts.length} Treinos</span></div></label>`;
            });
            document.getElementById('modal-select-template').classList.add('active');
        });
    },

    confirmTemplateImport: async () => {
        const selected = document.querySelector('input[name="selected_template"]:checked');
        const startDateInput = document.getElementById('template-start-date').value;
        if(!selected || !startDateInput) return window.app.toast('Preencha os campos');
        const templateId = selected.value;
        const tSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, templateId));
        const tData = tSnap.data();
        const uSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser));
        const u = uSnap.data();
        const startDate = new Date(startDateInput);
        const newWorkouts = tData.workouts.map((w, index) => {
            const date = new Date(startDate);
            date.setDate(date.getDate() + index);
            return { ...w, scheduledDate: date.toISOString().split('T')[0], done: false };
        });
        u.races[currentAdmRaceIdx].workouts.push(...newWorkouts);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser), { races: u.races });
        window.app.toast("Modelo importado!");
        document.getElementById('modal-select-template').classList.remove('active');
    },

    admDeleteWorkoutInline: async (docId, rIdx, wIdx) => { window.app.showConfirm("Remover treino?", async () => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); u.races[rIdx].workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); }); },
    
    admAddRaceInline: async (docId) => { 
        currentAdmUser = docId;
        
        const tplSelect = document.getElementById('adm-race-template-select');
        tplSelect.innerHTML = '<option value="">Carregando...</option>';
        
        document.getElementById('adm-race-name').value = '';
        document.getElementById('adm-race-date').value = '';
        
        const tomorrow = new Date(); 
        tomorrow.setDate(tomorrow.getDate()+1);
        document.getElementById('adm-start-date').value = tomorrow.toISOString().split('T')[0];
        
        document.getElementById('adm-race-method').value = 'ia';
        document.getElementById('adm-race-dist').value = '';
        document.getElementById('adm-race-time').value = '';
        document.getElementById('adm-race-video').value = '';
        
        window.app.admToggleRaceMode();
        document.getElementById('modal-adm-add-race').classList.add('active');

        const querySnapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES));
        tplSelect.innerHTML = '<option value="">Selecione...</option>';
        querySnapshot.forEach((doc) => {
            const t = doc.data();
            tplSelect.innerHTML += `<option value="${doc.id}">${t.name} (${t.workouts.length} treinos)</option>`;
        });
    },

    admToggleRaceMode: () => {
        const mode = document.getElementById('adm-race-method').value;
        if (mode === 'ia') {
            document.getElementById('adm-race-ia-fields').classList.remove('hidden');
            document.getElementById('adm-race-tpl-fields').classList.add('hidden');
        } else {
            document.getElementById('adm-race-ia-fields').classList.add('hidden');
            document.getElementById('adm-race-tpl-fields').classList.remove('hidden');
        }
    },

    admConfirmAddRace: async () => {
        const name = document.getElementById('adm-race-name').value;
        const raceDate = document.getElementById('adm-race-date').value;
        const startDateStr = document.getElementById('adm-start-date').value;
        const method = document.getElementById('adm-race-method').value;

        if (!name || !raceDate || !startDateStr) return window.app.toast("Preencha Nome e Datas.");

        let newWorkouts = [];
        let targetDistance = 0;
        let estimatedTime = "Não informado";

        const btn = document.querySelector('#modal-adm-add-race button.btn-primary');
        if(btn) { btn.disabled = true; btn.innerText = "Processando..."; }

        try {
            if (method === 'ia') {
                const dist = parseFloat(document.getElementById('adm-race-dist').value) || 0;
                const time = document.getElementById('adm-race-time').value || "Não informado";
                const video = document.getElementById('adm-race-video').value || "";

                targetDistance = dist;
                estimatedTime = time;

                const response = await fetch(CF_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        dist: dist,
                        estTime: time,
                        startDate: startDateStr,
                        raceDate: raceDate,
                        strengthVideo: video
                    })
                });

                if (!response.ok) {
                    let errorDetails = "Erro desconhecido";
                    try {
                        const errorJson = await response.json();
                        errorDetails = errorJson.error || JSON.stringify(errorJson);
                    } catch(e) { errorDetails = await response.text(); }
                    throw new Error(`Worker Error: ${errorDetails}`);
                }

                const aiWorkoutsRaw = await response.json();
                if (!Array.isArray(aiWorkoutsRaw)) throw new Error("Formato inválido recebido da IA.");

                newWorkouts = aiWorkoutsRaw.map(w => ({
                    title: w.title,
                    desc: w.desc,
                    video: w.video || "",
                    done: false,
                    scheduledDate: w.date,
                    type: w.type || (w.title.toLowerCase().includes('fortalecimento') ? 'strength' : 'run')
                }));

            } else {
                const tplId = document.getElementById('adm-race-template-select').value;
                if (!tplId) throw new Error("Selecione um modelo.");

                const tSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tplId));
                if (!tSnap.exists()) throw new Error("Modelo não encontrado.");
                
                const tData = tSnap.data();
                const startDate = new Date(startDateStr);
                
                newWorkouts = tData.workouts.map((w, index) => {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + index);
                    return { ...w, scheduledDate: date.toISOString().split('T')[0], done: false };
                });
            }

            const userRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) throw new Error("Usuário não encontrado.");
            
            const uData = userSnap.data();
            const races = uData.races || [];
            
            races.push({ 
                name, 
                date: raceDate, 
                targetDistance, 
                estimatedTime,
                workouts: newWorkouts, 
                created: new Date().toISOString() 
            });

            await updateDoc(userRef, { races });
            
            window.app.toast("Objetivo criado com sucesso!");
            document.getElementById('modal-adm-add-race').classList.remove('active');

        } catch (error) {
            console.error(error);
            window.app.toast("Erro: " + error.message);
        } finally {
            if(btn) { btn.disabled = false; btn.innerText = "Criar"; }
        }
    },

    admDelRaceInline: async (docId, rIdx) => { window.app.showConfirm("Apagar objetivo?", async () => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); u.races.splice(rIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); }); },
    admDeleteUserQuick: async (docId) => { window.app.showConfirm(`Apagar permanentemente?`, async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); }); },

    admLoadTemplates: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (snap) => {
            const list = document.getElementById('adm-templates-list'); list.innerHTML = '';
            let html = '';
            snap.forEach(d => {
                const t = d.data(); const tId = d.id; const isTplOpen = expandedTemplates.has(tId) ? 'open' : '';
                let workoutsHtml = '';
                if(t.workouts && t.workouts.length > 0) {
                    t.workouts.forEach((w, wIdx) => {
                        workoutsHtml += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:8px 0;"><div style="flex:1;"><span style="font-size:13px; font-weight:600;">${w.title}</span><br><small>${w.desc}</small></div><div style="display:flex; gap:5px;"><button onclick="window.app.admMoveWorkout('${tId}', ${wIdx}, -1)"><i class="fa-solid fa-arrow-up"></i></button><button onclick="window.app.admMoveWorkout('${tId}', ${wIdx}, 1)"><i class="fa-solid fa-arrow-down"></i></button><button onclick="window.app.admEditWorkoutFromTemplate('${tId}', ${wIdx})"><i class="fa-solid fa-pencil"></i></button><button onclick="window.app.admDeleteWorkoutFromTemplate('${tId}', ${wIdx})" style="color:red">X</button></div></div>`;
                    });
                } else { workoutsHtml = '<small>Sem treinos.</small>'; }
                html += `<div class="card" style="padding:10px; margin-bottom:10px;"><div class="adm-row-header" onclick="window.app.admToggleTemplate('${tId}')"><span>${t.name}</span><i class="fa-solid fa-chevron-down"></i></div><div id="tpl-content-${tId}" class="adm-nested ${isTplOpen}">${workoutsHtml}<div style="display:flex; justify-content:space-between; margin-top:10px;"><button onclick="window.app.admAddWorkoutToTemplateInline('${tId}')" class="adm-btn-small">+ Treino</button><button onclick="window.app.admDelTemplate('${tId}')" style="color:red; font-size:11px; border:none; background:none;">Excluir Modelo</button></div></div></div>`;
            });
            list.innerHTML = html;
        });
    },

    admToggleTemplate: (tId) => { if(expandedTemplates.has(tId)) expandedTemplates.delete(tId); else expandedTemplates.add(tId); const el = document.getElementById(`tpl-content-${tId}`); if(el) el.classList.toggle('open'); },
    admAddTemplateInline: async () => { window.app.showPrompt("Nome do Modelo:", async (name) => { if(!name) return; await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES)), { name, workouts: [] }); }); },
    admAddWorkoutToTemplateInline: (tId) => { isEditingTemplate = true; currentTemplateId = tId; editingWorkoutIndex = null; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admEditWorkoutFromTemplate: async (tId, wIdx) => { isEditingTemplate = true; currentTemplateId = tId; editingWorkoutIndex = wIdx; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const w = snap.data().workouts[wIdx]; document.getElementById('new-w-title').value = w.title; document.getElementById('new-w-desc').value = w.desc; document.getElementById('new-w-video').value = w.video || ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admMoveWorkout: async (tId, wIdx, direction) => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); const workouts = t.workouts; const newIdx = wIdx + direction; if (newIdx < 0 || newIdx >= workouts.length) return; const temp = workouts[wIdx]; workouts[wIdx] = workouts[newIdx]; workouts[newIdx] = temp; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts }); },
    admDeleteWorkoutFromTemplate: async (tId, wIdx) => { if(!confirm("Remover?")) return; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); t.workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: t.workouts }); },
    admDelTemplate: async (id) => { window.app.showConfirm("Apagar modelo?", async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, id))); },

    previewNewsImg: (input) => { 
        if(input.files && input.files[0]) {
            tempNewsFile = input.files[0];
            const url = URL.createObjectURL(tempNewsFile);
            const img = document.getElementById('news-preview'); 
            img.src = url; 
            img.style.display = 'block'; 
        }
    },

    postNews: async () => {
        const title = document.getElementById('news-title').value; 
        const body = document.getElementById('news-body').value;
        if(!title || !body) return window.app.toast('Preencha tudo');
        document.getElementById('btn-post-news').disabled = true;
        let imgUrl = null;
        if(tempNewsFile) imgUrl = await window.app.uploadImage(tempNewsFile, 'news');
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS)), { 
            title, body, img: imgUrl, created: Date.now() 
        });
        document.getElementById('news-title').value = ''; 
        document.getElementById('news-body').value = ''; 
        tempNewsFile = null; 
        document.getElementById('news-preview').style.display = 'none'; 
        document.getElementById('btn-post-news').disabled = false;
        window.app.toast("Notícia publicada!");
        window.app.admTab('news');
    },

    admLoadNewsHistory: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const div = document.getElementById('adm-news-history'); div.innerHTML = '';
            snap.forEach(d => { div.innerHTML += `<div style="padding:10px; border-bottom:1px solid #CCC; display:flex; justify-content:space-between;"><span>${d.data().title}</span><button onclick=\"window.app.admDeleteNews('${d.id}')\" style=\"color:red; border:none; background:none;\">X</button></div>`; });
        });
    },
    
    admDeleteNews: async (id) => { 
        if(confirm("Apagar notícia?")) { 
            const refDoc = doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id);
            const snap = await getDoc(refDoc);
            if(snap.exists() && snap.data().img) await window.app.deleteFile(snap.data().img);
            await deleteDoc(refDoc);
        } 
    },

    postQuote: async () => {
        const text = document.getElementById('adm-quote-text').value; if(!text) return;
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES)), { text, created: Date.now() });
        document.getElementById('adm-quote-text').value = '';
    },

    admLoadQuotes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s) => {
            const l = document.getElementById('adm-quotes-list'); l.innerHTML = '';
            s.forEach(d=>{ l.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee;">"${d.data().text}" <button onclick="window.app.admDelQuote('${d.id}')" style="color:red;float:right;border:none;">X</button></div>` });
        });
    },

    admDelQuote: async (id) => { window.app.showConfirm('Apagar frase?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id))); },
};

window.onload = window.app.init;
