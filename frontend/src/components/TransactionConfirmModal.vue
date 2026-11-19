<script setup>
import { ref, computed, onMounted } from 'vue';
import BaseModal from './BaseModal.vue';
import { formatCurrency } from '../utils/format';

const props = defineProps({
  suggestion: {
    type: Object,
    required: true
  },
  token: {
    type: String,
    required: true
  },
  apiUrl: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['close', 'saved', 'toast']);

const TYPE_OPTIONS = [
  { value: 'card', label: 'Cartão de crédito' },
  { value: 'cash', label: 'Dinheiro / Débito' },
  { value: 'variable', label: 'Outros gastos' },
  { value: 'fixed', label: 'Gasto fixo' },
  { value: 'income', label: 'Receita' }
];

const toMonthInput = (competence) => {
  const [month, year] = competence.split('/');
  return `${year}-${month}`;
};

const description = ref(props.suggestion.description || '');
const amount = ref(props.suggestion.amount || '');
const type = ref(props.suggestion.type || 'cash');
const cardName = ref(props.suggestion.cardName || '');
const installments = ref(props.suggestion.installments || 1);
const category = ref(props.suggestion.category || 'Outros');
const competence = ref(toMonthInput(props.suggestion.month));
const info = ref('');

const cards = ref([]);
const categories = ref([]);
const saving = ref(false);

const isCard = computed(() => type.value === 'card');
const showCardField = computed(() => type.value === 'card' || type.value === 'fixed');

const installmentPreview = computed(() => {
  const total = parseFloat(amount.value);
  const count = parseInt(installments.value, 10);
  if (!isCard.value || isNaN(total) || isNaN(count) || count < 2) return '';
  return `${count}x de ${formatCurrency(total / count)}`;
});

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${props.token}`
});

const fetchJson = async (path) => {
  try {
    const res = await fetch(`${props.apiUrl}${path}`, { headers: authHeaders() });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
};

onMounted(async () => {
  const [cardList, categoryList] = await Promise.all([
    fetchJson('/api/cards'),
    fetchJson('/api/finances/categories')
  ]);
  cards.value = cardList;
  categories.value = categoryList.filter(Boolean).sort((a, b) => a.localeCompare(b));
});

const validate = () => {
  if (!description.value.trim()) return 'Informe a descrição do lançamento.';
  if (isNaN(parseFloat(amount.value)) || parseFloat(amount.value) <= 0) return 'Informe o valor do lançamento.';
  if (isCard.value && !cardName.value) return 'Selecione o cartão de crédito.';
  if (!competence.value) return 'Informe a competência do lançamento.';
  return null;
};

const buildPayload = () => {
  const [year, month] = competence.value.split('-');
  const payload = {
    description: description.value.trim(),
    amount: parseFloat(amount.value),
    type: type.value,
    cardName: showCardField.value ? cardName.value : '',
    month: `${month}/${year}`,
    info: info.value.trim(),
    category: category.value.trim() || 'Outros'
  };
  const installmentCount = parseInt(installments.value, 10);
  if (isCard.value && installmentCount > 1) payload.installments = installmentCount;
  return payload;
};

const confirm = async () => {
  const error = validate();
  if (error) {
    emit('toast', { message: error, type: 'error' });
    return;
  }

  saving.value = true;
  try {
    const payload = buildPayload();
    const res = await fetch(`${props.apiUrl}/api/finances`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao salvar o lançamento');
    }
    emit('saved', payload.month);
  } catch (err) {
    emit('toast', { message: err.message, type: 'error' });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <BaseModal title="Confirmar lançamento" icon="fa-wand-magic-sparkles" max-width="480px" @close="emit('close')">
    <form class="confirm-form" @submit.prevent="confirm">
      <p v-if="suggestion.notes" class="confirm-notes">
        <i class="fa-solid fa-circle-info"></i> {{ suggestion.notes }}
      </p>

      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input type="text" v-model="description" class="form-input" required />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input type="number" step="0.01" min="0" v-model="amount" class="form-input" placeholder="0,00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Competência</label>
          <input type="month" v-model="competence" class="form-input" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select v-model="type" class="form-select">
          <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>

      <div v-if="showCardField" class="form-row-2">
        <div class="form-group">
          <label class="form-label">{{ isCard ? 'Cartão' : 'Cartão (opcional)' }}</label>
          <select v-model="cardName" class="form-select" :required="isCard">
            <option value="">{{ isCard ? 'Selecione' : 'Sem cartão' }}</option>
            <option v-for="card in cards" :key="card._id" :value="card.cardName">{{ card.cardName }}</option>
          </select>
        </div>
        <div v-if="isCard" class="form-group">
          <label class="form-label">Parcelas</label>
          <input type="number" min="1" max="48" v-model="installments" class="form-input" />
          <span v-if="installmentPreview" class="field-hint">{{ installmentPreview }}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Categoria</label>
        <input type="text" v-model="category" class="form-input" list="confirm-categories" />
        <datalist id="confirm-categories">
          <option v-for="cat in categories" :key="cat" :value="cat" />
        </datalist>
      </div>

      <div class="form-group">
        <label class="form-label">Observação</label>
        <input type="text" v-model="info" class="form-input" placeholder="Opcional" />
      </div>

      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving"><i class="fa-solid fa-spinner fa-spin"></i> Salvando...</span>
          <span v-else><i class="fa-solid fa-check"></i> Confirmar lançamento</span>
        </button>
      </div>

      <p v-if="suggestion.model" class="confirm-model">Interpretado por {{ suggestion.model }}</p>
    </form>
  </BaseModal>
</template>

<style scoped>
.confirm-form .form-group {
  margin-bottom: 0.9rem;
}

.confirm-notes {
  display: flex;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.6rem 0.75rem;
  border-radius: var(--radius-sm);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: var(--text-primary);
  font-size: 0.8rem;
}

.confirm-notes i {
  color: var(--color-warning);
  margin-top: 0.15rem;
}

.field-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.confirm-model {
  margin: 0.75rem 0 0;
  text-align: right;
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
