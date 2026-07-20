<script setup>
import { ref, onMounted, computed } from 'vue';

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

const emit = defineEmits(['toast']);

// State
const uncategorizedTransactions = ref([]);
const dbCategories = ref([]);
const fetchLoading = ref(false);
const savingId = ref(null);

// Forms Category Inputs (temp storage for each transaction's input text)
const categoryInputs = ref({});

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${props.token}`
  };
};

const formatCurrency = (value) => {
  if (value === undefined || value === null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

// Fetch data
const fetchUncategorized = async () => {
  fetchLoading.value = true;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/uncategorized`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar lançamentos descategorizados');
    const data = await res.json();
    uncategorizedTransactions.value = data;
    
    // Initialize temporary inputs
    data.forEach(t => {
      categoryInputs.value[t._id] = '';
    });
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    fetchLoading.value = false;
  }
};

const fetchDbCategories = async () => {
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/categories`, {
      headers: getHeaders()
    });
    if (res.ok) {
      dbCategories.value = await res.json();
    }
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
  }
};

// Available categories for suggestions
const defaultCategories = [
  'Alimentação', 'Transporte', 'Combustível', 'Moradia', 
  'Lazer / Viagens', 'Saúde', 'Educação', 'Assinaturas & Serviços', 
  'Compras / Vestuário', 'Salário', 'Outras Receitas', 'Outros'
];

const allSuggestedCategories = computed(() => {
  return [...new Set([...defaultCategories, ...dbCategories.value])];
});

// Update transaction category
const updateCategory = async (transaction, categoryName) => {
  if (!categoryName || !categoryName.trim()) {
    emit('toast', { message: 'Por favor, digite ou selecione uma categoria válida.', type: 'error' });
    return;
  }
  
  const finalCategory = categoryName.trim();
  savingId.value = transaction._id;
  
  // Prepare payload based on transaction structure
  const payload = {
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.type,
    cardName: transaction.cardName || '',
    month: transaction.month,
    info: transaction.info || '',
    category: finalCategory
  };

  try {
    const res = await fetch(`${props.apiUrl}/api/finances/${transaction._id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar categoria');
    }

    emit('toast', { message: `Lançamento categorizado como "${finalCategory}"`, type: 'success' });
    
    // Animate out by removing from local array
    uncategorizedTransactions.value = uncategorizedTransactions.value.filter(t => t._id !== transaction._id);
    
    // Refresh dbCategories
    fetchDbCategories();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    savingId.value = null;
  }
};

onMounted(() => {
  fetchUncategorized();
  fetchDbCategories();
});
</script>

<template>
  <div class="categories-tab-container" style="max-width: 1000px; margin: 0 auto; padding: 0.5rem 1rem;">

    <!-- Quick Stats Card -->
    <div class="stats-panel" style="margin-bottom: 2rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.25rem;">Lançamentos Pendentes</div>
        <div style="font-size: 2rem; font-weight: 800; color: #fff; display: flex; align-items: baseline; gap: 0.5rem;">
          {{ uncategorizedTransactions.length }}
          <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">sem categoria atribuída</span>
        </div>
      </div>
      <button 
        @click="fetchUncategorized" 
        class="btn btn-secondary" 
        style="min-height: 42px; display: inline-flex; align-items: center; gap: 0.5rem;"
        :disabled="fetchLoading"
      >
        <i class="fa-solid fa-arrows-rotate" :class="{ 'fa-spin': fetchLoading }"></i> Atualizar Lista
      </button>
    </div>

    <!-- Loader -->
    <div v-if="fetchLoading && uncategorizedTransactions.length === 0" style="text-align: center; padding: 4rem 0;">
      <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--color-primary); margin-bottom: 1rem;"></i>
      <p style="color: var(--text-secondary); margin: 0;">Carregando transações pendentes...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="uncategorizedTransactions.length === 0" style="text-align: center; padding: 4rem 2rem; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
      <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(81, 207, 102, 0.1); border: 1px solid rgba(81, 207, 102, 0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto;">
        <i class="fa-solid fa-check" style="font-size: 1.5rem; color: #51cf66;"></i>
      </div>
      <h3 style="margin: 0 0 0.5rem 0; color: #fff; font-size: 1.2rem;">Tudo Organizado!</h3>
      <p style="margin: 0 auto; color: var(--text-secondary); max-width: 400px; font-size: 0.85rem; line-height: 1.5;">
        Não há lançamentos marcados como "Outros" ou descategorizados. Seus dashboards estão 100% categorizados!
      </p>
    </div>

    <!-- Transactions List -->
    <div v-else class="uncategorized-list" style="display: flex; flex-direction: column; gap: 1rem;">
      <transition-group name="list">
        <div 
          v-for="t in uncategorizedTransactions" 
          :key="t._id" 
          class="uncategorized-card"
          style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; display: grid; grid-template-columns: 1.2fr 1.8fr; gap: 1.5rem; align-items: center; transition: all 0.3s ease;"
        >
          <!-- Left: Transaction Info -->
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 1rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;">
              {{ t.description }}
            </div>
            
            <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
              <span v-if="t.type === 'card'" style="color: var(--color-danger); font-weight: 600;"><i class="fa-solid fa-credit-card"></i> {{ t.cardName }}</span>
              <span v-else-if="t.type === 'fixed'" style="color: var(--color-warning); font-weight: 600;"><i class="fa-solid fa-thumbtack"></i> Gasto Fixo</span>
              <span v-else-if="t.type === 'income'" style="color: var(--color-success); font-weight: 600;"><i class="fa-solid fa-circle-down"></i> Receita</span>
              <span v-else style="color: var(--color-info); font-weight: 600;"><i class="fa-solid fa-tag"></i> Outro</span>
              
              <span>•</span>
              <span>Ref: {{ t.month }}</span>
              <span v-if="t.info">• {{ t.info }}</span>
            </div>
            
            <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">
              {{ formatCurrency(t.amount) }}
            </div>
          </div>

          <!-- Right: Categorization Controls -->
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <!-- Custom category input -->
            <div style="display: flex; gap: 0.5rem; width: 100%;">
              <input 
                type="text" 
                v-model="categoryInputs[t._id]" 
                :list="'categories-list-' + t._id"
                class="form-input" 
                placeholder="Selecione ou digite uma categoria..."
                style="flex-grow: 1; min-height: 38px; font-size: 0.85rem;"
                @keyup.enter="updateCategory(t, categoryInputs[t._id])"
              />
              <datalist :id="'categories-list-' + t._id">
                <option v-for="cat in allSuggestedCategories" :value="cat" :key="cat" />
              </datalist>
              
              <button 
                @click="updateCategory(t, categoryInputs[t._id])"
                class="btn btn-primary"
                style="padding: 0 1rem; min-height: 38px; display: inline-flex; align-items: center; justify-content: center;"
                :disabled="savingId === t._id"
              >
                <i v-if="savingId === t._id" class="fa-solid fa-circle-notch fa-spin"></i>
                <i v-else class="fa-solid fa-check"></i>
              </button>
            </div>

            <!-- Quick tag suggestions -->
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
              <span style="font-size: 0.75rem; color: var(--text-muted); align-self: center; margin-right: 0.25rem;">Sugestões rápidas:</span>
              <button 
                v-for="quickCat in (t.type === 'income' ? ['Salário', 'Outras Receitas'] : ['Alimentação', 'Transporte', 'Combustível', 'Moradia', 'Lazer / Viagens', 'Saúde', 'Assinaturas & Serviços', 'Compras / Vestuário'])"
                :key="quickCat"
                @click="updateCategory(t, quickCat)"
                class="quick-cat-pill"
                style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.7rem; padding: 0.2rem 0.6rem; border-radius: 20px; cursor: pointer; transition: all 0.2s ease;"
                onmouseover="this.style.background='rgba(99, 102, 241, 0.1)'; this.style.borderColor='rgba(99, 102, 241, 0.3)'; this.style.color='#fff';"
                onmouseout="this.style.background='rgba(255, 255, 255, 0.04)'; this.style.borderColor='var(--border-color)'; this.style.color='var(--text-secondary)';"
              >
                {{ quickCat }}
              </button>
            </div>
          </div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
/* List Transitions for dynamic slide-out animations */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

@media (max-width: 768px) {
  .uncategorized-card {
    grid-template-columns: 1fr !important;
    gap: 1rem !important;
  }
}
</style>
