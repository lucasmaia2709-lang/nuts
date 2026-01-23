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
        // Tentamos usar visualViewport se disponível (mais preciso em teclados virtuais)
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${vh}px`);
        
        // Em vez de forçar height fixo no body (que pode bugar com safe-areas),
        // deixamos o CSS (fixed inset:0) lidar com o layout principal,
        // mas setamos a variável --app-height caso algum elemento precise.
    } else {
        // Remove restrição no desktop para permitir que o body seja container flex
        document.body.style.height = '100vh';
        document.documentElement.style.removeProperty('--app-height');
    }
};

// Executa o fix no carregamento E REPETIDAMENTE para garantir estabilidade no PWA
window.addEventListener('load', () => {
  fixViewportHeight();
  setTimeout(fixViewportHeight, 100);
  setTimeout(fixViewportHeight, 500); // Garante correção após animação de abertura
});

// Executa o fix sempre que a tela girar ou redimensionar (teclado abrir, etc)
window.addEventListener('resize', () => {
    fixViewportHeight();
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
