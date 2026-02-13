<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useFileExplorerStore } from '../stores/fileExplorer'
import FileTreeNode from './FileTreeNode.vue'

const store = useFileExplorerStore()

const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)

const displayPath = computed(() => {
  const p = store.rootPath
  if (!p) return ''
  // Show last 2 segments for brevity
  const parts = p.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return p
  return '.../' + parts.slice(-2).join('/')
})

function startResize(e: MouseEvent) {
  isResizing.value = true
  startX.value = e.clientX
  startWidth.value = store.sidebarWidth
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const delta = e.clientX - startX.value
  store.setSidebarWidth(startWidth.value + delta)
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onMounted(() => {
  store.initFromTerminal()
})

onUnmounted(() => {
  if (isResizing.value) {
    stopResize()
  }
})
</script>

<template>
  <div class="file-explorer" :style="{ width: store.sidebarWidth + 'px' }">
    <!-- Header -->
    <div class="explorer-header">
      <span class="explorer-title">Explorer</span>
      <button class="header-btn" @click="store.toggleVisibility()" title="Close">✕</button>
    </div>

    <!-- Toolbar -->
    <div class="explorer-toolbar">
      <button class="tool-btn" @click="store.navigateUp()" title="Go up">⬆</button>
      <button class="tool-btn" @click="store.refreshAll()" title="Refresh">🔄</button>
      <button
        class="tool-btn"
        :class="{ active: store.showHiddenFiles }"
        @click="store.toggleHiddenFiles()"
        title="Toggle hidden files"
      >👁</button>
    </div>

    <!-- Current path -->
    <div class="current-path" :title="store.rootPath">
      {{ displayPath }}
    </div>

    <!-- Tree -->
    <div class="tree-container">
      <div v-if="store.isLoading" class="loading">Loading...</div>
      <div v-else-if="store.visibleRootEntries.length === 0" class="empty">
        Empty directory
      </div>
      <template v-else>
        <FileTreeNode
          v-for="entry in store.visibleRootEntries"
          :key="entry.path"
          :entry="entry"
          :depth="0"
        />
      </template>
    </div>

    <!-- Resize handle -->
    <div class="resize-handle" @mousedown="startResize"></div>
  </div>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel-bg);
  border-right: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
  min-width: 150px;
  max-width: 400px;
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  user-select: none;
}

.explorer-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
}

.header-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.explorer-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
}

.tool-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-color);
}

.tool-btn.active {
  background: var(--active-bg);
  border-color: var(--border-color);
}

.current-path {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.loading,
.empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.resize-handle:hover {
  background: var(--primary-color);
  opacity: 0.3;
}
</style>
