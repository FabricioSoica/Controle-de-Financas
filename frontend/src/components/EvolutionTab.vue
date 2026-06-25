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

const evolutionData = ref([]);

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

const maxMonthValue = computed(() => {
  let max = 100;
  evolutionData.value.forEach(d => {
    const totalExp = d.card + d.variable + d.fixed;
    const val = Math.max(d.income, totalExp);
    if (val > max) max = val;
  });
  return max;
});

const fetchEvolutionData = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/summary/evolution`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar histórico de evolução');
    evolutionData.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

onMounted(() => {
  fetchEvolutionData();
});
</script>

<template>
  <div class="evolution-container">
    <div class="chart-card">
      <div class="chart-header">
        <div>
          <h3 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary); margin: 0;">
            <i class="fa-solid fa-chart-simple" style="color: var(--color-primary);"></i>
            Evolução Financeira (Últimos 12 Meses)
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; margin-bottom: 0;">
            Comparativo mensal entre Receitas e Gastos Totais (Cartão + Fixo + Outros)
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
                :style="{ height: maxMonthValue ? (((m.card + m.fixed + m.variable) / maxMonthValue) * 100) + '%' : '0%' }"
              >
                <span class="bar-tooltip">
                  <strong>Gastos:</strong> {{ formatCurrency(m.card + m.fixed + m.variable) }}
                  <br/>
                  <span style="font-size: 0.65rem; color: var(--text-muted);">
                    Cartão: {{ formatCurrency(m.card) }} | Fixo: {{ formatCurrency(m.fixed) }} | Outros: {{ formatCurrency(m.variable) }}
                  </span>
                </span>
              </div>
            </div>
            <span class="month-bar-label">{{ m.monthLabel }}</span>
          </div>
          
          <div v-if="evolutionData.length === 0" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); font-size: 0.9rem;">
            <i class="fa-solid fa-folder-open" style="margin-right: 0.5rem;"></i> Nenhuma informação financeira encontrada para gerar o gráfico.
          </div>
        </div>
      </div>
    </div>
    
    <!-- Detailed History Table -->
    <div class="transactions-card">
      <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; margin-top: 0;">
        <i class="fa-solid fa-table-list" style="color: var(--color-primary);"></i>
        Tabela de Histórico Detalhado
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
              <td style="font-weight: 600;">{{ formatCurrency(m.card + m.fixed + m.variable) }}</td>
              <td>
                <span :class="(m.income - (m.card + m.fixed + m.variable)) >= 0 ? 'badge-surplus' : 'badge-deficit'">
                  {{ formatCurrency(m.income - (m.card + m.fixed + m.variable)) }}
                </span>
              </td>
            </tr>
            <tr v-if="evolutionData.length === 0">
              <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                Ainda não há lançamentos cadastrados em nenhum mês.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
