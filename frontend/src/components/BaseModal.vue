<script setup>
import { onMounted, onUnmounted } from 'vue';

defineProps({
  title: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: ''
  },
  maxWidth: {
    type: String,
    default: '520px'
  }
});

const emit = defineEmits(['close']);

const handleKeydown = (event) => {
  if (event.key === 'Escape') emit('close');
};

onMounted(() => document.addEventListener('keydown', handleKeydown));
onUnmounted(() => document.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <div class="base-modal-overlay" @click.self="emit('close')">
    <div class="base-modal-card" :style="{ maxWidth }">
      <div class="base-modal-header">
        <h3>
          <i v-if="icon" class="fa-solid" :class="icon"></i>
          {{ title }}
        </h3>
        <button type="button" class="base-modal-close" @click="emit('close')" title="Fechar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="base-modal-body custom-scroll">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.base-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 10, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  animation: baseModalFadeIn 0.25s ease-out;
}

.base-modal-card {
  background: #111827;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  width: calc(100% - 2rem);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  animation: baseModalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.base-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.75rem;
}

.base-modal-header h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  color: var(--text-primary);
}

.base-modal-header h3 i {
  color: var(--color-primary);
}

.base-modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0.25rem;
  transition: var(--transition-smooth);
}

.base-modal-close:hover {
  color: var(--text-primary);
}

.base-modal-body {
  padding-top: 1rem;
  overflow-y: auto;
  min-height: 0;
}

@keyframes baseModalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes baseModalScaleIn {
  from { transform: scale(0.9) translateY(10px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}
</style>
