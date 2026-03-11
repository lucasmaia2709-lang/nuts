import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, getDocs, startAfter, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_NEWS, C_TEMPLATES, C_VIDEOS, C_PHYSIO_TIPS, C_PAIN, C_QUOTES, C_PUBLIC_RACES, C_CHALLENGES, C_LIVES, C_CONFIG, C_MENTAL, CF_WORKER_URL } from "./config.js";
import { state } from "./state.js";

export const admin = {
    // --- NAVEGAÇÃO PRINCIPAL ---

    loadAdmin: () => {
        const view = document.getElementById('view-admin');
        if (view) {
            view.classList.add('active');
            window.app.admTab('users');
            document.body.style.backgroundColor = '#f0f2f5';
        }
    },

    closeAdmin: () => {
        const view = document.getElementById('view-admin');
        if (view) view.classList.remove('active');

        if (state.currentUser) {
            window.app.screen('view-app');
        } else {
            window.app.screen('view-landing');
        }
        document.body.style.backgroundColor = '#9cafcc';
    },

    admTab: (t) => {
        // Esconde todas as seções de conteúdo
        document.querySelectorAll('[id^="adm-content"]').forEach(e => e.classList.add('hidden'));
        // Esconde o detalhe do aluno se estiver aberto
        document.getElementById('adm-user-detail-view').classList.add('hidden');

        // Mostra a seção desejada
        const targetSection = document.getElementById('adm-content-' + t);
        if (targetSection) targetSection.classList.remove('hidden');

        // Atualiza a sidebar
        document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('btn-adm-' + t);
        if (activeBtn) activeBtn.classList.add('active');

        const titles = {
            'users': 'Gestão de Alunos',
            'physio': 'Fisioterapia & Relatos',
            'templates': 'Modelos de Treino',
            'news': 'Gerenciamento de Notícias',
            'quotes': 'Frases Motivacionais',
            'videos': 'Biblioteca de Vídeos',
            'challenges': 'Desafios & Lives',
            'mental': 'Mental Health'
        };
        const pageTitle = document.getElementById('admin-page-title');
        if (pageTitle) pageTitle.innerText = titles[t] || 'Painel Admin';

        // Carregamento de dados
        if (t === 'users') window.app.admLoadUsers();
        if (t === 'news') window.app.admLoadNewsHistory();
        if (t === 'quotes') window.app.admLoadQuotes();
        if (t === 'templates') window.app.admLoadTemplates();
        if (t === 'videos') window.app.admLoadStrengthVideos();
        if (t === 'physiotips') window.app.admLoadPhysioTips();
        if (t === 'physio') window.app.admLoadPhysio();
        if (t === 'challenges') window.app.admLoadChallenges();
        if (t === 'lives') window.app.admLoadLives();
        if (t === 'mental') window.app.admLoadMental();
        if (t === 'notifications') window.app.loadNotificationSettings();

        const scrollContainer = document.querySelector('.admin-content-scroll');
        if (scrollContainer) scrollContainer.scrollTop = 0;
    },

    // --- GESTÃO DE ALUNOS ---

    admLoadUsers: async () => {
        const tbody = document.getElementById('adm-users-table-body');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">A carregar lista de alunos...</td></tr>';

        try {
            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_USERS), orderBy('name'));
            const snapshot = await getDocs(q);

            state.allUsersCache = [];
            snapshot.forEach(d => {
                const u = d.data();
                let lastWorkoutDate = null;
                let lastWorkoutTime = 0;

                if (u.races) {
                    u.races.forEach(r => {
                        if (r.workouts) {
                            r.workouts.forEach(w => {
                                if (w.done && w.completedAt) {
                                    const t = new Date(w.completedAt).getTime();
                                    if (t > lastWorkoutTime) {
                                        lastWorkoutTime = t;
                                        lastWorkoutDate = w.completedAt;
                                    }
                                }
                            });
                        }
                    });
                }

                // Se nunca treinou, definimos como 999 dias para cair em inativo
                const daysInactive = lastWorkoutTime > 0 ? (Date.now() - lastWorkoutTime) / (1000 * 60 * 60 * 24) : 999;

                state.allUsersCache.push({
                    id: d.id,
                    ...u,
                    lastWorkout: lastWorkoutDate,
                    daysInactive: Math.floor(daysInactive)
                });
            });

            document.getElementById('adm-users-count').innerText = `${state.allUsersCache.length} Alunos Registados`;
            window.app.filterUsers();

        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar.</td></tr>';
        }
    },

    filterUsers: () => {
        const text = document.getElementById('filter-search').value.toLowerCase();
        const filterType = document.getElementById('filter-status').value; // all, active_real, late, inactive_real, pending
        const tbody = document.getElementById('adm-users-table-body');
        const emptyDiv = document.getElementById('adm-users-empty');

        tbody.innerHTML = '';
        let visibleCount = 0;

        state.allUsersCache.forEach(u => {
            // 1. Filtro de Texto
            if (text && !u.name.toLowerCase().includes(text) && !u.email.toLowerCase().includes(text)) return;

            // 2. Lógica de Status (Regra de Negócio)
            const isActiveDB = u.active; // True se aprovado no sistema
            const days = u.daysInactive;

            // PENDENTE: Não aprovado no banco (independente de treino)
            if (filterType === 'pending') {
                if (isActiveDB) return;
            }
            // FILTROS DE ATIVIDADE: Só aplicam para quem está aprovado no DB
            else if (!isActiveDB) {
                // Se o filtro não for 'pending' nem 'all', e o user não for aprovado, esconde
                if (filterType !== 'all') return;
            }
            else {
                // Usuário Aprovado (isActiveDB == true) -> Verificar dias
                if (filterType === 'active_real' && days > 7) return;
                if (filterType === 'late' && (days <= 7 || days > 15)) return;
                if (filterType === 'inactive_real' && days <= 15) return;
            }

            visibleCount++;
            const safeId = window.app.escape(u.id);
            const avatar = u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name) + '&background=random';

            // Renderização do Badge Visual
            let statusBadge = '';

            if (!isActiveDB) {
                // Pendente (Cinza/Azulado para diferenciar de atrasado)
                statusBadge = '<span class="status-dot status-grey"></span><span style="color:#7f8c8d; font-weight:600;">Pendente</span>';
            } else {
                if (days <= 7) {
                    // EM DIA (Verde)
                    statusBadge = '<span class="status-dot status-green"></span><span style="color:#2ecc71; font-weight:600;">Em dia</span>';
                } else if (days <= 15) {
                    // ATRASADO (Laranja)
                    statusBadge = `<span class="status-dot status-orange"></span><span style="color:#e67e22; font-weight:600;">Atrasado (${days}d)</span>`;
                } else {
                    // INATIVO (Vermelho)
                    const daysText = days === 999 ? 'Sem treinos' : `${days} dias`;
                    statusBadge = `<span class="status-dot status-red"></span><span style="color:#e74c3c; font-weight:600;">Inativo (${daysText})</span>`;
                }
            }

            const lastDateDisplay = u.lastWorkout ? new Date(u.lastWorkout).toLocaleDateString() : '<span style="color:#ccc;">--/--</span>';

            const tr = document.createElement('tr');
            tr.onclick = () => window.app.openUserDetail(u.id);
            tr.innerHTML = `
                <td><img src="${avatar}" class="table-avatar"></td>
                <td>
                    <div style="font-weight:600; color:var(--text-main);">${u.name}</div>
                    <div style="font-size:11px; color:#999;">${u.email}</div>
                </td>
                <td>${statusBadge}</td>
                <td>${lastDateDisplay}</td>
                <td>
                    <div class="progress-container" style="width:80px; height:6px; margin:0; background:#eee;">
                        <div class="progress-bar colored" style="width:${window.app.calcUserGlobalProgress(u)}%"></div>
                    </div>
                </td>
                <td><button class="btn-icon" style="color:#ccc;"><i class="fa-solid fa-chevron-right"></i></button></td>
            `;
            tbody.appendChild(tr);
        });

        emptyDiv.style.display = visibleCount === 0 ? 'block' : 'none';
    },

    calcUserGlobalProgress: (u) => {
        let total = 0, done = 0;
        if (u.races) {
            u.races.forEach(r => {
                if (r.workouts) {
                    total += r.workouts.length;
                    done += r.workouts.filter(w => w.done).length;
                }
            });
        }
        return total > 0 ? (done / total) * 100 : 0;
    },

    // --- DETALHE DO ALUNO & EDIÇÃO DE TREINOS ---

    openUserDetail: (userId) => {
        const u = state.allUsersCache.find(user => user.id === userId);
        if (!u) return;

        state.currentAdmUser = userId;
        document.getElementById('adm-content-users').classList.add('hidden');
        const detailView = document.getElementById('adm-user-detail-view');
        detailView.classList.remove('hidden');
        detailView.scrollTop = 0;

        document.getElementById('ud-img').src = u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name);
        document.getElementById('ud-name').innerText = u.name;
        document.getElementById('ud-email').innerText = u.email;
        document.getElementById('ud-age').innerText = u.birthDate ? (new Date().getFullYear() - new Date(u.birthDate).getFullYear()) : '--';

        // --- NOVO: Ficha do Aluno (Onboarding) ---
        const onb = u.onboarding || {};
        document.getElementById('ud-onb-level').innerText = onb.level || '--';
        document.getElementById('ud-onb-goal').innerText = onb.goalKm ? `${onb.goalKm} km (${onb.goalDate || ''})` : '--';
        document.getElementById('ud-onb-days').innerText = onb.trainingDays ? onb.trainingDays.join(', ') : '--';
        document.getElementById('ud-onb-longrun').innerText = onb.longRun || '--';
        document.getElementById('ud-onb-injuries').innerText = onb.injuriesHistory || 'Nenhuma informada.';
        // ----------------------------------------

        // --- NOVO: Exibição de Redes Sociais no Admin ---
        const sl = u.socialLinks || {};
        let socialHtml = '';
        if (sl.instagram) socialHtml += `<a href="${sl.instagram}" target="_blank" style="color:#E1306C; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-instagram"></i></a>`;
        if (sl.facebook) socialHtml += `<a href="${sl.facebook}" target="_blank" style="color:#1877F2; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-facebook"></i></a>`;
        if (sl.tiktok) socialHtml += `<a href="${sl.tiktok}" target="_blank" style="color:#000; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-tiktok"></i></a>`;

        const locationHtml = `<i class="fa-solid fa-location-dot"></i> ${u.city || '--'}, ${u.country || ''}`;

        // Injeta localização E redes sociais no mesmo bloco
        document.getElementById('ud-location').innerHTML = `
            <div>${locationHtml}</div>
            ${socialHtml ? `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #eee;">${socialHtml}</div>` : ''}
        `;
        // -----------------------------------------------

        document.getElementById('ud-height').innerText = u.height ? u.height + ' cm' : '--';

        const lastWeight = (u.weightHistory && u.weightHistory.length > 0) ? u.weightHistory[u.weightHistory.length - 1].value + ' kg' : '--';
        document.getElementById('ud-weight').innerText = lastWeight;

        // Exibir ultimo acesso/treino com cor condicional
        const lastDays = u.daysInactive;
        let lastActiveColor = 'var(--text-sec)';
        if (lastDays <= 7) lastActiveColor = 'var(--success)';
        else if (lastDays > 15) lastActiveColor = 'var(--red)';

        const lastText = u.lastWorkout ? `${new Date(u.lastWorkout).toLocaleDateString()} (${lastDays}d)` : 'Nunca';
        document.getElementById('ud-last-active').innerHTML = `<span style="color:${lastActiveColor}">${lastText}</span>`;

        const actionsDiv = document.getElementById('ud-actions-top');
        const activeBtnText = u.active ? '<i class="fa-solid fa-ban"></i> Bloquear' : '<i class="fa-solid fa-check"></i> Aprovar';
        const activeBtnColor = u.active ? '#e74c3c' : '#2ecc71';

        actionsDiv.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center;">
                <button onclick="window.app.admOpenMentalHistory()" class="btn-outline" 
                    style="width:auto; font-size:11px; padding:6px 12px; margin:0; border-radius:8px; background:white; color:#9c27b0; border-color:#e1bee7;">
                    <i class="fa-solid fa-brain"></i> Mental
                </button>
                <button onclick="window.app.openStudentInfoModal()" class="btn-outline" 
                    style="width:auto; font-size:11px; padding:6px 12px; margin:0; border-radius:8px; background:white;">
                    <i class="fa-solid fa-file-medical"></i> Ficha
                </button>
                <div style="width:1px; height:20px; background:#eee; margin:0 4px;"></div>
                <button onclick="window.app.admToggleStatus('${u.id}', ${!u.active})" 
                    style="background:${activeBtnColor}; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:12px;">
                    ${activeBtnText}
                </button>
                <button onclick="window.app.admDeleteUserQuick('${u.id}')" 
                    style="background:#f5f5f5; color:#666; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:12px;">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;

        const raceList = document.getElementById('ud-races-list');
        raceList.innerHTML = '';
        if (u.races && u.races.length > 0) {
            u.races.forEach((r, idx) => {
                const doneCount = r.workouts ? r.workouts.filter(w => w.done).length : 0;
                const totalCount = r.workouts ? r.workouts.length : 0;

                raceList.innerHTML += `
                <div style="border:1px solid #eee; border-radius:10px; margin-bottom:15px; padding:15px; background:#fbfbfb;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--adm-primary); font-size:14px;">${r.name}</strong>
                        <span style="font-size:11px; background:#e8e8e8; padding:3px 8px; border-radius:10px;">${doneCount}/${totalCount}</span>
                    </div>
                    <div style="margin-top:10px; display:flex; gap:10px;">
                        <button onclick="window.app.admShowGoalWorkouts('${u.id}', ${idx})" style="flex:1; border:1px solid #ddd; background:white; padding:8px; font-size:12px; cursor:pointer; border-radius:6px; font-weight:600; color:var(--text-main); box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                            <i class="fa-solid fa-list-check"></i> Ver / Editar Treinos
                        </button>
                        <button onclick="window.app.admDelRaceInline('${u.id}', ${idx})" style="color:var(--red); border:none; background:none; cursor:pointer; padding:0 10px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div id="race-workouts-${idx}" class="race-workouts-container"></div>
                </div>`;
            });
        } else {
            raceList.innerHTML = '<p style="font-size:13px; color:#999; font-style:italic;">Sem objetivos definidos.</p>';
        }

        document.getElementById('btn-ud-add-race').onclick = () => window.app.admAddRaceInline(u.id);
        document.getElementById('ud-admin-notes').value = u.adminNotes || '';
        window.app.loadUserPainHistoryMini(u.email);
    },

    openStudentInfoModal: () => {
        const userId = state.currentAdmUser;
        const u = state.allUsersCache.find(user => user.id === userId);
        if (!u || !u.onboarding) return window.app.toast("Este aluno ainda não preencheu o questionário.");

        const onb = u.onboarding;

        // Perfil Esportivo
        document.getElementById('view-onb-level').innerText = onb.level || '--';
        document.getElementById('view-onb-volume').innerText = onb.currentVolume || '--';
        document.getElementById('view-onb-goal-desc').innerText = onb.goalDesc || '--';

        // Contexto
        document.getElementById('view-onb-terrain').innerText = onb.terrain || '--';
        document.getElementById('view-onb-occupation').innerText = onb.occupation || '--';
        document.getElementById('view-onb-strength').innerText = onb.strength || '--';

        // Disponibilidade
        document.getElementById('view-onb-days').innerText = onb.trainingDays ? onb.trainingDays.join(', ') : '--';
        document.getElementById('view-onb-longrun').innerText = onb.longRun || '--';

        // Dores
        document.getElementById('view-onb-pain-locs').innerText = (onb.painLocations && onb.painLocations.length > 0) ? onb.painLocations.join(', ') : 'Nenhum';
        document.getElementById('view-onb-pain-score').innerText = onb.painScore || '0';
        document.getElementById('view-onb-pain-behavior').innerText = onb.painBehavior || '--';
        document.getElementById('view-onb-injuries-history').innerText = onb.injuriesHistory || 'Nada informado.';

        // Saúde
        document.getElementById('view-onb-rf-chest').innerText = onb.redFlagsChest || '--';
        document.getElementById('view-onb-rf-cardiac').innerText = onb.redFlagsCardiac || '--';
        document.getElementById('view-onb-meds').innerText = onb.meds || '--';

        // Equipamento e Meta
        document.getElementById('view-onb-shoes').innerText = onb.shoes || '--';
        document.getElementById('view-onb-target-km').innerText = onb.goalKm || '--';
        document.getElementById('view-onb-target-date').innerText = onb.goalDate || '--';

        document.getElementById('modal-adm-student-info').classList.add('active');
    },

    admShowGoalWorkouts: (userId, raceIdx) => {
        const u = state.allUsersCache.find(user => user.id === userId);
        if (!u || !u.races || !u.races[raceIdx]) return;

        const container = document.getElementById(`race-workouts-${raceIdx}`);
        if (container.style.display === 'block') {
            container.style.display = 'none';
            return;
        }

        const workouts = u.races[raceIdx].workouts || [];
        let html = `
        <table class="adm-workouts-table">
            <thead>
                <tr>
                    <th width="30">STS</th>
                    <th width="80">Data</th>
                    <th>Treino</th>
                    <th width="60">Ações</th>
                </tr>
            </thead>
            <tbody>`;

        if (workouts.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; color:#999;">Sem treinos cadastrados.</td></tr>`;
        } else {
            workouts.forEach((w, wIdx) => {
                const dateParts = w.scheduledDate ? w.scheduledDate.split('-') : ['', '', ''];
                const dateDisplay = w.scheduledDate ? `${dateParts[2]}/${dateParts[1]}` : '--/--';
                const statusIcon = w.done ? '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc"></i>';

                const toggleBtn = `<button onclick="window.app.admToggleWorkoutStatus('${userId}', ${raceIdx}, ${wIdx}, ${!w.done})" style="border:none; background:none; cursor:pointer;">${statusIcon}</button>`;

                html += `
                <tr>
                    <td style="text-align:center;">${toggleBtn}</td>
                    <td>${dateDisplay}</td>
                    <td>
                        <span style="font-weight:600; font-size:12px;">${w.title}</span>
                        ${w.desc ? `<br><span style="color:#888; font-size:10px;">${w.desc.substring(0, 30)}...</span>` : ''}
                    </td>
                    <td>
                        <button onclick="window.app.admAddWorkoutInline('${userId}', ${raceIdx}, ${wIdx})" style="border:none; background:none; color:#666; cursor:pointer; margin-right:5px;"><i class="fa-solid fa-pencil"></i></button>
                        <button onclick="window.app.admDeleteWorkoutInline('${userId}', ${raceIdx}, ${wIdx})" style="border:none; background:none; color:var(--red); cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }

        html += `</tbody></table>
        <div style="margin-top:10px; display:flex; gap:10px; justify-content:center;">
             <button onclick="window.app.admAddWorkoutInline('${userId}', ${raceIdx})" class="btn-outline" style="font-size:11px; padding:6px 12px; width:auto; margin:0;">+ Adicionar Treino</button>
             <button onclick="window.app.admImportTemplateInline('${userId}', ${raceIdx})" class="btn-outline" style="font-size:11px; padding:6px 12px; width:auto; margin:0;">+ Importar Modelo</button>
        </div>`;

        container.innerHTML = html;
        container.style.display = 'block';
    },

    admAddWorkoutInline: (docId, rIdx, wIdx = null) => {
        state.currentAdmUser = docId;
        state.currentAdmRaceIdx = rIdx;
        state.isEditingTemplate = false;
        state.editingWorkoutIndex = wIdx;

        const titleInput = document.getElementById('new-w-title');
        const descInput = document.getElementById('new-w-desc');
        const videoInput = document.getElementById('new-w-video');

        if (wIdx !== null) {
            const u = state.allUsersCache.find(user => user.id === docId);
            const w = u.races[rIdx].workouts[wIdx];
            document.getElementById('modal-workout-title').innerText = "Editar Treino";
            titleInput.value = w.title;
            descInput.value = w.desc || '';
            videoInput.value = w.video || '';
        } else {
            document.getElementById('modal-workout-title').innerText = "Novo Treino";
            titleInput.value = '';
            descInput.value = '';
            videoInput.value = '';
        }

        document.getElementById('modal-add-single-workout').classList.add('active');
    },

    saveSingleWorkout: async () => {
        const title = document.getElementById('new-w-title').value;
        const desc = document.getElementById('new-w-desc').value;
        const video = document.getElementById('new-w-video').value;

        if (!title) return window.app.toast('Título obrigatório');

        const uRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser);

        if (state.isEditingTemplate) {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId));
            const t = snap.data();
            if (state.editingWorkoutIndex !== null) t.workouts[state.editingWorkoutIndex] = { title, desc, video, done: false };
            else t.workouts.push({ title, desc, video, done: false });
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId), { workouts: t.workouts });
        }
        else {
            const snap = await getDoc(uRef);
            const u = snap.data();

            if (!u.races[state.currentAdmRaceIdx].workouts) u.races[state.currentAdmRaceIdx].workouts = [];

            if (state.editingWorkoutIndex !== null) {
                const existing = u.races[state.currentAdmRaceIdx].workouts[state.editingWorkoutIndex];
                u.races[state.currentAdmRaceIdx].workouts[state.editingWorkoutIndex] = {
                    ...existing,
                    title, desc, video
                };
            } else {
                u.races[state.currentAdmRaceIdx].workouts.push({
                    title, desc, video, done: false, scheduledDate: new Date().toISOString().split('T')[0]
                });
            }

            await updateDoc(uRef, { races: u.races });

            window.app.admLoadUsers().then(() => {
                window.app.openUserDetail(state.currentAdmUser);
                setTimeout(() => window.app.admShowGoalWorkouts(state.currentAdmUser, state.currentAdmRaceIdx), 100);
            });
        }
        document.getElementById('modal-add-single-workout').classList.remove('active');
        window.app.toast("Salvo com sucesso!");
    },

    admToggleWorkoutStatus: async (docId, rIdx, wIdx, status) => {
        const uRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId);
        const snap = await getDoc(uRef);
        const u = snap.data();

        if (u.races && u.races[rIdx] && u.races[rIdx].workouts) {
            u.races[rIdx].workouts[wIdx].done = status;
            if (!status) delete u.races[rIdx].workouts[wIdx].completedAt;

            await updateDoc(uRef, { races: u.races });

            window.app.admLoadUsers().then(() => {
                window.app.openUserDetail(docId);
                setTimeout(() => window.app.admShowGoalWorkouts(docId, rIdx), 50);
            });
            window.app.toast("Status atualizado");
        }
    },

    admDeleteWorkoutInline: async (docId, rIdx, wIdx) => {
        window.app.showConfirm("Remover este treino?", async () => {
            const uRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId);
            const snap = await getDoc(uRef);
            const u = snap.data();
            u.races[rIdx].workouts.splice(wIdx, 1);
            await updateDoc(uRef, { races: u.races });

            window.app.admLoadUsers().then(() => {
                window.app.openUserDetail(docId);
                setTimeout(() => window.app.admShowGoalWorkouts(docId, rIdx), 50);
            });
        });
    },

    closeUserDetail: () => {
        document.getElementById('adm-user-detail-view').classList.add('hidden');
        document.getElementById('adm-content-users').classList.remove('hidden');
        state.currentAdmUser = null;
    },

    saveAdminNotes: async () => {
        if (!state.currentAdmUser) return;
        const notes = document.getElementById('ud-admin-notes').value;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser), { adminNotes: notes });
        window.app.toast("Notas guardadas.");
    },

    loadUserPainHistoryMini: (email) => {
        const container = document.getElementById('ud-pain-mini-list');
        container.innerHTML = '<p style="font-size:12px; color:#999;">A carregar...</p>';
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), limit(10));
        getDocs(q).then(snap => {
            const pains = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.email === email) pains.push(data);
            });
            pains.sort((a, b) => b.timestamp - a.timestamp);

            container.innerHTML = '';
            if (pains.length === 0) container.innerHTML = '<p style="font-size:12px; color:#ccc;">Sem registos de dor.</p>';

            pains.forEach(p => {
                container.innerHTML += `
                <div style="font-size:12px; border-bottom:1px solid #f0f0f0; padding:8px 0;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="font-weight:600;">${new Date(p.timestamp).toLocaleDateString()}</span>
                        <span style="color:${p.painLevel > 4 ? 'var(--red)' : 'orange'}; font-weight:700;">Nível ${p.painLevel}</span>
                    </div>
                    <div style="color:#666; margin-top:3px;">${p.workoutTitle}</div>
                </div>`;
            });
        });
    },

    admLoadPhysio: () => {
        const list = document.getElementById('adm-physio-list');
        list.innerHTML = '<div class="skeleton" style="height:100px; grid-column: 1 / -1;"></div>';
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1 / -1;">Nenhum relato encontrado.</p>';
                return;
            }
            let items = [];
            snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
            items.sort((a, b) => b.timestamp - a.timestamp);
            list.innerHTML = '';
            items.forEach(item => {
                const unreadClass = !item.readByAdmin ? 'unread' : '';
                const dateStr = new Date(item.timestamp).toLocaleDateString();
                const modalData = encodeURIComponent(JSON.stringify(item));

                let painSummary = '';
                if (item.painDetails) {
                    painSummary = Object.entries(item.painDetails).map(([loc, score]) => `${loc} (${score})`).join(', ');
                } else {
                    painSummary = `Nível ${item.painLevel || 0}`;
                }

                list.innerHTML += `
                <div class="adm-pain-card ${unreadClass}" onclick="window.app.admOpenPainDetail('${modalData}')">
                    <div class="adm-pain-info">
                        <div class="adm-pain-user">${item.userName} <span style="font-weight:400; font-size:12px; color:#888;">- ${item.workoutTitle}</span></div>
                        <div class="adm-pain-date">${dateStr}</div>
                        <div class="adm-pain-msg"><strong>${painSummary}:</strong> ${item.notes}</div>
                    </div>
                    ${item.responded ? '<i class="fa-solid fa-check" style="color:var(--success);"></i>' : '<i class="fa-solid fa-envelope" style="color:#ddd;"></i>'}
                </div>`;
            });
        });
    },

    admLoadMental: () => {
        const list = document.getElementById('adm-mental-list');
        if (!list) return;
        list.innerHTML = '<div class="skeleton" style="height:100px;"></div>';
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL), orderBy('timestamp', 'desc'), limit(100));
        onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999; padding:20px;">Nenhum registro encontrado.</p>';
                return;
            }
            list.innerHTML = '';
            snapshot.forEach(d => {
                const item = d.data();
                const dateStr = new Date(item.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                list.innerHTML += `
                <div class="card" style="display:flex; align-items:center; gap:15px; padding:15px; margin-bottom:10px; border-left:4px solid #9c27b0;">
                    <span style="font-size:30px;">${item.emoji}</span>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:15px;">${item.userName || 'Aluno'}</strong>
                            <span style="font-size:11px; color:#999;">${dateStr}</span>
                        </div>
                        <div style="color:#6a1b9a; font-weight:600; font-size:14px;">${item.mood}</div>
                    </div>
                </div>`;
            });
        }, (err) => {
            console.error("Erro no onSnapshot Mental:", err);
            if (err.code === 'failed-precondition') {
                const qSimple = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL), limit(100));
                getDocs(qSimple).then(snap => {
                    let items = [];
                    snap.forEach(d => items.push(d.data()));
                    items.sort((a, b) => b.timestamp - a.timestamp);
                    list.innerHTML = '';
                    items.forEach(item => {
                        const dateStr = new Date(item.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                        list.innerHTML += `
                        <div class="card" style="display:flex; align-items:center; gap:15px; padding:15px; margin-bottom:10px; border-left:4px solid #9c27b0;">
                            <span style="font-size:30px;">${item.emoji}</span>
                            <div style="flex:1;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <strong style="font-size:15px;">${item.userName || 'Aluno'}</strong>
                                    <span style="font-size:11px; color:#999;">${dateStr}</span>
                                </div>
                                <div style="color:#6a1b9a; font-weight:600; font-size:14px;">${item.mood}</div>
                            </div>
                        </div>`;
                    });
                });
            }
        });
    },

    admOpenPainDetail: async (dataString) => {
        const data = JSON.parse(decodeURIComponent(dataString));
        state.currentPainId = data.id;
        const view = document.getElementById('adm-pain-detail-view');

        let painHtml = '';
        if (data.painDetails) {
            painHtml = Object.entries(data.painDetails).map(([loc, score]) => `<div><strong>${loc}:</strong> Nível ${score}/10</div>`).join('');
        } else {
            painHtml = `<div><strong>Nível de Dor:</strong> ${data.painLevel}/7</div>`;
        }

        view.innerHTML = `
            <strong>Aluno:</strong> ${data.userName}<br>
            <strong>Treino:</strong> ${data.workoutTitle}<br>
            <strong>Data:</strong> ${new Date(data.timestamp).toLocaleDateString()}<br>
            <div style="margin-top:10px; padding:10px; background:#f9f9f9; border-radius:8px;">
                ${painHtml}
            </div>
            <div style="margin-top:5px; padding-top:5px; border-top:1px dashed #ccc;">${data.notes}</div>
        `;
        document.getElementById('adm-pain-response-text').value = data.response || '';
        document.getElementById('modal-admin-pain-response').classList.add('active');
        if (!data.readByAdmin) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, state.currentPainId), { readByAdmin: true });
        }
    },

    admSendPainResponse: async () => {
        const response = document.getElementById('adm-pain-response-text').value;
        if (!response) return window.app.toast("Escreva uma resposta.");
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, state.currentPainId), {
            response: response,
            responseDate: Date.now(),
            responded: true,
            readByUser: false
        });
        window.app.toast("Resposta enviada!");
        document.getElementById('modal-admin-pain-response').classList.remove('active');
    },

    admToggleStatus: async (docId, status) => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { active: status }); window.app.toast(status ? "Aluno Aprovado" : "Aluno Bloqueado"); window.app.openUserDetail(docId); },
    admDeleteUserQuick: async (docId) => { window.app.showConfirm(`Apagar permanentemente?`, async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); window.app.closeUserDetail(); window.app.admLoadUsers(); }); },

    admLoadTemplates: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (snap) => {
            const list = document.getElementById('adm-templates-list'); list.innerHTML = '';
            let html = '';
            snap.forEach(d => {
                const t = d.data(); const tId = d.id; const isTplOpen = state.expandedTemplates.has(tId) ? 'open' : '';
                let workoutsHtml = '';
                if (t.workouts && t.workouts.length > 0) {
                    t.workouts.forEach((w, wIdx) => {
                        workoutsHtml += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:8px 0;"><div style="flex:1;"><span style="font-size:13px; font-weight:600;">${w.title}</span><br><small>${w.desc}</small></div><div style="display:flex; gap:5px;"><button onclick="window.app.admMoveWorkout('${tId}', ${wIdx}, -1)"><i class="fa-solid fa-arrow-up"></i></button><button onclick="window.app.admMoveWorkout('${tId}', ${wIdx}, 1)"><i class="fa-solid fa-arrow-down"></i></button><button onclick="window.app.admEditWorkoutFromTemplate('${tId}', ${wIdx})"><i class="fa-solid fa-pencil"></i></button><button onclick="window.app.admDeleteWorkoutFromTemplate('${tId}', ${wIdx})" style="color:red">X</button></div></div>`;
                    });
                } else { workoutsHtml = '<small>Sem treinos.</small>'; }
                html += `<div class="card" style="padding:10px; margin-bottom:10px;"><div class="adm-row-header" onclick="window.app.admToggleTemplate('${tId}')"><span>${t.name}</span><i class="fa-solid fa-chevron-down"></i></div><div id="tpl-content-${tId}" class="adm-nested ${isTplOpen}">${workoutsHtml}<div style="display:flex; justify-content:space-between; margin-top:10px;"><button onclick="window.app.admAddWorkoutToTemplateInline('${tId}')" class="adm-btn-small">+ Treino</button><button onclick="window.app.admDelTemplate('${tId}')" style="color:red; font-size:11px; border:none; background:none;">Excluir Modelo</button></div></div></div>`;
            });
            list.innerHTML = html;
        });
    },
    admToggleTemplate: (tId) => { if (state.expandedTemplates.has(tId)) state.expandedTemplates.delete(tId); else state.expandedTemplates.add(tId); const el = document.getElementById(`tpl-content-${tId}`); if (el) el.classList.toggle('open'); },
    admAddTemplateInline: async () => { window.app.showPrompt("Nome do Modelo:", async (name) => { if (!name) return; await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES)), { name, workouts: [] }); }); },
    admAddWorkoutToTemplateInline: (tId) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = null; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admEditWorkoutFromTemplate: async (tId, wIdx) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = wIdx; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const w = snap.data().workouts[wIdx]; document.getElementById('new-w-title').value = w.title; document.getElementById('new-w-desc').value = w.desc; document.getElementById('new-w-video').value = w.video || ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admMoveWorkout: async (tId, wIdx, direction) => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); const workouts = t.workouts; const newIdx = wIdx + direction; if (newIdx < 0 || newIdx >= workouts.length) return; const temp = workouts[wIdx]; workouts[wIdx] = workouts[newIdx]; workouts[newIdx] = temp; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts }); },
    admDeleteWorkoutFromTemplate: async (tId, wIdx) => { if (!confirm("Remover?")) return; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); t.workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: t.workouts }); },
    admDelTemplate: async (id) => { window.app.showConfirm("Apagar modelo?", async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, id))); },

    previewNewsImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempNewsFile = input.files[0];
            const url = URL.createObjectURL(state.tempNewsFile);
            const img = document.getElementById('news-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },
    previewVideoImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempVideoFile = input.files[0];
            const url = URL.createObjectURL(state.tempVideoFile);
            const img = document.getElementById('video-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },
    postNews: async () => {
        const title = document.getElementById('news-title').value;
        const body = document.getElementById('news-body').value;
        if (!title || !body) return window.app.toast('Preencha tudo');
        document.getElementById('btn-post-news').disabled = true;
        let imgUrl = null;
        if (state.tempNewsFile) imgUrl = await window.app.uploadImage(state.tempNewsFile, 'news');
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS)), {
            title, body, img: imgUrl, created: Date.now()
        });
        document.getElementById('news-title').value = '';
        document.getElementById('news-body').value = '';
        state.tempNewsFile = null;
        document.getElementById('news-preview').style.display = 'none';
        document.getElementById('btn-post-news').disabled = false;
        window.app.toast("Notícia publicada!");
        window.app.admTab('news');
    },

    previewEditNewsImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempEditNewsFile = input.files[0];
            const url = URL.createObjectURL(state.tempEditNewsFile);
            const img = document.getElementById('edit-news-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },
    openEditNews: async (id) => {
        state.currentEditNewsId = id;
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id));
        if (!snap.exists()) return;
        const d = snap.data();
        document.getElementById('edit-news-title').value = d.title || '';
        document.getElementById('edit-news-body').value = d.body || '';
        const img = document.getElementById('edit-news-preview');
        if (d.img) {
            img.src = d.img;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
        state.tempEditNewsFile = null;
        document.getElementById('edit-news-file').value = '';
        document.getElementById('modal-edit-news').classList.add('active');
    },
    saveEditNews: async () => {
        const id = state.currentEditNewsId;
        const title = document.getElementById('edit-news-title').value;
        const body = document.getElementById('edit-news-body').value;
        if (!title || !body) return window.app.toast('Preencha título e corpo');

        const btn = document.getElementById('btn-save-news');
        if (btn) btn.disabled = true;

        let updateData = { title, body };

        if (state.tempEditNewsFile) {
            window.app.toast("A fazer upload da imagem...");
            try {
                updateData.img = await window.app.uploadImage(state.tempEditNewsFile, 'news');
            } catch (e) {
                console.error("Erro upload:", e);
                window.app.toast("Erro no upload.");
            }
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id), updateData);
        if (btn) btn.disabled = false;
        document.getElementById('modal-edit-news').classList.remove('active');
        window.app.toast("Notícia atualizada!");
    },
    admLoadNewsHistory: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const div = document.getElementById('adm-news-history'); div.innerHTML = '';
            snap.forEach(d => { div.innerHTML += `<div style="padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; background:white; margin-bottom:5px; border-radius:10px;"><span>${d.data().title}</span><div><button onclick="window.app.openEditNews('${d.id}')" style="color:var(--primary); border:none; background:none; cursor:pointer; margin-right:10px;"><i class="fa-solid fa-pencil"></i></button><button onclick=\"window.app.admDeleteNews('${d.id}')\" style=\"color:red; border:none; background:none; cursor:pointer;\"><i class="fa-solid fa-trash"></i></button></div></div>`; });
        });
    },
    admDeleteNews: async (id) => {
        if (confirm("Apagar notícia?")) {
            const refDoc = doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id);
            const snap = await getDoc(refDoc);
            if (snap.exists() && snap.data().img) await window.app.deleteFile(snap.data().img);
            await deleteDoc(refDoc);
        }
    },
    postQuote: async () => {
        const text = document.getElementById('adm-quote-text').value; if (!text) return;
        const author = document.getElementById('adm-quote-author').value || 'Desconhecido';
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES)), { text, author, created: Date.now() });
        document.getElementById('adm-quote-text').value = '';
        document.getElementById('adm-quote-author').value = '';
    },
    admLoadQuotes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s) => {
            const l = document.getElementById('adm-quotes-list'); l.innerHTML = '';
            s.forEach(d => {
                const data = d.data();
                const authorDisplay = data.author ? ` - ${data.author}` : '';
                l.innerHTML += `<div style="padding:15px; border-bottom:1px solid #eee; background:white; border-radius:10px; margin-bottom:5px; display:flex; justify-content:space-between;"><span>"${data.text}"<br><small style="color:#888;">${authorDisplay}</small></span><div><button onclick="window.app.openEditQuote('${d.id}')" style="color:var(--primary); border:none; background:none; cursor:pointer; margin-right:10px;"><i class="fa-solid fa-pencil"></i></button><button onclick="window.app.admDelQuote('${d.id}')" style="color:red; border:none; background:none; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></div></div>`
            });
        });
    },
    openEditQuote: async (id) => {
        state.currentEditQuoteId = id;
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id));
        if (!snap.exists()) return;
        const d = snap.data();
        document.getElementById('edit-quote-text').value = d.text || '';
        document.getElementById('edit-quote-author').value = d.author || '';
        document.getElementById('modal-edit-quote').classList.add('active');
    },
    saveEditQuote: async () => {
        const id = state.currentEditQuoteId;
        const text = document.getElementById('edit-quote-text').value;
        const author = document.getElementById('edit-quote-author').value || 'Desconhecido';
        if (!text) return window.app.toast('Frase obrigatória');
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id), { text, author });
        document.getElementById('modal-edit-quote').classList.remove('active');
        window.app.toast('Frase atualizada!');
    },
    admDelQuote: async (id) => { window.app.showConfirm('Apagar frase?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id))); },
    admAddStrengthVideo: async () => {
        const title = document.getElementById('adm-video-title').value;
        const muscleInput = document.getElementById('adm-video-muscle').value.trim();
        const muscle = muscleInput || "Geral";
        const link = document.getElementById('adm-video-link').value;
        if (!title || !link) return window.app.toast("Preencha título e link");

        let imgUrl = null;
        if (state.tempVideoFile) {
            window.app.toast("A fazer upload da capa...");
            const uploadBtn = document.querySelector('#adm-content-videos button.btn-primary');
            if (uploadBtn) uploadBtn.disabled = true;
            try {
                imgUrl = await window.app.uploadImage(state.tempVideoFile, 'videos');
            } catch (e) {
                console.error("Erro no upload da capa:", e);
                window.app.toast("Erro no upload da capa.");
            }
            if (uploadBtn) uploadBtn.disabled = false;
        }

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS)), {
            title, muscle, link, coverImg: imgUrl, created: Date.now()
        });
        window.app.toast("Vídeo cadastrado!");
        document.getElementById('adm-video-title').value = '';
        document.getElementById('adm-video-muscle').value = '';
        document.getElementById('adm-video-link').value = '';
        state.tempVideoFile = null;
        document.getElementById('video-preview').style.display = 'none';

        const fileInput = document.getElementById('video-file');
        if (fileInput) fileInput.value = '';
    },
    admLoadStrengthVideos: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS), (snap) => {
            const list = document.getElementById('adm-videos-list');
            list.innerHTML = '';
            snap.forEach(d => {
                const v = d.data();
                const safeLink = window.app.escape(v.link);
                const coverHtml = v.coverImg ? `<img src="${v.coverImg}" style="width:50px; height:50px; border-radius:8px; object-fit:cover; margin-right:10px;">` : '';
                const muscleText = v.muscle ? ` <span style="font-size:11px; color:#888; background:#eee; padding:2px 6px; border-radius:10px; margin-left:5px;">${v.muscle}</span>` : '';

                list.innerHTML += `
                <div style="background:#fff; border-bottom:1px solid #eee; padding:15px; display:flex; justify-content:space-between; align-items:center; border-radius:10px; margin-bottom:5px;">
                    <div style="display:flex; align-items:center;">
                        ${coverHtml}
                        <div>
                            <strong style="color:var(--text-main);">${v.title}</strong>${muscleText}<br>
                            <a href="#" onclick="window.app.playVideo('${safeLink}')" style="font-size:12px; color:var(--primary); font-weight:600; text-decoration:none;"><i class="fa-solid fa-play"></i> Ver Vídeo</a>
                        </div>
                    </div>
                    <div>
                        <button onclick="window.app.openEditVideo('${d.id}')" style="color:var(--primary); border:none; background:none; cursor:pointer; width:30px; height:30px;"><i class="fa-solid fa-pencil"></i></button>
                        <button onclick="window.app.admDeleteStrengthVideo('${d.id}')" style="color:var(--red); border:none; background:none; cursor:pointer; width:30px; height:30px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            });
        });
    },

    previewEditVideoImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempEditVideoFile = input.files[0];
            const url = URL.createObjectURL(state.tempEditVideoFile);
            const img = document.getElementById('edit-video-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },
    openEditVideo: async (id) => {
        state.currentEditVideoId = id;
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id));
        if (!snap.exists()) return;
        const d = snap.data();
        document.getElementById('edit-video-title').value = d.title || '';
        document.getElementById('edit-video-muscle').value = d.muscle || '';
        document.getElementById('edit-video-link').value = d.link || '';

        const img = document.getElementById('edit-video-preview');
        if (d.coverImg) {
            img.src = d.coverImg;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }

        state.tempEditVideoFile = null;
        document.getElementById('edit-video-file').value = '';
        document.getElementById('modal-edit-video').classList.add('active');
    },
    saveEditStrengthVideo: async () => {
        const id = state.currentEditVideoId;
        const title = document.getElementById('edit-video-title').value;
        const muscleInput = document.getElementById('edit-video-muscle').value.trim();
        const muscle = muscleInput || "Geral";
        const link = document.getElementById('edit-video-link').value;
        if (!title || !link) return window.app.toast("Preencha título e link");

        const btn = document.getElementById('btn-save-video');
        if (btn) btn.disabled = true;

        let updateData = { title, muscle, link };

        if (state.tempEditVideoFile) {
            window.app.toast("A fazer upload da capa...");
            try {
                updateData.coverImg = await window.app.uploadImage(state.tempEditVideoFile, 'videos');
            } catch (e) {
                console.error("Erro upload:", e);
                window.app.toast("Erro no upload.");
            }
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id), updateData);
        if (btn) btn.disabled = false;
        document.getElementById('modal-edit-video').classList.remove('active');
        window.app.toast("Vídeo atualizado!");
    },
    admDeleteStrengthVideo: async (id) => {
        if (confirm("Apagar vídeo?")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id));
        }
    },

    previewPhysioTipImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempPhysioFile = input.files[0];
            const url = URL.createObjectURL(state.tempPhysioFile);
            const img = document.getElementById('physiotip-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },
    previewEditPhysioTipImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempEditPhysioFile = input.files[0];
            const url = URL.createObjectURL(state.tempEditPhysioFile);
            const img = document.getElementById('edit-physiotip-preview');
            img.src = url;
            img.style.display = 'block';
        }
    },

    admAddPhysioTip: async () => {
        const categoryInput = document.getElementById('adm-physiotip-category').value.trim();
        const category = categoryInput || "Geral";
        const title = document.getElementById('adm-physiotip-title').value;
        const link = document.getElementById('adm-physiotip-link').value;
        if (!title || !link) return window.app.toast("Preencha o título e o link");

        let imgUrl = null;
        if (state.tempPhysioFile) {
            window.app.toast("A fazer upload da capa...");
            const uploadBtn = document.querySelector('#adm-content-physiotips button.btn-primary');
            if (uploadBtn) uploadBtn.disabled = true;
            try {
                imgUrl = await window.app.uploadImage(state.tempPhysioFile, 'physiotips');
            } catch (e) {
                console.error("Erro no upload da capa:", e);
                window.app.toast("Erro no upload da capa.");
            }
            if (uploadBtn) uploadBtn.disabled = false;
        }

        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS)), {
            category, title, link, coverImg: imgUrl, created: Date.now()
        });
        window.app.toast("Orientação cadastrada!");
        document.getElementById('adm-physiotip-category').value = '';
        document.getElementById('adm-physiotip-title').value = '';
        document.getElementById('adm-physiotip-link').value = '';
        state.tempPhysioFile = null;
        document.getElementById('physiotip-preview').style.display = 'none';

        const fileInput = document.getElementById('physiotip-file');
        if (fileInput) fileInput.value = '';
    },
    admLoadPhysioTips: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS), (snap) => {
            const list = document.getElementById('adm-physiotips-list');
            list.innerHTML = '';
            snap.forEach(d => {
                const v = d.data();
                const safeLink = window.app.escape(v.link);
                const coverHtml = v.coverImg ? `<img src="${v.coverImg}" style="width:50px; height:50px; border-radius:8px; object-fit:cover; margin-right:10px;">` : '';

                list.innerHTML += `
                <div style="background:#fff; border-bottom:1px solid #eee; padding:15px; display:flex; justify-content:space-between; align-items:center; border-radius:10px; margin-bottom:5px;">
                    <div style="display:flex; align-items:center;">
                        ${coverHtml}
                        <div>
                            <strong style="color:var(--text-main);">${v.category ? `[${v.category}] ` : ''}${v.title}</strong><br>
                            <a href="#" onclick="window.app.playVideo('${safeLink}')" style="font-size:12px; color:var(--primary); font-weight:600; text-decoration:none;"><i class="fa-solid fa-play"></i> Ver Vídeo</a>
                        </div>
                    </div>
                    <div>
                        <button onclick="window.app.openEditPhysioTip('${d.id}')" style="color:var(--primary); border:none; background:none; cursor:pointer; width:30px; height:30px;"><i class="fa-solid fa-pencil"></i></button>
                        <button onclick="window.app.admDeletePhysioTip('${d.id}')" style="color:var(--red); border:none; background:none; cursor:pointer; width:30px; height:30px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            });
        });
    },
    openEditPhysioTip: async (id) => {
        state.currentEditPhysioTipId = id;
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS, id));
        if (!snap.exists()) return;
        const d = snap.data();
        document.getElementById('edit-physiotip-category').value = d.category || '';
        document.getElementById('edit-physiotip-title').value = d.title || '';
        document.getElementById('edit-physiotip-link').value = d.link || '';

        const img = document.getElementById('edit-physiotip-preview');
        if (d.coverImg) {
            img.src = d.coverImg;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }

        state.tempEditPhysioFile = null;
        document.getElementById('edit-physiotip-file').value = '';

        document.getElementById('modal-edit-physiotip').classList.add('active');
    },
    saveEditPhysioTip: async () => {
        const id = state.currentEditPhysioTipId;
        const categoryInput = document.getElementById('edit-physiotip-category').value.trim();
        const category = categoryInput || "Geral";
        const title = document.getElementById('edit-physiotip-title').value;
        const link = document.getElementById('edit-physiotip-link').value;

        if (!title || !link) return window.app.toast("Preencha título e link");

        const btn = document.getElementById('btn-save-physiotip');
        if (btn) btn.disabled = true;

        let updateData = { category, title, link };

        if (state.tempEditPhysioFile) {
            window.app.toast("A fazer upload da capa...");
            try {
                updateData.coverImg = await window.app.uploadImage(state.tempEditPhysioFile, 'physiotips');
            } catch (e) {
                console.error("Erro upload:", e);
                window.app.toast("Erro no upload.");
            }
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS, id), updateData);
        if (btn) btn.disabled = false;

        document.getElementById('modal-edit-physiotip').classList.remove('active');
        window.app.toast("Orientação atualizada!");
    },
    admDeletePhysioTip: async (id) => {
        if (confirm("Apagar orientação da fisio?")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PHYSIO_TIPS, id));
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
        if (btn) { btn.disabled = true; btn.innerText = "Processando..."; }

        try {
            if (method === 'ia') {
                const dist = parseFloat(document.getElementById('adm-race-dist').value) || 0;
                const time = document.getElementById('adm-race-time').value || "Não informado";
                targetDistance = dist;
                estimatedTime = time;
                const userObj = state.allUsersCache.find(x => x.id === state.currentAdmUser);
                const onb = userObj?.onboarding || {};

                const payload = {
                    name: name,
                    dist: dist,
                    estTime: time,
                    startDate: startDateStr,
                    raceDate: raceDate,
                    level: onb.level || 'Não informado',
                    trainingDays: onb.trainingDays || [],
                    longRunDay: onb.longRun || 'Domingo',
                    injuries: onb.injuries || 'Nenhum'
                };
                console.log("🚀 Payload enviado para a IA:", payload);

                const response = await fetch(CF_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error("Erro na IA.");
                const aiWorkoutsRaw = await response.json();
                if (!Array.isArray(aiWorkoutsRaw)) throw new Error("Formato inválido.");
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
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser);
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
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), {
                date: raceDate,
                raceName: name,
                studentName: uData.name,
                studentEmail: state.currentAdmUser,
                created: Date.now()
            });
            window.app.toast("Objetivo criado!");
            document.getElementById('modal-adm-add-race').classList.remove('active');
            window.app.openUserDetail(state.currentAdmUser);
        } catch (error) {
            window.app.toast("Erro: " + error.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = "Criar"; }
        }
    },
    admDelRaceInline: async (docId, rIdx) => { window.app.showConfirm("Apagar objetivo?", async () => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); u.races.splice(rIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); window.app.openUserDetail(docId); }); },
    admAddRaceInline: async (docId) => {
        state.currentAdmUser = docId;
        const userObj = state.allUsersCache.find(x => x.id === docId);
        const onb = userObj?.onboarding || {};

        const tplSelect = document.getElementById('adm-race-template-select');
        tplSelect.innerHTML = '<option value="">Carregando...</option>';

        document.getElementById('adm-race-name').value = onb.goalKm ? `Desafio ${onb.goalKm}km` : '';
        document.getElementById('adm-race-date').value = onb.goalDate || '';

        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('adm-start-date').value = tomorrow.toISOString().split('T')[0];

        document.getElementById('adm-race-method').value = 'ia';
        document.getElementById('adm-race-dist').value = onb.goalKm || '';
        document.getElementById('adm-race-time').value = '';

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

    // --- LIVES ---

    admLoadLives: () => {
        onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', C_LIVES), orderBy('date', 'desc')), (snap) => {
            const list = document.getElementById('adm-lives-list');
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = '<p style="color:#999; text-align:center;">Nenhuma live agendada.</p>';
                return;
            }

            snap.forEach(d => {
                const l = d.data();
                const dateObj = new Date(l.date);
                const day = dateObj.toLocaleDateString('pt-BR');
                const time = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                let icon = '<i class="fa-solid fa-video"></i>';
                let platformName = 'Live';

                if (l.platform === 'youtube') { icon = '<i class="fa-brands fa-youtube" style="color:red;"></i>'; platformName = 'YouTube'; }
                if (l.platform === 'instagram') { icon = '<i class="fa-brands fa-instagram" style="color:#E1306C;"></i>'; platformName = 'Instagram'; }
                if (l.platform === 'zoom') { icon = '<i class="fa-solid fa-video" style="color:#2D8CFF;"></i>'; platformName = 'Zoom/Meet'; }

                list.innerHTML += `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:15px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="font-size:24px; width:30px; text-align:center;">${icon}</div>
                        <div>
                            <strong style="color:var(--primary); font-size:16px;">${day} às ${time}</strong>
                            <div style="font-size:12px; color:#666;">${platformName}</div>
                        </div>
                    </div>
                    <button onclick="window.app.deleteLive('${d.id}')" style="color:red; background:none; border:none; cursor:pointer;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>`;
            });
        });
    },

    saveLive: async () => {
        const date = document.getElementById('adm-live-date').value;
        const platform = document.getElementById('adm-live-platform').value;

        if (!date) return window.app.toast("Selecione data e hora.");

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_LIVES), {
            date,
            platform,
            created: Date.now()
        });

        document.getElementById('adm-live-date').value = '';
        window.app.toast("Live agendada!");
    },

    deleteLive: async (id) => {
        if (!confirm("Excluir esta live?")) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_LIVES, id));
        window.app.toast("Live removida.");
    },

    saveNotificationSettings: async () => {
        const w1 = document.getElementById('notif-workout1').value;
        const w2 = document.getElementById('notif-workout2').value;
        const c = document.getElementById('notif-challenge').value;

        if (!w1 || !w2 || !c) {
            window.app.toast("Preencha todos os horários.");
            return;
        }

        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', C_CONFIG, 'notifications'), {
                workout1: w1,
                workout2: w2,
                challengeTime: c
            });
            window.app.toast("Horários salvos com sucesso!");
        } catch (e) {
            console.error("Erro ao salvar notif", e);
            window.app.toast("Erro ao salvar.");
        }
    },

    loadNotificationSettings: async () => {
        try {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_CONFIG, 'notifications'));
            if (snap.exists()) {
                const d = snap.data();
                if (d.workout1) document.getElementById('notif-workout1').value = d.workout1;
                if (d.workout2) document.getElementById('notif-workout2').value = d.workout2;
                if (d.challengeTime) document.getElementById('notif-challenge').value = d.challengeTime;
            }
        } catch (e) {
            console.error("Erro load notif", e);
        }
    },

    // --- DESAFIOS ---

    admLoadChallenges: () => {
        onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', C_CHALLENGES), orderBy('startDate', 'desc')), (snap) => {
            const list = document.getElementById('adm-challenges-list');
            list.innerHTML = '';

            if (snap.empty) {
                list.innerHTML = '<p style="color:#999; text-align:center;">Nenhum desafio criado.</p>';
                return;
            }

            snap.forEach(d => {
                const c = d.data();
                const start = new Date(c.startDate).toLocaleDateString('pt-BR');
                const end = new Date(c.endDate).toLocaleDateString('pt-BR');
                const name = c.name || "Desafio sem nome";

                list.innerHTML += `
                <div class="card" style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <strong style="font-size:15px;">${name}</strong>
                        <button onclick="window.app.deleteChallenge('${d.id}')" style="color:red; background:none; border:none; cursor:pointer;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                    <div style="font-size:12px; color:#666;">
                        <i class="fa-regular fa-calendar"></i> ${start} - ${end} &nbsp;|&nbsp; 
                        <i class="fa-solid fa-list-check"></i> ${c.tasks ? c.tasks.length : 0} Dias
                    </div>
                </div>`;
            });
        });
    },

    generateChallengeGrid: () => {
        const start = document.getElementById('adm-challenge-start').value;
        const end = document.getElementById('adm-challenge-end').value;
        const timeStartStr = document.getElementById('adm-challenge-time-start').value.trim();
        const timeEndStr = document.getElementById('adm-challenge-time-end').value.trim();

        if (!start || !end) return window.app.toast("Selecione Início e Fim.");
        if (end < start) return window.app.toast("Data final menor que inicial.");

        // Função auxiliar para converter HH:MM:SS ou MM:SS para segundos
        const parseToSeconds = (timeStr) => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
            if (parts.length === 2) return parts[0] * 60 + parts[1]; // MM:SS
            return parts[0] || 0; // Apenas segundos
        };

        // Função auxiliar para formatar segundos em HH:MM:SS
        const formatSeconds = (totalSeconds) => {
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            const pad = (num) => String(num).padStart(2, '0');
            if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
            return `${pad(m)}:${pad(s)}`; // Retorna só MM:SS se não tiver horas
        };

        const secStart = parseToSeconds(timeStartStr);
        const secEnd = parseToSeconds(timeEndStr);

        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays > 31) return window.app.toast("Máximo de 31 dias.");

        const container = document.getElementById('challenge-days-container');
        container.innerHTML = '';

        for (let i = 0; i < diffDays; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const dateDisplay = d.toLocaleDateString('pt-BR');

            // Interpolação linear dos segundos
            let currentSeconds = secStart;
            if (diffDays > 1) {
                currentSeconds = secStart + Math.round(((secEnd - secStart) / (diffDays - 1)) * i);
            }
            const timeValue = formatSeconds(currentSeconds);

            const div = document.createElement('div');
            div.innerHTML = `
                <div style="background:#f9f9f9; padding:10px; border-radius:8px; border:1px solid #eee;">
                    <strong style="font-size:12px; color:#666;">Dia ${dateDisplay}</strong>
                    <input type="text" class="input challenge-day-input" data-date="${dateStr}" value="${timeValue}" style="margin-top:5px; font-size:13px;">
                </div>
            `;
            container.appendChild(div);
        }

        document.getElementById('adm-challenge-grid').style.display = 'block';
        document.getElementById('btn-save-challenge').style.display = 'block';
    },

    saveChallenge: async () => {
        const name = document.getElementById('adm-challenge-name').value;
        const start = document.getElementById('adm-challenge-start').value;
        const end = document.getElementById('adm-challenge-end').value;
        const inputs = document.querySelectorAll('.challenge-day-input');

        if (!name) return window.app.toast("Dê um nome ao desafio.");

        let tasks = [];
        let allFilled = true;

        inputs.forEach(inp => {
            const val = inp.value.trim();
            if (!val) allFilled = false;
            tasks.push({
                date: inp.getAttribute('data-date'),
                task: val,
                done: false
            });
        });

        if (!allFilled) return window.app.toast("Preencha todos os dias.");

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_CHALLENGES), {
            name: name,
            startDate: start,
            endDate: end,
            tasks: tasks,
            created: Date.now()
        });

        window.app.toast("Desafio criado com sucesso!");

        // Reset Form
        document.getElementById('adm-challenge-grid').style.display = 'none';
        document.getElementById('btn-save-challenge').style.display = 'none';
        document.getElementById('challenge-days-container').innerHTML = '';
        document.getElementById('adm-challenge-start').value = '';
        document.getElementById('adm-challenge-end').value = '';
        document.getElementById('adm-challenge-name').value = '';
    },

    deleteChallenge: async (id) => {
        if (!confirm("Excluir este desafio?")) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_CHALLENGES, id));
        window.app.toast("Desafio removido.");
    },
    admImportTemplateInline: (docId, rIdx) => {
        state.currentAdmUser = docId; state.currentAdmRaceIdx = rIdx;
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
        if (!selected || !startDateInput) return window.app.toast('Preencha os campos');
        const templateId = selected.value;
        const tSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, templateId));
        const tData = tSnap.data();
        const uSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser));
        const u = uSnap.data();
        const startDate = new Date(startDateInput);
        const newWorkouts = tData.workouts.map((w, index) => {
            const date = new Date(startDate);
            date.setDate(date.getDate() + index);
            return { ...w, scheduledDate: date.toISOString().split('T')[0], done: false };
        });
        u.races[state.currentAdmRaceIdx].workouts.push(...newWorkouts);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser), { races: u.races });
        window.app.toast("Modelo importado!");
        document.getElementById('modal-select-template').classList.remove('active');
        window.app.admShowGoalWorkouts(state.currentAdmUser, state.currentAdmRaceIdx);
    },

    admOpenMentalHistory: async () => {
        if (!state.currentAdmUser) return;
        const u = state.allUsersCache.find(user => user.id === state.currentAdmUser);
        if (!u) return;

        document.getElementById('modal-adm-mental-history').classList.add('active');
        const list = document.getElementById('adm-mental-history-list');
        list.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Carregando histórico...</p>';

        try {
            const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL),
                where("email", "==", u.email),
                orderBy("timestamp", "desc"),
                limit(50)
            );

            const snap = await getDocs(q);

            if (snap.empty) {
                list.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum registro de bem-estar encontrado.</p>';
                return;
            }

            list.innerHTML = '';
            snap.forEach(doc => {
                const d = doc.data();
                const dateStr = new Date(d.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                list.innerHTML += `
                    <div style="display:flex; align-items:center; gap:15px; padding:12px; border:1px solid #eee; border-radius:12px; background:#fff;">
                        <span style="font-size:24px;">${d.emoji}</span>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="font-size:14px; color:var(--text-main);">${d.mood}</strong>
                                <span style="font-size:11px; color:#999;">${dateStr}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        } catch (err) {
            console.error("Erro ao carregar histórico mental:", err);

            // Força a exibição do link de criação do índice no frontend para o dev clicar/ver
            if (err.message && err.message.includes("index")) {
                console.error("FIREBASE INDEX REQUIRED: ", err.message);
            }

            // Se o erro for 'failed-precondition' (falta de índice para orderby), tentamos buscar sem orderby e ordenar manualmente
            if (err.code === 'failed-precondition') {
                try {
                    console.log("Tentando carregar histórico mental global (fallback)... email buscado:", u.email);
                    // Removemos o 'where' para evitar qualquer erro de índice
                    const qSimple = query(collection(db, 'artifacts', appId, 'public', 'data', C_MENTAL), limit(200));
                    const snap = await getDocs(qSimple);

                    let items = [];
                    snap.forEach(doc => {
                        const data = doc.data();
                        if (data.email === u.email) {
                            items.push({ id: doc.id, ...data });
                        }
                    });

                    console.log("Itens encontrados no fallback para este usuário:", items.length);

                    if (items.length === 0) {
                        list.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum registro de bem-estar encontrado.</p>';
                        return;
                    }

                    // Ordenar manualmente: mais recentes primeiro
                    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                    list.innerHTML = '';
                    items.forEach(d => {
                        const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/--';
                        list.innerHTML += `
                            <div style="display:flex; align-items:center; gap:15px; padding:12px; border:1px solid #eee; border-radius:12px; background:#fff; margin-bottom:10px;">
                                <span style="font-size:24px;">${d.emoji || '❓'}</span>
                                <div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <strong style="font-size:14px; color:var(--text-main);">${d.mood || 'Sem humor'}</strong>
                                        <span style="font-size:11px; color:#999;">${dateStr}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                } catch (fallbackErr) {
                    console.error("Erro no fallback do histórico mental:", fallbackErr);
                    list.innerHTML = `<p style="text-align:center; padding:10px; color:var(--red); font-size:12px;">Erro persistente: ${fallbackErr.message}</p>`;
                }
            } else {
                list.innerHTML = `<p style="text-align:center; padding:10px; color:var(--red); font-size:12px;">Erro ao carregar: ${err.message}</p>`;
            }
        }
    }
};
