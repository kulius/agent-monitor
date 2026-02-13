<script setup lang="ts">
import { useMonitorStore } from '../stores/monitor'

const store = useMonitorStore()

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms?: number): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'success': return '✓'
    case 'error': return '✗'
    case 'running': return '▶'
    default: return '?'
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'success': return 'success'
    case 'error': return 'error'
    case 'running': return 'running'
    default: return ''
  }
}
</script>

<template>
  <div class="history-panel">
    <div class="history-header">
      <span class="history-icon">📜</span>
      <span class="history-title">最近執行</span>
    </div>
    <div class="history-list">
      <div
        v-for="item in store.recent"
        :key="item.session_id"
        class="history-item"
        :class="getStatusClass(item.exit_status)"
      >
        <span class="status-icon" :class="getStatusClass(item.exit_status)">
          {{ getStatusIcon(item.exit_status) }}
        </span>
        <span class="agent-name">{{ item.agent_name }}</span>
        <span class="time">{{ formatTime(item.started_at) }}</span>
        <span class="duration">{{ formatDuration(item.duration_ms) }}</span>
      </div>
      <div v-if="store.recent.length === 0" class="empty-state">
        暫無執行記錄
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.history-icon {
  font-size: 14px;
}

.history-list {
  flex: 1;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
}

.history-item:last-child {
  border-bottom: none;
}

.status-icon {
  width: 16px;
  text-align: center;
  font-weight: 700;
}

.status-icon.success {
  color: var(--success-color);
}

.status-icon.error {
  color: var(--error-color);
}

.status-icon.running {
  color: var(--warning-color);
}

.agent-name {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  color: var(--text-muted);
  font-family: 'Consolas', monospace;
}

.duration {
  color: var(--text-muted);
  font-family: 'Consolas', monospace;
  min-width: 45px;
  text-align: right;
}

.empty-state {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 13px;
}
</style>
