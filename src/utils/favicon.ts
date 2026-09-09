/**
 * Favicon 图标获取与多级降级兜底工具
 */

export interface FaviconCandidate {
  url: string;
  type: 'custom' | 'duckduckgo' | 'google' | 'direct';
}

/**
 * 提取 URL 的域名与源
 */
export function parseDomainAndOrigin(inputUrl: string): { domain: string; origin: string } {
  try {
    let formatted = inputUrl.trim();
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = `https://${formatted}`;
    }
    const parsed = new URL(formatted);
    return {
      domain: parsed.hostname,
      origin: parsed.origin,
    };
  } catch {
    return { domain: '', origin: '' };
  }
}

/**
 * 生成多级降级候选图标列表
 * 优先级：
 * 1. 用户自定义指定的图标
 * 2. DuckDuckGo 权威公共 CDN (国内访问速度快且极其稳定，无需翻墙)
 * 3. Google Favicon API
 * 4. 站点自身根目录 /favicon.ico (对于内网或独立站点非常有效)
 */
export function getFaviconCandidates(siteUrl: string, customIcon?: string): string[] {
  const candidates: string[] = [];
  const trimmedCustom = customIcon?.trim();
  if (trimmedCustom) {
    candidates.push(trimmedCustom);
  }

  const { domain, origin } = parseDomainAndOrigin(siteUrl);
  if (!domain) return candidates;

  // DuckDuckGo CDN
  const ddgUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  if (!candidates.includes(ddgUrl)) {
    candidates.push(ddgUrl);
  }

  // Google Favicons API
  const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  if (!candidates.includes(googleUrl)) {
    candidates.push(googleUrl);
  }

  // 站点自身 favicon.ico
  if (origin) {
    const directUrl = `${origin}/favicon.ico`;
    if (!candidates.includes(directUrl)) {
      candidates.push(directUrl);
    }
  }

  return candidates;
}

/**
 * 获取首选 Favicon URL
 */
export function getPrimaryFaviconUrl(siteUrl: string, customIcon?: string): string {
  const candidates = getFaviconCandidates(siteUrl, customIcon);
  return candidates[0] || '';
}
