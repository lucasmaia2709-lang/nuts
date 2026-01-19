import { doc, updateDoc, addDoc, getDocs, query, collection, onSnapshot, where, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_PAIN, C_QUOTES, C_NEWS, C_VIDEOS, C_PUBLIC_RACES, CF_WORKER_URL, ADMIN_EMAILS } from "./config.js";
import { state } from "./state.js";

// Lógica de Calendário, Treinos, Perfil e Saúde
export const student = {
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
        
        // Pega o último objetivo (mais recente)
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

            // Marcador de Prova
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
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); // Fix timezone visual
        
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

    // --- MEU PLANO (CORRIGIDO) ---
    loadUserWorkouts: () => {
        const list = document.getElementById('workouts-list');
        list.innerHTML = '';
        
        const user = state.currentUser;
        // Verifica se tem objetivos
        if(!user || !user.races || user.races.length === 0) {
            list.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <i class="fa-solid fa-person-running" style="font-size:40px; color:#ddd; margin-bottom:15px;"></i>
                <h3 style="color:#888; font-size:16px;">Nenhum plano ativo</h3>
                <p style="color:#aaa; font-size:13px;">Seu treinador ainda não adicionou um objetivo.</p>
            </div>`;
            return;
        }

        // CORREÇÃO: Pega SEMPRE o último objetivo do array (o mais recente)
        const currentRace = user.races[user.races.length - 1];
        
        // Cabeçalho do Objetivo
        const raceDate = new Date(currentRace.date);
        raceDate.setMinutes(raceDate.getMinutes() + raceDate.getTimezoneOffset());
        const daysToRace = Math.ceil((raceDate - new Date()) / (1000 * 60 * 60 * 24));
        
        list.innerHTML = `
        <div class="card" style="background: linear-gradient(135deg, var(--primary), #ff9f43); color:white; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:20px; color:white;">${currentRace.name}</h3>
                <button onclick="window.app.editRaceDate(${user.races.length - 1})" style="border:none; background:rgba(255,255,255,0.2); color:white; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fa-solid fa-pencil"></i></button>
            </div>
            <div style="margin-top:10px; font-size:14px; opacity:0.9;">
                <i class="fa-regular fa-calendar"></i> ${raceDate.toLocaleDateString()} 
                <span style="float:right; font-weight:700;">${daysToRace} dias</span>
            </div>
            <div style="margin-top:5px; font-size:13px; opacity:0.8;">Meta: ${currentRace.estimatedTime || '-'}</div>
        </div>
        <h4 style="margin:20px 0 10px 0; color:var(--text-main);">Próximos Treinos</h4>
        `;

        if(!currentRace.workouts || currentRace.workouts.length === 0) {
            list.innerHTML += '<p style="text-align:center; color:#888;">Aguardando treinos...</p>';
            return;
        }

        // Filtra e ordena treinos
        const today = new Date().toISOString().split('T')[0];
        const pendingWorkouts = currentRace.workouts
            .map((w, idx) => ({...w, originalIdx: idx})) // Guarda o índice original para editar
            .filter(w => !w.done) // Mostra apenas não concluídos ou futuros
            .sort((a,b) => a.scheduledDate.localeCompare(b.scheduledDate));

        if(pendingWorkouts.length === 0) {
            list.innerHTML += `
            <div style="text-align:center; padding:30px; background:#fff; border-radius:20px; box-shadow:var(--shadow);">
                <i class="fa-solid fa-check-circle" style="font-size:40px; color:var(--success); margin-bottom:10px;"></i>
                <p>Tudo feito por enquanto!</p>
            </div>`;
        } else {
            pendingWorkouts.forEach(w => {
                const wDate = new Date(w.scheduledDate);
                wDate.setMinutes(wDate.getMinutes() + wDate.getTimezoneOffset());
                const isToday = w.scheduledDate === today;
                const highlight = isToday ? 'border:2px solid var(--primary);' : '';
                
                let videoBtn = '';
                if(w.video) {
                    videoBtn = `<button onclick="event.stopPropagation(); window.app.playVideo('${window.app.escape(w.video)}')" style="border:none; background:#f0f0f0; color:var(--primary); padding:5px 10px; border-radius:15px; font-size:11px; margin-top:5px;"><i class="fa-solid fa-play"></i> Vídeo</button>`;
                }

                list.innerHTML += `
                <div class="card" onclick="window.app.openDayDetail('${w.scheduledDate}', ${user.races.length - 1}, ${w.originalIdx})" style="cursor:pointer; ${highlight} position:relative; overflow:hidden;">
                    ${isToday ? '<div style="position:absolute; top:0; right:0; background:var(--primary); color:white; font-size:10px; padding:3px 10px; border-radius:0 0 0 10px;">HOJE</div>' : ''}
                    <div style="font-size:12px; color:var(--text-sec); font-weight:700; margin-bottom:5px;">${wDate.toLocaleDateString('pt-BR', {weekday:'short', day:'numeric', month:'long'})}</div>
                    <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-bottom:5px;">${w.title}</div>
                    <div style="font-size:13px; color:#666; line-height:1.4;">${w.desc}</div>
                    ${videoBtn}
                </div>`;
            });
        }
    },

    openFinishModal: (rIdx, wIdx, title) => {
        state.editingStudentRaceIndex = { rIdx, wIdx };
        state.pendingFinishWorkoutTitle = title;
        state.selectedPainLevel = null;
        
        // Resetar seleção de dor
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
        
        // Atualiza Localmente
        const user = state.currentUser;
        user.races[rIdx].workouts[wIdx].done = true;
        user.races[rIdx].workouts[wIdx].completedAt = new Date().toISOString();
        user.races[rIdx].workouts[wIdx].feedback = {
            painLevel: state.selectedPainLevel,
            notes: feedback
        };

        // Salva no Firestore
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, user.id), { races: user.races });

        // Salva Relato de Dor para o Admin
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), {
            userId: user.id,
            userName: user.name,
            email: user.email,
            workoutTitle: state.pendingFinishWorkoutTitle,
            painLevel: state.selectedPainLevel,
            notes: feedback,
            timestamp: Date.now(),
            readByAdmin: false,
            readByUser: true,
            response: null
        });

        document.getElementById('modal-finish-workout').classList.remove('active');
        window.app.toast("Treino concluído!");
        window.app.haptic();
        window.app.renderCalendar();
        window.app.loadUserWorkouts();
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
        window.app.loadUser(state.currentUser.email); // Recarrega para atualizar UI
    },

    // --- SAÚDE ---
    openHealthNutri: () => window.app.screen('view-health-nutri'),
    openHealthPhysio: () => window.app.screen('view-health-physio'),
    openHealthMental: () => window.app.screen('view-health-mental'),
    closeHealthSubView: () => {
        window.app.screen('view-app');
        window.app.nav('health');
    },

    // --- RACE (ALUNO) ---
    showAddRaceModal: () => document.getElementById('modal-add-race').classList.add('active'),
    
    addStudentRace: async () => {
        const name = document.getElementById('new-race-name').value;
        const date = document.getElementById('new-race-date').value;
        if(!name || !date) return window.app.toast("Preencha nome e data");
        
        // Simplesmente cria sem IA para o aluno (ou pode conectar a IA aqui tbm se quiser)
        const newRace = {
            name, date, workouts: [], created: new Date().toISOString()
        };
        
        const races = state.currentUser.races || [];
        races.push(newRace);
        
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.id), { races });
        
        // Adiciona registro público para calendário social
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), {
            date: date,
            raceName: name,
            studentName: state.currentUser.name,
            studentEmail: state.currentUser.email,
            created: Date.now()
        });

        document.getElementById('modal-add-race').classList.remove('active');
        window.app.toast("Objetivo criado!");
    },
    
    editRaceDate: (rIdx) => {
        state.editingStudentRaceIndex = rIdx; // reusa variavel
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
    
    saveDayNote: () => {
        // Implementar se quiser salvar notas avulsas no dia
        document.getElementById('modal-day-detail').classList.remove('active');
    }
};
