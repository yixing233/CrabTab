import { FavoriteWallpaperItem } from '../types';

export type { FavoriteWallpaperItem };

const FAVORITE_WALLPAPERS_KEY = 'crab_home_wallpaper_favorites_v1';
const BLOCKED_WALLPAPERS_KEY = 'crab_home_wallpaper_blocked_v1';

// 内存单例缓存，实现同步零延迟判断
let favoritesCache: FavoriteWallpaperItem[] | null = null;
let blockedCache: string[] | null = null;

/**
 * 初始化读取收藏列表
 */
export function getFavoriteWallpapersSync(): FavoriteWallpaperItem[] {
  if (favoritesCache !== null) {
    return favoritesCache;
  }
  try {
    const raw = localStorage.getItem(FAVORITE_WALLPAPERS_KEY);
    favoritesCache = raw ? JSON.parse(raw) : [];
  } catch {
    favoritesCache = [];
  }
  return favoritesCache || [];
}

/**
 * 异步获取所有收藏壁纸
 */
export async function loadFavoriteWallpapers(): Promise<FavoriteWallpaperItem[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = (await chrome.storage.local.get([FAVORITE_WALLPAPERS_KEY])) as Record<string, any>;
      if (res && res[FAVORITE_WALLPAPERS_KEY]) {
        favoritesCache = res[FAVORITE_WALLPAPERS_KEY] as FavoriteWallpaperItem[];
        localStorage.setItem(FAVORITE_WALLPAPERS_KEY, JSON.stringify(favoritesCache));
        return favoritesCache || [];
      }
    }
  } catch (err) {
    console.warn('Failed to load favorites from chrome.storage:', err);
  }
  return getFavoriteWallpapersSync();
}

/**
 * 保存收藏壁纸列表
 */
export async function saveFavoriteWallpapers(items: FavoriteWallpaperItem[]): Promise<void> {
  favoritesCache = items;
  try {
    localStorage.setItem(FAVORITE_WALLPAPERS_KEY, JSON.stringify(items));
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [FAVORITE_WALLPAPERS_KEY]: items });
    }
  } catch (err) {
    console.warn('Failed to save favorites:', err);
  }
}

/**
 * 判断指定壁纸是否已被收藏
 */
export function isWallpaperFavorited(url: string): boolean {
  if (!url) return false;
  const list = getFavoriteWallpapersSync();
  return list.some((item) => item.url === url);
}

/**
 * 添加收藏
 */
export async function addFavoriteWallpaper(
  item: Omit<FavoriteWallpaperItem, 'id' | 'createdAt'>
): Promise<FavoriteWallpaperItem> {
  const list = getFavoriteWallpapersSync();
  const existing = list.find((it) => it.url === item.url);
  if (existing) {
    return existing;
  }

  const newItem: FavoriteWallpaperItem = {
    id: `fav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    url: item.url,
    title: item.title,
    source: item.source,
    createdAt: Date.now(),
  };

  const updated = [newItem, ...list];
  await saveFavoriteWallpapers(updated);
  return newItem;
}

/**
 * 取消收藏
 */
export async function removeFavoriteWallpaper(url: string): Promise<void> {
  const list = getFavoriteWallpapersSync();
  const updated = list.filter((it) => it.url !== url);
  await saveFavoriteWallpapers(updated);
}

/**
 * 清空所有收藏
 */
export async function clearAllFavoriteWallpapers(): Promise<void> {
  await saveFavoriteWallpapers([]);
}

/**
 * 初始化读取屏蔽黑名单
 */
export function getBlockedWallpapersSync(): string[] {
  if (blockedCache !== null) {
    return blockedCache;
  }
  try {
    const raw = localStorage.getItem(BLOCKED_WALLPAPERS_KEY);
    blockedCache = raw ? JSON.parse(raw) : [];
  } catch {
    blockedCache = [];
  }
  return blockedCache || [];
}

/**
 * 异步获取屏蔽黑名单
 */
export async function loadBlockedWallpapers(): Promise<string[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = (await chrome.storage.local.get([BLOCKED_WALLPAPERS_KEY])) as Record<string, any>;
      if (res && res[BLOCKED_WALLPAPERS_KEY]) {
        blockedCache = res[BLOCKED_WALLPAPERS_KEY] as string[];
        localStorage.setItem(BLOCKED_WALLPAPERS_KEY, JSON.stringify(blockedCache));
        return blockedCache || [];
      }
    }
  } catch (err) {
    console.warn('Failed to load blocked from chrome.storage:', err);
  }
  return getBlockedWallpapersSync();
}

/**
 * 保存屏蔽黑名单
 */
export async function saveBlockedWallpapers(items: string[]): Promise<void> {
  blockedCache = items;
  try {
    localStorage.setItem(BLOCKED_WALLPAPERS_KEY, JSON.stringify(items));
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [BLOCKED_WALLPAPERS_KEY]: items });
    }
  } catch (err) {
    console.warn('Failed to save blocked wallpapers:', err);
  }
}

/**
 * 检查是否已在屏蔽黑名单中
 */
export function isWallpaperBlocked(url: string): boolean {
  if (!url) return false;
  const list = getBlockedWallpapersSync();
  return list.includes(url);
}

/**
 * 将指定壁纸加入黑名单
 */
export async function addBlockedWallpaper(url: string): Promise<void> {
  if (!url) return;
  const list = getBlockedWallpapersSync();
  if (!list.includes(url)) {
    const updated = [url, ...list];
    await saveBlockedWallpapers(updated);
  }
}

/**
 * 从黑名单中移除
 */
export async function removeBlockedWallpaper(url: string): Promise<void> {
  const list = getBlockedWallpapersSync();
  const updated = list.filter((u) => u !== url);
  await saveBlockedWallpapers(updated);
}
