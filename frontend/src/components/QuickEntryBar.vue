<script setup>
import { ref } from 'vue';

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

const emit = defineEmits(['parsed', 'toast']);

const MAX_LENGTH = 300;

const text = ref('');
const loading = ref(false);

const submit = async () => {
  const value = text.value.trim();
  if (!value || loading.value) return;

  loading.value = true;
  try {
    const res = await fetch(`${props.apiUrl}/api/finances/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.token}`
      },
      body: JSON.stringify({ text: value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível interpretar o lançamento.');

    emit('parsed', data);
    text.value = '';
  } catch (error) {
    emit('toast', { message: error.message, type: 'error' });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <form class="quick-entry" @submit.prevent="submit">
    <i class="fa-solid fa-wand-magic-sparkles quick-entry-icon"></i>
    <input
      v-model="text"
      type="text"
      class="quick-entry-input"
      :maxlength="MAX_LENGTH"
      :disabled="loading"
      placeholder="Ex.: 30 na sorveteria no crédito do Nubank"
      aria-label="Descreva o lançamento em uma frase"
    />
    <button type="submit" class="btn btn-primary quick-entry-button" :disabled="loading || !text.trim()" title="Lançar">
      <i class="fa-solid" :class="loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
      <span class="quick-entry-label">{{ loading ? 'Lendo...' : 'Lançar' }}</span>
    </button>
  </form>
</template>

<style scoped>
.quick-entry {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
  padding: 0.5rem 0.5rem 0.5rem 1rem;
  background: rgba(17, 24, 39, 0.65);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-md);
  transition: var(--transition-smooth);
}

.quick-entry:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
}

.quick-entry-icon {
  color: var(--color-primary);
}

.quick-entry-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.9rem;
}

.quick-entry-input::placeholder {
  color: var(--text-muted);
}

.quick-entry-button {
  width: auto;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0.5rem 1rem;
}

@media (max-width: 480px) {
  .quick-entry-input {
    font-size: 0.8rem;
  }

  .quick-entry-button {
    padding: 0.5rem 0.75rem;
  }

  .quick-entry-label {
    display: none;
  }
}
</style>
