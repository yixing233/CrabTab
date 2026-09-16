import { get, set } from 'idb-keyval';

const FAVICON_CACHE_KEY = 'crab_favicon_cache_v1';
const memoryCache = new Map<string, string>();
let isInitialized = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * 规范化 URL，作为缓存主键（移除易变查询参数与哈希，统一尾部斜杠）
 */
export function normalizeFaviconUrlKey(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    let formatted = rawUrl.trim();
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = `https://${formatted}`;
    }
    const parsed = new URL(formatted);
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.hostname}${path}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * 提取域名 / 源级缓存键（供同域名其他子页面快速继承）
 */
export function getDomainCacheKey(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    let formatted = rawUrl.trim();
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = `https://${formatted}`;
    }
    const parsed = new URL(formatted);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return '';
  }
}

function notifyCacheUpdate(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.warn('Favicon cache listener error:', err);
    }
  });
}

/**
 * 订阅 Favicon 缓存就绪或变更事件
 */
export function subscribeFaviconCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 初始化 Favicon 缓存（自 IndexedDB 秒级加载入内存）
 */
export async function initFaviconCache(): Promise<void> {
  if (isInitialized) return;
  try {
    const stored = await get<Record<string, string>>(FAVICON_CACHE_KEY);
    if (stored && typeof stored === 'object') {
      let loadedAny = false;
      Object.entries(stored).forEach(([k, v]) => {
        if (k && v && typeof v === 'string') {
          memoryCache.set(k, v);
          loadedAny = true;
        }
      });
      if (loadedAny) {
        notifyCacheUpdate();
      }
    }
    isInitialized = true;
  } catch (err) {
    console.warn('Failed to load favicon cache from IndexedDB:', err);
    isInitialized = true;
  }
}

// 模块载入时立即启动静默初始化
if (typeof window !== 'undefined') {
  initFaviconCache();
}

/**
 * 同步从内存读取已验证可用的图标 URL 或占位标记
 */
export function getCachedFavicon(url: string): string | undefined {
  if (!url) return undefined;
  const exactKey = normalizeFaviconUrlKey(url);
  if (memoryCache.has(exactKey)) {
    return memoryCache.get(exactKey);
  }
  const domainKey = getDomainCacheKey(url);
  if (domainKey && memoryCache.has(domainKey)) {
    const domainVal = memoryCache.get(domainKey);
    // 域名级只继承真实有效的图片 URL，不继承失败标记
    if (domainVal && domainVal !== 'avatar:letter') {
      return domainVal;
    }
  }
  return undefined;
}

/**
 * 将成功探测到的工作图标写入内存与持久化缓存
 */
export function setCachedFavicon(url: string, iconUrl: string): void {
  if (!url || !iconUrl) return;
  // 忽略内联占位或异常 URL
  if (iconUrl.startsWith('data:image/svg+xml;base64,PHN2Zy')) return;

  const exactKey = normalizeFaviconUrlKey(url);
  const domainKey = getDomainCacheKey(url);

  memoryCache.set(exactKey, iconUrl);
  if (domainKey) {
    // 根源站若无缓存或为占位符，一并继承有效图标
    if (!memoryCache.has(domainKey) || memoryCache.get(domainKey) === 'avatar:letter') {
      memoryCache.set(domainKey, iconUrl);
    }
  }

  // 防抖持久化写入 IndexedDB
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistFaviconCache();
  }, 1000);
}

/**
 * 标记该 URL 确实无可用图标，缓存降级为首字字母徽标
 */
export function setCachedFaviconFailed(url: string): void {
  if (!url) return;
  const exactKey = normalizeFaviconUrlKey(url);
  memoryCache.set(exactKey, 'avatar:letter');

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistFaviconCache();
  }, 1200);
}

/**
 * 清理 Favicon 缓存
 */
export async function clearFaviconCache(): Promise<void> {
  memoryCache.clear();
  try {
    await set(FAVICON_CACHE_KEY, {});
    notifyCacheUpdate();
  } catch (err) {
    console.warn('Failed to clear favicon cache in IndexedDB:', err);
  }
}

/**
 * 持久化缓存到 IndexedDB
 */
async function persistFaviconCache(): Promise<void> {
  try {
    const data: Record<string, string> = {};
    let count = 0;
    for (const [k, v] of memoryCache.entries()) {
      if (count++ > 3000) break;
      data[k] = v;
    }
    await set(FAVICON_CACHE_KEY, data);
  } catch (err) {
    console.warn('Failed to persist favicon cache to IndexedDB:', err);
  }
}
