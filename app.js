// Este é o arquivo principal que combina todos os módulos e os expõe para o HTML (window.app)
import { state } from "./js/state.js";
import { utils } from "./js/utils.js";
import { authLogic } from "./js/auth.js";
import { student } from "./js/student.js";
import { social } from "./js/social.js";
import { admin } from "./js/admin.js";

// --- FIX iOS VIEWPORT HEIGHT ---
// Função crucial para corrigir o bug de altura do Safari/PWA e App Nativo
const fixViewportHeight = () => {
    // Só aplica o fix de altura 100% se for mobile.
    // No desktop, o CSS controla a altura do container (92vh)
    if(window.innerWidth < 1024) {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${vh}px`);
        document.body.style.height = `${vh}px`;
    } else {
        // Remove restrição no desktop para permitir que o body seja container flex
        document.body.style.height = '100vh';
        document.documentElement.style.removeProperty('--app-height');
    }
};

// Executa o fix no carregamento
window.addEventListener('load', () => {
  fixViewportHeight();
  // RequestAnimationFrame garante que rode após o layout inicial
  requestAnimationFrame(fixViewportHeight);
});

// Executa o fix sempre que a tela girar ou redimensionar (teclado abrir, etc)
window.addEventListener('resize', () => {
    fixViewportHeight();
    // Um pequeno delay ajuda em dispositivos lentos
    setTimeout(fixViewportHeight, 100);
});

// A "cola" que faz o HTML antigo funcionar com os novos módulos
window.app = {
    // Estado (acessível para debug se necessário)
    admUsersCache: state.admUsersCache, // Mantido para compatibilidade com lógica antiga

    // Inicialização
    init: authLogic.init,

    // Utilitários
    ...utils,

    // Auth
    ...authLogic,

    // Funcionalidades de Aluno
    ...student,

    // Social e News
    ...social,

    // Admin
    ...admin
};

// Iniciar app quando o JS carregar
window.onload = window.app.init;
