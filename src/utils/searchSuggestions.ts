import { SuggestionEngineId, SearchEngineId } from '../types';

/**
 * 实时搜索联想建议服务
 * 自动识别浏览器扩展环境 (chrome-extension:) 与本地 Web 开发环境 (localhost)，
 * 严禁使用动态 <script> 标签，100% 遵循 Content Security Policy (CSP)，杜绝 ERR_FILE_NOT_FOUND
 */

export async function fetchSearchSuggestions(
  query: string,
  currentEngineId: SearchEngineId = 'google',
  suggestionEngineId: SuggestionEngineId = 'auto',
  signal?: AbortSignal
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 用户显式关闭了搜索联想
  if (suggestionEngineId === 'off') {
    return [];
  }

  // 计算实际生效的目标建议引擎
  let targetEngine: 'bing' | 'baidu' | 'google' | 'duckduckgo' = 'bing';
  if (suggestionEngineId === 'auto') {
    if (currentEngineId === 'baidu') targetEngine = 'baidu';
    else if (currentEngineId === 'duckduckgo') targetEngine = 'duckduckgo';
    else if (currentEngineId === 'google') targetEngine = 'google';
    else targetEngine = 'bing';
  } else {
    targetEngine = suggestionEngineId;
  }

  // 判断是否处于 Chrome / Edge / Firefox 浏览器扩展环境
  const isExtension =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'chrome-extension:' ||
      window.location.protocol === 'moz-extension:');

  // 判断是否处于本地 Vite 开发环境
  const isLocalDev =
    typeof window !== 'undefined' &&
    !isExtension &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const encoded = encodeURIComponent(trimmed);

  // 根据目标引擎构造对应请求 URL
  let targetUrl = '';
  switch (targetEngine) {
    case 'baidu':
      targetUrl = isLocalDev
        ? `/api/suggest/baidu?wd=${encoded}&action=opensearch`
        : `https://suggestion.baidu.com/su?wd=${encoded}&action=opensearch`;
      break;
    case 'google':
      targetUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;
      break;
    case 'duckduckgo':
      targetUrl = `https://duckduckgo.com/ac/?q=${encoded}&type=list`;
      break;
    case 'bing':
    default:
      targetUrl = isLocalDev
        ? `/api/suggest/bing?query=${encoded}`
        : `https://api.bing.com/osjson.aspx?query=${encoded}`;
      break;
  }

  try {
    const res = await fetch(targetUrl, {
      signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (res.ok) {
      const data = await res.json();
      // OpenSearch 标准返回结构: [query, [suggest1, suggest2, ...]]
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const list = data[1].filter(
          (item: any): item is string => typeof item === 'string' && item.trim().length > 0
        );
        if (list.length > 0) {
          return list.slice(0, 6);
        }
      }
    }
  } catch (err: any) {
    // 捕获 abort 信号或网络异常，避免未处理异常抛出
    if (err?.name === 'AbortError') return [];
  }

  // 备用兜底策略: 若首选源失败且不是 bing，回退尝试 Bing
  if (targetEngine !== 'bing') {
    try {
      const fallbackUrl = isLocalDev
        ? `/api/suggest/bing?query=${encoded}`
        : `https://api.bing.com/osjson.aspx?query=${encoded}`;
      const res = await fetch(fallbackUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          const list = data[1].filter(
            (item: any): item is string => typeof item === 'string' && item.trim().length > 0
          );
          if (list.length > 0) {
            return list.slice(0, 6);
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return [];
    }
  }

  return [];
}
