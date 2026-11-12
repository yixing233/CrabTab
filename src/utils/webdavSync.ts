/**
 * CrabTab - WebDAV 同步
 *
 * 把用户配置（设置 / 快捷方式 / 待办 / 倒数日）备份到自己的 WebDAV 服务器，
 * 并在多台设备间保持同步。
 *
 * 设计要点：
 *  - 只用最小 WebDAV 子集：PROPFIND（探测）、MKCOL（建目录）、GET / PUT（读写）。
 *    这些都是绝大多数实现（Nextcloud、坚果云、Synology、Nginx dav 等）都支持的，
 *    不依赖 LOCK/UNLOCK 这类实现差异很大的扩展。
 *  - 同步单元是「一个 JSON 文件」，而不是逐键同步 —— 简单、原子、易排查。
 *  - 冲突策略：按文件内 updatedAt 时间戳比较，较新的那份覆盖较旧的。
 *  - 扩展里没有 CORS 问题（host_permissions 已覆盖），但普通网页调试环境会被
 *    浏览器拦截，因此对非扩展环境给出明确提示而不是静默失败。
 */
import {
  loadSettings,
  saveSettings,
  loadShortcuts,
  saveShortcuts,
  loadTodosFromStorage,
  saveTodosToStorage,
  loadCountdownsFromStorage,
  saveCountdownsToStorage,
  isStorageHydrationDegraded,
} from './storage';
import { AppSettings, SiteShortcut } from '../types';

// ============================================================================
// 类型
// ============================================================================

export interface WebDavConfig {
  enabled: boolean;
  /** 服务器地址，例如 https://dav.jianguoyun.com/dav/ */
  url: string;
  username: string;
  /** 应用专用密码。仅存在 chrome.storage.local，不会写入同步文件。 */
  password: string;
  /** 目标文件路径（相对服务器根），例如 CrabTab/crabtab-sync.json */
  path: string;
}

export interface SyncPayload {
  appName: 'CrabTab';
  schema: number;
  /** 本份数据的修改时间（毫秒），用于「新的赢」判定 */
  updatedAt: number;
  /** 写入这份数据的设备标识，便于排查 */
  deviceId: string;
  settings?: AppSettings;
  shortcuts?: SiteShortcut[];
  todos?: unknown[];
  countdowns?: unknown[];
}

export type SyncResult =
  | { ok: true; action: 'uploaded' | 'downloaded' | 'skipped' | 'identical'; updatedAt?: number }
  | { ok: false; error: string; code?: 'config' | 'network' | 'auth' | 'http' | 'parse' | 'env' };

export const SYNC_FILE_SCHEMA = 1;
const SYNC_TIMEOUT_MS = 15000;

// ============================================================================
// 配置读写（配置本身绝不参与同步，否则密码会被写进远端明文）
// ============================================================================

const DAV_CONFIG_KEY = 'crab_webdav_config_v1';
const DAV_META_KEY = 'crab_webdav_meta_v1';

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  enabled: false,
  url: '',
  username: '',
  password: '',
  path: 'CrabTab/crabtab-sync.json',
};

export async function loadWebDavConfig(): Promise<WebDavConfig> {
  try {
    const raw = localStorage.getItem(DAV_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_WEBDAV_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      url: typeof parsed.url === 'string' ? parsed.url : '',
      username: typeof parsed.username === 'string' ? parsed.username : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
      path: typeof parsed.path === 'string' && parsed.path ? parsed.path : DEFAULT_WEBDAV_CONFIG.path,
    };
  } catch {
    return { ...DEFAULT_WEBDAV_CONFIG };
  }
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<void> {
  try {
    localStorage.setItem(DAV_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('[WebDAV] 保存配置失败:', err);
  }
}

/**
 * 本地数据的「最后修改时间」。
 *
 * 不能每次现取 Date.now()：那样每次同步都会认为本地更新过，导致
 * 反复上传并不断覆盖其它设备的改动。必须由数据变更点主动打点，
 * 这里只负责持久化与读取。
 */
const LOCAL_TOUCHED_KEY = 'crab_webdav_local_touched_v1';

let touchTimer: ReturnType<typeof setTimeout> | null = null;

/** 标记本地数据已修改（防抖写入，避免高频保存时反复落盘） */
export function touchLocalData(): void {
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    touchTimer = null;
    try {
      localStorage.setItem(LOCAL_TOUCHED_KEY, String(Date.now()));
    } catch {}
  }, 300);
}

/** 读取本地数据最后修改时间；从未修改过返回 0 */
export function getLocalTouchedAt(): number {
  try {
    const raw = localStorage.getItem(LOCAL_TOUCHED_KEY);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** 下载应用远端数据后，把本地时间对齐到远端，避免立刻又判定本地更新 */
export function setLocalTouchedAt(ts: number): void {
  if (touchTimer) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
  try {
    localStorage.setItem(LOCAL_TOUCHED_KEY, String(ts));
  } catch {}
}

export interface SyncMeta {
  /** 本设备最后一次成功同步的时间 */
  lastSyncAt: number;
  /** 最后一次动作 */
  lastAction: 'uploaded' | 'downloaded' | null;
  /** 最后一次错误信息（成功后清空） */
  lastError: string | null;
  /** 本设备看到过的远端 updatedAt，避免自增式反复上传 */
  remoteUpdatedAt: number;
}

export const DEFAULT_SYNC_META: SyncMeta = {
  lastSyncAt: 0,
  lastAction: null,
  lastError: null,
  remoteUpdatedAt: 0,
};

export async function loadSyncMeta(): Promise<SyncMeta> {
  try {
    const raw = localStorage.getItem(DAV_META_KEY);
    if (!raw) return { ...DEFAULT_SYNC_META };
    const p = JSON.parse(raw);
    return {
      lastSyncAt: typeof p.lastSyncAt === 'number' ? p.lastSyncAt : 0,
      lastAction: p.lastAction === 'uploaded' || p.lastAction === 'downloaded' ? p.lastAction : null,
      lastError: typeof p.lastError === 'string' ? p.lastError : null,
      remoteUpdatedAt: typeof p.remoteUpdatedAt === 'number' ? p.remoteUpdatedAt : 0,
    };
  } catch {
    return { ...DEFAULT_SYNC_META };
  }
}

export async function saveSyncMeta(meta: SyncMeta): Promise<void> {
  try {
    localStorage.setItem(DAV_META_KEY, JSON.stringify(meta));
  } catch {}
}

/** 设备标识：仅用于排查「是谁最后写的」，不参与任何判定 */
export function getDeviceId(): string {
  const KEY = 'crab_webdav_device_id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `dev-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'dev-unknown';
  }
}

// ============================================================================
// 主机权限
//
// WebDAV 服务器由用户任意填写，无法在 manifest 里静态声明，因此用
// optional_host_permissions + 运行时按域名申请。必须由用户手势（点击按钮）
// 触发，浏览器才允许弹出授权框，所以放在「测试连接 / 立即同步」这类动作里。
// ============================================================================

/** 从服务器地址推导要申请的 origin 匹配模式 */
export function originPatternOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

/**
 * 确保已取得目标服务器的访问权限。
 * 返回 true 表示可用；false 表示用户拒绝或环境不支持。
 */
export async function ensureHostPermission(url: string): Promise<boolean> {
  const pattern = originPatternOf(url);
  if (!pattern) return false;

  // 非扩展环境（普通网页调试）没有 permissions API，直接放行，
  // 由浏览器 CORS 自行决定成败 —— 此时会在网络层报错并给出提示。
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;

  try {
    const already = await chrome.permissions.contains({ origins: [pattern] });
    if (already) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (err) {
    console.warn('[WebDAV] 申请主机权限失败:', err);
    return false;
  }
}

// ============================================================================
// WebDAV 客户端
// ============================================================================

/** 规范化：确保以 / 结尾，并拼出文件与目录的完整 URL */
export function buildDavUrls(config: WebDavConfig): { fileUrl: string; dirUrl: string } {
  const base = config.url.trim().replace(/\/+$/, '');
  const rel = config.path.trim().replace(/^\/+/, '');
  const fileUrl = `${base}/${rel}`;
  const dirUrl = fileUrl.slice(0, fileUrl.lastIndexOf('/'));
  return { fileUrl, dirUrl };
}

function authHeader(config: WebDavConfig): string {
  // btoa 只能处理 latin1，凭据里含非 ASCII 时需先转 UTF-8
  const raw = `${config.username}:${config.password}`;
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return `Basic ${btoa(binary)}`;
}

async function davFetch(
  config: WebDavConfig,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: authHeader(config),
        ...(init.headers || {}),
      },
      // 同步必须拿到最新内容，禁用 HTTP 缓存
      cache: 'no-store',
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/** 把网络/HTTP 异常归一成可读文案 */
function describeFetchError(err: unknown): { error: string; code: 'network' | 'auth' | 'http' } {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { error: 'timeout', code: 'network' };
  }
  return { error: err instanceof Error ? err.message : String(err), code: 'network' };
}

/**
 * 测试连接：对目标目录做一次 PROPFIND。
 * 401/403 明确区分成凭据问题，避免用户误以为是地址填错。
 */
export async function testConnection(
  config: WebDavConfig
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (!config.url.trim()) return { ok: false, error: 'url required', code: 'config' };
  const { dirUrl } = buildDavUrls(config);

  try {
    const res = await davFetch(config, dirUrl || config.url, {
      method: 'PROPFIND',
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
    });
    if (res.status === 401) return { ok: false, error: 'unauthorized', code: 'auth' };
    if (res.status === 403) return { ok: false, error: 'forbidden', code: 'auth' };
    // 404 说明目录还不存在，但服务器可达、凭据有效 —— 视为连接成功
    if (res.status === 404) return { ok: true };
    if (res.status === 207 || res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}`, code: 'http' };
  } catch (err) {
    return { ok: false, ...describeFetchError(err) };
  }
}

/** 逐级创建目录（MKCOL 不能递归），已存在则忽略 405 */
async function ensureDirectory(config: WebDavConfig): Promise<void> {
  const { dirUrl } = buildDavUrls(config);
  const base = config.url.trim().replace(/\/+$/, '');
  if (!dirUrl || dirUrl === base) return;

  const segments = dirUrl.slice(base.length).split('/').filter(Boolean);
  let current = base;
  for (const seg of segments) {
    current += `/${encodeURIComponent(seg)}`;
    const res = await davFetch(config, current, { method: 'MKCOL' });
    // 201 创建成功；405 已存在；其余错误交给后续 PUT 报出来
    if (!res.ok && res.status !== 405 && res.status !== 301) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('unauthorized');
      }
      // 继续尝试下一级，避免个别服务端把「已存在」返回成别的码而中断
    }
  }
}

/** 读取远端同步文件；不存在返回 null */
export async function downloadPayload(
  config: WebDavConfig
): Promise<{ ok: true; payload: SyncPayload | null } | { ok: false; error: string; code: string }> {
  const { fileUrl } = buildDavUrls(config);
  try {
    const res = await davFetch(config, fileUrl, { method: 'GET' });
    if (res.status === 404) return { ok: true, payload: null };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'unauthorized', code: 'auth' };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, code: 'http' };

    const text = await res.text();
    if (!text.trim()) return { ok: true, payload: null };
    const parsed = JSON.parse(text) as SyncPayload;
    if (!parsed || parsed.appName !== 'CrabTab' || typeof parsed.updatedAt !== 'number') {
      return { ok: false, error: 'invalid payload', code: 'parse' };
    }
    return { ok: true, payload: parsed };
  } catch (err) {
    if (err instanceof SyntaxError) return { ok: false, error: 'invalid payload', code: 'parse' };
    return { ok: false, ...describeFetchError(err) };
  }
}

/** 写入远端同步文件 */
export async function uploadPayload(
  config: WebDavConfig,
  payload: SyncPayload
): Promise<SyncResult> {
  const { fileUrl } = buildDavUrls(config);
  try {
    await ensureDirectory(config);
    const body = JSON.stringify(payload);
    const res = await davFetch(config, fileUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'unauthorized', code: 'auth' };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, code: 'http' };
    return { ok: true, action: 'uploaded', updatedAt: payload.updatedAt };
  } catch (err) {
    const d = describeFetchError(err);
    return { ok: false, ...d };
  }
}

// ============================================================================
// 同步引擎
// ============================================================================

/** 收集本机要同步的数据 */
export async function collectLocalPayload(): Promise<SyncPayload> {
  const [settings, shortcuts, todos, countdowns] = await Promise.all([
    loadSettings(),
    loadShortcuts(),
    loadTodosFromStorage(),
    loadCountdownsFromStorage(),
  ]);

  // updatedAt 取「本地数据真正的最后修改时间」。
  // 不能用 Date.now()：那样每次同步都会认为本地更新过，导致反复上传。
  const localUpdatedAt = getLocalTouchedAt();

  return {
    appName: 'CrabTab',
    schema: SYNC_FILE_SCHEMA,
    updatedAt: localUpdatedAt,
    deviceId: getDeviceId(),
    settings,
    shortcuts,
    todos: todos as unknown[],
    countdowns: countdowns ?? [],
  };
}

/** 把远端 payload 应用到本地 */
export async function applyRemotePayload(payload: SyncPayload): Promise<void> {
  if (payload.settings && typeof payload.settings === 'object') {
    await saveSettings(payload.settings);
  }
  if (Array.isArray(payload.shortcuts)) {
    await saveShortcuts(payload.shortcuts);
  }
  if (Array.isArray(payload.todos)) {
    await saveTodosToStorage(payload.todos);
  }
  if (Array.isArray(payload.countdowns)) {
    await saveCountdownsToStorage(payload.countdowns);
  }
  // 关键：把本地「修改时间」对齐到远端的，否则下一轮同步会误判本地更新过，
  // 立刻又把同样的数据传回去，形成来回覆盖。
  setLocalTouchedAt(payload.updatedAt);
}

/**
 * 执行一次双向同步。
 *
 * 冲突策略：比较本地与远端的 updatedAt，较新的一份赢。
 * `forced` 用于「立即上传/下载」按钮，跳过时间比较直接按指定方向执行。
 */
export async function runSync(
  options: { direction?: 'auto' | 'upload' | 'download' } = {}
): Promise<SyncResult> {
  const direction = options.direction ?? 'auto';
  const config = await loadWebDavConfig();
  if (!config.enabled) return { ok: false, error: 'disabled', code: 'config' };
  if (!config.url.trim()) return { ok: false, error: 'url required', code: 'config' };

  // 自动同步时不能弹授权框（无用户手势会被浏览器拒绝），只检查是否已授权；
  // 未授权就安静退出，等用户点「测试连接 / 立即同步」时再申请。
  if (direction === 'auto') {
    const pattern = originPatternOf(config.url);
    if (pattern && typeof chrome !== 'undefined' && chrome.permissions) {
      try {
        const granted = await chrome.permissions.contains({ origins: [pattern] });
        if (!granted) return { ok: false, error: 'permission required', code: 'env' };
      } catch {
        // 查询失败不阻断，继续尝试（可能已被静态 host_permissions 覆盖）
      }
    }
  }

  // 存储降级时绝不参与同步：此时内存里只有默认值，
  // 一旦上传就会把用户的真实数据覆盖成默认值。
  if (isStorageHydrationDegraded()) {
    return { ok: false, error: 'storage degraded', code: 'env' };
  }

  const meta = await loadSyncMeta();
  const remote = await downloadPayload(config);
  if (!remote.ok) {
    await saveSyncMeta({ ...meta, lastError: remote.error });
    return { ok: false, error: remote.error, code: 'http' };
  }

  const localPayload = await collectLocalPayload();
  const remotePayload = remote.payload;

  // 强制上传：时间戳推进到「现在」，确保远端记录下这次写入
  if (direction === 'upload') {
    const stamp = Date.now();
    setLocalTouchedAt(stamp);
    const payload = { ...localPayload, updatedAt: stamp };
    const res = await uploadPayload(config, payload);
    if (res.ok) {
      await saveSyncMeta({
        lastSyncAt: Date.now(),
        lastAction: 'uploaded',
        lastError: null,
        remoteUpdatedAt: payload.updatedAt,
      });
    } else {
      await saveSyncMeta({ ...meta, lastError: res.error });
    }
    return res;
  }

  // 强制下载
  if (direction === 'download') {
    if (!remotePayload) return { ok: false, error: 'no remote data', code: 'http' };
    await applyRemotePayload(remotePayload);
    await saveSyncMeta({
      lastSyncAt: Date.now(),
      lastAction: 'downloaded',
      lastError: null,
      remoteUpdatedAt: remotePayload.updatedAt,
    });
    return { ok: true, action: 'downloaded', updatedAt: remotePayload.updatedAt };
  }

  // 自动：远端没有数据 → 上传本地
  if (!remotePayload) {
    const res = await uploadPayload(config, localPayload);
    if (res.ok) {
      await saveSyncMeta({
        lastSyncAt: Date.now(),
        lastAction: 'uploaded',
        lastError: null,
        remoteUpdatedAt: localPayload.updatedAt,
      });
    } else {
      await saveSyncMeta({ ...meta, lastError: res.error });
    }
    return res;
  }

  // 自动：比较时间戳，新的赢
  if (remotePayload.updatedAt > localPayload.updatedAt) {
    await applyRemotePayload(remotePayload);
    await saveSyncMeta({
      lastSyncAt: Date.now(),
      lastAction: 'downloaded',
      lastError: null,
      remoteUpdatedAt: remotePayload.updatedAt,
    });
    return { ok: true, action: 'downloaded', updatedAt: remotePayload.updatedAt };
  }

  if (localPayload.updatedAt > remotePayload.updatedAt) {
    const res = await uploadPayload(config, localPayload);
    if (res.ok) {
      await saveSyncMeta({
        lastSyncAt: Date.now(),
        lastAction: 'uploaded',
        lastError: null,
        remoteUpdatedAt: localPayload.updatedAt,
      });
    } else {
      await saveSyncMeta({ ...meta, lastError: res.error });
    }
    return res;
  }

  // 完全相同
  await saveSyncMeta({
    lastSyncAt: Date.now(),
    lastAction: null,
    lastError: null,
    remoteUpdatedAt: remotePayload.updatedAt,
  });
  return { ok: true, action: 'identical', updatedAt: remotePayload.updatedAt };
}

// ============================================================================
// 自动同步：修改后防抖上传
// ============================================================================

let autoUploadTimer: ReturnType<typeof setTimeout> | null = null;
let autoUploadInFlight = false;

/**
 * 数据变更后调度一次自动上传。
 *
 * 用防抖而不是每次都传：拖拽排序、连续编辑会触发大量保存，逐次上传既慢又会
 * 让远端 updatedAt 频繁跳动，导致其它设备反复拉取。
 */
export function scheduleAutoUpload(delayMs = 4000): void {
  if (autoUploadTimer) clearTimeout(autoUploadTimer);
  autoUploadTimer = setTimeout(async () => {
    autoUploadTimer = null;
    if (autoUploadInFlight) return;
    const config = await loadWebDavConfig();
    if (!config.enabled) return;
    autoUploadInFlight = true;
    try {
      await runSync({ direction: 'auto' });
    } catch (err) {
      console.warn('[WebDAV] 自动上传失败:', err);
    } finally {
      autoUploadInFlight = false;
    }
  }, delayMs);
}
