import { BookmarkNode } from '../types';

/**
 * 判断当前是否处于真正的浏览器扩展运行环境
 */
export function isExtensionEnvironment(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

/**
 * 检查当前浏览器是否已赋予并挂载 chrome.bookmarks API
 */
export function hasBookmarkApi(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks && typeof chrome.bookmarks.getTree === 'function';
}

/**
 * 检查当前是否已获得浏览器书签读取权限
 */
export async function checkBookmarkPermission(): Promise<boolean> {
  if (hasBookmarkApi()) {
    return true;
  }

  // 容错检测：若 permissions API 存在可检测
  if (typeof chrome !== 'undefined' && chrome.permissions && typeof chrome.permissions.contains === 'function') {
    return new Promise((resolve) => {
      try {
        chrome.permissions.contains({ permissions: ['bookmarks'] }, (result) => {
          if (chrome.runtime?.lastError) {
            // 抑制并消费可能存在的 runtime.lastError
            void chrome.runtime.lastError;
          }
          resolve(!!result || hasBookmarkApi());
        });
      } catch {
        resolve(hasBookmarkApi());
      }
    });
  }

  return false;
}

/**
 * 动态向浏览器申请书签读取权限（若未就绪）
 */
export async function requestBookmarkPermission(): Promise<boolean> {
  if (hasBookmarkApi()) {
    return true;
  }

  if (typeof chrome !== 'undefined' && chrome.permissions && typeof chrome.permissions.request === 'function') {
    return new Promise((resolve) => {
      try {
        chrome.permissions.request({ permissions: ['bookmarks'] }, (granted) => {
          if (chrome.runtime?.lastError) {
            // 当 permissions 已在 manifest.json 声明时，request 可能触发 lastError 提示已就绪或无需动态请求
            void chrome.runtime.lastError;
          }
          resolve(!!granted || hasBookmarkApi());
        });
      } catch {
        resolve(hasBookmarkApi());
      }
    });
  }
  return false;
}

/**
 * 撤销书签读取权限
 */
export async function revokeBookmarkPermission(): Promise<boolean> {
  if (typeof chrome !== 'undefined' && chrome.permissions && typeof chrome.permissions.remove === 'function') {
    return new Promise((resolve) => {
      try {
        chrome.permissions.remove({ permissions: ['bookmarks'] }, (removed) => {
          if (chrome.runtime?.lastError) {
            void chrome.runtime.lastError;
          }
          resolve(!!removed);
        });
      } catch {
        resolve(false);
      }
    });
  }
  return false;
}

/**
 * 获取浏览器完整书签树
 * @param allowMockFallback 当处于普通非扩展网页调试环境且用户主动选择时才提供模拟数据
 */
export async function fetchBookmarkTree(allowMockFallback = false): Promise<BookmarkNode[]> {
  if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree) {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((results) => {
        if (!results || results.length === 0) {
          resolve([]);
          return;
        }
        resolve(results as BookmarkNode[]);
      });
    });
  }

  if (allowMockFallback) {
    return getMockBookmarkTree();
  }

  return [];
}

/**
 * 监听浏览器书签树变更（创建、删除、移动、修改、重排序）
 */
export function subscribeBookmarkChanges(onChange: () => void): () => void {
  if (typeof chrome === 'undefined' || !chrome.bookmarks) {
    return () => {};
  }

  const events = [
    chrome.bookmarks.onCreated,
    chrome.bookmarks.onRemoved,
    chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved,
    chrome.bookmarks.onChildrenReordered,
  ];

  events.forEach((evt) => {
    if (evt && typeof evt.addListener === 'function') {
      evt.addListener(onChange);
    }
  });

  return () => {
    events.forEach((evt) => {
      if (evt && typeof evt.removeListener === 'function') {
        evt.removeListener(onChange);
      }
    });
  };
}

/**
 * 递归搜索书签，返回匹配的书签以及其完整的文件夹层级路径链
 */
export interface BookmarkSearchResult {
  bookmark: BookmarkNode;
  path: string[];
}

export function searchBookmarksRecursive(
  nodes: BookmarkNode[],
  query: string,
  parentPath: string[] = []
): BookmarkSearchResult[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  const results: BookmarkSearchResult[] = [];

  const traverse = (nodeList: BookmarkNode[], currentPath: string[]) => {
    for (const node of nodeList) {
      if (node.url) {
        const titleMatch = (node.title || '').toLowerCase().includes(keyword);
        const urlMatch = node.url.toLowerCase().includes(keyword);
        if (titleMatch || urlMatch) {
          results.push({
            bookmark: node,
            path: currentPath,
          });
        }
      }
      if (node.children && node.children.length > 0) {
        const nextPath = node.title ? [...currentPath, node.title] : currentPath;
        traverse(node.children, nextPath);
      }
    }
  };

  traverse(nodes, parentPath);
  return results;
}

/**
 * 快速搜索书签，支持 Chrome 原生快速检索与非扩展模拟环境降级
 */
export async function searchBookmarks(
  query: string,
  maxResults: number = 5
): Promise<BookmarkSearchResult[]> {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return [];

  // 1. 优先使用 Chrome 原生 C++ 级别快速搜索
  if (typeof chrome !== 'undefined' && chrome.bookmarks && typeof chrome.bookmarks.search === 'function') {
    return new Promise((resolve) => {
      try {
        chrome.bookmarks.search(query.trim(), (results) => {
          if (!results || results.length === 0) {
            resolve([]);
            return;
          }
          const validNodes = results
            .filter((node) => node.url && !node.url.startsWith('javascript:'))
            .slice(0, maxResults)
            .map((node) => ({
              bookmark: node as BookmarkNode,
              path: [],
            }));
          resolve(validNodes);
        });
      } catch {
        resolve([]);
      }
    });
  }

  // 2. 非扩展环境（开发预览）优雅回退到 mock 书签树递归检索
  try {
    const tree = await fetchBookmarkTree(true);
    const results = searchBookmarksRecursive(tree, keyword);
    return results.slice(0, maxResults);
  } catch {
    return [];
  }
}

/**
 * 计算某个节点下包含的有效项目总数（直接子节点数量）
 */
export function countDirectItems(node: BookmarkNode): number {
  return node.children ? node.children.length : 0;
}

/**
 * 递归计算某个节点下包含的所有叶子书签（链接）数量
 */
export function countTotalBookmarks(node: BookmarkNode): number {
  if (!node.children || node.children.length === 0) {
    return node.url ? 1 : 0;
  }
  return node.children.reduce((total, child) => total + countTotalBookmarks(child), 0);
}

/**
 * 多层级的高仿真实开发与生活书签模拟数据
 */
function getMockBookmarkTree(): BookmarkNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [
            {
              id: '101',
              title: 'GitHub: Let’s build from here',
              url: 'https://github.com',
              dateAdded: 1680000000000,
            },
            {
              id: '102',
              title: 'DeepSeek: 探索未至之境',
              url: 'https://chat.deepseek.com',
              dateAdded: 1680000100000,
            },
            {
              id: '103',
              title: '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili',
              url: 'https://www.bilibili.com',
              dateAdded: 1680000200000,
            },
            {
              id: '104',
              title: 'ChatGPT',
              url: 'https://chatgpt.com',
              dateAdded: 1680000300000,
            },
            {
              id: '105',
              title: 'Google',
              url: 'https://www.google.com',
              dateAdded: 1680000400000,
            },
            {
              id: '106',
              title: 'YouTube',
              url: 'https://www.youtube.com',
              dateAdded: 1680000500000,
            },
            {
              id: '200',
              title: '技术开发',
              children: [
                {
                  id: '201',
                  title: 'React – 官方前端框架文档',
                  url: 'https://react.dev',
                  dateAdded: 1680001000000,
                },
                {
                  id: '202',
                  title: 'Tailwind CSS - 现代实用类优先 CSS',
                  url: 'https://tailwindcss.com',
                  dateAdded: 1680001100000,
                },
                {
                  id: '203',
                  title: 'TypeScript: JavaScript With Syntax For Types',
                  url: 'https://www.typescriptlang.org',
                  dateAdded: 1680001200000,
                },
                {
                  id: '204',
                  title: 'MDN Web Docs 开发者网络',
                  url: 'https://developer.mozilla.org',
                  dateAdded: 1680001300000,
                },
                {
                  id: '205',
                  title: 'Vite | 下一代的前端工具链',
                  url: 'https://vitejs.dev',
                  dateAdded: 1680001400000,
                },
                {
                  id: '206',
                  title: 'Ant Design - 企业级 UI 设计语言',
                  url: 'https://ant.design',
                  dateAdded: 1680001500000,
                },
                {
                  id: '220',
                  title: '云原生 & DevOps',
                  children: [
                    {
                      id: '221',
                      title: 'Docker: Accelerated Container Application Development',
                      url: 'https://www.docker.com',
                      dateAdded: 1680002000000,
                    },
                    {
                      id: '222',
                      title: 'Kubernetes 生产级别的容器编排系统',
                      url: 'https://kubernetes.io',
                      dateAdded: 1680002100000,
                    },
                    {
                      id: '223',
                      title: 'Cloudflare - 连接、保护和构建未来',
                      url: 'https://www.cloudflare.com',
                      dateAdded: 1680002200000,
                    },
                    {
                      id: '224',
                      title: 'Vercel: Build and deploy the best Web experiences',
                      url: 'https://vercel.com',
                      dateAdded: 1680002300000,
                    },
                  ],
                },
              ],
            },
            {
              id: '300',
              title: '设计与灵感',
              children: [
                {
                  id: '301',
                  title: 'Dribbble - 发现全球顶尖设计师创意作品',
                  url: 'https://dribbble.com',
                  dateAdded: 1680003000000,
                },
                {
                  id: '302',
                  title: 'Figma: 协作界面设计利器',
                  url: 'https://www.figma.com',
                  dateAdded: 1680003100000,
                },
                {
                  id: '303',
                  title: 'Unsplash: 高清优质免版税摄影壁纸图库',
                  url: 'https://unsplash.com',
                  dateAdded: 1680003200000,
                },
                {
                  id: '304',
                  title: 'Behance: 展示与发现创意作品平台',
                  url: 'https://www.behance.net',
                  dateAdded: 1680003300000,
                },
              ],
            },
            {
              id: '400',
              title: '日常与资讯',
              children: [
                {
                  id: '401',
                  title: 'V2EX - 创意工作者们的社区',
                  url: 'https://www.v2ex.com',
                  dateAdded: 1680004000000,
                },
                {
                  id: '402',
                  title: '少数派 - 高效工作，品质生活',
                  url: 'https://sspai.com',
                  dateAdded: 1680004100000,
                },
                {
                  id: '403',
                  title: '知乎 - 有问题，就会有答案',
                  url: 'https://www.zhihu.com',
                  dateAdded: 1680004200000,
                },
              ],
            },
          ],
        },
        {
          id: '2',
          title: '其他书签',
          children: [
            {
              id: '501',
              title: '阮一峰的网络日志',
              url: 'https://www.ruanyifeng.com/blog/',
              dateAdded: 1680005000000,
            },
            {
              id: '502',
              title: '维基百科，自由的百科全书',
              url: 'https://zh.wikipedia.org',
              dateAdded: 1680005100000,
            },
            {
              id: '510',
              title: '技术备忘与归档',
              children: [
                {
                  id: '511',
                  title: 'Stack Overflow - Where Developers Learn & Share',
                  url: 'https://stackoverflow.com',
                  dateAdded: 1680005200000,
                },
              ],
            },
          ],
        },
        {
          id: '3',
          title: '移动设备书签',
          children: [
            {
              id: '601',
              title: '微信读书 - 正版书籍小说免费阅读',
              url: 'https://weread.qq.com',
              dateAdded: 1680006000000,
            },
          ],
        },
      ],
    },
  ];
}
