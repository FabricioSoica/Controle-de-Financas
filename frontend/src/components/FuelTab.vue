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

// State
const refills = ref([]);
const summary = ref([]);
const selectedMonth = ref('');
const configuredCards = ref([]);

// Form state
const refillId = ref(null);
const refillDate = ref('');
const refillOdometer = ref('');
const refillLiters = ref('');
const refillPricePerLiter = ref('');
const refillTotalAmount = ref('');
const refillInfo = ref('');
const refillPaymentType = ref('money'); // money, card
const refillCardName = ref('');
const isEditing = ref(false);
const submitLoading = ref(false);
const fetchLoading = ref(false);

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${props.token}`
  };
};

const getMonthYearString = (ym) => {
  if (!ym) return '';
  const [year, month] = ym.split('-');
  return `${month}/${year}`;
};

// Autocalculate total amount when liters or price changes
watch([refillLiters, refillPricePerLiter], ([liters, price]) => {
  if (isEditing.value) return; // Do not overwrite during editing unless manual change
  const l = parseFloat(liters);
  const p = parseFloat(price);
  if (!isNaN(l) && !isNaN(p)) {
    refillTotalAmount.value = parseFloat((l * p).toFixed(2));
  } else {
    refillTotalAmount.value = '';
  }
});

const formatCurrency = (value) => {
  if (value === undefined || value === null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const fetchRefills = async () => {
  fetchLoading.value = true;
  try {
    const res = await fetch(`${props.apiUrl}/api/fuel`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar abastecimentos');
    refills.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    fetchLoading.value = false;
  }
};

const fetchSummary = async () => {
  try {
    const res = await fetch(`${props.apiUrl}/api/fuel/summary`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Falha ao buscar sumário');
    summary.value = await res.json();
  } catch (error) {
    console.error(error);
  }
};

const fetchConfiguredCards = async () => {
  try {
    const res = await fetch(`${props.apiUrl}/api/cards/config`, {
      headers: getHeaders()
    });
    if (res.ok) {
      configuredCards.value = await res.json();
    }
  } catch (e) {
    console.error(e);
  }
};

onMounted(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  refillDate.value = `${year}-${month}-${day}`;
  selectedMonth.value = `${year}-${month}`;
  
  fetchRefills();
  fetchSummary();
  fetchConfiguredCards();
});

// Calculations for stats
const currentMonthLabel = computed(() => getMonthYearString(selectedMonth.value));

const currentMonthRefills = computed(() => {
  return refills.value.filter(r => r.month === currentMonthLabel.value);
});

const totalSpentCurrentMonth = computed(() => {
  return currentMonthRefills.value.reduce((sum, r) => sum + r.totalAmount, 0);
});

const totalLitersCurrentMonth = computed(() => {
  return currentMonthRefills.value.reduce((sum, r) => sum + r.liters, 0);
});

const totalDistanceCurrentMonth = computed(() => {
  return currentMonthRefills.value.reduce((sum, r) => sum + r.distanceTraveled, 0);
});

const averageConsumptionCurrentMonth = computed(() => {
  const validRefills = currentMonthRefills.value.filter(r => r.kmPerLiter > 0);
  if (validRefills.length === 0) return 0;
  const sumKmPerL = validRefills.reduce((sum, r) => sum + r.kmPerLiter, 0);
  return parseFloat((sumKmPerL / validRefills.length).toFixed(2));
});

// Total distance over all time
const totalDistanceAllTime = computed(() => {
  if (refills.value.length < 2) return 0;
  const latest = refills.value[0];
  const oldest = refills.value[refills.value.length - 1];
  const dist = latest.odometer - oldest.odometer;
  return dist >= 0 ? dist : 0;
});

// Average consumption over all time
const averageConsumptionAllTime = computed(() => {
  const validRefills = refills.value.filter(r => r.kmPerLiter > 0);
  if (validRefills.length === 0) return 0;
  const sumKmPerL = validRefills.reduce((sum, r) => sum + r.kmPerLiter, 0);
  return parseFloat((sumKmPerL / validRefills.length).toFixed(2));
});

const saveRefill = async () => {
  if (!refillDate.value || !refillOdometer.value || !refillLiters.value || !refillPricePerLiter.value || !refillTotalAmount.value) {
    emit('toast', { message: 'Por favor, preencha todos os campos obrigatórios.', type: 'error' });
    return;
  }
  
  if (refillPaymentType.value === 'card' && !refillCardName.value) {
    emit('toast', { message: 'Por favor, selecione ou digite o nome do cartão de crédito.', type: 'error' });
    return;
  }
  
  const payload = {
    date: refillDate.value,
    odometer: parseFloat(refillOdometer.value),
    liters: parseFloat(refillLiters.value),
    pricePerLiter: parseFloat(refillPricePerLiter.value),
    totalAmount: parseFloat(refillTotalAmount.value),
    paymentType: refillPaymentType.value,
    cardName: refillPaymentType.value === 'card' ? refillCardName.value.trim() : '',
    info: refillInfo.value
  };
  
  submitLoading.value = true;
  try {
    let res;
    if (isEditing.value && refillId.value) {
      res = await fetch(`${props.apiUrl}/api/fuel/${refillId.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${props.apiUrl}/api/fuel`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao salvar registro');
    }
    
    emit('toast', {
      message: isEditing.value ? 'Abastecimento atualizado com sucesso!' : 'Abastecimento registrado com sucesso!',
      type: 'success'
    });
    
    resetForm();
    fetchRefills();
    fetchSummary();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    submitLoading.value = false;
  }
};

const editRefill = (r) => {
  refillId.value = r._id;
  const d = new Date(r.date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  refillDate.value = `${year}-${month}-${day}`;
  
  refillOdometer.value = r.odometer;
  refillLiters.value = r.liters;
  refillPricePerLiter.value = r.pricePerLiter;
  refillTotalAmount.value = r.totalAmount;
  refillPaymentType.value = r.paymentType || 'money';
  refillCardName.value = r.cardName || '';
  refillInfo.value = r.info || '';
  isEditing.value = true;
};

const deleteRefill = async (id) => {
  if (!confirm('Deseja realmente excluir este abastecimento?')) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/fuel/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao excluir abastecimento');
    emit('toast', { message: 'Abastecimento excluído com sucesso.', type: 'success' });
    fetchRefills();
    fetchSummary();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const resetForm = () => {
  refillId.value = null;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  refillDate.value = `${year}-${month}-${day}`;
  refillOdometer.value = '';
  refillLiters.value = '';
  refillPricePerLiter.value = '';
  refillTotalAmount.value = '';
  refillPaymentType.value = 'money';
  refillCardName.value = '';
  refillInfo.value = '';
  isEditing.value = false;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};
</script>

<template>
  <div>
    <!-- Month/Competence Picker -->
    <div class="filter-bar" style="position: relative; z-index: 50;">
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
      <div class="period-display">
        <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
          Período: <strong style="color: var(--text-primary);">{{ currentMonthLabel }}</strong>
        </span>
      </div>
    </div>

    <!-- Metrics Cards Grid -->
    <div class="summary-grid">
      <!-- 1. Total Spent Current Month -->
      <div class="summary-card card-fuel-spent">
        <span class="card-icon"><i class="fa-solid fa-gas-pump"></i></span>
        <div class="card-title">Gasto com Gasolina</div>
        <div class="card-value text-danger">{{ formatCurrency(totalSpentCurrentMonth) }}</div>
        <div class="card-sub-calc">No mês selecionado</div>
      </div>
      
      <!-- 2. Liters filled Current Month -->
      <div class="summary-card card-fuel-liters">
        <span class="card-icon"><i class="fa-solid fa-droplet"></i></span>
        <div class="card-title">Volume Abastecido</div>
        <div class="card-value text-info">{{ totalLitersCurrentMonth.toFixed(1) }} L</div>
        <div class="card-sub-calc">Consumidos no mês</div>
      </div>

      <!-- 3. Km/l Current Month -->
      <div class="summary-card card-fuel-consumption">
        <span class="card-icon"><i class="fa-solid fa-gauge-high"></i></span>
        <div class="card-title">Consumo Médio (Mês)</div>
        <div class="card-value text-success">{{ averageConsumptionCurrentMonth }} km/l</div>
        <div class="card-sub-calc">Média de rodagem</div>
      </div>

      <!-- 4. Total Distance Traveled (All Time) -->
      <div class="summary-card card-fuel-distance">
        <span class="card-icon"><i class="fa-solid fa-road"></i></span>
        <div class="card-title">Média Geral / Km Total</div>
        <div class="card-value" style="color: var(--color-warning);">
          {{ averageConsumptionAllTime }} <span style="font-size: 1rem; color: var(--text-secondary);">km/l</span>
        </div>
        <div class="card-sub-calc">Distância total: {{ totalDistanceAllTime }} km</div>
      </div>
    </div>

    <!-- Main Content Area (Split Layout) -->
    <div class="dashboard-grid">
      <!-- Form Sidebar -->
      <aside class="form-card">
        <h3 class="section-title">
          <i class="fa-solid" :class="isEditing ? 'fa-pen-to-square' : 'fa-circle-plus'"></i>
          {{ isEditing ? 'Editar Abastecimento' : 'Novo Abastecimento' }}
        </h3>
        
        <form @submit.prevent="saveRefill">
          <div class="form-group">
            <label class="form-label">Data</label>
            <input 
              type="date" 
              v-model="refillDate" 
              class="form-input"
              required
            />
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Odômetro (km)</label>
              <input 
                type="number" 
                step="any"
                v-model="refillOdometer" 
                placeholder="Ex: 12450" 
                class="form-input"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Litros (L)</label>
              <input 
                type="number" 
                step="any"
                v-model="refillLiters" 
                placeholder="Ex: 9.5" 
                class="form-input"
                required
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Preço/Litro (R$)</label>
              <input 
                type="number" 
                step="any"
                v-model="refillPricePerLiter" 
                placeholder="Ex: 5.69" 
                class="form-input"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label">Valor Total (R$)</label>
              <input 
                type="number" 
                step="any"
                v-model="refillTotalAmount" 
                placeholder="0,00" 
                class="form-input"
                required
              />
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Forma de Pagamento</label>
              <select v-model="refillPaymentType" class="form-select">
                <option value="money">Dinheiro / Outro</option>
                <option value="card">Cartão de Crédito</option>
              </select>
            </div>
            <div v-if="refillPaymentType === 'card'" class="form-group">
              <label class="form-label">Nome do Cartão</label>
              <input 
                type="text" 
                v-model="refillCardName" 
                placeholder="Ex: Nubank" 
                class="form-input"
                list="card-names-fuel-list"
                required
              />
              <datalist id="card-names-fuel-list">
                <option v-for="c in configuredCards" :value="c.cardName" :key="c._id" />
              </datalist>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Observação</label>
            <input 
              type="text" 
              v-model="refillInfo" 
              placeholder="Ex: Posto Ipiranga Centro" 
              class="form-input"
            />
          </div>

          <div class="form-actions" style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
            <button type="submit" class="btn btn-primary" :disabled="submitLoading" style="flex: 1;">
              <span v-if="submitLoading"><i class="fa-solid fa-spinner fa-spin"></i> Salvando...</span>
              <span v-else><i class="fa-solid fa-check"></i> {{ isEditing ? 'Salvar Alterações' : 'Salvar Registro' }}</span>
            </button>
            <button 
              v-if="isEditing" 
              type="button" 
              class="btn btn-secondary" 
              @click="resetForm"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>

      <!-- History List Column -->
      <div class="transactions-container">
        <div class="transactions-card">
          <div class="card-header-actions">
            <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
              <i class="fa-solid fa-list-check"></i> Histórico de Abastecimentos
            </h3>
            <span class="month-picker-label">Gastos do Mês: {{ formatCurrency(totalSpentCurrentMonth) }}</span>
          </div>

          <div v-if="fetchLoading" class="loading-state">
            <i class="fa-solid fa-spinner fa-spin"></i> Carregando abastecimentos...
          </div>

          <div v-else-if="currentMonthRefills.length === 0" class="empty-state">
            Nenhum abastecimento registrado em {{ currentMonthLabel }}.
          </div>

          <div v-else class="refills-wrapper">
            <!-- Desktop Table View -->
            <table class="refills-table desktop-only">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Odômetro</th>
                  <th>Km Rodados</th>
                  <th>Litros</th>
                  <th>Pagamento</th>
                  <th>Média km/l</th>
                  <th>Total Pago</th>
                  <th style="text-align: right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in currentMonthRefills" :key="r._id">
                  <td>{{ formatDate(r.date) }}</td>
                  <td>{{ r.odometer.toLocaleString('pt-BR') }} km</td>
                  <td>
                    <span v-if="r.distanceTraveled > 0" class="distance-badge">+{{ r.distanceTraveled }} km</span>
                    <span v-else class="text-muted">-</span>
                  </td>
                  <td>{{ r.liters.toFixed(2) }} L</td>
                  <td>
                    <span v-if="r.paymentType === 'card'" class="payment-badge-card" :title="'Vínculo financeiro: ' + r.cardName">
                      💳 {{ r.cardName }}
                    </span>
                    <span v-else class="payment-badge-cash">
                      💵 Dinheiro
                    </span>
                  </td>
                  <td>
                    <span v-if="r.kmPerLiter > 0" class="consumption-badge">{{ r.kmPerLiter.toFixed(2) }} km/l</span>
                    <span v-else class="text-muted" title="Primeiro abastecimento / odômetro inicial">-</span>
                  </td>
                  <td class="text-danger font-semibold">{{ formatCurrency(r.totalAmount) }}</td>
                  <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 0.5rem;">
                      <button class="action-btn btn-edit" @click="editRefill(r)" title="Editar"><i class="fa-solid fa-pen"></i></button>
                      <button class="action-btn btn-delete" @click="deleteRefill(r._id)" title="Deletar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Mobile Card View -->
            <div class="refills-mobile-list mobile-only">
              <div v-for="r in currentMonthRefills" :key="r._id" class="mobile-refill-card">
                <div class="mobile-card-row">
                  <span class="mobile-card-date">{{ formatDate(r.date) }}</span>
                  <span class="mobile-card-total text-danger font-semibold">{{ formatCurrency(r.totalAmount) }}</span>
                </div>
                
                <div class="mobile-card-details">
                  <div>
                    <span class="detail-label">Odômetro:</span>
                    <span class="detail-value">{{ r.odometer.toLocaleString('pt-BR') }} km</span>
                  </div>
                  <div>
                    <span class="detail-label">Distância:</span>
                    <span class="detail-value">
                      <span v-if="r.distanceTraveled > 0" class="distance-badge">+{{ r.distanceTraveled }} km</span>
                      <span v-else class="text-muted">-</span>
                    </span>
                  </div>
                  <div>
                    <span class="detail-label">Média:</span>
                    <span class="detail-value">
                      <span v-if="r.kmPerLiter > 0" class="consumption-badge">{{ r.kmPerLiter.toFixed(2) }} km/l</span>
                      <span v-else class="text-muted">-</span>
                    </span>
                  </div>
                  <div>
                    <span class="detail-label">Pagamento:</span>
                    <span class="detail-value">
                      <span v-if="r.paymentType === 'card'" style="color: var(--color-danger); font-weight: 600;">💳 {{ r.cardName }}</span>
                      <span v-else style="color: var(--color-success); font-weight: 600;">💵 Dinheiro</span>
                    </span>
                  </div>
                  <div style="grid-column: span 2;">
                    <span class="detail-label">Litros:</span>
                    <span class="detail-value">{{ r.liters.toFixed(2) }} L ({{ formatCurrency(r.pricePerLiter) }}/L)</span>
                  </div>
                  <div v-if="r.info" style="grid-column: span 2; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.25rem; font-style: italic;">
                    <span class="detail-label">Obs:</span>
                    <span class="detail-value">{{ r.info }}</span>
                  </div>
                </div>

                <div class="mobile-card-actions">
                  <button class="action-btn btn-edit" @click="editRefill(r)"><i class="fa-solid fa-pen"></i> Editar</button>
                  <button class="action-btn btn-delete" @click="deleteRefill(r._id)"><i class="fa-solid fa-trash"></i> Excluir</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Stats cards specific theme accentuation */
.card-fuel-spent {
  background: linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(17, 24, 39, 0.65) 100%);
  border: 1px solid rgba(244, 63, 94, 0.2);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}
.card-fuel-spent .card-icon {
  color: var(--color-danger);
  filter: drop-shadow(0 0 8px rgba(244, 63, 94, 0.3));
}

.card-fuel-liters {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(17, 24, 39, 0.65) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
}
.card-fuel-liters .card-icon {
  color: var(--color-info);
  filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.3));
}

.card-fuel-consumption {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(17, 24, 39, 0.65) 100%);
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.card-fuel-consumption .card-icon {
  color: var(--color-success);
  filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.3));
}

.card-fuel-distance {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(17, 24, 39, 0.65) 100%);
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.card-fuel-distance .card-icon {
  color: var(--color-warning);
  filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.3));
}

.loading-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
  font-size: 1.1rem;
}
.loading-state i {
  margin-right: 0.5rem;
  color: var(--color-primary);
}

/* Table layout styling */
.refills-wrapper {
  margin-top: 1rem;
  overflow-x: auto;
}

.refills-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.refills-table th {
  padding: 0.85rem 1rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.refills-table td {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 0.9rem;
  vertical-align: middle;
}

.refills-table tr:hover td {
  background: rgba(255, 255, 255, 0.015);
}

/* Badge styling */
.distance-badge {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  display: inline-block;
}

.consumption-badge {
  background: rgba(16, 185, 129, 0.1);
  color: var(--color-success);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  display: inline-block;
}

.payment-badge-card {
  background: rgba(244, 63, 94, 0.08);
  border: 1px solid rgba(244, 63, 94, 0.2);
  color: var(--color-danger);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  display: inline-block;
}

.payment-badge-cash {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: var(--color-success);
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.75rem;
  display: inline-block;
}

.font-semibold {
  font-weight: 600;
}

/* Mobile cards list layout */
.refills-mobile-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.25rem 0;
}

.mobile-refill-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  transition: var(--transition-smooth);
}

.mobile-refill-card:hover {
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(255, 255, 255, 0.03);
}

.mobile-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  padding-bottom: 0.5rem;
}

.mobile-card-date {
  font-weight: 700;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.mobile-card-total {
  font-size: 1.05rem;
}

.mobile-card-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.detail-label {
  color: var(--text-secondary);
  margin-right: 0.25rem;
}

.detail-value {
  color: var(--text-primary);
  font-weight: 500;
}

.mobile-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.25rem;
  border-top: 1px solid rgba(255,255,255,0.03);
  padding-top: 0.75rem;
}

.mobile-card-actions .action-btn {
  flex: 1;
  justify-content: center;
  padding: 0.4rem;
  font-size: 0.75rem;
}

/* Visibility classes */
.desktop-only {
  display: table;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .desktop-only {
    display: none;
  }
  .mobile-only {
    display: flex;
  }
}
</style>
