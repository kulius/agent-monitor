<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ServiceDefinition } from '../stores/service'

const props = defineProps<{
  service?: ServiceDefinition
}>()

const emit = defineEmits<{
  save: [data: { name: string; command: string; cwd: string; color: string; linkedTerminalName: string }]
  cancel: []
}>()

const COLOR_PALETTE = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

const name = ref('')
const command = ref('')
const cwd = ref('')
const color = ref(COLOR_PALETTE[0])
const linkedTerminalName = ref('')

onMounted(() => {
  if (props.service) {
    name.value = props.service.name
    command.value = props.service.command
    cwd.value = props.service.cwd
    color.value = props.service.color
    linkedTerminalName.value = props.service.linkedTerminalName ?? ''
  }
})

function handleSave(): void {
  if (!name.value.trim() || !command.value.trim()) return
  emit('save', {
    name: name.value.trim(),
    command: command.value.trim(),
    cwd: cwd.value.trim(),
    color: color.value,
    linkedTerminalName: linkedTerminalName.value.trim()
  })
}
</script>

<template>
  <div class="editor-overlay" @click.self="emit('cancel')">
    <div class="editor-modal">
      <div class="editor-header">
        <span>{{ service ? 'Edit Service' : 'Add Service' }}</span>
        <button class="close-btn" @click="emit('cancel')">×</button>
      </div>

      <div class="editor-body">
        <label class="field">
          <span class="field-label">Name</span>
          <input
            v-model="name"
            type="text"
            placeholder="e.g. Odoo 18"
            class="field-input"
          />
        </label>

        <label class="field">
          <span class="field-label">Command</span>
          <textarea
            v-model="command"
            placeholder="e.g. python odoo-bin -c odoo.conf"
            class="field-input field-textarea"
            rows="3"
          />
        </label>

        <label class="field">
          <span class="field-label">Working Directory</span>
          <input
            v-model="cwd"
            type="text"
            placeholder="e.g. D:\projects\odoo"
            class="field-input"
          />
        </label>

        <div class="field">
          <span class="field-label">Color</span>
          <div class="color-palette">
            <button
              v-for="c in COLOR_PALETTE"
              :key="c"
              class="color-swatch"
              :class="{ selected: color === c }"
              :style="{ backgroundColor: c }"
              @click="color = c"
            />
          </div>
        </div>

        <label class="field">
          <span class="field-label">Link to Terminal (name)</span>
          <input
            v-model="linkedTerminalName"
            type="text"
            placeholder="e.g. jowua"
            class="field-input"
          />
          <span class="field-hint">Terminal tab with this name will show a restart button</span>
        </label>
      </div>

      <div class="editor-footer">
        <button class="btn btn-cancel" @click="emit('cancel')">Cancel</button>
        <button
          class="btn btn-save"
          :disabled="!name.trim() || !command.trim()"
          @click="handleSave"
        >
          {{ service ? 'Save' : 'Add' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.editor-modal {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 380px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.editor-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.field-input {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.field-input:focus {
  border-color: var(--primary-color);
}

.field-hint {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.7;
}

.field-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: 'Consolas', 'Courier New', monospace;
}

.color-palette {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.color-swatch.selected {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-color), 0 0 0 4px var(--text-muted);
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.btn-cancel {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.btn-cancel:hover {
  background: var(--active-bg);
}

.btn-save {
  background: var(--primary-color);
  color: white;
}

.btn-save:hover {
  opacity: 0.9;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
