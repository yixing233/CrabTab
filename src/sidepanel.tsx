import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, Input, Button, Tag, Tooltip, theme as antdTheme } from 'antd';
import {
  Search,
  Folder,
  FolderOpen,
  ChevronRight,
  CornerUpLeft,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  X,
} from 'lucide-react';
import { BookmarkNode } from './types';
import {
  fetchBookmarkTree,
  subscribeBookmarkChanges,
  searchBookmarksRecursive,
  BookmarkSearchResult,
} from './utils/bookmarks';
import { ShortcutIconView } from './components/Shortcuts';
import './index.css';

// 错误边界保护
class SidePanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SidePanel ErrorBoundary] 捕获异常:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full p-6 text-center text-white bg-[#12161f] flex flex-col items-center justify-center gap-3">
          <AlertTriangle size={36} className="text-amber-500" />
          <div className="text-sm font-bold">书签侧边栏加载异常</div>
          <div className="text-xs text-gray-400 font-mono max-w-full overflow-hidden truncate">
            {this.state.error?.message || '未知错误'}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<RotateCcw size={13} />}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重新加载
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SidePanelApp: React.FC = () => {
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeRootId, setActiveRootId] = useState<string>('1');
  const [folderStack, setFolderStack] = useState<BookmarkNode[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 监听系统深色模式偏好
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      if (mql.addEventListener) {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
      }
    } catch {}
  }, []);

  // 加载书签数据
  const loadBookmarks = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await fetchBookmarkTree(false);
      setTree(data);

      const rootNode = data[0];
      const categories = (rootNode?.id === '0' && rootNode.children)
        ? rootNode.children.filter((c) => !c.url)
        : data.filter((c) => !c.url);

      if (categories.length > 0) {
        const defaultBar =
          categories.find((c) => c.id === '1' || c.title.includes('书签') || c.title.toLowerCase().includes('bar')) ||
          categories[0];
        setActiveRootId((prev) => (prev && categories.some((c) => c.id === prev) ? prev : defaultBar.id));
      }
    } catch (err) {
      console.error('加载书签失败:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
    const unsubscribe = subscribeBookmarkChanges(() => {
      loadBookmarks();
    });
    return () => unsubscribe();
  }, [loadBookmarks]);

  // 打开书签链接（在主浏览器窗口活动标签页导航打开）
  const handleOpenBookmark = useCallback((url: string, forceNewTab = false) => {
    if (!url) return;
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      if (forceNewTab) {
        chrome.tabs.create({ url });
      } else {
        chrome.windows?.getAll({ populate: true, windowTypes: ['normal'] }, (windows) => {
          const normalWins = windows ? windows.filter((w) => w.type === 'normal') : [];
          const lastWin = normalWins[normalWins.length - 1];
          const activeTab = lastWin?.tabs?.find((t) => t.active);

          if (activeTab?.id) {
            chrome.tabs.update(activeTab.id, { url });
            if (lastWin.id) {
              chrome.windows.update(lastWin.id, { focused: true });
            }
          } else {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0]?.id) {
                chrome.tabs.update(tabs[0].id, { url });
              } else {
                chrome.tabs.create({ url });
              }
            });
          }
        });
      }
    } else {
      window.open(url, forceNewTab ? '_blank' : '_self');
    }
  }, []);

  // 顶层大分类集合
  const rootCategories = useMemo(() => {
    if (!tree || tree.length === 0) return [];
    const rootNode = tree[0];
    if (rootNode?.id === '0' && rootNode.children) {
      return rootNode.children.filter((c) => !c.url);
    }
    return tree.filter((c) => !c.url);
  }, [tree]);

  // 当前活跃根分类节点
  const activeRootNode = useMemo(() => {
    return rootCategories.find((c) => c.id === activeRootId) || rootCategories[0];
  }, [rootCategories, activeRootId]);

  // 当前文件夹节点
  const currentFolderNode = useMemo(() => {
    if (folderStack.length > 0) {
      return folderStack[folderStack.length - 1];
    }
    return activeRootNode;
  }, [folderStack, activeRootNode]);

  // 当前文件夹下的子条目
  const currentItems = useMemo(() => {
    return currentFolderNode?.children || [];
  }, [currentFolderNode]);

  // 全局书签搜索
  const searchResults: BookmarkSearchResult[] = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchBookmarksRecursive(tree, searchQuery);
  }, [tree, searchQuery]);

  // 面包屑回退
  const handleBackToBreadcrumb = (index: number) => {
    if (index === -1) {
      setFolderStack([]);
    } else {
      setFolderStack((prev) => prev.slice(0, index + 1));
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 8,
          fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
        },
      }}
    >
      <div
        className={`w-full h-screen select-none flex flex-col font-sans transition-colors overflow-hidden ${
          isDark ? 'text-white/90 bg-[#141822]' : 'text-gray-800 bg-[#f8f9fa]'
        }`}
      >
        {/* 顶部标题与工具栏 */}
        <header className="p-3 border-b border-black/8 dark:border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <img src="icon.png" alt="CrabTab" className="w-5 h-5 rounded-md object-contain" />
            <span className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              书签侧边栏
            </span>
            <Tag color={isDark ? 'blue-inverse' : 'blue'} className="text-[10px] px-1 py-0 m-0 border-0 leading-tight">
              Side Panel
            </Tag>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip title="刷新书签树" placement="bottom">
              <Button
                type="text"
                size="small"
                icon={<RefreshCw size={13} className={refreshing ? 'animate-spin text-blue-500' : ''} />}
                onClick={() => loadBookmarks(true)}
                className="w-7 h-7 flex items-center justify-center p-0 text-gray-500 hover:text-blue-500 dark:text-gray-400"
              />
            </Tooltip>
            <Tooltip title="在新标签页打开 CrabTab 起始页" placement="bottom">
              <Button
                type="text"
                size="small"
                icon={<ExternalLink size={13} />}
                onClick={() => chrome.tabs?.create({ url: chrome.runtime.getURL('index.html') })}
                className="w-7 h-7 flex items-center justify-center p-0 text-gray-500 hover:text-blue-500 dark:text-gray-400"
              />
            </Tooltip>
          </div>
        </header>

        {/* 搜索框 */}
        <div className="p-3 pb-2 shrink-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={() => {
              if (searchResults.length > 0 && searchResults[0].bookmark.url) {
                handleOpenBookmark(searchResults[0].bookmark.url);
              }
            }}
            prefix={<Search size={14} className="text-gray-400 mr-1" />}
            suffix={
              searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 hover:opacity-100 opacity-50 cursor-pointer text-gray-400"
                >
                  <X size={13} />
                </button>
              ) : null
            }
            placeholder="快速搜索全部书签..."
            allowClear={false}
            size="middle"
            className="text-xs rounded-xl"
          />
        </div>

        {searchQuery.trim() ? (
          /* 搜索结果列表 */
          <div className="flex-1 overflow-y-auto px-3 py-1 custom-scrollbar">
            <div className="text-[11px] text-gray-400 mb-2 font-medium">
              共找到 {searchResults.length} 个书签
            </div>

            {searchResults.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 opacity-40 text-center">
                <Search size={32} />
                <span className="text-xs">未找到匹配的书签</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {searchResults.map((res) => (
                  <div
                    key={res.bookmark.id}
                    onClick={() => handleOpenBookmark(res.bookmark.url || '')}
                    className={`group px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                      isDark
                        ? 'hover:bg-white/10 active:bg-white/15'
                        : 'hover:bg-black/5 active:bg-black/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ShortcutIconView
                        url={res.bookmark.url || ''}
                        title={res.bookmark.title}
                        sizeClass="w-4 h-4 shrink-0"
                        roundedClass="rounded-none"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate text-gray-900 dark:text-white/90">
                          {res.bookmark.title || res.bookmark.url}
                        </div>
                        {res.path.length > 0 && (
                          <div className="text-[10px] text-gray-400 truncate flex items-center gap-1 mt-0.5">
                            <Folder size={10} className="shrink-0 text-amber-500" fill="currentColor" />
                            <span>{res.path.join(' / ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      title="在新标签页打开"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenBookmark(res.bookmark.url || '', true);
                      }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 cursor-pointer transition-opacity"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 常规层级浏览模式 */
          <div className="flex-1 flex flex-col min-h-0">
            {/* 顶层根分类胶囊切换 */}
            {rootCategories.length > 1 && folderStack.length === 0 && (
              <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                {rootCategories.map((cat) => {
                  const isActive = cat.id === activeRootId;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveRootId(cat.id);
                        setFolderStack([]);
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isDark
                          ? 'bg-white/8 text-white/70 hover:bg-white/15 hover:text-white'
                          : 'bg-black/5 text-gray-700 hover:bg-black/10 hover:text-gray-950'
                      }`}
                    >
                      {cat.title}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 面包屑导航栏（进入子目录时展示） */}
            {folderStack.length > 0 && (
              <div className="px-3 py-1.5 flex items-center justify-between text-xs border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 flex-1 pr-2">
                  <button
                    type="button"
                    onClick={() => handleBackToBreadcrumb(-1)}
                    className="opacity-60 hover:opacity-100 truncate cursor-pointer font-medium"
                  >
                    {activeRootNode?.title || '书签栏'}
                  </button>
                  {folderStack.map((folder, idx) => (
                    <React.Fragment key={folder.id}>
                      <ChevronRight size={11} className="opacity-40 shrink-0" />
                      <button
                        type="button"
                        onClick={() => handleBackToBreadcrumb(idx)}
                        className={`truncate cursor-pointer font-medium ${
                          idx === folderStack.length - 1 ? 'text-blue-500 font-semibold' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        {folder.title}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <Button
                  type="text"
                  size="small"
                  icon={<CornerUpLeft size={12} />}
                  onClick={() => handleBackToBreadcrumb(folderStack.length - 2)}
                  className="text-xs p-1 h-6 flex items-center shrink-0"
                >
                  返回
                </Button>
              </div>
            )}

            {/* 当前目录下的条目列表 */}
            <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
              {loading ? (
                <div className="py-16 flex items-center justify-center gap-2 opacity-50 text-xs">
                  <RefreshCw size={14} className="animate-spin text-blue-500" />
                  <span>正在加载书签...</span>
                </div>
              ) : currentItems.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2 opacity-40 text-center">
                  <FolderOpen size={32} />
                  <span className="text-xs">此文件夹为空</span>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {currentItems.map((item) => {
                    const isFolder = !item.url;

                    if (isFolder) {
                      return (
                        <div
                          key={item.id}
                          onClick={() => setFolderStack((prev) => [...prev, item])}
                          className={`group px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                            isDark
                              ? 'hover:bg-white/10 active:bg-white/15'
                              : 'hover:bg-black/5 active:bg-black/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Folder size={16} className="text-amber-500 dark:text-amber-400 shrink-0" fill="currentColor" />
                            <span className="text-[13px] font-medium truncate text-gray-800 dark:text-white/90">
                              {item.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100">
                            <span className="text-[11px] tabular-nums">
                              {item.children?.length || 0}
                            </span>
                            <ChevronRight size={13} />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleOpenBookmark(item.url || '')}
                        className={`group px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                          isDark
                            ? 'hover:bg-white/10 active:bg-white/15'
                            : 'hover:bg-black/5 active:bg-black/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ShortcutIconView
                            url={item.url || ''}
                            title={item.title}
                            sizeClass="w-4 h-4 shrink-0"
                            roundedClass="rounded-none"
                          />
                          <span className="text-[13px] truncate text-gray-800 dark:text-white/90">
                            {item.title || item.url}
                          </span>
                        </div>
                        <button
                          type="button"
                          title="在新标签页打开"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenBookmark(item.url || '', true);
                          }}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 cursor-pointer transition-opacity"
                        >
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 底部信息提示 */}
        <footer className="p-2.5 px-3 border-t border-black/8 dark:border-white/10 flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
          <span>点击直接在当前标签页打开</span>
          <span className="opacity-75">按住 Ctrl / 点击图标新标签打开</span>
        </footer>
      </div>
    </ConfigProvider>
  );
};

// 挂载
function mount() {
  const rootElement = document.getElementById('sidepanel-root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <SidePanelErrorBoundary>
        <SidePanelApp />
      </SidePanelErrorBoundary>
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
