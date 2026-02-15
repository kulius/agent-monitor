<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { useTerminalStore, type ClaudeStatus } from '../stores/terminal'
import { useSavedTabsStore, type SavedTab } from '../stores/savedTabs'
import { useServiceStore } from '../stores/service'
const store = useTerminalStore()
const savedTabsStore = useSavedTabsStore()
const serviceStore = useServiceStore()

// Service restart state
const restartingServiceIds = ref<Set<string>>(new Set())
const statusMessage = ref<{ text: string; type: 'info' | 'success' | 'error'; color?: string } | null>(null)
let statusTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => {
  if (statusTimer) clearTimeout(statusTimer)
})

function showStatus(text: string, type: 'info' | 'success' | 'error', color?: string, duration = 3000) {
  if (statusTimer) clearTimeout(statusTimer)
  statusMessage.value = { text, type, color }
  statusTimer = setTimeout(() => { statusMessage.value = null }, duration)
}

// Auto-match terminal name to service via linkedTerminalName config
function getMatchedService(termName: string) {
  if (!termName) return null
  const lower = termName.toLowerCase()
  return serviceStore.services.find(s =>
    s.linkedTerminalName && s.linkedTerminalName.toLowerCase() === lower
  ) ?? null
}

async function restartMatchedService(serviceId: string, event: MouseEvent) {
  event.stopPropagation()
  if (restartingServiceIds.value.has(serviceId)) return
  const svc = serviceStore.services.find(s => s.id === serviceId)
  const svcName = svc?.name ?? 'service'
  const svcColor = svc?.color

  restartingServiceIds.value = new Set([...restartingServiceIds.value, serviceId])
  showStatus(`Restarting ${svcName}...`, 'info', svcColor, 15000)
  try {
    const success = await serviceStore.restartService(serviceId)
    if (success) {
      showStatus(`${svcName} restarted`, 'success', svcColor)
    } else {
      showStatus(`${svcName} restart failed`, 'error')
    }
  } catch {
    showStatus(`${svcName} restart error`, 'error')
  } finally {
    const next = new Set(restartingServiceIds.value)
    next.delete(serviceId)
    restartingServiceIds.value = next
  }
}

// Status display helpers
function getStatusIcon(status?: ClaudeStatus): string {
  switch (status) {
    case 'waiting': return '❓'
    case 'completed': return '✅'
    case 'working': return '⏳'
    default: return ''
  }
}

function getStatusText(status?: ClaudeStatus): string {
  switch (status) {
    case 'waiting': return 'Waiting'
    case 'completed': return 'Done'
    case 'working': return 'Working'
    default: return ''
  }
}

function shouldBlink(status?: ClaudeStatus): boolean {
  return status === 'waiting' || status === 'completed'
}

function clearStatus(id: number, event: MouseEvent) {
  event.stopPropagation()
  store.clearClaudeStatus(id)
}

const activeId = computed(() => store.activeTerminalId)
// Hide service terminals unless they are the active tab (opened via ↗ button)
const terminals = computed(() =>
  store.terminals.filter(t =>
    !serviceStore.serviceTerminalIds.has(t.id) || t.id === activeId.value
  )
)
const savedTabs = computed(() => savedTabsStore.savedTabs)

// Edit state for tab names
const editingId = ref<number | null>(null)
const editingName = ref('')
const editInput = ref<HTMLInputElement | null>(null)
const pendingSaveId = ref<number | null>(null)

// Modal state
const showSavedModal = ref(false)
const editingSavedId = ref<string | null>(null)
const editForm = ref({ name: '', cwd: '', commands: '' })

function selectTerminal(id: number) {
  store.setActiveTerminal(id)
}

async function addTerminal() {
  await store.createTerminal()
}

function closeTerminal(id: number, event: MouseEvent) {
  event.stopPropagation()
  store.closeTerminal(id)
}

function getShortCwd(cwd: string, id: number): string {
  if (!cwd) return `PS ${id}`
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }
  return parts[parts.length - 1] || `PS ${id}`
}

// Edit tab name (inline)
async function startEdit(id: number, currentName: string, event: MouseEvent) {
  event.stopPropagation()
  editingId.value = id
  editingName.value = currentName || getShortCwd(
    terminals.value.find(t => t.id === id)?.cwd || '',
    id
  )
  await nextTick()
  editInput.value?.focus()
  editInput.value?.select()
}

function finishEdit(id: number) {
  if (editingName.value.trim()) {
    store.updateTerminalName(id, editingName.value.trim())
  }
  editingId.value = null
  editingName.value = ''

  if (pendingSaveId.value === id) {
    pendingSaveId.value = null
    doSaveTab(id)
  }
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

// Save current tab
function saveCurrentTab(id: number) {
  if (editingId.value === id) {
    pendingSaveId.value = id
    editInput.value?.blur()
    return
  }
  doSaveTab(id)
}

function doSaveTab(id: number) {
  const term = terminals.value.find(t => t.id === id)
  if (term) {
    const name = term.name || getShortCwd(term.cwd, id)
    savedTabsStore.saveTab(name, term.cwd, '', term.avatarUrl)
  }
}

// Modal functions
function openSavedModal(event: MouseEvent) {
  event.stopPropagation()
  showSavedModal.value = true
  editingSavedId.value = null
}

function closeSavedModal() {
  showSavedModal.value = false
  editingSavedId.value = null
}

// Edit saved tab
function startEditSaved(saved: SavedTab, event: MouseEvent) {
  event.stopPropagation()
  editingSavedId.value = saved.id
  editForm.value = {
    name: saved.name,
    cwd: saved.cwd,
    commands: saved.commands || ''
  }
}

function saveEditSaved(id: string) {
  savedTabsStore.updateTab(id, {
    name: editForm.value.name,
    cwd: editForm.value.cwd,
    commands: editForm.value.commands
  })
  editingSavedId.value = null
}

function cancelEditSaved() {
  editingSavedId.value = null
}

// Open saved tab and execute commands
async function openSavedTab(saved: SavedTab) {
  showSavedModal.value = false
  editingSavedId.value = null

  const newTerm = await store.createTerminal(saved.cwd, saved.name)
  if (newTerm) {
    // Restore avatar if saved
    if (saved.avatarUrl) {
      store.updateTerminalAvatar(newTerm.id, saved.avatarUrl)
    }

    // First cd to directory (single-quotes to prevent PowerShell injection)
    setTimeout(() => {
      const safeCwd = saved.cwd.replace(/'/g, "''")
      store.writeToTerminal(newTerm.id, `cd '${safeCwd}'\r`)

      // Then execute commands line by line
      if (saved.commands && saved.commands.trim()) {
        const lines = saved.commands.split('\n').filter(line => line.trim())
        let delay = 800
        for (const line of lines) {
          setTimeout(() => {
            store.writeToTerminal(newTerm.id, `${line.trim()}\r`)
          }, delay)
          delay += 500
        }
      }
    }, 500)
  }
}

function removeSavedTab(id: string, event: MouseEvent) {
  event.stopPropagation()
  savedTabsStore.removeTab(id)
}
</script>

<template>
  <div class="terminal-tabs">
    <div class="tabs-container">
      <div
        v-for="term in terminals"
        :key="term.id"
        :class="[
          'tab',
          { active: term.id === activeId },
          { 'status-waiting': term.claudeStatus === 'waiting' },
          { 'status-completed': term.claudeStatus === 'completed' },
          { blink: shouldBlink(term.claudeStatus) && term.id !== activeId }
        ]"
        @click="selectTerminal(term.id)"
        :title="term.cwd"
      >
        <!-- Status indicator -->
        <span
          v-if="term.claudeStatus && term.claudeStatus !== 'idle'"
          :class="['status-badge', `status-${term.claudeStatus}`]"
          @click="clearStatus(term.id, $event)"
          :title="'Click to clear: ' + getStatusText(term.claudeStatus)"
        >
          {{ getStatusIcon(term.claudeStatus) }}
        </span>
        <span v-else class="tab-icon">⌘</span>

        <input
          v-if="editingId === term.id"
          ref="editInput"
          v-model="editingName"
          class="tab-edit-input"
          @blur="finishEdit(term.id)"
          @keyup.enter="finishEdit(term.id)"
          @keyup.escape="cancelEdit"
          @click.stop
        />
        <span
          v-else
          class="tab-name"
          @dblclick="startEdit(term.id, term.name, $event)"
        >
          {{ term.name || getShortCwd(term.cwd, term.id) }}
        </span>

        <!-- Status text badge -->
        <span
          v-if="term.claudeStatus === 'waiting' || term.claudeStatus === 'completed'"
          :class="['status-text', `text-${term.claudeStatus}`]"
        >
          {{ getStatusText(term.claudeStatus) }}
        </span>

        <!-- Service restart button (auto-matched by terminal name) -->
        <button
          v-if="getMatchedService(term.name)"
          class="restart-btn"
          :class="{ spinning: restartingServiceIds.has(getMatchedService(term.name)!.id) }"
          :style="{ color: getMatchedService(term.name)!.color }"
          @click="restartMatchedService(getMatchedService(term.name)!.id, $event)"
          :title="'Restart ' + getMatchedService(term.name)!.name"
        >
          ↻
        </button>

        <button
          class="save-btn"
          @click.stop="saveCurrentTab(term.id)"
          title="Save this tab"
        >
          💾
        </button>

        <button
          class="close-btn"
          @click="closeTerminal(term.id, $event)"
          title="Close terminal"
        >
          ×
        </button>
      </div>
    </div>

    <!-- Status toast -->
    <transition name="toast">
      <span
        v-if="statusMessage"
        :class="['status-toast', `toast-${statusMessage.type}`]"
        :style="statusMessage.color ? { borderColor: statusMessage.color } : {}"
      >
        <span
          v-if="statusMessage.type === 'info'"
          class="toast-spinner"
          :style="statusMessage.color ? { borderTopColor: statusMessage.color } : {}"
        ></span>
        {{ statusMessage.text }}
      </span>
    </transition>

    <button
      class="tool-btn-small"
      @click="store.triggerResetDisplay()"
      title="Reset terminal display"
    >
      ↻
    </button>

    <button
      class="saved-btn"
      @click="openSavedModal"
      title="Open saved tab"
    >
      📂
    </button>

    <button class="add-btn" @click="addTerminal" title="New terminal">
      +
    </button>

    <!-- Saved Tabs Modal -->
    <Teleport to="body">
      <div v-if="showSavedModal" class="modal-overlay" @click="closeSavedModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Saved Tabs</h3>
            <button class="modal-close" @click="closeSavedModal">×</button>
          </div>
          <div class="modal-body">
            <div v-if="savedTabs.length === 0" class="saved-empty">
              No saved tabs yet.<br>
              Click 💾 on a tab to save it.
            </div>

            <div
              v-for="saved in savedTabs"
              :key="saved.id"
              class="saved-item"
            >
              <!-- Edit Mode -->
              <div v-if="editingSavedId === saved.id" class="edit-form">
                <div class="form-group">
                  <label>Name</label>
                  <input v-model="editForm.name" type="text" class="form-input" />
                </div>
                <div class="form-group">
                  <label>Directory</label>
                  <input v-model="editForm.cwd" type="text" class="form-input" />
                </div>
                <div class="form-group">
                  <label>Commands (one per line)</label>
                  <textarea
                    v-model="editForm.commands"
                    class="form-textarea"
                    rows="3"
                    placeholder="npm install&#10;npm run dev"
                  ></textarea>
                </div>
                <div class="form-actions">
                  <button class="btn btn-primary" @click="saveEditSaved(saved.id)">Save</button>
                  <button class="btn btn-secondary" @click="cancelEditSaved">Cancel</button>
                </div>
              </div>

              <!-- View Mode -->
              <template v-else>
                <div class="saved-main" @click="openSavedTab(saved)">
                  <div class="saved-info">
                    <span class="saved-name">{{ saved.name }}</span>
                    <span class="saved-cwd">{{ saved.cwd }}</span>
                    <span v-if="saved.commands" class="saved-has-cmd">📜 Has commands</span>
                  </div>
                </div>
                <div class="saved-actions">
                  <button
                    class="action-btn edit-btn"
                    @click="startEditSaved(saved, $event)"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn remove-btn"
                    @click="removeSavedTab(saved.id, $event)"
                    title="Remove"
                  >
                    🗑️
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.terminal-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
  min-height: 32px;
  overflow-x: auto;
}

.tabs-container {
  display: flex;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  min-width: 80px;
  max-width: 200px;
  transition: all 0.15s ease;
}

.tab:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.tab.active {
  background: var(--active-bg);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.tab-icon {
  font-size: 10px;
  opacity: 0.7;
}

/* Status styles */
.status-badge {
  font-size: 12px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.status-badge:hover {
  transform: scale(1.2);
}

.status-text {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
}

.text-waiting {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.text-completed {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

/* Tab status colors */
.tab.status-waiting {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.tab.status-completed {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

/* Blink animation */
@keyframes blink {
  0%, 50% {
    opacity: 1;
    box-shadow: 0 0 8px currentColor;
  }
  25%, 75% {
    opacity: 0.6;
    box-shadow: none;
  }
}

.tab.blink {
  animation: blink 1s ease-in-out infinite;
}

.tab.blink.status-waiting {
  color: #f59e0b;
}

.tab.blink.status-completed {
  color: #22c55e;
}

.tab-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.tab-edit-input {
  flex: 1;
  min-width: 60px;
  padding: 2px 4px;
  border: 1px solid var(--primary-color);
  border-radius: 2px;
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

/* Service restart button */
.restart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  opacity: 0.6;
  transition: all 0.15s ease;
}

.restart-btn:hover {
  opacity: 1;
  background: rgba(100, 180, 255, 0.15);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.restart-btn.spinning {
  opacity: 1 !important;
  animation: spin 0.8s linear infinite;
  pointer-events: none;
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 10px;
  opacity: 0;
  transition: all 0.15s ease;
}

.tab:hover .save-btn {
  opacity: 0.6;
}

.save-btn:hover {
  opacity: 1 !important;
  background: rgba(100, 200, 100, 0.2);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  opacity: 0;
  transition: all 0.15s ease;
}

.tab:hover .close-btn {
  opacity: 1;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.2);
  color: #ff6464;
}

/* Status toast */
.status-toast {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  background: var(--panel-bg);
  color: var(--text-primary);
}

.toast-info {
  color: var(--text-muted);
}

.toast-success {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #22c55e;
}

.toast-error {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
}

.toast-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid var(--border-color);
  border-top-color: var(--text-muted);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.tool-btn-small {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.tool-btn-small:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.saved-btn,
.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.saved-btn:hover,
.add-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
  border-color: var(--primary-color);
}

.add-btn {
  font-size: 16px;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  min-width: 380px;
  max-width: 500px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.modal-close {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-muted);
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.saved-empty {
  padding: 24px 16px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  line-height: 1.6;
}

.saved-item {
  display: flex;
  align-items: stretch;
  padding: 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  transition: all 0.15s ease;
}

.saved-item:hover {
  background: var(--hover-bg);
}

.saved-main {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.saved-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.saved-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.saved-cwd {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-has-cmd {
  font-size: 10px;
  color: var(--primary-color);
  margin-top: 2px;
}

.saved-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 8px;
}

.action-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  transition: all 0.15s ease;
}

.saved-item:hover .action-btn {
  opacity: 1;
}

.action-btn:hover {
  background: var(--active-bg);
}

.remove-btn:hover {
  background: rgba(255, 100, 100, 0.2);
}

/* Edit Form */
.edit-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.form-input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.form-input:focus {
  border-color: var(--primary-color);
}

.form-textarea {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Consolas', monospace;
  outline: none;
  resize: vertical;
  min-height: 60px;
}

.form-textarea:focus {
  border-color: var(--primary-color);
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--active-bg);
}
</style>
