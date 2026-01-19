import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, getDocs, startAfter, addDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_NEWS, C_TEMPLATES, C_VIDEOS, C_PAIN, C_QUOTES, C_PUBLIC_RACES, CF_WORKER_URL } from "./config.js";
import { state } from "./state.js";

export const admin = {
    loadAdmin: () => { 
        document.getElementById('view-admin').classList.add('active'); 
        window.app.admTab('users'); 
        document.body.style.backgroundColor = '#FFF';
    },

    closeAdmin: () => {
        if(state.currentUser) {
            window.app.screen('view-app');
        } else {
            window.app.screen('view-landing');
        }
        document.body.style.backgroundColor = '#9cafcc';
    },

    // --- LOGICA DE DASHBOARD (DESKTOP) ---
    allDashboardUsers: [], // Cache local para filtrar rápido

    openDashboard: async () => {
        window.app.screen('view-dashboard');
        // Carrega TODOS os usuários de uma vez para análise (para 100-500 usuários isso é ok)
        // Se crescer para 5000+, precisaremos de Cloud Functions
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_USERS));
        const snap = await getDocs(q);
        
        const users = [];
        snap.forEach(d => users.push({ id: d.id, ...d.data() }));
        
        // Processa dados para o Dashboard
        admin.allDashboardUsers = users.map(u => {
            const lastWorkout = admin.getLastWorkoutDate(u);
            const daysInactive = admin.calculateDaysInactive(lastWorkout);
            return {
                ...u,
                lastWorkoutDate: lastWorkout,
                daysInactive: daysInactive,
                status: u.active ? (daysInactive > 10 ? 'risk' : 'active') : 'pending'
            };
        });

        // Ordena por "Dias Inativo" (Decrescente) para mostrar quem está saindo primeiro
        admin.allDashboardUsers.sort((a,b) => {
             // Prioriza pendentes no topo, depois inativos
             if (a.status === 'pending' && b.status !== 'pending') return -1;
             if (b.status === 'pending' && a.status !== 'pending') return 1;
             return b.daysInactive - a.daysInactive;
        });

        admin.renderDashboardMetrics();
        admin.renderDashboardTable(admin.allDashboardUsers);
    },

    closeDashboard: () => {
        // Volta para o admin mobile
        admin.loadAdmin();
    },

    dashTab: (tab) => {
        if(tab === 'overview') {
            document.getElementById('dash-tab-students').classList.remove('hidden');
            document.getElementById('dash-tab-student-detail').classList.add('hidden');
            // Re-renderiza a tabela se necessário
            admin.renderDashboardTable(admin.allDashboardUsers);
        }
    },

    dashSearch: () => {
        const term = document.getElementById('dash-search').value.toLowerCase();
        const filtered = admin.allDashboardUsers.filter(u => 
            u.name.toLowerCase().includes(term) || 
            u.email.toLowerCase().includes(term)
        );
        admin.renderDashboardTable(filtered);
    },

    dashFilterByDate: () => {
        const startStr = document.getElementById('dash-date-start').value;
        const endStr = document.getElementById('dash-date-end').value;

        if (!startStr || !endStr) return window.app.toast("Selecione data inicial e final.");

        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T23:59:59');

        const filtered = admin.allDashboardUsers.filter(u => {
            if (!u.races) return false;
            // Verifica se tem ALGUM treino concluído dentro do range
            return u.races.some(r => {
                if(!r.workouts) return false;
                return r.workouts.some(w => {
                    if (!w.done || !w.completedAt) return false;
                    const cDate = new Date(w.completedAt + 'T12:00:00'); // Evita bug de timezone
                    return cDate >= start && cDate <= end;
                });
            });
        });

        window.app.toast(`${filtered.length} alunos treinaram no período.`);
        admin.renderDashboardTable(filtered);
    },

    // --- NOVA FUNCIONALIDADE: ABRIR DETALHES DO ALUNO ---
    openDashStudentDetail: async (userId) => {
        const u = admin.allDashboardUsers.find(user => user.id === userId);
        if (!u) return;

        // Esconde tabela, mostra detalhe
        document.getElementById('dash-tab-students').classList.add('hidden');
        const detailContainer = document.getElementById('dash-tab-student-detail');
        detailContainer.classList.remove('hidden');
        detailContainer.innerHTML = '<p class="skeleton" style="height:100px;"></p>';

        // Busca histórico de dor específico (Fisio)
        const qPain = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), where("email", "==", u.email));
        const snapPain = await getDocs(qPain);
        const painHistory = [];
        snapPain.forEach(d => painHistory.push(d.data()));
        painHistory.sort((a,b) => b.timestamp - a.timestamp);

        // Prepara HTML dos Objetivos (Races) e Treinos
        let racesHtml = '';
        if (u.races && u.races.length > 0) {
            // Pega o último objetivo (mais atual)
            const r = u.races[u.races.length - 1]; 
            const done = r.workouts.filter(w=>w.done).length;
            const total = r.workouts.length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;

            let workoutsHtml = '';
            // Lista os últimos 10 treinos
            const recentWorkouts = r.workouts.slice().reverse().slice(0, 20); 
            recentWorkouts.forEach(w => {
                const icon = w.done ? '<i class="fa-solid fa-check-circle" style="color:var(--success)"></i>' : '<i class="fa-regular fa-circle" style="color:#ccc"></i>';
                const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString() : (w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '-');
                
                // Exibe feedback de dor se houver
                let feedback = '';
                if (w.feedback) feedback = `<div style="font-size:11px; color:#e67e22; margin-left:25px;">Dor: ${w.feedback.painLevel} - ${w.feedback.notes}</div>`;

                workoutsHtml += `
                <div class="dash-list-item" style="display:block;">
                    <div style="display:flex; justify-content:space-between;">
                        <span>${icon} <strong>${w.title}</strong></span>
                        <span style="font-size:12px; color:#888;">${date}</span>
                    </div>
                    <div style="font-size:12px; color:#666; margin-left:25px;">${w.desc}</div>
                    ${feedback}
                </div>`;
            });

            racesHtml = `
            <div style="background:#f9f9f9; padding:15px; border-radius:10px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <strong>${r.name}</strong>
                    <span>${pct}% Concluído</span>
                </div>
                <div class="progress-container" style="height:8px; margin-top:0;"><div class="progress-bar colored" style="width:${pct}%"></div></div>
                <div style="margin-top:15px; max-height:400px; overflow-y:auto;">
                    <h5 style="margin:0 0 10px;">Últimos Treinos</h5>
                    ${workoutsHtml}
                </div>
            </div>`;
        } else {
            racesHtml = '<p>Sem objetivos cadastrados.</p>';
        }

        // Histórico de Dor (Sidebar)
        let painHtml = '';
        if (painHistory.length > 0) {
            painHistory.forEach(p => {
                painHtml += `
                <div style="padding:10px; border-bottom:1px solid #eee;">
                    <strong style="color:var(--red);">Nível ${p.painLevel}/7</strong> - <small>${new Date(p.timestamp).toLocaleDateString()}</small><br>
                    <span style="font-size:12px;">${p.notes}</span>
                    ${p.responded ? '<br><small style="color:var(--success);"><i class="fa-solid fa-check"></i> Respondido</small>' : '<br><small style="color:var(--text-sec);">Pendente</small>'}
                </div>`;
            });
        } else {
            painHtml = '<p style="color:#999; font-size:12px;">Sem relatos.</p>';
        }

        // Renderiza VIEW COMPLETA
        detailContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:15px;">
                <button onclick="document.getElementById('dash-tab-students').classList.remove('hidden'); document.getElementById('dash-tab-student-detail').classList.add('hidden');" style="border:none; background:none; font-size:18px; cursor:pointer;"><i class="fa-solid fa-arrow-left"></i></button>
                <div>
                    <h2 style="margin:0;">${u.name}</h2>
                    <span style="color:#888;">${u.email}</span>
                </div>
            </div>
            <div>
               <span class="status-pill ${u.status === 'active' ? 'active' : 'inactive'}">${u.status === 'active' ? 'ATIVO' : 'INATIVO'}</span>
            </div>
        </div>

        <div class="dash-detail-grid">
            <!-- COLUNA ESQUERDA (TREINOS) -->
            <div>
                <h4 class="dash-card-title">Objetivo Atual & Progresso</h4>
                ${racesHtml}
            </div>

            <!-- COLUNA DIREITA (SAÚDE) -->
            <div>
                <div class="dash-metric-card" style="margin-bottom:20px;">
                    <h4 class="dash-card-title" style="margin-top:0;">Histórico Fisio (Dores)</h4>
                    <div style="max-height:500px; overflow-y:auto;">
                        ${painHtml}
                    </div>
                </div>
                
                <div class="dash-metric-card">
                    <h4 class="dash-card-title" style="margin-top:0;">Dados Pessoais</h4>
                    <p style="font-size:13px; margin:5px 0;"><strong>Cidade:</strong> ${u.city || '-'}</p>
                    <p style="font-size:13px; margin:5px 0;"><strong>Peso Atual:</strong> ${u.weightHistory && u.weightHistory.length > 0 ? u.weightHistory[u.weightHistory.length-1].value + 'kg' : '-'}</p>
                </div>
            </div>
        </div>
        `;
    },

    getLastWorkoutDate: (u) => {
        if (!u.races || u.races.length === 0) return null;
        let lastDate = null;
        
        // Varre todas as provas e treinos para achar o mais recente concluído
        u.races.forEach(r => {
            if(r.workouts) {
                r.workouts.forEach(w => {
                    if(w.done && w.completedAt) {
                        const d = new Date(w.completedAt);
                        if (!lastDate || d > lastDate) lastDate = d;
                    }
                });
            }
        });
        return lastDate; // Retorna objeto Date ou null
    },

    calculateDaysInactive: (lastDate) => {
        if (!lastDate) return 999; // Nunca treinou
        const diff = Date.now() - lastDate.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    },

    renderDashboardMetrics: () => {
        const total = admin.allDashboardUsers.length;
        const risk = admin.allDashboardUsers.filter(u => u.status === 'risk').length;
        const activeToday = admin.allDashboardUsers.filter(u => u.daysInactive === 0).length;

        document.getElementById('dash-total-students').innerText = total;
        document.getElementById('dash-risk-students').innerText = risk;
        document.getElementById('dash-active-today').innerText = activeToday;
    },

    renderDashboardTable: (users) => {
        const tbody = document.getElementById('dash-table-body');
        tbody.innerHTML = '';

        users.forEach(u => {
            let statusBadge = '';
            if (u.status === 'pending') statusBadge = '<span class="status-pill pending">Pendente</span>';
            else if (u.status === 'risk') statusBadge = '<span class="status-pill inactive">Risco (Inativo)</span>';
            else statusBadge = '<span class="status-pill active">Ativo</span>';

            const lastDateStr = u.lastWorkoutDate ? u.lastWorkoutDate.toLocaleDateString() : 'Nunca';
            const daysStr = u.daysInactive === 999 ? '-' : `${u.daysInactive} dias`;
            
            // Pega a prova atual
            const currentRace = (u.races && u.races.length > 0) ? u.races[u.races.length-1].name : 'Sem Plano';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${u.name}</strong>
                    ${u.active ? '' : '<br><small style="color:red; cursor:pointer;" onclick="window.app.admToggleStatus(\''+window.app.escape(u.id)+'\', true)">[Aprovar]</small>'}
                </td>
                <td>${u.email}</td>
                <td>${statusBadge}</td>
                <td>${lastDateStr}</td>
                <td style="font-weight:bold; color:${u.daysInactive > 7 ? 'red' : 'green'}">${daysStr}</td>
                <td>${currentRace}</td>
                <td>
                    <button onclick="window.app.openDashStudentDetail('${window.app.escape(u.id)}')" style="border:1px solid #ddd; background:white; padding:5px 10px; border-radius:5px; cursor:pointer; color:var(--primary); font-weight:600;">Ver Detalhes</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- FIM DA LÓGICA DASHBOARD ---

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
        if(t === 'physio') window.app.admLoadPhysio(); 
    },
    
    admLoadPhysio: () => {
        const list = document.getElementById('adm-physio-list');
        list.innerHTML = '<p class="skeleton" style="height:50px;"></p>';
        
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN));
        
        onSnapshot(q, (snapshot) => {
            if(snapshot.empty) {
                list.innerHTML = '<p style="text-align: center; color: #999;">Nenhum relato.</p>';
                return;
            }
            
            let items = [];
            snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
            items.sort((a,b) => b.timestamp - a.timestamp);

            list.innerHTML = '';
            items.forEach(item => {
                const unreadClass = !item.readByAdmin ? 'unread' : '';
                const dateStr = new Date(item.timestamp).toLocaleDateString();
                const safeNotes = window.app.escape(item.notes);
                
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

    admLoadUsers: async () => {
        const list = document.getElementById('adm-users-list');
        list.innerHTML = ''; 
        state.lastVisibleUser = null; 
        state.admUsersCache = {}; 
        const oldBtn = document.getElementById('btn-load-more-users');
        if(oldBtn) oldBtn.remove();
        
        // Removido botão de sync manual

        await window.app.admFetchNextUsers();
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
        if (state.isLoadingUsers) return;
        state.isLoadingUsers = true;
        const list = document.getElementById('adm-users-list');
        try {
            let q;
            const usersRef = collection(db, 'artifacts', appId, 'public', 'data', C_USERS);
            if (state.lastVisibleUser) {
                q = query(usersRef, orderBy('name'), startAfter(state.lastVisibleUser), limit(20));
            } else {
                q = query(usersRef, orderBy('name'), limit(20));
            }

            const documentSnapshots = await getDocs(q);
            const btn = document.getElementById('btn-load-more-users');

            if (documentSnapshots.empty) {
                if(btn) {
                    btn.innerText = "Fim da lista";
                    btn.disabled = true;
                }
                state.isLoadingUsers = false;
                return;
            } else {
                if(btn) {
                    btn.innerText = "Carregar mais alunos";
                    btn.disabled = false;
                }
            }
            state.lastVisibleUser = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            let html = '';
            documentSnapshots.forEach(d => {
                const u = d.data();
                const docId = d.id;
                const safeId = window.app.escape(docId);
                state.admUsersCache[docId] = u; 
                html += window.app.createAdmUserCardHTML(u, docId, safeId);
            });
            list.insertAdjacentHTML('beforeend', html);
        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            window.app.toast("Erro ao listar alunos.");
        } finally {
            state.isLoadingUsers = false;
        }
    },

    createAdmUserCardHTML: (u, docId, safeId) => {
        const isUserOpen = state.expandedUsers.has(docId) ? 'open' : ''; 
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
                const isRaceOpen = state.expandedRaces.has(raceKey) ? 'open' : '';
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
        const user = state.admUsersCache[userId];
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
    
    admToggleUser: (docId) => { if(state.expandedUsers.has(docId)) state.expandedUsers.delete(docId); else state.expandedUsers.add(docId); const el = document.getElementById(`user-content-${docId}`); if(el) el.classList.toggle('open'); },
    admToggleGoal: (key) => { if(state.expandedRaces.has(key)) state.expandedRaces.delete(key); else state.expandedRaces.add(key); const el = document.getElementById(`goal-content-${key}`); if(el) el.classList.toggle('open'); },
    admToggleStatus: async (docId, status) => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { active: status }); window.app.toast(status ? "Aluno Aprovado" : "Aluno Bloqueado"); },
    admAddWorkoutInline: (docId, rIdx) => { state.currentAdmUser = docId; state.currentAdmRaceIdx = rIdx; state.isEditingTemplate = false; state.editingWorkoutIndex = null; document.getElementById('modal-workout-title').innerText = "Novo Treino"; document.getElementById('new-w-title').value = ''; document.getElementById('new-w-desc').value = ''; document.getElementById('new-w-video').value = ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    
    saveSingleWorkout: async () => {
        const title = document.getElementById('new-w-title').value;
        const desc = document.getElementById('new-w-desc').value;
        const video = document.getElementById('new-w-video').value;
        if(!title) return window.app.toast('Título obrigatório');
        if (state.isEditingTemplate) {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId));
            const t = snap.data();
            if (state.editingWorkoutIndex !== null) t.workouts[state.editingWorkoutIndex] = { title, desc, video, done: false }; 
            else t.workouts.push({ title, desc, video, done: false });
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId), { workouts: t.workouts });
        } else {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser));
            const u = snap.data();
            if (!u.races[state.currentAdmRaceIdx].workouts) u.races[state.currentAdmRaceIdx].workouts = [];
            u.races[state.currentAdmRaceIdx].workouts.push({title, desc, video, done:false});
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser), { races: u.races });
        }
        document.getElementById('modal-add-single-workout').classList.remove('active');
        window.app.toast("Salvo com sucesso!");
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
    },

    admDeleteWorkoutInline: async (docId, rIdx, wIdx) => { window.app.showConfirm("Remover treino?", async () => { const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); u.races[rIdx].workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); }); },
    
    admAddRaceInline: async (docId) => { 
        state.currentAdmUser = docId;
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
            
            // 1. Atualiza documento do aluno
            await updateDoc(userRef, { races });

            // 2. OTIMIZAÇÃO SOLUÇÃO 1: Cria registro leve na coleção pública
            // Precisamos do nome do aluno (uData.name)
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), {
                date: raceDate,
                raceName: name,
                studentName: uData.name,
                studentEmail: state.currentAdmUser,
                created: Date.now()
            });

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
