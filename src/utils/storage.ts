import { get, set, del } from 'idb-keyval';
import { AppSettings, SiteShortcut } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_LOCAL_WALLPAPER } from '../constants';
import { ONLINE_WALLPAPER_SOURCES } from './wallpaperSources';

export const SETTINGS_KEY = 'crab_home_settings_v1';
export const SETTINGS_BACKUP_KEY = 'crab_home_settings_backup';
const LEGACY_SETTINGS_KEYS = ['crab_home_settings', 'crab_settings'];

export const SHORTCUTS_KEY = 'crab_home_shortcuts_v1';
export const SHORTCUTS_BACKUP_KEY = 'crab_home_shortcuts_backup';
const LEGACY_SHORTCUTS_KEYS = ['crab_home_shortcuts', 'shortcuts'];

export const SEARCH_HISTORY_KEY = 'crab_home_search_history_v1';
export const SEARCH_HISTORY_BACKUP_KEY = 'crab_home_search_history_backup';

export const TODOS_KEY = 'crab_utility_todos';
export const TODOS_BACKUP_KEY = 'crab_utility_todos_backup';
const LEGACY_TODOS_KEYS = ['crab_home_todo_items_v1', 'crab_todos'];

export const COUNTDOWNS_KEY = 'crab_utility_countdowns_v1';
export const COUNTDOWNS_BACKUP_KEY = 'crab_utility_countdowns_backup';

const LOCAL_MEDIA_KEY = 'crab_home_local_wallpaper_blob';

/**
 * chrome.storage 读取结果。
 *
 * 关键：必须区分「键不存在」与「读取失败」。扩展重新加载 / 升级的瞬间，
 * chrome.storage 可能短暂不可用；若把读取失败当成「没有数据」，上层就会
 * 退回默认值，而用户随后的任意一次操作都会把默认值写回去，彻底抹掉真实数据。
 */
type ChromeReadOutcome<T> = { status: 'ok'; value: T | null } | { status: 'error' };

async function readChromeStorageOutcome<T>(key: string): Promise<ChromeReadOutcome<T>> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const res = await chrome.storage.local.get(key);
      if (res && res[key] !== undefined && res[key] !== null) {
        return { status: 'ok', value: res[key] as T };
      }
      return { status: 'ok', value: null };
    } catch (e) {
      console.warn(`[Storage] Read chrome.storage.local key "${key}" failed:`, e);
      return { status: 'error' };
    }
  }
  // 非扩展环境（普通网页调试）：不算失败，只是该介质不存在
  return { status: 'ok', value: null };
}

// 辅助：从 chrome.storage.local 安全读取指定 key（失败时返回 null）
async function readChromeStorage<T>(key: string): Promise<T | null> {
  const outcome = await readChromeStorageOutcome<T>(key);
  return outcome.status === 'ok' ? outcome.value : null;
}

/**
 * 本次启动是否处于「存储降级」状态。
 *
 * 当权威介质（chrome.storage）读取失败、且所有本地介质都拿不到数据时置位。
 * 此时内存里只有默认值，绝不能让它落盘覆盖用户真实数据；等后续重新水合
 * 成功后再解除。
 *
 * 注意：这是「单调累积」的标记 —— 某个键读取成功并不会清除其它键的失败，
 * 否则并发加载时（Promise.all）会出现「设置读成功清掉快捷方式的失败标记」
 * 从而让默认值趁虚写入。只允许 markStorageHydrated() 在全量重读成功后清除。
 */
let hydrationDegraded = false;

export function isStorageHydrationDegraded(): boolean {
  return hydrationDegraded;
}

/** 全量重新水合成功后解除降级标记 */
export function markStorageHydrated(): void {
  hydrationDegraded = false;
}

/** 标记进入存储降级状态（读失败时调用） */
function markStorageDegraded(): void {
  hydrationDegraded = true;
}

/**
 * 探测权威介质（chrome.storage.local）当前是否可读。
 *
 * 用于降级自愈：只要该介质恢复可读，就说明升级/重载造成的瞬时不可用已经过去，
 * 可以放心用真实数据水合并解除写回封锁。
 * 非扩展环境（普通网页调试）没有该介质，视为可用，不影响本地开发。
 */
export async function isAuthoritativeStorageReadable(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return true;
  }
  const outcome = await readChromeStorageOutcome<unknown>(SETTINGS_KEY);
  return outcome.status === 'ok';
}

/**
 * 判断对象类配置是否携带真实内容。
 * 空对象 `{}` 不包含任何用户信息，因此不视为「有数据」。
 */
function hasContent(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.keys(value as object).length > 0;
}

/**
 * 数组类数据是否「存在且有效」。
 *
 * 与历史实现的关键差异：空数组 `[]` 是用户「主动清空」的合法结果，
 * 必须被视为有效数据。旧的 `length > 0` 判断会把清空当成无数据，
 * 进而被默认值或陈旧备份复活，等于覆盖用户设置。
 */
function isPresentArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

// 辅助：向 chrome.storage.local 安全写入
async function writeChromeStorage(key: string, value: unknown): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (e) {
      console.warn(`[Storage] Write chrome.storage.local key "${key}" failed:`, e);
    }
  }
}

// 辅助：从 localStorage 安全读取并 JSON 解析
function readLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// 辅助：向 localStorage 安全写入
function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[Storage] Write localStorage key "${key}" failed:`, e);
  }
}

function sanitizeWallpaperConfig(raw: Partial<AppSettings['wallpaper']> | undefined): AppSettings['wallpaper'] {
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
    }
    // 清洗无效或污染的 customUrl（如 idb_local_wallpaper、本地 blob 等），防止切回时白屏/404
    if (
      !merged.customUrl ||
      merged.customUrl === 'idb_local_wallpaper' ||
      merged.customUrl.startsWith('blob:')
    ) {
      merged.customUrl = DEFAULT_SETTINGS.wallpaper.customUrl;
    }
  } else if (merged.type === 'local') {
    // 本地壁纸无需占位符，若残留为 idb_local_wallpaper 或 blob，重置为默认在线 URL 备用
    if (merged.customUrl === 'idb_local_wallpaper' || merged.customUrl?.startsWith('blob:')) {
      merged.customUrl = DEFAULT_SETTINGS.wallpaper.customUrl;
    }
  }
  return merged;
}

function normalizeSettings(raw: unknown): AppSettings {
  const loaded = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>;
  const homeContentMode = (loaded.homeContentMode === 'recent' || (loaded as any).homeContentMode === 'bookmarks')
    ? 'recent'
    : 'shortcuts';
  const showBookmarkBar = loaded.showBookmarkBar ?? true;
  const pinnedRecentUrls = Array.isArray(loaded.pinnedRecentUrls) ? loaded.pinnedRecentUrls : [];
  const shortcutMode = loaded.shortcutMode === 'off'
    || loaded.shortcutMode === 'compact'
    || loaded.shortcutMode === 'desktop'
    ? loaded.shortcutMode
    : loaded.showQuickLinks === false ? 'off' : 'desktop';
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    searchBookmarks: loaded.searchBookmarks ?? true,
    searchHistory: loaded.searchHistory ?? true,
    homeContentMode,
    showBookmarkBar,
    pinnedRecentUrls,
    recentVerticalOffset: typeof loaded.recentVerticalOffset === 'number' && !Number.isNaN(loaded.recentVerticalOffset) ? loaded.recentVerticalOffset : 0,
    searchVerticalOffset: typeof loaded.searchVerticalOffset === 'number' && !Number.isNaN(loaded.searchVerticalOffset) ? loaded.searchVerticalOffset : 0,
    shortcutMode,
    showQuickLinks: shortcutMode !== 'off',
    wallpaper: sanitizeWallpaperConfig(loaded.wallpaper),
    clockStyle: { ...DEFAULT_SETTINGS.clockStyle, ...(loaded.clockStyle || {}) },
    glassStyle: { ...DEFAULT_SETTINGS.glassStyle, ...(loaded.glassStyle || {}) },
  };
}

// ==================== 设置（Settings）存储与恢复 ====================
export async function loadSettings(): Promise<AppSettings> {
  try {
    // 1. 优先尝试 chrome.storage.local（权威介质）
    let chromeOutcome = await readChromeStorageOutcome<Partial<AppSettings>>(SETTINGS_KEY);

    // 读取失败意味着「暂时读不到」，而不是「没有数据」。此时贸然退回默认值，
    // 用户接下来的任意操作都会把默认值写回去。因此先做几次短重试。
    if (chromeOutcome.status === 'error') {
      for (let attempt = 0; attempt < 3 && chromeOutcome.status === 'error'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        chromeOutcome = await readChromeStorageOutcome<Partial<AppSettings>>(SETTINGS_KEY);
      }
    }

    if (chromeOutcome.status === 'ok' && hasContent(chromeOutcome.value)) {
      const normalized = normalizeSettings(chromeOutcome.value);
      // 保持 localStorage 同步硬备份（不清除降级标记：并发加载中其它键可能仍读取失败）
      writeLocalStorage(SETTINGS_KEY, normalized);
      writeLocalStorage(SETTINGS_BACKUP_KEY, normalized);
      return normalized;
    }

    // 2. chrome.storage.local 无数据时，兜底从 localStorage 读取（防止扩展升级时 chrome.storage 延迟或空白造成覆盖）
    const localData = readLocalStorage<Partial<AppSettings>>(SETTINGS_KEY);
    if (hasContent(localData)) {
      const normalized = normalizeSettings(localData);
      // 自动回填迁移至 chrome.storage.local
      await writeChromeStorage(SETTINGS_KEY, normalized);
      writeLocalStorage(SETTINGS_BACKUP_KEY, normalized);
      return normalized;
    }

    // 3. 检查本地快照备份
    const backupData = readLocalStorage<Partial<AppSettings>>(SETTINGS_BACKUP_KEY);
    if (hasContent(backupData)) {
      const normalized = normalizeSettings(backupData);
      await writeChromeStorage(SETTINGS_KEY, normalized);
      writeLocalStorage(SETTINGS_KEY, normalized);
      return normalized;
    }

    // 4. 检查历史兼容 key
    for (const legacyKey of LEGACY_SETTINGS_KEYS) {
      const legacy = readLocalStorage<Partial<AppSettings>>(legacyKey);
      if (hasContent(legacy)) {
        const normalized = normalizeSettings(legacy);
        await writeChromeStorage(SETTINGS_KEY, normalized);
        writeLocalStorage(SETTINGS_KEY, normalized);
        writeLocalStorage(SETTINGS_BACKUP_KEY, normalized);
        return normalized;
      }
    }

    // 走到这里说明「所有介质都没有设置」。只有确认权威介质可读时，
    // 才能断定这是全新安装；否则标记降级，禁止把默认值写回覆盖潜在的用户数据。
    if (chromeOutcome.status === 'error') {
      markStorageDegraded();
      console.warn(
        '[Storage] chrome.storage 暂时不可读且本地无缓存，本次启动使用默认设置且暂停写回，等待重新水合。'
      );
    }
  } catch (err) {
    console.warn('[Storage] Failed to load settings from storage, using fallback:', err);
    markStorageDegraded();
  }

  // 仅在确认所有介质（含权威介质）完全为空（初次全新安装）时，返回默认设置
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // 存储降级期间（权威介质读不到）禁止写回，避免把默认设置覆盖到用户真实数据上
  if (hydrationDegraded) {
    console.warn('[Storage] 存储处于降级状态，已跳过本次设置写回以避免覆盖用户数据。');
    return;
  }
  try {
    // 写入前先自动备份上一份有效设置，形成容灾快照
    const existing = readLocalStorage<AppSettings>(SETTINGS_KEY);
    if (hasContent(existing)) {
      writeLocalStorage(SETTINGS_BACKUP_KEY, existing);
      await writeChromeStorage(SETTINGS_BACKUP_KEY, existing);
    }

    // 导入与常规更新统一归一化，确保新旧兼容字段始终同步。
    const normalized = normalizeSettings(settings);
    await writeChromeStorage(SETTINGS_KEY, normalized);
    writeLocalStorage(SETTINGS_KEY, normalized);
  } catch (err) {
    console.warn('[Storage] Failed to save settings:', err);
  }
}

// ==================== 快捷方式（Shortcuts）存储与恢复 ====================
export async function loadShortcuts(): Promise<SiteShortcut[]> {
  try {
    // 1. 优先读取 chrome.storage.local（权威介质）
    let chromeOutcome = await readChromeStorageOutcome<SiteShortcut[]>(SHORTCUTS_KEY);
    if (chromeOutcome.status === 'error') {
      for (let attempt = 0; attempt < 3 && chromeOutcome.status === 'error'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        chromeOutcome = await readChromeStorageOutcome<SiteShortcut[]>(SHORTCUTS_KEY);
      }
    }

    // 注意：空数组是用户「主动清空全部快捷方式」的合法结果，必须原样尊重。
    // 用 isPresentArray（而非 length > 0）判断，否则清空后会被默认列表或陈旧备份复活。
    if (chromeOutcome.status === 'ok' && isPresentArray<SiteShortcut>(chromeOutcome.value)) {
      const shortcuts = chromeOutcome.value;
      writeLocalStorage(SHORTCUTS_KEY, shortcuts);
      writeLocalStorage(SHORTCUTS_BACKUP_KEY, shortcuts);
      return shortcuts;
    }

    // 2. 若 chrome.storage.local 为空，必须 fallback 从 localStorage 恢复，严禁直接返回默认列表！
    const localShortcuts = readLocalStorage<SiteShortcut[]>(SHORTCUTS_KEY);
    if (isPresentArray<SiteShortcut>(localShortcuts)) {
      // 自动迁移回填至 chrome.storage.local
      await writeChromeStorage(SHORTCUTS_KEY, localShortcuts);
      writeLocalStorage(SHORTCUTS_BACKUP_KEY, localShortcuts);
      return localShortcuts;
    }

    // 3. 检查快照备份（仅在主数据确实缺失时才启用，避免覆盖用户已清空的选择）
    const backupShortcuts = readLocalStorage<SiteShortcut[]>(SHORTCUTS_BACKUP_KEY);
    if (isPresentArray<SiteShortcut>(backupShortcuts) && backupShortcuts.length > 0) {
      await writeChromeStorage(SHORTCUTS_KEY, backupShortcuts);
      writeLocalStorage(SHORTCUTS_KEY, backupShortcuts);
      return backupShortcuts;
    }

    // 4. 检查历史兼容 key
    for (const legacyKey of LEGACY_SHORTCUTS_KEYS) {
      const legacy = readLocalStorage<SiteShortcut[]>(legacyKey);
      if (isPresentArray<SiteShortcut>(legacy) && legacy.length > 0) {
        await writeChromeStorage(SHORTCUTS_KEY, legacy);
        writeLocalStorage(SHORTCUTS_KEY, legacy);
        writeLocalStorage(SHORTCUTS_BACKUP_KEY, legacy);
        return legacy;
      }
    }

    // 权威介质不可读时无法断定「用户真的没有快捷方式」，标记降级以禁止回写覆盖
    if (chromeOutcome.status === 'error') {
      markStorageDegraded();
      console.warn(
        '[Storage] chrome.storage 暂时不可读且本地无快捷方式缓存，本次启动暂用默认列表且暂停写回。'
      );
    }
  } catch (err) {
    console.warn('[Storage] Failed to load shortcuts, checking fallback:', err);
    markStorageDegraded();
  }

  // 若用户曾经明确保存过空列表（比如已清空快捷方式），需遵从用户选择；
  // 仅在全新用户（从未保存过）时返回默认快捷方式
  return DEFAULT_SHORTCUTS;
}

export async function saveShortcuts(shortcuts: SiteShortcut[]): Promise<void> {
  // 存储降级期间（权威介质读不到）禁止写回，避免用默认/空数据覆盖尚未成功读取的用户数据
  if (hydrationDegraded) {
    console.warn('[Storage] 存储处于降级状态，已跳过本次快捷方式写回以避免覆盖用户数据。');
    return;
  }
  try {
    // 写入前自动保存备份快照。
    // 注意：只有「非空」才值得备份；空数组是用户清空的结果，不做备份以免日后复活。
    const existing = readLocalStorage<SiteShortcut[]>(SHORTCUTS_KEY);
    if (isPresentArray<SiteShortcut>(existing) && existing.length > 0) {
      writeLocalStorage(SHORTCUTS_BACKUP_KEY, existing);
      await writeChromeStorage(SHORTCUTS_BACKUP_KEY, existing);
    }

    await writeChromeStorage(SHORTCUTS_KEY, shortcuts);
    writeLocalStorage(SHORTCUTS_KEY, shortcuts);
    // 主数据为空的合法状态也要同步到备份介质，避免残留的旧快照在异常恢复时把已删数据带回来
    if (shortcuts.length === 0) {
      writeLocalStorage(SHORTCUTS_BACKUP_KEY, []);
      await writeChromeStorage(SHORTCUTS_BACKUP_KEY, []);
    }
  } catch (err) {
    console.warn('[Storage] Failed to save shortcuts:', err);
  }
}

// ==================== 搜索历史（Search History）存储 ====================
export async function loadSearchHistory(): Promise<string[]> {
  try {
    const chromeHistory = await readChromeStorage<string[]>(SEARCH_HISTORY_KEY);
    if (isPresentArray<string>(chromeHistory)) {
      writeLocalStorage(SEARCH_HISTORY_KEY, chromeHistory);
      return chromeHistory;
    }

    const localHistory = readLocalStorage<string[]>(SEARCH_HISTORY_KEY);
    if (isPresentArray<string>(localHistory)) {
      await writeChromeStorage(SEARCH_HISTORY_KEY, localHistory);
      return localHistory;
    }
  } catch {
    // 静默忽略
  }
  return [];
}

export async function saveSearchHistory(history: string[]): Promise<void> {
  // 降级期间不写回，避免用空历史覆盖掉读取失败时看不到的真实历史
  if (hydrationDegraded) {
    console.warn('[Storage] 存储处于降级状态，已跳过本次搜索历史写回以避免覆盖用户数据。');
    return;
  }
  try {
    const trimmed = history.slice(0, 30);
    await writeChromeStorage(SEARCH_HISTORY_KEY, trimmed);
    writeLocalStorage(SEARCH_HISTORY_KEY, trimmed);
  } catch (err) {
    console.warn('[Storage] Failed to save search history:', err);
  }
}

// ==================== 待办事项（Todos）双层存储 ====================
export async function loadTodosFromStorage<T>(): Promise<T[]> {
  try {
    // 空数组代表用户「已清空全部待办」，是合法状态，必须原样返回
    const chromeTodos = await readChromeStorage<T[]>(TODOS_KEY);
    if (isPresentArray<T>(chromeTodos)) {
      writeLocalStorage(TODOS_KEY, chromeTodos);
      writeLocalStorage(TODOS_BACKUP_KEY, chromeTodos);
      return chromeTodos;
    }

    const localTodos = readLocalStorage<T[]>(TODOS_KEY);
    if (isPresentArray<T>(localTodos)) {
      await writeChromeStorage(TODOS_KEY, localTodos);
      writeLocalStorage(TODOS_BACKUP_KEY, localTodos);
      return localTodos;
    }

    // 仅当主数据确实缺失（非空判断）时才用备份兜底，避免复活用户已清空的列表
    const backupTodos = readLocalStorage<T[]>(TODOS_BACKUP_KEY);
    if (isPresentArray<T>(backupTodos) && backupTodos.length > 0) {
      await writeChromeStorage(TODOS_KEY, backupTodos);
      writeLocalStorage(TODOS_KEY, backupTodos);
      return backupTodos;
    }

    for (const legacyKey of LEGACY_TODOS_KEYS) {
      const legacy = readLocalStorage<T[]>(legacyKey);
      if (isPresentArray<T>(legacy) && legacy.length > 0) {
        await writeChromeStorage(TODOS_KEY, legacy);
        writeLocalStorage(TODOS_KEY, legacy);
        return legacy;
      }
    }
  } catch (err) {
    console.warn('[Storage] Failed to load todos:', err);
  }
  return [];
}

export async function saveTodosToStorage<T>(todos: T[]): Promise<void> {
  if (hydrationDegraded) {
    console.warn('[Storage] 存储处于降级状态，已跳过本次待办写回以避免覆盖用户数据。');
    return;
  }
  try {
    const existing = readLocalStorage<T[]>(TODOS_KEY);
    if (isPresentArray<T>(existing) && existing.length > 0) {
      writeLocalStorage(TODOS_BACKUP_KEY, existing);
      await writeChromeStorage(TODOS_BACKUP_KEY, existing);
    }

    await writeChromeStorage(TODOS_KEY, todos);
    writeLocalStorage(TODOS_KEY, todos);
    // 清空操作同步覆盖备份介质，防止旧快照把已删除的待办带回来
    if (todos.length === 0) {
      writeLocalStorage(TODOS_BACKUP_KEY, []);
      await writeChromeStorage(TODOS_BACKUP_KEY, []);
    }
  } catch (err) {
    console.warn('[Storage] Failed to save todos:', err);
  }
}

// ==================== 倒数日（Countdowns）双层存储 ====================
export async function loadCountdownsFromStorage<T>(): Promise<T[] | null> {
  try {
    // 返回 null 表示「从未保存过」，由上层补默认倒数日；
    // 返回空数组表示「用户已清空」，两者语义必须区分，否则清空后会被默认值复活。
    const chromeData = await readChromeStorage<T[]>(COUNTDOWNS_KEY);
    if (isPresentArray<T>(chromeData)) {
      writeLocalStorage(COUNTDOWNS_KEY, chromeData);
      writeLocalStorage(COUNTDOWNS_BACKUP_KEY, chromeData);
      return chromeData;
    }

    const localData = readLocalStorage<T[]>(COUNTDOWNS_KEY);
    if (isPresentArray<T>(localData)) {
      await writeChromeStorage(COUNTDOWNS_KEY, localData);
      writeLocalStorage(COUNTDOWNS_BACKUP_KEY, localData);
      return localData;
    }

    const backupData = readLocalStorage<T[]>(COUNTDOWNS_BACKUP_KEY);
    if (isPresentArray<T>(backupData) && backupData.length > 0) {
      await writeChromeStorage(COUNTDOWNS_KEY, backupData);
      writeLocalStorage(COUNTDOWNS_KEY, backupData);
      return backupData;
    }
  } catch (err) {
    console.warn('[Storage] Failed to load countdowns:', err);
  }
  return null;
}

export async function saveCountdownsToStorage<T>(countdowns: T[]): Promise<void> {
  if (hydrationDegraded) {
    console.warn('[Storage] 存储处于降级状态，已跳过本次倒数日写回以避免覆盖用户数据。');
    return;
  }
  try {
    const existing = readLocalStorage<T[]>(COUNTDOWNS_KEY);
    if (isPresentArray<T>(existing) && existing.length > 0) {
      writeLocalStorage(COUNTDOWNS_BACKUP_KEY, existing);
      await writeChromeStorage(COUNTDOWNS_BACKUP_KEY, existing);
    }

    await writeChromeStorage(COUNTDOWNS_KEY, countdowns);
    writeLocalStorage(COUNTDOWNS_KEY, countdowns);
    // 清空后同样清掉备份，避免陈旧快照复活已删除的倒数日
    if (countdowns.length === 0) {
      writeLocalStorage(COUNTDOWNS_BACKUP_KEY, []);
      await writeChromeStorage(COUNTDOWNS_BACKUP_KEY, []);
    }
  } catch (err) {
    console.warn('[Storage] Failed to save countdowns:', err);
  }
}

// ==================== 本地媒体文件（IndexedDB）存储 ====================
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

export interface LocalMediaInfo {
  url: string;
  isVideo: boolean;
  name?: string;
  isCustom: boolean; // 是否是用户自己上传的文件，false 表示内置默认壁纸
}

export async function getLocalMediaInfo(): Promise<LocalMediaInfo> {
  try {
    const record = await get<{ blob: Blob; type?: string; mimeType?: string; name?: string }>(LOCAL_MEDIA_KEY);
    if (record && record.blob) {
      const isVideo = record.type === 'local_video' || (record.mimeType ? record.mimeType.startsWith('video/') : false);
      return {
        url: URL.createObjectURL(record.blob),
        isVideo,
        name: record.name,
        isCustom: true,
      };
    }
  } catch (e) {
    console.error('[Storage] Error fetching local media from IndexedDB:', e);
  }
  // 当本地尚未上传壁纸时，优雅降级为内置的默认壁纸，彻底消除空壁纸导致的黑屏或报错
  return {
    url: DEFAULT_LOCAL_WALLPAPER,
    isVideo: false,
    name: '默认内置壁纸',
    isCustom: false,
  };
}

export async function getLocalMediaUrl(): Promise<string | null> {
  try {
    const info = await getLocalMediaInfo();
    return info ? info.url : null;
  } catch (e) {
    console.error('[Storage] Error fetching local media from IndexedDB:', e);
  }
  return null;
}

export async function clearLocalMedia(): Promise<void> {
  try {
    await del(LOCAL_MEDIA_KEY);
  } catch (e) {
    console.error('[Storage] Error clearing local media:', e);
  }
}

// ==================== 数据备份与一键恢复工具 ====================
export interface BackupRestoreResult {
  settingsRestored: boolean;
  shortcutsRestoredCount: number;
  todosRestoredCount: number;
}

/**
 * 尝试从多层本地快照备份及历史兼容存储中抢救恢复数据
 */
export async function restoreFromLocalBackups(): Promise<BackupRestoreResult> {
  const result: BackupRestoreResult = {
    settingsRestored: false,
    shortcutsRestoredCount: 0,
    todosRestoredCount: 0,
  };

  try {
    // 1. 尝试恢复快捷方式
    const candidateShortcuts =
      readLocalStorage<SiteShortcut[]>(SHORTCUTS_BACKUP_KEY) ||
      (await readChromeStorage<SiteShortcut[]>(SHORTCUTS_BACKUP_KEY)) ||
      readLocalStorage<SiteShortcut[]>('crab_home_shortcuts') ||
      readLocalStorage<SiteShortcut[]>('shortcuts');

    if (Array.isArray(candidateShortcuts) && candidateShortcuts.length > 0) {
      await writeChromeStorage(SHORTCUTS_KEY, candidateShortcuts);
      writeLocalStorage(SHORTCUTS_KEY, candidateShortcuts);
      result.shortcutsRestoredCount = candidateShortcuts.length;
    }

    // 2. 尝试恢复待办
    const candidateTodos =
      readLocalStorage<any[]>(TODOS_BACKUP_KEY) ||
      (await readChromeStorage<any[]>(TODOS_BACKUP_KEY)) ||
      readLocalStorage<any[]>('crab_home_todo_items_v1');

    if (Array.isArray(candidateTodos) && candidateTodos.length > 0) {
      await writeChromeStorage(TODOS_KEY, candidateTodos);
      writeLocalStorage(TODOS_KEY, candidateTodos);
      result.todosRestoredCount = candidateTodos.length;
    }

    // 3. 尝试恢复设置
    const candidateSettings =
      readLocalStorage<Partial<AppSettings>>(SETTINGS_BACKUP_KEY) ||
      (await readChromeStorage<Partial<AppSettings>>(SETTINGS_BACKUP_KEY)) ||
      readLocalStorage<Partial<AppSettings>>('crab_home_settings');

    if (candidateSettings && Object.keys(candidateSettings).length > 0) {
      const merged = normalizeSettings(candidateSettings);
      await writeChromeStorage(SETTINGS_KEY, merged);
      writeLocalStorage(SETTINGS_KEY, merged);
      result.settingsRestored = true;
    }
  } catch (err) {
    console.warn('[Storage] restoreFromLocalBackups error:', err);
  }

  return result;
}

/**
 * 导出用户全部关键配置（用于手动备份与无损迁移）
 */
export async function exportAllUserData(): Promise<string> {
  const currentSettings = await loadSettings();
  const currentShortcuts = await loadShortcuts();
  const currentTodos = await loadTodosFromStorage();
  const currentSearchHistory = await loadSearchHistory();

  const dump = {
    appName: 'CrabTab',
    version: '1.0.2',
    exportedAt: new Date().toISOString(),
    settings: currentSettings,
    shortcuts: currentShortcuts,
    todos: currentTodos,
    searchHistory: currentSearchHistory,
  };

  return JSON.stringify(dump, null, 2);
}

/**
 * 导入用户全部配置
 */
export async function importAllUserData(jsonStr: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return false;

    if (parsed.settings && typeof parsed.settings === 'object') {
      await saveSettings(parsed.settings);
    }
    if (Array.isArray(parsed.shortcuts)) {
      await saveShortcuts(parsed.shortcuts);
    }
    if (Array.isArray(parsed.todos)) {
      await saveTodosToStorage(parsed.todos);
    }
    if (Array.isArray(parsed.searchHistory)) {
      await saveSearchHistory(parsed.searchHistory);
    }
    return true;
  } catch (err) {
    console.warn('[Storage] Import failed:', err);
    return false;
  }
}
