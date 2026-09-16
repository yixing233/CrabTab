/**
 * 视口与缩放坐标换算工具
 *
 * 背景（踩坑记录）：
 * 全局界面缩放通过 CSS `zoom` 挂在 <html> 上实现。zoom 会建立一个「布局空间」，
 * 并引入两套互相不同步的坐标：
 *
 *  1. 布局空间（layout px）：CSS 里书写的 px、`style.left` 等内联像素值；
 *  2. 设备空间（device px）：`MouseEvent.clientX/Y`、`getBoundingClientRect()`、
 *     `window.innerWidth/innerHeight`、固定定位实际渲染位置。
 *
 * 两者相差一个 zoom 倍数（uiScale）。因此：
 *  - 把 `clientX` 直接写进 `style.left` 会被 zoom 再放大一次（缩小 125% 时偏移 25%）；
 *  - 用 `window.innerWidth` 去夹取布局像素坐标，边界同样会错位。
 *
 * 本模块提供统一换算，避免各处重复推导。
 */

/** 读取当前生效的界面缩放倍数（默认 1） */
export function getUiScale(): number {
  if (typeof window === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // 兜底：直接解析 zoom 计算值（部分环境不暴露自定义属性）
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * 真实「布局视口」尺寸。
 * zoom 生效后 window.innerWidth 仍是未缩放的物理视口，需除以缩放倍数才是
 * 布局空间下的可用宽高，用于夹取浮层坐标等。
 */
export function getLayoutViewport(): { width: number; height: number } {
  const scale = getUiScale();
  return {
    width: window.innerWidth / scale,
    height: window.innerHeight / scale,
  };
}

/** 设备空间像素 → 布局空间像素（用于写入 style.left / top 等内联样式） */
export function deviceToLayoutPx(devicePx: number): number {
  const scale = getUiScale();
  return scale === 1 ? devicePx : devicePx / scale;
}

/** 布局空间像素 → 设备空间像素 */
export function layoutToDevicePx(layoutPx: number): number {
  return layoutPx * getUiScale();
}

/**
 * 把一个「设备空间坐标 + 元素尺寸」的浮层位置换算为布局空间内联样式，
 * 并夹取在布局视口内，保证浮层不越界；空间不足时自动向上翻转。
 */
export function resolveFloatingPosition(
  deviceX: number,
  deviceY: number,
  menuWidth: number,
  menuHeight: number,
  margin = 8
): { x: number; y: number } {
  const { width: vpWidth, height: vpHeight } = getLayoutViewport();
  const x = deviceToLayoutPx(deviceX);
  const y = deviceToLayoutPx(deviceY);

  // 水平方向：优先从指针处向右展开，右侧不足则向左翻转
  let resolvedX = x;
  if (resolvedX + menuWidth + margin > vpWidth) {
    resolvedX = x - menuWidth;
  }
  resolvedX = Math.max(margin, Math.min(resolvedX, vpWidth - menuWidth - margin));

  // 垂直方向：优先从指针处向下展开，下方不足则向上翻转（翻不动时贴顶）
  let resolvedY = y;
  if (resolvedY + menuHeight + margin > vpHeight) {
    resolvedY = y - menuHeight;
  }
  resolvedY = Math.max(margin, Math.min(resolvedY, vpHeight - menuHeight - margin));

  return { x: Math.round(resolvedX), y: Math.round(resolvedY) };
}

/**
 * 视口高度分级标记。
 *
 * 为什么需要它：CSS 媒体查询（min/max-height）始终按「未缩放的物理视口」求值，
 * 而全局缩放会等比压缩真实可用布局高度。因此 1440x900 在 140% 缩放下，
 * 真实布局高度仅 643px，但 `@media (max-height: 760px)` 不会生效，
 * 矮屏收缩规则全部失效，内容溢出后又被 overflow:hidden 裁掉且无法滚动到。
 *
 * 解决方式：由 JS 依据「真实布局视口高度」在 <html> 上打分级 class，
 * CSS 侧的高度响应式规则改为消费这些 class，从而与缩放倍数完全解耦。
 */
export const VIEWPORT_CLASS_COMPACT = 'vh-compact'; // 真实布局高度 <= 760px
export const VIEWPORT_CLASS_TIGHT = 'vh-tight'; // 真实布局高度 <= 640px
export const VIEWPORT_CLASS_TALL = 'vh-tall'; // 真实布局高度 >= 800px
export const VIEWPORT_CLASS_EXTRA_TALL = 'vh-extra-tall'; // 真实布局高度 >= 960px

/** 依据真实布局视口高度刷新 <html> 上的分级 class（幂等，可重复调用） */
export function syncViewportHeightClasses(): void {
  if (typeof document === 'undefined') return;
  const { height } = getLayoutViewport();
  const root = document.documentElement;
  root.classList.toggle(VIEWPORT_CLASS_COMPACT, height <= 760);
  root.classList.toggle(VIEWPORT_CLASS_TIGHT, height <= 640);
  root.classList.toggle(VIEWPORT_CLASS_TALL, height >= 800);
  root.classList.toggle(VIEWPORT_CLASS_EXTRA_TALL, height >= 960);
}
