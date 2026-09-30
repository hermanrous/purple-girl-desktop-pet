import spec from '../../../pet-spec.json';
import type { PetSpec, StateActivity } from '../../shared/contracts';
import { exceedsDragThreshold } from '../../main/drag';
import { PetStateMachine } from './state-machine';
import './index.css';

const petSpec = spec as PetSpec;

const sprite = document.getElementById('pet-sprite') as HTMLImageElement;
const container = document.getElementById('pet-container') as HTMLDivElement;
const feedbackBubble = document.getElementById('feedback-bubble') as HTMLDivElement;

// Chromium 会默认把 img 当作可拖拽内容；桌宠只允许窗口拖拽。
container.addEventListener('dragstart', (event) => event.preventDefault());

// Webpack 在构建时递归收集当前 spec 对应的素材，不硬编码角色或动作名。
const assetMap = new Map<string, string>();
const assetFrames = new Map<string, string[]>();
const assetContext = require.context('../../assets/pet', true, /\.png$/i);
for (const key of assetContext.keys()) {
  assetMap.set(key.replace(/^\.\//, ''), assetContext(key));
}
const expectedAssetNames = [...new Set([
  petSpec.character.coreAsset,
  ...petSpec.states.flatMap((state) => state.frames),
])];

// 构建状态帧映射
for (const state of petSpec.states) {
  assetFrames.set(state.id, state.frames);
}

const stateMachine = new PetStateMachine(petSpec.states, performance.now());
container.dataset.state = stateMachine.currentStateId();
let animationFrame: number | null = null;

// 点击时的随机气泡文案
const CLICK_BUBBLES = [
  '嘿嘿～',
  '你好呀！',
  '找我玩吗？',
  '今天也要开心哦！',
  '戳戳～',
  '我在这儿呢！',
  '嘻嘻～',
  '有什么事吗？',
];
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;

// 挤压回弹
function playSquash(): void {
  if (!petSpec.motion.squashStretch.enabled) return;
  const squash = petSpec.motion.squashStretch;
  document.documentElement.style.setProperty('--squash-duration', `${squash.durationMs}ms`);
  document.documentElement.style.setProperty('--squash-intensity', `${squash.intensity}`);
  sprite.classList.remove('squash');
  void sprite.offsetWidth; // 触发重绘
  sprite.classList.add('squash');
}

// 显示反馈气泡（不透明白底，位于角色上方不遮挡角色）
function showFeedback(text: string): void {
  feedbackBubble.textContent = text;
  feedbackBubble.classList.add('show');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    feedbackBubble.classList.remove('show');
    bubbleTimer = null;
  }, 2200);
}

// 切换状态
function setState(stateId: string, durationMs?: number): void {
  if (!stateMachine.start(stateId, performance.now(), durationMs)) return;
  const snapshot = stateMachine.tick(performance.now());
  container.dataset.state = snapshot.stateId;
  const frameUrl = assetMap.get(snapshot.frame);
  if (frameUrl) sprite.src = frameUrl;
}

// 动画循环
function animate(timestamp: number): void {
  const snapshot = stateMachine.tick(timestamp);
  container.dataset.state = snapshot.stateId;
  if (snapshot.stateChanged) {
    const frameUrl = assetMap.get(snapshot.frame);
    if (frameUrl) sprite.src = frameUrl;
  }
  animationFrame = requestAnimationFrame(animate);
}

// 点击事件：播放开心动作 + 随机气泡
function handleClick(): void {
  playSquash();
  setState('happy');
  const bubble = CLICK_BUBBLES[Math.floor(Math.random() * CLICK_BUBBLES.length)];
  if (bubble) showFeedback(bubble);
}

container.addEventListener('click', () => {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  handleClick();
});

// 鼠标滚轮调整大小
const SCALE_STEP = 0.1;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
let currentScale = petSpec.experience.petSizing.defaultScale;
let scaleUpdatePending = false;

container.addEventListener('wheel', (event) => {
  event.preventDefault();
  const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
  const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round((currentScale + delta) * 100) / 100));
  if (Math.abs(nextScale - currentScale) < 0.001) return;
  currentScale = nextScale;
  if (scaleUpdatePending) return;
  scaleUpdatePending = true;
  requestAnimationFrame(() => {
    void window.petAPI?.settings.update({ petScale: currentScale }).catch(() => {});
    scaleUpdatePending = false;
  });
}, { passive: false });

// 拖拽
let isDragging = false;
let pointerStart = { x: 0, y: 0 };
let activePointerId: number | undefined;
let dragUpdatePending = false;
let suppressNextClick = false;
let dragBegin: Promise<void> | undefined;

container.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || activePointerId !== undefined) return;
  activePointerId = event.pointerId;
  pointerStart = { x: event.clientX, y: event.clientY };
  container.setPointerCapture(event.pointerId);
});

container.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointerId) return;
  if (!isDragging && exceedsDragThreshold(pointerStart, { x: event.clientX, y: event.clientY })) {
    isDragging = true;
    dragBegin = window.petAPI?.window.beginDrag() ?? Promise.resolve();
  }
  if (!isDragging) return;
  if (dragUpdatePending) return;
  dragUpdatePending = true;
  requestAnimationFrame(() => {
    void (dragBegin ?? Promise.resolve())
      .then(() => window.petAPI?.window.updateDrag())
      .catch(() => {})
      .finally(() => { dragUpdatePending = false; });
  });
});

function finishPointer(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
  activePointerId = undefined;
  const dragged = isDragging;
  isDragging = false;
  dragUpdatePending = false;
  if (dragged) {
    suppressNextClick = true;
    void (dragBegin ?? Promise.resolve())
      .then(() => window.petAPI?.window.endDrag())
      .catch(() => {});
  }
  dragBegin = undefined;
}

container.addEventListener('pointerup', finishPointer);
container.addEventListener('pointercancel', finishPointer);

// 右键菜单
container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.petAPI?.window.showContextMenu().catch(() => {});
});

// 监听状态活动（右键菜单触发的互动等）
window.petAPI?.events.onStateActivity((activity: StateActivity) => {
  if (activity.stateId) {
    setState(activity.stateId, activity.durationMs);
  }
  if (activity.feedback) {
    showFeedback(activity.feedback);
  }
});

// 同步当前缩放设置
window.petAPI?.settings.get().then((s) => {
  currentScale = s.petScale;
}).catch(() => {});

// 初始化
async function init(): Promise<void> {
  try {
    // 所有运行素材必须真实解码成功后才能报告 ready。
    const loadedAssets = await Promise.all(expectedAssetNames.map((name) => new Promise<HTMLImageElement>((resolve, reject) => {
      const url = assetMap.get(name);
      if (!url) {
        reject(new Error(`Missing runtime asset: ${name}`));
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) reject(new Error(`Runtime asset has invalid dimensions: ${name}`));
        else resolve(image);
      };
      image.onerror = () => reject(new Error(`Runtime asset failed to decode: ${name}`));
      image.src = url;
    })));
    const reference = loadedAssets[0];
    if (!reference) throw new Error('No runtime assets were loaded');
    const invalidSize = loadedAssets.find((image) => image.naturalWidth !== reference.naturalWidth || image.naturalHeight !== reference.naturalHeight);
    if (invalidSize) throw new Error('Runtime assets do not share one decoded frame size');

    // 素材确认可用后进入静止待机；动作只响应显式触发。
    setState('idle');
    animationFrame = requestAnimationFrame(animate);

    // 报告就绪
    await window.petAPI?.runtime.ready({
      status: 'ready',
      stateId: 'idle',
      frame: petSpec.states.find((s) => s.id === 'idle')?.frames[0] ?? '',
      assetCount: loadedAssets.length,
      expectedAssetCount: expectedAssetNames.length,
      naturalWidth: reference.naturalWidth,
      naturalHeight: reference.naturalHeight,
      petVisible: true,
      ipcReady: true,
    });
  } catch (error) {
    window.petAPI?.runtime.fail({
      message: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
  }
}

init();
