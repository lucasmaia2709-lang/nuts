import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, getDocs, onSnapshot, query, collection, where, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, appId, C_USERS, ADMIN_EMAILS, C_PAIN, C_PUBLIC_RACES, C_QUOTES } from "./config.js";
import { state } from "./state.js";

export const authLogic = {
    init: async () => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.app.loadUser(user.email);
            } else {
                window.app.screen('view-landing');
                if (state.unsubscribeUserNotif) state.unsubscribeUserNotif();
                if (state.unsubscribeAdminNotif) state.unsubscribeAdminNotif();
                if (state.unsubscribeFeed) state.unsubscribeFeed();
            }
        });
        window.app.renderCalendar();
    },

    // FUNÇÃO NOVA: Alternar visibilidade da senha (Olho Mágico)
    togglePass: (fieldId, iconId) => {
        const input = document.getElementById(fieldId);
        const icon = document.getElementById(iconId);
        if (input.type === "password") {
            input.type = "text";
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    },

    currentRegStep: 1,

    goToRegister: () => {
        authLogic.resetOnboardingUI();
        window.app.screen('view-register');
    },

    resetOnboardingUI: () => {
        state.isOnboardingExistingUser = false;
        document.getElementById('reg-title').innerText = "Criar Conta";
        document.getElementById('reg-progress').style.display = 'flex';
        document.getElementById('reg-title').style.display = 'block';
        document.getElementById('dot-1').style.display = 'block';

        // Reset steps
        const current = window.app.currentRegStep || 1;
        document.getElementById(`step-${current}`).classList.remove('active');
        document.getElementById(`dot-${current}`).classList.remove('active');

        window.app.currentRegStep = 1;
        document.getElementById(`step-1`).classList.add('active');
        document.getElementById(`dot-1`).classList.add('active');

        document.getElementById('form-register').reset();
        document.getElementById('btn-finish-reg').innerHTML = 'Finalizar <i class="fa-solid fa-check" style="margin-left:5px;"></i>';
    },

    startOnboardingExistingUser: () => {
        authLogic.resetOnboardingUI();
        state.isOnboardingExistingUser = true;

        document.getElementById('reg-title').innerText = "Questionário";
        document.getElementById('reg-progress').style.display = 'flex';

        // Ocultar passo 1 (Dados da conta)
        document.getElementById('step-1').classList.remove('active');
        document.getElementById('dot-1').style.display = 'none';

        // Ir para passo 2
        window.app.currentRegStep = 2;
        document.getElementById('step-2').classList.add('active');
        document.getElementById('dot-2').classList.add('active');

        window.app.screen('view-register');
    },

    nextStep: () => {
        const step = window.app.currentRegStep;

        if (step === 1) {
            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const pass = document.getElementById('reg-pass').value;
            if (!name || !email || !pass) return window.app.toast("Preencha todos os campos da conta.");
            if (pass.length < 6) return window.app.toast("A senha deve ter no mínimo 6 caracteres.");
        } else if (step === 2) {
            const level = document.getElementById('reg-level').value;
            if (!level) return window.app.toast("Selecione seu nível de experiência.");
        } else if (step === 4) {
            const checkboxes = document.querySelectorAll('#reg-days-group input[type="checkbox"]:checked');
            if (checkboxes.length < 3) return window.app.toast("Selecione pelo menos 3 dias de treino.");
        }

        if (step < 8) {
            document.getElementById(`step-${step}`).classList.remove('active');
            document.getElementById(`dot-${step}`).classList.remove('active');
            window.app.currentRegStep++;
            const next = window.app.currentRegStep;
            document.getElementById(`step-${next}`).classList.add('active');
            document.getElementById(`dot-${next}`).classList.add('active');
        }
    },

    prevStep: () => {
        const step = window.app.currentRegStep;
        if (step > 1) {
            document.getElementById(`step-${step}`).classList.remove('active');
            document.getElementById(`dot-${step}`).classList.remove('active');
            window.app.currentRegStep--;
            const prev = window.app.currentRegStep;
            document.getElementById(`step-${prev}`).classList.add('active');
            document.getElementById(`dot-${prev}`).classList.add('active');
        }
    },

    handleRegister: async (e) => {
        if (e) e.preventDefault();
        const btn = document.getElementById('btn-finish-reg');
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';

        const checkboxesDays = document.querySelectorAll('#reg-days-group input[type="checkbox"]:checked');
        const trainingDays = Array.from(checkboxesDays).map(cb => cb.value);

        if (trainingDays.length < 3) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            return window.app.toast("Selecione pelo menos 3 dias de treino.");
        }

        const painLocs = Array.from(document.querySelectorAll('#reg-pain-loc input[type="checkbox"]:checked')).map(cb => cb.value);

        const profileData = {
            level: document.getElementById('reg-level').value,
            goalDesc: document.getElementById('reg-goal-desc').value,
            currentVolume: document.getElementById('reg-current-volume').value,
            terrain: document.getElementById('reg-terrain').value,
            occupation: document.getElementById('reg-occupation').value,
            strength: document.getElementById('reg-strength').value,
            trainingDays,
            longRun: document.getElementById('reg-longrun').value,
            painLocations: painLocs,
            painScore: document.getElementById('reg-pain-score').value,
            painBehavior: document.getElementById('reg-pain-behavior').value,
            injuriesHistory: document.getElementById('reg-injuries-history').value,
            redFlagsChest: document.getElementById('reg-redflags-chest').value,
            redFlagsCardiac: document.getElementById('reg-redflags-cardiac').value,
            meds: document.getElementById('reg-meds').value,
            shoes: document.getElementById('reg-shoes').value,
            goalKm: document.getElementById('reg-goal-km').value,
            goalDate: document.getElementById('reg-goal-date').value
        };

        try {
            if (state.isOnboardingExistingUser) {
                // APENAS ATUALIZA O PERFIL
                if (!state.currentUser) throw new Error("Usuário não logado.");
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), {
                    onboarding: profileData
                });
                window.app.toast("Questionário salvo com sucesso!");
                window.app.loadUser(state.currentUser.email); // Recarrega dados e volta pra home
            } else {
                // REGISTRO NOVO
                const name = document.getElementById('reg-name').value;
                const email = document.getElementById('reg-email').value.trim().toLowerCase();
                const pass = document.getElementById('reg-pass').value;

                await createUserWithEmailAndPassword(auth, email, pass);
                const newUser = {
                    name,
                    email,
                    active: false,
                    avatar: null,
                    races: [],
                    notes: {},
                    created: Date.now(),
                    onboarding: profileData
                };
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), newUser);
                await signOut(auth);
                window.app.toast("Cadastro realizado com sucesso! Faça login.");
                window.app.screen('view-login');
            }
        } catch (err) {
            window.app.toast('Erro: ' + err.message);
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        // O trim() e toLowerCase() são essenciais, mas o HTML updated ajuda a prevenir o erro visual
        const email = document.getElementById('log-email').value.trim().toLowerCase();
        const pass = document.getElementById('log-pass').value;

        // Validação básica antes de enviar
        if (!email || !pass) return window.app.toast("Preencha todos os campos.");

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, user.email);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                const newUser = { name: "Aluno(a)", email: user.email, active: false, avatar: null, races: [], notes: {}, created: Date.now() };
                await setDoc(docRef, newUser);
            }
        } catch (err) {
            console.error("Erro Login:", err);
            // Mensagens de erro mais amigáveis
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                window.app.toast('Email ou senha incorretos.');
            } else if (err.code === 'auth/too-many-requests') {
                window.app.toast('Muitas tentativas. Tente mais tarde.');
            } else if (err.code === 'auth/network-request-failed') {
                window.app.toast('Erro de conexão. Verifique sua internet.');
            } else {
                window.app.toast('Erro ao entrar: ' + err.message);
            }
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

    // --- FUNÇÃO DE EXCLUSÃO DE CONTA (Obrigatória para Apple) ---
    deleteAccount: async () => {
        if (!state.currentUser) return;

        // Confirmação 1
        if (!confirm("Atenção! Isso apagará todos os seus treinos e histórico permanentemente.")) return;

        // Confirmação 2 (Segurança)
        if (!confirm("Tem certeza absoluta? Esta ação não pode ser desfeita.")) return;

        window.app.toast("Processando exclusão...");
        const user = auth.currentUser;
        const email = user.email;

        try {
            // 1. Apagar dados do Firestore (Perfil do Aluno)
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email));

            // 2. Apagar Utilizador do Firebase Auth (Login)
            await deleteUser(user);

            // Sucesso
            window.app.toast("Conta excluída com sucesso.");
            window.app.screen('view-landing');
            state.currentUser = null;

        } catch (error) {
            console.error("Erro ao excluir:", error);

            // Tratamento de erro específico do Firebase: Requer Login Recente
            if (error.code === 'auth/requires-recent-login') {
                window.app.toast("Por segurança, faça Logout e Login novamente para excluir a conta.");
            } else {
                window.app.toast("Erro ao excluir conta. Contate o suporte.");
            }
        }
    },

    loadUser: (email) => {
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, email), (docSnap) => {
            if (docSnap.exists()) {
                state.currentUser = docSnap.data();
                const btnAdmin = document.getElementById('btn-admin-access');
                const isAdmin = ADMIN_EMAILS.includes(state.currentUser.email);

                if (btnAdmin) btnAdmin.style.display = isAdmin ? 'block' : 'none';

                // NOTIFICAÇÕES (Badges)
                window.app.setupUserNotifications(email);
                window.app.notificationLogic.monitorStudent(); // Monitoramento de Aluno (Treinos, Lives, etc)

                if (isAdmin) {
                    window.app.setupAdminNotifications();
                    window.app.notificationLogic.monitorAdmin(); // Monitoramento de Admin (Novos users, dores)
                }

                // CARREGAR PROVAS DA COMUNIDADE (Agora em tempo real)
                window.app.loadCommunityRaces();

                if (document.getElementById('view-admin').classList.contains('active')) return;

                if (!state.currentUser.active && !isAdmin) {
                    window.app.screen('view-pending');
                    return;
                }
                const av = window.app.getSafeUrl(state.currentUser.avatar);
                const himg = document.getElementById('header-avatar-img');
                const htxt = document.getElementById('header-avatar-txt');
                if (av) { himg.src = av; himg.style.display = 'block'; htxt.style.display = 'none'; }
                else { himg.style.display = 'none'; htxt.style.display = 'block'; htxt.innerText = state.currentUser.name[0]; }

                // --- LÓGICA DO SPLASH SCREEN ---
                const finalizeLoad = () => {
                    window.app.screen('view-app');

                    // Manter aba ativa
                    const activeTabEl = document.querySelector('.nav-item.active');
                    if (activeTabEl && activeTabEl.dataset.tab === 'home') {
                        window.app.renderHome();
                    } else if (!activeTabEl) {
                        window.app.nav('home');
                    } else {
                        const tab = activeTabEl.dataset.tab;
                        if (tab === 'workouts') window.app.renderWorkoutsList();
                        if (tab === 'social') window.app.loadFeed();
                        if (tab === 'news') window.app.loadNews();
                        if (tab === 'health') window.app.loadHealthTab();
                    }
                };

                if (!state.hasShownSplash) {
                    state.hasShownSplash = true;
                    window.app.screen('view-splash');

                    // Busca frase aleatória
                    getDocs(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES)).then(snap => {
                        const quotes = [];
                        snap.forEach(d => {
                            const data = d.data();
                            const authorStr = data.author && data.author !== 'Desconhecido' ? `<br><span style="font-size: 14px; opacity: 0.8; font-weight: 400; display: block; text-align: center; margin-top: 15px; width: 100%;">- ${data.author}</span>` : '';
                            quotes.push(`"${data.text}"${authorStr}`);
                        });
                        const textEl = document.getElementById('splash-quote-text');

                        if (quotes.length > 0) {
                            const dayIndex = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
                            textEl.innerHTML = quotes[dayIndex % quotes.length];
                        } else {
                            textEl.innerHTML = "\"O único treino ruim é aquele que não aconteceu.\"";
                        }

                        // Fade in start (HTML opacity 0 default, adding class / style)
                        setTimeout(() => {
                            textEl.style.opacity = '1';
                        }, 100);

                    }).catch(e => console.error("Erro splash quote:", e));

                    // Aguarda 6 segundos e vai para o app
                    setTimeout(() => {
                        // Fade out o texto antes de trocar de tela para ficar suave
                        const textEl = document.getElementById('splash-quote-text');
                        if (textEl) textEl.style.opacity = '0';

                        setTimeout(() => finalizeLoad(), 800);
                    }, 6000);

                } else {
                    finalizeLoad();
                }
            } else {
                // Caso raro: User existe no Auth mas foi apagado do Firestore (ex: pelo Admin)
                // Força logout para evitar estado inconsistente
                signOut(auth);
                window.app.screen('view-landing');
            }
        });
    },

    loadCommunityRaces: () => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES));
        onSnapshot(q, (snap) => {
            const races = [];
            snap.forEach(d => races.push(d.data()));
            state.communityRacesCache = races;
            window.app.renderCalendar();
        }, (error) => {
            console.error("Erro ao ler provas públicas:", error);
        });
    },

    logout: () => { signOut(auth).then(() => { state.currentUser = null; window.app.screen('view-landing'); }); },

    setupUserNotifications: (email) => {
        if (state.unsubscribeUserNotif) state.unsubscribeUserNotif();
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN),
            where("email", "==", email)
        );

        state.unsubscribeUserNotif = onSnapshot(q, (snapshot) => {
            let count = 0;
            snapshot.forEach(d => {
                const item = d.data();
                if (item.response != null && item.readByUser === false) {
                    count++;
                }
            });

            const badgeNav = document.getElementById('nav-badge-health');
            const badgeCard = document.getElementById('health-badge-counter');

            if (count > 0) {
                if (badgeNav) badgeNav.classList.remove('hidden');
                if (badgeCard) {
                    badgeCard.innerText = count;
                    badgeCard.classList.remove('hidden');
                }
            } else {
                if (badgeNav) badgeNav.classList.add('hidden');
                if (badgeCard) badgeCard.classList.add('hidden');
            }
        });
    },

    setupAdminNotifications: () => {
        if (state.unsubscribeAdminNotif) state.unsubscribeAdminNotif();
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN),
            where("readByAdmin", "==", false)
        );

        state.unsubscribeAdminNotif = onSnapshot(q, (snapshot) => {
            const count = snapshot.size;
            const badge = document.getElementById('adm-physio-badge');

            if (count > 0) {
                if (badge) {
                    badge.innerText = count;
                    badge.classList.remove('hidden');
                }
            } else {
                if (badge) badge.classList.add('hidden');
            }
        });
    },
};