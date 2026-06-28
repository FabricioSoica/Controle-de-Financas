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
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  selectedMonth.value = `${year}-${month}`;
  fetchTransactions();
  fetchMonthlyGoal();
});

// Watch month changes to reload transactions
watch(selectedMonth, () => {
  fetchTransactions();
});

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

const goalPercentage = computed(() => {
  if (targetNetResult.value <= 0) return 0;
  if (netPostFixed.value <= 0) return 0;
  const pct = (netPostFixed.value / targetNetResult.value) * 100;
  return Math.round(pct);
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

  if (transType.value === 'card' && transInstallments.value > 1 && !isEditingTrans.value) {
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

const deleteTransaction = async (id) => {
  if (!confirm('Deseja realmente excluir este lançamento?')) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao deletar lançamento');
    emit('toast', { message: 'Lançamento excluído com sucesso.', type: 'success' });
    fetchTransactions();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
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
    <div class="filter-bar">
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
      </div>
      <div>
        <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
          Período: <strong style="color: var(--text-primary);">{{ getMonthYearString(selectedMonth) }}</strong>
        </span>
      </div>
    </div>

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
        <div class="card-sub-calc">Empréstimos, Pgto Pessoas, etc</div>
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
            <div v-if="!isEditingTrans" class="form-row-2" style="align-items: end;">
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
            <div v-else class="form-group" style="margin-bottom: 0;">
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
</style>
