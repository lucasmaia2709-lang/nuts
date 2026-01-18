// Este arquivo armazena as variáveis globais que são compartilhadas entre módulos
export const state = {
    currentUser: null,
    currentMonth: new Date(),
    selectedDayDate: null, 
    
    // CACHE OTIMIZADO (Solução 1)
    // Antes era allUsersCache (pesado), agora é communityRacesCache (leve)
    communityRacesCache: [], 

    // Variáveis temporárias de upload
    tempPostFile: null,
    tempNewsFile: null,

    // Estados de UI Admin
    expandedUsers: new Set(),
    expandedRaces: new Set(),
    expandedTemplates: new Set(),

    // Estados de Edição Admin
    currentAdmUser: null,
    currentAdmRaceIdx: null,
    isEditingTemplate: false,
    currentTemplateId: null,
    editingWorkoutIndex: null,
    
    // Cache de Dados
    allNews: [],
    admUsersCache: {}, 

    // Estado de Edição de Prova (Aluno)
    editingStudentRaceIndex: null,

    // Estado de Conclusão de Treino (Aluno)
    pendingFinishWorkoutTitle: null, 
    selectedPainLevel: null, 

    // Variáveis de Paginação Admin
    lastVisibleUser: null,
    isLoadingUsers: false,

    // Estado Admin Fisio
    currentPainId: null, 

    // Listeners de Notificação (para limpar ao sair)
    unsubscribeUserNotif: null,
    unsubscribeAdminNotif: null,
    unsubscribeFeed: null
};
