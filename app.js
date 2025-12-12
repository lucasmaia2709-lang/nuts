import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// NOVO: Import do Storage para imagens
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = { apiKey: "AIzaSyAZc5IXA3PRIadz87sysrC_7lLZZG-7Izw", authDomain: "app-corrida-d3568.firebaseapp.com", projectId: "app-corrida-d3568", storageBucket: "app-corrida-d3568.firebasestorage.app", messagingSenderId: "690843260846", appId: "1:690843260846:web:e32be21759c9e813bada3f", measurementId: "G-26RNCCZYED" };

// INICIALIZAÇÃO
const appInit = initializeApp(firebaseConfig);
const auth = getAuth(appInit);
const db = getFirestore(appInit);
const storage = getStorage(appInit); // Init Storage
const appId = "1:690843260846:web:e32be21759c9e813bada3f";

// CONSTANTES E CONFIGURAÇÕES
const C_USERS = 'expliq_users_v9';
const C_POSTS = 'expliq_posts_v9';
const C_NEWS = 'expliq_news_v9';
const C_RECIPES = 'expliq_recipes_v9';
const C_QUOTES = 'expliq_quotes_v9';
const C_TEMPLATES = 'expliq_templates_v9';

// !!! SEGURANÇA ADMIN !!!
// Coloque aqui o email do treinador.
const ADMIN_EMAILS = ["admin@nuts.com", "seuemail@exemplo.com"]; 

let currentUser = null;
let currentMonth = new Date();
let selectedDayDate = null; 

// Variáveis temporárias (não use Base64 para storage, use File object)
let tempPostFile = null;
let tempNewsFile = null;
let tempRecFile = null;

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
let allRecipes = [];

window.app = {
    init: async () => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                app.loadUser(user.email);
            } else {
                app.screen('view-landing');
            }
        });
        app.renderCalendar();
    },
    
    // --- HELPER DE UPLOAD (Storage) ---
    // Recebe o arquivo e uma pasta (ex: 'avatars' ou 'posts')
    uploadFileToStorage: async (file, folder) => {
        if(!file) return null;
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const storageRef = ref(storage, `${folder}/${fileName}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error("Erro upload:", error);
            app.toast("Erro ao enviar imagem");
            return null;
        }
    },

    escape: (str) => {
        if (!str) return '';
        return str.toString().replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
    },

    // --- UI HELPERS ---
    screen: (id) => { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); const el = document.getElementById(id); if(el) el.classList.add('active'); },
    nav: (tab) => {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
        document.getElementById('tab-'+tab).classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        if(tab === 'home') app.renderHome();
        if(tab === 'workouts') app.renderWorkoutsList();
        if(tab === 'social') app.loadFeed();
        if(tab === 'recipes') app.loadRecipes();
        if(tab === 'news') app.loadNews();
    },
    toast: (msg) => { const t = document.getElementById('toast-container'); t.innerHTML = `<div class="toast show">${msg}</div>`; setTimeout(() => t.innerHTML='', 3000); },
    
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

    goToLogin: () => app.screen('view-login'),
    goToRegister: () => app.screen('view-register'),
    goToLanding: () => app.screen('view-landing'),

    // --- AUTH ---
    handleRegister: async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value.toLowerCase();
        const pass = document.getElementById('reg-pass').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            const newUser = { name, email, active: false, avatar: null, races: [], notes: {}, created: Date.now() };
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), newUser);
            await signOut(auth);
            app.toast("Cadastro realizado! Faça login para entrar.");
            app.screen('view-login');
        } catch(err) { 
            let msg = 'Erro ao cadastrar.';
            if(err.code === 'auth/email-already-in-use') msg = 'Email já registado. Por favor, faça login.';
            else if(err.code === 'auth/weak-password') msg = 'Senha muito fraca.';
            app.toast(msg); 
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        const email = document.getElementById('log-email').value.toLowerCase();
        const pass = document.getElementById('log-pass').value;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            // Se o usuário não existir no Firestore (criado manualmente no Auth), cria aqui
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, user.email);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                const newUser = { name: "Aluno(a)", email: user.email, active: false, avatar: null, races: [], notes: {}, created: Date.now() };
                await setDoc(docRef, newUser);
            }
        } catch(err) { app.toast('Email ou senha inválidos.'); }
    },

    forgotPassword: () => {
        app.showPrompt("Digite seu email para recuperar:", (email) => {
            sendPasswordResetEmail(auth, email)
            .then(() => app.toast("Email de recuperação enviado!"))
            .catch(e => app.toast("Erro: " + e.message));
        });
    },

    loadUser: (email) => {
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), (doc) => {
            if(doc.exists()) {
                currentUser = doc.data();
                
                // SEGURANÇA ADMIN: Verifica se o email está na lista de admins
                if(ADMIN_EMAILS.includes(currentUser.email)) {
                     document.getElementById('btn-admin-access').style.display = 'block';
                } else {
                     document.getElementById('btn-admin-access').style.display = 'none';
                }

                if (document.getElementById('view-admin').classList.contains('active')) return;
                
                // Se for admin, pula a verificação de 'active'
                if(!currentUser.active && !ADMIN_EMAILS.includes(currentUser.email)) { 
                    app.screen('view-pending'); 
                    return; 
                }
                
                const av = currentUser.avatar;
                const himg = document.getElementById('header-avatar-img');
                const htxt = document.getElementById('header-avatar-txt');
                if(av) { himg.src=av; himg.style.display='block'; htxt.style.display='none'; }
                else { himg.style.display='none'; htxt.style.display='block'; htxt.innerText=currentUser.name[0]; }
                
                app.screen('view-app');
                app.nav('home');
            }
        });
    },

    logout: () => { signOut(auth).then(() => { currentUser = null; app.screen('view-landing'); }); },
    
    // --- PERFIL ---
    openProfile: () => {
        if(!currentUser) return;
        app.screen('view-profile');
        document.getElementById('profile-name-big').innerText = currentUser.name;
        document.getElementById('profile-email-big').innerText = currentUser.email;
        const img = document.getElementById('profile-img-big');
        if(currentUser.avatar) { img.src=currentUser.avatar; img.style.display='block'; }
        const hList = document.getElementById('profile-history');
        hList.innerHTML = '';
        (currentUser.races || []).forEach(r => {
            const done = r.workouts.filter(w=>w.done).length;
            const total = r.workouts.length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;
            hList.innerHTML += `<div style="margin-bottom:15px;"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong style="font-size:14px;">${r.name}</strong> <span style="font-size:12px; font-weight:600; color:var(--primary);">${pct}%</span></div><div style="height:6px; background:#eee; border-radius:3px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:var(--primary);"></div></div></div>`;
        });
    },
    closeProfile: () => app.screen('view-app'),
    
    // UPLOAD AVATAR (STORAGE)
    uploadAvatar: async (input) => {
        if(input.files && input.files[0]) {
            app.toast("Enviando imagem...");
            const url = await app.uploadFileToStorage(input.files[0], 'avatars');
            if(url) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { avatar: url });
                app.toast("Foto atualizada!");
                app.openProfile();
            }
        }
    },
    
    showAddRaceModal: () => document.getElementById('modal-add-race').classList.add('active'),
    addStudentRace: async () => {
        const name = document.getElementById('new-race-name').value;
        const date = document.getElementById('new-race-date').value;
        if(!name) return;
        const workouts = []; 
        const races = currentUser.races || [];
        races.push({ name, date, workouts, created: new Date().toISOString() });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentUser.email), { races });
        document.getElementById('modal-add-race').classList.remove('active');
        app.toast('Objetivo criado!');
        app.openProfile();
    },

    // --- CALENDÁRIO & HOME ---
    changeMonth: (dir) => { currentMonth.setMonth(currentMonth.getMonth() + dir); app.renderCalendar(); },
    renderCalendar: () => {
        if(!currentUser) return;
        const y = currentMonth.getFullYear();
        const m = currentMonth.getMonth();
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m+1, 0).getDate();
        document.getElementById('cal-month-title').innerText = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
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
            
            if (scheduled) {
                 cellClass += ' has-workout'; 
                 dotHtml += `<div class="cal-dot"></div>`;
                 workoutData = scheduled;
                 if(scheduled.done) cellClass += ' done';
            }
            else if(doneHere) { 
                cellClass += ' done'; 
                dotHtml += `<div class="cal-dot"></div>`; 
                workoutData = doneHere; 
            } 
            
            if(notes[dateStr]) { dotHtml += `<div class="cal-note-indicator"></div>`; }
            
            const el = document.createElement('div');
            el.className = cellClass;
            el.innerText = d;
            el.innerHTML += dotHtml;
            el.onclick = () => app.openDayDetail(dateStr, workoutData);
            grid.appendChild(el);
        }
    },
    
    openDayDetail: (dateStr, workoutData) => {
        selectedDayDate = dateStr;
        const modal = document.getElementById('modal-day-detail');
        document.getElementById('day-det-title').innerText = `Dia ${dateStr.split('-').reverse().join('/')}`;
        let content = '';
        if(workoutData) {
            content = `<div style="background:#f5f5f5; padding:15px; border-radius:10px; margin-bottom:15px;">
                <h4 style="margin:0 0 5px 0;">${workoutData.title}</h4>
                <p style="margin:0; font-size:13px; color:#666;">${workoutData.desc}</p>
                ${workoutData.done ? '<strong style="color:var(--success); font-size:12px;">Concluído</strong>' : '<span style="color:var(--orange); font-size:12px;">Pendente</span>'}
            </div>`;
        } else { content = `<p style="color:#999; text-align:center; margin-bottom:15px;">Sem treino registrado para este dia.</p>`; }
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
        app.toast("Nota salva!");
        document.getElementById('modal-day-detail').classList.remove('active');
        app.renderCalendar();
    },

    renderHome: () => { 
        app.renderCalendar(); 
        app.renderTodayCard(); 
        app.loadQuote(); 
        app.loadHomeNews();
    },
    
    loadHomeNews: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const news = []; 
            snap.forEach(d => news.push(d.data())); 
            news.sort((a,b) => b.created - a.created);
            
            const container = document.getElementById('home-latest-news');
            if(news.length > 0) {
                const n = news[0];
                container.innerHTML = `
                    <h3 style="font-size: 16px; margin: 0 0 15px;">Última Novidade</h3>
                    <div class="card news-card" style="margin-bottom:0;">
                        ${n.img ? `<img src="${n.img}" class="news-img" style="height:150px;">` : ''}
                        <div class="news-content" style="padding:15px;">
                            <div class="news-date" style="font-size:10px;">${new Date(n.created).toLocaleDateString()}</div>
                            <h3 class="news-title" style="font-size:16px;">${n.title}</h3>
                            <div class="news-body" style="font-size:13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${n.body}</div>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '';
            }
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
        const raceDate = activeRace.date ? new Date(activeRace.date).toLocaleDateString() : 'Sem data';
        let cardHtml = '';
        
        const safeTitle = target ? app.escape(target.title) : '';
        const safeVideo = target && target.video ? app.escape(target.video) : '';
        
        if(target) {
            const doneBtn = target.done ? `<button class="btn" style="background:rgba(255,255,255,0.2); color:#FFF; flex:1; cursor:default;" disabled><i class="fa-solid fa-check"></i> Feito</button>` : `<button onclick="app.finishWorkout('${safeTitle}')" class="btn" style="background:#FFF; color:var(--text-main); flex:1;">Concluir</button>`;
            let dateDisplay = "";
            if(target.scheduledDate) {
                const dParts = target.scheduledDate.split('-');
                dateDisplay = `<span style="font-size:12px; color:rgba(255,255,255,0.7); margin-left:8px; font-weight:400;">${dParts[2]}/${dParts[1]}</span>`;
            }

            cardHtml = `<div class="card" style="background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color: var(--text-main); border: none; padding:30px;">
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
                    ${safeVideo ? `<button onclick="app.playVideo('${safeVideo}')" class="btn" style="background:rgba(255,255,255,0.4); color:var(--text-main); padding:0 20px; width:auto; display:flex; gap:8px;"><i class="fa-solid fa-play"></i> Vídeo</button>` : ''}
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
    finishWorkout: async (wTitle) => {
        const races = [...currentUser.races];
        const rIdx = races.length - 1;
        const wIdx = races[rIdx].workouts.findIndex(w => w.title === wTitle && !w.done);
        if(wIdx > -1) {
            races[rIdx].workouts[wIdx].done = true;
            races[rIdx].workouts[wIdx].completedAt = new Date().toISOString().split('T')[0];
            currentUser.races = races;
            app.renderHome();
            app.toast("Treino Concluído!");
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
        </div>
        `;

        activeRace.workouts.forEach((w, i) => {
            const color = w.done ? 'var(--success)' : '#E0E0E0';
            const icon = w.done ? 'fa-circle-check' : 'fa-circle';
            const safeVideo = w.video ? app.escape(w.video) : '';
            
            let dateBadge = '';
            if(w.scheduledDate) {
                 const dParts = w.scheduledDate.split('-');
                 dateBadge = `<span style="font-size:10px; color:#FFF; background:var(--primary); padding:2px 6px; border-radius:6px; margin-left:8px; font-weight:600;">${dParts[2]}/${dParts[1]}</span>`;
            }

            list.innerHTML += `<div class="card" style="display:flex; align-items:center; gap: 15px; opacity: ${w.done?0.6:1}; padding:20px;">
                <div style="color:${color}; font-size:24px;"><i class="fa-solid ${icon}"></i></div>
                <div style="flex:1;">
                    <h4 style="margin:0; font-size:16px;">${w.title} ${dateBadge}</h4>
                    <p style="margin:0; font-size:13px; color:var(--text-sec); margin-top:4px;">${w.desc}</p>
                </div>
                ${safeVideo ? `<button onclick="app.playVideo('${safeVideo}')" style="border:1px solid var(--secondary); background:transparent; color:var(--text-main); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-play" style="color:var(--primary);"></i> Vídeo</button>` : ''}
            </div>`;
        });
    },

    // --- SOCIAL & STORAGE ---
    loadFeed: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), (snap) => {
            const feed = document.getElementById('social-feed');
            feed.innerHTML = '';
            const posts = [];
            snap.forEach(d => posts.push({id:d.id, ...d.data()}));
            posts.sort((a,b) => b.created - a.created);
            posts.forEach(p => {
                const imgUrl = p.img || p.image; 
                let deleteBtn = '';
                if (currentUser && (p.email === currentUser.email || ADMIN_EMAILS.includes(currentUser.email))) {
                    deleteBtn = `<button onclick="app.deletePost('${p.id}')" style="border:none; background:none; color:var(--red); font-size:14px; margin-left:auto;"><i class="fa-solid fa-trash"></i></button>`;
                }
                feed.innerHTML += `
                <div class="card" style="padding:0; overflow:hidden;">
                    <div style="padding:20px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #f5f5f5;">
                        <div style="width:40px; height:40px; border-radius:50%; background:#EEE; overflow:hidden;">${p.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;">` : ''}</div>
                        <div>
                            <strong style="font-size:15px; display:block; color:var(--text-main);">${p.userName}</strong>
                            <span style="font-size:11px; color:var(--text-sec);">${new Date(p.created).toLocaleDateString()}</span>
                        </div>
                        ${deleteBtn}
                    </div>
                    ${imgUrl ? `<img src="${imgUrl}" style="width:100%; max-height:400px; object-fit:cover;">` : ''}
                    <div style="padding:20px;"><p style="margin:0; font-size:15px; line-height:1.5; color:var(--text-main);">${p.text}</p></div>
                </div>`;
            });
        });
    },
    deletePost: async (postId) => {
        app.showConfirm("Excluir publicação?", async () => {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId));
            app.toast("Publicação removida.");
        });
    },
    openCreatePost: () => app.screen('view-create-post'),
    closeCreatePost: () => app.screen('view-app'),
    // PREVIEW IMAGEM POST (agora apenas mostra, não converte base64 para variavel final)
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
        app.toast("Enviando...");
        
        let imgUrl = null;
        if(tempPostFile) {
            imgUrl = await app.uploadFileToStorage(tempPostFile, 'posts');
        }

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS)), { 
            userName: currentUser.name, 
            email: currentUser.email, 
            avatar: currentUser.avatar, 
            text: text, 
            img: imgUrl, 
            created: Date.now() 
        });
        
        document.getElementById('post-text').value = ''; 
        tempPostFile = null; 
        document.getElementById('post-img-preview').style.display = 'none'; 
        document.getElementById('btn-submit-post').disabled = false;
        app.closeCreatePost();
    },

    // --- RECEITAS & NOTICIAS ---
    loadRecipes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_RECIPES), (snap) => {
            const l = document.getElementById('recipes-list');
            l.innerHTML = '';
            allRecipes = [];
            snap.forEach(d => {
                const r = {id: d.id, ...d.data()};
                allRecipes.push(r);
                const rImg = r.img || r.image || 'https://via.placeholder.com/300x200?text=No+Image';
                l.innerHTML += `<div class="recipe-card" onclick="app.openRecipeDetail('${r.id}')"><div class="recipe-img" style="background-image:url('${rImg}')"></div><div style="padding:15px;"><strong style="font-size:16px; color:var(--text-main);">${r.title}</strong><div class="recipe-meta" style="margin-top:5px; color:var(--primary);">${r.kcal} kcal | ${r.time} min</div></div></div>`;
            });
        });
    },
    openRecipeDetail: (id) => {
        const r = allRecipes.find(x => x.id === id);
        if(!r) return;
        const rImg = r.img || r.image || 'https://via.placeholder.com/300x200?text=No+Image';
        document.getElementById('rec-det-img').style.backgroundImage = `url('${rImg}')`;
        document.getElementById('rec-det-title').innerText = r.title;
        document.getElementById('rec-det-meta').innerText = `${r.kcal} kcal | ${r.time} min`;
        document.getElementById('rec-det-p').innerText = r.p || 0;
        document.getElementById('rec-det-c').innerText = r.c || 0;
        document.getElementById('rec-det-f').innerText = r.f || 0;
        const ul = document.getElementById('rec-det-ing'); ul.innerHTML = '';
        if(r.ingredients) (Array.isArray(r.ingredients) ? r.ingredients : r.ingredients.split('\n')).forEach(i => ul.innerHTML+=`<li>${i}</li>`);
        const st = document.getElementById('rec-det-steps'); st.innerHTML = '';
        if(r.steps) (Array.isArray(r.steps) ? r.steps : r.steps.split('\n')).forEach((s, i) => st.innerHTML+=`<p><strong>${i+1}.</strong> ${s}</p>`);
        document.getElementById('view-recipe-detail').classList.add('active');
    },
    closeRecipeDetail: () => {
        document.getElementById('view-recipe-detail').classList.remove('active');
    },
    loadNews: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const feed = document.getElementById('news-feed'); feed.innerHTML = '';
            const news = []; snap.forEach(d => news.push(d.data())); news.sort((a,b) => b.created - a.created);
            news.forEach(n => { 
                feed.innerHTML += `
                <div class="card news-card">
                    ${n.img ? `<img src="${n.img}" class="news-img">` : ''}
                    <div class="news-content">
                        <div class="news-date">${new Date(n.created).toLocaleDateString()}</div>
                        <h3 class="news-title">${n.title}</h3>
                        <div class="news-body" style="font-size:15px; line-height:1.6; color:var(--text-main);">${n.body}</div>
                    </div>
                </div>`; 
            });
        });
    },

    // --- ADMIN LOGIC ---
    loadAdmin: () => { 
        document.getElementById('view-admin').classList.add('active'); 
        app.admTab('users'); 
    },
    closeAdmin: () => app.screen('view-landing'),
    admTab: (t) => {
        document.querySelectorAll('[id^="adm-content"]').forEach(e=>e.classList.add('hidden'));
        document.getElementById('adm-content-'+t).classList.remove('hidden');
        document.querySelectorAll('.admin-tab-btn').forEach(b=>b.classList.remove('active'));
        document.getElementById('btn-adm-'+t).classList.add('active');
        if(t === 'users') app.admLoadUsers();
        if(t === 'news') app.admLoadNewsHistory();
        if(t === 'recipes') app.admLoadRecipes();
        if(t === 'quotes') app.admLoadQuotes();
        if(t === 'templates') app.admLoadTemplates();
    },
    
    admLoadUsers: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_USERS), (snap) => {
            const list = document.getElementById('adm-users-list'); 
            let html = '';
            snap.forEach(d => {
                const u = d.data(); 
                const docId = d.id;
                const safeId = app.escape(docId);
                const isUserOpen = expandedUsers.has(docId) ? 'open' : '';
                const checked = u.active ? 'checked' : '';
                
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
                                workoutsHtml += `
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:5px 0;">
                                    <span style="font-size:12px;">${wDate} ${w.title}</span>
                                    <button onclick="app.admDeleteWorkoutInline('${safeId}', ${rIdx}, ${wIdx})" style="color:var(--red); border:none; background:none; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
                                </div>`;
                            });
                        } else { workoutsHtml = '<p style="font-size:11px; color:#999;">Sem treinos.</p>'; }

                        workoutsHtml += `
                        <div style="display:flex; gap:5px; margin-top:10px; justify-content:flex-end;">
                            <button onclick="app.admAddWorkoutInline('${safeId}', ${rIdx}')" class="adm-btn-small" style="background:#f0f0f0;">+ Treino</button>
                            <button onclick="app.admImportTemplateInline('${safeId}', ${rIdx})" class="adm-btn-small" style="background:#f0f0f0;">+ Modelo</button>
                        </div>`;

                        goalsHtml += `
                        <div class="adm-item-box">
                            <div class="adm-row-header" onclick="app.admToggleGoal('${raceKey}')">
                                <strong>${r.name}</strong>
                                <i class="fa-solid fa-chevron-down" style="font-size:12px; opacity:0.5;"></i>
                            </div>
                            <div id="goal-content-${raceKey}" class="adm-nested ${isRaceOpen}">
                                ${workoutsHtml}
                                <div style="text-align:right; margin-top:5px;">
                                    <button onclick="app.admDelRaceInline('${safeId}', ${rIdx})" style="font-size:10px; color:red; border:none; background:none; cursor:pointer;">Excluir Objetivo</button>
                                </div>
                            </div>
                        </div>`;
                    });
                } else { goalsHtml = '<p style="font-size:12px; color:#999; padding:10px;">Sem objetivos cadastrados.</p>'; }

                html += `
                <div class="card" style="padding:15px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:15px; padding-bottom:5px;">
                        <input type="checkbox" class="check-toggle" ${checked} onchange="app.admToggleStatus('${safeId}', this.checked)">
                        <div style="flex:1; cursor:pointer;" onclick="app.admToggleUser('${safeId}')">
                            <span style="font-weight:700; font-size:16px;">${u.name}</span>
                            <br><span style="font-size:12px; color:#888;">${u.email}</span>
                        </div>
                        <button onclick="app.admDeleteUserQuick('${safeId}')" style="border:none; background:none; color:var(--red); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div id="user-content-${docId}" class="adm-nested ${isUserOpen}" style="border-left:none; padding-left:0; margin-top:15px;">
                        ${goalsHtml}
                        <button onclick="app.admAddRaceInline('${safeId}')" style="width:100%; border:2px dashed #eee; background:none; padding:12px; font-size:13px; margin-top:10px; color:var(--primary); font-weight:600; border-radius:12px; cursor:pointer;">+ Novo Objetivo</button>
                    </div>
                </div>`;
            });
            list.innerHTML = html;
        });
    },
    
    admToggleUser: (docId) => {
        if(expandedUsers.has(docId)) expandedUsers.delete(docId); else expandedUsers.add(docId);
        const el = document.getElementById(`user-content-${docId}`); if(el) el.classList.toggle('open');
    },
    admToggleGoal: (key) => {
        if(expandedRaces.has(key)) expandedRaces.delete(key); else expandedRaces.add(key);
        const el = document.getElementById(`goal-content-${key}`); if(el) el.classList.toggle('open');
    },
    admToggleStatus: async (docId, status) => {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { active: status });
        app.toast(status ? "Aluno aprovado" : "Aluno bloqueado");
    },
    
    admAddWorkoutInline: (docId, rIdx) => {
        currentAdmUser = docId; currentAdmRaceIdx = rIdx; isEditingTemplate = false; editingWorkoutIndex = null;
        document.getElementById('modal-workout-title').innerText = "Novo Treino";
        document.getElementById('new-w-title').value = ''; document.getElementById('new-w-desc').value = ''; document.getElementById('new-w-video').value = '';
        document.getElementById('modal-add-single-workout').classList.add('active');
    },
    
    saveSingleWorkout: async () => {
        const title = document.getElementById('new-w-title').value;
        const desc = document.getElementById('new-w-desc').value;
        const video = document.getElementById('new-w-video').value;
        if(!title) return app.toast('Título obrigatório');
        
        try {
            if (isEditingTemplate) {
                const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, currentTemplateId));
                const t = snap.data();
                if (editingWorkoutIndex !== null) { t.workouts[editingWorkoutIndex] = { title, desc, video, done: false }; app.toast("Treino atualizado"); } 
                else { t.workouts.push({ title, desc, video, done: false }); app.toast("Treino adicionado ao modelo"); }
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, currentTemplateId), { workouts: t.workouts });
            } else {
                const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser));
                const u = snap.data();
                if (!u.races[currentAdmRaceIdx].workouts) u.races[currentAdmRaceIdx].workouts = [];
                u.races[currentAdmRaceIdx].workouts.push({title, desc, video, done:false});
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, currentAdmUser), { races: u.races });
                app.toast("Treino adicionado ao aluno");
            }
            document.getElementById('modal-add-single-workout').classList.remove('active');
        } catch(e) { console.error(e); app.toast("Erro ao salvar"); }
    },

    admImportTemplateInline: (docId, rIdx) => {
        currentAdmUser = docId; currentAdmRaceIdx = rIdx;
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (s) => {
            const list = document.getElementById('template-select-list'); list.innerHTML = '';
            if(s.empty) { list.innerHTML = '<p>Nenhum modelo cadastrado.</p>'; return; }
            s.forEach(d => {
                const t = d.data();
                list.innerHTML += `<label style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee; cursor:pointer;"><input type="radio" name="selected_template" value="${d.id}" style="margin-right:15px; width:18px; height:18px;"><div><strong style="font-size:16px;">${t.name}</strong><br><span style="font-size:12px; color:#888;">${t.workouts.length} treinos</span></div></label>`;
            });
            document.getElementById('modal-select-template').classList.add('active');
        });
    },
    
    confirmTemplateImport: async () => {
        const selected = document.querySelector('input[name="selected_template"]:checked');
        const startDateInput = document.getElementById('template-start-date').value;
        if(!selected) return app.toast('Selecione um modelo');
        if(!startDateInput) return app.toast('Selecione a data de início');
        
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
        app.toast("Modelo importado com datas!");
        document.getElementById('modal-select-template').classList.remove('active');
    },

    admDeleteWorkoutInline: async (docId, rIdx, wIdx) => {
        app.showConfirm("Remover este treino?", async () => {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId));
            const u = snap.data();
            u.races[rIdx].workouts.splice(wIdx, 1);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races });
            app.toast("Treino removido.");
        });
    },
    admAddRaceInline: async (docId) => {
        app.showPrompt("Nome do Objetivo:", async (name) => {
            if(!name) return;
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId));
            const u = snap.data();
            const races = u.races || [];
            races.push({ name, date: '', workouts: [], created: new Date().toISOString() });
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races });
            app.toast("Objetivo criado");
        });
    },
    admDelRaceInline: async (docId, rIdx) => {
        app.showConfirm("Apagar objetivo e seus treinos?", async () => {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId));
            const u = snap.data();
            u.races.splice(rIdx, 1);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races });
            app.toast("Objetivo removido.");
        });
    },
    admDeleteUserQuick: async (docId) => {
        app.showConfirm(`Apagar permanentemente?`, async () => {
              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId));
              app.toast("Aluno excluído.");
        });
    },

    // --- TEMPLATES ---
    admLoadTemplates: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (snap) => {
            const list = document.getElementById('adm-templates-list'); list.innerHTML = '';
            if (snap.empty) { list.innerHTML = '<p style="text-align:center; color:#999;">Nenhum modelo criado.</p>'; return; }
            let html = '';
            snap.forEach(d => {
                const t = d.data(); const tId = d.id; const isTplOpen = expandedTemplates.has(tId) ? 'open' : '';
                let workoutsHtml = '';
                if(t.workouts && t.workouts.length > 0) {
                    t.workouts.forEach((w, wIdx) => {
                        const upDisabled = wIdx === 0 ? 'opacity:0.3;' : '';
                        const downDisabled = wIdx === t.workouts.length - 1 ? 'opacity:0.3;' : '';
                        workoutsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:8px 0;">
                            <div style="flex:1;">
                                <span style="font-size:13px; font-weight:600; color:var(--text-main);">${w.title}</span><br>
                                <span style="font-size:11px; color:#666;">${w.desc}</span>
                            </div>
                            <div style="display:flex; gap:5px;">
                                <button onclick="app.admMoveWorkout('${tId}', ${wIdx}, -1)" style="border:1px solid #ddd; background:none; padding:2px 6px; ${upDisabled}"><i class="fa-solid fa-arrow-up"></i></button>
                                <button onclick="app.admMoveWorkout('${tId}', ${wIdx}, 1)" style="border:1px solid #ddd; background:none; padding:2px 6px; ${downDisabled}"><i class="fa-solid fa-arrow-down"></i></button>
                                <button onclick="app.admEditWorkoutFromTemplate('${tId}', ${wIdx})" style="border:1px solid #ddd; background:none; padding:2px 6px;"><i class="fa-solid fa-pencil"></i></button>
                                <button onclick="app.admDeleteWorkoutFromTemplate('${tId}', ${wIdx})" style="color:var(--red); border:none; background:none; font-weight:bold; margin-left:5px;">X</button>
                            </div>
                        </div>`;
                    });
                } else { workoutsHtml = '<p style="font-size:11px; color:#999;">Sem treinos neste modelo.</p>'; }

                html += `
                <div class="card" style="padding:10px; margin-bottom:10px;">
                    <div class="adm-row-header" onclick="app.admToggleTemplate('${tId}')">
                        <span style="font-weight:600; color:var(--text-main);">${t.name}</span>
                        <div><span style="font-size:11px; color:#888; margin-right:10px;">${t.workouts.length} treinos</span><i class="fa-solid fa-chevron-down" style="font-size:12px; opacity:0.5;"></i></div>
                    </div>
                    <div id="tpl-content-${tId}" class="adm-nested ${isTplOpen}">
                        ${workoutsHtml}
                        <div style="display:flex; gap:5px; margin-top:10px; justify-content:space-between;">
                            <button onclick="app.admAddWorkoutToTemplateInline('${tId}')" class="adm-btn-small" style="background:#f0f0f0;">+ Treino</button>
                            <button onclick="app.admDelTemplate('${tId}')" style="color:red; border:none; background:none; font-size:11px;">Excluir Modelo</button>
                        </div>
                    </div>
                </div>`;
            });
            list.innerHTML = html;
        });
    },
    admToggleTemplate: (tId) => { if(expandedTemplates.has(tId)) expandedTemplates.delete(tId); else expandedTemplates.add(tId); const el = document.getElementById(`tpl-content-${tId}`); if(el) el.classList.toggle('open'); },
    admAddTemplateInline: async () => { app.showPrompt("Nome do Novo Modelo:", async (name) => { if(!name) return; await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES)), { name, workouts: [] }); app.toast("Modelo criado"); }); },
    admAddWorkoutToTemplateInline: (tId) => { isEditingTemplate = true; currentTemplateId = tId; editingWorkoutIndex = null; document.getElementById('modal-workout-title').innerText = "Novo Treino"; document.getElementById('new-w-title').value = ''; document.getElementById('new-w-desc').value = ''; document.getElementById('new-w-video').value = ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admEditWorkoutFromTemplate: async (tId, wIdx) => { isEditingTemplate = true; currentTemplateId = tId; editingWorkoutIndex = wIdx; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const w = snap.data().workouts[wIdx]; document.getElementById('modal-workout-title').innerText = "Editar Treino"; document.getElementById('new-w-title').value = w.title; document.getElementById('new-w-desc').value = w.desc; document.getElementById('new-w-video').value = w.video || ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admMoveWorkout: async (tId, wIdx, direction) => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); const workouts = t.workouts; const newIdx = wIdx + direction; if (newIdx < 0 || newIdx >= workouts.length) return; const temp = workouts[wIdx]; workouts[wIdx] = workouts[newIdx]; workouts[newIdx] = temp; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: workouts }); },
    admDeleteWorkoutFromTemplate: async (tId, wIdx) => { if(!confirm("Remover treino do modelo?")) return; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); t.workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: t.workouts }); },
    admDelTemplate: async (id) => { app.showConfirm("Apagar modelo?", async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, id))); },

    // --- NOTICIAS & RECEITAS (ADMIN) com STORAGE ---
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
        if(!title || !body) return app.toast('Preencha tudo');
        
        document.getElementById('btn-post-news').disabled = true;
        app.toast("Enviando...");

        let imgUrl = null;
        if(tempNewsFile) {
            imgUrl = await app.uploadFileToStorage(tempNewsFile, 'news');
        }

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS)), { title, body, img: imgUrl, created: Date.now() });
        app.toast('Publicado!'); 
        document.getElementById('news-title').value=''; 
        document.getElementById('news-body').value=''; 
        document.getElementById('news-preview').style.display='none'; 
        tempNewsFile = null; 
        document.getElementById('btn-post-news').disabled = false;
        app.admLoadNewsHistory();
    },
    admLoadNewsHistory: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const div = document.getElementById('adm-news-history'); div.innerHTML = '';
            snap.forEach(d => { div.innerHTML += `<div style="padding:10px; border-bottom:1px solid #CCC; display:flex; justify-content:space-between; align-items:center;"><span>${d.data().title}</span><button onclick="app.admDeleteNews('${d.id}')" style="color:red; border:none; background:none; font-weight:bold; cursor:pointer;">X</button></div>`; });
        });
    },
    admDeleteNews: async (id) => { if(confirm("Apagar esta notícia?")) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id)); app.toast("Notícia removida."); } },

    previewRecImg: (input) => { 
        if(input.files && input.files[0]) {
            tempRecFile = input.files[0];
            const url = URL.createObjectURL(tempRecFile);
            const img = document.getElementById('adm-rec-preview'); 
            img.src = url; 
            img.style.display = 'block'; 
        }
    },
    postRecipe: async () => {
        const title = document.getElementById('adm-rec-title').value;
        const kcal = document.getElementById('adm-rec-kcal').value;
        const time = document.getElementById('adm-rec-time').value;
        const p = document.getElementById('adm-rec-p').value;
        const c = document.getElementById('adm-rec-c').value;
        const f = document.getElementById('adm-rec-f').value;
        const ing = document.getElementById('adm-rec-ing').value.split('\n');
        const steps = document.getElementById('adm-rec-steps').value.split('\n');
        
        if(!title) return app.toast('Titulo obrigatorio');
        
        document.getElementById('btn-post-recipe').disabled = true;
        app.toast("Enviando...");

        let imgUrl = null;
        if(tempRecFile) {
            imgUrl = await app.uploadFileToStorage(tempRecFile, 'recipes');
        }

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_RECIPES)), {
            title, kcal, time, p, c, f, ingredients: ing, steps: steps, img: imgUrl, created: Date.now()
        });
        
        app.toast('Receita Salva');
        tempRecFile = null;
        document.getElementById('adm-rec-preview').style.display='none';
        document.getElementById('btn-post-recipe').disabled = false;
        app.admLoadRecipes();
    },
    admLoadRecipes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_RECIPES), (s) => {
            const l = document.getElementById('adm-recipes-list'); l.innerHTML = '';
            s.forEach(d=>{ l.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee;">${d.data().title} <button onclick="app.admDelRec('${d.id}')" style="color:red;float:right;border:none;">X</button></div>` });
        });
    },
    admDelRec: async (id) => { app.showConfirm('Apagar receita?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_RECIPES, id))); },

    postQuote: async () => {
        const text = document.getElementById('adm-quote-text').value; if(!text) return;
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES)), { text, created: Date.now() });
        document.getElementById('adm-quote-text').value = ''; app.admLoadQuotes();
    },
    admLoadQuotes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s) => {
            const l = document.getElementById('adm-quotes-list'); l.innerHTML = '';
            s.forEach(d=>{ l.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee;">"${d.data().text}" <button onclick="app.admDelQuote('${d.id}')" style="color:red;float:right;border:none;">X</button></div>` });
        });
    },
    admDelQuote: async (id) => { app.showConfirm('Apagar frase?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id))); },
};

window.onload = app.init;