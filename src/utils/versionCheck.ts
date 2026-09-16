/**
 * 版本检测工具：从项目静态元数据源读取线上版本
 */

export const CURRENT_VERSION = '1.2.0';
export const REPO_OWNER = 'yixing233';
export const REPO_NAME = 'CrabTab';
export const GITHUB_REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const DISMISSED_UPDATE_VERSION_KEY = 'crab_dismissed_update_version';

export interface ReleaseInfo {
  version: string;
  hasUpdate: boolean;
  releaseUrl: string;
  publishedAt?: string;
  notes?: string;
}

export const VERSION_CACHE_KEY = 'crab_home_version_check_cache';
export const AUTO_CHECK_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时自动检查间隔
export const LAST_AUTO_CHECK_KEY = 'crab_home_last_auto_check_update_time';
const VERSION_CACHE_TTL = 60 * 60 * 1000; // 缓存 1 小时，防止频繁触发 GitHub Rate Limit
const VERSION_SOURCES = [
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/package.json`,
  `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@main/package.json`,
];

function normalizeVersion(version: string): string {
  const normalized = version.replace(/^[vV]/, '').trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`Invalid version: ${version}`);
  }
  return normalized;
}

function toReleaseInfo(version: string, details: Partial<ReleaseInfo> = {}): ReleaseInfo {
  const cleanVersion = normalizeVersion(version);
  return {
    version: cleanVersion,
    hasUpdate: compareSemver(cleanVersion, CURRENT_VERSION) > 0,
    releaseUrl: `${GITHUB_RELEASES_URL}/tag/v${cleanVersion}`,
    ...details,
  };
}

/**
 * 比较两个语义化版本号，若 vA > vB 返回 1，vA < vB 返回 -1，相等返回 0
 */
export function compareSemver(vA: string, vB: string): number {
  const cleanA = vA.replace(/^[vV]/, '').trim();
  const cleanB = vB.replace(/^[vV]/, '').trim();

  const partsA = cleanA.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = cleanB.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * 检查 GitHub Releases 最新版本
 */
export async function checkLatestVersion(force = false): Promise<ReleaseInfo> {
  // 1. 尝试使用缓存
  if (!force) {
    try {
      const cachedRaw = localStorage.getItem(VERSION_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
          return {
            ...cached.data,
            hasUpdate: compareSemver(cached.data.version, CURRENT_VERSION) > 0,
          };
        }
      }
    } catch {
      // 忽略缓存解析错误
    }
  }

  // 2. 从不受 GitHub API 匿名限流影响的静态源读取线上版本
  const errors: string[] = [];

  for (const versionUrl of VERSION_SOURCES) {
    try {
      const response = await fetch(versionUrl, {
        cache: force ? 'no-store' : 'default',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        errors.push(`${versionUrl} HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (!data || typeof data.version !== 'string') {
        throw new Error(`${versionUrl} returned an invalid version`);
      }
      const result = toReleaseInfo(data.version);
      cacheReleaseInfo(result);
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`Failed to check latest version: ${errors.join('; ')}`);
}

function cacheReleaseInfo(result: ReleaseInfo): void {
  try {
    localStorage.setItem(
      VERSION_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: result,
      })
    );
  } catch {
    // 忽略本地存储写入失败
  }
}

/**
 * 尝试执行自动后台更新检测
 * 仅当距上次检查超过 6 小时时才会真正发起网络请求
 */
export async function checkUpdateIfDue(force = false): Promise<ReleaseInfo | null> {
  try {
    const now = Date.now();
    const lastCheckStr = localStorage.getItem(LAST_AUTO_CHECK_KEY);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;

    if (!force && lastCheck && now - lastCheck < AUTO_CHECK_UPDATE_INTERVAL) {
      return null;
    }

    const result = await checkLatestVersion(force);
    localStorage.setItem(LAST_AUTO_CHECK_KEY, String(now));
    return result;
  } catch (err) {
    console.warn('[VersionCheck] Background auto check failed:', err);
    return null;
  }
}

/**
 * 读取本地缓存的最新版本信息（用于新标签页 0ms 瞬间挂载常驻通知，免网络等待）
 */
export function getCachedReleaseInfo(): ReleaseInfo | null {
  try {
    const cachedRaw = localStorage.getItem(VERSION_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.data?.version) {
        return {
          ...cached.data,
          hasUpdate: compareSemver(cached.data.version, CURRENT_VERSION) > 0,
        };
      }
    }
  } catch {}
  return null;
}

/**
 * 判断用户是否已主动关闭该版本的常驻提示
 */
export function isUpdateDismissed(version: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY) === version;
  } catch {
    return false;
  }
}

/**
 * 记录用户主动关闭该版本的常驻提示
 */
export function dismissUpdate(version: string): void {
  try {
    localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, version);
  } catch {}
}
