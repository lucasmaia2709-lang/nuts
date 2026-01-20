import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- ÁREA DE CONFIGURAÇÃO ---
// Substitua pelas suas credenciais se necessário, mantive as que vi nos seus arquivos
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

// Inicialização com persistência (compatível com PWA/Mobile)
export const auth = initializeAuth(appInit, {
  persistence: indexedDBLocalPersistence
});

export const db = getFirestore(appInit);
export const storage = getStorage(appInit);

// ID do App (Namespace no Firestore)
export const appId = 'nuts-app-v1'; 

// URL DO CLOUDFLARE WORKER (IA)
export const CF_WORKER_URL = "https://nuts.lucasabreucotefis.workers.dev"; 

// LISTA DE ADMINS (E-mails que podem ver o botão de cadeado)
export const ADMIN_EMAILS = [
    "lucasmaia2709@gmail.com", 
    "admin@nuts.com" // Adicione outros se precisar
];

// --- NOMES DAS COLEÇÕES (CONSTANTES) ---
// Centralizamos aqui para garantir que admin.js e student.js usem os mesmos nomes
export const C_USERS = 'expliq_users_v9';       // Usuários
export const C_POSTS = 'expliq_posts_v2';       // Feed Social
export const C_NEWS = 'expliq_news_v1';         // Notícias
export const C_TEMPLATES = 'expliq_templates_v1'; // Modelos de Treino
export const C_VIDEOS = 'expliq_videos_v1';     // Vídeos de Fortalecimento
export const C_PAIN = 'expliq_pain_v1';         // Relatos de Dor (Fisio)
export const C_QUOTES = 'expliq_quotes_v1';     // Frases Motivacionais
export const C_PUBLIC_RACES = 'expliq_races_public_v1'; // Calendário Social (Novo)
