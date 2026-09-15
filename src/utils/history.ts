import { BrowserHistoryItem } from '../types';

export async function fetchBrowserHistory(maxResults: number = 20): Promise<BrowserHistoryItem[]> {
  if (typeof chrome !== 'undefined' && chrome.history && chrome.history.search) {
    return new Promise((resolve) => {
      chrome.history.search(
        { text: '', maxResults, startTime: 0 },
        (results) => {
          if (!results || results.length === 0) {
            resolve([]);
            return;
          }
          const items: BrowserHistoryItem[] = results
            .filter(item => item.url && !item.url.startsWith('chrome://') && !item.url.startsWith('edge://'))
            .map(item => ({
              id: item.id,
              title: item.title || item.url || 'Untitled',
              url: item.url || '',
              lastVisitTime: item.lastVisitTime,
              visitCount: item.visitCount,
            }));
          resolve(items);
        }
      );
    });
  }

  // 非扩展环境（如浏览器直接预览模式）提供优雅的高质模拟数据
  return [
    { id: '1', title: 'GitHub: Let’s build from here · GitHub', url: 'https://github.com', lastVisitTime: Date.now() - 1000 * 60 * 15, visitCount: 42 },
    { id: '2', title: 'React – The library for web and native user interfaces', url: 'https://react.dev', lastVisitTime: Date.now() - 1000 * 60 * 50, visitCount: 28 },
    { id: '3', title: 'Tailwind CSS - Rapidly build modern websites', url: 'https://tailwindcss.com', lastVisitTime: Date.now() - 1000 * 3600 * 2, visitCount: 19 },
    { id: '4', title: 'V2EX - 创意工作者们的社区', url: 'https://www.v2ex.com', lastVisitTime: Date.now() - 1000 * 3600 * 5, visitCount: 15 },
    { id: '5', title: '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili', url: 'https://www.bilibili.com', lastVisitTime: Date.now() - 1000 * 3600 * 8, visitCount: 33 },
    { id: '6', title: 'Unsplash: Beautiful Free Images & Pictures', url: 'https://unsplash.com', lastVisitTime: Date.now() - 1000 * 3600 * 12, visitCount: 11 },
  ];
}

/**
 * 搜索浏览器历史记录，支持 Chrome 原生检索与非扩展模拟环境降级
 */
export async function searchBrowserHistory(query: string, maxResults: number = 5): Promise<BrowserHistoryItem[]> {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  if (typeof chrome !== 'undefined' && chrome.history && typeof chrome.history.search === 'function') {
    return new Promise((resolve) => {
      chrome.history.search(
        { text: query.trim(), maxResults, startTime: 0 },
        (results) => {
          if (!results || results.length === 0) {
            resolve([]);
            return;
          }
          const items: BrowserHistoryItem[] = results
            .filter(item => item.url && !item.url.startsWith('chrome://') && !item.url.startsWith('edge://'))
            .map(item => ({
              id: item.id,
              title: item.title || item.url || 'Untitled',
              url: item.url || '',
              lastVisitTime: item.lastVisitTime,
              visitCount: item.visitCount,
            }));
          resolve(items);
        }
      );
    });
  }

  // 非扩展环境（如浏览器直接预览模式）提供优雅的高质模拟数据检索
  const mockItems = await fetchBrowserHistory(20);
  return mockItems
    .filter(item => item.title.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword))
    .slice(0, maxResults);
}

