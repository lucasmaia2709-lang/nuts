import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, getDocs, startAfter, addDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_USERS, C_NEWS, C_TEMPLATES, C_VIDEOS, C_PAIN, C_QUOTES, C_PUBLIC_RACES, CF_WORKER_URL } from "./config.js";
import { state } from "./state.js";

export const admin = {
    // --- NAVEGAÇÃO BÁSICA ---
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

    // ============================================================
    //  DASHBOARD DESKTOP (CENTRAL DE COMANDO)
    // ============================================================
    allDashboardUsers: [], 

    openDashboard: async () => {
        window.app.screen('view-dashboard');
        window.app.dashTab('overview'); // Carrega a visão inicial
    },

    closeDashboard: () => {
        // Volta para o admin mobile ou app principal
        window.app.loadAdmin();
    },

    dashReloadData: async () => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_USERS));
        const snap = await getDocs(q);
        
        const users = [];
        snap.forEach(d => users.push({ id: d.id, ...d.data() }));
        
        admin.allDashboardUsers = users.map(u => {
            const lastWorkout = admin.getLastWorkoutDate(u);
            const daysInactive = admin.calculateDaysInactive(lastWorkout);
            let status = 'pending';
            if (u.active) {
                status = daysInactive > 10 ? 'risk' : 'active';
            }
            return {
                ...u,
                lastWorkoutDate: lastWorkout,
                daysInactive: daysInactive,
                status: status 
            };
        });

        // Ordenação
        admin.allDashboardUsers.sort((a,b) => {
             if (a.status === 'pending' && b.status !== 'pending') return -1;
             if (b.status === 'pending' && a.status !== 'pending') return 1;
             if (a.status === 'risk' && b.status === 'active') return -1;
             if (b.status === 'risk' && a.status === 'active') return 1;
             return b.daysInactive - a.daysInactive;
        });

        admin.renderDashboardMetrics();
        admin.dashApplyFilters();
    },

    dashTab: (tab) => {
        // 1. Esconde todas as views do dash
        document.querySelectorAll('.dash-view').forEach(el => el.classList.add('hidden'));
        
        // 2. Remove ativo dos botões
        document.querySelectorAll('.dash-nav-btn').forEach(btn => btn.classList.remove('active'));
        
        // 3. Mostra a view selecionada e ativa botão
        const targetView = document.getElementById(`dash-tab-${tab}`);
        const targetBtn = document.getElementById(`btn-dash-${tab}`);
        
        if (targetView) targetView.classList.remove('hidden');
        if (targetBtn) targetBtn.classList.add('active');

        // 4. Lógica específica de cada aba
        const filters = document.getElementById('dash-filters-wrapper');
        
        if(tab === 'overview' || tab === 'students') {
            if(filters) filters.classList.remove('hidden');
            if(tab === 'overview') document.getElementById('dash-tab-students').classList.remove('hidden'); // Overview usa a tabela de students por enquanto
            admin.dashReloadData();
        } else {
            if(filters) filters.classList.add('hidden');
            if(tab === 'physio') admin.dashLoadPhysio();
            if(tab === 'templates') admin.dashLoadTemplates();
            if(tab === 'news') admin.dashLoadNews();
            if(tab === 'quotes') admin.dashLoadQuotes();
            if(tab === 'videos') admin.dashLoadVideos();
        }
    },

    // --- TABELAS E FILTROS DE ALUNOS ---
    dashApplyFilters: () => {
        const term = document.getElementById('dash-search').value.toLowerCase();
        const statusFilterEl = document.getElementById('dash-filter-status');
        const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
        const startStr = document.getElementById('dash-date-start').value;
        const endStr = document.getElementById('dash-date-end').value;

        let filtered = admin.allDashboardUsers;

        if (term) filtered = filtered.filter(u => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
        if (statusFilter !== 'all') filtered = filtered.filter(u => u.status === statusFilter);
        
        if (startStr && endStr) {
            const start = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T23:59:59');
            filtered = filtered.filter(u => {
                if (!u.races) return false;
                return u.races.some(r => r.workouts && r.workouts.some(w => {
                    if (!w.done || !w.completedAt) return false;
                    const cDate = new Date(w.completedAt + 'T12:00:00'); 
                    return cDate >= start && cDate <= end;
                }));
            });
        }

        admin.renderDashboardTable(filtered);
        admin.renderDashboardMetrics(); 
    },

    dashSearch: () => admin.dashApplyFilters(),
    dashFilterStatus: () => admin.dashApplyFilters(),
    dashFilterByDate: () => admin.dashApplyFilters(),

    renderDashboardMetrics: () => {
        const total = admin.allDashboardUsers.length;
        const risk = admin.allDashboardUsers.filter(u => u.status === 'risk').length;
        const activeToday = admin.allDashboardUsers.filter(u => u.daysInactive === 0).length;
        if(document.getElementById('dash-total-students')) document.getElementById('dash-total-students').innerText = total;
        if(document.getElementById('dash-risk-students')) document.getElementById('dash-risk-students').innerText = risk;
        if(document.getElementById('dash-active-today')) document.getElementById('dash-active-today').innerText = activeToday;
    },

    renderDashboardTable: (users) => {
        const tbody = document.getElementById('dash-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        users.forEach(u => {
            let statusBadge = '';
            if (u.status === 'pending') statusBadge = '<span class="status-pill pending">Pendente</span>';
            else if (u.status === 'risk') statusBadge = '<span class="status-pill inactive">Risco</span>';
            else statusBadge = '<span class="status-pill active">Ativo</span>';

            const lastDateStr = u.lastWorkoutDate ? u.lastWorkoutDate.toLocaleDateString() : 'Nunca';
            const daysStr = u.daysInactive === 999 ? '-' : `${u.daysInactive} dias`;
            const currentRace = (u.races && u.races.length > 0) ? u.races[u.races.length-1].name : 'Sem Plano';

            let actionBtn = `<button onclick="window.app.openDashStudentDetail('${window.app.escape(u.id)}')" class="dash-btn-small">Ver Detalhes</button>`;
            
            if(u.status === 'pending') {
                actionBtn = `
                <button onclick="window.app.admToggleStatus('${window.app.escape(u.id)}', true)" class="dash-btn-small" style="background:var(--success); color:white; border:none;">Aprovar</button>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${u.name}</strong></td>
                <td>${u.email}</td>
                <td>${statusBadge}</td>
                <td>${lastDateStr}</td>
                <td style="font-weight:bold; color:${u.daysInactive > 7 ? 'red' : 'green'}">${daysStr}</td>
                <td>${currentRace}</td>
                <td>${actionBtn}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- NOVA LÓGICA DE FISIO (TABELA) ---
    dashLoadPhysio: () => {
        const tbody = document.getElementById('dash-physio-body');
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
        
        onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), orderBy('timestamp', 'desc')), (snapshot) => {
            if(snapshot.empty) { tbody.innerHTML = '<tr><td colspan="7">Sem relatos.</td></tr>'; return; }
            tbody.innerHTML = '';
            snapshot.forEach(d => {
                const item = {id: d.id, ...d.data()};
                const modalData = encodeURIComponent(JSON.stringify(item));
                const dateStr = new Date(item.timestamp).toLocaleDateString();
                const status = item.responded ? '<span class="status-pill active">Respondido</span>' : '<span class="status-pill pending">Pendente</span>';
                
                tbody.innerHTML += `
                <tr onclick="window.app.admOpenPainDetail('${modalData}')" style="cursor:pointer;">
                    <td>${dateStr}</td>
                    <td><strong>${item.userName}</strong></td>
                    <td>${item.workoutTitle}</td>
                    <td><strong style="color:${item.painLevel > 4 ? 'var(--red)' : 'var(--text-main)'}">${item.painLevel}/7</strong></td>
                    <td style="max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.notes}</td>
                    <td>${status}</td>
                    <td><button class="dash-btn-small">Ver/Resp.</button></td>
                </tr>`;
            });
        });
    },

    // --- NOVA LÓGICA DE NOTÍCIAS (GRID) ---
    dashLoadNews: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const grid = document.getElementById('dash-news-grid');
            if(!grid) return;
            grid.innerHTML = '';
            snap.forEach(d => {
                const n = d.data();
                grid.innerHTML += `
                <div class="dash-card-item">
                    ${n.img ? `<div style="height:150px; background:url('${n.img}') center/cover;"></div>` : ''}
                    <div style="padding:15px;">
                        <strong>${n.title}</strong>
                        <p style="font-size:12px; color:#666; height:40px; overflow:hidden;">${n.body}</p>
                        <button onclick="window.app.admDeleteNews('${d.id}')" style="color:var(--red); border:none; background:none; font-size:12px; margin-top:5px; cursor:pointer;">Excluir</button>
                    </div>
                </div>`;
            });
        });
    },

    previewDashNewsImg: (input) => {
        if(input.files && input.files[0]) {
            state.tempNewsFile = input.files[0];
            const url = URL.createObjectURL(state.tempNewsFile);
            const img = document.getElementById('dash-news-preview'); 
            img.src = url; 
            img.style.display = 'block'; 
        }
    },

    postNewsDash: async () => {
        const title = document.getElementById('dash-news-title').value; 
        const body = document.getElementById('dash-news-body').value;
        if(!title || !body) return window.app.toast('Preencha tudo');
        
        document.getElementById('btn-dash-post-news').disabled = true;
        let imgUrl = null;
        if(state.tempNewsFile) imgUrl = await window.app.uploadImage(state.tempNewsFile, 'news');
        
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS)), { 
            title, body, img: imgUrl, created: Date.now() 
        });
        
        document.getElementById('dash-news-title').value = ''; 
        document.getElementById('dash-news-body').value = ''; 
        state.tempNewsFile = null; 
        document.getElementById('dash-news-preview').style.display = 'none'; 
        document.getElementById('btn-dash-post-news').disabled = false;
        window.app.toast("Notícia publicada!");
    },

    // --- FRASES ---
    dashLoadQuotes: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES), (s) => {
            const l = document.getElementById('dash-quotes-list'); 
            if(l) {
                l.innerHTML = '';
                s.forEach(d=>{ 
                    l.innerHTML += `
                    <div style="padding:15px; background:white; border-radius:10px; display:flex; justify-content:space-between; align-items:center; border:1px solid #eee;">
                        <span style="font-style:italic;">"${d.data().text}"</span> 
                        <button onclick="window.app.admDelQuote('${d.id}')" style="color:red; border:none; background:none; cursor:pointer;">X</button>
                    </div>` 
                });
            }
        });
    },

    postQuoteDash: async () => {
        const text = document.getElementById('dash-quote-text').value; if(!text) return;
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_QUOTES)), { text, created: Date.now() });
        document.getElementById('dash-quote-text').value = '';
        window.app.toast("Frase adicionada");
    },

    // --- VÍDEOS ---
    dashLoadVideos: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS), (snap) => {
            const list = document.getElementById('dash-videos-grid');
            if(list) {
                list.innerHTML = '';
                snap.forEach(d => {
                    const v = d.data();
                    const safeLink = window.app.escape(v.link);
                    list.innerHTML += `
                    <div class="dash-card-item" style="padding:15px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${v.title}</strong><br>
                            <a href="#" onclick="window.app.playVideo('${safeLink}')" style="font-size:12px; color:var(--primary);">Assistir</a>
                        </div>
                        <button onclick="window.app.admDeleteStrengthVideo('${d.id}')" style="color:var(--red); border:none; background:none; cursor:pointer;">X</button>
                    </div>`;
                });
            }
        });
    },

    admAddStrengthVideoDash: async () => {
        const title = document.getElementById('dash-video-title').value;
        const link = document.getElementById('dash-video-link').value;
        if(!title || !link) return window.app.toast("Preencha título e link");
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_VIDEOS)), { title, link, created: Date.now() });
        window.app.toast("Vídeo cadastrado!");
        document.getElementById('dash-video-title').value = '';
        document.getElementById('dash-video-link').value = '';
    },

    // --- TEMPLATES ---
    dashLoadTemplates: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES), (snap) => {
            const list = document.getElementById('dash-templates-list'); 
            if(list) {
                list.innerHTML = '';
                snap.forEach(d => {
                    const t = d.data(); const tId = d.id;
                    const count = t.workouts ? t.workouts.length : 0;
                    
                    // Renderização simplificada para dashboard (expansível via mobile logic reutilizada ou nova modal)
                    // Para manter simples no desktop, usamos a mesma lógica de "Admin Mobile" adaptada visualmente
                    let workoutsHtml = '';
                    if(t.workouts) {
                        t.workouts.forEach((w, wIdx) => {
                            workoutsHtml += `<div style="font-size:12px; padding:5px 0; border-bottom:1px solid #f9f9f9; display:flex; justify-content:space-between;"><span>${w.title}</span> <div style="display:flex; gap:5px;"><button onclick="window.app.admEditWorkoutFromTemplate('${tId}', ${wIdx})" style="cursor:pointer; border:none; background:none;"><i class="fa-solid fa-pencil"></i></button><button onclick="window.app.admDeleteWorkoutFromTemplate('${tId}', ${wIdx})" style="cursor:pointer; color:red; border:none; background:none;">X</button></div></div>`;
                        });
                    }

                    list.innerHTML += `
                    <div style="background:white; padding:20px; border-radius:10px; border:1px solid #eee;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <strong>${t.name} (${count} treinos)</strong>
                            <div>
                                <button onclick="window.app.admAddWorkoutToTemplateInline('${tId}')" class="dash-btn-small">+ Treino</button>
                                <button onclick="window.app.admDelTemplate('${tId}')" class="dash-btn-small" style="color:var(--red); background:none; border:1px solid #eee;">Excluir</button>
                            </div>
                        </div>
                        <div style="background:#f9f9f9; padding:10px; border-radius:5px;">
                            ${workoutsHtml || '<small>Sem treinos cadastrados.</small>'}
                        </div>
                    </div>`;
                });
            }
        });
    },

    // --- REUTILIZAÇÃO DE FUNÇÕES (CRUD) ---
    // Estas funções funcionam tanto pro Mobile quanto pro Desktop pois abrem Modais globais
    
    // Alunos
    admToggleStatus: async (docId, status) => { 
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { active: status }); 
        window.app.toast(status ? "Aluno Aprovado" : "Aluno Bloqueado");
        if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
    },
    admDeleteUserQuick: async (docId) => { 
        window.app.showConfirm(`Apagar permanentemente?`, async () => { 
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); 
            if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
        }); 
    },

    // Race
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
        const ia = document.getElementById('adm-race-ia-fields');
        const tpl = document.getElementById('adm-race-tpl-fields');
        if (mode === 'ia') { ia.classList.remove('hidden'); tpl.classList.add('hidden'); } 
        else { ia.classList.add('hidden'); tpl.classList.remove('hidden'); }
    },
    admConfirmAddRace: async () => {
        // ... (Lógica idêntica à anterior, mantida para economizar espaço visual, mas essencial)
        // Usa CF Worker ou Template e salva no Firestore
        // Ao final chama window.app.dashReloadData() se estiver no dashboard
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
                targetDistance = dist; estimatedTime = time;
                const response = await fetch(CF_WORKER_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, dist, estTime: time, startDate: startDateStr, raceDate, strengthVideo: video })
                });
                if (!response.ok) throw new Error("Erro na IA");
                const aiWorkoutsRaw = await response.json();
                newWorkouts = aiWorkoutsRaw.map(w => ({ title: w.title, desc: w.desc, video: w.video || "", done: false, scheduledDate: w.date, type: w.type || 'run' }));
            } else {
                const tplId = document.getElementById('adm-race-template-select').value;
                if (!tplId) throw new Error("Selecione um modelo.");
                const tSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tplId));
                const tData = tSnap.data();
                const startDate = new Date(startDateStr);
                newWorkouts = tData.workouts.map((w, index) => {
                    const date = new Date(startDate); date.setDate(date.getDate() + index);
                    return { ...w, scheduledDate: date.toISOString().split('T')[0], done: false };
                });
            }
            const userRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser);
            const userSnap = await getDoc(userRef);
            const uData = userSnap.data();
            const races = uData.races || [];
            races.push({ name, date: raceDate, targetDistance, estimatedTime, workouts: newWorkouts, created: new Date().toISOString() });
            
            await updateDoc(userRef, { races });
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_PUBLIC_RACES), { date: raceDate, raceName: name, studentName: uData.name, studentEmail: state.currentAdmUser, created: Date.now() });

            window.app.toast("Objetivo criado!");
            document.getElementById('modal-adm-add-race').classList.remove('active');
            if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
        } catch (error) { window.app.toast("Erro: " + error.message); } 
        finally { if(btn) { btn.disabled = false; btn.innerText = "Criar"; } }
    },
    admDelRaceInline: async (docId, rIdx) => { 
        window.app.showConfirm("Apagar objetivo?", async () => { 
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); 
            u.races.splice(rIdx, 1); 
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); 
            if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
        }); 
    },

    // Workouts (Delete/Edit)
    admToggleWorkoutStatus: async (docId, rIdx, wIdx, status) => {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data();
        u.races[rIdx].workouts[wIdx].done = status; if(!status) delete u.races[rIdx].workouts[wIdx].completedAt;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races });
        window.app.toast(status ? "Concluído" : "Reativado");
        if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
    },
    admDeleteWorkoutInline: async (docId, rIdx, wIdx) => { 
        window.app.showConfirm("Remover treino?", async () => { 
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId)); const u = snap.data(); 
            u.races[rIdx].workouts.splice(wIdx, 1); 
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, docId), { races: u.races }); 
            if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
        }); 
    },

    // Physio/News/Quotes (Delete/Reply)
    admOpenPainDetail: async (dataString) => {
        const data = JSON.parse(decodeURIComponent(dataString)); state.currentPainId = data.id;
        const view = document.getElementById('adm-pain-detail-view');
        view.innerHTML = `<strong>Aluno:</strong> ${data.userName}<br><strong>Treino:</strong> ${data.workoutTitle}<br><strong>Data:</strong> ${new Date(data.timestamp).toLocaleDateString()}<br><strong>Dor:</strong> ${data.painLevel}/7<div style="margin-top:5px;border-top:1px dashed #ccc;">${data.notes}</div>`;
        document.getElementById('adm-pain-response-text').value = data.response || '';
        document.getElementById('modal-admin-pain-response').classList.add('active');
        if(!data.readByAdmin) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, state.currentPainId), { readByAdmin: true });
    },
    admSendPainResponse: async () => {
        const response = document.getElementById('adm-pain-response-text').value; if(!response) return;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_PAIN, state.currentPainId), { response, responseDate: Date.now(), responded: true, readByUser: false });
        window.app.toast("Enviado!");
        document.getElementById('modal-admin-pain-response').classList.remove('active');
    },
    admDeleteNews: async (id) => { if(confirm("Apagar?")) { const ref = doc(db, 'artifacts', appId, 'public', 'data', C_NEWS, id); const s = await getDoc(ref); if(s.exists() && s.data().img) await window.app.deleteFile(s.data().img); await deleteDoc(ref); } },
    admDelQuote: async (id) => { window.app.showConfirm('Apagar?', async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_QUOTES, id))); },
    admDeleteStrengthVideo: async (id) => { if(confirm("Apagar?")) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_VIDEOS, id)); },
    
    // Templates CRUD
    admAddTemplateInline: async () => { window.app.showPrompt("Nome do Modelo:", async (name) => { if(!name) return; await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES)), { name, workouts: [] }); }); },
    admDelTemplate: async (id) => { window.app.showConfirm("Apagar modelo?", async () => await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, id))); },
    admAddWorkoutToTemplateInline: (tId) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = null; document.getElementById('modal-workout-title').innerText = "Novo Treino"; document.getElementById('new-w-title').value = ''; document.getElementById('new-w-desc').value = ''; document.getElementById('new-w-video').value = ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admEditWorkoutFromTemplate: async (tId, wIdx) => { state.isEditingTemplate = true; state.currentTemplateId = tId; state.editingWorkoutIndex = wIdx; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const w = snap.data().workouts[wIdx]; document.getElementById('new-w-title').value = w.title; document.getElementById('new-w-desc').value = w.desc; document.getElementById('new-w-video').value = w.video || ''; document.getElementById('modal-add-single-workout').classList.add('active'); },
    admDeleteWorkoutFromTemplate: async (tId, wIdx) => { if(!confirm("Remover?")) return; const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId)); const t = snap.data(); t.workouts.splice(wIdx, 1); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, tId), { workouts: t.workouts }); },
    
    saveSingleWorkout: async () => {
        const title = document.getElementById('new-w-title').value;
        const desc = document.getElementById('new-w-desc').value;
        const video = document.getElementById('new-w-video').value;
        if(!title) return window.app.toast('Título obrigatório');
        
        if (state.isEditingTemplate) {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId)); const t = snap.data();
            const w = { title, desc, video, done: false };
            if (state.editingWorkoutIndex !== null) t.workouts[state.editingWorkoutIndex] = w; else t.workouts.push(w);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_TEMPLATES, state.currentTemplateId), { workouts: t.workouts });
        } else {
            const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser)); const u = snap.data();
            const w = { title, desc, video, done: false };
            if(!u.races[state.currentAdmRaceIdx].workouts) u.races[state.currentAdmRaceIdx].workouts = [];
            u.races[state.currentAdmRaceIdx].workouts.push(w);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentAdmUser), { races: u.races });
            if(document.getElementById('view-dashboard').classList.contains('active')) window.app.dashReloadData();
        }
        document.getElementById('modal-add-single-workout').classList.remove('active');
        window.app.toast("Salvo!");
    },

    // Detalhes do Aluno (Dashboard)
    openDashStudentDetail: async (userId) => {
        state.currentAdmUser = userId;
        const u = admin.allDashboardUsers.find(user => user.id === userId);
        if (!u) return;

        document.getElementById('dash-tab-students').classList.add('hidden');
        const detailContainer = document.getElementById('dash-tab-student-detail');
        detailContainer.classList.remove('hidden');
        detailContainer.innerHTML = '<p class="skeleton" style="height:100px;"></p>';

        const qPain = query(collection(db, 'artifacts', appId, 'public', 'data', C_PAIN), where("email", "==", u.email));
        const snapPain = await getDocs(qPain);
        const painHistory = [];
        snapPain.forEach(d => painHistory.push(d.data()));
        painHistory.sort((a,b) => b.timestamp - a.timestamp);

        let racesHtml = '';
        if (u.races && u.races.length > 0) {
            [...u.races].reverse().forEach((r, rIdx) => {
                const originalIdx = u.races.length - 1 - rIdx;
                const uniqueId = `g-${originalIdx}`;
                const done = r.workouts ? r.workouts.filter(w=>w.done).length : 0;
                const total = r.workouts ? r.workouts.length : 0;
                const pct = total > 0 ? Math.round((done/total)*100) : 0;

                let workoutsHtml = '';
                if(r.workouts && r.workouts.length > 0) {
                    r.workouts.forEach((w, wIdx) => {
                        const wId = `${uniqueId}-w-${wIdx}`;
                        const isDone = w.done;
                        const icon = isDone ? '<i class="fa-solid fa-circle-check" style="color:var(--success); font-size:18px;"></i>' : '<i class="fa-regular fa-circle" style="color:#ddd; font-size:18px;"></i>';
                        const titleStyle = isDone ? 'text-decoration:line-through; color:#999;' : 'color:var(--text-main); font-weight:600;';
                        const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString() : (w.scheduledDate ? new Date(w.scheduledDate).toLocaleDateString() : '-');
                        let feedbackHtml = w.feedback ? `<div style="margin-top:5px; padding:8px; background:#fff5eb; border-radius:5px; font-size:11px; color:#e67e22;"><strong>Dor ${w.feedback.painLevel}:</strong> ${w.feedback.notes}</div>` : '';

                        workoutsHtml += `
                        <div class="dash-workout-item">
                            <div class="dash-workout-header" onclick="window.app.dashToggleWorkout('${wId}')">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    ${icon}
                                    <div><div style="${titleStyle}">${w.title}</div><div style="font-size:11px; color:#888;">${date}</div></div>
                                </div>
                                <i class="fa-solid fa-chevron-down" style="font-size:12px; color:#ccc;"></i>
                            </div>
                            <div id="workout-det-${wId}" class="dash-workout-details">
                                <p style="margin:0 0 10px 0;"><strong>Descrição:</strong> ${w.desc}</p>
                                ${w.video ? `<a href="#" onclick="window.app.playVideo('${window.app.escape(w.video)}')" style="color:var(--primary); font-size:12px;">Ver Vídeo</a>` : ''}
                                ${feedbackHtml}
                                <div style="margin-top:10px; text-align:right;">
                                    <button onclick="window.app.admToggleWorkoutStatus('${u.id}', ${originalIdx}, ${wIdx}, ${!isDone})" style="font-size:11px; padding:4px 8px;">${isDone ? 'Desmarcar' : 'Concluir'}</button>
                                    <button onclick="window.app.admDeleteWorkoutInline('${u.id}', ${originalIdx}, ${wIdx})" style="font-size:11px; color:red; border:none; background:none;">Excluir</button>
                                </div>
                            </div>
                        </div>`;
                    });
                } else { workoutsHtml = '<div style="padding:20px; color:#999; text-align:center;">Sem treinos.</div>'; }

                racesHtml += `
                <div class="dash-goal-card">
                    <div id="goal-header-${uniqueId}" class="dash-goal-header" onclick="window.app.dashToggleGoal('${uniqueId}')">
                        <div style="flex:1;"><strong style="font-size:16px;">${r.name}</strong><div class="progress-container" style="height:6px; margin-top:8px; width:150px;"><div class="progress-bar colored" style="width:${pct}%"></div></div></div>
                        <div style="display:flex; align-items:center; gap:15px;"><span style="font-size:12px; color:#888;">${done}/${total}</span><i class="fa-solid fa-chevron-down" style="color:#ccc;"></i></div>
                    </div>
                    <div id="goal-content-${uniqueId}" class="dash-goal-content">
                        <div style="padding:10px; background:#f0f0f0; display:flex; justify-content:flex-end; gap:10px;">
                             <button onclick="window.app.admAddWorkoutInline('${u.id}', ${originalIdx})" class="dash-btn-small">+ Treino</button>
                             <button onclick="window.app.admImportTemplateInline('${u.id}', ${originalIdx})" class="dash-btn-small">+ Modelo</button>
                             <button onclick="window.app.admDelRaceInline('${u.id}', ${originalIdx})" style="color:red; background:none; border:none; font-size:12px; cursor:pointer;">Excluir Objetivo</button>
                        </div>
                        ${workoutsHtml}
                    </div>
                </div>`;
            });
        } else { racesHtml = '<div style="padding:20px; background:#fff; border-radius:12px; color:#999; text-align:center;">Sem objetivos.</div>'; }

        let painHtml = '';
        if (painHistory.length > 0) {
            painHistory.forEach(p => {
                let levelClass = p.painLevel >= 5 ? 'level-high' : (p.painLevel >= 3 ? 'level-med' : 'level-low');
                painHtml += `
                <div class="dash-pain-card ${levelClass}" onclick="window.app.admOpenPainDetail('${encodeURIComponent(JSON.stringify({id:p.id, ...p}))}')" style="cursor:pointer;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><strong style="color:var(--text-main); font-size:14px;">Dor ${p.painLevel}/7</strong><span style="font-size:11px; color:#888;">${new Date(p.timestamp).toLocaleDateString()}</span></div>
                    <p style="font-size:12px; color:#555; margin:0 0 5px 0;">${p.notes}</p>
                    ${p.responded ? '<div style="margin-top:5px; font-size:10px; color:var(--success); font-weight:700;"><i class="fa-solid fa-check"></i> Respondido</div>' : ''}
                </div>`;
            });
        } else { painHtml = '<p style="color:#999; font-size:12px; text-align:center; padding:20px;">Sem relatos.</p>'; }

        const initials = u.name.substring(0,2).toUpperCase();
        let avatarDisplay = `<div class="dash-avatar-placeholder" style="background:var(--primary); color:white;">${initials}</div>`;
        if(u.avatar) avatarDisplay = `<img src="${u.avatar}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:2px solid #fff; box-shadow:0 2px 5px rgba(0,0,0,0.1);">`;

        const city = u.city || '-';
        const weight = (u.weightHistory && u.weightHistory.length > 0) ? u.weightHistory[u.weightHistory.length-1].value + 'kg' : '--';
        const joined = u.created ? new Date(u.created).toLocaleDateString() : '--';
        
        let approveBtn = u.status === 'pending' ? `<button onclick="window.app.admToggleStatus('${u.id}', true)" class="btn-primary" style="background:var(--success); color:white; padding:10px 20px; border:none; border-radius:20px; cursor:pointer; font-weight:700;"><i class="fa-solid fa-check"></i> Aprovar</button>` : `<button onclick="window.app.admToggleStatus('${u.id}', false)" style="background:#fff; border:1px solid var(--red); color:var(--red); padding:8px 15px; border-radius:20px; cursor:pointer; font-size:12px;">Bloquear</button>`;

        detailContainer.innerHTML = `
        <button onclick="document.getElementById('dash-tab-students').classList.remove('hidden'); document.getElementById('dash-tab-student-detail').classList.add('hidden');" style="border:none; background:none; font-size:14px; cursor:pointer; color:#666; margin-bottom:15px; display:flex; align-items:center; gap:5px;"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
        <div class="dash-student-header" style="display:block;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="dash-student-info">${avatarDisplay}<div><h2 style="margin:0; font-size:24px;">${u.name}</h2><span style="color:#888; font-size:14px;">${u.email}</span></div></div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:10px;"><span class="status-pill ${u.status}" style="font-size:12px; padding:6px 12px;">${u.status.toUpperCase()}</span>${approveBtn}</div>
            </div>
            <div style="margin-top:20px; padding-top:20px; border-top:1px solid #eee; display:flex; gap:30px; flex-wrap:wrap;">
                <div><small style="color:#999; font-size:11px; font-weight:700; display:block; margin-bottom:4px;">CIDADE</small><div style="font-weight:600; font-size:14px;">${city}</div></div>
                <div><small style="color:#999; font-size:11px; font-weight:700; display:block; margin-bottom:4px;">PESO</small><div style="font-weight:600; font-size:14px;">${weight}</div></div>
                <div><small style="color:#999; font-size:11px; font-weight:700; display:block; margin-bottom:4px;">MEMBRO DESDE</small><div style="font-weight:600; font-size:14px;">${joined}</div></div>
            </div>
        </div>
        <div class="dash-detail-grid">
            <div><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;"><h4 class="dash-card-title" style="margin:0; border:none;">Objetivos & Treinos</h4><button onclick="window.app.admAddRaceInline('${u.id}')" class="btn-primary" style="padding:8px 15px; font-size:12px; border-radius:20px; cursor:pointer;">+ Novo Objetivo</button></div>${racesHtml}</div>
            <div><div class="dash-metric-card" style="margin-bottom:20px;"><h4 class="dash-card-title" style="margin-top:0;">Histórico Fisio</h4><div style="max-height:500px; overflow-y:auto; padding-right:5px;">${painHtml}</div></div></div>
        </div>`;
    },

    // Helpers
    getLastWorkoutDate: (u) => { if (!u.races || u.races.length === 0) return null; let lastDate = null; u.races.forEach(r => { if(r.workouts) { r.workouts.forEach(w => { if(w.done && w.completedAt) { const d = new Date(w.completedAt); if (!lastDate || d > lastDate) lastDate = d; } }); } }); return lastDate; },
    calculateDaysInactive: (lastDate) => { if (!lastDate) return 999; const diff = Date.now() - lastDate.getTime(); return Math.floor(diff / (1000 * 60 * 60 * 24)); },
    dashToggleGoal: (id) => { const c = document.getElementById(`goal-content-${id}`); const h = document.getElementById(`goal-header-${id}`); c.classList.toggle('open'); h.classList.toggle('active'); },
    dashToggleWorkout: (id) => { const c = document.getElementById(`workout-det-${id}`); if(c) c.classList.toggle('open'); },
    
    // Fallback para mobile
    admLoadUsers: async () => { window.app.admFetchNextUsers(); }, 
    admFetchNextUsers: async () => { /* Mantido para mobile se necessário, mas dashboard usa load all */ }
};
