/**
 * 版本检测工具：基于 GitHub Releases 官方开放 API
 */

export const CURRENT_VERSION = '1.0.1';
export const REPO_OWNER = 'yixing233';
export const REPO_NAME = 'CrabTab';
export const GITHUB_REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

export interface ReleaseInfo {
  version: string;
  hasUpdate: boolean;
  releaseUrl: string;
  publishedAt?: string;
  notes?: string;
}

const VERSION_CACHE_KEY = 'crab_home_version_check_cache';
const VERSION_CACHE_TTL = 60 * 60 * 1000; // 缓存 1 小时，防止频繁触发 GitHub Rate Limit

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
          return cached.data;
        }
      }
    } catch {
      // 忽略缓存解析错误
    }
  }

  // 2. 发起请求
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      // 仓库刚创建或暂无正式 Release 时返回 404
      if (response.status === 404) {
        return {
          version: CURRENT_VERSION,
          hasUpdate: false,
          releaseUrl: GITHUB_RELEASES_URL,
        };
      }
      throw new Error(`GitHub API HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const latestTag = data.tag_name || data.name || CURRENT_VERSION;
    const cleanLatest = latestTag.replace(/^[vV]/, '').trim();
    const hasUpdate = compareSemver(cleanLatest, CURRENT_VERSION) > 0;

    const result: ReleaseInfo = {
      version: cleanLatest,
      hasUpdate,
      releaseUrl: data.html_url || GITHUB_RELEASES_URL,
      publishedAt: data.published_at,
      notes: data.body,
    };

    // 写入缓存
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

    return result;
  } catch (error) {
    console.warn('[VersionCheck] Failed to fetch latest release:', error);
    return {
      version: CURRENT_VERSION,
      hasUpdate: false,
      releaseUrl: GITHUB_RELEASES_URL,
    };
  }
}
