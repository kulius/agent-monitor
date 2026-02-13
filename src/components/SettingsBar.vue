<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMonitorStore } from '../stores/monitor'

const store = useMonitorStore()

const ZOOM_KEY = 'agent-monitor-zoom'
const ZOOM_STEP = 0.05
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5

const zoom = ref(1)

function loadZoom(): void {
  try {
    const stored = localStorage.getItem(ZOOM_KEY)
    if (stored) {
      zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, parseFloat(stored)))
    }
  } catch { /* ignore */ }
}

function applyZoom(): void {
  document.documentElement.style.zoom = String(zoom.value)
  localStorage.setItem(ZOOM_KEY, String(zoom.value))
}

function zoomIn(): void {
  zoom.value = Math.min(ZOOM_MAX, Math.round((zoom.value + ZOOM_STEP) * 100) / 100)
  applyZoom()
}

function zoomOut(): void {
  zoom.value = Math.max(ZOOM_MIN, Math.round((zoom.value - ZOOM_STEP) * 100) / 100)
  applyZoom()
}

function zoomReset(): void {
  zoom.value = 1
  applyZoom()
}

onMounted(() => {
  loadZoom()
  applyZoom()
})
</script>

<template>
  <div class="settings-bar">
    <button
      class="setting-btn"
      :class="{ active: store.settings.voice.enabled }"
      @click="store.toggleVoice"
      title="語音通知"
    >
      {{ store.settings.voice.enabled ? '🔊' : '🔇' }}
    </button>
    <button
      class="setting-btn"
      :class="{ active: store.settings.window.alwaysOnTop }"
      @click="store.toggleAlwaysOnTop"
      title="視窗置頂"
    >
      📌
    </button>

    <!-- Zoom controls -->
    <div class="zoom-group">
      <button class="zoom-btn" title="縮小" @click="zoomOut">−</button>
      <span class="zoom-label" @click="zoomReset" title="重設 100%">
        {{ Math.round(zoom * 100) }}%
      </span>
      <button class="zoom-btn" title="放大" @click="zoomIn">+</button>
    </div>

    <div class="spacer"></div>
    <div class="connection-status" :class="{ connected: store.connected }">
      {{ store.connected ? '●' : '○' }}
    </div>
  </div>
</template>

<style scoped>
.settings-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--panel-bg);
}

.setting-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.setting-btn:hover {
  background: var(--hover-bg);
}

.setting-btn.active {
  background: var(--active-bg);
  border-color: var(--primary-color);
}

.zoom-group {
  display: flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.zoom-btn {
  background: none;
  border: none;
  padding: 3px 7px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1;
}

.zoom-btn:hover {
  background: var(--hover-bg);
}

.zoom-label {
  font-size: 10px;
  color: var(--text-muted);
  min-width: 32px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  padding: 0 2px;
}

.zoom-label:hover {
  color: var(--text-primary);
}

.spacer {
  flex: 1;
}

.connection-status {
  font-size: 10px;
  color: var(--error-color);
}

.connection-status.connected {
  color: var(--success-color);
}
</style>
