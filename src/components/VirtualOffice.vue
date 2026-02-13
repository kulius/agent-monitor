<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useTerminalStore } from '../stores/terminal'
import { stopAllSounds, setMuted, getMuted, cleanup as cleanupSounds } from '../utils/sounds'
import OfficeWorker from './OfficeWorker.vue'
import AvatarPicker from './AvatarPicker.vue'

const terminalStore = useTerminalStore()

const emit = defineEmits<{
  selectWorker: [id: number]
}>()

// Avatar picker state
const showAvatarPicker = ref(false)
const editingTerminalId = ref<number | null>(null)

// Sound mute state
const isMuted = ref(getMuted())

const workers = computed(() => {
  return terminalStore.terminals.map(t => ({
    id: t.id,
    name: t.name,
    status: t.claudeStatus || 'idle',
    avatarUrl: t.avatarUrl,
    isActive: t.id === terminalStore.activeTerminalId
  }))
})

function handleWorkerClick(id: number) {
  emit('selectWorker', id)
}

function handleEditAvatar(id: number) {
  editingTerminalId.value = id
  showAvatarPicker.value = true
}

function handleAvatarSelect(avatarUrl: string | undefined) {
  if (editingTerminalId.value !== null) {
    terminalStore.updateTerminalAvatar(editingTerminalId.value, avatarUrl)
  }
  closeAvatarPicker()
}

function closeAvatarPicker() {
  showAvatarPicker.value = false
  editingTerminalId.value = null
}

function toggleMute() {
  isMuted.value = !isMuted.value
  setMuted(isMuted.value)
}

// Stop all sounds and cleanup when leaving virtual office
onUnmounted(() => {
  stopAllSounds()
  cleanupSounds()
})
</script>

<template>
  <div class="virtual-office">
    <!-- Office Header -->
    <div class="office-header">
      <span class="office-title">Virtual Office</span>
      <span class="worker-count">{{ workers.length }} workers</span>
      <div class="office-controls">
        <button
          class="mute-btn"
          :class="{ muted: isMuted }"
          @click="toggleMute"
          :title="isMuted ? 'Unmute sounds' : 'Mute sounds'"
          :aria-label="isMuted ? 'Unmute sounds' : 'Mute sounds'"
          :aria-pressed="isMuted"
        >
          <span aria-hidden="true">{{ isMuted ? '🔇' : '🔊' }}</span>
        </button>
      </div>
    </div>

    <!-- Office Floor -->
    <div class="office-floor">
      <div v-if="workers.length === 0" class="empty-office">
        <div class="empty-icon">🏢</div>
        <p>No workers yet</p>
        <p class="hint">Create a terminal to add a worker</p>
      </div>

      <div v-else class="workers-grid">
        <OfficeWorker
          v-for="worker in workers"
          :key="worker.id"
          :id="worker.id"
          :name="worker.name"
          :status="worker.status"
          :avatar-url="worker.avatarUrl"
          :is-active="worker.isActive"
          @click="handleWorkerClick"
          @edit-avatar="handleEditAvatar"
        />
      </div>
    </div>

    <!-- Avatar Picker Modal -->
    <AvatarPicker
      v-if="showAvatarPicker"
      :current-avatar="workers.find(w => w.id === editingTerminalId)?.avatarUrl"
      @select="handleAvatarSelect"
      @close="closeAvatarPicker"
    />
  </div>
</template>

<style scoped>
.virtual-office {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(180deg, var(--panel-bg) 0%, var(--bg-color) 100%);
}

.office-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
}

.office-title {
  font-weight: 600;
  font-size: 14px;
}

.worker-count {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--hover-bg);
  padding: 2px 8px;
  border-radius: 10px;
}

.office-controls {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.mute-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s ease;
}

.mute-btn:hover {
  background: var(--hover-bg);
}

.mute-btn.muted {
  opacity: 0.6;
}

.office-floor {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.empty-office {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-office p {
  margin: 4px 0;
}

.hint {
  font-size: 12px;
  opacity: 0.7;
}

.workers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  justify-items: center;
}

/* Floor pattern for pixel feel */
.office-floor::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    linear-gradient(45deg, var(--border-light) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border-light) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border-light) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border-light) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  opacity: 0.3;
  pointer-events: none;
  z-index: 0;
}

.workers-grid {
  position: relative;
  z-index: 1;
}
</style>
