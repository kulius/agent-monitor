<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ClaudeStatus } from '../stores/terminal'
import { playSound, stopSound } from '../utils/sounds'

const avatarLoadError = ref(false)

const props = defineProps<{
  id: number
  name: string
  status: ClaudeStatus
  avatarUrl?: string
  isActive: boolean
}>()

const emit = defineEmits<{
  click: [id: number]
  editAvatar: [id: number]
}>()

const statusClass = computed(() => props.status || 'idle')

const speechBubbleText = computed(() => {
  switch (props.status) {
    case 'waiting':
      return 'Help!'
    case 'completed':
      return '報告!!\n已完成'
    default:
      return ''
  }
})

// Watch status changes and play sounds
watch(() => props.status, (newStatus, oldStatus) => {
  if (newStatus === oldStatus) return

  // Stop typing sound when leaving working state
  if (oldStatus === 'working') {
    stopSound('typing')
  }

  // Play appropriate sound for new status
  switch (newStatus) {
    case 'working':
      playSound('typing', true) // loop
      break
    case 'waiting':
      playSound('help')
      break
    case 'completed':
      playSound('complete')
      break
  }
})

function handleClick() {
  emit('click', props.id)
}

function handleDoubleClick() {
  emit('editAvatar', props.id)
}

function handleImageError() {
  avatarLoadError.value = true
}

// Reset error when avatar URL changes
watch(() => props.avatarUrl, () => {
  avatarLoadError.value = false
})
</script>

<template>
  <div
    class="office-worker"
    :class="{ active: isActive }"
    @click="handleClick"
    @dblclick="handleDoubleClick"
  >
    <!-- Pixel Desk -->
    <div class="desk">
      <div class="monitor">
        <div class="screen" :class="statusClass"></div>
      </div>
      <div class="keyboard"></div>
    </div>

    <!-- Pixel Character -->
    <div class="character" :class="statusClass">
      <!-- Custom Avatar or Default Pixel Person -->
      <div v-if="avatarUrl && !avatarLoadError" class="avatar-custom">
        <img
          :src="avatarUrl"
          :alt="name"
          referrerpolicy="no-referrer"
          @error="handleImageError"
        />
      </div>
      <div v-else class="avatar-pixel">
        <!-- Pixel person using CSS -->
        <div class="pixel-head"></div>
        <div class="pixel-body"></div>
        <div class="pixel-arms" :class="statusClass"></div>
      </div>
    </div>

    <!-- Speech Bubble -->
    <div v-if="speechBubbleText" class="speech-bubble" :class="statusClass">
      <span>{{ speechBubbleText }}</span>
    </div>

    <!-- Name Tag -->
    <div class="name-tag">{{ name }}</div>
  </div>
</template>

<style scoped>
.office-worker {
  position: relative;
  width: 120px;
  height: 140px;
  padding: 8px;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  background: var(--panel-bg);
  border: 2px solid transparent;
}

.office-worker:hover {
  background: var(--hover-bg);
  transform: translateY(-2px);
}

.office-worker.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 8px rgba(79, 70, 229, 0.3);
}

/* Pixel Desk */
.desk {
  position: absolute;
  bottom: 35px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.monitor {
  width: 40px;
  height: 30px;
  background: #333;
  border: 3px solid #555;
  border-radius: 3px;
  padding: 2px;
  image-rendering: pixelated;
}

.screen {
  width: 100%;
  height: 100%;
  background: #1a1a2e;
  transition: background 0.3s ease;
}

.screen.working {
  background: #16213e;
  animation: screenGlow 0.5s ease-in-out infinite alternate;
}

.screen.waiting {
  background: #ff6b6b;
  animation: screenBlink 0.8s ease-in-out infinite;
}

.screen.completed {
  background: #51cf66;
}

@keyframes screenGlow {
  from { background: #16213e; }
  to { background: #0f3460; }
}

@keyframes screenBlink {
  0%, 100% { background: #ff6b6b; }
  50% { background: #c92a2a; }
}

.keyboard {
  width: 36px;
  height: 6px;
  background: #666;
  border-radius: 1px;
  margin-top: 2px;
}

/* Pixel Character */
.character {
  position: absolute;
  bottom: 55px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 48px;
}

.avatar-custom {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  image-rendering: pixelated;
}

.avatar-custom img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Default Pixel Person */
.avatar-pixel {
  position: relative;
  width: 32px;
  height: 48px;
}

.pixel-head {
  position: absolute;
  top: 0;
  left: 8px;
  width: 16px;
  height: 16px;
  background: #ffd8b1;
  border-radius: 2px;
  image-rendering: pixelated;
}

.pixel-head::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 0;
  width: 16px;
  height: 6px;
  background: #4a4a4a;
  border-radius: 2px 2px 0 0;
}

/* Eyes */
.pixel-head::after {
  content: '';
  position: absolute;
  top: 5px;
  left: 3px;
  width: 3px;
  height: 3px;
  background: #333;
  box-shadow: 7px 0 0 #333;
  image-rendering: pixelated;
}

.pixel-body {
  position: absolute;
  top: 16px;
  left: 6px;
  width: 20px;
  height: 20px;
  background: #4a90d9;
  border-radius: 2px;
  image-rendering: pixelated;
}

.pixel-arms {
  position: absolute;
  top: 18px;
  left: 0;
  width: 6px;
  height: 14px;
  background: #ffd8b1;
  border-radius: 1px;
  box-shadow: 26px 0 0 #ffd8b1;
  transition: all 0.1s ease;
  image-rendering: pixelated;
}

/* Arm animations based on status */
.pixel-arms.working {
  animation: typing 0.2s ease-in-out infinite alternate;
}

.pixel-arms.waiting {
  top: 4px;
  transform: rotate(-30deg);
  transform-origin: bottom center;
  animation: raiseHand 0.5s ease-in-out infinite alternate;
}

.pixel-arms.completed {
  top: 18px;
  left: 2px;
  box-shadow: 24px 0 0 #ffd8b1;
}

@keyframes typing {
  from { transform: translateY(0); }
  to { transform: translateY(2px); }
}

@keyframes raiseHand {
  from { transform: rotate(-30deg); }
  to { transform: rotate(-45deg); }
}

/* Idle animation */
.character.idle .avatar-pixel {
  animation: idleBob 2s ease-in-out infinite;
}

@keyframes idleBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* Speech Bubble */
.speech-bubble {
  position: absolute;
  top: 0;
  right: -5px;
  padding: 4px 8px;
  background: white;
  border: 2px solid #333;
  border-radius: 8px;
  font-size: 10px;
  font-weight: bold;
  white-space: pre-line;
  text-align: center;
  z-index: 10;
  animation: bubblePop 0.3s ease-out;
  image-rendering: auto;
}

.speech-bubble::before {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 10px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid #333;
}

.speech-bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 11px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid white;
}

.speech-bubble.waiting {
  background: #fff3bf;
  border-color: #f59f00;
  color: #e67700;
}

.speech-bubble.waiting::before {
  border-top-color: #f59f00;
}

.speech-bubble.waiting::after {
  border-top-color: #fff3bf;
}

.speech-bubble.completed {
  background: #d3f9d8;
  border-color: #40c057;
  color: #2f9e44;
}

.speech-bubble.completed::before {
  border-top-color: #40c057;
}

.speech-bubble.completed::after {
  border-top-color: #d3f9d8;
}

@keyframes bubblePop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Name Tag */
.name-tag {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 6px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
</style>
