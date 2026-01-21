import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, arrayUnion, arrayRemove, where, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_POSTS, C_USERS, C_NEWS, ADMIN_EMAILS } from "./config.js";
import { state } from "./state.js";

export const social = {
    // --- FEED ---
    loadFeed: () => {
        window.app.setupFeedLoader();
        const feed = document.getElementById('social-feed');
        if(state.unsubscribeFeed) state.unsubscribeFeed();

        // Tenta ordenar pelo banco. Se falhar (erro de índice), o callback de erro capturará.
        const q = query(
            collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), 
            orderBy('created', 'desc'), 
            limit(state.feedLimit)
        );

        state.unsubscribeFeed = onSnapshot(q, 
            (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    const p = { id: change.doc.id, ...change.doc.data() };
                    const postElId = `post-${p.id}`;

                    if (change.type === "added") {
                        if (document.getElementById(postElId)) return;
                        const html = window.app.createPostCardHTML(p);
                        const div = document.createElement('div');
                        div.id = postElId;
                        div.innerHTML = html;
                        feed.appendChild(div);
                    }
                    if (change.type === "modified") {
                        const el = document.getElementById(postElId);
                        if (el) el.innerHTML = window.app.createPostCardHTML(p);
                    }
                    if (change.type === "removed") {
                        const el = document.getElementById(postElId);
                        if (el) el.remove();
                    }
                });
                state.isFeedLoading = false;
            },
            (error) => {
                console.error("Erro no Feed:", error);
                // Fallback para erro de índice
                if (error.code === 'failed-precondition' || error.message.includes('index')) {
                    const feedDiv = document.getElementById('social-feed');
                    feedDiv.innerHTML = '<p style="padding:20px; text-align:center; color:red;">Índice do Firestore necessário. Tentando carregar sem ordem...</p>';
                }
            }
        );
    },

    // Funções auxiliares para gerar IDs únicos (evita conflito entre feed principal e detalhe)
    createPostCardHTML: (p, suffix = '') => {
        const isLiked = p.likes && p.likes.includes(state.currentUser.email);
        const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        const likeColor = isLiked ? 'var(--red)' : 'var(--text-main)';
        const deleteBtn = (p.email === state.currentUser.email || ADMIN_EMAILS.includes(state.currentUser.email)) 
            ? `<button onclick="window.app.deletePost('${p.id}')" style="border:none; background:none; color:#999; margin-left:10px; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>` : '';

        const comments = p.comments || [];
        let commentsHtml = '';
        comments.forEach(c => {
            const isMyComment = c.email === state.currentUser.email || ADMIN_EMAILS.includes(state.currentUser.email);
            const delCommentBtn = isMyComment ? `<button onclick="window.app.deleteComment('${p.id}', ${c.timestamp})" style="border:none; background:none; color:#ccc; font-size:10px; margin-left:5px; cursor:pointer;">x</button>` : '';
            commentsHtml += `<div style="font-size:13px; margin-bottom:4px;"><strong onclick="window.app.openPublicProfile('${c.email}')" style="cursor:pointer;">${c.userName}:</strong> ${c.text} ${delCommentBtn}</div>`;
        });

        const safeAvatar = p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.userName)}&background=random`;
        
        // Estilo padrão para posts (Feed e Detalhe)
        const safeImg = p.img ? `<img src="${p.img}" onclick="window.app.viewImage('${p.img}')" style="width: 100%; max-height: 450px; object-fit: cover; display: block; background-color: #f0f2f5; min-height: 200px; content-visibility: auto; margin-bottom: 10px; cursor: pointer; border-radius: 4px;">` : '';
        
        const safeUserEmail = window.app.escape(p.email);

        return `
        <div class="card post-card" style="padding:0; overflow:hidden;">
            <div style="padding:15px; display:flex; align-items:center;">
                <img src="${safeAvatar}" style="width:40px; height:40px; border-radius:50%; margin-right:10px; object-fit:cover; cursor:pointer;" onclick="window.app.openPublicProfile('${safeUserEmail}')">
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:14px; color:var(--text-main); cursor:pointer;" onclick="window.app.openPublicProfile('${safeUserEmail}')">${p.userName}</div>
                    <div style="font-size:11px; color:#999;">${new Date(p.created).toLocaleString()}</div>
                </div>
                ${deleteBtn}
            </div>
            ${p.text ? `<div style="padding:0 15px 15px; font-size:15px; line-height:1.5; white-space:pre-wrap;">${p.text}</div>` : ''}
            ${safeImg}
            <div style="padding:10px 15px; display:flex; align-items:center; border-top:1px solid #f0f0f0;">
                <button onclick="window.app.toggleLike('${p.id}')" style="border:none; background:none; color:${likeColor}; font-size:18px; cursor:pointer; margin-right:5px;"><i class="${likeIcon}"></i></button>
                <span style="font-size:14px; font-weight:600; color:var(--text-main); margin-right:20px;">${p.likes ? p.likes.length : 0}</span>
                <i class="fa-regular fa-comment" style="font-size:18px; color:var(--text-main); margin-right:5px;"></i>
                <span style="font-size:14px; font-weight:600; color:var(--text-main);">${comments.length}</span>
            </div>
            <div style="background:#f9f9f9; padding:10px 15px;">
                <div id="comments-${p.id}${suffix}" style="max-height:100px; overflow-y:auto; margin-bottom:10px;">${commentsHtml}</div>
                <div style="display:flex;">
                    <input id="input-comment-${p.id}${suffix}" type="text" placeholder="Comentar..." style="flex:1; border:1px solid #ddd; padding:8px 12px; border-radius:20px; outline:none; font-size:13px;">
                    <button onclick="window.app.submitComment('${p.id}', '${suffix}')" style="border:none; background:none; color:var(--primary); font-weight:600; margin-left:10px; cursor:pointer;">Enviar</button>
                </div>
            </div>
        </div>`;
    },

    setupFeedLoader: () => {
        let loader = document.getElementById('feed-loader-marker');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'feed-loader-marker';
            loader.style.height = '20px';
            loader.style.margin = '20px 0';
            const feed = document.getElementById('social-feed');
            if(feed) feed.after(loader);
        }
        if (state.feedSentinelObserver) state.feedSentinelObserver.disconnect();
        state.feedSentinelObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !state.isFeedLoading) {
                state.isFeedLoading = true;
                state.feedLimit += 5; 
                window.app.loadFeed(); 
            }
        }, { rootMargin: '100px' });
        state.feedSentinelObserver.observe(loader);
    },

    openCreatePost: () => window.app.screen('view-create-post'),
    closeCreatePost: () => {
        window.app.screen('view-app');
        document.getElementById('post-text').value = '';
        state.tempPostFile = null;
        document.getElementById('post-img-preview').style.display = 'none';
    },

    previewPostImg: (input) => {
        if (input.files && input.files[0]) {
            state.tempPostFile = input.files[0];
            const url = URL.createObjectURL(state.tempPostFile);
            const prev = document.getElementById('post-img-preview');
            prev.style.backgroundImage = `url('${url}')`;
            prev.style.display = 'block';
        }
    },

    submitPost: async () => {
        if (!state.currentUser) return;
        const text = document.getElementById('post-text').value;
        if (!text && !state.tempPostFile) return window.app.toast("Escreva algo ou adicione uma foto.");
        document.getElementById('btn-submit-post').disabled = true;
        document.getElementById('btn-submit-post').innerText = "Enviando...";
        try {
            let imgUrl = null;
            if (state.tempPostFile) {
                imgUrl = await window.app.uploadImage(state.tempPostFile, 'posts');
            }
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), {
                email: state.currentUser.email,
                userName: state.currentUser.name,
                avatar: state.currentUser.avatar,
                text: text,
                img: imgUrl,
                created: Date.now(),
                likes: [],
                comments: []
            });
            window.app.closeCreatePost();
            window.app.toast("Postado com sucesso!");
        } catch (e) {
            console.error(e);
            window.app.toast("Erro ao postar.");
        } finally {
            document.getElementById('btn-submit-post').disabled = false;
            document.getElementById('btn-submit-post').innerText = "Postar";
        }
    },

    toggleLike: async (postId) => {
        if (!state.currentUser) return;
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            const likes = postSnap.data().likes || [];
            if (likes.includes(state.currentUser.email)) {
                await updateDoc(postRef, { likes: arrayRemove(state.currentUser.email) });
            } else {
                await updateDoc(postRef, { likes: arrayUnion(state.currentUser.email) });
                window.app.haptic();
            }
        }
    },

    submitComment: async (postId, suffix = '') => {
        if (!state.currentUser) return;
        // Pega o input correto (seja do feed principal ou do detalhe)
        const input = document.getElementById(`input-comment-${postId}${suffix}`);
        if (!input) return;
        
        const text = input.value.trim();
        if (!text) return;
        const newComment = {
            email: state.currentUser.email,
            userName: state.currentUser.name,
            text: text,
            timestamp: Date.now()
        };
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        await updateDoc(postRef, { comments: arrayUnion(newComment) });
        input.value = '';
    },

    deleteComment: async (postId, timestamp) => {
        if (!confirm("Apagar comentário?")) return;
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if(postSnap.exists()) {
            const comments = postSnap.data().comments || [];
            const commentToDelete = comments.find(c => c.timestamp === timestamp);
            if(commentToDelete) {
                await updateDoc(postRef, { comments: arrayRemove(commentToDelete) });
                window.app.toast("Comentário removido.");
            }
        }
    },

    deletePost: async (postId) => {
        if (confirm("Tem certeza que deseja apagar este post?")) {
            const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
            const p = await getDoc(postRef);
            if(p.exists() && p.data().img) {
                await window.app.deleteFile(p.data().img);
            }
            await deleteDoc(postRef);
            window.app.toast("Post apagado.");
            const el = document.getElementById(`post-${postId}`);
            if(el) el.remove();
        }
    },

    viewImage: (url) => {
        const container = document.getElementById('video-container');
        const modalInner = document.querySelector('#modal-video > div');
        
        if(modalInner) {
            modalInner.style.cssText = 'aspect-ratio: unset; max-width: 100vw; max-height: 100vh; width: 100%; height: 100%; background: transparent; box-shadow: none; border-radius: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 20px;';
        }

        container.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;';

        container.innerHTML = `<img src="${url}" style="width: 100%; max-width: 600px; max-height: 450px; object-fit: cover; display: block; background-color: #f0f2f5; min-height: 200px; content-visibility: auto; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">`;
        
        document.getElementById('modal-video').classList.add('active');
    },

    loadNews: () => {
        const container = document.getElementById('news-feed');
        container.innerHTML = '<div class="skeleton" style="height:100px; margin-bottom:10px;"></div>';
        
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            container.innerHTML = '';
            if(snap.empty) {
                container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhuma novidade ainda.</p>';
                return;
            }
            const news = [];
            snap.forEach(d => news.push({id: d.id, ...d.data()}));
            news.sort((a,b) => b.created - a.created);
            
            news.forEach(n => {
                const imgHtml = n.img ? `<div style="height:180px; background:url('${n.img}') center/cover;"></div>` : '';
                container.innerHTML += `
                <div class="card news-card" onclick="window.app.openNewsDetail('${n.id}')">
                    ${imgHtml}
                    <div class="news-content">
                        <div class="news-date">${new Date(n.created).toLocaleDateString()}</div>
                        <h3 class="news-title">${window.app.formatText(n.title)}</h3>
                    </div>
                </div>`; 
            });
        });
    },

    openNewsDetail: (id) => {
        const n = state.allNews.find(item => item.id === id);
        if(!n) return;
        const imgContainer = document.getElementById('news-det-img-container');
        if(n.img) {
            imgContainer.style.backgroundImage = `url('${n.img}')`;
            imgContainer.style.display = 'block';
        } else {
            imgContainer.style.display = 'none';
        }
        document.getElementById('news-det-date').innerText = new Date(n.created).toLocaleDateString();
        document.getElementById('news-det-title').innerText = window.app.formatText(n.title);
        document.getElementById('news-det-body').innerText = window.app.formatText(n.body);
        document.querySelector('.nav-bar').style.display = 'none';
        const detailScreen = document.getElementById('view-news-detail');
        detailScreen.classList.add('active');
        detailScreen.scrollTop = 0;
        document.body.style.backgroundColor = '#FFF';
    },

    closeNewsDetail: () => {
        document.getElementById('view-news-detail').classList.remove('active');
        document.querySelector('.nav-bar').style.display = 'flex';
        document.body.style.backgroundColor = '#9cafcc';
    },

    // --- PERFIL PÚBLICO & NAVEGAÇÃO DE POSTS ---
    
    openPublicProfile: async (targetEmail) => {
        document.getElementById('pp-avatar').src = '';
        document.getElementById('pp-name').innerText = 'Carregando...';
        document.getElementById('pp-location').innerHTML = '';
        document.getElementById('pp-social-links').innerHTML = '';
        const grid = document.getElementById('pp-gallery-grid');
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#999; margin-top:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Carregando fotos...</p>';
        
        window.app.screen('view-public-profile');
        document.body.style.backgroundColor = '#FFFFFF';

        try {
            // 1. Busca Usuário
            if(!targetEmail) throw new Error("Email inválido");
            
            const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', C_USERS, targetEmail);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                const u = userSnap.data();
                
                const avatarUrl = u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random`;
                document.getElementById('pp-avatar').src = avatarUrl;
                document.getElementById('pp-name').innerText = u.name;
                
                const city = u.city || 'Cidade não informada';
                const country = u.country ? `, ${u.country}` : '';
                document.getElementById('pp-location').innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${city}${country}</span>`;

                const sl = u.socialLinks || {};
                let socialHtml = '';
                
                const makeLink = (url, icon, color) => {
                    let finalUrl = url;
                    if (!url.startsWith('http')) {
                        if (icon.includes('instagram')) finalUrl = `https://instagram.com/${url.replace('@','')}`;
                        else if (icon.includes('tiktok')) finalUrl = `https://tiktok.com/@${url.replace('@','')}`;
                        else finalUrl = `https://${url}`;
                    }
                    return `<a href="${finalUrl}" target="_blank" style="font-size: 24px; color: ${color}; text-decoration: none;"><i class="${icon}"></i></a>`;
                };

                if (sl.instagram) socialHtml += makeLink(sl.instagram, 'fa-brands fa-instagram', '#E1306C');
                if (sl.facebook) socialHtml += makeLink(sl.facebook, 'fa-brands fa-facebook', '#1877F2');
                if (sl.tiktok) socialHtml += makeLink(sl.tiktok, 'fa-brands fa-tiktok', '#000000');

                if (socialHtml === '') {
                    socialHtml = '<span style="font-size:12px; color:#ccc;">Sem redes sociais cadastradas.</span>';
                }
                document.getElementById('pp-social-links').innerHTML = socialHtml;
            } else {
                document.getElementById('pp-name').innerText = 'Usuário não encontrado';
                grid.innerHTML = ''; 
                return;
            }

            // 2. Busca Galeria (SEM ORDER BY) para evitar erros de índice
            const q = query(
                collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), 
                where("email", "==", targetEmail)
            );
            
            const querySnapshot = await getDocs(q);
            grid.innerHTML = '';
            
            let posts = [];
            querySnapshot.forEach((doc) => {
                posts.push({ id: doc.id, ...doc.data() });
            });

            // Ordena em memória
            posts.sort((a, b) => b.created - a.created);
            
            // Armazena posts no estado para navegação posterior
            state.currentProfilePosts = posts;
            
            let photoCount = 0;
            posts.forEach((p) => {
                // Renderiza todas as fotos, mas ao clicar abre o Post Detail
                if (p.img) {
                    photoCount++;
                    const div = document.createElement('div');
                    // Formato Retrato (4:5) para o grid
                    div.style.aspectRatio = '4/5'; 
                    div.style.backgroundImage = `url('${p.img}')`;
                    div.style.backgroundSize = 'cover';
                    div.style.backgroundPosition = 'center';
                    div.style.cursor = 'pointer';
                    div.style.backgroundColor = '#eee';
                    div.style.borderRadius = '4px';
                    // MUDANÇA: Abre o post específico em vez da imagem pura
                    div.onclick = () => window.app.openPostDetail(p.id);
                    grid.appendChild(div);
                }
            });

            if (photoCount === 0) {
                grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#ccc; font-size:13px; margin-top:20px;">Nenhuma foto publicada ainda.</p>';
            }

        } catch (error) {
            console.error("Erro perfil público:", error);
            grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:red; font-size:12px; margin-top:20px;">Erro ao carregar fotos. Tente novamente.</p>';
        }
    },

    closePublicProfile: () => {
        window.app.screen('view-app');
        window.app.nav('social');
        document.body.style.backgroundColor = '#9cafcc';
    },

    // --- NOVA FUNÇÃO: Feed Detalhado do Perfil ---
    openPostDetail: (startPostId) => {
        const container = document.getElementById('post-detail-feed');
        container.innerHTML = ''; // Limpa anterior
        
        // Renderiza todos os posts desse usuário
        state.currentProfilePosts.forEach(p => {
            // Adiciona sufixo '_detail' para evitar IDs duplicados com o feed principal
            const html = window.app.createPostCardHTML(p, '_detail');
            const div = document.createElement('div');
            // ID único para scroll
            div.id = `detail-post-${p.id}`; 
            div.innerHTML = html;
            container.appendChild(div);
        });

        window.app.screen('view-post-detail');
        document.body.style.backgroundColor = '#f4f7f9';

        // Rola até o post clicado
        setTimeout(() => {
            const target = document.getElementById(`detail-post-${startPostId}`);
            if (target) target.scrollIntoView({ behavior: 'auto', block: 'center' });
        }, 100);
    },

    closePostDetail: () => {
        // Volta para o perfil público
        window.app.screen('view-public-profile');
        document.body.style.backgroundColor = '#FFFFFF';
    }
};
