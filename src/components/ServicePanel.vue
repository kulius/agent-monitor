<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useServiceStore, type ServiceDefinition } from '../stores/service'
import ServiceEditor from './ServiceEditor.vue'

const serviceStore = useServiceStore()

const showEditor = ref(false)
const editingService = ref<ServiceDefinition | undefined>(undefined)

// Log modal state
const logServiceId = ref<string | null>(null)
const logRef = ref<HTMLPreElement | null>(null)

// Auto-scroll log when content updates (only if user is near bottom)
watch(
  () => {
    if (!logServiceId.value) return 0
    return serviceStore.getLog(logServiceId.value).length
  },
  () => {
    if (!logServiceId.value) return
    nextTick(() => {
      if (logRef.value) {
        const el = logRef.value
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        if (isNearBottom) {
          el.scrollTop = el.scrollHeight
        }
      }
    })
  }
)

function openLog(serviceId: string): void {
  logServiceId.value = logServiceId.value === serviceId ? null : serviceId
}

function closeLog(): void {
  logServiceId.value = null
}

function getLogServiceName(): string {
  if (!logServiceId.value) return ''
  const svc = serviceStore.services.find(s => s.id === logServiceId.value)
  return svc?.name ?? ''
}

function getLogStartedAt(): string {
  if (!logServiceId.value) return ''
  const inst = serviceStore.instances.find(i => i.serviceId === logServiceId.value)
  if (!inst?.startedAt) return ''
  return new Date(inst.startedAt).toLocaleTimeString()
}

function clearLog(): void {
  if (!logServiceId.value) return
  serviceStore.clearLog(logServiceId.value)
}

function openAdd(): void {
  editingService.value = undefined
  showEditor.value = true
}

function openEdit(service: ServiceDefinition): void {
  editingService.value = service
  showEditor.value = true
}

function handleSave(data: { name: string; command: string; cwd: string; color: string; linkedTerminalName: string }): void {
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
          active: logServiceId === service.id
        }"
        :style="{ '--svc-color': service.color }"
      >
        <span
          class="chip-dot"
          :class="serviceStore.getStatus(service.id)"
        />
        <span
          class="chip-name"
          @click="openLog(service.id)"
          title="View log"
        >
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

        <!-- Edit / Delete on hover -->
        <span class="chip-extra">
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

    <!-- Log viewer (below chip row, toggleable) -->
    <div v-if="logServiceId" class="log-area">
      <div class="log-header">
        <span class="log-title">{{ getLogServiceName() }} — Log</span>
        <span class="log-status" :class="serviceStore.getStatus(logServiceId)">
          {{ serviceStore.getStatus(logServiceId) }}
        </span>
        <span v-if="getLogStartedAt()" class="log-started">
          started {{ getLogStartedAt() }}
        </span>
        <button class="log-clear" @click="clearLog" title="Clear log">Clear</button>
        <button class="log-close" @click="closeLog" title="Close log">×</button>
      </div>
      <pre
        ref="logRef"
        class="log-output"
      >{{ serviceStore.getLog(logServiceId) || '(no output yet)' }}</pre>
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

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 2px;
}

.log-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  text-transform: uppercase;
}

.log-status.running {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success-color);
}

.log-status.stopped {
  background: rgba(107, 114, 128, 0.15);
  color: var(--text-muted);
}

.log-status.error {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning-color);
}

.log-started {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}

.log-clear {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 10px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 1px 6px;
  line-height: 1.4;
}

.log-clear:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.log-close {
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.log-close:hover {
  color: var(--text-primary);
}

.log-output {
  max-height: 250px;
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
