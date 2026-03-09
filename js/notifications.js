
// LocalNotifications lazy access to avoid startup errors
// LocalNotifications lazy access to avoid startup errors
const getLocalNotifications = () => {
    console.log("Checking Capacitor:", !!window.Capacitor);

    // 1. Tenta acessar via a variável global exportada pelo script do plugin incluído no index.html (Capacitor v3+)
    if (window.capacitorLocalNotifications && window.capacitorLocalNotifications.LocalNotifications) {
        console.log("LocalNotifications available via capacitorLocalNotifications");
        return window.capacitorLocalNotifications.LocalNotifications;
    }

    // 2. Fallback para Capacitor v2 ou antiga injeção global
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        console.log("LocalNotifications available via window.Capacitor.Plugins");
        return window.Capacitor.Plugins.LocalNotifications;
    }

    console.warn("LocalNotifications plugin not found globally!");
    return null;
};
import { db, appId, C_CONFIG, C_USERS, C_PAIN, C_NEWS, C_LIVES, C_CHALLENGES } from "./config.js";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from "./state.js";

export const notifications = {
    init: async () => {
        try {
            const ln = getLocalNotifications();
            if (!ln) { console.warn("LocalNotifications plugin not found"); return; }

            const perm = await ln.requestPermissions();
            if (perm.display === 'granted') {
                console.log("Notificações permitidas");
            } else {
                console.warn("Notificações negadas");
            }
        } catch (e) {
            console.error("Erro init notifications", e);
        }
    },

    schedule: async (id, title, body, date, scheduleType = null) => {
        try {
            const ln = getLocalNotifications();
            if (!ln) return;

            const notifs = [{
                title: title,
                body: body,
                id: id,
                schedule: { at: date },
                sound: null,
                attachments: null,
                actionTypeId: "",
                extra: null
            }];

            if (scheduleType === 'day') {
                // Schedule every day at the given time
                notifs[0].schedule = {
                    on: {
                        hour: date.getHours(),
                        minute: date.getMinutes()
                    },
                    allowWhileIdle: true
                };
            }

            await ln.schedule({ notifications: notifs });
            console.log(`Agendado: ${title} para ${date}`);
        } catch (e) {
            console.error("Erro ao agendar", e);
        }
    },

    cancelAll: async () => {
        try {
            const ln = getLocalNotifications();
            if (!ln) return;

            const pending = await ln.getPending();
            if (pending.notifications.length > 0) {
                await ln.cancel(pending);
            }
        } catch (e) {
            console.error("Erro cancelAll", e);
        }
    },

    trigger: async (title, body, id = Math.floor(Math.random() * 100000)) => {
        try {
            const ln = getLocalNotifications();
            if (!ln) return;

            await ln.schedule({
                notifications: [{
                    title: title,
                    body: body,
                    id: id,
                    schedule: { at: new Date(Date.now() + 1000) }, // 1 sec from now
                    sound: null
                }]
            });
        } catch (e) {
            console.error("Erro trigger", e);
        }
    },

    // --- STUDENT MONITORING ---
    monitorStudent: async () => {
        if (!state.currentUser) return;

        // 0. Monitorar Objetivos (Races)
        let lastRacesCount = -1;
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', C_USERS, state.currentUser.email), (docSnap) => {
            if (docSnap.exists()) {
                const u = docSnap.data();
                const currentLen = u.races ? u.races.length : 0;

                if (lastRacesCount === -1) {
                    lastRacesCount = currentLen;
                } else if (currentLen > lastRacesCount) {
                    // Novo objetivo adicionado!
                    const newRace = u.races[currentLen - 1]; // Assume que é o último
                    notifications.trigger("Novo Objetivo!", `O treinador adicionou: ${newRace.name || 'Novo Desafio'}`);
                    lastRacesCount = currentLen;
                } else {
                    lastRacesCount = currentLen; // Atualiza se diminuir (apagou)
                }
            }
        });

        // 1. Configurar agendamentos diários (Treino/Desafio)
        await notifications.setupDailySchedules();

        // 2. Monitorar Notícias (Última notícia)
        // Isso requer lógica para não notificar notícias velhas. 
        // Vamos assumir que notificamos apenas se for criada AGORA (realtime)
        const qNews = query(collection(db, 'artifacts', appId, 'public', 'data', 'expliq_news_v9'), orderBy('date', 'desc'), limit(1));
        onSnapshot(qNews, (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    // Verifica se é recente (menos de 1 hora) para evitar notificar load inicial
                    const newsTime = new Date(data.date).getTime(); // date string iso?
                    // if (Date.now() - newsTime < 3600000) ... 
                    // Simplificação: apenas loga por enquanto, implementar filtro de tempo depois.
                    // Melhor: guardar timestamp do ultimo load e so notificar se novo > ultimo.
                }
            });
        });

        // 3. Monitorar Lives (Nova Live)
        const qLives = query(collection(db, 'artifacts', appId, 'public', 'data', 'expliq_lives_v9'), orderBy('date', 'desc'), limit(1));
        onSnapshot(qLives, (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const liveDate = new Date(data.date);
                    const now = new Date();
                    const createdDate = data.created ? new Date(data.created) : new Date(0); // Garante que lives antigas sem campo created não disparem

                    // 1. Notificação Imediata de Agendamento (Apenas se foi criada nos últimos 15 min E for no futuro)
                    if (now.getTime() - createdDate.getTime() < 900000 && liveDate > now) {
                        notifications.trigger("Nova Live Agendada!", `Live marcada para ${liveDate.toLocaleDateString()} às ${liveDate.toLocaleTimeString()}`);
                    }

                    // 2. Agendar lembrete exato 1h antes
                    const remindDate = new Date(liveDate.getTime() - 3600000); // 1h antes
                    if (remindDate > now) {
                        // ID determinístico pro agendamento da Live para não gerar duplicadas
                        const liveNotifId = Math.abs(parseInt(data.created || liveDate.getTime()) % 100000);
                        notifications.schedule(liveNotifId, "Live em 1h!", `Sua live começa às ${liveDate.toLocaleTimeString()}`, remindDate);
                    }
                }
            });
        });

        // 4. Monitorar Resposta Fisio (C_PAIN onde user = current e status = answered)
        // Precisa de indice provavelmente.
    },

    setupDailySchedules: async () => {
        // Obter horários do Config
        try {
            const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'expliq_config_v9', 'notifications');
            const snap = await getDoc(configRef);
            let times = {
                workout1: "10:00",
                workout2: "16:00",
                challenge: "09:00"
            };

            if (snap.exists()) {
                times = { ...times, ...snap.data() };
            }

            // Converter string "HH:MM" para Date object (hoje)
            const getTime = (str) => {
                const [h, m] = str.split(':');
                const d = new Date();
                d.setHours(parseInt(h), parseInt(m), 0);
                if (d < new Date()) d.setDate(d.getDate() + 1); // Se já passou hoje, marca pra amanhã (ou deixa LocalNotifications lidar com 'every day')
                return d;
            };

            await notifications.cancelAll(); // Limpa anteriores para reagendar

            // Treino 1
            const d1 = getTime(times.workout1);
            await notifications.schedule(1001, "Hora do Treino!", "Não deixe de fazer seu treino do dia.", d1, 'day');

            // Treino 2
            const d2 = getTime(times.workout2);
            await notifications.schedule(1002, "Lembrete de Treino", "Mantenha o foco! Já treinou hoje?", d2, 'day'); // Mesma mensagem ou outra? User disse "todo dia as 10 e 16... nao deixe de fazer"

            // Desafio
            const d3 = getTime(times.challengeTime);
            await notifications.schedule(2001, "Desafio do Dia", "Não deixe de fazer seu desafio do dia!", d3, 'day');

        } catch (e) {
            console.error("Erro setupDaily", e);
        }
    },


    // --- ADMIN MONITORING ---
    monitorAdmin: async () => {
        // Monitorar Novos Alunos (pending)
        const qUsers = query(collection(db, 'artifacts', appId, 'public', 'data', 'expliq_users_v9'), where('status', '==', 'pending'));
        onSnapshot(qUsers, (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const u = change.doc.data();
                    notifications.trigger("Novo Aluno", `${u.name} aguarda aprovação.`);
                }
            });
        });

        // Monitorar Dor (pending)
        const qPain = query(collection(db, 'artifacts', appId, 'public', 'data', 'expliq_pain_v9'), where('status', '==', 'pending'));
        onSnapshot(qPain, (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type === "added") {
                    const p = change.doc.data();
                    notifications.trigger("Nova Dor Registrada", `Aluno registrou dor: ${p.local}`);
                }
            });
        });
    }
};

window.notifications = notifications; // Expose globally
