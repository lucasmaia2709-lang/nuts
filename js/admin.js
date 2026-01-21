import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, getDocs, startAfter, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_NEWS, C_TEMPLATES, C_VIDEOS, C_PAIN, C_QUOTES, C_PUBLIC_RACES, CF_WORKER_URL } from "./config.js";
import { state } from "./state.js";

export const admin = {
    // --- NAVEGAÇÃO PRINCIPAL ---
    
    loadAdmin: () => { 
        const view = document.getElementById('view-admin');
        if(view) {
            view.classList.add('active');
            window.app.admTab('users'); 
            document.body.style.backgroundColor = '#f0f2f5';
        }
    },

    closeAdmin: () => {
        const view = document.getElementById('view-admin');
        if(view) view.classList.remove('active');
        
        if(state.currentUser) {
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
        if(targetSection) targetSection.classList.remove('hidden');
        
        // Atualiza a sidebar
        document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById('btn-adm-' + t);
        if(activeBtn) activeBtn.classList.add('active');

        const titles = {
            'users': 'Gestão de Alunos',
            'physio': 'Fisioterapia & Relatos',
            'templates': 'Modelos de Treino',
            'news': 'Gerenciamento de Notícias',
            'quotes': 'Frases Motivacionais',
            'videos': 'Biblioteca de Vídeos'
        };
        const pageTitle = document.getElementById('admin-page-title');
        if(pageTitle) pageTitle.innerText = titles[t] || 'Painel Admin';

        // Carregamento de dados
        if(t === 'users') window.app.admLoadUsers(); 
        if(t === 'news') window.app.admLoadNewsHistory();
        if(t === 'quotes') window.app.admLoadQuotes();
        if(t === 'templates') window.app.admLoadTemplates();
        if(t === 'videos') window.app.admLoadStrengthVideos();
        if(t === 'physio') window.app.admLoadPhysio(); 
        
        const scrollContainer = document.querySelector('.admin-content-scroll');
        if(scrollContainer) scrollContainer.scrollTop = 0;
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
                
                if(u.races) {
                    u.races.forEach(r => {
                        if(r.workouts) {
                            r.workouts.forEach(w => {
                                if(w.done && w.completedAt) {
                                    const t = new Date(w.completedAt).getTime();
                                    if(t > lastWorkoutTime) {
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
        if(u.races) {
            u.races.forEach(r => {
                if(r.workouts) {
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
        if(!u) return;

        state.currentAdmUser = userId;
        document.getElementById('adm-content-users').classList.add('hidden');
        const detailView = document.getElementById('adm-user-detail-view');
        detailView.classList.remove('hidden');
        detailView.scrollTop = 0;

        document.getElementById('ud-img').src = u.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name);
        document.getElementById('ud-name').innerText = u.name;
        document.getElementById('ud-email').innerText = u.email;
        document.getElementById('ud-age').innerText = u.birthDate ? (new Date().getFullYear() - new Date(u.birthDate).getFullYear()) : '--';
        
        // --- NOVO: Exibição de Redes Sociais no Admin ---
        const sl = u.socialLinks || {};
        let socialHtml = '';
        if(sl.instagram) socialHtml += `<a href="${sl.instagram}" target="_blank" style="color:#E1306C; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-instagram"></i></a>`;
        if(sl.facebook) socialHtml += `<a href="${sl.facebook}" target="_blank" style="color:#1877F2; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-facebook"></i></a>`;
        if(sl.tiktok) socialHtml += `<a href="${sl.tiktok}" target="_blank" style="color:#000; margin-right:10px; font-size:16px; text-decoration:none;"><i class="fa-brands fa-tiktok"></i></a>`;

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
        if(lastDays <= 7) lastActiveColor = 'var(--success)';
        else if(lastDays > 15) lastActiveColor = 'var(--red)';
        
        const lastText = u.lastWorkout ? `${new Date(u.lastWorkout).toLocaleDateString()} (${lastDays}d)` : 'Nunca';
        document.getElementById('ud-last-active').innerHTML = `<span style="color:${lastActiveColor}">${lastText}</span>`;

        const actionsDiv = document.getElementById('ud-actions-top');
        const activeBtnText = u.active ? '<i class="fa-solid fa-ban"></i> Bloquear' : '<i class="fa-solid fa-check"></i> Aprovar';
        const activeBtnColor = u.active ? '#e74c3c' : '#2ecc71';
        
        actionsDiv.innerHTML = `
            <button onclick="window.app.admToggleStatus('${u.id}', ${!u.active})" style="background:${activeBtnColor}; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:12px; margin-right:10px;">${activeBtnText}</button>
            <button onclick="window.app.admDeleteUserQuick('${u.id}')" style="background:#eee; color:#333; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:12px;"><i class="fa-solid fa-trash"></i></button>
        `;

        const raceList = document.getElementById('ud-races-list');
        raceList.innerHTML = '';
        if(u.races && u.races.length > 0) {
            u.races.forEach((r, idx) => {
                const doneCount = r.workouts ? r.workouts.filter(w=>w.done).length : 0;
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

    admShowGoalWorkouts: (userId, raceIdx) => {
        const u = state.allUsersCache.find(user => user.id === userId);
        if(!u || !u.races || !u.races[raceIdx]) return;
        
        const container = document.getElementById(`race-workouts-${raceIdx}`);
        if(container.style.display === 'block') {
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
        
        if(workouts.length === 0) {
            html += `<tr><td colspan="4" style="text-align:center; color:#999;">Sem treinos cadastrados.</td></tr>`;
        } else {
            workouts.forEach((w, wIdx) => {
                const dateParts = w.scheduledDate ? w.scheduledDate.split('-') : ['','',''];
                const dateDisplay = w.scheduledDate ? `${dateParts[2]}/${dateParts[1]}` : '--/--';
                const statusIcon = w.done ? '<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc"></i>';
                
                const toggleBtn = `<button onclick="window.app.admToggleWorkoutStatus('${userId}', ${raceIdx}, ${wIdx}, ${!w.done})" style="border:none; background:none; cursor:pointer;">${statusIcon}</button>`;
                
                html += `
                <tr>
                    <td style="text-align:center;">${toggleBtn}</td>
                    <td>${dateDisplay}</td>
                    <td>
                        <span style="font-weight:600; font-size:12px;">${w.title}</span>
                        ${w.desc ? `<br><span style="color:#888; font-size:10px;">${w.desc.substring(0,30)}...</span>` : ''}
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
        
        if(!title) return window.app.toast('Título obrigatório');

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
        
        if(u.races && u.races[rIdx] && u.races[rIdx].workouts) {
            u.races[rIdx].workouts[wIdx].done = status;
            if(!status) delete u.races[rIdx].workouts[wIdx].completedAt;
            
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
        if(!state.currentAdmUser) return;
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
                if(data.email === email) pains.push(data);
            });
            pains.sort((a,b) => b.timestamp - a.timestamp);

            container.innerHTML = '';
            if(pains.length === 0) container.innerHTML = '<p style="font-size:12px; color:#ccc;">Sem registos de dor.</p>';
            
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
            if(snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1 / -1;">Nenhum relato encontrado.</p>';
                return;
            }
            let items = [];
            snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
            items.sort((a,b) => b.timestamp - a.timestamp);
            list.innerHTML = '';
            items.forEach(item => {
                const unreadClass = !item.readByAdmin ? 'unread' : '';
                const dateStr = new Date(item.timestamp).toLocaleDateString();
                const modalData = encodeURIComponent(JSON.stringify(item));
                list.innerHTML += `
                <div class="adm-pain-card ${unreadClass}" onclick="window.app.admOpenPainDetail('${modalData}')">
                    <div class="adm-pain-info">
                        <div class="adm-pain-user">${item.userName} <span style="font-weight:400; font-size:12px; color:#888;">- ${item.workoutTitle}</span></div>
                        <div class="adm-pain-date">${dateStr}</div>
                        <div class="adm-pain-msg"><strong>Dor ${item.painLevel}:</strong> ${item.notes}</div>
                    </div>
                    ${item.responded ? '<i class="fa-solid fa-check" style="color:var(--success);"></i>' : '<i class="fa-solid fa-envelope" style="color:#ddd;"></i>'}
                </div>`;
            });
        });
    },

    admOpenPainDetail: async (dataString) => {
        const data = JSON.parse(decodeURIComponent(dataString));
        state.currentPainId = data.id;
        const view = document.getElementById('adm-pain-detail-view');
        view.innerHTML = `
            <strong>Aluno:</strong> ${data.userName}<br>
            <strong>Treino:</strong> ${data.workoutTitle}<br>
            <strong>Data:</strong> ${new Date(data.timestamp).toLocaleDateString()}<br>
            <strong>Nível de Dor:</strong> ${data.painLevel}/7<br>
            <div style="margin-top:5px; padding-top:5px; border-top:1px dashed #ccc;">${data.notes}</div>
        `;
        document.getElementById('adm-pain-response-text').value = data.response || '';
        document.getElementById('modal-admin-pain-response').classList.add('active');
        if(!data.readByAdmin) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, state.currentPainId), { readByAdmin: true });
        }
    },

    admSendPainResponse: async () => {
        const response = document.getElementById('adm-pain-response-text').value;
        if(!response) return window.app.toast("Escreva uma resposta.");
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
    admToggleTemplate: (tId) => { if(state.expandedTemplates.has(tId)) state.expandedTemplates.delete(tId); else state.expandedTemplates.add(tId); const el = document.getElementById(`tpl-content-${tId}`); if(el) el.classList.toggle('open'); },
    admAddTemplateInline: async () => { window.app.showPrompt("Nome do Modelo:", async (name) => { if(!name) return; await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES)), { name, workouts: [] }); }); },
    admAddWorkoutToTemplateInline: (tId) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = null; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admEditWorkoutFromTemplate: async (tId, wIdx) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = wIdx; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const w = snap.data().workouts[wIdx]; document.getElementById('new-w-title').value = w.title; document.getElementById('new-w-desc').value = w.desc; document.getElementById('new-w-video').value = w.video || ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admMoveWorkout: async (tId, wIdx, direction) => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); const workouts = t.workouts; const newIdx = wIdx + direction; if (newIdx < 0 || newIdx >= workouts.length) return; const temp = workouts[wIdx]; workouts[wIdx] = workouts[newIdx]; workouts[newIdx] = temp; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts }); },
    admDeleteWorkoutFromTemplate: async (tId, wIdx) => { if(!confirm("Remover?")) return; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); t.workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: t.workouts }); },
    admDelTemplate: async (id) => { window.app.showConfirm("Apagar modelo?", async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, id))); },
    
    previewNewsImg: (input) => { 
        if(input.files && input.files[0]) {
            state.tempNewsFile = input.files[0];
            const url = URL.createObjectURL(state.tempNewsFile);
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
        if(state.tempNewsFile) imgUrl = await window.app.uploadImage(state.tempNewsFile, 'news');
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
    admLoadNewsHistory: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const div = document.getElementById('adm-news-history'); div.innerHTML = '';
            snap.forEach(d => { div.innerHTML += `<div style="padding:15px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; background:white; margin-bottom:5px; border-radius:10px;"><span>${d.data().title}</span><button onclick=\"window.app.admDeleteNews('${d.id}')\" style=\"color:red; border:none; background:none; cursor:pointer;\"><i class="fa-solid fa-trash"></i></button></div>`; });
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
            s.forEach(d=>{ l.innerHTML += `<div style="padding:15px; border-bottom:1px solid #eee; background:white; border-radius:10px; margin-bottom:5px; display:flex; justify-content:space-between;"><span>"${d.data().text}"</span> <button onclick="window.app.admDelQuote('${d.id}')" style="color:red; border:none; background:none; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></div>` });
        });
    },
    admDelQuote: async (id) => { window.app.showConfirm('Apagar frase?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id))); },
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
                <div style="background:#fff; border-bottom:1px solid #eee; padding:15px; display:flex; justify-content:space-between; align-items:center; border-radius:10px; margin-bottom:5px;">
                    <div>
                        <strong style="color:var(--text-main);">${v.title}</strong><br>
                        <a href="#" onclick="window.app.playVideo('${safeLink}')" style="font-size:12px; color:var(--primary); font-weight:600; text-decoration:none;"><i class="fa-solid fa-play"></i> Ver Vídeo</a>
                    </div>
                    <button onclick="window.app.admDeleteStrengthVideo('${d.id}')" style="color:var(--red); border:none; background:none; cursor:pointer; width:30px; height:30px;"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            });
        });
    },
    admDeleteStrengthVideo: async (id) => {
        if(confirm("Apagar vídeo?")) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id));
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
            if(btn) { btn.disabled = false; btn.innerText = "Criar"; }
        }
    },
    admDelRaceInline: async (docId, rIdx) => { window.app.showConfirm("Apagar objetivo?", async () => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); u.races.splice(rIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); window.app.openUserDetail(docId); }); },
    admAddRaceInline: async (docId) => { 
        state.currentAdmUser = docId;
        const tplSelect = document.getElementById('adm-race-template-select');
        tplSelect.innerHTML = '<option value="">Carregando...</option>';
        document.getElementById('adm-race-name').value = '';
        document.getElementById('adm-race-date').value = '';
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
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
        if(!selected || !startDateInput) return window.app.toast('Preencha os campos');
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
    }
};
