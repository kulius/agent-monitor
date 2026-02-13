<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{
  currentAvatar?: string
}>()

const emit = defineEmits<{
  select: [avatarUrl: string | undefined]
  close: []
}>()

// Keyboard support
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Preset emoji avatars
const presetAvatars = [
  '👨‍💻', '👩‍💻', '🧑‍💻',
  '🤖', '👾', '🎮',
  '🦊', '🐱', '🐶',
  '🦁', '🐼', '🐨',
  '🦄', '🐲', '🦖',
  '👻', '🎃', '💀',
  '🥷', '🧙', '🧛',
]

const customUrl = ref('')
const showCustomInput = ref(false)
const urlError = ref('')

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow https and data URLs
    if (!['https:', 'data:'].includes(parsed.protocol)) {
      return false
    }
    // Check for common image extensions or data URLs
    const pathname = parsed.pathname.toLowerCase()
    const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
    return validExtensions.some(ext => pathname.endsWith(ext)) ||
           url.startsWith('data:image/')
  } catch {
    return false
  }
}

function selectPreset(emoji: string) {
  // Convert emoji to data URL for consistent display
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '48px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, 32, 36)
    emit('select', canvas.toDataURL())
  }
}

function selectCustomUrl() {
  const url = customUrl.value.trim()
  urlError.value = ''

  if (!url) return

  if (isValidImageUrl(url)) {
    emit('select', url)
  } else {
    urlError.value = 'Invalid URL. Use https:// with .png, .jpg, .gif, .webp, or .svg'
  }
}

function clearAvatar() {
  emit('select', undefined)
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}
</script>

<template>
  <div class="avatar-picker-backdrop" @click="handleBackdropClick">
    <div class="avatar-picker">
      <div class="picker-header">
        <span class="picker-title">Choose Avatar</span>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="picker-content">
        <!-- Current Avatar Preview -->
        <div v-if="currentAvatar" class="current-preview">
          <span class="preview-label">Current:</span>
          <img :src="currentAvatar" alt="Current avatar" class="preview-image" />
          <button class="clear-btn" @click="clearAvatar">Remove</button>
        </div>

        <!-- Preset Emojis -->
        <div class="preset-section">
          <span class="section-label">Presets</span>
          <div class="preset-grid">
            <button
              v-for="emoji in presetAvatars"
              :key="emoji"
              class="preset-btn"
              @click="selectPreset(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </div>

        <!-- Custom URL -->
        <div class="custom-section">
          <button
            class="toggle-custom-btn"
            @click="showCustomInput = !showCustomInput"
          >
            {{ showCustomInput ? '▼' : '▶' }} Custom Image URL
          </button>

          <div v-if="showCustomInput" class="custom-input-group">
            <input
              v-model="customUrl"
              type="url"
              placeholder="https://example.com/avatar.png"
              class="custom-input"
              :class="{ error: urlError }"
              @keyup.enter="selectCustomUrl"
              @input="urlError = ''"
            />
            <button
              class="apply-btn"
              :disabled="!customUrl.trim()"
              @click="selectCustomUrl"
            >
              Apply
            </button>
          </div>
          <div v-if="urlError" class="url-error">{{ urlError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-picker-backdrop {
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

.avatar-picker {
  background: var(--bg-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  width: 320px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border-color);
}

.picker-title {
  font-weight: 600;
  font-size: 14px;
}

.close-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.picker-content {
  padding: 16px;
  overflow-y: auto;
}

.current-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--panel-bg);
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview-label {
  font-size: 12px;
  color: var(--text-muted);
}

.preview-image {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
}

.clear-btn {
  margin-left: auto;
  padding: 4px 8px;
  background: var(--error-color);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.clear-btn:hover {
  opacity: 0.9;
}

.preset-section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.preset-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 20px;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  background: var(--hover-bg);
  transform: scale(1.1);
}

.custom-section {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.toggle-custom-btn {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  text-align: left;
  transition: color 0.15s ease;
}

.toggle-custom-btn:hover {
  color: var(--text-primary);
}

.custom-input-group {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.custom-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.custom-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.apply-btn {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.apply-btn:not(:disabled):hover {
  opacity: 0.9;
}

.custom-input.error {
  border-color: var(--error-color);
}

.url-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--error-color);
}
</style>
