<script setup>
import { ref, onMounted, computed, watch } from 'vue';

// Auth State
const token = ref(localStorage.getItem('token') || '');
const username = ref(localStorage.getItem('username') || '');
const isAuthenticated = computed(() => !!token.value);

// Auth Form
const authTab = ref('login'); // login | register
const authUsername = ref('');
const authPassword = ref('');
const authConfirmPassword = ref('');
const authLoading = ref(false);

// App Navigation Tabs
const activeTab = ref('dashboard'); // dashboard | shopping | config
const selectedMonth = ref(''); // YYYY-MM
const transactions = ref([]);
const shoppingItems = ref([]);
const toasts = ref([]);
const importLoading = ref(false);

// Form states - Transactions
const transId = ref(null);
const transDesc = ref('');
const transAmount = ref('');
const transType = ref('card'); // income, fixed, card, variable
const transCardName = ref('');
const transInfo = ref('');
const isEditingTrans = ref(false);

// Form states - Shopping List
const shopId = ref(null);
const shopName = ref('');
const shopLink = ref('');
const shopPrice = ref('');
const isEditingShop = ref(false);

// Drag and drop state
const draggedItem = ref(null);
const dragOverItem = ref(null);

// Collapsible Credit Cards State
const openedCards = ref({});

// API URL Resolution
const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5001' 
    : window.location.origin);

// Toast helper
const showToast = (message, type = 'success') => {
  const id = Date.now();
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
};

// Formatting helpers
const formatCurrency = (value) => {
  if (value === undefined || value === null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const getMonthYearString = (ym) => {
  if (!ym) return '';
  const [year, month] = ym.split('-');
  return `${month}/${year}`;
};

// Helper to get previous month in YYYY-MM format
const getPreviousMonth = (ym) => {
  if (!ym) return '';
  const [year, month] = ym.split('-').map(Number);
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
};

// Scoped headers helper
const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token.value}`
  };
};

// Fetch data on mount
onMounted(() => {
  // Initialize current month
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  selectedMonth.value = `${year}-${month}`;
  
  if (isAuthenticated.value) {
    initDashboard();
  }
});

// Watch month change to reload transactions
watch(selectedMonth, () => {
  if (isAuthenticated.value) {
    fetchTransactions();
  }
});

const initDashboard = () => {
  fetchTransactions();
  fetchShoppingItems();
};

// ==========================================
// API - Authentication
// ==========================================
const handleAuth = async () => {
  if (!authUsername.value || !authPassword.value) {
    showToast('Por favor, preencha todos os campos.', 'error');
    return;
  }

  if (authTab.value === 'register' && authPassword.value !== authConfirmPassword.value) {
    showToast('As senhas não coincidem.', 'error');
    return;
  }

  authLoading.value = true;
  const endpoint = authTab.value === 'login' ? '/api/auth/login' : '/api/auth/register';
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: authUsername.value,
        password: authPassword.value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro na autenticação');

    // Save tokens
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    token.value = data.token;
    username.value = data.username;

    showToast(authTab.value === 'login' ? 'Bem-vindo de volta!' : 'Conta criada com sucesso!');
    
    // Clear forms
    authUsername.value = '';
    authPassword.value = '';
    authConfirmPassword.value = '';
    
    initDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    authLoading.value = false;
  }
};

const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  token.value = '';
  username.value = '';
  transactions.value = [];
  shoppingItems.value = [];
  activeTab.value = 'dashboard';
  showToast('Sessão encerrada com sucesso.', 'info');
};

// ==========================================
// API - Transactions
// ==========================================
const fetchTransactions = async () => {
  try {
    const formattedMonth = getMonthYearString(selectedMonth.value);
    const urlMonth = formattedMonth.replace('/', '-');
    const res = await fetch(`${API_URL}/api/finances/${urlMonth}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        handleLogout();
        throw new Error('Sua sessão expirou.');
      }
      throw new Error('Falha ao buscar lançamentos');
    }
    transactions.value = await res.json();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const importFixedExpenses = async () => {
  const prevMonthYM = getPreviousMonth(selectedMonth.value);
  if (!prevMonthYM) return;

  const formattedPrevMonth = getMonthYearString(prevMonthYM);
  const urlMonth = formattedPrevMonth.replace('/', '-');

  try {
    importLoading.value = true;
    
    // 1. Fetch previous month transactions
    const res = await fetch(`${API_URL}/api/finances/${urlMonth}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Não foi possível buscar os lançamentos do mês anterior');

    const prevTransactions = await res.json();
    
    // 2. Filter for fixed expenses
    const fixedExpenses = prevTransactions.filter(t => t.type === 'fixed');
    
    if (fixedExpenses.length === 0) {
      showToast('Nenhum gasto fixo encontrado no mês anterior para importar.', 'info');
      return;
    }

    // 3. Confirm with user
    if (!confirm(`Deseja importar ${fixedExpenses.length} gastos fixos de ${formattedPrevMonth} para o mês atual?`)) {
      return;
    }

    // 4. Send POST requests sequentially for each fixed expense
    let successCount = 0;
    for (const expense of fixedExpenses) {
      const payload = {
        description: expense.description,
        amount: expense.amount,
        type: 'fixed',
        cardName: '',
        month: getMonthYearString(selectedMonth.value),
        info: expense.info || ''
      };

      const postRes = await fetch(`${API_URL}/api/finances`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (postRes.ok) {
        successCount++;
      }
    }

    if (successCount > 0) {
      showToast(`${successCount} gastos fixos importados com sucesso!`);
      fetchTransactions();
    } else {
      throw new Error('Falha ao importar os gastos fixos');
    }

  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    importLoading.value = false;
  }
};

const saveTransaction = async () => {
  if (!transDesc.value || !transAmount.value) {
    showToast('Por favor, preencha a descrição e o valor.', 'error');
    return;
  }

  const payload = {
    description: transDesc.value,
    amount: parseFloat(transAmount.value),
    type: transType.value,
    cardName: transType.value === 'card' ? transCardName.value.trim() : '',
    month: getMonthYearString(selectedMonth.value),
    info: transInfo.value
  };

  try {
    let res;
    if (isEditingTrans.value && transId.value) {
      res = await fetch(`${API_URL}/api/finances/${transId.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_URL}/api/finances`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Erro ao salvar transação');
    }

    showToast(isEditingTrans.value ? 'Lançamento atualizado!' : 'Lançamento adicionado com sucesso!');
    resetTransForm();
    fetchTransactions();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const editTransaction = (t) => {
  transId.value = t._id;
  transDesc.value = t.description;
  transAmount.value = t.amount;
  transType.value = t.type;
  transCardName.value = t.cardName || '';
  transInfo.value = t.info || '';
  isEditingTrans.value = true;
};

const deleteTransaction = async (id) => {
  if (!confirm('Deseja realmente excluir este lançamento?')) return;
  try {
    const res = await fetch(`${API_URL}/api/finances/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao deletar lançamento');
    showToast('Lançamento excluído com sucesso.');
    fetchTransactions();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const resetTransForm = () => {
  transId.value = null;
  transDesc.value = '';
  transAmount.value = '';
  transType.value = 'card';
  transCardName.value = '';
  transInfo.value = '';
  isEditingTrans.value = false;
};

// ==========================================
// API - Shopping List
// ==========================================
const fetchShoppingItems = async () => {
  try {
    const res = await fetch(`${API_URL}/api/shopping`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar lista de compras');
    shoppingItems.value = await res.json();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const saveShoppingItem = async () => {
  if (!shopName.value) {
    showToast('Por favor, insira o nome do item.', 'error');
    return;
  }

  const payload = {
    name: shopName.value,
    link: shopLink.value,
    price: shopPrice.value ? parseFloat(shopPrice.value) : 0
  };

  try {
    let res;
    if (isEditingShop.value && shopId.value) {
      res = await fetch(`${API_URL}/api/shopping/${shopId.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_URL}/api/shopping`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) throw new Error('Erro ao salvar item de compras');
    showToast(isEditingShop.value ? 'Item de compras atualizado!' : 'Item adicionado à lista!');
    resetShopForm();
    fetchShoppingItems();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const editShoppingItem = (item) => {
  shopId.value = item._id;
  shopName.value = item.name;
  shopLink.value = item.link || '';
  shopPrice.value = item.price || '';
  isEditingShop.value = true;
};

const deleteShoppingItem = async (id) => {
  if (!confirm('Deseja realmente excluir este item da lista?')) return;
  try {
    const res = await fetch(`${API_URL}/api/shopping/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao excluir item');
    showToast('Item excluído da lista de compras.');
    fetchShoppingItems();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const resetShopForm = () => {
  shopId.value = null;
  shopName.value = '';
  shopLink.value = '';
  shopPrice.value = '';
  isEditingShop.value = false;
};

// ==========================================
// DRAG AND DROP & SORTING
// ==========================================
const onDragStart = (item, event) => {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item._id);
  draggedItem.value = item;
};

const onDragOver = (item, event) => {
  if (draggedItem.value && draggedItem.value._id !== item._id) {
    dragOverItem.value = item;
  }
};

const onDrop = async (targetItem, event) => {
  if (!draggedItem.value || draggedItem.value._id === targetItem._id) return;
  
  const fromIndex = shoppingItems.value.findIndex(i => i._id === draggedItem.value._id);
  const toIndex = shoppingItems.value.findIndex(i => i._id === targetItem._id);
  
  if (fromIndex !== -1 && toIndex !== -1) {
    const [removed] = shoppingItems.value.splice(fromIndex, 1);
    shoppingItems.value.splice(toIndex, 0, removed);
    
    shoppingItems.value.forEach((item, index) => {
      item.order = index;
    });
    
    try {
      const ids = shoppingItems.value.map(i => i._id);
      const res = await fetch(`${API_URL}/api/shopping/reorder`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error();
      showToast('Ordem de relevância atualizada.');
    } catch (error) {
      showToast('Erro ao salvar relevância.', 'error');
    }
  }
  
  draggedItem.value = null;
  dragOverItem.value = null;
};

const onDragEnd = () => {
  draggedItem.value = null;
  dragOverItem.value = null;
};

const moveItem = async (index, direction) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= shoppingItems.value.length) return;
  
  const temp = shoppingItems.value[index];
  shoppingItems.value[index] = shoppingItems.value[newIndex];
  shoppingItems.value[newIndex] = temp;
  
  shoppingItems.value.forEach((item, idx) => {
    item.order = idx;
  });
  
  try {
    const ids = shoppingItems.value.map(i => i._id);
    const res = await fetch(`${API_URL}/api/shopping/reorder`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids })
    });
    if (!res.ok) throw new Error();
    showToast('Relevância alterada com sucesso.');
  } catch (error) {
    showToast('Erro ao salvar relevância.', 'error');
  }
};

// ==========================================
// CALCULATIONS & COMPUTED PROPERTIES
// ==========================================
const transIncomes = computed(() => transactions.value.filter(t => t.type === 'income'));
const transCards = computed(() => transactions.value.filter(t => t.type === 'card'));
const transFixeds = computed(() => transactions.value.filter(t => t.type === 'fixed'));
const transVariables = computed(() => transactions.value.filter(t => t.type === 'variable'));

const totalIncomes = computed(() => transIncomes.value.reduce((sum, t) => sum + t.amount, 0));
const totalCards = computed(() => transCards.value.reduce((sum, t) => sum + t.amount, 0));
const totalFixeds = computed(() => transFixeds.value.reduce((sum, t) => sum + t.amount, 0));
const totalVariables = computed(() => transVariables.value.reduce((sum, t) => sum + t.amount, 0));

// Calculations matching the user's spreadsheet structure
const totalExpenses = computed(() => totalCards.value + totalVariables.value);
const netIncome = computed(() => totalIncomes.value - totalExpenses.value);
const netPostFixed = computed(() => netIncome.value - totalFixeds.value);

// Shopping list total
const totalShoppingPrice = computed(() => shoppingItems.value.reduce((sum, item) => sum + (item.price || 0), 0));

// Datalist for Credit Card names autocomplete
const uniqueCardNames = computed(() => {
  const cards = transactions.value
    .filter(t => t.type === 'card' && t.cardName)
    .map(t => t.cardName.trim());
  return [...new Set(cards)];
});

// Credit Card Grouping & Details Accordion
const cardsBreakdown = computed(() => {
  const groups = {};
  transCards.value.forEach(t => {
    // Fallback to description if cardName is legacy/empty
    const card = t.cardName && t.cardName.trim() ? t.cardName.trim() : (t.description || 'Geral');
    if (!groups[card]) {
      groups[card] = {
        name: card,
        total: 0,
        transactions: []
      };
    }
    groups[card].total += t.amount;
    groups[card].transactions.push(t);
  });
  return Object.values(groups).sort((a, b) => b.total - a.total);
});

const getCardUsagePercentage = (cardTotal) => {
  if (totalCards.value === 0) return 0;
  return (cardTotal / totalCards.value) * 100;
};

const toggleCardAccordion = (cardName) => {
  openedCards.value[cardName] = !openedCards.value[cardName];
};

// Annual Evolution Setup
const evolutionData = ref([]);

const maxMonthValue = computed(() => {
  let max = 100;
  evolutionData.value.forEach(d => {
    const totalExp = d.card + d.variable + d.fixed;
    const val = Math.max(d.income, totalExp);
    if (val > max) max = val;
  });
  return max;
});

const fetchEvolutionData = async () => {
  try {
    const res = await fetch(`${API_URL}/api/finances/summary/evolution`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar histórico de evolução');
    evolutionData.value = await res.json();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

watch(activeTab, (newTab) => {
  if (newTab === 'evolution' && isAuthenticated.value) {
    fetchEvolutionData();
  }
});

// Clipboard copy helper
const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  showToast('Código copiado para a área de transferência!', 'info');
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
        <!-- User profile badge (only if authenticated) -->
        <nav v-if="isAuthenticated" class="nav-tabs">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'dashboard' }" 
            @click="activeTab = 'dashboard'"
          >
            <i class="fa-solid fa-house-laptop"></i> Painel
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'evolution' }" 
            @click="activeTab = 'evolution'"
          >
            <i class="fa-solid fa-chart-line"></i> Evolução Anual
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'shopping' }" 
            @click="activeTab = 'shopping'"
          >
            <i class="fa-solid fa-cart-shopping"></i> Lista de Compras
          </button>
        </nav>

        <div v-if="isAuthenticated" class="user-profile-badge">
          <span><i class="fa-solid fa-circle-user" style="color: var(--color-primary);"></i> <strong>{{ username }}</strong></span>
          <button class="btn-logout" @click="handleLogout" title="Sair do Sistema">
            <i class="fa-solid fa-right-from-bracket"></i> Sair
          </button>
        </div>
      </div>
    </header>

    <!-- AUTHENTICATION SCREEN -->
    <div v-if="!isAuthenticated" class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <i class="fa-solid fa-wallet" style="font-size: 3rem; background: linear-gradient(135deg, var(--color-primary), #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 2px 10px rgba(99,102,241,0.3));"></i>
          <h2 style="font-family: var(--font-heading); font-size: 1.6rem; margin-top: 1rem; font-weight: 800;">Controle de Finanças</h2>
        </div>

        <!-- Auth Tabs -->
        <div class="auth-tabs">
          <button class="auth-tab" :class="{ active: authTab === 'login' }" @click="authTab = 'login'">Entrar</button>
          <button class="auth-tab" :class="{ active: authTab === 'register' }" @click="authTab = 'register'">Criar Conta</button>
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

    <!-- MAIN APP SCREEN (IF AUTHENTICATED) -->
    <div v-else>
      <!-- Month Picker -->
      <div v-if="activeTab === 'dashboard'" class="filter-bar">
        <div class="month-picker-container">
          <span class="month-picker-label"><i class="fa-solid fa-calendar-days"></i> Competência:</span>
          <input 
            type="month" 
            v-model="selectedMonth" 
            class="month-input"
          />
          <button class="btn-today" @click="selectedMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`">
            Mês Atual
          </button>
          <button 
            v-if="transFixeds.length === 0" 
            class="btn-today animate-pulse" 
            @click="importFixedExpenses" 
            :disabled="importLoading"
            style="margin-left: 0.5rem; background: linear-gradient(135deg, var(--color-primary), #a855f7); color: white; border: none; font-weight: 600;"
          >
            <span v-if="importLoading"><i class="fa-solid fa-spinner fa-spin"></i> Importando...</span>
            <span v-else><i class="fa-solid fa-cloud-arrow-down"></i> Importar Fixos</span>
          </button>
        </div>
        <div>
          <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
            Período: <strong style="color: var(--text-primary);">{{ getMonthYearString(selectedMonth) }}</strong>
          </span>
        </div>
      </div>

      <!-- MAIN TABS -->
      <main>
        <!-- TAB 1: FINANCIAL DASHBOARD -->
        <div v-if="activeTab === 'dashboard'">
          <!-- Top KPI Grid -->
          <div class="summary-grid">
            <div class="summary-card card-income">
              <span class="card-icon"><i class="fa-solid fa-circle-arrow-up"></i></span>
              <div class="card-title">Receita Total</div>
              <div class="card-value text-success">{{ formatCurrency(totalIncomes) }}</div>
              <div class="card-sub-calc">Entradas no mês</div>
            </div>
            
            <div class="summary-card card-card">
              <span class="card-icon"><i class="fa-solid fa-credit-card"></i></span>
              <div class="card-title">Gastos com Cartões</div>
              <div class="card-value text-danger">{{ formatCurrency(totalCards) }}</div>
              <div class="card-sub-calc">Dividido por cartão abaixo</div>
            </div>

            <div class="summary-card card-fixed">
              <span class="card-icon"><i class="fa-solid fa-house-lock"></i></span>
              <div class="card-title">Gastos Fixos</div>
              <div class="card-value text-warning">{{ formatCurrency(totalFixeds) }}</div>
              <div class="card-sub-calc">Assinaturas, Financiamentos, etc</div>
            </div>

            <div class="summary-card card-variable">
              <span class="card-icon"><i class="fa-solid fa-basket-shopping"></i></span>
              <div class="card-title">Outros Gastos</div>
              <div class="card-value text-info">{{ formatCurrency(totalVariables) }}</div>
              <div class="card-sub-calc">Empréstimos,Pgto Pessoas, etc</div>
            </div>

            <div class="summary-card card-net">
              <span class="card-icon"><i class="fa-solid fa-scale-balanced"></i></span>
              <div class="card-title" style="color: var(--color-primary);">Resultado Líquido</div>
              <div class="card-value" :class="netPostFixed >= 0 ? 'text-success' : 'text-danger'">
                {{ formatCurrency(netPostFixed) }}
              </div>
              <div class="card-sub-calc">
                <span>Líquido Inicial:</span>
                <span class="sub-calc-val">{{ formatCurrency(netIncome) }}</span>
              </div>
            </div>
          </div>

          <!-- CREDIT CARDS BREAKDOWN SECTION -->
          <section v-if="cardsBreakdown.length > 0" class="card-breakdown-section">
            <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; color: var(--text-primary);">
              <i class="fa-solid fa-credit-card" style="color: var(--color-danger);"></i>
              Detalhamento por Cartão de Crédito
            </h3>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">Gasto detalhado de cada cartão no mês selecionado. Clique sobre o cartão para ver a lista de compras.</p>
            
            <div class="cards-container">
              <div v-for="card in cardsBreakdown" :key="card.name" class="credit-card-panel">
                <!-- Accordion Header -->
                <div class="cc-header" @click="toggleCardAccordion(card.name)">
                  <div class="cc-title">
                    <i class="fa-solid fa-wallet" style="color: var(--color-primary); font-size: 0.85rem;"></i>
                    <span>{{ card.name }}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span class="cc-total">{{ formatCurrency(card.total) }}</span>
                    <i class="fa-solid fa-chevron-down cc-chevron" :class="{ open: openedCards[card.name] }"></i>
                  </div>
                </div>

                <!-- Custom Progress Bar (relative to total card expenses) -->
                <div class="cc-progress-bar-container">
                  <div class="cc-progress-bar" :style="{ width: getCardUsagePercentage(card.total) + '%' }"></div>
                </div>

                <!-- Accordion Collapsible Detail list -->
                <div v-if="openedCards[card.name]" class="cc-details custom-scroll">
                  <div v-for="item in card.transactions" :key="item._id" class="cc-detail-item">
                    <div style="display: flex; flex-direction: column; gap: 0.1rem;">
                      <span class="cc-detail-desc">{{ item.description }}</span>
                      <span v-if="item.info" style="font-size: 0.65rem; color: var(--text-muted); font-style: italic;">{{ item.info }}</span>
                    </div>
                    <span class="cc-detail-val">{{ formatCurrency(item.amount) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Dashboard Split Layout -->
          <div class="dashboard-grid">
            <!-- Form Side -->
            <aside class="form-card">
              <h3 class="section-title">
                <i class="fa-solid" :class="isEditingTrans ? 'fa-pen-to-square' : 'fa-circle-plus'"></i>
                {{ isEditingTrans ? 'Editar Lançamento' : 'Novo Lançamento' }}
              </h3>
              
              <form @submit.prevent="saveTransaction">
                <div class="form-group">
                  <label class="form-label">Descrição</label>
                  <input 
                    type="text" 
                    v-model="transDesc" 
                    placeholder="Ex: Combustível, MEI, Supermercado" 
                    class="form-input"
                    required
                  />
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label">Valor (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      v-model="transAmount" 
                      placeholder="0,00" 
                      class="form-input"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select v-model="transType" class="form-select">
                      <option value="card">Cartão de Crédito (-)</option>
                      <option value="income">Receita (+)</option>
                      <option value="fixed">Gasto Fixo (-)</option>
                      <option value="variable">Outros Gastos (-)</option>
                    </select>
                  </div>
                </div>

                <!-- Custom Credit Card selection (Only if type === 'card') -->
                <div v-if="transType === 'card'" class="form-group">
                  <label class="form-label">Qual Cartão de Crédito?</label>
                  <input 
                    type="text" 
                    v-model="transCardName" 
                    placeholder="Ex: Santander, Mercado Pago" 
                    class="form-input"
                    list="card-names-list"
                  />
                  <!-- HTML5 native autocomplete based on previous items -->
                  <datalist id="card-names-list">
                    <option v-for="card in uniqueCardNames" :value="card" :key="card" />
                  </datalist>
                </div>

                <div class="form-group">
                  <label class="form-label">Observação / Vencimento</label>
                  <input 
                    type="text" 
                    v-model="transInfo" 
                    placeholder="Ex: Todo dia 09, 1x, etc." 
                    class="form-input"
                  />
                </div>

                <div class="btn-group-row">
                  <button type="submit" class="btn btn-primary">
                    <i class="fa-solid fa-check"></i> Salvar Lançamento
                  </button>
                  <button 
                    v-if="isEditingTrans" 
                    type="button" 
                    class="btn btn-secondary" 
                    @click="resetTransForm"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </aside>

            <!-- Lists Grid Side -->
            <div class="transactions-container">
              <div class="transactions-card">
                <div class="card-header-actions">
                  <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fa-solid fa-list-check"></i> Distribuição dos Lançamentos
                  </h3>
                  <span class="month-picker-label">Total Geral: {{ formatCurrency(totalIncomes - totalCards - totalFixeds - totalVariables) }}</span>
                </div>
                
                <div class="category-columns-grid">
                  <!-- 1. Receitas -->
                  <div class="category-column">
                    <div class="column-header income">
                      <span>Receitas</span>
                      <span class="column-sum">{{ formatCurrency(totalIncomes) }}</span>
                    </div>
                    <div class="transaction-list-items">
                      <div v-for="t in transIncomes" :key="t._id" class="transaction-item">
                        <div class="item-main-row">
                          <span class="item-desc">{{ t.description }}</span>
                          <span class="item-val text-success">{{ formatCurrency(t.amount) }}</span>
                        </div>
                        <div class="item-details-row">
                          <span class="item-obs">{{ t.info }}</span>
                          <div class="item-actions">
                            <button class="action-btn btn-edit" @click="editTransaction(t)"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn btn-delete" @click="deleteTransaction(t._id)"><i class="fa-solid fa-trash"></i></button>
                          </div>
                        </div>
                      </div>
                      <div v-if="transIncomes.length === 0" class="empty-state">Sem receitas</div>
                    </div>
                  </div>

                  <!-- 2. Cartões -->
                  <div class="category-column">
                    <div class="column-header card">
                      <span>Cartões</span>
                      <span class="column-sum">{{ formatCurrency(totalCards) }}</span>
                    </div>
                    <div class="transaction-list-items">
                      <div v-for="t in transCards" :key="t._id" class="transaction-item">
                        <div class="item-main-row">
                          <span class="item-desc">{{ t.description }}</span>
                          <span class="item-val text-danger">{{ formatCurrency(t.amount) }}</span>
                        </div>
                        <div class="item-details-row" style="margin-top: 0.15rem;">
                          <span class="item-obs" style="font-weight: 700; color: var(--color-danger); opacity: 0.85;">
                            💳 {{ t.cardName || 'Geral' }}
                          </span>
                        </div>
                        <div class="item-details-row">
                          <span class="item-obs">{{ t.info }}</span>
                          <div class="item-actions">
                            <button class="action-btn btn-edit" @click="editTransaction(t)"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn btn-delete" @click="deleteTransaction(t._id)"><i class="fa-solid fa-trash"></i></button>
                          </div>
                        </div>
                      </div>
                      <div v-if="transCards.length === 0" class="empty-state">Sem cartões</div>
                    </div>
                  </div>

                  <!-- 3. Gastos Fixos -->
                  <div class="category-column">
                    <div class="column-header fixed">
                      <span>Fixos</span>
                      <span class="column-sum">{{ formatCurrency(totalFixeds) }}</span>
                    </div>
                    <div class="transaction-list-items">
                      <div v-for="t in transFixeds" :key="t._id" class="transaction-item">
                        <div class="item-main-row">
                          <span class="item-desc">{{ t.description }}</span>
                          <span class="item-val text-warning">{{ formatCurrency(t.amount) }}</span>
                        </div>
                        <div class="item-details-row">
                          <span class="item-obs">{{ t.info }}</span>
                          <div class="item-actions">
                            <button class="action-btn btn-edit" @click="editTransaction(t)"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn btn-delete" @click="deleteTransaction(t._id)"><i class="fa-solid fa-trash"></i></button>
                          </div>
                        </div>
                      </div>
                      <div v-if="transFixeds.length === 0" class="empty-state">Sem fixos</div>
                    </div>
                  </div>

                  <!-- 4. Outros/Variavel -->
                  <div class="category-column">
                    <div class="column-header variable">
                      <span>Outros</span>
                      <span class="column-sum">{{ formatCurrency(totalVariables) }}</span>
                    </div>
                    <div class="transaction-list-items">
                      <div v-for="t in transVariables" :key="t._id" class="transaction-item">
                        <div class="item-main-row">
                          <span class="item-desc">{{ t.description }}</span>
                          <span class="item-val text-info">{{ formatCurrency(t.amount) }}</span>
                        </div>
                        <div class="item-details-row">
                          <span class="item-obs">{{ t.info }}</span>
                          <div class="item-actions">
                            <button class="action-btn btn-edit" @click="editTransaction(t)"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn btn-delete" @click="deleteTransaction(t._id)"><i class="fa-solid fa-trash"></i></button>
                          </div>
                        </div>
                      </div>
                      <div v-if="transVariables.length === 0" class="empty-state">Sem outros</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB: ANNUAL EVOLUTION -->
        <div v-if="activeTab === 'evolution'" class="evolution-container">
          <div class="chart-card">
            <div class="chart-header">
              <div>
                <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); margin: 0;">
                  <i class="fa-solid fa-chart-simple" style="color: var(--color-primary);"></i>
                  Evolução Financeira (Últimos 12 Meses)
                </h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; margin-bottom: 0;">
                  Comparativo mensal entre Receitas e Gastos Totais (Cartão + Fixo + Outros)
                </p>
              </div>
              
              <div class="chart-legend">
                <div class="legend-item">
                  <div class="legend-color income"></div>
                  <span>Receitas</span>
                </div>
                <div class="legend-item">
                  <div class="legend-color expense"></div>
                  <span>Gastos Totais</span>
                </div>
              </div>
            </div>
            
            <!-- Custom Flexbox Bar Chart -->
            <div class="bar-chart-outer">
              <!-- Y-Axis Grid Lines -->
              <div class="bar-chart-grid">
                <div class="grid-line"><span class="grid-label">{{ formatCurrency(maxMonthValue) }}</span></div>
                <div class="grid-line"><span class="grid-label">{{ formatCurrency(maxMonthValue * 0.75) }}</span></div>
                <div class="grid-line"><span class="grid-label">{{ formatCurrency(maxMonthValue * 0.5) }}</span></div>
                <div class="grid-line"><span class="grid-label">{{ formatCurrency(maxMonthValue * 0.25) }}</span></div>
                <div class="grid-line"><span class="grid-label">R$ 0,00</span></div>
              </div>
              
              <!-- Bars Content -->
              <div class="bar-chart-content">
                <div v-for="m in evolutionData" :key="m.sortKey" class="bar-chart-month-group">
                  <div class="bars-wrapper">
                    <!-- Income Bar -->
                    <div 
                      class="bar-item income" 
                      :style="{ height: maxMonthValue ? ((m.income / maxMonthValue) * 100) + '%' : '0%' }"
                    >
                      <span class="bar-tooltip">
                        <strong>Receita:</strong> {{ formatCurrency(m.income) }}
                      </span>
                    </div>
                    
                    <!-- Expense Bar -->
                    <div 
                      class="bar-item expense" 
                      :style="{ height: maxMonthValue ? (((m.card + m.fixed + m.variable) / maxMonthValue) * 100) + '%' : '0%' }"
                    >
                      <span class="bar-tooltip">
                        <strong>Gastos:</strong> {{ formatCurrency(m.card + m.fixed + m.variable) }}
                        <br/>
                        <span style="font-size: 0.65rem; color: var(--text-muted);">
                          Cartão: {{ formatCurrency(m.card) }} | Fixo: {{ formatCurrency(m.fixed) }} | Outros: {{ formatCurrency(m.variable) }}
                        </span>
                      </span>
                    </div>
                  </div>
                  <span class="month-bar-label">{{ m.monthLabel }}</span>
                </div>
                
                <div v-if="evolutionData.length === 0" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.9rem;">
                  <i class="fa-solid fa-folder-open" style="margin-right: 0.5rem;"></i> Nenhuma informação financeira encontrada para gerar o gráfico.
                </div>
              </div>
            </div>
          </div>
          
          <!-- Detailed History Table -->
          <div class="transactions-card">
            <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem;">
              <i class="fa-solid fa-table-list" style="color: var(--color-primary);"></i>
              Tabela de Histórico Detalhado
            </h3>
            
            <div class="evolution-table-container custom-scroll">
              <table class="evolution-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Receitas (+)</th>
                    <th>Cartão (-)</th>
                    <th>Fixo (-)</th>
                    <th>Outros (-)</th>
                    <th>Total Gastos</th>
                    <th>Resultado Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="m in evolutionData" :key="m.sortKey">
                    <td style="font-weight: 700;">{{ m.monthLabel }}</td>
                    <td class="text-success" style="font-weight: 600;">{{ formatCurrency(m.income) }}</td>
                    <td class="text-danger">{{ formatCurrency(m.card) }}</td>
                    <td class="text-warning">{{ formatCurrency(m.fixed) }}</td>
                    <td class="text-info">{{ formatCurrency(m.variable) }}</td>
                    <td style="font-weight: 600;">{{ formatCurrency(m.card + m.fixed + m.variable) }}</td>
                    <td>
                      <span :class="(m.income - (m.card + m.fixed + m.variable)) >= 0 ? 'badge-surplus' : 'badge-deficit'">
                        {{ formatCurrency(m.income - (m.card + m.fixed + m.variable)) }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="evolutionData.length === 0">
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                      Ainda não há lançamentos cadastrados em nenhum mês.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB 2: SHOPPING LIST -->
        <div v-if="activeTab === 'shopping'">
          <div class="shopping-grid">
            <!-- Form and Summary -->
            <div>
              <div class="form-card">
                <h3 class="section-title">
                  <i class="fa-solid" :class="isEditingShop ? 'fa-pen-to-square' : 'fa-cart-plus'"></i>
                  {{ isEditingShop ? 'Editar Item de Compra' : 'Adicionar Desejo' }}
                </h3>
                
                <form @submit.prevent="saveShoppingItem">
                  <div class="form-group">
                    <label class="form-label">O que você quer?</label>
                    <input 
                      type="text" 
                      v-model="shopName" 
                      placeholder="Ex: Teclado Mecânico, Livro de Go" 
                      class="form-input"
                      required
                    />
                  </div>
                  
                  <div class="form-group">
                    <label class="form-label">Link do Item (URL)</label>
                    <input 
                      type="url" 
                      v-model="shopLink" 
                      placeholder="https://exemplo.com/produto" 
                      class="form-input"
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Preço Estimado (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      v-model="shopPrice" 
                      placeholder="0,00 (opcional)" 
                      class="form-input"
                    />
                  </div>

                  <div class="btn-group-row">
                    <button type="submit" class="btn btn-primary">
                      <i class="fa-solid fa-check"></i> Salvar na Lista
                    </button>
                    <button 
                      v-if="isEditingShop" 
                      type="button" 
                      class="btn btn-secondary" 
                      @click="resetShopForm"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>

              <!-- Total Shopping Price display -->
              <div class="shopping-summary-card">
                <div>
                  <span class="shopping-summary-title">Orçamento Total da Lista</span>
                  <p style="font-size: 0.75rem; color: var(--text-muted);">Itens organizados por ordem de prioridade</p>
                </div>
                <div class="shopping-summary-total">{{ formatCurrency(totalShoppingPrice) }}</div>
              </div>
            </div>

            <!-- Shopping List drag/drop interface -->
            <div class="transactions-card">
              <div class="card-header-actions">
                <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                  <i class="fa-solid fa-ranking-star"></i> Lista de Desejos por Relevância
                </h3>
                <span class="month-picker-label">{{ shoppingItems.length }} {{ shoppingItems.length === 1 ? 'item' : 'itens' }}</span>
              </div>
              
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.4rem;">
                <i class="fa-solid fa-circle-info" style="color: var(--color-primary);"></i>
                Arraste os itens pelo ícone <i class="fa-solid fa-grip-vertical"></i> para reordenar por relevância, ou use as setas.
              </p>

              <div class="shopping-list-container">
                <div 
                  v-for="(item, index) in shoppingItems" 
                  :key="item._id"
                  class="shopping-item-card"
                  :class="{ 
                    dragging: draggedItem && draggedItem._id === item._id,
                    'drag-over': dragOverItem && dragOverItem._id === item._id
                  }"
                  draggable="true"
                  @dragstart="onDragStart(item, $event)"
                  @dragover.prevent="onDragOver(item, $event)"
                  @drop="onDrop(item, $event)"
                  @dragend="onDragEnd"
                >
                  <!-- Drag Handle -->
                  <div class="drag-handle">
                    <i class="fa-solid fa-grip-vertical"></i>
                  </div>

                  <!-- Up/Down arrows for reordering (accessibility / mobile backup) -->
                  <div class="relevance-controls">
                    <button 
                      type="button" 
                      class="relevance-btn" 
                      @click="moveItem(index, -1)" 
                      :disabled="index === 0"
                      title="Mover para Cima"
                    >
                      <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button 
                      type="button" 
                      class="relevance-btn" 
                      @click="moveItem(index, 1)" 
                      :disabled="index === shoppingItems.length - 1"
                      title="Mover para Baixo"
                    >
                      <i class="fa-solid fa-chevron-down"></i>
                    </button>
                  </div>

                  <!-- Content info -->
                  <div class="shopping-item-info">
                    <div class="shopping-item-details">
                      <span class="shopping-item-name">{{ item.name }}</span>
                      <a 
                        v-if="item.link" 
                        :href="item.link" 
                        target="_blank" 
                        class="shopping-item-link-badge"
                        rel="noopener noreferrer"
                      >
                        <i class="fa-solid fa-link"></i> Ver no Site
                      </a>
                    </div>
                    
                    <div class="shopping-item-price">
                      {{ item.price ? formatCurrency(item.price) : 'Sob Consulta' }}
                    </div>
                  </div>

                  <!-- Action buttons -->
                  <div class="shopping-actions">
                    <button class="action-btn btn-edit" @click="editShoppingItem(item)">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="action-btn btn-delete" @click="deleteShoppingItem(item._id)">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>

                <!-- Empty state -->
                <div v-if="shoppingItems.length === 0" class="empty-state">
                  <i class="fa-solid fa-cart-flatbed-suitcases" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
                  Sua lista de desejos está vazia. Adicione o que deseja comprar no formulário ao lado!
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- Toast Notifications container -->
    <div class="toast-container">
      <div 
        v-for="toast in toasts" 
        :key="toast.id" 
        class="toast" 
        :class="toast.type"
      >
        <i v-if="toast.type === 'success'" class="fa-solid fa-circle-check text-success"></i>
        <i v-else-if="toast.type === 'error'" class="fa-solid fa-circle-xmark text-danger"></i>
        <i v-else class="fa-solid fa-circle-info text-info"></i>
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>
