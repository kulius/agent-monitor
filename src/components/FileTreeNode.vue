<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFileExplorerStore, type FileEntry } from '../stores/fileExplorer'

const props = defineProps<{
  entry: FileEntry
  depth: number
}>()

const MAX_DEPTH = 20

const store = useFileExplorerStore()
const copiedPath = ref(false)

const isExpanded = computed(() => store.expandedDirs.has(props.entry.path))
const children = computed(() => store.getVisibleEntries(props.entry.path))
const paddingLeft = computed(() => `${props.depth * 16 + 8}px`)

const icon = computed(() => {
  if (props.entry.is_dir) {
    return isExpanded.value ? '📂' : '📁'
  }
  const ext = props.entry.name.split('.').pop()?.toLowerCase() ?? ''
  const iconMap: Record<string, string> = {
    ts: '🟦', tsx: '🟦', js: '🟨', jsx: '🟨',
    vue: '💚', rs: '🦀', json: '📋', md: '📝',
    html: '🌐', css: '🎨', scss: '🎨',
    png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
    toml: '⚙️', yaml: '⚙️', yml: '⚙️', lock: '🔒',
  }
  return iconMap[ext] || '📄'
})

async function handleClick() {
  if (props.entry.is_dir) {
    await store.toggleDirectory(props.entry.path)
  }
  copyPath()
}

function handleDoubleClick() {
  if (props.entry.is_dir) {
    store.navigateToDirectory(props.entry.path)
  }
}

async function copyPath() {
  try {
    await navigator.clipboard.writeText(props.entry.path)
    copiedPath.value = true
    setTimeout(() => { copiedPath.value = false }, 1200)
  } catch {
    console.error('Clipboard write failed')
  }
}

// Load children if already expanded (e.g. after refresh)
onMounted(async () => {
  if (props.entry.is_dir && isExpanded.value) {
    await store.loadDirectory(props.entry.path)
  }
})
</script>

<template>
  <div class="tree-node">
    <div
      class="node-row"
      :style="{ paddingLeft }"
      @click="handleClick"
      @dblclick="handleDoubleClick"
      :title="entry.path"
    >
      <span v-if="entry.is_dir" class="expand-arrow">
        {{ isExpanded ? '▾' : '▸' }}
      </span>
      <span v-else class="expand-arrow-placeholder"></span>
      <span class="node-icon">{{ icon }}</span>
      <span class="node-name" :class="{ hidden: entry.is_hidden }">
        {{ entry.name }}
      </span>
      <span v-if="copiedPath" class="copied-badge">Copied!</span>
    </div>
    <div v-if="entry.is_dir && isExpanded && children.length > 0 && depth < MAX_DEPTH" class="children">
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
}

.node-row:hover {
  background: var(--hover-bg);
}

.expand-arrow {
  width: 12px;
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
  text-align: center;
}

.expand-arrow-placeholder {
  width: 12px;
  flex-shrink: 0;
}

.node-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.node-name.hidden {
  opacity: 0.5;
}

.copied-badge {
  margin-left: auto;
  font-size: 10px;
  color: var(--success-color);
  flex-shrink: 0;
  padding-right: 4px;
}

.children {
  /* no extra styling needed */
}
</style>
