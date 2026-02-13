<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useMonitorStore } from '../stores/monitor'

const store = useMonitorStore()
const elapsed = ref(0)
let timer: number | null = null

const currentAgent = computed(() => store.currentAgent)

const formattedElapsed = computed(() => {
  const seconds = Math.floor(elapsed.value / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
})

function updateElapsed() {
  if (currentAgent.value) {
    const started = new Date(currentAgent.value.started_at).getTime()
    elapsed.value = Date.now() - started
  }
}

onMounted(() => {
  timer = window.setInterval(updateElapsed, 1000)
  updateElapsed()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="status-panel">
    <template v-if="currentAgent">
      <div class="status-indicator running">
        <span class="pulse"></span>
        <span class="icon">▶</span>
        <span class="name">{{ currentAgent.agent_name }}</span>
        <span class="timer">⏱ {{ formattedElapsed }}</span>
      </div>
      <div class="status-detail" v-if="currentAgent.prompt_preview">
        {{ currentAgent.prompt_preview }}
      </div>
    </template>
    <template v-else>
      <div class="status-indicator idle">
        <span class="icon">⏸</span>
        <span class="name">待命中</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-panel {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--panel-bg);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.status-indicator.running {
  color: var(--success-color);
}

.status-indicator.idle {
  color: var(--text-muted);
}

.pulse {
  width: 8px;
  height: 8px;
  background: var(--success-color);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.icon {
  font-size: 12px;
}

.name {
  font-weight: 600;
  flex: 1;
}

.timer {
  font-family: 'Consolas', monospace;
  color: var(--text-muted);
}

.status-detail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
