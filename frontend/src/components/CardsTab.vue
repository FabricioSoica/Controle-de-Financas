<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { formatCurrency, formatShortDate } from '../utils/format';
import { getCompetenceYM, DEFAULT_COMPETENCE_START_DAY } from '../utils/competence';
import BaseModal from './BaseModal.vue';

const props = defineProps({
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
  },
  settingsVersion: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['toast', 'open-settings']);

const summary = ref(null);
const loading = ref(false);
const currentMonth = getCompetenceYM(new Date(), props.competenceStartDay);
const selectedMonth = ref(currentMonth);

const formatMonthLabel = (ym) => {
  const [year, month] = ym.split('-');
  return `${month}/${year}`;
};

const changeMonth = (delta) => {
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  selectedMonth.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const periodView = computed(() => {
  if (selectedMonth.value < currentMonth) return { label: 'Retrospectiva', icon: 'fa-clock-rotate-left', className: 'past' };
  if (selectedMonth.value > currentMonth) return { label: 'Projeção', icon: 'fa-chart-line', className: 'future' };
  return { label: 'Atual', icon: 'fa-location-dot', className: 'current' };
});

const isCurrentView = computed(() => periodView.value.className === 'current');

const detailCard = ref(null);

const detailGroups = computed(() => {
  if (!detailCard.value) return [];
  const groups = new Map();
  for (const item of detailCard.value.items) {
    if (!groups.has(item.month)) groups.set(item.month, { month: item.month, total: 0, items: [] });
    const group = groups.get(item.month);
    group.total += item.amount;
    group.items.push(item);
  }
  return [...groups.values()];
});

const fetchLimits = async () => {
  if (!selectedMonth.value) return;
  loading.value = true;
  try {
    const [year, month] = selectedMonth.value.split('-');
    const res = await fetch(`${props.apiUrl}/api/cards/limits?month=${month}-${year}`, {
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

watch(selectedMonth, fetchLimits);
watch(() => props.settingsVersion, fetchLimits);
onMounted(fetchLimits);
</script>

<template>
  <div>
    <div class="filter-bar">
      <div class="month-picker-container">
        <span class="month-picker-label"><i class="fa-solid fa-calendar-days"></i> Competência:</span>
        <div class="month-nav-group">
          <button type="button" class="btn-nav-month" @click="changeMonth(-1)" title="Mês Anterior">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <input type="month" v-model="selectedMonth" class="month-input" />
          <button type="button" class="btn-nav-month" @click="changeMonth(1)" title="Mês Seguinte">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
        <button type="button" class="btn-today" @click="selectedMonth = currentMonth">Mês Atual</button>
      </div>

      <div class="filter-actions">
        <span class="period-badge" :class="periodView.className">
          <i class="fa-solid" :class="periodView.icon"></i> {{ periodView.label }}
        </span>
        <button type="button" class="btn-today" @click="emit('open-settings')">
          <i class="fa-solid fa-gear"></i> Configurar Cartões
        </button>
      </div>
    </div>

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
        <div class="summary-card limits-invoice">
          <span class="card-icon"><i class="fa-solid fa-file-invoice-dollar"></i></span>
          <div class="card-title">Faturas de {{ formatMonthLabel(selectedMonth) }}</div>
          <div class="card-value text-warning">{{ formatCurrency(summary.totals.invoiceAmount) }}</div>
          <div class="card-sub-calc">Soma das faturas dos cartões</div>
        </div>
      </div>

      <div class="limits-grid">
        <div 
          v-for="card in summary.cards" 
          :key="card._id" 
          class="limit-card" 
          :class="{ 'best-for-today': isCurrentView && card._id === summary.bestCardForToday }"
          @click="detailCard = card"
          role="button"
          tabindex="0"
          @keydown.enter="detailCard = card"
        >
          <span v-if="isCurrentView && card._id === summary.bestCardForToday" class="best-card-badge">
            <i class="fa-solid fa-star"></i> Melhor para comprar hoje
          </span>
          <div class="limit-card-header">
            <span class="limit-card-name"><i class="fa-solid fa-credit-card"></i> {{ card.cardName }}</span>
            <span class="limit-card-days">Fecha {{ card.closingDay }} · Vence {{ card.dueDay }}</span>
          </div>

          <div class="limit-invoice">
            <span class="limit-label">Fatura {{ formatMonthLabel(selectedMonth) }} · vence {{ formatShortDate(card.invoice.dueDate) }}</span>
            <span class="limit-invoice-value">{{ formatCurrency(card.invoice.amount) }}</span>
          </div>

          <div v-if="isCurrentView" class="limit-purchase-today">
            <i class="fa-solid fa-cart-shopping"></i>
            Comprando hoje, paga em {{ formatShortDate(card.purchaseToday.dueDate) }}
            <strong>({{ card.purchaseToday.daysToPay }} dias)</strong>
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
            <button type="button" class="btn-link" @click.stop="emit('open-settings')">
              <i class="fa-solid fa-gear"></i> Definir limite deste cartão
            </button>
          </template>

          <span class="limit-details-link">
            <i class="fa-solid fa-list-ul"></i> Ver lançamentos ({{ card.items.length }})
          </span>
        </div>
      </div>

      <BaseModal 
        v-if="detailCard" 
        :title="`${detailCard.cardName} · em uso em ${formatMonthLabel(selectedMonth)}`" 
        icon="fa-credit-card" 
        max-width="560px"
        @close="detailCard = null"
      >
        <div v-if="detailGroups.length === 0" class="details-empty">
          Nenhum lançamento em aberto neste cartão.
        </div>
        <div v-for="group in detailGroups" :key="group.month" class="details-group">
          <div class="details-group-header">
            <span>Fatura {{ group.month }}</span>
            <span>{{ formatCurrency(group.total) }}</span>
          </div>
          <div v-for="item in group.items" :key="item._id" class="details-item">
            <div class="details-item-info">
              <span class="details-item-desc">{{ item.description }}</span>
              <span class="details-item-meta">
                {{ item.category }}
                <span v-if="item.type === 'fixed'" class="details-item-tag">Assinatura</span>
              </span>
            </div>
            <span class="details-item-amount">{{ formatCurrency(item.amount) }}</span>
          </div>
        </div>
        <div class="details-total">
          <span>Total em uso</span>
          <span>{{ formatCurrency(detailCard.used) }}</span>
        </div>
      </BaseModal>

      <p class="limits-footnote">
        <template v-if="periodView.className === 'future'">
          Projeção para {{ formatMonthLabel(selectedMonth) }}: parcelas já lançadas que ainda estarão em aberto e assinaturas fixas do mês. Compras novas não entram até serem lançadas.
        </template>
        <template v-else>
          Em uso em {{ formatMonthLabel(selectedMonth) }}: compras feitas até essa competência com parcelas ainda em aberto (incluindo as futuras) e assinaturas fixas do mês.
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped>
.filter-bar {
  flex-wrap: wrap;
  gap: 0.75rem;
}

.month-nav-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.period-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid;
}

.period-badge.past {
  color: var(--text-secondary);
  border-color: var(--border-color);
  background: rgba(255, 255, 255, 0.03);
}

.period-badge.current {
  color: var(--color-success);
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.period-badge.future {
  color: var(--color-primary);
  border-color: rgba(99, 102, 241, 0.3);
  background: rgba(99, 102, 241, 0.08);
}

.limits-total::before { background-color: var(--color-primary); }
.limits-available::before { background-color: var(--color-success); }
.limits-used::before { background-color: var(--color-danger); }
.limits-invoice::before { background-color: var(--color-warning); }

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

.limit-card {
  cursor: pointer;
  transition: var(--transition-smooth);
}

.limit-card:hover,
.limit-card:focus-visible {
  border-color: rgba(99, 102, 241, 0.4);
  outline: none;
}

.limit-details-link {
  font-size: 0.8rem;
  color: var(--color-primary);
  margin-top: auto;
}

.details-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 1.5rem 0;
}

.details-group + .details-group {
  margin-top: 1rem;
}

.details-group-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-warning);
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border-color);
}

.details-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.details-item-info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.details-item-desc {
  color: var(--text-primary);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.details-item-meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.details-item-tag {
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.65rem;
  color: var(--color-primary);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.details-item-amount {
  font-weight: 600;
  color: var(--color-danger);
  white-space: nowrap;
}

.details-total {
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
  font-weight: 700;
  color: var(--text-primary);
}

.limit-card.best-for-today {
  border-color: rgba(16, 185, 129, 0.45);
  box-shadow: 0 0 20px rgba(16, 185, 129, 0.12);
}

.best-card-badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-success);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.limit-purchase-today {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.limit-purchase-today i {
  margin-right: 0.25rem;
  opacity: 0.7;
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

.limit-invoice {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-sm);
}

.limit-invoice-value {
  font-weight: 700;
  color: var(--color-warning);
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

@media (max-width: 768px) {
  .filter-actions {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .limit-card-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
