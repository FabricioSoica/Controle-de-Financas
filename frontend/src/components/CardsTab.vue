<script setup>
import { ref, onMounted } from 'vue';
import { formatCurrency } from '../utils/format';

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

const emit = defineEmits(['toast', 'open-settings']);

const summary = ref(null);
const loading = ref(false);

const fetchLimits = async () => {
  loading.value = true;
  try {
    const res = await fetch(`${props.apiUrl}/api/cards/limits`, {
      headers: { 'Authorization': `Bearer ${props.token}` }
    });
    if (!res.ok) throw new Error('Falha ao buscar limites dos cartões');
    summary.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    loading.value = false;
  }
};

const usageLevel = (percent) => {
  if (percent === null) return 'unknown';
  if (percent >= 80) return 'high';
  if (percent >= 50) return 'medium';
  return 'low';
};

const barWidth = (percent) => `${Math.min(Math.max(percent || 0, 0), 100)}%`;

onMounted(fetchLimits);
</script>

<template>
  <div>
    <div v-if="loading && !summary" class="empty-state">
      <i class="fa-solid fa-spinner fa-spin"></i> Carregando limites...
    </div>

    <div v-else-if="summary && summary.cards.length === 0" class="empty-state">
      Nenhum cartão cadastrado.
      <button type="button" class="btn-link" @click="emit('open-settings')">Cadastrar cartões</button>
    </div>

    <template v-else-if="summary">
      <div class="summary-grid">
        <div class="summary-card limits-total">
          <span class="card-icon"><i class="fa-solid fa-wallet"></i></span>
          <div class="card-title">Limite Total</div>
          <div class="card-value">{{ formatCurrency(summary.totals.limit) }}</div>
          <div class="card-sub-calc">Soma de todos os cartões</div>
        </div>
        <div class="summary-card limits-available">
          <span class="card-icon"><i class="fa-solid fa-circle-check"></i></span>
          <div class="card-title">Livre</div>
          <div class="card-value text-success">{{ formatCurrency(summary.totals.available) }}</div>
          <div class="card-sub-calc">Disponível para compras</div>
        </div>
        <div class="summary-card limits-used">
          <span class="card-icon"><i class="fa-solid fa-credit-card"></i></span>
          <div class="card-title">Em Uso</div>
          <div class="card-value text-danger">{{ formatCurrency(summary.totals.used) }}</div>
          <div class="card-sub-calc">
            <span v-if="summary.totals.usagePercent !== null">{{ summary.totals.usagePercent.toFixed(1) }}% do limite</span>
            <span v-else>Faturas abertas e parcelas futuras</span>
          </div>
        </div>
      </div>

      <div class="limits-grid">
        <div v-for="card in summary.cards" :key="card._id" class="limit-card">
          <div class="limit-card-header">
            <span class="limit-card-name"><i class="fa-solid fa-credit-card"></i> {{ card.cardName }}</span>
            <span class="limit-card-days">Fecha {{ card.closingDay }} · Vence {{ card.dueDay }}</span>
          </div>

          <template v-if="card.limit > 0">
            <div class="limit-bar">
              <div class="limit-bar-fill" :class="usageLevel(card.usagePercent)" :style="{ width: barWidth(card.usagePercent) }"></div>
            </div>
            <div class="limit-percent" :class="usageLevel(card.usagePercent)">{{ card.usagePercent.toFixed(1) }}% usado</div>

            <div class="limit-values">
              <div>
                <span class="limit-label">Livre</span>
                <span class="limit-value" :class="card.available >= 0 ? 'text-success' : 'text-danger'">{{ formatCurrency(card.available) }}</span>
              </div>
              <div>
                <span class="limit-label">Em uso</span>
                <span class="limit-value text-danger">{{ formatCurrency(card.used) }}</span>
              </div>
              <div>
                <span class="limit-label">Limite</span>
                <span class="limit-value">{{ formatCurrency(card.limit) }}</span>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="limit-values">
              <div>
                <span class="limit-label">Em uso</span>
                <span class="limit-value text-danger">{{ formatCurrency(card.used) }}</span>
              </div>
            </div>
            <button type="button" class="btn-link" @click="emit('open-settings')">
              <i class="fa-solid fa-gear"></i> Definir limite deste cartão
            </button>
          </template>
        </div>
      </div>

      <p class="limits-footnote">
        Em uso = compras no cartão da competência {{ summary.competence }} em diante (incluindo parcelas futuras) e assinaturas fixas do mês atual.
      </p>
    </template>
  </div>
</template>

<style scoped>
.limits-total::before { background-color: var(--color-primary); }
.limits-available::before { background-color: var(--color-success); }
.limits-used::before { background-color: var(--color-danger); }

.limits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.limit-card {
  background: rgba(17, 24, 39, 0.65);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.limit-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}

.limit-card-name {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text-primary);
}

.limit-card-name i {
  color: var(--color-danger);
  opacity: 0.8;
  margin-right: 0.25rem;
}

.limit-card-days {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.limit-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  overflow: hidden;
}

.limit-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.limit-bar-fill.low { background: var(--color-success); }
.limit-bar-fill.medium { background: var(--color-warning); }
.limit-bar-fill.high { background: var(--color-danger); }

.limit-percent {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: -0.4rem;
}

.limit-percent.low { color: var(--color-success); }
.limit-percent.medium { color: var(--color-warning); }
.limit-percent.high { color: var(--color-danger); }

.limit-values {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.limit-values > div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.limit-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.limit-value {
  font-weight: 600;
  font-size: 0.95rem;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
  text-align: left;
}

.btn-link:hover {
  text-decoration: underline;
}

.empty-state .btn-link {
  margin-left: 0.5rem;
  font-size: inherit;
}

.limits-footnote {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}

@media (max-width: 480px) {
  .limit-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
