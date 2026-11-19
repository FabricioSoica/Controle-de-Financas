<script setup>
import { ref, computed, onMounted } from 'vue';
import BaseModal from './BaseModal.vue';
import { formatCurrency } from '../utils/format';
import { getCompetenceYM, DEFAULT_COMPETENCE_START_DAY } from '../utils/competence';

const props = defineProps({
  item: {
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
  },
  competenceStartDay: {
    type: Number,
    default: DEFAULT_COMPETENCE_START_DAY
  }
});

const emit = defineEmits(['close', 'purchased', 'toast']);

const description = ref(props.item.name);
const amount = ref(props.item.price || '');
const paymentType = ref('card');
const cardName = ref('');
const installments = ref(1);
const category = ref('Compras');
const competence = ref(getCompetenceYM(new Date(), props.competenceStartDay));
const info = ref(props.item.link || '');

const cards = ref([]);
const categories = ref([]);
const saving = ref(false);

const isCard = computed(() => paymentType.value === 'card');

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
  if (cards.value.length > 0) cardName.value = cards.value[0].cardName;
});

const buildTransactionPayload = () => {
  const [year, month] = competence.value.split('-');
  const payload = {
    description: description.value.trim(),
    amount: parseFloat(amount.value),
    type: paymentType.value,
    cardName: isCard.value ? cardName.value : '',
    month: `${month}/${year}`,
    info: info.value.trim(),
    category: category.value.trim() || 'Outros'
  };
  const installmentCount = parseInt(installments.value, 10);
  if (isCard.value && installmentCount > 1) payload.installments = installmentCount;
  return payload;
};

const validate = () => {
  if (!description.value.trim()) return 'Informe a descrição da compra.';
  if (isNaN(parseFloat(amount.value)) || parseFloat(amount.value) <= 0) return 'Informe quanto você pagou.';
  if (isCard.value && !cardName.value) return 'Selecione o cartão usado na compra.';
  if (!competence.value) return 'Informe a competência do lançamento.';
  return null;
};

const confirmPurchase = async () => {
  const error = validate();
  if (error) {
    emit('toast', { message: error, type: 'error' });
    return;
  }

  saving.value = true;
  try {
    const transactionRes = await fetch(`${props.apiUrl}/api/finances`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(buildTransactionPayload())
    });
    if (!transactionRes.ok) {
      const err = await transactionRes.json();
      throw new Error(err.error || 'Erro ao criar o lançamento da compra');
    }

    const deleteRes = await fetch(`${props.apiUrl}/api/shopping/${props.item._id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!deleteRes.ok) {
      emit('toast', { message: 'Lançamento criado, mas não foi possível remover o item da lista.', type: 'error' });
    }

    emit('purchased');
  } catch (err) {
    emit('toast', { message: err.message, type: 'error' });
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <BaseModal title="Registrar compra" icon="fa-bag-shopping" max-width="480px" @close="emit('close')">
    <form class="purchase-form" @submit.prevent="confirmPurchase">
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <input type="text" v-model="description" class="form-input" required />
      </div>

      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Valor pago (R$)</label>
          <input type="number" step="0.01" min="0" v-model="amount" class="form-input" placeholder="0,00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Competência</label>
          <input type="month" v-model="competence" class="form-input" required />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Forma de pagamento</label>
        <div class="payment-toggle">
          <button type="button" :class="{ active: isCard }" @click="paymentType = 'card'">
            <i class="fa-solid fa-credit-card"></i> Cartão de crédito
          </button>
          <button type="button" :class="{ active: !isCard }" @click="paymentType = 'cash'">
            <i class="fa-solid fa-money-bill-wave"></i> Dinheiro / Débito
          </button>
        </div>
      </div>

      <div v-if="isCard" class="form-row-2">
        <div class="form-group">
          <label class="form-label">Cartão</label>
          <select v-model="cardName" class="form-select" required>
            <option value="" disabled>Selecione</option>
            <option v-for="card in cards" :key="card._id" :value="card.cardName">{{ card.cardName }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Parcelas</label>
          <input type="number" min="1" max="48" v-model="installments" class="form-input" />
          <span v-if="installmentPreview" class="field-hint">{{ installmentPreview }}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Categoria</label>
        <input type="text" v-model="category" class="form-input" list="purchase-categories" placeholder="Ex: Compras" />
        <datalist id="purchase-categories">
          <option v-for="cat in categories" :key="cat" :value="cat" />
        </datalist>
      </div>

      <div class="form-group">
        <label class="form-label">Observação</label>
        <input type="text" v-model="info" class="form-input" placeholder="Opcional" />
      </div>

      <p class="purchase-note">O lançamento será criado e o item sairá da lista de compras.</p>

      <div class="purchase-actions">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving"><i class="fa-solid fa-spinner fa-spin"></i> Salvando...</span>
          <span v-else><i class="fa-solid fa-check"></i> Confirmar compra</span>
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.purchase-form .form-group {
  margin-bottom: 0.9rem;
}

.payment-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.payment-toggle button {
  padding: 0.55rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: var(--transition-smooth);
}

.payment-toggle button.active {
  border-color: var(--color-primary);
  background: rgba(99, 102, 241, 0.12);
  color: var(--text-primary);
  font-weight: 600;
}

.field-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.purchase-note {
  margin: 0.25rem 0 1rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.purchase-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
