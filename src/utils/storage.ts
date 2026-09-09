import { get, set, del } from 'idb-keyval';
import { AppSettings, SiteShortcut } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '../constants';
import { ONLINE_WALLPAPER_SOURCES } from './wallpaperSources';

const SETTINGS_KEY = 'crab_home_settings_v1';
const SHORTCUTS_KEY = 'crab_home_shortcuts_v1';
const SEARCH_HISTORY_KEY = 'crab_home_search_history_v1';
const LOCAL_MEDIA_KEY = 'crab_home_local_wallpaper_blob';

function sanitizeWallpaperConfig(raw: Partial<AppSettings['wallpaper']> | undefined) {
  const merged = { ...DEFAULT_SETTINGS.wallpaper, ...(raw || {}) };
  if ((merged.type as string) === 'gradient') {
    merged.type = 'online';
  } else if (merged.type === 'local_image' || merged.type === 'local_video') {
    merged.type = 'local';
  }

  // 动态获取当前所有合法的壁纸源 ID（含语幕所有源、UPX8 10 大分类及自定义 URL）
  const validSourceIds = new Set([
    ...ONLINE_WALLPAPER_SOURCES.map((s) => s.id),
    'custom_url',
    'bing_uhd',
  ]);

  // 仅在壁纸源真正属于已被彻底废弃的旧历史源时，才平滑迁移至默认源
  if (merged.type === 'online') {
    if (!merged.source || !validSourceIds.has(merged.source)) {
      merged.source = DEFAULT_SETTINGS.wallpaper.source;
      if (!merged.customUrl) {
        merged.customUrl = DEFAULT_SETTINGS.wallpaper.customUrl;
      }
    }
  }
  return merged;
}

// Settings Storage
export async function loadSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(SETTINGS_KEY);
      if (res[SETTINGS_KEY]) {
        const loaded = res[SETTINGS_KEY] as Partial<AppSettings>;
        return {
          ...DEFAULT_SETTINGS,
          ...loaded,
          wallpaper: sanitizeWallpaperConfig(loaded.wallpaper),
          clockStyle: { ...DEFAULT_SETTINGS.clockStyle, ...(loaded.clockStyle || {}) },
          glassStyle: { ...DEFAULT_SETTINGS.glassStyle, ...(loaded.glassStyle || {}) },
        };
      }
    } else {
      const local = localStorage.getItem(SETTINGS_KEY);
      if (local) {
        const loaded = JSON.parse(local) as Partial<AppSettings>;
        return {
          ...DEFAULT_SETTINGS,
          ...loaded,
          wallpaper: sanitizeWallpaperConfig(loaded.wallpaper),
          clockStyle: { ...DEFAULT_SETTINGS.clockStyle, ...(loaded.clockStyle || {}) },
          glassStyle: { ...DEFAULT_SETTINGS.glassStyle, ...(loaded.glassStyle || {}) },
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load settings from storage, using defaults:', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

// Shortcuts Storage
export async function loadShortcuts(): Promise<SiteShortcut[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(SHORTCUTS_KEY);
      if (res[SHORTCUTS_KEY] && Array.isArray(res[SHORTCUTS_KEY])) {
        return res[SHORTCUTS_KEY];
      }
    } else {
      const local = localStorage.getItem(SHORTCUTS_KEY);
      if (local) {
        return JSON.parse(local);
      }
    }
  } catch (err) {
    console.warn('Failed to load shortcuts, using defaults:', err);
  }
  return DEFAULT_SHORTCUTS;
}

export async function saveShortcuts(shortcuts: SiteShortcut[]): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [SHORTCUTS_KEY]: shortcuts });
    }
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
  } catch (err) {
    console.warn('Failed to save shortcuts:', err);
  }
}

// Search History
export async function loadSearchHistory(): Promise<string[]> {
  try {
    const local = localStorage.getItem(SEARCH_HISTORY_KEY);
    return local ? JSON.parse(local) : [];
  } catch {
    return [];
  }
}

export async function saveSearchHistory(history: string[]): Promise<void> {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
  } catch (err) {
    console.warn('Failed to save search history:', err);
  }
}

// IndexedDB for large media files (local wallpaper/video)
export async function saveLocalMedia(file: File): Promise<{ type: 'local', isVideo: boolean, mimeType: string }> {
  const isVideo = file.type.startsWith('video/');
  
  await set(LOCAL_MEDIA_KEY, {
    blob: file,
    type: isVideo ? 'local_video' : 'local_image',
    name: file.name,
    mimeType: file.type,
    updatedAt: Date.now()
  });

  return { type: 'local', isVideo, mimeType: file.type };
}

export async function getLocalMediaInfo(): Promise<{ url: string; isVideo: boolean; name?: string } | null> {
  try {
    const record = await get<{ blob: Blob; type?: string; mimeType?: string; name?: string }>(LOCAL_MEDIA_KEY);
    if (record && record.blob) {
      const isVideo = record.type === 'local_video' || (record.mimeType ? record.mimeType.startsWith('video/') : false);
      return {
        url: URL.createObjectURL(record.blob),
        isVideo,
        name: record.name,
      };
    }
  } catch (e) {
    console.error('Error fetching local media from IndexedDB:', e);
  }
  return null;
}

export async function getLocalMediaUrl(): Promise<string | null> {
  try {
    const info = await getLocalMediaInfo();
    return info ? info.url : null;
  } catch (e) {
    console.error('Error fetching local media from IndexedDB:', e);
  }
  return null;
}

export async function clearLocalMedia(): Promise<void> {
  try {
    await del(LOCAL_MEDIA_KEY);
  } catch (e) {
    console.error('Error clearing local media:', e);
  }
}
