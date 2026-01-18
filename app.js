// Este é o arquivo principal que combina todos os módulos e os expõe para o HTML (window.app)
import { state } from "./js/state.js";
import { utils } from "./js/utils.js";
import { authLogic } from "./js/auth.js";
import { student } from "./js/student.js";
import { social } from "./js/social.js";
import { admin } from "./js/admin.js";

// Ajuste para altura em mobile
window.addEventListener('load', () => {
  document.body.style.height = '100vh';
  requestAnimationFrame(() => {
    document.body.style.height = '100dvh';
  });
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
