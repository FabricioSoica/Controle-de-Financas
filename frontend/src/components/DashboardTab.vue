<script setup>
import { ref, onMounted, computed, watch } from 'vue';

const props = defineProps({
  token: {
    type: String,
    required: true
  },
  apiUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['toast', 'unauthorized']);

// Transactions and Filters State
const transactions = ref([]);
const selectedMonth = ref(''); // YYYY-MM

// Form state
const transId = ref(null);
const transDesc = ref('');
const transAmount = ref('');
const transType = ref('card'); // income, fixed, card, variable
const transCardName = ref('');
const transInfo = ref('');
const transInstallments = ref(1);
const targetNetResult = ref(0);
const showGoalModal = ref(false);
const tempGoalValue = ref('');
const annualEvolution = ref([]);
const showCardConfig = ref(false);
const importLoading = ref(false);
const visibleCards = ref({
  income: true,
  card: true,
  fixed: true,
  variable: true,
  net: true,
  cumulative: true
});
const isEditingTrans = ref(false);

// Collapsible Credit Cards State
const openedCards = ref({});

// Headers helper
const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${props.token}`
  };
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

// Fetch data on mount
onMounted(() => {
  const stored = localStorage.getItem('financas_visible_cards');
  if (stored) {
    try {
      visibleCards.value = { ...visibleCards.value, ...JSON.parse(stored) };
    } catch (e) {
      console.error('Error loading card visibility preferences:', e);
    }
  }

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  selectedMonth.value = `${year}-${month}`;
  fetchTransactions();
  fetchMonthlyGoal();
  fetchAnnualEvolution();
});

// Watch month changes to reload transactions
watch(selectedMonth, () => {
  fetchTransactions();
});

watch(visibleCards, (newVal) => {
  localStorage.setItem('financas_visible_cards', JSON.stringify(newVal));
}, { deep: true });

const fetchMonthlyGoal = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/goal`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar meta');
    const data = await res.json();
    targetNetResult.value = data.targetNetResult || 0;
  } catch (error) {
    console.error(error.message);
  }
};

const fetchAnnualEvolution = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/summary/evolution`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar evolução anual');
    annualEvolution.value = await res.json();
  } catch (error) {
    console.error(error.message);
  }
};

const changeMonthlyGoal = () => {
  tempGoalValue.value = targetNetResult.value || '';
  showGoalModal.value = true;
};

const saveMonthlyGoal = async () => {
  const val = parseFloat(tempGoalValue.value);
  if (isNaN(val) || val < 0) {
    emit('toast', { message: 'Por favor, insira um valor válido maior ou igual a zero.', type: 'error' });
    return;
  }

  try {
    const res = await fetch(`${props.apiUrl}/api/finances/goal`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        targetNetResult: val
      })
    });
    if (!res.ok) throw new Error('Não foi possível salvar a meta');
    const data = await res.json();
    targetNetResult.value = data.targetNetResult;
    showGoalModal.value = false;
    emit('toast', { message: 'Meta de investimentos atualizada com sucesso!', type: 'success' });
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const exportToCSV = () => {
  if (transactions.value.length === 0) {
    emit('toast', { message: 'Não há lançamentos cadastrados neste mês para exportar.', type: 'info' });
    return;
  }

  const headers = ['Descrição', 'Valor (R$)', 'Tipo', 'Cartão', 'Observação', 'Data de Criação'];
  const rows = transactions.value.map(t => {
    let typePT = '';
    if (t.type === 'income') typePT = 'Receita';
    else if (t.type === 'card') typePT = 'Cartão';
    else if (t.type === 'fixed') typePT = 'Fixo';
    else if (t.type === 'variable') typePT = 'Variável';

    return [
      t.description,
      t.amount.toString().replace('.', ','),
      typePT,
      t.cardName || '',
      t.info || '',
      new Date(t.createdAt).toLocaleDateString('pt-BR')
    ];
  });

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const formattedMonth = getMonthYearString(selectedMonth.value).replace('/', '-');
  link.setAttribute('href', url);
  link.setAttribute('download', `Financas_${formattedMonth}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  emit('toast', { message: 'Planilha exportada com sucesso!', type: 'success' });
};

const goalPercentage = computed(() => {
  if (targetNetResult.value <= 0) return 0;
  if (netPostFixed.value <= 0) return 0;
  const pct = (netPostFixed.value / targetNetResult.value) * 100;
  return Math.round(pct);
});

const cumulativeYearNetResult = computed(() => {
  const currentYearStr = new Date().getFullYear().toString();
  return annualEvolution.value
    .filter(item => item.sortKey && item.sortKey.startsWith(currentYearStr))
    .reduce((sum, item) => {
      const netResult = item.income - (item.card + item.fixed + item.variable);
      return sum + netResult;
    }, 0);
});

// ==========================================
// API Operations
// ==========================================
const fetchTransactions = async () => {
  if (!props.token) return;
  try {
    const formattedMonth = getMonthYearString(selectedMonth.value);
    const urlMonth = formattedMonth.replace('/', '-');
    const res = await fetch(`${props.apiUrl}/api/finances/${urlMonth}`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        emit('unauthorized');
        throw new Error('Sua sessão expirou.');
      }
      throw new Error('Falha ao buscar lançamentos');
    }
    transactions.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const saveTransaction = async () => {
  if (!transDesc.value || !transAmount.value) {
    emit('toast', { message: 'Por favor, preencha a descrição e o valor.', type: 'error' });
    return;
  }

  if (transType.value === 'card' && !transCardName.value) {
    emit('toast', { message: 'Por favor, selecione ou digite o nome do cartão de crédito.', type: 'error' });
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

  if (transType.value === 'card' && transInstallments.value > 1) {
    payload.installments = parseInt(transInstallments.value, 10);
  }

  try {
    let res;
    if (isEditingTrans.value && transId.value) {
      res = await fetch(`${props.apiUrl}/api/finances/${transId.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${props.apiUrl}/api/finances`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Erro ao salvar transação');
    }

    emit('toast', { 
      message: isEditingTrans.value 
        ? 'Lançamento atualizado!' 
        : (transType.value === 'card' && transInstallments.value > 1 
            ? `Compra parcelada em ${transInstallments.value}x adicionada com sucesso!` 
            : 'Lançamento adicionado com sucesso!'),
      type: 'success' 
    });
    resetTransForm();
    fetchTransactions();
    fetchAnnualEvolution();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const editTransaction = (t) => {
  transId.value = t._id;
  transDesc.value = t.description;
  transAmount.value = t.amount;
  transType.value = t.type;
  transCardName.value = t.cardName || '';
  transInfo.value = t.info || '';
  transInstallments.value = 1;
  isEditingTrans.value = true;
};

const showDeleteModal = ref(false);
const transactionToDelete = ref(null);

const isInstallmentToDelete = computed(() => {
  const t = transactionToDelete.value;
  return t && t.type === 'card' && t.description.includes(' (');
});

const deleteTransaction = (t) => {
  transactionToDelete.value = t;
  showDeleteModal.value = true;
};

const executeDelete = async (id, deleteAll) => {
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/${id}?deleteAll=${deleteAll}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao deletar lançamento');
    emit('toast', { 
      message: deleteAll 
        ? 'Todas as parcelas foram excluídas com sucesso.' 
        : 'Lançamento excluído com sucesso.', 
      type: 'success' 
    });
    fetchTransactions();
    fetchAnnualEvolution();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const confirmDelete = (deleteAll) => {
  if (transactionToDelete.value) {
    executeDelete(transactionToDelete.value._id, deleteAll);
  }
  closeDeleteModal();
};

const closeDeleteModal = () => {
  showDeleteModal.value = false;
  transactionToDelete.value = null;
};

const resetTransForm = () => {
  transId.value = null;
  transDesc.value = '';
  transAmount.value = '';
  transType.value = 'card';
  transCardName.value = '';
  transInfo.value = '';
  transInstallments.value = 1;
  isEditingTrans.value = false;
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

const showImportModal = ref(false);
const prevMonthTransactions = ref([]);
const selectedImportIds = ref([]);

const groupedPrevTransactions = computed(() => {
  const groups = {
    income: { name: 'Receitas', icon: 'fa-circle-arrow-up', class: 'text-success', items: [] },
    card: { name: 'Cartões', icon: 'fa-credit-card', class: 'text-danger', items: [] },
    fixed: { name: 'Fixos', icon: 'fa-house-lock', class: 'text-warning', items: [] },
    variable: { name: 'Outros', icon: 'fa-basket-shopping', class: 'text-info', items: [] }
  };

  prevMonthTransactions.value.forEach(t => {
    if (groups[t.type]) {
      groups[t.type].items.push(t);
    } else {
      groups.variable.items.push(t);
    }
  });

  return Object.keys(groups)
    .filter(key => groups[key].items.length > 0)
    .reduce((obj, key) => {
      obj[key] = groups[key];
      return obj;
    }, {});
});

const isAllSelected = computed({
  get() {
    return prevMonthTransactions.value.length > 0 && selectedImportIds.value.length === prevMonthTransactions.value.length;
  },
  set(value) {
    if (value) {
      selectedImportIds.value = prevMonthTransactions.value.map(t => t._id);
    } else {
      selectedImportIds.value = [];
    }
  }
});

const isCategoryAllSelected = (categoryKey) => {
  const group = groupedPrevTransactions.value[categoryKey];
  if (!group || group.items.length === 0) return false;
  return group.items.every(t => selectedImportIds.value.includes(t._id));
};

const toggleCategorySelection = (categoryKey) => {
  const group = groupedPrevTransactions.value[categoryKey];
  if (!group) return;
  const itemIds = group.items.map(t => t._id);
  const allSelected = isCategoryAllSelected(categoryKey);

  if (allSelected) {
    selectedImportIds.value = selectedImportIds.value.filter(id => !itemIds.includes(id));
  } else {
    const newSelection = [...selectedImportIds.value];
    itemIds.forEach(id => {
      if (!newSelection.includes(id)) {
        newSelection.push(id);
      }
    });
    selectedImportIds.value = newSelection;
  }
};

const openImportModal = async () => {
  const prevMonthYM = getPreviousMonth(selectedMonth.value);
  if (!prevMonthYM) return;

  const formattedPrevMonth = getMonthYearString(prevMonthYM);
  const urlMonth = formattedPrevMonth.replace('/', '-');

  try {
    importLoading.value = true;
    const res = await fetch(`${props.apiUrl}/api/finances/${urlMonth}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Não foi possível buscar os lançamentos do mês anterior');

    const prevTransactions = await res.json();
    
    // Filter out credit card installments (which are already automatically created for subsequent months)
    const importableTransactions = prevTransactions.filter(t => !(t.type === 'card' && t.description.includes(' (')));
    
    if (importableTransactions.length === 0) {
      emit('toast', { message: 'Nenhum lançamento importável encontrado no mês anterior.', type: 'info' });
      return;
    }

    prevMonthTransactions.value = importableTransactions;
    selectedImportIds.value = importableTransactions.map(t => t._id);
    showImportModal.value = true;
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    importLoading.value = false;
  }
};

const executeImport = async () => {
  if (selectedImportIds.value.length === 0) {
    emit('toast', { message: 'Selecione pelo menos um lançamento para importar.', type: 'warning' });
    return;
  }

  try {
    importLoading.value = true;
    const transactionsToImport = prevMonthTransactions.value.filter(t => selectedImportIds.value.includes(t._id));
    
    let successCount = 0;
    for (const trans of transactionsToImport) {
      const payload = {
        description: trans.description,
        amount: trans.amount,
        type: trans.type,
        cardName: trans.type === 'card' ? trans.cardName || '' : '',
        month: getMonthYearString(selectedMonth.value),
        info: trans.info || ''
      };

      const postRes = await fetch(`${props.apiUrl}/api/finances`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });

      if (postRes.ok) {
        successCount++;
      }
    }

    if (successCount > 0) {
      emit('toast', { message: `${successCount} lançamentos importados com sucesso!`, type: 'success' });
      showImportModal.value = false;
      fetchTransactions();
      fetchAnnualEvolution();
    } else {
      throw new Error('Falha ao importar os lançamentos');
    }
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    importLoading.value = false;
  }
};

const toggleCardAccordion = (cardName) => {
  openedCards.value[cardName] = !openedCards.value[cardName];
};

// ==========================================
// Calculations and Computed Properties
// ==========================================
const transIncomes = computed(() => transactions.value.filter(t => t.type === 'income'));
const transCards = computed(() => transactions.value.filter(t => t.type === 'card'));
const transFixeds = computed(() => transactions.value.filter(t => t.type === 'fixed'));
const transVariables = computed(() => transactions.value.filter(t => t.type === 'variable'));

const totalIncomes = computed(() => transIncomes.value.reduce((sum, t) => sum + t.amount, 0));
const totalCards = computed(() => transCards.value.reduce((sum, t) => sum + t.amount, 0));
const totalFixeds = computed(() => transFixeds.value.reduce((sum, t) => sum + t.amount, 0));
const totalVariables = computed(() => transVariables.value.reduce((sum, t) => sum + t.amount, 0));

const totalExpenses = computed(() => totalCards.value + totalVariables.value);
const netIncome = computed(() => totalIncomes.value - totalExpenses.value);
const netPostFixed = computed(() => netIncome.value - totalFixeds.value);

// Autocomplete suggestions
const uniqueCardNames = computed(() => {
  const cards = transactions.value
    .filter(t => t.type === 'card' && t.cardName)
    .map(t => t.cardName.trim());
  return [...new Set(cards)];
});

// Credit Card Grouping & Accordion
const cardsBreakdown = computed(() => {
  const groups = {};
  transCards.value.forEach(t => {
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
</script>

<template>
  <div>
    <!-- Month Picker -->
    <div class="filter-bar" style="position: relative; z-index: 50;">
      <div class="month-picker-container">
        <span class="month-picker-label"><i class="fa-solid fa-calendar-days"></i> Competência:</span>
        <input 
          type="month" 
          v-model="selectedMonth" 
          class="month-input"
        />
        <button 
          class="btn-today" 
          @click="selectedMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`"
          type="button"
        >
          Mês Atual
        </button>
        <button 
          v-if="transFixeds.length === 0" 
          class="btn-today animate-pulse" 
          @click="openImportModal" 
          :disabled="importLoading"
          type="button"
          style="margin-left: 0.5rem; background: linear-gradient(135deg, var(--color-primary), #a855f7); color: white; border: none; font-weight: 600;"
        >
          <span v-if="importLoading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</span>
          <span v-else><i class="fa-solid fa-cloud-arrow-down"></i> Importar do Mês Anterior</span>
        </button>
        <button 
          class="btn-today" 
          @click="exportToCSV"
          type="button"
          style="display: flex; align-items: center; gap: 0.4rem;"
          title="Exportar lançamentos para planilha Excel"
        >
          <i class="fa-solid fa-file-excel" style="color: var(--color-success);"></i> Exportar Mês
        </button>

        <!-- Backdrop to close dropdown click-outside -->
        <div v-if="showCardConfig" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999; background: transparent;" @click="showCardConfig = false"></div>

        <!-- Card Configuration Dropdown Button -->
        <div style="position: relative; z-index: 1000;">
          <button 
            class="btn-today" 
            @click="showCardConfig = !showCardConfig"
            type="button"
            style="display: flex; align-items: center; gap: 0.4rem;"
            title="Configurar visibilidade dos cards"
          >
            <i class="fa-solid fa-sliders"></i> Cards
          </button>
          
          <div v-if="showCardConfig" class="card-config-dropdown">
            <div class="card-config-header">Exibição de Cards</div>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.income" /> Receita Total
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.card" /> Gastos Cartão
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.fixed" /> Gastos Fixos
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.variable" /> Outros Gastos
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.net" /> Resultado Líquido
            </label>
            <label class="config-checkbox-label">
              <input type="checkbox" v-model="visibleCards.cumulative" /> Acumulado do Ano
            </label>
          </div>
        </div>
      </div>
      <div>
        <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
          Período: <strong style="color: var(--text-primary);">{{ getMonthYearString(selectedMonth) }}</strong>
        </span>
      </div>
    </div>

    <!-- Top KPI Grid -->
    <div class="summary-grid">
      <div v-if="visibleCards.income" class="summary-card card-income">
        <span class="card-icon"><i class="fa-solid fa-circle-arrow-up"></i></span>
        <div class="card-title">Receita Total</div>
        <div class="card-value text-success">{{ formatCurrency(totalIncomes) }}</div>
        <div class="card-sub-calc">Entradas no mês</div>
      </div>
      
      <div v-if="visibleCards.card" class="summary-card card-card">
        <span class="card-icon"><i class="fa-solid fa-credit-card"></i></span>
        <div class="card-title">Gastos com Cartões</div>
        <div class="card-value text-danger">{{ formatCurrency(totalCards) }}</div>
        <div class="card-sub-calc">Dividido por cartão abaixo</div>
      </div>

      <div v-if="visibleCards.fixed" class="summary-card card-fixed">
        <span class="card-icon"><i class="fa-solid fa-house-lock"></i></span>
        <div class="card-title">Gastos Fixos</div>
        <div class="card-value text-warning">{{ formatCurrency(totalFixeds) }}</div>
        <div class="card-sub-calc">Assinaturas, Financiamentos, etc</div>
      </div>

      <div v-if="visibleCards.variable" class="summary-card card-variable">
        <span class="card-icon"><i class="fa-solid fa-basket-shopping"></i></span>
        <div class="card-title">Outros Gastos</div>
        <div class="card-value text-info">{{ formatCurrency(totalVariables) }}</div>
        <div class="card-sub-calc">Empréstimos, Pgto Pessoas, etc</div>
      </div>

      <div v-if="visibleCards.net" class="summary-card card-net">
        <span class="card-icon"><i class="fa-solid fa-scale-balanced"></i></span>
        <div class="card-title" style="color: var(--color-primary);">Resultado Líquido</div>
        <div class="card-value" :class="netPostFixed >= 0 ? 'text-success' : 'text-danger'">
          {{ formatCurrency(netPostFixed) }}
        </div>
        <div class="card-sub-calc">
          <span>Líquido Inicial:</span>
          <span class="sub-calc-val">{{ formatCurrency(netIncome) }}</span>
        </div>
        
        <!-- Net Goal Section -->
        <div class="card-goal-section" style="margin-top: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem; text-align: left; width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary);">
            <span>Meta de Investimento:</span>
            <button @click="changeMonthlyGoal" class="btn-edit-goal" style="background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.75rem; padding: 0; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;" title="Definir Meta" type="button">
              <i class="fa-solid fa-pen-to-square"></i> {{ targetNetResult > 0 ? formatCurrency(targetNetResult) : 'Definir' }}
            </button>
          </div>
          
          <div v-if="targetNetResult > 0" style="margin-top: 0.4rem;">
            <div class="goal-progress-bar-container" style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden; position: relative;">
              <div class="goal-progress-bar" :style="{ width: Math.min(goalPercentage, 100) + '%', background: goalPercentage >= 100 ? 'var(--color-success)' : 'linear-gradient(90deg, var(--color-primary), #a855f7)' }" style="height: 100%; transition: width 0.5s ease;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">
              <span>{{ goalPercentage }}% atingido</span>
              <span v-if="netPostFixed >= targetNetResult" style="color: var(--color-success); font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Meta Atingida</span>
              <span v-else>Falta {{ formatCurrency(Math.max(targetNetResult - netPostFixed, 0)) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cumulative YTD Card -->
      <div v-if="visibleCards.cumulative" class="summary-card card-cumulative">
        <span class="card-icon"><i class="fa-solid fa-piggy-bank"></i></span>
        <div class="card-title" style="color: var(--color-success);">Acumulado do Ano</div>
        <div class="card-value" :class="cumulativeYearNetResult >= 0 ? 'text-success' : 'text-danger'">
          {{ formatCurrency(cumulativeYearNetResult) }}
        </div>
        <div class="card-sub-calc">
          Investido em {{ new Date().getFullYear() }}
        </div>
      </div>
    </div>

    <!-- CREDIT CARDS BREAKDOWN SECTION -->
    <section v-if="cardsBreakdown.length > 0" class="card-breakdown-section">
      <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; color: var(--text-primary); margin-top: 0;">
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

          <!-- Custom Progress Bar -->
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

          <!-- Custom Credit Card selection and Installments (Only if type === 'card') -->
          <div v-if="transType === 'card'" class="form-group">
            <div class="form-row-2" style="align-items: end;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Qual Cartão de Crédito?</label>
                <input 
                  type="text" 
                  v-model="transCardName" 
                  placeholder="Ex: Santander" 
                  class="form-input"
                  list="card-names-list-comp"
                  required
                />
                <!-- HTML5 native autocomplete based on previous items -->
                <datalist id="card-names-list-comp">
                  <option v-for="card in uniqueCardNames" :value="card" :key="card" />
                </datalist>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Parcelas (x)</label>
                <input 
                  type="number" 
                  v-model="transInstallments" 
                  min="1" 
                  max="72"
                  class="form-input"
                  required
                />
              </div>
            </div>
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
            <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
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
                      <button class="action-btn btn-delete" @click="deleteTransaction(t)"><i class="fa-solid fa-trash"></i></button>
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
                      <button class="action-btn btn-delete" @click="deleteTransaction(t)"><i class="fa-solid fa-trash"></i></button>
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
                      <button class="action-btn btn-delete" @click="deleteTransaction(t)"><i class="fa-solid fa-trash"></i></button>
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
                      <button class="action-btn btn-delete" @click="deleteTransaction(t)"><i class="fa-solid fa-trash"></i></button>
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

    <!-- Beautiful Custom Modal for Setting Monthly Goal -->
    <div v-if="showGoalModal" class="modal-overlay" @click.self="showGoalModal = false">
      <div class="modal-card">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; color: var(--text-primary);">
            <i class="fa-solid fa-bullseye" style="color: var(--color-primary);"></i>
            Meta de Investimento
          </h3>
          <button @click="showGoalModal = false" class="btn-close-modal" type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; transition: var(--transition-smooth); padding: 0.25rem;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="modal-body" style="padding: 1.25rem 0 1.5rem 0;">
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem; text-align: left; line-height: 1.4;">
            Defina o valor líquido (sobra de caixa) global que você deseja atingir para investimentos.
          </p>
          <div class="form-group" style="text-align: left; margin-bottom: 0;">
            <label class="form-label">Valor Alvo (R$)</label>
            <div style="position: relative;">
              <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 600; font-size: 0.95rem;">R$</span>
              <input 
                type="number" 
                step="0.01" 
                min="0" 
                v-model="tempGoalValue" 
                placeholder="0,00" 
                class="form-input" 
                style="padding-left: 2.75rem; width: 100%;"
                required
                @keyup.enter="saveMonthlyGoal"
              />
            </div>
          </div>
        </div>
        
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <button @click="showGoalModal = false" class="btn btn-secondary" type="button" style="min-height: 38px;">Cancelar</button>
          <button @click="saveMonthlyGoal" class="btn btn-primary" type="button" style="min-height: 38px;">
            <i class="fa-solid fa-check"></i> Salvar Meta
          </button>
        </div>
      </div>
    </div>

    <!-- Beautiful Custom Modal for Confirming Transaction Deletion -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="modal-card" style="max-width: 440px;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.15rem; color: var(--text-primary);">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i>
            {{ isInstallmentToDelete ? 'Excluir Compra Parcelada' : 'Excluir Lançamento' }}
          </h3>
          <button @click="closeDeleteModal" class="btn-close-modal" type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; transition: var(--transition-smooth); padding: 0.25rem;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="modal-body" style="padding: 1.25rem 0 1.5rem 0; text-align: left;">
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.4;">
            {{ isInstallmentToDelete 
               ? 'Este lançamento faz parte de uma compra parcelada no cartão:' 
               : 'Tem certeza que deseja excluir o lançamento abaixo?' }}
          </p>
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1rem; margin-bottom: 1.25rem;">
            <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 0.25rem;">
              {{ transactionToDelete?.description }}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
              <span v-if="transactionToDelete?.type === 'card'" style="color: var(--color-danger);">💳 {{ transactionToDelete?.cardName || 'Geral' }}</span>
              <span v-else-if="transactionToDelete?.type === 'income'" style="color: var(--color-success);">📥 Receita</span>
              <span v-else-if="transactionToDelete?.type === 'fixed'" style="color: var(--color-warning);">📌 Fixo</span>
              <span v-else style="color: var(--color-info);">🏷️ Outros</span>
              
              <span>•</span>
              <span style="color: #fff;">{{ formatCurrency(transactionToDelete?.amount) }}</span>
            </div>
          </div>
          <p v-if="isInstallmentToDelete" style="font-size: 0.85rem; color: var(--text-primary); font-weight: 600; margin-bottom: 0.5rem;">
            Como você deseja excluir esta compra?
          </p>
        </div>
        
        <div class="modal-footer" style="display: flex; flex-direction: column; gap: 0.65rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <!-- Opções de parcelamento -->
          <template v-if="isInstallmentToDelete">
            <button @click="confirmDelete(false)" class="btn btn-secondary" type="button" style="min-height: 42px; width: 100%; justify-content: center; background: rgba(255,255,255,0.03); border-color: var(--border-color); color: #fff;">
              <i class="fa-solid fa-calendar-minus" style="margin-right: 0.5rem; color: var(--color-primary);"></i>
              Excluir Apenas do Mês Atual
            </button>
            <button @click="confirmDelete(true)" class="btn btn-danger" type="button" style="min-height: 42px; width: 100%; justify-content: center;">
              <i class="fa-solid fa-trash-can" style="margin-right: 0.5rem;"></i>
              Excluir de Todos os Meses
            </button>
          </template>
          
          <!-- Opções para lançamento normal -->
          <template v-else>
            <button @click="confirmDelete(false)" class="btn btn-danger" type="button" style="min-height: 42px; width: 100%; justify-content: center;">
              <i class="fa-solid fa-trash-can" style="margin-right: 0.5rem;"></i>
              Excluir Lançamento
            </button>
          </template>
          
          <button @click="closeDeleteModal" class="btn btn-secondary" type="button" style="min-height: 38px; width: 100%; justify-content: center; margin-top: 0.25rem;">
            Cancelar
          </button>
        </div>
      </div>
    </div>

    <!-- Beautiful Custom Modal for importing transactions from previous month -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
      <div class="modal-card" style="max-width: 600px; display: flex; flex-direction: column; max-height: 85vh;">
        <!-- Modal Header -->
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; flex-shrink: 0;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; color: var(--text-primary);">
            <i class="fa-solid fa-cloud-arrow-down" style="color: var(--color-primary);"></i>
            Importar do Mês Anterior
          </h3>
          <button @click="showImportModal = false" class="btn-close-modal" type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; transition: var(--transition-smooth); padding: 0.25rem;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Select All Global bar -->
        <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <label class="config-checkbox-label" style="font-weight: 600;">
            <input type="checkbox" v-model="isAllSelected" />
            <span>Selecionar Todos ({{ prevMonthTransactions.length }})</span>
          </label>
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            Mês anterior: {{ getMonthYearString(getPreviousMonth(selectedMonth)) }}
          </span>
        </div>

        <!-- Modal Body (Scrollable list of categories and items) -->
        <div class="modal-body custom-scroll" style="overflow-y: auto; padding: 1rem 0; flex-grow: 1; text-align: left;">
          <div v-for="(group, key) in groupedPrevTransactions" :key="key" style="margin-bottom: 1.25rem;">
            
            <!-- Category Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px dashed rgba(255, 255, 255, 0.08);">
              <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.9rem;" :class="group.class">
                <i class="fa-solid" :class="group.icon"></i>
                <span>{{ group.name }}</span>
              </div>
              <button 
                type="button" 
                @click="toggleCategorySelection(key)"
                style="background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.75rem; font-weight: 600; padding: 0;"
              >
                {{ isCategoryAllSelected(key) ? 'Desmarcar Todos' : 'Selecionar Todos' }}
              </button>
            </div>

            <!-- Items under this Category -->
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <label 
                v-for="item in group.items" 
                :key="item._id" 
                class="import-item-row"
                style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border-radius: var(--radius-md); background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.04); cursor: pointer; transition: background 0.2s;"
              >
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-grow: 1; min-width: 0;">
                  <input type="checkbox" :value="item._id" v-model="selectedImportIds" style="cursor: pointer; accent-color: var(--color-primary); width: 16px; height: 16px; flex-shrink: 0;" />
                  <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-size: 0.85rem; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ item.description }}</span>
                    <span v-if="item.info || item.cardName" style="font-size: 0.7rem; color: var(--text-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {{ item.cardName ? `💳 ${item.cardName}` : '' }} {{ item.info ? `• ${item.info}` : '' }}
                    </span>
                  </div>
                </div>
                <span style="font-size: 0.85rem; font-weight: bold; flex-shrink: 0; margin-left: 0.5rem;" :class="group.class">
                  {{ formatCurrency(item.amount) }}
                </span>
              </label>
            </div>

          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 1rem; flex-shrink: 0;">
          <button @click="showImportModal = false" class="btn btn-secondary" type="button" style="min-height: 38px;">Cancelar</button>
          <button 
            @click="executeImport" 
            class="btn btn-primary" 
            type="button" 
            style="min-height: 38px; background: linear-gradient(135deg, var(--color-primary), #a855f7); border: none;"
            :disabled="importLoading || selectedImportIds.length === 0"
          >
            <span v-if="importLoading"><i class="fa-solid fa-spinner fa-spin"></i> Importando...</span>
            <span v-else><i class="fa-solid fa-cloud-arrow-down"></i> Importar Selecionados ({{ selectedImportIds.length }})</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(4, 6, 10, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  animation: fadeIn 0.25s ease-out;
}

.modal-card {
  background: #111827; /* Solid background, no transparency */
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  width: 100%;
  max-width: 420px;
  padding: 1.5rem;
  margin: 1.5rem;
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.9) translateY(10px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}

.card-cumulative::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(to bottom, var(--color-success), #10b981);
}

.card-config-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: #111827;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  padding: 1rem;
  z-index: 1000;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.card-config-header {
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.4rem;
  margin-bottom: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.config-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  transition: var(--transition-smooth);
}

.config-checkbox-label:hover {
  color: #fff;
}

.config-checkbox-label input {
  cursor: pointer;
  accent-color: var(--color-primary);
  width: 15px;
  height: 15px;
}

.import-item-row:hover {
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}
</style>
