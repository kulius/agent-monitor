<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useTerminalStore } from '../stores/terminal'
import { useServiceStore } from '../stores/service'
import { stopAllSounds, setMuted, getMuted, cleanup as cleanupSounds } from '../utils/sounds'
import MiniWorker from './MiniWorker.vue'
import AvatarPicker from './AvatarPicker.vue'

const terminalStore = useTerminalStore()
const serviceStore = useServiceStore()

// Max visible workers in expanded mode (for performance)
const MAX_VISIBLE_WORKERS = 8

// Collapsed state - stored in localStorage
const isCollapsed = ref(localStorage.getItem('worker-bar-collapsed') === 'true')

// Show all workers (override limit)
const showAllWorkers = ref(false)

// Avatar picker state
const showAvatarPicker = ref(false)
const editingTerminalId = ref<number | null>(null)

// Sound mute state
const isMuted = ref(getMuted())

const workers = computed(() => {
  return terminalStore.terminals
    .filter(t => !serviceStore.serviceTerminalIds.has(t.id))
    .map(t => ({
      id: t.id,
      name: t.name,
      status: t.claudeStatus || 'idle',
      avatarUrl: t.avatarUrl,
      isActive: t.id === terminalStore.activeTerminalId
    }))
})

// Visible workers (limited for performance, always include active worker)
const visibleWorkers = computed(() => {
  if (showAllWorkers.value || workers.value.length <= MAX_VISIBLE_WORKERS) {
    return workers.value
  }

  // Always include active worker
  const activeWorker = workers.value.find(w => w.isActive)
  const otherWorkers = workers.value.filter(w => !w.isActive)

  // Take first N-1 workers + active worker
  const result = otherWorkers.slice(0, MAX_VISIBLE_WORKERS - 1)
  if (activeWorker && !result.find(w => w.id === activeWorker.id)) {
    result.push(activeWorker)
  }

  // Sort by id to maintain consistent order
  return result.sort((a, b) => a.id - b.id)
})

const hiddenWorkersCount = computed(() => {
  if (showAllWorkers.value) return 0
  return Math.max(0, workers.value.length - MAX_VISIBLE_WORKERS)
})

// Status emoji helper
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'working':
      return '⏳'
    case 'waiting':
      return '❓'
    case 'completed':
      return '✅'
    default:
      return '💤'
  }
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem('worker-bar-collapsed', String(isCollapsed.value))
  // Reset show all when collapsing
  if (isCollapsed.value) {
    showAllWorkers.value = false
  }
}

function toggleShowAll() {
  showAllWorkers.value = !showAllWorkers.value
}

function handleWorkerClick(id: number) {
  terminalStore.setActiveTerminal(id)
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

// Stop all sounds when collapsing or leaving
onUnmounted(() => {
  stopAllSounds()
  cleanupSounds()
})
</script>

<template>
  <div class="worker-bar" :class="{ collapsed: isCollapsed }">
    <!-- Collapsed Mode: Text status line -->
    <div v-if="isCollapsed" class="collapsed-bar">
      <button
        class="toggle-collapse-btn"
        @click="toggleCollapse"
        title="Expand worker bar"
      >
        <span class="collapse-icon">▶</span>
      </button>
      <div class="status-text-line">
        <span
          v-for="worker in workers"
          :key="worker.id"
          class="status-item"
          :class="{ active: worker.isActive }"
          @click="handleWorkerClick(worker.id)"
          :title="worker.name"
        >
          {{ worker.name }}:{{ getStatusEmoji(worker.status) }}
        </span>
      </div>
      <button
        class="mute-btn"
        :class="{ muted: isMuted }"
        @click="toggleMute"
        :title="isMuted ? 'Unmute sounds' : 'Mute sounds'"
      >
        <span>{{ isMuted ? '🔇' : '🔊' }}</span>
      </button>
    </div>

    <!-- Expanded Mode: Mini workers -->
    <div v-else class="expanded-bar">
      <button
        class="toggle-collapse-btn"
        @click="toggleCollapse"
        title="Collapse worker bar"
      >
        <span class="collapse-icon">▼</span>
      </button>
      <div class="workers-row">
        <MiniWorker
          v-for="worker in visibleWorkers"
          :key="worker.id"
          :id="worker.id"
          :name="worker.name"
          :status="worker.status"
          :avatar-url="worker.avatarUrl"
          :is-active="worker.isActive"
          @click="handleWorkerClick"
          @edit-avatar="handleEditAvatar"
        />

        <!-- Show more button when there are hidden workers -->
        <button
          v-if="hiddenWorkersCount > 0"
          class="show-more-btn"
          @click="toggleShowAll"
          :title="showAllWorkers ? 'Show less' : `Show ${hiddenWorkersCount} more workers`"
        >
          <span class="more-count">+{{ hiddenWorkersCount }}</span>
          <span class="more-label">more</span>
        </button>

        <!-- Show less button when expanded -->
        <button
          v-if="showAllWorkers && workers.length > MAX_VISIBLE_WORKERS"
          class="show-less-btn"
          @click="toggleShowAll"
          title="Show less"
        >
          <span class="less-label">◀ Less</span>
        </button>

        <div v-if="workers.length === 0" class="empty-hint">
          No workers yet
        </div>
      </div>
      <button
        class="mute-btn"
        :class="{ muted: isMuted }"
        @click="toggleMute"
        :title="isMuted ? 'Unmute sounds' : 'Mute sounds'"
      >
        <span>{{ isMuted ? '🔇' : '🔊' }}</span>
      </button>
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
.worker-bar {
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

/* Collapsed Mode */
.collapsed-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  height: 28px;
}

.status-text-line {
  flex: 1;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.status-text-line::-webkit-scrollbar {
  display: none;
}

.status-item {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  /* Performance: skip rendering when off-screen */
  content-visibility: auto;
}

.status-item:hover {
  background: var(--hover-bg);
}

.status-item.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

/* Expanded Mode */
.expanded-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  min-height: 100px;
}

.workers-row {
  flex: 1;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  align-items: center;
}

.workers-row::-webkit-scrollbar {
  height: 4px;
}

.workers-row::-webkit-scrollbar-track {
  background: var(--border-light);
  border-radius: 2px;
}

.workers-row::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.workers-row::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  padding: 20px;
}

/* Show more/less buttons */
.show-more-btn,
.show-less-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  height: 70px;
  padding: 8px;
  background: var(--hover-bg);
  border: 2px dashed var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.show-more-btn:hover,
.show-less-btn:hover {
  background: var(--active-bg);
  border-color: var(--primary-color);
}

.more-count {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-color);
}

.more-label,
.less-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Shared Controls */
.toggle-collapse-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toggle-collapse-btn:hover {
  background: var(--hover-bg);
}

.collapse-icon {
  font-size: 10px;
  color: var(--text-muted);
}

.mute-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mute-btn:hover {
  background: var(--hover-bg);
}

.mute-btn.muted {
  opacity: 0.6;
}
</style>
