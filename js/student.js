import { doc, updateDoc, addDoc, getDocs, query, collection, onSnapshot, where, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_PAIN, C_QUOTES, C_NEWS, C_VIDEOS, C_PUBLIC_RACES, CF_WORKER_URL, ADMIN_EMAILS } from "./config.js";
import { state } from "./state.js";

// Lógica de Calendário, Treinos, Perfil e Saúde
export const student = {
    
    // --- CARREGAMENTO DE USUÁRIO (A função que faltava!) ---
    loadUser: async (email) => {
        // Busca usuário pelo email
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_USERS), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            state.currentUser = { id: userDoc.id, ...userDoc.data() };

            // Atualiza UI do Perfil e Header
            const initials = state.currentUser.name.substring(0, 2).toUpperCase();
            
            if (state.currentUser.avatar) {
                document.getElementById('header-avatar-img').src = state.currentUser.avatar;
                document.getElementById('header-avatar-img').style.display = 'block';
                document.getElementById('header-avatar-txt').style.display = 'none';
                
                document.getElementById('profile-img-big').src = state.currentUser.avatar;
                document.getElementById('profile-img-big').style.display = 'block';
            } else {
                document.getElementById('header-avatar-txt').innerText = initials;
                document.getElementById('header-avatar-img').style.display = 'none';
                document.getElementById('header-avatar-txt').style.display = 'block';
                document.getElementById('profile-img-big').style.display = 'none';
            }

            document.getElementById('profile-name-big').innerText = state.currentUser.name;
            document.getElementById('profile-email-big').innerText = state.currentUser.email;

            // Preenche formulário de perfil
            if(document.getElementById('prof-birth')) document.getElementById('prof-birth').value = state.currentUser.birth || '';
            if(document.getElementById('prof-city')) document.getElementById('prof-city').value = state.currentUser.city || '';
            if(document.getElementById('prof-country')) document.getElementById('prof-country').value = state.currentUser.country || '';
            if(document.getElementById('prof-height')) document.getElementById('prof-height').value = state.currentUser.height || '';

            // Atualiza Peso Atual
            const wHistory = state.currentUser.weightHistory || [];
            if(wHistory.length > 0) {
                const lastW = wHistory[wHistory.length - 1];
                document.getElementById('display-current-weight').innerText = `${lastW.value} kg`;
                
                // Renderiza histórico
                const wList = document.getElementById('weight-history-list');
                wList.innerHTML = '';
                [...wHistory].reverse().forEach(w => {
                    wList.innerHTML += `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee; font-size:13px;"><span>${new Date(w.date).toLocaleDateString()}</span><strong>${w.value} kg</strong></div>`;
                });
            }

            // Exibir Botão Admin se for admin
            if (ADMIN_EMAILS.includes(email)) {
                document.getElementById('btn-admin-access').style.display = 'block';
            }

            // Carregar Dados
            window.app.renderCalendar();
            window.app.loadUserWorkouts();
            window.app.loadProfileHistory();
            window.app.loadFeed(); 
            window.app.loadNews();
            window.app.checkHealthBadges();
            
            // Carrega frase motivacional
            window.app.loadDailyQuote();

            // Vai para a tela do App
            window.app.screen('view-app');
        } else {
            // Se não achar, volta pro login (segurança)
            console.error("Usuário não encontrado no banco.");
            window.app.screen('view-login');
        }
    },

    loadDailyQuote: async () => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES));
        const snap = await getDocs(q);
        if(!snap.empty) {
            const quotes = [];
            snap.forEach(d => quotes.push(d.data().text));
            // Pega uma aleatória
            const random = quotes[Math.floor(Math.random() * quotes.length)];
            document.getElementById('daily-quote').innerText = `"${random}"`;
        } else {
            document.getElementById('daily-quote').innerText = '"O sucesso é a soma de pequenos esforços repetidos dia após dia."';
        }
    },

    // --- CALENDÁRIO ---
    changeMonth: (dir) => { state.currentMonth.setMonth(state.currentMonth.getMonth() + dir); window.app.renderCalendar(); },
    
    renderCalendar: () => {
        if(!state.currentUser) return;
        const y = state.currentMonth.getFullYear();
        const m = state.currentMonth.getMonth();
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m+1, 0).getDate();
        
        document.getElementById('cal-month-title').innerText = state.currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
        
        const grid = document.getElementById('calendar-days');
        grid.innerHTML = '';
        
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length-1] : null;
        
        for(let i=0; i<firstDay; i++) { grid.innerHTML += `<div class="cal-cell other-month"></div>`; }
        
        const today = new Date();
        for(let d=1; d<=daysInMonth; d++) {
            const date = new Date(y, m, d);
            const dateStr = date.toISOString().split('T')[0];
            const isToday = (d === today.getDate() && m === today.getMonth() && y === today.getFullYear());
            
            let hasWorkout = false;
            let isDone = false;
            let workoutIdx = -1;
            let raceIdx = state.currentUser.races ? state.currentUser.races.length - 1 : -1;

            if(activeRace && activeRace.workouts) {
                const w = activeRace.workouts.find((wk, idx) => {
                    if(wk.scheduledDate === dateStr) {
                        workoutIdx = idx;
                        return true;
                    }
                    return false;
                });
                if(w) { hasWorkout = true; isDone = w.done; }
            }

            let raceMarker = '';
            if(activeRace && activeRace.date === dateStr) {
                raceMarker = '<div class="cal-race-marker"></div>';
            }

            const classes = `cal-cell ${isToday ? 'today' : ''} ${hasWorkout ? 'has-workout' : ''} ${isDone ? 'done' : ''}`;
            const clickAction = hasWorkout ? `onclick="window.app.openDayDetail('${dateStr}', ${raceIdx}, ${workoutIdx})"` : `onclick="window.app.openDayDetail('${dateStr}', null, null)"`;
            
            grid.innerHTML += `
            <div class="${classes}" ${clickAction}>
                ${d}
                ${hasWorkout ? '<div class="cal-dot"></div>' : ''}
                ${raceMarker}
            </div>`;
        }
    },

    openDayDetail: (dateStr, raceIdx, workoutIdx) => {
        state.selectedDayDate = dateStr;
        const d = new Date(dateStr);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); 
        
        document.getElementById('day-det-title').innerText = d.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long' });
        const content = document.getElementById('day-det-content');
        
        if (workoutIdx !== null && raceIdx !== null) {
            const w = state.currentUser.races[raceIdx].workouts[workoutIdx];
            const isDone = w.done;
            const btnLabel = isDone ? "Treino Concluído" : "Marcar como Feito";
            const btnClass = isDone ? "btn-success" : "btn-primary";
            const btnAction = isDone ? "" : `window.app.openFinishModal(${raceIdx}, ${workoutIdx}, '${window.app.escape(w.title)}')`;
            
            let videoHtml = '';
            if(w.video) {
                videoHtml = `<button onclick="window.app.playVideo('${window.app.escape(w.video)}')" style="width:100%; padding:10px; margin:10px 0; background:#f0f0f0; border:none; border-radius:10px; color:var(--primary); font-weight:600;"><i class="fa-solid fa-play"></i> Ver Vídeo</button>`;
            }

            content.innerHTML = `
                <h2 style="margin:0; color:var(--text-main);">${w.title}</h2>
                <p style="color:var(--text-sec); font-size:16px; margin-top:5px;">${w.desc}</p>
                ${videoHtml}
                <button onclick="${btnAction}" class="btn ${btnClass}" ${isDone ? 'disabled' : ''} style="margin: 20px 0; width:100%; ${isDone ? 'background:#EEE; color:#888;' : ''}">${btnLabel}</button>
            `;
        } else {
            content.innerHTML = `<p style="text-align:center; color:#888;">Nenhum treino programado.</p>`;
        }
        
        document.getElementById('modal-day-detail').classList.add('active');
    },

    // --- MEU PLANO (ROBUSTO) ---
    loadUserWorkouts: () => {
        try {
            const list = document.getElementById('workouts-list');
            if(!list) return;
            
            list.innerHTML = '';
            const user = state.currentUser;
            
            if(!user || !user.races || user.races.length === 0) {
                list.innerHTML = `
                <div style="text-align:center; padding:40px 20px;">
                    <i class="fa-solid fa-person-running" style="font-size:40px; color:#ddd; margin-bottom:15px;"></i>
                    <h3 style="color:#888; font-size:16px;">Nenhum plano ativo</h3>
                    <p style="color:#aaa; font-size:13px;">Seu treinador ainda não adicionou um objetivo.</p>
                </div>`;
                return;
            }

            // Pega o ÚLTIMO objetivo (mais recente)
            const currentRace = user.races[user.races.length - 1];
            
            const raceDateStr = currentRace.date || new Date().toISOString();
            const raceDate = new Date(raceDateStr);
            if(!isNaN(raceDate.getTime())) {
                raceDate.setMinutes(raceDate.getMinutes() + raceDate.getTimezoneOffset());
            }
            const daysToRace = Math.ceil((raceDate - new Date()) / (1000 * 60 * 60 * 24));
            
            list.innerHTML = `
            <div class="card" style="background: linear-gradient(135deg, var(--primary), #ff9f43); color:white; padding:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:20px; color:white;">${currentRace.name}</h3>
                    <button onclick="window.app.editRaceDate(${user.races.length - 1})" style="border:none; background:rgba(255,255,255,0.2); color:white; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fa-solid fa-pencil"></i></button>
                </div>
                <div style="margin-top:10px; font-size:14px; opacity:0.9;">
                    <i class="fa-regular fa-calendar"></i> ${!isNaN(raceDate) ? raceDate.toLocaleDateString() : 'Data inválida'} 
                    <span style="float:right; font-weight:700;">${!isNaN(daysToRace) ? daysToRace : '-'} dias</span>
                </div>
                <div style="margin-top:5px; font-size:13px; opacity:0.8;">Meta: ${currentRace.estimatedTime || '-'}</div>
            </div>
            <h4 style="margin:20px 0 10px 0; color:var(--text-main);">Próximos Treinos</h4>
            `;

            if(!currentRace.workouts || currentRace.workouts.length === 0) {
                list.innerHTML += '<p style="text-align:center; color:#888;">Aguardando treinos...</p>';
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            const pendingWorkouts = currentRace.workouts
                .map((w, idx) => ({...w, originalIdx: idx})) 
                .filter(w => !w.done) 
                .sort((a,b) => {
                    const dateA = a.scheduledDate || '9999-99-99';
                    const dateB = b.scheduledDate || '9999-99-99';
                    return dateA.localeCompare(dateB);
                });

            if(pendingWorkouts.length === 0) {
                list.innerHTML += `
                <div style="text-align:center; padding:30px; background:#fff; border-radius:20px; box-shadow:var(--shadow);">
                    <i class="fa-solid fa-check-circle" style="font-size:40px; color:var(--success); margin-bottom:10px;"></i>
                    <p>Tudo feito por enquanto!</p>
                </div>`;
            } else {
                pendingWorkouts.forEach(w => {
                    let dateDisplay = 'Data a definir';
                    let highlight = '';
                    let isTodayHTML = '';

                    if(w.scheduledDate) {
                        const wDate = new Date(w.scheduledDate);
                        wDate.setMinutes(wDate.getMinutes() + wDate.getTimezoneOffset());
                        dateDisplay = wDate.toLocaleDateString('pt-BR', {weekday:'short', day:'numeric', month:'long'});
                        if(w.scheduledDate === today) {
                            highlight = 'border:2px solid var(--primary);';
                            isTodayHTML = '<div style="position:absolute; top:0; right:0; background:var(--primary); color:white; font-size:10px; padding:3px 10px; border-radius:0 0 0 10px;">HOJE</div>';
                        }
                    }
                    
                    let videoBtn = '';
                    if(w.video) {
                        videoBtn = `<button onclick="event.stopPropagation(); window.app.playVideo('${window.app.escape(w.video)}')" style="border:none; background:#f0f0f0; color:var(--primary); padding:5px 10px; border-radius:15px; font-size:11px; margin-top:5px;"><i class="fa-solid fa-play"></i> Vídeo</button>`;
                    }

                    list.innerHTML += `
                    <div class="card" onclick="window.app.openDayDetail('${w.scheduledDate || today}', ${user.races.length - 1}, ${w.originalIdx})" style="cursor:pointer; ${highlight} position:relative; overflow:hidden;">
                        ${isTodayHTML}
                        <div style="font-size:12px; color:var(--text-sec); font-weight:700; margin-bottom:5px;">${dateDisplay}</div>
                        <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:5px;">${w.title}</div>
                        <div style="font-size:13px; color:#666; line-height:1.4;">${w.desc}</div>
                        ${videoBtn}
                    </div>`;
                });
            }
        } catch (e) {
            console.error("Erro ao carregar treinos:", e);
        }
    },

    openFinishModal: (rIdx, wIdx, title) => {
        state.editingStudentRaceIndex = { rIdx, wIdx };
        state.pendingFinishWorkoutTitle = title;
        state.selectedPainLevel = null;
        const container = document.getElementById('pain-scale-container');
        container.innerHTML = '';
        for(let i=0; i<=7; i++) {
            const color = i < 3 ? '#2ecc71' : (i < 6 ? '#f1c40f' : '#e74c3c');
            container.innerHTML += `<div onclick="window.app.selectPain(${i}, this)" class="pain-circle" style="width:35px; height:35px; border-radius:50%; border:2px solid ${color}; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:bold; color:${color};" data-val="${i}">${i}</div>`;
        }
        document.getElementById('workout-feedback-text').value = '';
        document.getElementById('modal-finish-workout').classList.add('active');
    },

    selectPain: (val, el) => {
        state.selectedPainLevel = val;
        document.querySelectorAll('.pain-circle').forEach(c => {
            c.style.background = 'transparent';
            c.style.color = c.style.borderColor;
        });
        el.style.background = el.style.borderColor;
        el.style.color = '#FFF';
    },

    confirmFinishWorkout: async () => {
        if(state.selectedPainLevel === null) return window.app.toast("Selecione o nível de dor.");
        const feedback = document.getElementById('workout-feedback-text').value;
        const { rIdx, wIdx } = state.editingStudentRaceIndex;
        
        const user = state.currentUser;
        user.races[rIdx].workouts[wIdx].done = true;
        user.races[rIdx].workouts[wIdx].completedAt = new Date().toISOString();
        user.races[rIdx].workouts[wIdx].feedback = { painLevel: state.selectedPainLevel, notes: feedback };

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, user.id), { races: user.races });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), {
            userId: user.id, userName: user.name, email: user.email,
            workoutTitle: state.pendingFinishWorkoutTitle, painLevel: state.selectedPainLevel, notes: feedback,
            timestamp: Date.now(), readByAdmin: false, readByUser: true, response: null
        });

        document.getElementById('modal-finish-workout').classList.remove('active');
        window.app.toast("Treino concluído!");
        window.app.haptic();
        window.app.renderCalendar();
        window.app.loadUserWorkouts();
    },

    // --- HISTÓRICO DE PERFIL ---
    loadProfileHistory: () => {
        const div = document.getElementById('profile-history');
        if(!div) return;
        div.innerHTML = '';
        const user = state.currentUser;
        if(user.races && user.races.length > 0) {
            [...user.races].reverse().forEach(r => {
                const done = r.workouts ? r.workouts.filter(w=>w.done).length : 0;
                const total = r.workouts ? r.workouts.length : 0;
                const pct = total > 0 ? Math.round((done/total)*100) : 0;
                div.innerHTML += `
                <div style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:700;">
                        <span>${r.name}</span>
                        <span>${pct}%</span>
                    </div>
                    <div style="font-size:12px; color:#888;">${new Date(r.date).toLocaleDateString()}</div>
                    <div class="progress-container" style="height:5px; margin-top:5px;"><div class="progress-bar colored" style="width:${pct}%"></div></div>
                </div>`;
            });
        } else {
            div.innerHTML = '<p style="color:#999; font-size:13px;">Sem histórico.</p>';
        }
    },

    // --- PERFIL ---
    openProfile: () => window.app.screen('view-profile'),
    closeProfile: () => window.app.screen('view-app'),
    
    toggleEditProfile: (enable) => {
        const inputs = document.querySelectorAll('#profile-form-container input');
        inputs.forEach(i => i.disabled = !enable);
        document.getElementById('btn-edit-profile').style.display = enable ? 'none' : 'block';
        document.getElementById('profile-edit-actions').style.display = enable ? 'flex' : 'none';
    },

    saveProfile: async () => {
        const birth = document.getElementById('prof-birth').value;
        const city = document.getElementById('prof-city').value;
        const country = document.getElementById('prof-country').value;
        const height = document.getElementById('prof-height').value;

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), {
            birth, city, country, height
        });
        
        state.currentUser = { ...state.currentUser, birth, city, country, height };
        window.app.toggleEditProfile(false);
        window.app.toast("Perfil atualizado!");
    },

    uploadAvatar: async (input) => {
        if(input.files && input.files[0]) {
            window.app.toast("Enviando foto...");
            const url = await window.app.uploadImage(input.files[0], 'avatars');
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), { avatar: url });
            document.getElementById('profile-img-big').src = url;
            document.getElementById('header-avatar-img').src = url;
        }
    },

    // --- PESO ---
    openWeightModal: () => document.getElementById('modal-add-weight').classList.add('active'),
    
    saveNewWeight: async () => {
        const val = parseFloat(document.getElementById('new-weight-input').value);
        if(!val) return;
        const entry = { date: new Date().toISOString(), value: val };
        
        const history = state.currentUser.weightHistory || [];
        history.push(entry);
        
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), { weightHistory: history });
        state.currentUser.weightHistory = history;
        
        document.getElementById('modal-add-weight').classList.remove('active');
        document.getElementById('new-weight-input').value = '';
        window.app.loadUser(state.currentUser.email); 
    },

    // --- SAÚDE ---
    openHealthNutri: () => window.app.screen('view-health-nutri'),
    openHealthPhysio: () => window.app.screen('view-health-physio'),
    openHealthMental: () => window.app.screen('view-health-mental'),
    closeHealthSubView: () => {
        window.app.screen('view-app');
        window.app.nav('health');
    },

    // --- BADGES E NOTIFICAÇÕES (Faltava isso também) ---
    checkHealthBadges: () => {
        const list = document.getElementById('health-pain-list');
        if(list) list.innerHTML = '<p class="skeleton" style="height:50px;"></p>';
        
        if(!state.currentUser) return;

        // Limpa badge de leitura
        window.app.markPainAsReadByUser();

        // Carrega histórico para a tela de Fisio
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), where("email", "==", state.currentUser.email));
        
        onSnapshot(q, (snapshot) => {
            if(list) {
                if(snapshot.empty) { list.innerHTML = '<p style="text-align:center; color:#999;">Sem histórico.</p>'; return; }
                
                const items = [];
                snapshot.forEach(d => items.push(d.data()));
                items.sort((a,b) => b.timestamp - a.timestamp);

                list.innerHTML = '';
                items.forEach(item => {
                    const statusClass = item.responded ? 'answered' : 'pending';
                    const statusText = item.responded ? 'RESPONDIDO' : 'PENDENTE';
                    const dateStr = new Date(item.timestamp).toLocaleDateString();

                    let responseHtml = '';
                    if(item.response) {
                        responseHtml = `
                        <div class="pain-response-box">
                            <strong><i class="fa-solid fa-user-doctor"></i> Fisio Respondeu:</strong>
                            ${item.response}
                        </div>`;
                    }

                    list.innerHTML += `
                    <div class="pain-item ${statusClass}">
                        <div class="pain-header">
                            <span>${dateStr} - ${item.workoutTitle}</span>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </div>
                        <p class="pain-desc">
                            <strong>Nível ${item.painLevel}/7:</strong> ${item.notes}
                        </p>
                        ${responseHtml}
                    </div>`;
                });
            }
        });
    },

    markPainAsReadByUser: async () => {
        if(!state.currentUser) return;
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), 
            where("email", "==", state.currentUser.email)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (d) => {
            const data = d.data();
            if(data.readByUser === false && data.response != null) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, d.id), { readByUser: true });
            }
        });
    },

    // --- RACE (ALUNO) ---
    showAddRaceModal: () => document.getElementById('modal-add-race').classList.add('active'),
    
    addStudentRace: async () => {
        const name = document.getElementById('new-race-name').value;
        const date = document.getElementById('new-race-date').value;
        if(!name || !date) return window.app.toast("Preencha nome e data");
        
        const newRace = { name, date, workouts: [], created: new Date().toISOString() };
        const races = state.currentUser.races || [];
        races.push(newRace);
        
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), { races });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), {
            date: date, raceName: name, studentName: state.currentUser.name, studentEmail: state.currentUser.email, created: Date.now()
        });

        document.getElementById('modal-add-race').classList.remove('active');
        window.app.toast("Objetivo criado!");
    },
    
    editRaceDate: (rIdx) => {
        state.editingStudentRaceIndex = rIdx; 
        const r = state.currentUser.races[rIdx];
        document.getElementById('edit-race-date-input').value = r.date;
        document.getElementById('modal-edit-date').classList.add('active');
    },

    saveRaceDate: async () => {
        const newDate = document.getElementById('edit-race-date-input').value;
        if(!newDate) return;
        
        const rIdx = state.editingStudentRaceIndex;
        state.currentUser.races[rIdx].date = newDate;
        
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), { races: state.currentUser.races });
        
        document.getElementById('modal-edit-date').classList.remove('active');
        window.app.loadUserWorkouts();
        window.app.renderCalendar();
    },
    
    saveDayNote: () => document.getElementById('modal-day-detail').classList.remove('active')
};
