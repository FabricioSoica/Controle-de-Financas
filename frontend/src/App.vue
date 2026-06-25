<script setup>
import { ref, computed } from 'vue';
import AuthScreen from './components/AuthScreen.vue';
import DashboardTab from './components/DashboardTab.vue';
import EvolutionTab from './components/EvolutionTab.vue';
import ShoppingTab from './components/ShoppingTab.vue';

const API_URL = import.meta.env.DEV ? 'http://localhost:5001' : '';

// Global Session State
const token = ref(localStorage.getItem('financas_token') || '');
const username = ref(localStorage.getItem('financas_username') || '');
const userId = ref(localStorage.getItem('financas_userId') || '');
const activeTab = ref('dashboard');

const isAuthenticated = computed(() => !!token.value);

// Toast Notification State
const toasts = ref([]);

const showToast = (message, type = 'success') => {
  const id = Date.now();
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3500);
};

const handleToast = (payload) => {
  showToast(payload.message, payload.type);
};

// ==========================================
// Authentication Handlers
// ==========================================
const handleAuthSuccess = (data) => {
  token.value = data.token;
  username.value = data.username;
  userId.value = data.userId;
  
  localStorage.setItem('financas_token', data.token);
  localStorage.setItem('financas_username', data.username);
  localStorage.setItem('financas_userId', data.userId);
  
  activeTab.value = 'dashboard';
};

const handleLogout = () => {
  token.value = '';
  username.value = '';
  userId.value = '';
  
  localStorage.removeItem('financas_token');
  localStorage.removeItem('financas_username');
  localStorage.removeItem('financas_userId');
  
  showToast('Sessão encerrada com sucesso.', 'info');
};

const handleUnauthorized = () => {
  handleLogout();
  showToast('Sessão expirada. Por favor, faça login novamente.', 'error');
};
</script>

<template>
  <div class="app-container">
    <!-- Header with user profile and navigation tabs -->
    <header class="app-header">
      <div class="logo-section">
        <span class="logo-icon"><i class="fa-solid fa-wallet"></i></span>
        <div>
          <span class="logo-text">Controle de Finanças</span>
          <span class="logo-sub">Painel Integrado & Compras</span>
        </div>
      </div>
      
      <div style="display: flex; align-items: center; gap: 1rem;">
        <!-- Navigation tabs (only if authenticated) -->
        <nav v-if="isAuthenticated" class="nav-tabs">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'dashboard' }" 
            @click="activeTab = 'dashboard'"
            type="button"
          >
            <i class="fa-solid fa-house-laptop"></i> Painel
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'evolution' }" 
            @click="activeTab = 'evolution'"
            type="button"
          >
            <i class="fa-solid fa-chart-line"></i> Evolução Anual
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'shopping' }" 
            @click="activeTab = 'shopping'"
            type="button"
          >
            <i class="fa-solid fa-cart-shopping"></i> Lista de Compras
          </button>
        </nav>

        <!-- User profile badge (only if authenticated) -->
        <div v-if="isAuthenticated" class="user-profile-badge">
          <span><i class="fa-solid fa-circle-user" style="color: var(--color-primary);"></i> <strong>{{ username }}</strong></span>
          <button class="btn-logout" @click="handleLogout" title="Sair do Sistema" type="button">
            <i class="fa-solid fa-right-from-bracket"></i> <span class="btn-logout-text">Sair</span>
          </button>
        </div>
      </div>
    </header>

    <!-- AUTHENTICATION SCREEN -->
    <AuthScreen 
      v-if="!isAuthenticated" 
      :apiUrl="API_URL"
      @auth-success="handleAuthSuccess"
      @toast="handleToast"
    />

    <!-- AUTHENTICATED TABS SYSTEM -->
    <main v-else>
      <!-- TAB 1: DASHBOARD -->
      <DashboardTab 
        v-if="activeTab === 'dashboard'" 
        :token="token"
        :apiUrl="API_URL"
        @toast="handleToast"
        @unauthorized="handleUnauthorized"
      />

      <!-- TAB 2: EVOLUTION SUMMARY -->
      <EvolutionTab 
        v-if="activeTab === 'evolution'" 
        :token="token"
        :apiUrl="API_URL"
        @toast="handleToast"
      />

      <!-- TAB 3: SHOPPING LIST -->
      <ShoppingTab 
        v-if="activeTab === 'shopping'" 
        :token="token"
        :apiUrl="API_URL"
        @toast="handleToast"
      />
    </main>

    <!-- Glassmorphism Toast Notifications -->
    <div class="toast-container">
      <div 
        v-for="toast in toasts" 
        :key="toast.id" 
        class="toast" 
        :class="toast.type"
      >
        <span class="toast-icon">
          <i v-if="toast.type === 'success'" class="fa-solid fa-circle-check" style="color: var(--color-success);"></i>
          <i v-else-if="toast.type === 'error'" class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i>
          <i v-else-if="toast.type === 'info'" class="fa-solid fa-circle-info" style="color: var(--color-info);"></i>
        </span>
        <span class="toast-text">{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>
