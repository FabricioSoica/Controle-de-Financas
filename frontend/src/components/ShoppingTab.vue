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

// Shopping List State
const shoppingItems = ref([]);

// Form states
const shopId = ref(null);
const shopName = ref('');
const shopLink = ref('');
const shopPrice = ref('');
const isEditingShop = ref(false);

// Drag and drop state
const draggedItem = ref(null);
const dragOverItem = ref(null);

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

// Fetch data on mount
onMounted(() => {
  fetchShoppingItems();
});

// ==========================================
// API Operations
// ==========================================
const fetchShoppingItems = async () => {
  if (!props.token) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/shopping`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao buscar lista de compras');
    shoppingItems.value = await res.json();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const saveShoppingItem = async () => {
  if (!shopName.value) {
    emit('toast', { message: 'Por favor, insira o nome do item.', type: 'error' });
    return;
  }

  const payload = {
    name: shopName.value,
    link: shopLink.value,
    price: shopPrice.value ? parseFloat(shopPrice.value) : 0
  };

  try {
    let res;
    if (isEditingShop.value && shopId.value) {
      res = await fetch(`${props.apiUrl}/api/shopping/${shopId.value}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${props.apiUrl}/api/shopping`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) throw new Error('Erro ao salvar item de compras');
    emit('toast', { 
      message: isEditingShop.value ? 'Item de compras atualizado!' : 'Item adicionado à lista!',
      type: 'success' 
    });
    resetShopForm();
    fetchShoppingItems();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const editShoppingItem = (item) => {
  shopId.value = item._id;
  shopName.value = item.name;
  shopLink.value = item.link || '';
  shopPrice.value = item.price || '';
  isEditingShop.value = true;
};

const deleteShoppingItem = async (id) => {
  if (!confirm('Deseja realmente excluir este item da lista?')) return;
  try {
    const res = await fetch(`${props.apiUrl}/api/shopping/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Erro ao excluir item');
    emit('toast', { message: 'Item excluído da lista de compras.', type: 'success' });
    fetchShoppingItems();
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  }
};

const resetShopForm = () => {
  shopId.value = null;
  shopName.value = '';
  shopLink.value = '';
  shopPrice.value = '';
  isEditingShop.value = false;
};

// ==========================================
// DRAG AND DROP & SORTING
// ==========================================
const onDragStart = (item, event) => {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item._id);
  draggedItem.value = item;
};

const onDragOver = (item, event) => {
  if (draggedItem.value && draggedItem.value._id !== item._id) {
    dragOverItem.value = item;
  }
};

const onDrop = async (targetItem, event) => {
  if (!draggedItem.value || draggedItem.value._id === targetItem._id) return;
  
  const fromIndex = shoppingItems.value.findIndex(i => i._id === draggedItem.value._id);
  const toIndex = shoppingItems.value.findIndex(i => i._id === targetItem._id);
  
  if (fromIndex !== -1 && toIndex !== -1) {
    const [removed] = shoppingItems.value.splice(fromIndex, 1);
    shoppingItems.value.splice(toIndex, 0, removed);
    
    shoppingItems.value.forEach((item, index) => {
      item.order = index;
    });
    
    try {
      const ids = shoppingItems.value.map(i => i._id);
      const res = await fetch(`${props.apiUrl}/api/shopping/reorder`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error();
      emit('toast', { message: 'Ordem de relevância atualizada.', type: 'success' });
    } catch (error) {
      emit('toast', { message: 'Erro ao salvar relevância.', type: 'error' });
    }
  }
  
  draggedItem.value = null;
  dragOverItem.value = null;
};

const onDragEnd = () => {
  draggedItem.value = null;
  dragOverItem.value = null;
};

const moveItem = async (index, direction) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= shoppingItems.value.length) return;
  
  const temp = shoppingItems.value[index];
  shoppingItems.value[index] = shoppingItems.value[newIndex];
  shoppingItems.value[newIndex] = temp;
  
  shoppingItems.value.forEach((item, idx) => {
    item.order = idx;
  });
  
  try {
    const ids = shoppingItems.value.map(i => i._id);
    const res = await fetch(`${props.apiUrl}/api/shopping/reorder`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ids })
    });
    if (!res.ok) throw new Error();
    emit('toast', { message: 'Relevância alterada com sucesso.', type: 'success' });
  } catch (error) {
    emit('toast', { message: 'Erro ao salvar relevância.', type: 'error' });
  }
};

// Calculations
const totalShoppingPrice = computed(() => shoppingItems.value.reduce((sum, item) => sum + (item.price || 0), 0));
</script>

<template>
  <div class="shopping-grid">
    <!-- Form and Summary -->
    <div>
      <div class="form-card">
        <h3 class="section-title" style="margin-top: 0;">
          <i class="fa-solid" :class="isEditingShop ? 'fa-pen-to-square' : 'fa-cart-plus'"></i>
          {{ isEditingShop ? 'Editar Item de Compra' : 'Adicionar Desejo' }}
        </h3>
        
        <form @submit.prevent="saveShoppingItem">
          <div class="form-group">
            <label class="form-label">O que você quer?</label>
            <input 
              type="text" 
              v-model="shopName" 
              placeholder="Ex: Teclado Mecânico, Livro de Go" 
              class="form-input"
              required
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">Link do Item (URL)</label>
            <input 
              type="url" 
              v-model="shopLink" 
              placeholder="https://exemplo.com/produto" 
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Preço Estimado (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              v-model="shopPrice" 
              placeholder="0,00 (opcional)" 
              class="form-input"
            />
          </div>

          <div class="btn-group-row">
            <button type="submit" class="btn btn-primary">
              <i class="fa-solid fa-check"></i> Salvar na Lista
            </button>
            <button 
              v-if="isEditingShop" 
              type="button" 
              class="btn btn-secondary" 
              @click="resetShopForm"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>

      <!-- Total Shopping Price display -->
      <div class="shopping-summary-card">
        <div>
          <span class="shopping-summary-title">Orçamento Total da Lista</span>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.15rem 0 0 0;">Itens organizados por ordem de prioridade</p>
        </div>
        <div class="shopping-summary-total">{{ formatCurrency(totalShoppingPrice) }}</div>
      </div>
    </div>

    <!-- Shopping List drag/drop interface -->
    <div class="transactions-card">
      <div class="card-header-actions">
        <h3 style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
          <i class="fa-solid fa-ranking-star"></i> Lista de Desejos por Relevância
        </h3>
        <span class="month-picker-label">{{ shoppingItems.length }} {{ shoppingItems.length === 1 ? 'item' : 'itens' }}</span>
      </div>
      
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem;">
        <i class="fa-solid fa-circle-info" style="color: var(--color-primary);"></i>
        Arraste os itens pelo ícone <i class="fa-solid fa-grip-vertical"></i> para reordenar por relevância, ou use as setas.
      </p>

      <div class="shopping-list-container">
        <div 
          v-for="(item, index) in shoppingItems" 
          :key="item._id"
          class="shopping-item-card"
          :class="{ 
            dragging: draggedItem && draggedItem._id === item._id,
            'drag-over': dragOverItem && dragOverItem._id === item._id
          }"
          draggable="true"
          @dragstart="onDragStart(item, $event)"
          @dragover.prevent="onDragOver(item, $event)"
          @drop="onDrop(item, $event)"
          @dragend="onDragEnd"
        >
          <!-- Drag Handle -->
          <div class="drag-handle">
            <i class="fa-solid fa-grip-vertical"></i>
          </div>

          <!-- Up/Down arrows for reordering -->
          <div class="relevance-controls">
            <button 
              type="button" 
              class="relevance-btn" 
              @click="moveItem(index, -1)" 
              :disabled="index === 0"
              title="Mover para Cima"
            >
              <i class="fa-solid fa-chevron-up"></i>
            </button>
            <button 
              type="button" 
              class="relevance-btn" 
              @click="moveItem(index, 1)" 
              :disabled="index === shoppingItems.length - 1"
              title="Mover para Baixo"
            >
              <i class="fa-solid fa-chevron-down"></i>
            </button>
          </div>

          <!-- Content info -->
          <div class="shopping-item-info">
            <div class="shopping-item-details">
              <span class="shopping-item-name">{{ item.name }}</span>
              <a 
                v-if="item.link" 
                :href="item.link" 
                target="_blank" 
                class="shopping-item-link-badge"
                rel="noopener noreferrer"
              >
                <i class="fa-solid fa-link"></i> Ver no Site
              </a>
            </div>
            
            <div class="shopping-item-price">
              {{ item.price ? formatCurrency(item.price) : 'Sob Consulta' }}
            </div>
          </div>

          <!-- Action buttons -->
          <div class="shopping-actions">
            <button class="action-btn btn-edit" @click="editShoppingItem(item)" type="button">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="action-btn btn-delete" @click="deleteShoppingItem(item._id)" type="button">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="shoppingItems.length === 0" class="empty-state">
          <i class="fa-solid fa-cart-flatbed-suitcases" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
          Sua lista de desejos está vazia. Adicione o que deseja comprar no formulário ao lado!
        </div>
      </div>
    </div>
  </div>
</template>
