import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
// MUDANÇA AQUI: Importamos initializeAuth e indexedDBLocalPersistence
import { initializeAuth, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- ÁREA DE CONFIGURAÇÃO ---
const firebaseConfig = { 
    apiKey: "AIzaSyDti6glq6Yw_mz_RV8JC167wPyOkbSDs-s", 
    authDomain: "nuts-aea26.firebaseapp.com", 
    projectId: "nuts-aea26", 
    storageBucket: "nuts-aea26.firebasestorage.app", 
    messagingSenderId: "790944551064", 
    appId: "1:790944551064:web:eec0a496c599a58cc040ed" 
};

// INICIALIZAÇÃO
const appInit = initializeApp(firebaseConfig);

// MUDANÇA AQUI: Inicialização forçando persistência compatível com Capacitor iOS
export const auth = initializeAuth(appInit, {
  persistence: indexedDBLocalPersistence
});

export const db = getFirestore(appInit);
export const storage = getStorage(appInit);

// ID do App
export const appId = 'nuts-app-v1'; 

// URL DO CLOUDFLARE WORKER
export const CF_WORKER_URL = "https://nuts.lucasabreucotefis.workers.dev"; 

// CONSTANTES E CONFIGURAÇÕES DE COLEÇÕES
export const C_USERS = 'expliq_users_v9';
export const C_POSTS = 'expliq_posts_v9';
export const C_NEWS = 'expliq_news_v9';
export const C_QUOTES = 'expliq_quotes_v9';
export const C_TEMPLATES = 'expliq_templates_v9';
export const C_VIDEOS = 'expliq_strength_videos_v9'; 
export const C_PAIN = 'expliq_pain_v9'; 
export const C_PUBLIC_RACES = 'expliq_public_races_v9';

// !!! SEGURANÇA ADMIN !!!
export const ADMIN_EMAILS = ["lucas_maia9@hotmail.com","giselleguima1@hotmail.com","edgarzanin@outlook.com","jordana.coimbraa@gmail.com"];
