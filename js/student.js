import { doc, updateDoc, addDoc, getDocs, query, collection, onSnapshot, where, writeBatch, deleteDoc, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_PAIN, C_QUOTES, C_NEWS, C_VIDEOS, C_PHYSIO_TIPS, C_PUBLIC_RACES, C_CHALLENGES, C_LIVES, C_CONFIG, C_MENTAL, CF_WORKER_URL, ADMIN_EMAILS } from "./config.js";
import { state } from "./state.js";

// Lógica de Calendário, Treinos, Perfil e Saúde
export const student = {
    // --- CALENDÁRIO ---
    changeMonth: (dir) => { state.currentMonth.setMonth(state.currentMonth.getMonth() + dir); window.app.renderCalendar(); },

    renderCalendar: () => {
        if (!state.currentUser) return;
        const y = state.currentMonth.getFullYear();
        const m = state.currentMonth.getMonth();
        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        document.getElementById('cal-month-title').innerText = state.currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');

        const grid = document.getElementById('calendar-days');
        grid.innerHTML = '';

        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length - 1] : null;
        const workouts = activeRace ? activeRace.workouts : [];
        const notes = state.currentUser.notes || {};
        const todayStr = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD local

        for (let i = 0; i < firstDay; i++) { grid.innerHTML += `<div class="cal-cell other-month"></div>`; }
        for (let d = 1; d <= daysInMonth; d++) {
            // Constrói data manualmente para evitar timezone bugs
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            let cellClass = 'cal-cell';
            if (isToday) cellClass += ' today';
            let dotHtml = '';

            const scheduled = workouts.find(w => w.scheduledDate === dateStr);
            const doneHere = workouts.find(w => w.done && w.completedAt === dateStr);
            const isMyRaceDay = activeRace && activeRace.date === dateStr;

            // Inicializa modalData sempre com array vazio para garantir estrutura
            let modalData = { studentRaces: [] };

            if (scheduled) {
                cellClass += ' has-workout';
                dotHtml += `<div class="cal-dot"></div>`;
                // Ao mesclar dados do treino, mantemos studentRaces limpo para popular abaixo
                modalData = { ...scheduled, studentRaces: [] };
                if (scheduled.done) cellClass += ' done';
            }
            else if (doneHere) {
                cellClass += ' done';
                dotHtml += `<div class="cal-dot"></div>`;
                modalData = { ...doneHere, studentRaces: [] };
            }

            if (notes[dateStr]) { dotHtml += `<div class="cal-note-indicator"></div>`; }

            // Marcador da MINHA PROVA
            if (isMyRaceDay) {
                dotHtml += `<div class="cal-race-marker" style="background:var(--text-sec); border:1px solid #fff; z-index:2;" title="Minha Prova"></div>`;
                // Adiciona a própria prova ao modalData para aparecer no detalhe do dia
                modalData.studentRaces.push({
                    studentName: "Você",
                    raceName: activeRace.name,
                    studentEmail: state.currentUser.email,
                    date: dateStr
                });
            }

            // PROVAS DA COMUNIDADE (Correção de exibição)
            if (state.communityRacesCache && state.communityRacesCache.length > 0) {
                let hasStudentRace = false;
                state.communityRacesCache.forEach(race => {
                    if (race.studentEmail !== state.currentUser.email && race.date === dateStr) {
                        hasStudentRace = true;
                        // Garante fallback para evitar "undefined"
                        const sName = race.studentName || 'Aluno';
                        const rName = race.raceName || 'Prova';
                        modalData.studentRaces.push({
                            studentName: sName,
                            raceName: rName,
                            studentEmail: race.studentEmail,
                            date: dateStr
                        });
                    }
                });
                if (hasStudentRace) {
                    dotHtml += `<div class="cal-race-marker" title="Prova de aluno"></div>`;
                }
            }

            // MARCADOR DE DESAFIO CONCLUÍDO
            const completedChallenges = state.currentUser.completedChallenges || [];
            if (completedChallenges.includes(dateStr)) {
                // Adds a small green dot to the bottom-left of the cell.
                dotHtml += `<div class="cal-challenge-dot" style="position:absolute; bottom:4px; left:4px; width:6px; height:6px; border-radius:50%; background-color:#2ecc71;" title="Desafio Concluído"></div>`;
                // Add relative positioning to the cell itself if not already there via CSS
                if (!cellClass.includes('relative-cell')) {
                    cellClass += ' relative-cell';
                }
            }

            const el = document.createElement('div');
            el.className = cellClass;
            // The style ensures relative positioning works for the absolute dot
            el.style.position = 'relative';
            el.innerText = d;
            el.innerHTML += dotHtml;
            // Deep copy seguro para o onclick
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

        if (workoutData && (workoutData.title || workoutData.desc)) {
            let statusBadge = '<span style="color:var(--orange); font-size:12px;">Pendente</span>';
            if (workoutData.done) {
                if (workoutData.status === 'not_finished') statusBadge = '<strong style="color:var(--red); font-size:12px;">Não Concluído</strong>';
                else statusBadge = '<strong style="color:var(--success); font-size:12px;">Concluído</strong>';
            }
            content += `<div style="background:#f5f5f5; padding:15px; border-radius:10px; margin-bottom:15px;">
                <h4 style="margin:0 0 5px 0;">${workoutData.title}</h4>
                <p style="margin:0; font-size:13px; color:#666;">${workoutData.desc}</p>
                ${statusBadge}
            </div>`;
        } else if (!workoutData || (!workoutData.title && (!workoutData.studentRaces || workoutData.studentRaces.length === 0))) {
            content += `<p style="color:#999; text-align:center; margin-bottom:15px;">Sem treino registrado para este dia.</p>`;
        }

        const completedChallenges = state.currentUser.completedChallenges || [];
        if (completedChallenges.includes(dateStr)) {
            // Se tem desafio concluído neste dia, busca os dados do desafio correspondente.
            window.app.getChallengeForDate(dateStr, (activeChallenge) => {
                let challengeDesc = "Desafio do Dia";
                if (activeChallenge) {
                    let taskTime = '';
                    const task = activeChallenge.tasks.find(t => t.date === dateStr);
                    if (task && task.task) {
                        let displayTask = task.task;
                        if (/^(\d{2}):(\d{2})$/.test(displayTask) || /^(\d{2}):(\d{2}):(\d{2})$/.test(displayTask)) {
                            let parts = displayTask.split(':').map(Number);
                            let m = 0, s = 0;
                            if (parts.length === 3) { m = parts[1]; s = parts[2]; } else { m = parts[0]; s = parts[1]; }
                            let formattedTime = [];
                            if (m > 0) formattedTime.push(`${m}m`);
                            if (s > 0 || m === 0) formattedTime.push(`${s}s`);
                            taskTime = formattedTime.join(' ');
                        } else {
                            taskTime = displayTask;
                        }
                    }
                    challengeDesc = `${activeChallenge.name || 'Desafio do Dia'}, concluído` + (taskTime ? ` com o tempo de ${taskTime}` : '');
                }
                const chCardHtml = `<div style="background:#e8f8f5; border:1px solid #2ecc71; padding:10px; border-radius:8px; margin-bottom:15px; display:flex; align-items:center; gap:10px;">
                    <div style="background:#fff; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                        <i class="fa-solid fa-trophy" style="color:#2ecc71; font-size:14px;"></i>
                    </div>
                    <div>
                        <h4 style="margin:0; font-size:14px; color:#27ae60;">Desafio Concluído!</h4>
                        <p style="margin:0; font-size:12px; color:#666;">${challengeDesc}</p>
                    </div>
                </div>`;
                document.getElementById('day-det-content').insertAdjacentHTML('beforeend', chCardHtml);
            });
        }

        // Renderiza lista de provas de outros alunos E a própria prova se houver
        if (workoutData && workoutData.studentRaces && workoutData.studentRaces.length > 0) {
            content += `<div style="margin-top:15px;">
                <h4 style="font-size:14px; color:var(--primary); margin-bottom:10px;">Provas Marcadas:</h4>`;

            const isAdmin = ADMIN_EMAILS.includes(state.currentUser.email);

            workoutData.studentRaces.forEach(race => {
                const isMe = race.studentName === 'Você';
                const bg = isMe ? '#fff3e0' : '#fff'; // Destaque laranja claro se for minha prova
                const border = isMe ? 'var(--primary)' : '#eee';

                // Verifica se pode apagar (Dono ou Admin)
                // Se for Admin, pode apagar QUALQUER prova (inclusive as órfãs)
                let deleteBtn = '';
                if (isMe || isAdmin || race.studentEmail === state.currentUser.email) {
                    // Escapar strings para o onclick
                    const sEmail = window.app.escape(race.studentEmail);
                    const rName = window.app.escape(race.raceName);
                    const rDate = window.app.escape(race.date);
                    // Passamos true no último parâmetro para indicar "forçar exclusão" se for admin
                    deleteBtn = `<button onclick="window.app.deletePublicRaceEntry('${sEmail}', '${rName}', '${rDate}', true)" style="border:none; background:none; color:var(--red); cursor:pointer; float:right; font-size:14px;"><i class="fa-solid fa-trash"></i></button>`;
                }

                content += `<div style="background:${bg}; border:1px solid ${border}; padding:10px; border-radius:8px; margin-bottom:5px; font-size:13px;">
                    ${deleteBtn}
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

    deletePublicRaceEntry: async (studentEmail, raceName, raceDate, force = false) => {
        let msg = "Remover esta prova do calendário público?";
        if (force) msg += " (Como Admin, você pode apagar registros órfãos).";

        if (!confirm(msg)) return;
        window.app.toast("Apagando...");
        try {
            // Se o studentEmail estiver undefined ou vazio (provas muito antigas ou bugadas), tentamos buscar só por nome e data se for Admin
            let q;
            if ((!studentEmail || studentEmail === 'undefined') && force) {
                q = query(
                    collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES),
                    where("raceName", "==", raceName),
                    where("date", "==", raceDate)
                );
            } else {
                q = query(
                    collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES),
                    where("studentEmail", "==", studentEmail),
                    where("raceName", "==", raceName),
                    where("date", "==", raceDate)
                );
            }

            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            let count = 0;
            snapshot.forEach(d => {
                batch.delete(d.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                window.app.toast(count > 1 ? `${count} cópias removidas!` : "Prova removida!");
            } else {
                // Tenta uma busca mais genérica se for admin e falhou a busca exata
                if (force && count === 0) {
                    window.app.toast("Tentando busca forçada...");
                    const qForce = query(
                        collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES),
                        where("date", "==", raceDate),
                        where("raceName", "==", raceName)
                    );
                    const snapForce = await getDocs(qForce);
                    const batchForce = writeBatch(db);
                    let countForce = 0;
                    snapForce.forEach(d => {
                        batchForce.delete(d.ref);
                        countForce++;
                    });
                    if (countForce > 0) {
                        await batchForce.commit();
                        window.app.toast(`${countForce} registros órfãos removidos!`);
                    } else {
                        window.app.toast("Nenhum registro encontrado.");
                    }
                } else {
                    window.app.toast("Nenhum registro encontrado.");
                }
            }

            document.getElementById('modal-day-detail').classList.remove('active');
            // O listener onSnapshot no auth.js atualizará o calendário automaticamente
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao apagar.");
        }
    },

    saveDayNote: async () => {
        const note = document.getElementById('day-det-note').value;
        const notes = state.currentUser.notes || {};
        if (note.trim() === '') delete notes[state.selectedDayDate];
        else notes[state.selectedDayDate] = note;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { notes });
        window.app.toast("Nota salva!");
        document.getElementById('modal-day-detail').classList.remove('active');
        window.app.renderCalendar();
    },

    renderHome: () => { window.app.renderCalendar(); window.app.renderTodayCard(); window.app.renderChallengeCard(); window.app.renderLiveCard(); window.app.loadQuote(); window.app.loadHomeNews(); window.app.renderMoodCard(); },

    renderMoodCard: () => {
        const card = document.getElementById('mood-checkin-card');
        if (!card) return;
        if (state.currentUser && state.currentUser.lastMental && state.currentUser.lastMental.timestamp) {
            const lastDate = new Date(state.currentUser.lastMental.timestamp).toISOString().split('T')[0];
            const today = new Date().toISOString().split('T')[0];
            if (lastDate === today) {
                card.style.display = 'none';
                return;
            }
        }
        card.style.display = 'flex';
    },

    loadHomeNews: () => {
        const container = document.getElementById('home-latest-news');
        container.innerHTML = `<h3 style="font-size: 16px; margin: 0 0 15px;">Última Novidade</h3><div class="skeleton" style="width:100%; height:200px; border-radius:12px;"></div>`;
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const news = []; snap.forEach(d => news.push({ id: d.id, ...d.data() })); news.sort((a, b) => b.created - a.created);
            if (news.length > 0) {
                const n = news[0];
                container.innerHTML = `
                    <h3 style="font-size: 16px; margin: 0 0 15px;">Última Novidade</h3>
                    <div class="card news-card" style="margin-bottom:0;" onclick="window.app.openNewsDetail('${n.id}')">
                        ${n.img ? `<img src="${window.app.getSafeUrl(n.img)}" class="news-img" style="height:150px;">` : ''}
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
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s) => {
            const quotes = [];
            s.forEach(d => {
                const data = d.data();
                const authorStr = data.author && data.author !== 'Desconhecido' ? `<br><span style="font-size: 14px; opacity: 0.8; font-weight: 400; display: block; text-align: center; margin-top: 15px; width: 100%;">- ${data.author}</span>` : '';
                quotes.push(`"${data.text}"${authorStr}`);
            });
            if (quotes.length > 0) {
                const dayIndex = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
                document.getElementById('daily-quote').innerHTML = quotes[dayIndex % quotes.length];
            } else {
                document.getElementById('daily-quote').innerHTML = "\"O único treino ruim é aquele que não aconteceu.\"";
            }
        });
    },

    closeStrengthVideosPage: () => {
        window.app.screen('view-app');
    },

    openStrengthVideosPage: async () => {
        window.app.screen('view-strength-videos');
        const list = document.getElementById('strength-video-list');
        list.className = ""; // clear previous classes if any
        list.style.display = "block"; // Remove grid
        list.style.gridTemplateColumns = "";
        list.style.gap = "";
        list.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Carregando...</p>';

        try {
            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS), orderBy('created', 'desc'));
            const snap = await getDocs(q);

            if (snap.empty) {
                list.innerHTML = '<p style="text-align:center; padding:20px; color:#999; font-size:14px;">Nenhum vídeo cadastrado ainda.</p>';
                return;
            }

            const videos = [];
            snap.forEach(d => {
                const data = d.data();
                data.id = d.id;
                videos.push(data);
            });

            const videosByMuscle = {};
            videos.forEach(v => {
                const muscle = v.muscle || "Geral";
                if (!videosByMuscle[muscle]) videosByMuscle[muscle] = [];
                videosByMuscle[muscle].push(v);
            });

            list.innerHTML = '';

            for (const [muscleName, muscleVideos] of Object.entries(videosByMuscle)) {
                let htmlCards = '';
                muscleVideos.forEach(v => {
                    const safeLink = window.app.escape(v.link);
                    const coverImg = v.coverImg || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=400';
                    htmlCards += `
                    <div class="video-thumb-card" onclick="window.app.playVideo('${safeLink}')">
                        <img src="${window.app.getSafeUrl(coverImg)}" class="video-thumb-img" alt="${v.title}">
                        <div class="video-thumb-overlay">
                            <h4 class="video-thumb-title">${v.title}</h4>
                        </div>
                        <div class="video-thumb-play"><i class="fa-solid fa-play"></i></div>
                    </div>`;
                });

                list.innerHTML += `
                <div class="video-row-container">
                    <h4 class="video-row-title">${muscleName}</h4>
                    <div class="video-carousel">
                        ${htmlCards}
                    </div>
                </div>`;
            }
        } catch (e) {
            console.error(e);
            list.innerHTML = '<p style="text-align:center; padding:20px; color:#999; font-size:14px;">Erro ao carregar vídeos.</p>';
        }
    },

    // --- TREINOS ---
    renderTodayCard: (specificWorkout = null) => {
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length - 1] : null;
        if (!activeRace || activeRace.workouts.length === 0) {
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

        let raceDateDisplay = 'Sem Data';
        if (activeRace.date) {
            const p = activeRace.date.split('-');
            if (p.length === 3) raceDateDisplay = `${p[2]}/${p[1]}/${p[0]}`;
        }

        let cardHtml = '';

        const safeTitle = target ? window.app.escape(target.title) : '';
        const safeVideo = target && target.video ? window.app.escape(target.video) : '';

        if (target) {
            let doneBtn = '';
            if (target.done) {
                const isNotFinished = target.status === 'not_finished';
                const btnLabel = isNotFinished ? 'Não Concluído' : 'Feito';
            } else {
                let primaryBtnText = "Concluído";
                let btnIcon = "fa-check";
                let primaryAction = `window.app.finishWorkout('${safeTitle}')`;
                let showNotFinished = true;
                
                const isMixed = target.title.toLowerCase().includes('descanso') && target.title.toLowerCase().includes('fortalecimento');

                if (isMixed) {
                    doneBtn = `
                        <div style="display:flex; gap:10px; flex:1; flex-wrap:wrap;">
                            <button onclick="window.app.setWorkoutStatus('completed', '${safeTitle}')" class="btn" style="background:rgba(255,255,255,0.8); color:var(--text-main); flex:1; font-size:13px; padding:0 5px; min-width:100px;"><i class="fa-solid fa-bed"></i> Descansou</button>
                            <button onclick="window.app.finishWorkout('${safeTitle}')" class="btn" style="background:#FFF; color:var(--text-main); flex:1.2; font-size:13px; padding:0 5px; min-width:120px;"><i class="fa-solid fa-dumbbell"></i> Fortaleceu</button>
                            <button onclick="window.app.setWorkoutStatus('not_finished', '${safeTitle}')" class="btn" style="background:rgba(231, 76, 60, 0.2); color:#FFF; border:1px solid #e74c3c; flex:1; font-size:13px; padding:0 5px; min-width:100px;">Nenhum</button>
                        </div>`;
                } else if (target.type === 'strength' || target.title.toLowerCase().includes('fortalecimento')) {
                    primaryBtnText = "Concluir Fortalecimento";
                    btnIcon = "fa-dumbbell";
                    doneBtn = `
                        <div style="display:flex; gap:10px; flex:1; flex-wrap:wrap;">
                            <button onclick="${primaryAction}" class="btn" style="background:#FFF; color:var(--text-main); flex:1.2; font-size:14px; padding:0 5px; min-width:120px;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                            <button onclick="window.app.setWorkoutStatus('not_finished', '${safeTitle}')" class="btn" style="background:rgba(231, 76, 60, 0.2); color:#FFF; border:1px solid #e74c3c; flex:1; font-size:14px; padding:0 5px; min-width:100px;">Não Concluído</button>
                        </div>`;
                } else if (target.type === 'rest' || target.title.toLowerCase().includes('descanso')) {
                    primaryBtnText = "Marcar Descanso";
                    btnIcon = "fa-bed";
                    primaryAction = `window.app.setWorkoutStatus('completed', '${safeTitle}')`;
                    doneBtn = `
                        <div style="display:flex; gap:10px; flex:1; flex-wrap:wrap;">
                            <button onclick="${primaryAction}" class="btn" style="background:#FFF; color:var(--text-main); flex:1.2; font-size:14px; padding:0 5px; min-width:120px;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                        </div>`;
                } else {
                    doneBtn = `
                        <div style="display:flex; gap:10px; flex:1; flex-wrap:wrap;">
                            <button onclick="${primaryAction}" class="btn" style="background:#FFF; color:var(--text-main); flex:1.2; font-size:14px; padding:0 5px; min-width:120px;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                            <button onclick="window.app.setWorkoutStatus('not_finished', '${safeTitle}')" class="btn" style="background:rgba(231, 76, 60, 0.2); color:#FFF; border:1px solid #e74c3c; flex:1; font-size:14px; padding:0 5px; min-width:100px;">Não Concluído</button>
                        </div>`;
                }
            }
            let dateDisplay = "";
            if (target.scheduledDate) {
                const dParts = target.scheduledDate.split('-');
                dateDisplay = `<span style="font-size:12px; color:rgba(255,255,255,0.7); margin-left:8px; font-weight:400;">${dParts[2]}/${dParts[1]}</span>`;
            }

            let actionBtn = '';
            if (target.type === 'strength' || target.title.toLowerCase().includes('fortalecimento')) {
                actionBtn = `<button onclick="window.app.openStrengthVideosPage()" class="btn" style="background:rgba(255,255,255,0.4); color:var(--text-main); padding:0 20px; width:auto; display:flex; gap:8px;"><i class="fa-solid fa-dumbbell"></i> Ver Exercícios</button>`;
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
            <div style="margin-top:20px; font-size:12px; display:flex; justify-content:space-between; color:var(--text-sec); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;"><span>${doneW}/${totalW} Treinos</span> <span>Meta: ${raceDateDisplay}</span></div>
            <div class="progress-container"><div class="progress-bar" style="width:${pct}%"></div></div>
        `;
    },

    finishWorkout: (wTitle) => {
        state.pendingFinishWorkoutTitle = wTitle;
        state.postPainSelected = {}; // { "Pés": 5, "Lombar": 2 }
        document.getElementById('post-pain-notes').value = '';

        // Reset view
        document.getElementById('pain-question-view').classList.remove('hidden');
        document.getElementById('pain-detail-view').classList.add('hidden');

        // Uncheck all
        document.querySelectorAll('#post-pain-loc input').forEach(i => i.checked = false);
        document.getElementById('post-pain-intensities').innerHTML = '';

        document.getElementById('modal-finish-workout').classList.add('active');
    },

    setPainAnswer: (hasPain) => {
        if (!hasPain) {
            // Se não teve dor, já pula para o mental health
            window.app.confirmFinishWorkoutWithoutPain();
        } else {
            // Se teve, mostra detalhes
            document.getElementById('pain-question-view').classList.add('hidden');
            document.getElementById('pain-detail-view').classList.remove('hidden');
        }
    },

    setWorkoutStatus: (status, wTitle) => {
        if (wTitle) state.pendingFinishWorkoutTitle = wTitle;
        window.app.completeWorkoutProcess(null, status);
    },

    togglePostPainLocation: (loc) => {
        if (state.postPainSelected[loc] !== undefined) {
            delete state.postPainSelected[loc];
        } else {
            state.postPainSelected[loc] = 3; // default intensity
        }
        window.app.renderPostPainIntensities();
    },

    renderPostPainIntensities: () => {
        const container = document.getElementById('post-pain-intensities');
        container.innerHTML = '';

        Object.keys(state.postPainSelected).forEach(loc => {
            const currentVal = state.postPainSelected[loc];
            let buttonsHtml = '';
            for (let i = 1; i <= 10; i++) {
                const activeStyle = i <= currentVal ? 'background:var(--adm-primary); color:white;' : 'background:#eee; color:#666;';
                buttonsHtml += `<button onclick="window.app.setPostPainIntensity('${loc}', ${i})" style="border:none; border-radius:4px; padding:5px; font-size:10px; cursor:pointer; flex:1; ${activeStyle}">${i}</button>`;
            }

            container.innerHTML += `
                <div style="background:#f9f9f9; padding:10px; border-radius:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <strong style="font-size:13px;">${loc}</strong>
                        <span style="font-size:12px; color:var(--adm-primary); font-weight:700;">Nível ${currentVal}</span>
                    </div>
                    <div style="display:flex; gap:3px;">${buttonsHtml}</div>
                </div>
            `;
        });
    },

    setPostPainIntensity: (loc, val) => {
        state.postPainSelected[loc] = val;
        window.app.renderPostPainIntensities();
    },

    confirmFinishWorkoutWithoutPain: async () => {
        await window.app.completeWorkoutProcess(null);
    },

    confirmFinishWorkout: async () => {
        if (!state.pendingFinishWorkoutTitle) return;
        const locations = Object.keys(state.postPainSelected);
        if (locations.length === 0) return window.app.toast("Selecione onde sentiu dor ou clique em 'Não' no início.");

        const notes = document.getElementById('post-pain-notes').value.trim();
        const painData = {
            locations: state.postPainSelected,
            notes: notes
        };

        await window.app.completeWorkoutProcess(painData);
    },

    completeWorkoutProcess: async (painData, status = 'completed') => {
        const races = [...state.currentUser.races];
        const rIdx = races.length - 1;
        const wIdx = races[rIdx].workouts.findIndex(w => w.title === state.pendingFinishWorkoutTitle && !w.done);

        if (wIdx > -1) {
            races[rIdx].workouts[wIdx].done = true;
            races[rIdx].workouts[wIdx].status = status;
            races[rIdx].workouts[wIdx].completedAt = new Date().toISOString().split('T')[0];

            if (painData) {
                races[rIdx].workouts[wIdx].feedback = {
                    ...painData,
                    timestamp: Date.now()
                };

                // Envia para a fisio
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), {
                    email: state.currentUser.email,
                    userName: state.currentUser.name,
                    workoutTitle: state.pendingFinishWorkoutTitle,
                    painDetails: painData.locations,
                    notes: painData.notes,
                    timestamp: Date.now(),
                    readByAdmin: false,
                    responded: false,
                    response: null,
                    readByUser: true
                });
            }

            state.currentUser.races = races;
            window.app.renderHome();
            if (!document.getElementById('tab-workouts').classList.contains('hidden')) {
                window.app.renderWorkoutsList();
            }

            const toastMsg = status === 'not_finished' ? "Status atualizado." : "Treino concluído! Bom descanso.";
            window.app.toast(toastMsg);
            window.app.haptic();

            // Armazena a data do treino para o log de humor pós-corrida
            state.pendingMoodDate = races[rIdx].workouts[wIdx].scheduledDate;

            // Fecha pain modal e abre mental health pós-corrida
            document.getElementById('modal-finish-workout').classList.remove('active');

            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { races });

            document.getElementById('modal-post-workout-mood').classList.add('active');
        }
    },

    saveMentalHealth: async (mood, emoji) => {
        try {
            // Verifica se já registrou no mesmo dia
            if (state.currentUser.lastMental && state.currentUser.lastMental.timestamp) {
                const lastDate = new Date(state.currentUser.lastMental.timestamp).toISOString().split('T')[0];
                const today = new Date().toISOString().split('T')[0];
                if (lastDate === today) {
                    return window.app.toast("Você já registrou como está se sentindo hoje! Obrigado!");
                }
            }

            const mentalData = {
                mood,
                emoji,
                timestamp: Date.now(),
                email: state.currentUser.email,
                userName: state.currentUser.name
            };

            // 1. Atualiza no perfil do aluno (o card que o usuário pediu)
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), {
                lastMental: mentalData
            });

            // 2. Registra na nova coleção do log (igual fisio)
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL), mentalData);

            document.getElementById('modal-mental-health').classList.remove('active');

            // Atualiza o estado local e re-renderiza para mostrar no card se necessário
            state.currentUser.lastMental = mentalData;
            window.app.renderHome();

        } catch (err) {
            console.error(err);
            window.app.toast("Erro ao salvar feedback mental.");
        }
    },

    savePostWorkoutMood: async (mood, emoji) => {
        try {
            // Se tiver date pendente (de um treino concluído), usa meio dia dessa data
            // para garantir que caia no dia certo do histórico
            const timestamp = state.pendingMoodDate
                ? new Date(state.pendingMoodDate + "T12:00:00").getTime()
                : Date.now();

            const mentalData = {
                mood,
                emoji,
                timestamp: timestamp,
                email: state.currentUser.email,
                userName: state.currentUser.name,
                type: 'post-workout'
            };

            // Atualiza no perfil do aluno (o card pós treino) APENAS se fôr hoje
            const todayStr = new Date().toISOString().split('T')[0];
            const isToday = !state.pendingMoodDate || state.pendingMoodDate === todayStr;

            if (isToday) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), {
                    lastPostWorkoutMood: mentalData
                });
                state.currentUser.lastPostWorkoutMood = mentalData;
            }

            // Registra na nova coleção do log (sempre, para o histórico)
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL), mentalData);

            document.getElementById('modal-post-workout-mood').classList.remove('active');

            // Limpa estado
            delete state.pendingMoodDate;

            // Atualiza o estado local
            state.currentUser.lastPostWorkoutMood = mentalData;

            // Mostra overlay de parabéns
            document.getElementById('modal-workout-congrats').classList.add('active');

        } catch (err) {
            console.error(err);
            window.app.toast("Erro ao salvar feedback pós-treino.");
        }
    },

    closeCongratsModal: () => {
        document.getElementById('modal-workout-congrats').classList.remove('active');
        window.app.renderHome();
    },

    renderWorkoutsList: () => {
        const activeRace = (state.currentUser.races && state.currentUser.races.length) ? state.currentUser.races[state.currentUser.races.length - 1] : null;
        const list = document.getElementById('workouts-list');

        if (!activeRace) { list.innerHTML = ''; return; }
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
        let firstPendingIdx = -1;

        activeRace.workouts.forEach((w, i) => {
            if (!w.done && firstPendingIdx === -1) firstPendingIdx = i;
            let color = '#E0E0E0';
            let icon = 'fa-circle';
            if (w.done) {
                if (w.status === 'not_finished') {
                    color = 'var(--red)';
                    icon = 'fa-circle-xmark';
                } else {
                    color = 'var(--success)';
                    icon = 'fa-circle-check';
                }
            }
            const safeVideo = w.video ? window.app.escape(w.video) : '';
            const safeTitle = window.app.escape(w.title);

            let dateBadge = '';
            if (w.scheduledDate) {
                const dParts = w.scheduledDate.split('-');
                dateBadge = `<span style="font-size:10px; color:#FFF; background:var(--primary); padding:2px 6px; border-radius:6px; margin-left:8px; font-weight:600;">${dParts[2]}/${dParts[1]}</span>`;
            }

            let videoBtn = '';
            if (w.type === 'strength' || w.title.toLowerCase().includes('fortalecimento')) {
                videoBtn = `<button onclick="window.app.openStrengthVideosPage()" style="border:1px solid var(--secondary); background:transparent; color:var(--text-main); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-dumbbell" style="color:var(--primary);"></i> Ver Exercícios</button>`;
            } else if (safeVideo) {
                videoBtn = `<button onclick="window.app.playVideo('${safeVideo}')" style="border:1px solid var(--secondary); background:transparent; color:var(--text-main); padding: 6px 12px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-play" style="color:var(--primary);"></i> Vídeo</button>`;
            }

            let finishBtn = '';
            if (!w.done && (!w.scheduledDate || w.scheduledDate <= todayStr)) {
                let primaryBtnText = "Concluído";
                let btnIcon = "fa-check";
                let primaryAction = `window.app.finishWorkout('${safeTitle}')`;
                
                const isMixed = w.title.toLowerCase().includes('descanso') && w.title.toLowerCase().includes('fortalecimento');

                if (isMixed) {
                    finishBtn = `
                    <div style="display:flex; gap:8px; margin-right:8px; flex-wrap:wrap;">
                        <button onclick="event.stopPropagation(); window.app.setWorkoutStatus('completed', '${safeTitle}')" style="border:1px solid #888; background:transparent; color:var(--text-main); padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-bed"></i> Descansou</button>
                        <button onclick="event.stopPropagation(); window.app.finishWorkout('${safeTitle}')" style="border:1px solid var(--success); background:transparent; color:var(--success); padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-dumbbell"></i> Fortaleceu</button>
                        <button onclick="event.stopPropagation(); window.app.setWorkoutStatus('not_finished', '${safeTitle}')" style="border:1px solid #e74c3c; background:transparent; color:#e74c3c; padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-xmark"></i> Nenhum</button>
                    </div>`;
                } else if (w.type === 'strength' || w.title.toLowerCase().includes('fortalecimento')) {
                    primaryBtnText = "Fortalecimento";
                    btnIcon = "fa-dumbbell";
                    finishBtn = `
                    <div style="display:flex; gap:8px; margin-right:8px; flex-wrap:wrap;">
                        <button onclick="event.stopPropagation(); ${primaryAction}" style="border:1px solid var(--success); background:transparent; color:var(--success); padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                        <button onclick="event.stopPropagation(); window.app.setWorkoutStatus('not_finished', '${safeTitle}')" style="border:1px solid #e74c3c; background:transparent; color:#e74c3c; padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-xmark"></i> Não Concluído</button>
                    </div>`;
                } else if (w.type === 'rest' || w.title.toLowerCase().includes('descanso')) {
                    primaryBtnText = "Descanso";
                    btnIcon = "fa-bed";
                    primaryAction = `window.app.setWorkoutStatus('completed', '${safeTitle}')`;
                    finishBtn = `
                    <div style="display:flex; gap:8px; margin-right:8px; flex-wrap:wrap;">
                        <button onclick="event.stopPropagation(); ${primaryAction}" style="border:1px solid var(--success); background:transparent; color:var(--success); padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                    </div>`;
                } else {
                    finishBtn = `
                    <div style="display:flex; gap:8px; margin-right:8px; flex-wrap:wrap;">
                        <button onclick="event.stopPropagation(); ${primaryAction}" style="border:1px solid var(--success); background:transparent; color:var(--success); padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid ${btnIcon}"></i> ${primaryBtnText}</button>
                        <button onclick="event.stopPropagation(); window.app.setWorkoutStatus('not_finished', '${safeTitle}')" style="border:1px solid #e74c3c; background:transparent; color:#e74c3c; padding: 6px 10px; border-radius: 20px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;"><i class="fa-solid fa-xmark"></i> Não Concluído</button>
                    </div>`;
                }
            }

            list.innerHTML += `<div id="workout-item-${i}" class="card" style="display:flex; align-items:flex-start; gap: 15px; opacity: ${w.done ? 0.6 : 1}; padding:20px;">
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

        if (firstPendingIdx !== -1) {
            setTimeout(() => {
                const el = document.getElementById(`workout-item-${firstPendingIdx}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    },

    // --- PERFIL ---
    openProfile: () => {
        if (!state.currentUser) return;
        window.app.screen('view-profile');

        document.getElementById('profile-name-big').innerText = state.currentUser.name;
        document.getElementById('profile-email-big').innerText = state.currentUser.email.toLowerCase();
        const img = document.getElementById('profile-img-big');
        if (state.currentUser.avatar) { img.src = window.app.getSafeUrl(state.currentUser.avatar); img.style.display = 'block'; }
        else { img.style.display = 'none'; }

        document.getElementById('prof-birth').value = state.currentUser.birthDate || '';
        document.getElementById('prof-city').value = state.currentUser.city || '';
        document.getElementById('prof-country').value = state.currentUser.country || '';
        document.getElementById('prof-height').value = state.currentUser.height || '';

        // -- NOVO: Carregar Redes Sociais --
        const sl = state.currentUser.socialLinks || {};
        const insta = document.getElementById('prof-social-insta');
        const face = document.getElementById('prof-social-face');
        const tiktok = document.getElementById('prof-social-tiktok');

        if (insta) insta.value = sl.instagram || '';
        if (face) face.value = sl.facebook || '';
        if (tiktok) tiktok.value = sl.tiktok || '';
        // ----------------------------------

        window.app.renderWeightUI();
        window.app.toggleEditProfile(false);

        // -- NOVO: Mostrar card de questionário se estiver faltando --
        const promo = document.getElementById('profile-onboarding-promo');
        if (promo) {
            promo.style.display = (!state.currentUser.onboarding || Object.keys(state.currentUser.onboarding).length === 0) ? 'block' : 'none';
        }

        const hList = document.getElementById('profile-history');
        hList.innerHTML = '';
        (state.currentUser.races || []).forEach((r, i) => {
            const done = r.workouts.filter(w => w.done).length;
            const total = r.workouts.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
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
        const raceToUpdate = races[state.editingStudentRaceIndex];
        const raceName = raceToUpdate.name;

        // Guarda a data antiga para poder apagar da coleção pública
        const oldDate = raceToUpdate.date;

        // Atualiza a data no objeto local
        raceToUpdate.date = newDate;

        window.app.toast("Atualizando data...");
        try {
            // 1. Atualiza no perfil do Usuário (Documento Completo)
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), { races });

            // 2. Sincronização com Coleção Pública (para calendário)
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES),
                where("studentEmail", "==", state.currentUser.email),
                where("raceName", "==", raceName)
            );

            const querySnapshot = await getDocs(q);
            const batch = writeBatch(db);
            let hasChanges = false;

            // Se encontrar a prova antiga, apaga ela
            if (!querySnapshot.empty) {
                querySnapshot.forEach((docSnap) => {
                    batch.delete(docSnap.ref); // Deleta o registro antigo
                });
                hasChanges = true;
            }

            // Cria um NOVO registro com a NOVA data
            const newRaceRef = doc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES));
            batch.set(newRaceRef, {
                date: newDate,
                raceName: raceName,
                studentName: state.currentUser.name || 'Aluno',
                studentEmail: state.currentUser.email,
                created: Date.now()
            });
            hasChanges = true;

            if (hasChanges) {
                await batch.commit();
            }

            window.app.toast("Data atualizada!");
            document.getElementById('modal-edit-date').classList.remove('active');

            // Força atualização visual imediata de todos os componentes
            window.app.renderHome();
            window.app.renderCalendar();
            window.app.openProfile();
            window.app.haptic();
        } catch (e) {
            console.error("Erro ao salvar data:", e);
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
        if (!state.currentUser) return;
        const birthDate = document.getElementById('prof-birth').value;
        const city = document.getElementById('prof-city').value;
        const country = document.getElementById('prof-country').value;
        const height = document.getElementById('prof-height').value;

        // -- NOVO: Capturar Redes Sociais --
        const instagram = document.getElementById('prof-social-insta').value.trim();
        const facebook = document.getElementById('prof-social-face').value.trim();
        const tiktok = document.getElementById('prof-social-tiktok').value.trim();

        const socialLinks = { instagram, facebook, tiktok };
        // ----------------------------------

        let updates = { birthDate, city, country, height, socialLinks };

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
        if (!state.currentUser) return;
        let history = state.currentUser.weightHistory || [];
        history = history.filter(h => h.value !== undefined && h.value !== null && !isNaN(h.value));
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        const displayEl = document.getElementById('display-current-weight');
        if (history.length > 0) {
            const currentWeight = history[0].value;
            displayEl.innerHTML = `${currentWeight} <span style="font-size: 16px; font-weight: 400; color: var(--text-sec);">kg</span>`;
        } else {
            displayEl.innerHTML = '--';
        }

        const listContainer = document.getElementById('weight-history-list');
        listContainer.innerHTML = '';
        if (history.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center; color:#999; font-size:12px; margin-top:10px;">Nenhum registro.</p>';
        } else {
            history.forEach(h => {
                const dateStr = new Date(h.date).toLocaleDateString();
                listContainer.innerHTML += `
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px dashed #eee; font-size:14px; color:var(--text-main);" >
                    <span>${dateStr}</span>
                    <strong>${h.value} kg</strong>
                </div> `;
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
        if (!val || isNaN(val)) return window.app.toast("Digite um peso válido.");

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
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao salvar peso.");
        }
    },

    closeProfile: () => window.app.screen('view-app'),

    uploadAvatar: async (input) => {
        if (input.files && input.files[0]) {
            window.app.toast("Trocando foto...");
            if (state.currentUser.avatar) {
                await window.app.deleteFile(state.currentUser.avatar);
            }
            const imgUrl = await window.app.uploadImage(input.files[0], 'avatars');
            if (imgUrl) {
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

        if (!name || !date) return window.app.toast("Preencha o nome e data.");

        const today = new Date();
        const raceDateObj = new Date(date);

        const startDateObj = new Date();
        startDateObj.setDate(today.getDate() + 1);
        const startDateStr = startDateObj.toISOString().split('T')[0];

        const diffTime = raceDateObj - startDateObj;
        if (diffTime <= 0) return window.app.toast("Data deve ser futura.");

        window.app.toast("Seu professor está criando seu treino...");
        const btn = document.querySelector('#modal-add-race button.btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "Gerando..."; }

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
                } catch (e) {
                    errorDetails = await response.text();
                }
                throw new Error(`Worker Error: ${errorDetails} `);
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
            // Previne duplicação: apaga provas anteriores com mesmo nome/email
            const qDup = query(
                collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES),
                where("studentEmail", "==", state.currentUser.email),
                where("raceName", "==", name)
            );
            const snapDup = await getDocs(qDup);
            const batch = writeBatch(db);
            snapDup.forEach(doc => batch.delete(doc.ref)); // Remove duplicatas antigas

            const newRaceRef = doc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES));
            batch.set(newRaceRef, {
                date: date,
                raceName: name,
                studentName: state.currentUser.name,
                studentEmail: state.currentUser.email,
                created: Date.now()
            });
            await batch.commit();

            // Atualiza cache local para aparecer no calendário imediatamente
            // Remove antigos do cache se existirem
            state.communityRacesCache = state.communityRacesCache.filter(r => !(r.studentEmail === state.currentUser.email && r.raceName === name));
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
            if (btn) { btn.disabled = false; btn.innerText = "Criar"; }
        }
    },

    // --- SAÚDE ---
    loadHealthTab: () => {
        if (!state.currentUser) return;
        window.app.setupUserNotifications(state.currentUser.email);
    },

    openHealthNutri: () => {
        document.body.style.backgroundColor = '#f4f7f9'; // Fix piscada azul
        window.app.screen('view-health-nutri');
        window.app.haptic();
    },

    openHealthMental: () => {
        document.body.style.backgroundColor = '#f4f7f9';
        window.app.screen('view-health-mental');
        window.app.loadMentalHistory();
        window.app.haptic();
    },

    loadMentalHistory: () => {
        if (!state.currentUser) return;
        const list = document.getElementById('mental-history-list');
        const latest = state.currentUser.lastMental;

        const latestPostWorkout = state.currentUser.lastPostWorkoutMood;

        const todayStr = new Date().toLocaleDateString('pt-BR');

        // Update top cards - APENAS se fôr de hoje
        if (latest && new Date(latest.timestamp).toLocaleDateString('pt-BR') === todayStr) {
            document.getElementById('latest-mood-emoji').innerText = latest.emoji || '--';
            document.getElementById('latest-mood-label').innerText = latest.mood || '--';
            document.getElementById('latest-mood-date').innerText = new Date(latest.timestamp).toLocaleDateString();
        } else {
            document.getElementById('latest-mood-emoji').innerText = '--';
            document.getElementById('latest-mood-label').innerText = '--';
            document.getElementById('latest-mood-date').innerText = '--';
        }

        if (latestPostWorkout && new Date(latestPostWorkout.timestamp).toLocaleDateString('pt-BR') === todayStr) {
            const elEmoji = document.getElementById('latest-post-workout-mood-emoji');
            const elLabel = document.getElementById('latest-post-workout-mood-label');
            const elDate = document.getElementById('latest-post-workout-mood-date');

            if (elEmoji) elEmoji.innerText = latestPostWorkout.emoji || '--';
            if (elLabel) elLabel.innerText = latestPostWorkout.mood || '--';
            if (elDate) elDate.innerText = new Date(latestPostWorkout.timestamp).toLocaleDateString();
        } else {
            const elEmoji = document.getElementById('latest-post-workout-mood-emoji');
            const elLabel = document.getElementById('latest-post-workout-mood-label');
            const elDate = document.getElementById('latest-post-workout-mood-date');

            if (elEmoji) elEmoji.innerText = '--';
            if (elLabel) elLabel.innerText = '--';
            if (elDate) elDate.innerText = '--';
        }

        // Load list
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL),
            where("email", "==", state.currentUser.email),
            orderBy("timestamp", "desc"),
            limit(20)
        );

        getDocs(q).then((snapshot) => {
            if (snapshot.empty && !latest) {
                list.innerHTML = '<p style="text-align: center; color: #999; font-size: 13px; padding: 20px;">Nenhum registro encontrado.</p>';
                return;
            }
            list.innerHTML = '';

            // Agrupar por data
            const groups = {};
            snapshot.forEach(doc => {
                const d = doc.data();
                const dateKey = new Date(d.timestamp).toLocaleDateString('pt-BR');
                if (!groups[dateKey]) groups[dateKey] = { daily: null, post: null };
                if (d.type === 'post-workout') groups[dateKey].post = d;
                else groups[dateKey].daily = d;
            });

            const renderMood = (m, label) => {
                if (!m) return `<div style="flex:1; background:#f9f9f9; padding:10px; border-radius:8px; border:1px dashed #ddd; text-align:center; min-height:45px; display:flex; flex-direction:column; justify-content:center;"><small style="color:#ccc; font-size:10px;">${label}</small><div style="color:#ddd">-</div></div>`;
                return `
                    <div style="flex:1; background:#fff; padding:10px; border-radius:8px; border:1px solid #eee; display:flex; align-items:center; gap:8px; min-height:45px;">
                        <span style="font-size:20px;">${m.emoji}</span>
                        <div style="overflow:hidden;">
                            <small style="color:#9c27b0; font-size:9px; font-weight:700; display:block; text-transform:uppercase;">${label}</small>
                            <strong style="font-size:12px; color:var(--text-main); white-space:nowrap; text-overflow:ellipsis; overflow:hidden; display:block;">${m.mood}</strong>
                        </div>
                    </div>
                `;
            };

            Object.entries(groups).forEach(([date, moods]) => {
                list.innerHTML += `
                    <div style="margin-bottom:12px;">
                        <span style="font-size:11px; color:#888; margin-left:5px; font-weight:600;">${date}</span>
                        <div style="display:flex; gap:10px; margin-top:5px;">
                            ${renderMood(moods.daily, 'Mood Check-In')}
                            ${renderMood(moods.post, 'Pós Corrida')}
                        </div>
                    </div>
                `;
            });
        }).catch(err => {
            console.error("Erro ao carregar mental history:", err);
            // Se o erro for falta de índice, tenta carregar sem o orderBy e ordena no JS
            if (err.code === 'failed-precondition') {
                const qSimple = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL),
                    where("email", "==", state.currentUser.email),
                    limit(50)
                );
                getDocs(qSimple).then(snap => {
                    let items = [];
                    snap.forEach(d => items.push(d.data()));
                    items.sort((a, b) => b.timestamp - a.timestamp);
                    list.innerHTML = '';

                    const groups = {};
                    items.forEach(d => {
                        const dateKey = new Date(d.timestamp).toLocaleDateString('pt-BR');
                        if (!groups[dateKey]) groups[dateKey] = { daily: null, post: null };
                        if (d.type === 'post-workout') groups[dateKey].post = d;
                        else groups[dateKey].daily = d;
                    });

                    const renderMood = (m, label) => {
                        if (!m) return `<div style="flex:1; background:#f9f9f9; padding:10px; border-radius:8px; border:1px dashed #ddd; text-align:center; min-height:45px; display:flex; flex-direction:column; justify-content:center;"><small style="color:#ccc; font-size:10px;">${label}</small><div style="color:#ddd">-</div></div>`;
                        return `
                            <div style="flex:1; background:#fff; padding:10px; border-radius:8px; border:1px solid #eee; display:flex; align-items:center; gap:8px; min-height:45px;">
                                <span style="font-size:20px;">${m.emoji}</span>
                                <div style="overflow:hidden;">
                                    <small style="color:#9c27b0; font-size:9px; font-weight:700; display:block; text-transform:uppercase;">${label}</small>
                                    <strong style="font-size:12px; color:var(--text-main); white-space:nowrap; text-overflow:ellipsis; overflow:hidden; display:block;">${m.mood}</strong>
                                </div>
                            </div>
                        `;
                    };

                    Object.entries(groups).forEach(([date, moods]) => {
                        list.innerHTML += `
                            <div style="margin-bottom:12px;">
                                <span style="font-size:11px; color:#888; margin-left:5px; font-weight:600;">${date}</span>
                                <div style="display:flex; gap:10px; margin-top:5px;">
                                    ${renderMood(moods.daily, 'Mood Check-In')}
                                    ${renderMood(moods.post, 'Pós Corrida')}
                                </div>
                            </div>
                        `;
                    });
                });
            } else {
                list.innerHTML = '<p style="text-align: center; color: var(--red); font-size: 13px; padding: 20px;">Erro ao carregar histórico.</p>';
            }
        });
    },

    openHealthPhysio: () => {
        document.body.style.backgroundColor = '#f4f7f9'; // Fix piscada azul
        window.app.screen('view-health-physio');
        window.app.loadPhysioList();
        window.app.markPainAsReadByUser();
        window.app.haptic();
    },

    openPhysioTipsPage: async () => {
        window.app.screen('view-physiotips-page');
        const content = document.getElementById('physio-page-content');
        content.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Carregando...</p>';

        try {
            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS), orderBy('created', 'desc'));
            const snap = await getDocs(q);

            if (snap.empty) {
                content.innerHTML = '<p style="text-align:center; padding:20px; color:#999; font-size:14px;">Nenhuma dica cadastrada ainda.</p>';
                return;
            }

            const tips = [];
            snap.forEach(d => {
                const data = d.data();
                data.id = d.id;
                tips.push(data);
            });

            const tipsByCategory = {};
            tips.forEach(t => {
                const cat = t.category || "Geral";
                if (!tipsByCategory[cat]) tipsByCategory[cat] = [];
                tipsByCategory[cat].push(t);
            });

            content.innerHTML = '';

            for (const [catName, catTips] of Object.entries(tipsByCategory)) {
                let htmlCards = '';
                catTips.forEach(tip => {
                    const safeLink = window.app.escape(tip.link);
                    const coverImg = tip.coverImg || 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=400';
                    htmlCards += `
                    <div class="video-thumb-card" onclick="window.app.playVideo('${safeLink}')">
                        <img src="${window.app.getSafeUrl(coverImg)}" class="video-thumb-img" alt="${tip.title}">
                        <div class="video-thumb-overlay">
                            <h4 class="video-thumb-title">${tip.title}</h4>
                        </div>
                        <div class="video-thumb-play"><i class="fa-solid fa-play"></i></div>
                    </div>`;
                });

                content.innerHTML += `
                <div class="video-row-container">
                    <h4 class="video-row-title">${catName}</h4>
                    <div class="video-carousel">
                        ${htmlCards}
                    </div>
                </div>`;
            }
        } catch (e) {
            console.error(e);
            content.innerHTML = '<p style="text-align:center; padding:20px; color:#999; font-size:14px;">Erro ao carregar dicas.</p>';
        }
    },

    closePhysioTipsPage: () => {
        window.app.screen('view-health-physio');
        window.app.haptic();
    },

    closeHealthSubView: () => {
        document.body.style.backgroundColor = '#f4f7f9'; // Corrigido: Mantém fundo claro (igual ao app) para evitar flash azul
        window.app.screen('view-app');
        window.app.nav('health');
        window.app.haptic();
    },

    loadPhysioList: () => {
        if (!state.currentUser) return;
        const list = document.getElementById('health-pain-list');
        list.innerHTML = '<p class="skeleton" style="height:50px;"></p>';

        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN),
            where("email", "==", state.currentUser.email)
        );

        getDocs(q).then((snapshot) => {
            if (snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999; font-size: 13px; padding: 20px;">Nenhum registro de dor.</p>';
                return;
            }

            state.painHistoryCache = [];
            snapshot.forEach(d => {
                const data = d.data();
                data.id = d.id;
                state.painHistoryCache.push(data);
            });

            state.painHistoryCache.sort((a, b) => b.timestamp - a.timestamp);
            const painItems = state.painHistoryCache.slice(0, 20);

            list.innerHTML = '';
            painItems.forEach((item, index) => {
                const statusClass = item.responded ? 'answered' : 'pending';
                const statusText = item.responded ? 'Respondido' : 'Pendente';
                const dateStr = new Date(item.timestamp).toLocaleDateString();

                let painSummary = '';
                if (item.painDetails) {
                    painSummary = Object.entries(item.painDetails)
                        .map(([loc, score]) => `${loc} (${score})`)
                        .join(', ');
                } else {
                    painSummary = `Nível ${item.painLevel || 0}/7`;
                }

                list.innerHTML += `
                <div class="pain-item ${statusClass}" onclick="window.app.openStudentPainDetail(${index})" style="cursor:pointer;">
                    <div class="pain-header">
                        <span>${dateStr} - ${item.workoutTitle}</span>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <p class="pain-desc">
                        <strong>${painSummary}</strong><br>
                        <small style="color:#888;">${item.notes || 'Sem observações'}</small>
                    </p>
                    ${item.responded ? `<div style="font-size:11px; color:var(--success); font-weight:700; margin-top:5px;"><i class="fa-solid fa-comment-dots"></i> Ver resposta da Fisio</div>` : ''}
                </div> `;
            });
        });
    },

    openStudentPainDetail: (index) => {
        const item = state.painHistoryCache[index];
        if (!item) return;

        const content = document.getElementById('student-pain-detail-content');
        const dateStr = new Date(item.timestamp).toLocaleString();

        let detailHtml = `
            <div style="margin-bottom:15px; padding-bottom:15px; border-bottom: 1px dashed #eee;">
                <p><strong>Data:</strong> ${dateStr}</p>
                <p><strong>Treino:</strong> ${item.workoutTitle}</p>
            </div>
            <div style="margin-bottom:15px;">
                <p><strong>Relato de Dor:</strong></p>
                <ul style="margin:5px 0; padding-left:20px;">
        `;

        if (item.painDetails) {
            Object.entries(item.painDetails).forEach(([loc, score]) => {
                detailHtml += `<li>${loc}: Intensidade ${score}/10</li>`;
            });
        } else {
            detailHtml += `<li>Intensidade Geral: ${item.painLevel || 0}/7</li>`;
        }

        detailHtml += `</ul>
            <p style="margin-top:10px;"><strong>Observações:</strong><br>${item.notes || 'Nenhuma'}</p>
        </div>`;

        if (item.responded) {
            detailHtml += `
                <div style="background:#f0fff4; padding:15px; border-radius:12px; border-left:4px solid var(--success); margin-top:15px;">
                    <p style="color:#2e7d32; font-weight:700; font-size:12px; text-transform:uppercase; margin-bottom:5px;">
                        <i class="fa-solid fa-user-doctor"></i> Resposta da Fisio:
                    </p>
                    <p style="color:var(--text-main);">${item.response}</p>
                </div>
            `;
        } else {
            detailHtml += `
                <div style="background:#fffbf7; padding:15px; border-radius:12px; border-left:4px solid var(--text-sec); margin-top:15px;">
                    <p style="color:var(--text-sec); font-weight:700; font-size:12px; text-transform:uppercase;">
                        <i class="fa-solid fa-clock"></i> Aguardando avaliação da fisioterapia
                    </p>
                </div>
            `;
        }

        content.innerHTML = detailHtml;
        document.getElementById('modal-student-pain-detail').classList.add('active');
        window.app.haptic();
    },

    markPainAsReadByUser: async () => {
        if (!state.currentUser) return;
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN),
            where("email", "==", state.currentUser.email)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(async (d) => {
            const data = d.data();
            if (data.readByUser === false && data.response != null) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, d.id), { readByUser: true });
            }
        });
    },

    // --- NOVOS CARDS HOME ---

    getChallengeForDate: async (dateStr, callback) => {
        try {
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', C_CHALLENGES),
                where('startDate', '<=', dateStr),
                orderBy('startDate', 'desc')
            );
            const snap = await getDocs(q);
            let activeChallenge = null;
            snap.forEach(d => {
                const data = d.data();
                if (!activeChallenge && data.endDate >= dateStr) {
                    activeChallenge = data;
                }
            });
            callback(activeChallenge);
        } catch (e) {
            console.error("Erro getChallengeForDate", e);
            callback(null);
        }
    },

    renderChallengeCard: async () => {
        const container = document.getElementById('today-challenge-card');
        container.innerHTML = '';

        const todayStr = new Date().toISOString().split('T')[0];
        window.app.getChallengeForDate(todayStr, (activeChallenge) => {
            if (!activeChallenge) return;
            const todayTask = activeChallenge.tasks.find(t => t.date === todayStr);

            if (todayTask) {
                // Formatação do tempo: "00:00:32" -> "32s", "00:01:00" -> "1m", "00:01:30" -> "1m 30s"
                let displayTask = todayTask.task;
                if (/^(\d{2}):(\d{2})$/.test(displayTask) || /^(\d{2}):(\d{2}):(\d{2})$/.test(displayTask)) {
                    let parts = displayTask.split(':').map(Number);
                    let m = 0, s = 0;
                    if (parts.length === 3) { m = parts[1]; s = parts[2]; } // HH:MM:SS (ignorando HH por enquanto)
                    else { m = parts[0]; s = parts[1]; } // MM:SS

                    let formattedTime = [];
                    if (m > 0) formattedTime.push(`${m}m`);
                    if (s > 0 || m === 0) formattedTime.push(`${s}s`);
                    displayTask = formattedTime.join(' ');
                }

                const completedChallenges = state.currentUser.completedChallenges || [];
                const isDone = completedChallenges.includes(todayStr);

                const btnHtml = isDone
                    ? `<button disabled style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 8px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 15px; opacity: 0.7;"><i class="fa-solid fa-check"></i> Concluído</button>`
                    : `<button onclick="window.app.completeChallenge('${todayStr}')" style="background: white; color: #FF5E62; border: none; padding: 8px 15px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-top: 15px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">Feito <i class="fa-solid fa-check"></i></button>`;

                const playBtnHtml = activeChallenge.videoLink
                    ? `<button onclick="window.app.playVideo('${window.app.escape(activeChallenge.videoLink)}')" style="position: absolute; right: 15px; bottom: 15px; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(5px); color: white; border: 1px solid rgba(255,255,255,0.3); width: 44px; height: 44px; border-radius: 50%; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; box-shadow: 0 4px 10px rgba(0,0,0,0.15); transition: background 0.2s;"><i class="fa-solid fa-play" style="margin-left: 3px;"></i></button>`
                    : '';

                container.innerHTML = `
    <h3 style="font-size: 18px; margin: 10px 0 15px; color:var(--text-main);">Desafio do mês</h3>
    <div style="background: linear-gradient(135deg, #FF9966 0%, #FF5E62 100%); border-radius: 15px; padding: 20px; color: white; box-shadow: 0 4px 15px rgba(255, 94, 98, 0.3); position: relative; overflow: hidden; margin-bottom: 20px;" >
                    <div style="position: relative; z-index: 1;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px;">
                            <i class="fa-solid fa-fire"></i> ${activeChallenge.name || 'Desafio do Dia'}
                        </h4>
                        <p style="margin: 0; font-size: 18px; font-weight: 700; line-height: 1.4;">Hoje: ${displayTask}</p>
                        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                            ${btnHtml}
                        </div>
                    </div>
                    <i class="fa-solid fa-trophy" style="position: absolute; right: -10px; bottom: -20px; font-size: 80px; opacity: 0.2; transform: rotate(-15deg);"></i>
                    ${playBtnHtml}
                </div> `;
            }
        });
    },

    completeChallenge: async (dateStr) => {
        if (!state.currentUser) return;
        const currentCompleted = state.currentUser.completedChallenges || [];
        if (!currentCompleted.includes(dateStr)) {
            currentCompleted.push(dateStr);
            try {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), {
                    completedChallenges: currentCompleted
                });
                state.currentUser.completedChallenges = currentCompleted;
                window.app.toast("Desafio concluído! 🎉");
                window.app.renderChallengeCard();
                window.app.renderCalendar();
                window.app.haptic();
            } catch (err) {
                console.error("Erro ao completar desafio", err);
                window.app.toast("Erro ao salvar.");
            }
        }
    },

    renderLiveCard: async () => {
        const container = document.getElementById('next-live-card');

        const drawLive = (nextLive) => {
            if (!nextLive) {
                container.innerHTML = '';
                return;
            }
            const liveDate = new Date(nextLive.date);
            const day = liveDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
            const time = liveDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            let timeStr = `${day} às: 🇧🇷 ${time}`;
            if (nextLive.datePt) {
                const liveDatePt = new Date(nextLive.datePt);
                const timePt = liveDatePt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                timeStr = `${day} às: 🇧🇷 ${time} / 🇵🇹 ${timePt}`;
            }

            let icon = '<i class="fa-brands fa-youtube" style="font-size: 24px;"></i>';
            let bg = '#FF0000';
            let platformText = "WE'RE nuts";

            if (nextLive.platform === 'instagram') {
                icon = '<i class="fa-brands fa-instagram" style="font-size: 24px;"></i>';
                bg = '#E1306C';
                platformText = 'Instagram';
            } else if (nextLive.platform === 'zoom') {
                icon = '<i class="fa-solid fa-video" style="font-size: 24px;"></i>';
                bg = '#2D8CFF';
                platformText = 'Zoom/Meet';
            }

            container.innerHTML = `
    <h3 style="font-size: 18px; margin: 10px 0 15px; color:var(--text-main);">Próxima aula de fortalecimento</h3>
    <div style="background: #fff; border-radius: 15px; padding: 15px; border: 1px solid #eee; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); margin-bottom: 20px;" >
                    <div style="background: ${bg}; color: white; width: 50px; height: 50px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                        ${icon}
                    </div>
                    <div>
                        <h4 style="margin: 0; font-size: 14px; color: var(--text-main);">Ao vivo no ${platformText}</h4>
                        <div style="color: var(--primary); font-weight: 700; font-size: 16px; margin-top: 2px;">
                            ${timeStr}
                        </div>
                    </div>
                </div> `;
        };

        if (state.nextLiveFetched) {
            drawLive(state.nextLiveCache);
        } else {
            container.innerHTML = '';
        }

        try {
            // Busca a próxima live (data >= agora - 2h)
            const now = new Date();
            const twoHoursAgo = new Date(now.getTime() - 7200000);

            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_LIVES), orderBy('date', 'asc'));
            const snap = await getDocs(q);

            let nextLive = null;

            if (!snap.empty) {
                // Encontra a primeira live que ainda não "passou muito"
                for (const doc of snap.docs) {
                    const l = doc.data();
                    const lDate = new Date(l.date);
                    if (lDate > twoHoursAgo) {
                        nextLive = l;
                        break;
                    }
                }
            }

            const cacheKey = state.nextLiveCache ? state.nextLiveCache.date + state.nextLiveCache.platform : 'null';
            const newKey = nextLive ? nextLive.date + nextLive.platform : 'null';

            if (!state.nextLiveFetched || cacheKey !== newKey) {
                state.nextLiveCache = nextLive;
                state.nextLiveFetched = true;
                drawLive(nextLive);
            }

        } catch (e) {
            console.error("Erro live", e);
        }
    }
};
