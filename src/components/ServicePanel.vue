<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useServiceStore, type ServiceDefinition } from '../stores/service'
import ServiceEditor from './ServiceEditor.vue'

const serviceStore = useServiceStore()

const expandedId = ref<string | null>(null)
const showEditor = ref(false)
const editingService = ref<ServiceDefinition | undefined>(undefined)

// Auto-scroll log ref
const logRef = ref<HTMLPreElement | null>(null)

// Auto-scroll to bottom when log updates
watch(
  () => {
    if (!expandedId.value) return 0
    const inst = serviceStore.instances.find(i => i.serviceId === expandedId.value)
    return inst?.logBuffer.length ?? 0
  },
  () => {
    if (!expandedId.value) return
    nextTick(() => {
      if (logRef.value) {
        logRef.value.scrollTop = logRef.value.scrollHeight
      }
    })
  }
)

function toggleExpand(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

function openAdd(): void {
  editingService.value = undefined
  showEditor.value = true
}

function openEdit(service: ServiceDefinition): void {
  editingService.value = service
  showEditor.value = true
}

function handleSave(data: { name: string; command: string; cwd: string; color: string }): void {
  if (editingService.value) {
    serviceStore.updateService(editingService.value.id, data)
  } else {
    serviceStore.addService(data)
  }
  showEditor.value = false
  editingService.value = undefined
}

const pendingRemoveId = ref<string | null>(null)
let removeTimer: ReturnType<typeof setTimeout> | null = null

async function handleRemove(id: string): Promise<void> {
  // First click = arm, second click within 2s = confirm
  if (pendingRemoveId.value === id) {
    pendingRemoveId.value = null
    if (removeTimer) clearTimeout(removeTimer)
    await serviceStore.removeService(id)
  } else {
    pendingRemoveId.value = id
    if (removeTimer) clearTimeout(removeTimer)
    removeTimer = setTimeout(() => { pendingRemoveId.value = null }, 2000)
  }
}

async function handleStart(id: string): Promise<void> {
  await serviceStore.startService(id)
}

async function handleStop(id: string): Promise<void> {
  await serviceStore.stopService(id)
}
</script>

<template>
  <div class="service-panel">
    <!-- Chip row: toolbar + services inline -->
    <div class="chip-row">
      <button class="tool-btn start-all" @click="serviceStore.startAll()">▶ All</button>
      <button class="tool-btn stop-all" @click="serviceStore.stopAll()">■ All</button>

      <span v-if="serviceStore.services.length === 0" class="empty-hint">
        No services
      </span>

      <!-- Service chips -->
      <div
        v-for="service in serviceStore.services"
        :key="service.id"
        class="chip"
        :class="{
          running: serviceStore.getStatus(service.id) === 'running',
          active: expandedId === service.id
        }"
        :style="{ '--svc-color': service.color }"
      >
        <!-- Status dot + name (click to expand log) -->
        <span
          class="chip-dot"
          :class="serviceStore.getStatus(service.id)"
        />
        <span class="chip-name" @click="toggleExpand(service.id)">
          {{ service.name }}
        </span>

        <!-- Start / Stop -->
        <button
          v-if="serviceStore.getStatus(service.id) !== 'running'"
          class="chip-btn start"
          title="Start"
          @click.stop="handleStart(service.id)"
        >▶</button>
        <button
          v-else
          class="chip-btn stop"
          title="Stop"
          @click.stop="handleStop(service.id)"
        >■</button>

        <!-- View in terminal / Edit / Delete on hover -->
        <span class="chip-extra">
          <button
            v-if="serviceStore.getStatus(service.id) === 'running'"
            class="chip-btn view"
            title="Open in terminal tab"
            @click.stop="serviceStore.viewInTerminal(service.id)"
          >&#x2197;</button>
          <button class="chip-btn" title="Edit" @click.stop="openEdit(service)">✏</button>
          <button
            class="chip-btn del"
            :class="{ armed: pendingRemoveId === service.id }"
            :title="pendingRemoveId === service.id ? 'Click again to confirm' : 'Remove'"
            @click.stop="handleRemove(service.id)"
          >{{ pendingRemoveId === service.id ? '!!' : '×' }}</button>
        </span>
      </div>

      <button class="tool-btn add-btn" @click="openAdd">+</button>
    </div>

    <!-- Expanded log (below chip row) -->
    <div v-if="expandedId" class="log-area">
      <pre
        ref="logRef"
        class="log-output"
      >{{ serviceStore.getLog(expandedId) || '(no output yet)' }}</pre>
    </div>

    <!-- Editor modal -->
    <ServiceEditor
      v-if="showEditor"
      :service="editingService"
      @save="handleSave"
      @cancel="showEditor = false"
    />
  </div>
</template>

<style scoped>
.service-panel {
  display: flex;
  flex-direction: column;
}

.chip-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  flex-wrap: wrap;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 0 4px;
}

/* Toolbar buttons */
.tool-btn {
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.5;
}

.tool-btn:hover {
  background: var(--hover-bg);
}

.start-all {
  color: var(--success-color);
}

.stop-all {
  color: var(--error-color);
}

.add-btn {
  color: var(--primary-color);
  font-weight: 700;
  font-size: 13px;
  padding: 1px 8px;
}

/* Service chip */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-color);
  font-size: 12px;
  white-space: nowrap;
  transition: border-color 0.15s ease;
}

.chip.running {
  border-color: var(--svc-color, var(--success-color));
}

.chip.active {
  background: var(--hover-bg);
}

.chip:hover .chip-extra {
  display: inline-flex;
}

/* Dot */
.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chip-dot.running {
  background: var(--svc-color, var(--success-color));
  box-shadow: 0 0 4px var(--svc-color, var(--success-color));
}

.chip-dot.stopped {
  background: var(--text-muted);
}

.chip-dot.error {
  background: var(--warning-color);
}

/* Name */
.chip-name {
  cursor: pointer;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.chip-name:hover {
  text-decoration: underline;
}

/* Chip buttons */
.chip-btn {
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 10px;
  cursor: pointer;
  color: var(--text-muted);
  line-height: 1;
}

.chip-btn:hover {
  color: var(--text-primary);
}

.chip-btn.start {
  color: var(--success-color);
}

.chip-btn.stop {
  color: var(--error-color);
}

.chip-btn.view {
  color: var(--primary-color);
}

.chip-btn.del:hover {
  color: var(--error-color);
}

.chip-btn.del.armed {
  color: var(--error-color);
  font-weight: 700;
}

/* Edit/delete hidden until hover */
.chip-extra {
  display: none;
  align-items: center;
  gap: 2px;
}

/* Log area */
.log-area {
  padding: 2px 10px 6px;
}

.log-output {
  max-height: 150px;
  overflow-y: auto;
  background: var(--active-bg);
  color: var(--text-primary);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
