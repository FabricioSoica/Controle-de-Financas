<script setup>
import { ref, computed } from 'vue';
import AuthScreen from './components/AuthScreen.vue';
import DashboardTab from './components/DashboardTab.vue';
import EvolutionTab from './components/EvolutionTab.vue';
import ShoppingTab from './components/ShoppingTab.vue';
import FuelTab from './components/FuelTab.vue';

const API_URL = import.meta.env.DEV ? 'http://localhost:5001' : '';

// Global Session State
const token = ref(localStorage.getItem('financas_token') || '');
const username = ref(localStorage.getItem('financas_username') || '');
const userId = ref(localStorage.getItem('financas_userId') || '');
const activeTab = ref('dashboard');

const isAuthenticated = computed(() => !!token.value);

// Toast Notification State
const toasts = ref([]);

// Settings State
const showSettingsModal = ref(false);
const cardConfigs = ref([]);
const newCardName = ref('');
const newCardClosingDay = ref('');
const configLoading = ref(false);

const showToast = (message, type = 'success') => {
  const id = Date.now();
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3500);
};

const fetchCardConfigs = async () => {
  if (!token.value) return;
  try {
    const res = await fetch(`${API_URL}/api/cards/config`, {
      headers: {
        'Authorization': `Bearer ${token.value}`
      }
    });
    if (res.ok) {
      cardConfigs.value = await res.json();
    }
  } catch (error) {
    console.error('Error fetching card configs:', error);
  }
};

const saveCardConfig = async () => {
  if (!newCardName.value || !newCardClosingDay.value) {
    showToast('Por favor, preencha o nome do cartão e o dia de fechamento.', 'error');
    return;
  }
  const day = parseInt(newCardClosingDay.value, 10);
  if (isNaN(day) || day < 1 || day > 31) {
    showToast('O dia de fechamento deve ser entre 1 e 31.', 'error');
    return;
  }
  
  configLoading.value = true;
  try {
    const res = await fetch(`${API_URL}/api/cards/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.value}`
      },
      body: JSON.stringify({
        cardName: newCardName.value.trim(),
        closingDay: day
      })
    });
    
    if (res.ok) {
      showToast('Configuração de cartão salva com sucesso!');
      newCardName.value = '';
      newCardClosingDay.value = '';
      fetchCardConfigs();
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao salvar configuração');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    configLoading.value = false;
  }
};

const deleteCardConfig = async (id) => {
  if (!confirm('Deseja realmente remover esta configuração?')) return;
  try {
    const res = await fetch(`${API_URL}/api/cards/config/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token.value}`
      }
    });
    if (res.ok) {
      showToast('Configuração excluída com sucesso.');
      fetchCardConfigs();
    } else {
      throw new Error('Falha ao excluir configuração');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

import { watch } from 'vue';
watch(showSettingsModal, (isOpen) => {
  if (isOpen) {
    fetchCardConfigs();
  }
});

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
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'fuel' }" 
            @click="activeTab = 'fuel'"
            type="button"
          >
            <i class="fa-solid fa-motorcycle"></i> Gasolina
          </button>
        </nav>

        <!-- User profile badge (only if authenticated) -->
        <div v-if="isAuthenticated" class="user-profile-badge">
          <span><i class="fa-solid fa-circle-user" style="color: var(--color-primary);"></i> <strong>{{ username }}</strong></span>
          <button class="btn-settings" @click="showSettingsModal = true" title="Configurações do Sistema" type="button" style="margin-left: 0.5rem; margin-right: 0.25rem;">
            <i class="fa-solid fa-gear"></i>
          </button>
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

      <!-- TAB 4: FUEL CONSUMPTION -->
      <FuelTab 
        v-if="activeTab === 'fuel'" 
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

    <!-- SYSTEM SETTINGS MODAL -->
    <div v-if="showSettingsModal" class="modal-backdrop" @click="showSettingsModal = false">
      <div class="modal-content" @click.stop style="max-width: 500px; width: 90%;">
        <div class="modal-header">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fa-solid fa-sliders" style="color: var(--color-primary);"></i> Configurações
          </h3>
          <button class="btn-close-modal" @click="showSettingsModal = false" type="button" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.2rem;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="modal-body custom-scroll" style="max-height: 450px; overflow-y: auto; padding: 1.5rem 0;">
          <h4 style="margin-bottom: 0.5rem; font-size: 0.95rem; color: var(--text-primary);">Dia de Fechamento das Faturas</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1.25rem; line-height: 1.4;">
            Defina o dia limite para compras entrarem na fatura atual. Compras após esse dia caem no mês seguinte.
          </p>
          
          <!-- Add Card Config Form -->
          <form @submit.prevent="saveCardConfig" style="display: grid; grid-template-columns: 1.5fr 1fr 0.8fr; gap: 0.5rem; align-items: end; margin-bottom: 1.5rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 0.75rem;">Nome do Cartão</label>
              <input 
                type="text" 
                v-model="newCardName" 
                placeholder="Ex: Santander" 
                class="form-input" 
                style="padding: 0.4rem 0.75rem; font-size: 0.85rem;"
                required
              />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 0.75rem;">Dia Fechamento</label>
              <input 
                type="number" 
                v-model="newCardClosingDay" 
                placeholder="Ex: 5" 
                min="1" 
                max="31" 
                class="form-input" 
                style="padding: 0.4rem 0.75rem; font-size: 0.85rem;"
                required
              />
            </div>
            <button type="submit" class="btn btn-primary" :disabled="configLoading" style="padding: 0.45rem; font-size: 0.85rem; height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem;">
              <i class="fa-solid fa-plus"></i> Salvar
            </button>
          </form>
          
          <!-- Configs List -->
          <div class="card-configs-list" style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
            <div v-if="cardConfigs.length === 0" style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">
              Nenhum cartão configurado ainda.
            </div>
            <div v-else style="display: flex; flex-direction: column; gap: 0.5rem;">
              <div v-for="c in cardConfigs" :key="c._id" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.85rem;">
                <span style="font-weight: 600; color: var(--text-primary);"><i class="fa-solid fa-credit-card" style="color: var(--color-danger); opacity: 0.8; margin-right: 0.25rem;"></i> {{ c.cardName }}</span>
                <div style="display: flex; align-items: center; gap: 1rem;">
                  <span style="color: var(--text-secondary);">Fecha dia: <strong>{{ c.closingDay }}</strong></span>
                  <button @click="deleteCardConfig(c._id)" style="background: none; border: none; color: var(--color-danger); cursor: pointer; padding: 0.25rem;" title="Remover" type="button">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-content {
  background: rgba(17, 24, 39, 0.95);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--card-shadow);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.75rem;
}

.btn-settings {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-smooth);
}

.btn-settings:hover {
  color: var(--text-primary);
  border-color: rgba(99, 102, 241, 0.5);
  background: rgba(99, 102, 241, 0.1);
}
</style>
