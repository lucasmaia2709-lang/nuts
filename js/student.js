import { doc, updateDoc, addDoc, getDocs, query, collection, onSnapshot, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_PAIN, C_QUOTES, C_NEWS, C_VIDEOS, C_PUBLIC_RACES, CF_WORKER_URL } from "./config.js";
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
        
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length-1] : null;
        const workouts = activeRace ? activeRace.workouts : [];
        const notes = state.currentUser.notes || {};
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

            // --- OTIMIZAÇÃO SOLUÇÃO 1: Renderiza bolinhas usando o cache leve ---
            if (state.communityRacesCache && state.communityRacesCache.length > 0) {
                let hasStudentRace = false;
                state.communityRacesCache.forEach(race => {
                    // race agora é um objeto leve: { date, raceName, studentName, studentEmail }
                    if (race.studentEmail !== state.currentUser.email && race.date === dateStr) {
                        hasStudentRace = true;
                        modalData.studentRaces.push({ studentName: race.studentName, raceName: race.raceName });
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
        state.selectedDayDate = dateStr;
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
        const notes = state.currentUser.notes || {};
        document.getElementById('day-det-note').value = notes[dateStr] || '';
        modal.classList.add('active');
    },

    saveDayNote: async () => {
        const note = document.getElementById('day-det-note').value;
        const notes = state.currentUser.notes || {};
        if(note.trim() === '') delete notes[state.selectedDayDate];
        else notes[state.selectedDayDate] = note;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { notes });
        window.app.toast("Nota salva!");
        document.getElementById('modal-day-detail').classList.remove('active');
        window.app.renderCalendar();
    },

    renderHome: () => { window.app.renderCalendar(); window.app.renderTodayCard(); window.app.loadQuote(); window.app.loadHomeNews(); },

    loadHomeNews: () => {
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
                    state.allNews = news; 
            } else { container.innerHTML = ''; }
        });
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

    // --- TREINOS ---
    renderTodayCard: (specificWorkout = null) => {
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length-1] : null;
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
        state.pendingFinishWorkoutTitle = wTitle;
        state.selectedPainLevel = null;
        document.getElementById('workout-feedback-text').value = '';
        window.app.renderPainScale();
        document.getElementById('modal-finish-workout').classList.add('active');
    },

    renderPainScale: () => {
        const container = document.getElementById('pain-scale-container');
        container.innerHTML = '';
        for(let i=0; i<=7; i++) {
            const isActive = i === state.selectedPainLevel;
            const bg = isActive ? 'var(--primary)' : '#FFF';
            const color = isActive ? '#FFF' : 'var(--text-main)';
            const border = isActive ? 'none' : '1px solid #CCC';
            
            container.innerHTML += `
            <button onclick="window.app.setPainLevel(${i})" style="width:35px; height:35px; border-radius:50%; border:${border}; background:${bg}; color:${color}; font-weight:600; cursor:pointer;">${i}</button>
            `;
        }
    },

    setPainLevel: (lvl) => {
        state.selectedPainLevel = lvl;
        window.app.renderPainScale();
    },

    confirmFinishWorkout: async () => {
        if (!state.pendingFinishWorkoutTitle) return;
        const notes = document.getElementById('workout-feedback-text').value.trim();
        
        if (state.selectedPainLevel === null) return window.app.toast("Selecione o nível de dor.");
        if (state.selectedPainLevel > 0 && !notes) return window.app.toast("Descreva o que doeu (Obrigatório para dor > 0).");

        const races = [...state.currentUser.races];
        const rIdx = races.length - 1;
        const wIdx = races[rIdx].workouts.findIndex(w => w.title === state.pendingFinishWorkoutTitle && !w.done);
        
        if(wIdx > -1) {
            races[rIdx].workouts[wIdx].done = true;
            races[rIdx].workouts[wIdx].completedAt = new Date().toISOString().split('T')[0];
            
            if (state.selectedPainLevel > 0 || notes) {
                races[rIdx].workouts[wIdx].feedback = {
                    painLevel: state.selectedPainLevel,
                    notes: notes,
                    timestamp: Date.now()
                };

                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), {
                    email: state.currentUser.email,
                    userName: state.currentUser.name,
                    workoutTitle: state.pendingFinishWorkoutTitle,
                    painLevel: state.selectedPainLevel,
                    notes: notes,
                    timestamp: Date.now(),
                    readByAdmin: false,
                    responded: false,
                    response: null,
                    readByUser: true
                });
            }

            state.currentUser.races = races;
            
            window.app.renderHome(); 
            if(!document.getElementById('tab-workouts').classList.contains('hidden')) {
                window.app.renderWorkoutsList();
            }
            
            window.app.toast("Treino concluído! Bom descanso.");
            window.app.haptic();
            document.getElementById('modal-finish-workout').classList.remove('active');
            
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { races });
        }
    },

    renderWorkoutsList: () => {
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length-1] : null;
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

    // --- PERFIL ---
    openProfile: () => {
        if(!state.currentUser) return;
        window.app.screen('view-profile');
        
        document.getElementById('profile-name-big').innerText = state.currentUser.name;
        document.getElementById('profile-email-big').innerText = state.currentUser.email.toLowerCase();
        const img = document.getElementById('profile-img-big');
        if(state.currentUser.avatar) { img.src=state.currentUser.avatar; img.style.display='block'; }
        else { img.style.display='none'; }
        
        document.getElementById('prof-birth').value = state.currentUser.birthDate || '';
        document.getElementById('prof-city').value = state.currentUser.city || '';
        document.getElementById('prof-country').value = state.currentUser.country || '';
        document.getElementById('prof-height').value = state.currentUser.height || '';
        
        window.app.renderWeightUI();
        window.app.toggleEditProfile(false);

        const hList = document.getElementById('profile-history');
        hList.innerHTML = '';
        (state.currentUser.races || []).forEach((r, i) => {
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
            const hasActiveGoal = (state.currentUser.races || []).some(r => r.date >= todayStr);
            if (hasActiveGoal) btnAddRace.style.display = 'none';
            else btnAddRace.style.display = 'block';
        }
    },
    
    openEditRaceDate: (index) => {
        if (!state.currentUser || !state.currentUser.races || !state.currentUser.races[index]) return;
        state.editingStudentRaceIndex = index;
        const race = state.currentUser.races[index];
        document.getElementById('edit-race-date-input').value = race.date || '';
        document.getElementById('modal-edit-date').classList.add('active');
    },

    saveRaceDate: async () => {
        if (state.editingStudentRaceIndex === null || !state.currentUser) return;
        const newDate = document.getElementById('edit-race-date-input').value;
        if (!newDate) return window.app.toast("Selecione uma data.");
        const races = state.currentUser.races;
        races[state.editingStudentRaceIndex].date = newDate;
        window.app.toast("Atualizando data...");
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { races });
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
        if(!state.currentUser) return;
        const birthDate = document.getElementById('prof-birth').value;
        const city = document.getElementById('prof-city').value;
        const country = document.getElementById('prof-country').value;
        const height = document.getElementById('prof-height').value;
        let updates = { birthDate, city, country, height };
        window.app.toast("Salvando perfil...");
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), updates);
            state.currentUser = { ...state.currentUser, ...updates };
            window.app.toast("Perfil atualizado!");
            window.app.toggleEditProfile(false);
            window.app.haptic();
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao salvar.");
        }
    },

    renderWeightUI: () => {
        if(!state.currentUser) return;
        let history = state.currentUser.weightHistory || [];
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

        let history = state.currentUser.weightHistory || [];
        history.push(newEntry);
        
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { 
                weightHistory: history 
            });
            state.currentUser.weightHistory = history;
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
            if(state.currentUser.avatar) {
                await window.app.deleteFile(state.currentUser.avatar);
            }
            const imgUrl = await window.app.uploadImage(input.files[0], 'avatars');
            if(imgUrl) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { avatar: imgUrl });
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
                    strengthVideo: "" 
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

            const races = state.currentUser.races || [];
            races.push({ 
                name, 
                date, 
                targetDistance: dist,
                estimatedTime: estTime,
                workouts: generatedWorkouts, 
                created: new Date().toISOString() 
            });

            // 1. Atualiza documento do aluno (pesado)
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { races });
            
            // 2. OTIMIZAÇÃO SOLUÇÃO 1: Cria registro leve na coleção pública
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), {
                date: date,
                raceName: name,
                studentName: state.currentUser.name,
                studentEmail: state.currentUser.email,
                created: Date.now()
            });

            // Atualiza cache local para aparecer no calendário imediatamente
            state.communityRacesCache.push({
                date: date,
                raceName: name,
                studentName: state.currentUser.name,
                studentEmail: state.currentUser.email
            });

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

    // --- SAÚDE ---
    loadHealthTab: () => {
        if(!state.currentUser) return;
        window.app.setupUserNotifications(state.currentUser.email);
    },

    openHealthNutri: () => {
        window.app.screen('view-health-nutri');
        window.app.haptic();
    },

    openHealthMental: () => {
        window.app.screen('view-health-mental');
        window.app.haptic();
    },

    openHealthPhysio: () => {
        window.app.screen('view-health-physio');
        window.app.loadPhysioList();
        window.app.markPainAsReadByUser();
        window.app.haptic();
    },

    closeHealthSubView: () => {
        window.app.screen('view-app');
        window.app.nav('health');
        window.app.haptic();
    },

    loadPhysioList: () => {
        if(!state.currentUser) return;
        const list = document.getElementById('health-pain-list');
        list.innerHTML = '<p class="skeleton" style="height:50px;"></p>';

        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), 
            where("email", "==", state.currentUser.email)
        );

        getDocs(q).then((snapshot) => {
            if(snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999; font-size: 13px; padding: 20px;">Nenhum registro de dor.</p>';
                return;
            }

            let painItems = [];
            snapshot.forEach(d => painItems.push(d.data()));
            painItems.sort((a,b) => b.timestamp - a.timestamp); 
            painItems = painItems.slice(0, 20); 

            list.innerHTML = '';
            painItems.forEach(item => {
                const statusClass = item.responded ? 'answered' : 'pending';
                const statusText = item.responded ? 'Respondido' : 'Pendente';
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
};
