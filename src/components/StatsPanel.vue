<script setup lang="ts">
import { computed } from 'vue'
import { useMonitorStore } from '../stores/monitor'

const store = useMonitorStore()

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

const avgDuration = computed(() => formatDuration(store.stats.avgDuration))
</script>

<template>
  <div class="stats-panel">
    <div class="stats-header">
      <span class="stats-icon">📊</span>
      <span class="stats-title">今日統計</span>
    </div>
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-value">{{ store.stats.total }}</span>
        <span class="stat-label">執行</span>
      </div>
      <div class="stat-item success">
        <span class="stat-value">{{ store.stats.success }}</span>
        <span class="stat-label">成功</span>
      </div>
      <div class="stat-item error">
        <span class="stat-value">{{ store.stats.errors }}</span>
        <span class="stat-label">失敗</span>
      </div>
    </div>
    <div class="stats-footer">
      <span>平均時長: {{ avgDuration }}</span>
      <span class="separator">│</span>
      <span>成功率: {{ store.successRate }}%</span>
    </div>
  </div>
</template>

<style scoped>
.stats-panel {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.stats-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.stats-icon {
  font-size: 14px;
}

.stats-grid {
  display: flex;
  justify-content: space-around;
  margin-bottom: 10px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-item.success .stat-value {
  color: var(--success-color);
}

.stat-item.error .stat-value {
  color: var(--error-color);
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.stats-footer {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.separator {
  margin: 0 8px;
  opacity: 0.5;
}
</style>
