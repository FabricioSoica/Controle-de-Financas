<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import CategoriesTab from './CategoriesTab.vue';

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
const isOldInstallment = ref(false);
const currentInstallmentNumber = ref(1);
const transCategory = ref('Outros');
let isPopulatingEdit = false;

watch(transType, (newType) => {
  if (isPopulatingEdit) return;
  if (newType === 'income') {
    if (transCategory.value !== 'Salário' && transCategory.value !== 'Outras Receitas') {
      transCategory.value = 'Salário';
    }
  } else {
    if (transCategory.value === 'Salário' || transCategory.value === 'Outras Receitas') {
      transCategory.value = 'Outros';
    }
  }
});
const targetNetResult = ref(0);
const showGoalModal = ref(false);
const tempGoalValue = ref('');
const annualEvolution = ref([]);
const registeredCards = ref([]);
const showCardConfig = ref(false);
const importLoading = ref(false);
const visibleCards = ref({
  income: true,
  card: true,
  fixed: true,
  variable: true,
  cash: true,
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
  fetchRegisteredCards();
  fetchDbCategories();
  fetchCategoryConfigs();
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
    const currentYear = new Date().getFullYear();
    const res = await fetch(`${props.apiUrl}/api/finances/summary/evolution?year=${currentYear}`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar evolução anual');
    annualEvolution.value = await res.json();
  } catch (error) {
    console.error(error.message);
  }
};

const fetchRegisteredCards = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/cards`, {
      headers: getHeaders()
    });
    if (res.ok) {
      registeredCards.value = await res.json();
    }
  } catch (error) {
    console.error('Error fetching registered cards:', error);
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
    else if (t.type === 'cash') typePT = 'Dinheiro';

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
const dbCategories = ref([]);

const fetchDbCategories = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/categories`, {
      headers: getHeaders()
    });
    if (res.ok) {
      dbCategories.value = await res.json();
    }
  } catch (error) {
    console.error('Erro ao buscar categorias do banco:', error);
  }
};

const fetchCategoryConfigs = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/categories/configs`, {
      headers: getHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      const mapping = {};
      data.forEach(item => {
        if (item.category && item.icon) {
          mapping[item.category] = item.icon;
        }
      });
      customIcons.value = mapping;
      localStorage.setItem('financas_category_icons', JSON.stringify(mapping));
    }
  } catch (error) {
    console.error('Erro ao buscar configurações de categorias:', error);
  }
};

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
    cardName: (transType.value === 'card' || transType.value === 'fixed') ? transCardName.value.trim() : '',
    month: getMonthYearString(selectedMonth.value),
    info: transInfo.value,
    category: transCategory.value
  };

  if (transType.value === 'card' && transInstallments.value > 1) {
    payload.installments = parseInt(transInstallments.value, 10);
    if (isOldInstallment.value) {
      payload.isOldInstallment = true;
      payload.currentInstallmentNumber = parseInt(currentInstallmentNumber.value, 10);
    }
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
    fetchDbCategories();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};
const editTransaction = (t) => {
  isPopulatingEdit = true;
  transId.value = t._id;
  transDesc.value = t.description;
  transAmount.value = t.amount;
  transType.value = t.type;
  transCardName.value = t.cardName || '';
  transInfo.value = t.info || '';
  transCategory.value = t.category || 'Outros';
  transInstallments.value = 1;
  isOldInstallment.value = false;
  currentInstallmentNumber.value = 1;
  isEditingTrans.value = true;
  setTimeout(() => {
    isPopulatingEdit = false;
  }, 50);
};

const showCategoryModal = ref(false);
const selectedCategoryName = ref('');
const showCategorizerModal = ref(false);

const closeCategorizerModal = () => {
  showCategorizerModal.value = false;
  fetchTransactions();
  fetchDbCategories();
};

const categoryTransactions = computed(() => {
  if (!selectedCategoryName.value) return [];
  return transactions.value.filter(t => 
    t.type !== 'income' && 
    (t.category || 'Outros') === selectedCategoryName.value
  );
});

const isEditingCategoryName = ref(false);
const newCategoryNameInput = ref('');

const startRenameCategory = () => {
  newCategoryNameInput.value = selectedCategoryName.value;
  isEditingCategoryName.value = true;
};

const executeRenameCategory = async () => {
  if (!newCategoryNameInput.value || !newCategoryNameInput.value.trim()) {
    emit('toast', { message: 'Por favor, digite um nome de categoria válido.', type: 'error' });
    return;
  }
  
  const oldName = selectedCategoryName.value;
  const newName = newCategoryNameInput.value.trim();
  
  if (oldName === newName) {
    isEditingCategoryName.value = false;
    return;
  }
  
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/categories/rename`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldName, newName })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao renomear categoria');
    }
    
    emit('toast', { message: `Categoria "${oldName}" renomeada para "${newName}" com sucesso!`, type: 'success' });
    
    selectedCategoryName.value = newName;
    isEditingCategoryName.value = false;
    
    fetchTransactions();
    fetchDbCategories();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const openCategoryDetails = (name) => {
  selectedCategoryName.value = name;
  showCategoryModal.value = true;
};

const closeCategoryModal = () => {
  showCategoryModal.value = false;
  selectedCategoryName.value = '';
  isEditingCategoryName.value = false;
  newCategoryNameInput.value = '';
  showIconPicker.value = false;
};

const scrollToForm = () => {
  const el = document.getElementById('transaction-form-aside');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      const input = el.querySelector('input[type="text"]');
      if (input) input.focus();
    }, 450);
  }
};

const handleEditFromModal = (t) => {
  closeCategoryModal();
  editTransaction(t);
  setTimeout(() => {
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};

const handleDeleteFromModal = (t) => {
  deleteTransaction(t);
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
    fetchDbCategories();
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
  transCategory.value = 'Outros';
  transInstallments.value = 1;
  isOldInstallment.value = false;
  currentInstallmentNumber.value = 1;
  isEditingTrans.value = false;
};

const handleOldInstallmentChange = () => {
  if (isOldInstallment.value) {
    if (transInstallments.value < 2) {
      transInstallments.value = 2;
    }
    currentInstallmentNumber.value = 1;
  }
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

const changeMonth = (offset) => {
  if (!selectedMonth.value) return;
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 15);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  selectedMonth.value = `${newYear}-${newMonth}`;
};

const showImportModal = ref(false);
const prevMonthTransactions = ref([]);
const selectedImportIds = ref([]);

const groupedPrevTransactions = computed(() => {
  const groups = {
    income: { name: 'Receitas', icon: 'fa-circle-arrow-up', class: 'text-success', items: [] },
    card: { name: 'Cartões', icon: 'fa-credit-card', class: 'text-danger', items: [] },
    fixed: { name: 'Fixos', icon: 'fa-house-lock', class: 'text-warning', items: [] },
    variable: { name: 'Outros', icon: 'fa-basket-shopping', class: 'text-info', items: [] },
    cash: { name: 'Dinheiro', icon: 'fa-money-bill-wave', class: 'text-cash', items: [] }
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
        cardName: (trans.type === 'card' || trans.type === 'fixed') ? trans.cardName || '' : '',
        month: getMonthYearString(selectedMonth.value),
        info: trans.info || '',
        category: trans.category || 'Outros'
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
const transCashs = computed(() => transactions.value.filter(t => t.type === 'cash'));

const totalIncomes = computed(() => transIncomes.value.reduce((sum, t) => sum + t.amount, 0));
const totalCards = computed(() => transCards.value.reduce((sum, t) => sum + t.amount, 0));
const totalFixeds = computed(() => transFixeds.value.reduce((sum, t) => sum + t.amount, 0));
const totalVariables = computed(() => transVariables.value.reduce((sum, t) => sum + t.amount, 0));
const totalCashs = computed(() => transCashs.value.reduce((sum, t) => sum + t.amount, 0));

const totalExpenses = computed(() => totalCards.value + totalVariables.value + totalCashs.value);
const netIncome = computed(() => totalIncomes.value - totalExpenses.value);
const netPostFixed = computed(() => netIncome.value - totalFixeds.value);

// Autocomplete suggestions
const uniqueCardNames = computed(() => {
  const cards = transactions.value
    .filter(t => (t.type === 'card' || t.type === 'fixed') && t.cardName)
    .map(t => t.cardName.trim());
  return [...new Set(cards)];
});

// Credit Card Grouping & Accordion
const cardsBreakdown = computed(() => {
  const groups = {};
  
  // Normal card transactions
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

  // Fixed transactions linked to a card (subscriptions)
  transFixeds.value.forEach(t => {
    if (t.cardName && t.cardName.trim()) {
      const card = t.cardName.trim();
      if (!groups[card]) {
        groups[card] = {
          name: card,
          total: 0,
          transactions: []
        };
      }
      groups[card].total += t.amount;
      groups[card].transactions.push({
        ...t,
        isSubscription: true
      });
    }
  });

  return Object.values(groups).sort((a, b) => b.total - a.total);
});

const totalInvoiceSum = computed(() => cardsBreakdown.value.reduce((sum, c) => sum + c.total, 0));

const getCardUsagePercentage = (cardTotal) => {
  if (totalInvoiceSum.value === 0) return 0;
  return (cardTotal / totalInvoiceSum.value) * 100;
};

const categoryMetadata = {
  'Alimentação': { icon: 'fa-utensils', color: '#ff6b6b' },
  'Transporte': { icon: 'fa-car', color: '#4dadf7' },
  'Combustível': { icon: 'fa-gas-pump', color: '#fcc419' },
  'Moradia': { icon: 'fa-house', color: '#51cf66' },
  'Lazer / Viagens': { icon: 'fa-umbrella-beach', color: '#cc5de8' },
  'Saúde': { icon: 'fa-heart-pulse', color: '#ff8787' },
  'Educação': { icon: 'fa-graduation-cap', color: '#ff922b' },
  'Assinaturas & Serviços': { icon: 'fa-repeat', color: '#3bc9db' },
  'Compras / Vestuário': { icon: 'fa-bag-shopping', color: '#94d82d' },
  'Outros': { icon: 'fa-ellipsis', color: '#adb5bd' },
  'Salário': { icon: 'fa-wallet', color: '#37b24d' },
  'Outras Receitas': { icon: 'fa-money-bill-trend-up', color: '#74b816' }
};

const customIcons = ref(JSON.parse(localStorage.getItem('financas_category_icons') || '{}'));
const showIconPicker = ref(false);

const getCategoryIcon = (name) => {
  if (!name) return 'fa-tag';
  if (customIcons.value[name]) return customIcons.value[name];
  return categoryMetadata[name]?.icon || 'fa-tag';
};

const availableIconsList = [
  'fa-utensils', 'fa-car', 'fa-gas-pump', 'fa-house', 'fa-umbrella-beach',
  'fa-heart-pulse', 'fa-graduation-cap', 'fa-repeat', 'fa-bag-shopping',
  'fa-shirt', 'fa-wallet', 'fa-money-bill-trend-up', 'fa-ellipsis', 'fa-gift',
  'fa-gamepad', 'fa-dumbbell', 'fa-paw', 'fa-plane', 'fa-bus',
  'fa-cart-shopping', 'fa-scissors', 'fa-wrench', 'fa-mobile-screen',
  'fa-bolt', 'fa-droplet', 'fa-tv', 'fa-briefcase', 'fa-piggy-bank',
  'fa-shield-halved', 'fa-tag'
];

const selectCategoryIcon = async (iconName) => {
  if (!selectedCategoryName.value) return;
  
  customIcons.value[selectedCategoryName.value] = iconName;
  localStorage.setItem('financas_category_icons', JSON.stringify(customIcons.value));
  showIconPicker.value = false;
  
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/categories/configs`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        category: selectedCategoryName.value,
        icon: iconName
      })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao salvar ícone no servidor');
    }
    emit('toast', { message: 'Ícone da categoria atualizado com sucesso!', type: 'success' });
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const sortedCategories = computed(() => {
  const list = new Set();
  
  const defaultCats = [
    'Alimentação', 'Transporte', 'Combustível', 'Moradia', 
    'Lazer / Viagens', 'Saúde', 'Educação', 'Assinaturas & Serviços', 
    'Compras / Vestuário', 'Outros', 'Salário', 'Outras Receitas'
  ];
  defaultCats.forEach(c => list.add(c));
  
  transactions.value.forEach(t => {
    if (t.category) list.add(t.category);
  });
  
  dbCategories.value.forEach(c => list.add(c));
  
  return [...list].sort();
});

const getCategoryColor = (name) => {
  if (!name) return '#adb5bd';
  if (categoryMetadata[name]) return categoryMetadata[name].color;
  
  const index = sortedCategories.value.indexOf(name);
  if (index === -1) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 60%)`;
  }
  
  const hue = (index * 137.5) % 360;
  return `hsl(${hue}, 70%, 55%)`;
};

const availableCategories = computed(() => {
  const defaults = transType.value === 'income'
    ? ['Salário', 'Outras Receitas']
    : ['Alimentação', 'Transporte', 'Combustível', 'Moradia', 'Lazer / Viagens', 'Saúde', 'Educação', 'Assinaturas & Serviços', 'Compras / Vestuário', 'Outros'];
  
  const used = transactions.value
    .filter(t => {
      if (transType.value === 'income') {
        return t.type === 'income';
      } else {
        return t.type !== 'income';
      }
    })
    .map(t => t.category)
    .filter(Boolean);
    
  return [...new Set([...defaults, ...used])];
});

const categoryBreakdown = computed(() => {
  const expenseTransactions = transactions.value.filter(t => t.type !== 'income');
  const totals = {};
  
  expenseTransactions.forEach(t => {
    const cat = t.category || 'Outros';
    if (!totals[cat]) {
      totals[cat] = {
        name: cat,
        total: 0,
        count: 0
      };
    }
    totals[cat].total += t.amount;
    totals[cat].count++;
  });
  
  const sorted = Object.values(totals).sort((a, b) => b.total - a.total);
  const sumExpenses = sorted.reduce((sum, item) => sum + item.total, 0);
  
  return sorted.map(item => {
    return {
      ...item,
      percentage: sumExpenses > 0 ? (item.total / sumExpenses) * 100 : 0
    };
  });
});

const totalBreakdownExpenses = computed(() => {
  return categoryBreakdown.value.reduce((sum, item) => sum + item.total, 0);
});

const donutSegments = computed(() => {
  let accumulatedPercent = 0;
  const R = 40;
  const C = 2 * Math.PI * R; // 251.327
  
  return categoryBreakdown.value.map(item => {
    const percent = item.percentage;
    const strokeDasharray = `${(percent / 100) * C} ${C}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * C);
    accumulatedPercent += percent;
    
    return {
      name: item.name,
      total: item.total,
      percent: percent,
      color: getCategoryColor(item.name),
      icon: getCategoryIcon(item.name),
      strokeDasharray,
      strokeDashoffset
    };
  });
});
</script>

<template>
  <div>
    <!-- Month Picker -->
    <div class="filter-bar" style="position: relative; z-index: 50;">
      <!-- Month Picker Container -->
      <div class="month-picker-container">
        <span class="month-picker-label"><i class="fa-solid fa-calendar-days"></i> Competência:</span>
        <div class="month-nav-group">
          <button 
            type="button" 
            @click="changeMonth(-1)" 
            class="btn-nav-month"
            title="Mês Anterior"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <input 
            type="month" 
            v-model="selectedMonth" 
            class="month-input"
          />
          <button 
            type="button" 
            @click="changeMonth(1)" 
            class="btn-nav-month"
            title="Mês Seguinte"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>

      <!-- Action Buttons Group -->
      <div class="filter-actions-group">
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
          style="background: linear-gradient(135deg, var(--color-primary), #a855f7); color: white; border: none; font-weight: 600; display: flex; align-items: center; gap: 0.4rem;"
        >
          <span v-if="importLoading"><i class="fa-solid fa-spinner fa-spin"></i></span>
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

        <!-- Card Configuration Dropdown Button -->
        <div style="position: relative; z-index: 1000;">
          <!-- Backdrop to close dropdown click-outside -->
          <div v-if="showCardConfig" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999; background: transparent;" @click="showCardConfig = false"></div>
          
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
              <input type="checkbox" v-model="visibleCards.cash" /> Gastos em Dinheiro
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

      <!-- Period Display -->
      <div class="period-display">
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

      <div v-if="visibleCards.cash" class="summary-card card-cash">
        <span class="card-icon"><i class="fa-solid fa-money-bill-wave"></i></span>
        <div class="card-title">Gastos em Dinheiro</div>
        <div class="card-value text-cash">{{ formatCurrency(totalCashs) }}</div>
        <div class="card-sub-calc">Pagamentos em espécie</div>
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

    <!-- STATS BREAKDOWN GRID (Cards & Categories) -->
    <div v-if="cardsBreakdown.length > 0 || categoryBreakdown.length > 0" class="stats-breakdown-grid">
      
      <!-- Left Column: Credit Cards Breakdown -->
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
                  <span class="cc-detail-desc">
                    {{ item.description }}
                    <span v-if="item.isSubscription" class="subscription-badge" style="font-size: 0.6rem; color: var(--text-secondary); background: rgba(255, 255, 255, 0.08); padding: 0.05rem 0.25rem; border-radius: 3px; margin-left: 0.25rem;">
                      Fixo
                    </span>
                  </span>
                  <span v-if="item.info" style="font-size: 0.65rem; color: var(--text-muted); font-style: italic;">{{ item.info }}</span>
                </div>
                <span class="cc-detail-val">{{ formatCurrency(item.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Column: Expense Breakdown by Category -->
      <section v-if="categoryBreakdown.length > 0" class="category-breakdown-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); margin: 0;">
            <i class="fa-solid fa-chart-pie" style="color: var(--color-success);"></i>
            Distribuição por Categoria
          </h3>
          <button 
            @click="showCategorizerModal = true" 
            class="btn btn-secondary" 
            style="padding: 0.35rem 0.75rem; font-size: 0.8rem; min-height: 30px; display: inline-flex; align-items: center; gap: 0.35rem; margin: 0; background: rgba(99, 102, 241, 0.1); border-color: rgba(99, 102, 241, 0.2); color: #fff;"
            type="button"
            onmouseover="this.style.background='rgba(99, 102, 241, 0.2)'"
            onmouseout="this.style.background='rgba(99, 102, 241, 0.1)'"
          >
            <i class="fa-solid fa-tags"></i>
            Categorizar
          </button>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">Detalhamento visual de gastos (fixos, cartões e outros).</p>
        
        <div class="category-stats-container">
          <!-- Donut Chart & Summary -->
          <div class="donut-chart-wrapper">
            <div class="donut-chart-container">
              <svg width="140" height="140" viewBox="0 0 100 100" class="donut-svg">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.06)" stroke-width="12" />
                <circle 
                  v-for="seg in donutSegments" 
                  :key="seg.name"
                  cx="50" 
                  cy="50" 
                  r="40" 
                  fill="transparent" 
                  :stroke="seg.color" 
                  stroke-width="12" 
                  :stroke-dasharray="seg.strokeDasharray" 
                  :stroke-dashoffset="seg.strokeDashoffset" 
                  stroke-linecap="round"
                  class="donut-segment"
                  @click="openCategoryDetails(seg.name)"
                  style="cursor: pointer;"
                />
              </svg>
              <div class="donut-center-text">
                <span class="donut-label">Total Saídas</span>
                <span class="donut-val">{{ formatCurrency(totalBreakdownExpenses) }}</span>
              </div>
            </div>
          </div>

          <!-- Category Progress Bars -->
          <div class="category-bars-list custom-scroll">
            <div 
              v-for="cat in categoryBreakdown" 
              :key="cat.name" 
              class="category-bar-item"
              @click="openCategoryDetails(cat.name)"
              style="cursor: pointer;"
            >
              <div class="cat-bar-header">
                <div class="cat-bar-title">
                  <span class="cat-icon-badge" :style="{ backgroundColor: getCategoryColor(cat.name) + '22', color: getCategoryColor(cat.name) }">
                    <i class="fa-solid" :class="getCategoryIcon(cat.name)"></i>
                  </span>
                  <span class="cat-name">{{ cat.name }}</span>
                </div>
                <div class="cat-bar-values">
                  <span class="cat-total">{{ formatCurrency(cat.total) }}</span>
                  <span class="cat-pct">{{ cat.percentage.toFixed(0) }}%</span>
                </div>
              </div>
              <div class="cat-progress-bg">
                <div class="cat-progress-fill" :style="{ width: cat.percentage + '%', backgroundColor: getCategoryColor(cat.name) }"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>

    <!-- Dashboard Split Layout -->
    <div class="dashboard-grid">
      <!-- Form Side -->
      <aside id="transaction-form-aside" class="form-card">
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
                <option value="cash">Gasto em Dinheiro (-)</option>
                <option value="income">Receita (+)</option>
                <option value="fixed">Gasto Fixo (-)</option>
                <option value="variable">Outros Gastos (-)</option>
              </select>
            </div>
          </div>

          <!-- Custom Credit Card selection and Installments (Only if type === 'card' or 'fixed') -->
          <div v-if="transType === 'card' || transType === 'fixed'" class="form-group">
            <div class="form-row-2">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">
                  {{ transType === 'fixed' ? 'Pagar com qual Cartão? (Opcional)' : 'Escolha o Cartão:' }}
                </label>
                <select 
                  v-model="transCardName" 
                  class="form-select"
                  :required="transType === 'card'"
                >
                  <option value="" :disabled="transType === 'card'">
                    {{ transType === 'fixed' ? 'Sem Cartão (Padrão)' : 'Selecione um Cartão' }}
                  </option>
                  <option v-for="card in registeredCards" :value="card.cardName" :key="card._id">
                    {{ card.cardName }} (Fecha dia {{ card.closingDay }})
                  </option>
                </select>
                <span v-if="registeredCards.length === 0" style="display: block; font-size: 0.75rem; color: var(--color-warning); margin-top: 0.25rem;">
                  Nenhum cartão cadastrado. Vá em ⚙️ no topo.
                </span>
              </div>

              <!-- Only show installments input for card type -->
              <div v-if="transType === 'card'" class="form-group" style="margin-bottom: 0;">
                <label class="form-label">
                  {{ isOldInstallment ? 'Parcelas Totais' : 'Parcelas (x)' }}
                </label>
                <input 
                  type="number" 
                  v-model="transInstallments" 
                  :min="isOldInstallment ? 2 : 1" 
                  max="72"
                  class="form-input"
                  required
                />
              </div>
            </div>

            <!-- Checkbox for Old Installment (Only if type === 'card') -->
            <div v-if="transType === 'card'" class="form-group" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
              <label class="config-checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; color: var(--text-secondary);">
                <input 
                  type="checkbox" 
                  v-model="isOldInstallment"
                  @change="handleOldInstallmentChange"
                />
                <span>Este é um parcelamento antigo?</span>
              </label>
            </div>

            <!-- If it's an old installment, show the current installment input (Only if type === 'card') -->
            <div v-if="transType === 'card' && isOldInstallment" class="form-row-2" style="margin-top: 0.5rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Parcela atual neste mês (Ex: 4 de 10)</label>
                <input 
                  type="number" 
                  v-model="currentInstallmentNumber" 
                  min="1" 
                  :max="transInstallments"
                  class="form-input"
                  required
                />
              </div>
              <div class="form-group" style="margin-bottom: 0; display: flex; align-items: flex-end; justify-content: flex-start; padding-bottom: 0.5rem;">
                <span class="info-badge" style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.2;">
                  <i class="fa-solid fa-circle-info"></i>
                  Serão criadas as parcelas de {{ currentInstallmentNumber }} a {{ transInstallments }} nos meses futuros.
                </span>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Categoria</label>
            <input 
              type="text" 
              v-model="transCategory" 
              list="categories-list" 
              class="form-input" 
              placeholder="Selecione ou digite uma categoria"
              required
            />
            <datalist id="categories-list">
              <option v-for="cat in availableCategories" :value="cat" :key="cat" />
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
            <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
              <i class="fa-solid fa-list-check"></i> Distribuição dos Lançamentos
            </h3>
            <span class="month-picker-label">Gastos do Mês: {{ formatCurrency(totalCards + totalFixeds + totalVariables + totalCashs) }}</span>
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
                    <span class="item-desc">
                      {{ t.description }}
                      <span v-if="t.cardName" class="card-badge" style="font-size: 0.65rem; color: var(--color-danger); background: rgba(239, 68, 68, 0.1); padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.35rem; display: inline-flex; align-items: center; gap: 0.15rem;">
                        <i class="fa-solid fa-credit-card"></i> {{ t.cardName }}
                      </span>
                    </span>
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

            <!-- 5. Dinheiro -->
            <div class="category-column">
              <div class="column-header cash">
                <span>Dinheiro</span>
                <span class="column-sum">{{ formatCurrency(totalCashs) }}</span>
              </div>
              <div class="transaction-list-items">
                <div v-for="t in transCashs" :key="t._id" class="transaction-item">
                  <div class="item-main-row">
                    <span class="item-desc">{{ t.description }}</span>
                    <span class="item-val text-cash">{{ formatCurrency(t.amount) }}</span>
                  </div>
                  <div class="item-details-row">
                    <span class="item-obs">{{ t.info }}</span>
                    <div class="item-actions">
                      <button class="action-btn btn-edit" @click="editTransaction(t)"><i class="fa-solid fa-pen"></i></button>
                      <button class="action-btn btn-delete" @click="deleteTransaction(t)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                  </div>
                </div>
                <div v-if="transCashs.length === 0" class="empty-state">Sem dinheiro</div>
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

    <!-- Beautiful Custom Modal for Viewing Category Transactions (Mercado Pago style) -->
    <div v-if="showCategoryModal" class="modal-overlay" @click.self="closeCategoryModal">
      <div class="modal-card" style="max-width: 600px; width: 95%;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.6rem; font-size: 1.15rem; color: var(--text-primary); flex-grow: 1; min-width: 0;">
            <span class="cat-icon-badge" :style="{ backgroundColor: getCategoryColor(selectedCategoryName) + '22', color: getCategoryColor(selectedCategoryName), width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }" @click="showIconPicker = !showIconPicker" title="Alterar Ícone">
              <i class="fa-solid" :class="getCategoryIcon(selectedCategoryName)"></i>
            </span>
            
            <div v-if="isEditingCategoryName" style="display: flex; gap: 0.35rem; align-items: center; flex-grow: 1; max-width: 320px;">
              <input 
                type="text" 
                v-model="newCategoryNameInput" 
                class="form-input" 
                style="margin: 0; min-height: 32px; font-size: 0.85rem; padding: 0.25rem 0.5rem; flex-grow: 1; background: rgba(255,255,255,0.05); border-color: var(--border-color); color: #fff;"
                @keyup.enter="executeRenameCategory"
                placeholder="Novo nome..."
              />
              <button @click="executeRenameCategory" class="btn btn-primary" type="button" style="padding: 0; width: 32px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center; background: var(--color-success); border-color: var(--color-success);">
                <i class="fa-solid fa-check"></i>
              </button>
              <button @click="isEditingCategoryName = false" class="btn btn-secondary" type="button" style="padding: 0; width: 32px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center;">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <div v-else style="display: flex; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span>Gastos em: <strong>{{ selectedCategoryName }}</strong></span>
              <button 
                @click="startRenameCategory" 
                title="Renomear Categoria" 
                type="button" 
                style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; padding: 0.25rem; display: inline-flex; align-items: center; justify-content: center; transition: var(--transition-smooth);"
                onmouseover="this.style.color='var(--color-primary)'" 
                onmouseout="this.style.color='var(--text-muted)'"
              >
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
            </div>
          </h3>
          <button @click="closeCategoryModal" class="btn-close-modal" type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; transition: var(--transition-smooth); padding: 0.25rem;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="modal-body" style="padding: 1.25rem 0; text-align: left;">
          <!-- Icon Picker Panel -->
          <div v-if="showIconPicker" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 1.25rem;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center;">
              <span>Escolha um Ícone para esta Categoria</span>
              <button @click="showIconPicker = false" type="button" style="background:none; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.4rem; max-height: 120px; overflow-y: auto; padding-right: 0.25rem;" class="custom-scroll">
              <button 
                v-for="ico in availableIconsList" 
                :key="ico"
                @click="selectCategoryIcon(ico)"
                type="button"
                style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); border-radius: 6px; height: 32px; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer; transition: all 0.2s;"
                :style="getCategoryIcon(selectedCategoryName) === ico ? { borderColor: getCategoryColor(selectedCategoryName), background: getCategoryColor(selectedCategoryName) + '22', color: getCategoryColor(selectedCategoryName) } : {}"
              >
                <i class="fa-solid" :class="ico"></i>
              </button>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1rem;">
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Total Consumido:</span>
            <strong :style="{ color: getCategoryColor(selectedCategoryName), fontSize: '1.15rem', fontWeight: '800' }">
              {{ formatCurrency(categoryTransactions.reduce((sum, t) => sum + t.amount, 0)) }}
            </strong>
          </div>
          
          <div v-if="categoryTransactions.length === 0" style="text-align: center; padding: 2rem 0; color: var(--text-muted); font-size: 0.9rem;">
            Nenhum gasto registrado nesta categoria para este mês.
          </div>
          
          <div v-else class="custom-scroll" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 0.25rem;">
            <div v-for="t in categoryTransactions" :key="t._id" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); transition: background 0.2s ease;">
              <div style="display: flex; flex-direction: column; gap: 0.15rem; flex-grow: 1; padding-right: 1rem;">
                <div style="font-weight: 600; color: #fff; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span>{{ t.description }}</span>
                  <span v-if="t.installments > 1" class="subscription-badge" style="font-size: 0.65rem; color: #fff; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.2); padding: 0.05rem 0.25rem; border-radius: 4px;">
                    Parcelado
                  </span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  <span v-if="t.type === 'card'" style="color: var(--color-danger);"><i class="fa-solid fa-credit-card"></i> {{ t.cardName }}</span>
                  <span v-else-if="t.type === 'fixed'" style="color: var(--color-warning);"><i class="fa-solid fa-thumbtack"></i> Gasto Fixo</span>
                  <span v-else style="color: var(--color-info);"><i class="fa-solid fa-tag"></i> Outro</span>
                  
                  <span v-if="t.info">• {{ t.info }}</span>
                </div>
              </div>
              
              <div style="display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
                <span style="font-weight: 700; color: #fff; font-size: 0.9rem;">
                  {{ formatCurrency(t.amount) }}
                </span>
                
                <div style="display: flex; gap: 0.25rem;">
                  <button @click="handleEditFromModal(t)" class="action-btn btn-edit" title="Editar" type="button" style="width: 28px; height: 28px; font-size: 0.75rem; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button @click="handleDeleteFromModal(t)" class="action-btn btn-delete" title="Deletar" type="button" style="width: 28px; height: 28px; font-size: 0.75rem; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer" style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; justify-content: flex-end;">
          <button @click="closeCategoryModal" class="btn btn-secondary" type="button" style="min-height: 38px; padding: 0.5rem 1.5rem;">
            Fechar
          </button>
        </div>
      </div>
    </div>

    <!-- Beautiful Custom Modal for Bulk Categorizing Uncategorized Transactions -->
    <div v-if="showCategorizerModal" class="modal-overlay" @click.self="closeCategorizerModal">
      <div class="modal-card" style="max-width: 900px; width: 95%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; padding: 1.5rem;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; flex-shrink: 0;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.6rem; font-size: 1.2rem; color: var(--text-primary);">
            <i class="fa-solid fa-tags" style="color: var(--color-primary);"></i>
            <span>Categorizar Gastos Pendentes</span>
          </h3>
          <button @click="closeCategorizerModal" class="btn-close-modal" type="button" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; transition: var(--transition-smooth); padding: 0.25rem;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div class="modal-body custom-scroll" style="flex-grow: 1; overflow-y: auto; padding: 1.25rem 0 0.5rem 0;">
          <CategoriesTab 
            :token="token" 
            :apiUrl="apiUrl" 
            @toast="(payload) => $emit('toast', payload)" 
          />
        </div>
        
        <div class="modal-footer" style="border-top: 1px solid var(--border-color); padding-top: 0.75rem; display: flex; justify-content: flex-end; flex-shrink: 0;">
          <button @click="closeCategorizerModal" class="btn btn-secondary" type="button" style="min-height: 38px; padding: 0.5rem 1.5rem;">
            Fechar
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
    <!-- Floating Action Button for Mobile -->
    <button 
      class="mobile-fab" 
      @click="scrollToForm" 
      title="Novo Lançamento"
      type="button"
    >
      <i class="fa-solid fa-plus"></i>
    </button>
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

.btn-nav-month {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition-smooth);
  padding: 0;
}

.btn-nav-month:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--text-secondary);
  color: #fff;
}

/* Scoped layout overrides for the filter toolbar */
.filter-bar {
  display: flex;
  justify-content: flex-start !important;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.month-picker-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: nowrap;
}

.month-nav-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: nowrap;
}

.filter-actions-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.period-display {
  margin-left: auto; /* Push period display to the far right on desktop */
}

/* Mobile responsive rules for 900px and under */
@media (max-width: 900px) {
  .filter-bar {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 1.25rem !important;
    padding: 1.25rem !important;
  }
  
  .month-picker-container {
    flex-direction: column !important;
    align-items: center !important;
    gap: 0.5rem !important;
    width: 100% !important;
  }

  .month-picker-label {
    margin-bottom: 0.25rem;
  }

  .month-nav-group {
    justify-content: center !important;
    width: 100% !important;
  }
  
  .month-input {
    flex-grow: 1 !important;
    max-width: 180px !important;
    text-align: center;
  }

  .filter-actions-group {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
    gap: 0.5rem !important;
    width: 100% !important;
  }

  .filter-actions-group > *:nth-child(odd):last-child {
    grid-column: span 2 !important;
    justify-self: center !important;
    width: 50% !important;
    min-width: 140px !important;
  }

  .filter-actions-group .btn-today {
    margin: 0 !important;
    width: 100% !important;
    justify-content: center !important;
    font-size: 0.8rem !important;
    padding: 0.6rem 0.5rem !important;
    min-height: 40px !important;
  }
  
  .period-display {
    margin-left: 0 !important;
    text-align: center !important;
    padding-top: 0.75rem !important;
    border-top: 1px dashed var(--border-color) !important;
    width: 100% !important;
  }
}

.mobile-fab {
  display: none;
}

@media (max-width: 768px) {
  .mobile-fab {
    display: flex !important;
    position: fixed !important;
    bottom: 80px !important;
    right: 1.25rem !important;
    width: 50px !important;
    height: 50px !important;
    border-radius: 50% !important;
    background: linear-gradient(135deg, var(--color-primary), #a855f7) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    color: #fff !important;
    font-size: 1.4rem !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(139, 92, 246, 0.3) !important;
    z-index: 9990 !important;
    cursor: pointer !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  }
  
  .mobile-fab:active {
    transform: scale(0.9) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
  }
}
</style>
