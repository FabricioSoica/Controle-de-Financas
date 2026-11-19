<script setup>
import { ref, computed } from 'vue';
import { formatCurrency } from '../utils/format';
import { getSeriesColor } from '../utils/chartPalette';

const props = defineProps({
  projection: {
    type: Object,
    required: true
  },
  selectedCompetence: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['select-competence']);

const hoveredCompetence = ref(null);
const showTable = ref(false);

const series = computed(() => props.projection.cards
  .map((card, index) => ({ ...card, color: getSeriesColor(index) }))
  .filter(card => props.projection.months.some(m => m.byCard[card._id] > 0)));

const TARGET_TICKS = 4;
const NICE_STEPS = [1, 2, 2.5, 5, 10];

const axisStep = computed(() => {
  const maxTotal = Math.max(...props.projection.months.map(m => m.total), 0);
  if (maxTotal === 0) return 1;
  const rough = (maxTotal * 1.1) / TARGET_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  return NICE_STEPS.find(step => step * magnitude >= rough) * magnitude;
});

const axisMax = computed(() => {
  const maxTotal = Math.max(...props.projection.months.map(m => m.total), 0);
  return Math.max(Math.ceil((maxTotal * 1.1) / axisStep.value), 1) * axisStep.value;
});

const gridLines = computed(() => {
  const lines = [];
  for (let value = axisStep.value; value <= axisMax.value + 1e-9; value += axisStep.value) lines.push(value);
  return lines;
});

const releaseCompetence = computed(() => {
  const released = props.projection.months.find(m => m.total === 0);
  return released ? released.competence : null;
});

const formatAxisValue = (value) => (value >= 1000 ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : value.toFixed(0));

const formatShortCompetence = (competence) => {
  const [month, year] = competence.split('/');
  return `${month}/${year.slice(2)}`;
};

const segmentHeight = (value) => `${(value / axisMax.value) * 100}%`;

const visibleSegments = (month) => series.value.filter(card => month.byCard[card._id] > 0);

const freeAmount = (month) => props.projection.totalLimit - month.total;
</script>

<template>
  <div class="projection-card">
    <div class="projection-header">
      <div>
        <h3 class="projection-title"><i class="fa-solid fa-chart-column"></i> Liberação do limite</h3>
        <p class="projection-subtitle">
          Quanto do limite continua comprometido com o que já foi lançado.
          <template v-if="releaseCompetence">Tudo liberado em <strong>{{ releaseCompetence }}</strong>.</template>
        </p>
      </div>
      <button type="button" class="btn-today" @click="showTable = !showTable">
        <i class="fa-solid" :class="showTable ? 'fa-chart-column' : 'fa-table'"></i>
        {{ showTable ? 'Ver gráfico' : 'Ver tabela' }}
      </button>
    </div>

    <div v-if="series.length > 1" class="projection-legend">
      <span v-for="card in series" :key="card._id" class="legend-item">
        <span class="legend-swatch" :style="{ background: card.color }"></span>{{ card.cardName }}
      </span>
    </div>

    <div v-if="!showTable" class="projection-chart">
      <div class="projection-grid">
        <div v-for="line in gridLines" :key="line" class="grid-line" :style="{ bottom: segmentHeight(line) }">
          <span class="grid-label">{{ formatAxisValue(line) }}</span>
        </div>
      </div>

      <div class="projection-bars">
        <button
          v-for="month in projection.months"
          :key="month.competence"
          type="button"
          class="bar-slot"
          :class="{ selected: month.competence === selectedCompetence }"
          @mouseenter="hoveredCompetence = month.competence"
          @mouseleave="hoveredCompetence = null"
          @focus="hoveredCompetence = month.competence"
          @blur="hoveredCompetence = null"
          @click="emit('select-competence', month.competence)"
        >
          <div class="bar-area">
            <div class="bar-stack" :style="{ height: segmentHeight(month.total) }">
              <span v-if="month.total > 0" class="bar-total">{{ formatAxisValue(month.total) }}</span>
              <div
                v-for="card in visibleSegments(month)"
                :key="card._id"
                class="bar-segment"
                :style="{ flexGrow: month.byCard[card._id], background: card.color }"
              ></div>
            </div>

            <div v-if="hoveredCompetence === month.competence" class="bar-tooltip">
              <div class="tooltip-title">{{ month.competence }}</div>
              <div v-for="card in visibleSegments(month)" :key="card._id" class="tooltip-row">
                <span><span class="legend-swatch" :style="{ background: card.color }"></span>{{ card.cardName }}</span>
                <span>{{ formatCurrency(month.byCard[card._id]) }}</span>
              </div>
              <div class="tooltip-row tooltip-total">
                <span>Em uso</span>
                <span>{{ formatCurrency(month.total) }}</span>
              </div>
              <div v-if="projection.totalLimit > 0" class="tooltip-row">
                <span>Livre</span>
                <span>{{ formatCurrency(freeAmount(month)) }}</span>
              </div>
            </div>
          </div>
          <span class="bar-label">{{ formatShortCompetence(month.competence) }}</span>
        </button>
      </div>
    </div>

    <div v-else class="projection-table-wrapper custom-scroll">
      <table class="projection-table">
        <thead>
          <tr>
            <th>Competência</th>
            <th v-for="card in series" :key="card._id">{{ card.cardName }}</th>
            <th>Em uso</th>
            <th v-if="projection.totalLimit > 0">Livre</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="month in projection.months" :key="month.competence" @click="emit('select-competence', month.competence)">
            <td>{{ month.competence }}</td>
            <td v-for="card in series" :key="card._id">{{ formatCurrency(month.byCard[card._id]) }}</td>
            <td><strong>{{ formatCurrency(month.total) }}</strong></td>
            <td v-if="projection.totalLimit > 0">{{ formatCurrency(freeAmount(month)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="projection-hint">Clique em um mês para ver os cartões naquela competência. Compras novas não entram até serem lançadas.</p>
  </div>
</template>

<style scoped>
.projection-card {
  margin-top: 1.5rem;
  background: rgba(17, 24, 39, 0.65);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
}

.projection-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.projection-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.projection-title i {
  color: var(--color-primary);
}

.projection-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.projection-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin-top: 1rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.legend-item {
  display: inline-flex;
  align-items: center;
}

.legend-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 0.4rem;
  flex-shrink: 0;
}

.projection-chart {
  position: relative;
  height: 240px;
  margin-top: 1.25rem;
  padding-left: 2.25rem;
}

.projection-grid {
  position: absolute;
  inset: 0 0 1.5rem 2.25rem;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.grid-label {
  position: absolute;
  left: -2.25rem;
  top: -0.5rem;
  width: 2rem;
  text-align: right;
  font-size: 0.65rem;
  color: var(--text-muted);
}

.projection-bars {
  position: relative;
  display: flex;
  height: 100%;
  gap: 0.25rem;
}

.bar-slot {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: var(--radius-sm);
  color: inherit;
  font: inherit;
}

.bar-slot:hover .bar-area,
.bar-slot:focus-visible .bar-area {
  background: rgba(255, 255, 255, 0.03);
}

.bar-slot:focus-visible {
  outline: none;
}

.bar-area {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  border-bottom: 1px solid var(--border-color);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.bar-stack {
  position: relative;
  width: min(60%, 36px);
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  transition: height 0.4s ease;
}

.bar-segment {
  flex-basis: 0;
  min-height: 2px;
}

.bar-stack .bar-segment:last-child {
  border-radius: 4px 4px 0 0;
}

.bar-total {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.bar-label {
  height: 1.5rem;
  line-height: 1.5rem;
  font-size: 0.65rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.bar-slot.selected .bar-label {
  color: var(--text-primary);
  font-weight: 700;
}

.bar-slot.selected .bar-area {
  background: rgba(99, 102, 241, 0.08);
}

.bar-tooltip {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  min-width: 190px;
  padding: 0.6rem 0.75rem;
  background: #0b0f19;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  font-size: 0.75rem;
  text-align: left;
  pointer-events: none;
}

.bar-slot:first-child .bar-tooltip {
  left: 0;
  transform: none;
}

.bar-slot:last-child .bar-tooltip {
  left: auto;
  right: 0;
  transform: none;
}

.tooltip-title {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.35rem;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: var(--text-secondary);
  padding: 0.1rem 0;
}

.tooltip-row span:first-child {
  display: inline-flex;
  align-items: center;
}

.tooltip-total {
  margin-top: 0.25rem;
  padding-top: 0.3rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-primary);
  font-weight: 600;
}

.projection-table-wrapper {
  margin-top: 1rem;
  overflow-x: auto;
}

.projection-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.projection-table th,
.projection-table td {
  padding: 0.5rem 0.6rem;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.projection-table th:first-child,
.projection-table td:first-child {
  text-align: left;
}

.projection-table th {
  color: var(--text-secondary);
  font-weight: 600;
}

.projection-table tbody tr {
  cursor: pointer;
}

.projection-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}

@media (max-width: 480px) {
  .bar-slot:nth-child(even):not(.selected) .bar-label {
    visibility: hidden;
  }

  .bar-total {
    font-size: 0.6rem;
  }
}

.projection-hint {
  margin: 0.75rem 0 0;
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
