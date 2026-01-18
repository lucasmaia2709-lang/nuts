import { doc, getDoc, updateDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId, C_POSTS, C_NEWS, ADMIN_EMAILS } from "./config.js";
import { state } from "./state.js";

export const social = {
    // --- FEED ---
    loadFeed: () => {
        const feed = document.getElementById('social-feed');
        if(state.unsubscribeFeed) state.unsubscribeFeed();

        // Ordenar no Firestore para docChanges funcionar previsivelmente
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS), orderBy('created', 'desc'), limit(50));

        state.unsubscribeFeed = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const p = { id: change.doc.id, ...change.doc.data() };
                const postElId = `post-${p.id}`;

                if (change.type === "added") {
                    // Criar HTML do novo card
                    const html = window.app.createPostCardHTML(p);
                    const div = document.createElement('div');
                    div.innerHTML = html;
                    const newNode = div.firstElementChild; 

                    if (change.newIndex === 0 && feed.firstChild) {
                        feed.insertBefore(newNode, feed.firstChild);
                    } else if (change.newIndex < feed.children.length) {
                         const nextSibling = feed.children[change.newIndex];
                         feed.insertBefore(newNode, nextSibling);
                    } else {
                        feed.appendChild(newNode);
                    }
                }

                if (change.type === "modified") {
                    const card = document.getElementById(postElId);
                    if (card) {
                        window.app.updatePostCardDOM(card, p);
                    }
                }

                if (change.type === "removed") {
                    const card = document.getElementById(postElId);
                    if(card) card.remove();
                }
            });
            
            if(snapshot.empty) {
                feed.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Seja o primeiro a postar!</p>';
            }
        });
    },

    createPostCardHTML: (p) => {
        const imgUrl = p.img || p.image; 
        const isOwner = state.currentUser && p.email === state.currentUser.email;
        const isAdmin = state.currentUser && ADMIN_EMAILS.includes(state.currentUser.email);
        
        let deleteBtn = '';
        if (isOwner || isAdmin) {
            deleteBtn = `<button onclick="window.app.deletePost('${p.id}')" style="border:none; background:none; color:var(--red); font-size:14px; margin-left:auto;"><i class="fa-solid fa-trash"></i></button>`;
        }

        const likes = p.likes || [];
        const isLiked = state.currentUser && likes.includes(state.currentUser.email);
        const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        const likeColor = isLiked ? 'color:var(--red);' : 'color:var(--text-main);';

        const comments = p.comments || [];
        let commentsHtml = '';
        comments.forEach((c, idx) => {
            const canDelComm = (state.currentUser && c.email === state.currentUser.email) || isAdmin;
            commentsHtml += `
            <div style="font-size:13px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:flex-start;">
                <span><strong style="color:var(--text-main);">${c.userName}</strong> <span style="color:#555;">${c.text}</span></span>
                ${canDelComm ? `<button onclick="window.app.deleteComment('${p.id}', ${idx})" style="border:none; background:none; color:#ccc; font-size:10px; cursor:pointer;">✕</button>` : ''}
            </div>`;
        });

        return `
        <div id="post-${p.id}" class="card" style="padding:0; overflow:hidden; margin-bottom:25px;">
            <div style="padding:15px; display:flex; align-items:center; gap:12px;">
                <div style="width:35px; height:35px; border-radius:50%; background:#EEE; overflow:hidden;">${p.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;">` : ''}</div>
                <div>
                    <strong style="font-size:14px; display:block; color:var(--text-main);">${p.userName}</strong>
                    <span style="font-size:11px; color:var(--text-sec);">${new Date(p.created).toLocaleDateString()}</span>
                </div>
                ${deleteBtn}
            </div>
            ${imgUrl ? `<img src="${imgUrl}" loading="lazy" class="feed-img" onload="this.classList.add('loaded')">` : ''}
            <div style="padding:15px;">
                <div style="display:flex; gap:20px; margin-bottom:10px; align-items: center;">
                    <button onclick="window.app.toggleLike('${p.id}')" class="btn-like-action" style="border:none; background:none; font-size:22px; cursor:pointer; ${likeColor} display:flex; align-items:center; gap:8px; padding:0;">
                        <i class="${likeIcon} icon-like-target"></i>
                        <span class="count-like-target" style="font-size:15px; font-weight:600; color:var(--text-main);">${likes.length}</span>
                    </button>
                    <button onclick="document.getElementById('comment-input-${p.id}').focus()" style="border:none; background:none; font-size:22px; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:8px; padding:0;">
                        <i class="fa-regular fa-comment"></i>
                        <span class="count-comment-target" style="font-size:15px; font-weight:600; color:var(--text-main);">${comments.length}</span>
                    </button>
                </div>
                <p style="margin:0 0 10px 0; font-size:14px; line-height:1.5; color:var(--text-main);">
                    <strong style="margin-right:5px;">${p.userName}</strong>${p.text}
                </p>
                <div class="comments-container" style="margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                    ${commentsHtml}
                </div>
                <div style="display:flex; margin-top:10px; gap:10px;">
                    <input id="comment-input-${p.id}" type="text" placeholder="Adicione um comentário..." style="flex:1; border:none; outline:none; font-size:13px; background:transparent;">
                    <button onclick="window.app.submitComment('${p.id}')" style="border:none; background:none; color:var(--primary); font-weight:600; font-size:13px; cursor:pointer;">Publicar</button>
                </div>
            </div>
        </div>`;
    },

    updatePostCardDOM: (card, p) => {
        const likes = p.likes || [];
        const isLiked = state.currentUser && likes.includes(state.currentUser.email);
        const comments = p.comments || [];
        const isAdmin = state.currentUser && ADMIN_EMAILS.includes(state.currentUser.email);

        const btnLike = card.querySelector('.btn-like-action');
        const iconLike = card.querySelector('.icon-like-target');
        const countLike = card.querySelector('.count-like-target');

        if(btnLike) btnLike.style.color = isLiked ? 'var(--red)' : 'var(--text-main)';
        if(iconLike) {
            iconLike.className = isLiked ? 'fa-solid fa-heart icon-like-target' : 'fa-regular fa-heart icon-like-target';
        }
        if(countLike) countLike.innerText = likes.length;

        const countComm = card.querySelector('.count-comment-target');
        if(countComm) countComm.innerText = comments.length;

        const commContainer = card.querySelector('.comments-container');
        if(commContainer) {
            let commentsHtml = '';
            comments.forEach((c, idx) => {
                const canDelComm = (state.currentUser && c.email === state.currentUser.email) || isAdmin;
                commentsHtml += `
                <div style="font-size:13px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:flex-start;">
                    <span><strong style="color:var(--text-main);">${c.userName}</strong> <span style="color:#555;">${c.text}</span></span>
                    ${canDelComm ? `<button onclick="window.app.deleteComment('${p.id}', ${idx})" style="border:none; background:none; color:#ccc; font-size:10px; cursor:pointer;">✕</button>` : ''}
                </div>`;
            });
            commContainer.innerHTML = commentsHtml;
        }
    },

    toggleLike: async (postId) => {
        if(!state.currentUser) return;
        window.app.haptic(); 
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if(postSnap.exists()) {
            const p = postSnap.data();
            const likes = p.likes || [];
            if(likes.includes(state.currentUser.email)) {
                await updateDoc(postRef, { likes: arrayRemove(state.currentUser.email) });
            } else {
                await updateDoc(postRef, { likes: arrayUnion(state.currentUser.email) });
            }
        }
    },

    submitComment: async (postId) => {
        if(!state.currentUser) return;
        const input = document.getElementById(`comment-input-${postId}`);
        const text = input.value.trim();
        if(!text) return;
        const newComment = { userName: state.currentUser.name, email: state.currentUser.email, text: text, created: Date.now() };
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        await updateDoc(postRef, { comments: arrayUnion(newComment) });
        input.value = '';
        window.app.haptic();
    },

    deleteComment: async (postId, commentIndex) => {
        if(!confirm("Apagar comentário?")) return;
        const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
        const postSnap = await getDoc(postRef);
        if(postSnap.exists()) {
            const p = postSnap.data();
            const comments = p.comments || [];
            const newComments = comments.filter((_, idx) => idx !== commentIndex);
            await updateDoc(postRef, { comments: newComments });
        }
    },

    deletePost: async (postId) => {
        window.app.showConfirm("Excluir publicação?", async () => {
            const postRef = doc(db, 'artifacts', appId, 'public', 'data', C_POSTS, postId);
            const snap = await getDoc(postRef);
            if(snap.exists() && snap.data().img) await window.app.deleteFile(snap.data().img);
            await deleteDoc(postRef);
            window.app.toast("Publicação removida.");
        });
    },

    openCreatePost: () => window.app.screen('view-create-post'),
    closeCreatePost: () => window.app.screen('view-app'),
    previewPostImg: (input) => { 
        if(input.files && input.files[0]) {
            state.tempPostFile = input.files[0];
            const url = URL.createObjectURL(state.tempPostFile);
            const prev = document.getElementById('post-img-preview'); 
            prev.style.backgroundImage = `url(${url})`; 
            prev.style.display = 'block'; 
        }
    },
    submitPost: async () => {
        const text = document.getElementById('post-text').value;
        if(!text && !state.tempPostFile) return;
        document.getElementById('btn-submit-post').disabled = true;
        window.app.toast("Enviando...");
        let imgUrl = null;
        if(state.tempPostFile) imgUrl = await window.app.uploadImage(state.tempPostFile, 'posts');
        await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', C_POSTS)), { 
            userName: state.currentUser.name, email: state.currentUser.email, avatar: state.currentUser.avatar, text: text, img: imgUrl, likes: [], comments: [], created: Date.now() 
        });
        document.getElementById('post-text').value = ''; 
        state.tempPostFile = null; 
        document.getElementById('post-img-preview').style.display = 'none'; 
        document.getElementById('btn-submit-post').disabled = false;
        window.app.closeCreatePost();
        window.app.haptic();
    },

    // --- NOTÍCIAS ---
    loadNews: () => {
        onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', C_NEWS), (snap) => {
            const feed = document.getElementById('news-feed'); feed.innerHTML = '';
            const news = []; snap.forEach(d => news.push({id: d.id, ...d.data()})); 
            news.sort((a,b) => b.created - a.created);
            state.allNews = news; 
            
            news.forEach(n => { 
                feed.innerHTML += `
                <div class="card news-card" onclick="window.app.openNewsDetail('${n.id}')">
                    ${n.img ? `<img src="${n.img}" class="news-img">` : ''}
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
        detailScreen.style.overflowY = 'auto';
        detailScreen.scrollTop = 0;
        document.body.style.backgroundColor = '#FFF';
    },

    closeNewsDetail: () => {
        document.getElementById('view-news-detail').classList.remove('active');
        document.querySelector('.nav-bar').style.display = 'flex';
        document.body.style.backgroundColor = '#9cafcc';
    },
};
