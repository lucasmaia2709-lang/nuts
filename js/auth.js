import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc, getDocs, onSnapshot, query, collection, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, appId, C_USERS, ADMIN_EMAILS, C_PAIN, C_PUBLIC_RACES } from "./config.js";
import { state } from "./state.js";

export const authLogic = {
    init: async () => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.app.loadUser(user.email);
            } else {
                window.app.screen('view-landing');
                if(state.unsubscribeUserNotif) state.unsubscribeUserNotif();
                if(state.unsubscribeAdminNotif) state.unsubscribeAdminNotif();
                if(state.unsubscribeFeed) state.unsubscribeFeed();
            }
        });
        window.app.renderCalendar();
    },

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
                state.currentUser = docSnap.data();
                const btnAdmin = document.getElementById('btn-admin-access');
                const isAdmin = ADMIN_EMAILS.includes(state.currentUser.email);
                
                if(btnAdmin) btnAdmin.style.display = isAdmin ? 'block' : 'none';
                
                // NOTIFICAÇÕES (Badges)
                window.app.setupUserNotifications(email);
                if (isAdmin) window.app.setupAdminNotifications();
                
                // CARREGAR PROVAS DA COMUNIDADE (Otimizado)
                window.app.loadCommunityRaces();

                if (document.getElementById('view-admin').classList.contains('active')) return;
                
                if(!state.currentUser.active && !isAdmin) { 
                    window.app.screen('view-pending'); 
                    return; 
                }
                const av = state.currentUser.avatar;
                const himg = document.getElementById('header-avatar-img');
                const htxt = document.getElementById('header-avatar-txt');
                if(av) { himg.src=av; himg.style.display='block'; htxt.style.display='none'; }
                else { himg.style.display='none'; htxt.style.display='block'; htxt.innerText=state.currentUser.name[0]; }
                
                window.app.screen('view-app');
                
                // Manter aba ativa
                const activeTabEl = document.querySelector('.nav-item.active');
                if (activeTabEl && activeTabEl.dataset.tab === 'home') {
                    window.app.renderHome();
                } else if (!activeTabEl) {
                    window.app.nav('home');
                } else {
                    const tab = activeTabEl.dataset.tab;
                    if(tab === 'workouts') window.app.renderWorkoutsList();
                    if(tab === 'social') window.app.loadFeed();
                    if(tab === 'news') window.app.loadNews();
                    if(tab === 'health') window.app.loadHealthTab();
                }
            }
        });
    },

    // --- OTIMIZAÇÃO SOLUÇÃO 1: Carrega apenas a coleção leve de provas ---
    loadCommunityRaces: async () => {
        try {
            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES));
            const snap = await getDocs(q);
            const races = [];
            snap.forEach(d => races.push(d.data()));
            state.communityRacesCache = races; // Armazena no cache leve
            window.app.renderCalendar(); 
        } catch (e) {
            console.error("Erro ao carregar provas da comunidade:", e);
        }
    },

    logout: () => { signOut(auth).then(() => { state.currentUser = null; window.app.screen('view-landing'); }); },
    
    setupUserNotifications: (email) => {
        if(state.unsubscribeUserNotif) state.unsubscribeUserNotif();
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), 
            where("email", "==", email)
        );

        state.unsubscribeUserNotif = onSnapshot(q, (snapshot) => {
            let count = 0;
            snapshot.forEach(d => {
                const item = d.data();
                if(item.response != null && item.readByUser === false) {
                    count++;
                }
            });

            const badgeNav = document.getElementById('nav-badge-health');
            const badgeCard = document.getElementById('health-badge-counter');
            
            if(count > 0) {
                if(badgeNav) badgeNav.classList.remove('hidden');
                if(badgeCard) {
                    badgeCard.innerText = count;
                    badgeCard.classList.remove('hidden');
                }
            } else {
                if(badgeNav) badgeNav.classList.add('hidden');
                if(badgeCard) badgeCard.classList.add('hidden');
            }
        });
    },

    setupAdminNotifications: () => {
        if(state.unsubscribeAdminNotif) state.unsubscribeAdminNotif();
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), 
            where("readByAdmin", "==", false)
        );

        state.unsubscribeAdminNotif = onSnapshot(q, (snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('adm-physio-badge');
            
            if(count > 0) {
                if(badge) {
                    badge.innerText = count;
                    badge.classList.remove('hidden');
                }
            } else {
                if(badge) badge.classList.add('hidden');
            }
        });
    },
};
