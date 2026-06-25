<script setup>
import { ref } from 'vue';

const props = defineProps({
  apiUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['auth-success', 'toast']);

const authTab = ref('login'); // 'login' | 'register'
const authUsername = ref('');
const authPassword = ref('');
const authConfirmPassword = ref('');
const authLoading = ref(false);

const handleAuth = async () => {
  if (!authUsername.value || !authPassword.value) {
    emit('toast', { message: 'Por favor, preencha todos os campos.', type: 'error' });
    return;
  }

  if (authTab.value === 'register' && authPassword.value !== authConfirmPassword.value) {
    emit('toast', { message: 'As senhas não coincidem.', type: 'error' });
    return;
  }

  authLoading.value = true;
  const endpoint = authTab.value === 'login' ? '/api/auth/login' : '/api/auth/register';
  
  try {
    const res = await fetch(`${props.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authUsername.value,
        password: authPassword.value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na autenticação');

    emit('toast', { 
      message: authTab.value === 'login' ? 'Bem-vindo de volta!' : 'Conta criada com sucesso!', 
      type: 'success' 
    });
    
    // Emit success payload up to App.vue
    emit('auth-success', {
      token: data.token,
      username: data.username,
      userId: data.userId
    });

    // Clear forms
    authUsername.value = '';
    authPassword.value = '';
    authConfirmPassword.value = '';
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    authLoading.value = false;
  }
};
</script>

<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-header">
        <i class="fa-solid fa-wallet" style="font-size: 3rem; background: linear-gradient(135deg, var(--color-primary), #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 10px rgba(99,102,241,0.3));"></i>
        <h2 style="font-family: var(--font-heading); font-size: 1.6rem; margin-top: 1rem; font-weight: 800;">Controle de Finanças</h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">Controle e Vizualização do seu bolso!</p>
      </div>

      <!-- Auth Tabs -->
      <div class="auth-tabs">
        <button 
          class="auth-tab" 
          :class="{ active: authTab === 'login' }" 
          @click="authTab = 'login'"
          type="button"
        >
          Entrar
        </button>
        <button 
          class="auth-tab" 
          :class="{ active: authTab === 'register' }" 
          @click="authTab = 'register'"
          type="button"
        >
          Criar Conta
        </button>
      </div>

      <!-- Auth Form -->
      <form @submit.prevent="handleAuth">
        <div class="form-group" style="text-align: left;">
          <label class="form-label">Usuário</label>
          <div style="position: relative;">
            <i class="fa-solid fa-user" style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;"></i>
            <input 
              type="text" 
              v-model="authUsername" 
              placeholder="Insira seu usuário" 
              class="form-input" 
              style="padding-left: 2.2rem;"
              required
            />
          </div>
        </div>

        <div class="form-group" style="text-align: left;">
          <label class="form-label">Senha</label>
          <div style="position: relative;">
            <i class="fa-solid fa-lock" style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;"></i>
            <input 
              type="password" 
              v-model="authPassword" 
              placeholder="Insira sua senha" 
              class="form-input" 
              style="padding-left: 2.2rem;"
              required
            />
          </div>
        </div>

        <!-- Confirm Password (Only for signup) -->
        <div v-if="authTab === 'register'" class="form-group" style="text-align: left;">
          <label class="form-label">Confirmar Senha</label>
          <div style="position: relative;">
            <i class="fa-solid fa-shield-halved" style="position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem;"></i>
            <input 
              type="password" 
              v-model="authConfirmPassword" 
              placeholder="Confirme sua senha" 
              class="form-input" 
              style="padding-left: 2.2rem;"
              required
            />
          </div>
        </div>

        <button type="submit" class="btn btn-primary" style="margin-top: 1rem;" :disabled="authLoading">
          <span v-if="authLoading"><i class="fa-solid fa-spinner fa-spin"></i> Processando...</span>
          <span v-else><i class="fa-solid fa-right-to-bracket"></i> {{ authTab === 'login' ? 'Acessar Painel' : 'Registrar Usuário' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
