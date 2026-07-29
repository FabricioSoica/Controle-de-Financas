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

const emit = defineEmits(['toast']);

const now = new Date();
const currentYear = now.getFullYear();

const startMonth = ref(`${currentYear}-01`);
const endMonth = ref(`${currentYear}-12`);

const evolutionData = ref([]);
const loading = ref(false);

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

const currentYearDisplay = computed(() => {
  if (!startMonth.value || !endMonth.value) return '';
  const sYear = startMonth.value.split('-')[0];
  const eYear = endMonth.value.split('-')[0];
  return sYear === eYear ? sYear : `${sYear} – ${eYear}`;
});

const periodLabel = computed(() => {
  const formatM = (str) => {
    if (!str) return '';
    const [y, m] = str.split('-');
    return `${m}/${y}`;
  };
  return `${formatM(startMonth.value)} até ${formatM(endMonth.value)}`;
});

const maxMonthValue = computed(() => {
  let max = 100;
  evolutionData.value.forEach(d => {
    const totalExp = d.card + d.variable + d.fixed + (d.cash || 0);
    const val = Math.max(d.income, totalExp);
    if (val > max) max = val;
  });
  return max;
});

const totalYearIncome = computed(() => {
  return evolutionData.value.reduce((sum, m) => sum + (m.income || 0), 0);
});

const totalYearCard = computed(() => {
  return evolutionData.value.reduce((sum, m) => sum + (m.card || 0), 0);
});

const totalYearFixed = computed(() => {
  return evolutionData.value.reduce((sum, m) => sum + (m.fixed || 0), 0);
});

const totalYearVariable = computed(() => {
  return evolutionData.value.reduce((sum, m) => sum + (m.variable || 0), 0);
});

const totalYearCash = computed(() => {
  return evolutionData.value.reduce((sum, m) => sum + (m.cash || 0), 0);
});

const totalYearExpenses = computed(() => {
  return totalYearCard.value + totalYearFixed.value + totalYearVariable.value + totalYearCash.value;
});

const totalYearNet = computed(() => {
  return totalYearIncome.value - totalYearExpenses.value;
});

const fetchEvolutionData = async () => {
  if (!props.token) return;
  try {
    loading.value = true;
    if (!startMonth.value || !endMonth.value) {
      loading.value = false;
      return;
    }

    const url = `${props.apiUrl}/api/finances/summary/evolution?startMonth=${startMonth.value}&endMonth=${endMonth.value}`;
    const res = await fetch(url, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar histórico de evolução');
    evolutionData.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    loading.value = false;
  }
};

const changeYear = (offset) => {
  if (!startMonth.value || !endMonth.value) return;
  const [sY, sM] = startMonth.value.split('-');
  const [eY, eM] = endMonth.value.split('-');

  const newSY = parseInt(sY, 10) + offset;
  const newEY = parseInt(eY, 10) + offset;

  if (newSY >= 2000 && newEY <= 2100) {
    startMonth.value = `${newSY}-${sM}`;
    endMonth.value = `${newEY}-${eM}`;
  }
};

const setToCurrentYear = () => {
  const y = new Date().getFullYear();
  startMonth.value = `${y}-01`;
  endMonth.value = `${y}-12`;
};

watch([startMonth, endMonth], () => {
  fetchEvolutionData();
});

onMounted(() => {
  fetchEvolutionData();
});
</script>

<template>
  <div class="evolution-container">
    <!-- Top Filter & Period Selection Header -->
    <div class="filter-bar" style="position: relative; z-index: 10; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.25rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); backdrop-filter: var(--glass-blur);">
      
      <!-- Date Range Inputs (De ... Até ...) -->
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <span class="month-picker-label" style="font-weight: 700; color: var(--text-secondary); font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
          <i class="fa-solid fa-calendar-days" style="color: var(--color-primary);"></i> Período:
        </span>

        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">De</span>
          <input 
            type="month" 
            v-model="startMonth" 
            class="month-input" 
            style="font-size: 0.85rem; padding: 0.45rem 0.65rem;"
          />
        </div>

        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Até</span>
          <input 
            type="month" 
            v-model="endMonth" 
            class="month-input" 
            style="font-size: 0.85rem; padding: 0.45rem 0.65rem;"
          />
        </div>
      </div>

      <!-- Arrow Controls and Today Shortcut -->
      <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <button 
            type="button" 
            @click="changeYear(-1)" 
            class="btn-nav-year"
            title="Voltar 1 Ano"
          >
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <span style="font-weight: 800; font-size: 0.95rem; color: var(--text-primary); padding: 0 0.35rem; min-width: 50px; text-align: center;">
            {{ currentYearDisplay }}
          </span>
          <button 
            type="button" 
            @click="changeYear(1)" 
            class="btn-nav-year"
            title="Avançar 1 Ano"
          >
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>

        <button 
          class="btn-today" 
          @click="setToCurrentYear"
          type="button"
        >
          Ano Atual
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; backdrop-filter: var(--glass-blur); box-shadow: var(--card-shadow); display: flex; align-items: center; gap: 1rem;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(16, 185, 129, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: var(--color-success);">
          <i class="fa-solid fa-arrow-trend-up"></i>
        </div>
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Receitas Totais ({{ periodLabel }})</span>
          <h4 style="margin: 0.2rem 0 0 0; font-size: 1.25rem; font-weight: 800; color: var(--color-success);">{{ formatCurrency(totalYearIncome) }}</h4>
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; backdrop-filter: var(--glass-blur); box-shadow: var(--card-shadow); display: flex; align-items: center; gap: 1rem;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(244, 63, 94, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: var(--color-danger);">
          <i class="fa-solid fa-arrow-trend-down"></i>
        </div>
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Gastos Totais ({{ periodLabel }})</span>
          <h4 style="margin: 0.2rem 0 0 0; font-size: 1.25rem; font-weight: 800; color: var(--color-danger);">{{ formatCurrency(totalYearExpenses) }}</h4>
        </div>
      </div>

      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; backdrop-filter: var(--glass-blur); box-shadow: var(--card-shadow); display: flex; align-items: center; gap: 1rem;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(99, 102, 241, 0.12); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; color: var(--color-primary);">
          <i class="fa-solid fa-scale-balanced"></i>
        </div>
        <div>
          <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.5px;">Resultado Líquido ({{ periodLabel }})</span>
          <h4 style="margin: 0.2rem 0 0 0; font-size: 1.25rem; font-weight: 800;" :style="{ color: totalYearNet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }">
            {{ formatCurrency(totalYearNet) }}
          </h4>
        </div>
      </div>
    </div>

    <!-- Custom Flexbox Bar Chart Card -->
    <div class="chart-card">
      <div class="chart-header">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); margin: 0;">
            <i class="fa-solid fa-chart-simple" style="color: var(--color-primary);"></i>
            Evolução Financeira - {{ periodLabel }}
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; margin-bottom: 0;">
            Comparativo mês a mês entre Receitas e Gastos Totais (Cartão + Fixo + Outros + Dinheiro)
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
                :style="{ height: maxMonthValue ? (((m.card + m.fixed + m.variable + (m.cash || 0)) / maxMonthValue) * 100) + '%' : '0%' }"
              >
                <span class="bar-tooltip">
                  <strong>Gastos:</strong> {{ formatCurrency(m.card + m.fixed + m.variable + (m.cash || 0)) }}
                  <br/>
                  <span style="font-size: 0.65rem; color: var(--text-muted);">
                    Cartão: {{ formatCurrency(m.card) }} | Fixo: {{ formatCurrency(m.fixed) }} | Outros: {{ formatCurrency(m.variable) }} | Dinheiro: {{ formatCurrency(m.cash || 0) }}
                  </span>
                </span>
              </div>
            </div>
            <span class="month-bar-label">{{ m.monthLabel }}</span>
          </div>
          
          <div v-if="loading" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.9rem;">
            <i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem;"></i> Carregando dados do período...
          </div>
          <div v-else-if="evolutionData.length === 0" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.9rem;">
            <i class="fa-solid fa-folder-open" style="margin-right: 0.5rem;"></i> Nenhuma informação financeira encontrada para o período selecionado.
          </div>
        </div>
      </div>
    </div>
    
    <!-- Detailed History Table -->
    <div class="transactions-card">
      <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; margin-top: 0;">
        <i class="fa-solid fa-table-list" style="color: var(--color-primary);"></i>
        Detalhamento Mensal ({{ periodLabel }})
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
              <th>Dinheiro (-)</th>
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
              <td class="text-cash">{{ formatCurrency(m.cash || 0) }}</td>
              <td style="font-weight: 600;">{{ formatCurrency(m.card + m.fixed + m.variable + (m.cash || 0)) }}</td>
              <td>
                <span :class="(m.income - (m.card + m.fixed + m.variable + (m.cash || 0))) >= 0 ? 'badge-surplus' : 'badge-deficit'">
                  {{ formatCurrency(m.income - (m.card + m.fixed + m.variable + (m.cash || 0))) }}
                </span>
              </td>
            </tr>
            <tr v-if="evolutionData.length === 0">
              <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                Ainda não há lançamentos cadastrados para o período selecionado.
              </td>
            </tr>
          </tbody>
          <tfoot v-if="evolutionData.length > 0" style="border-top: 2px solid var(--border-color); background: rgba(255,255,255,0.03); font-weight: 800;">
            <tr>
              <td style="color: var(--text-primary);">TOTAL DO PERÍODO</td>
              <td class="text-success" style="font-size: 0.95rem;">{{ formatCurrency(totalYearIncome) }}</td>
              <td class="text-danger">{{ formatCurrency(totalYearCard) }}</td>
              <td class="text-warning">{{ formatCurrency(totalYearFixed) }}</td>
              <td class="text-info">{{ formatCurrency(totalYearVariable) }}</td>
              <td class="text-cash">{{ formatCurrency(totalYearCash) }}</td>
              <td style="font-size: 0.95rem; color: var(--color-danger);">{{ formatCurrency(totalYearExpenses) }}</td>
              <td>
                <span :class="totalYearNet >= 0 ? 'badge-surplus' : 'badge-deficit'" style="font-size: 0.95rem;">
                  {{ formatCurrency(totalYearNet) }}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

