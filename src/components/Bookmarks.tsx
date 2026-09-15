import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tooltip, message } from 'antd';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  CornerUpLeft,
  Search,
  X,
  RefreshCw,
  ExternalLink,
  BookmarkCheck,
  ShieldCheck,
} from 'lucide-react';
import { BookmarkNode, Language, ThemeMode, AppSettings } from '../types';
import { i18n } from '../i18n';
import {
  fetchBookmarkTree,
  subscribeBookmarkChanges,
  searchBookmarksRecursive,
  checkBookmarkPermission,
  requestBookmarkPermission,
  isExtensionEnvironment,
  BookmarkSearchResult,
} from '../utils/bookmarks';
import { parseDomainAndOrigin } from '../utils/favicon';
import { ShortcutIconView } from './Shortcuts';

interface BookmarksProps {
  language: Language;
  theme: ThemeMode;
  glassStyle: AppSettings['glassStyle'];
  openInNewTab: boolean;
}

export const Bookmarks: React.FC<BookmarksProps> = ({
  language,
  theme,
  glassStyle,
  openInNewTab,
}) => {
  const t = i18n[language];
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState<boolean>(false);
  const [usingMock, setUsingMock] = useState<boolean>(false);
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeRootId, setActiveRootId] = useState<string>('');
  const [folderStack, setFolderStack] = useState<BookmarkNode[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const isExtension = useMemo(() => isExtensionEnvironment(), []);

  // 加载书签树
  const loadBookmarks = useCallback(async (showRefreshingSpinner = false, allowMock = false) => {
    if (showRefreshingSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchBookmarkTree(allowMock);
      setTree(data);

      // 提取顶层目录并选定默认活跃根目录
      const rootNode = data[0];
      const categories = (rootNode?.id === '0' && rootNode.children)
        ? rootNode.children.filter((c) => !c.url)
        : data.filter((c) => !c.url);
      if (categories.length > 0) {
        // 优先选中“书签栏”（id 为 '1' 或标题包含书签/Bookmark）
        const defaultBar =
          categories.find((c) => c.id === '1' || c.title.includes('书签') || c.title.toLowerCase().includes('bar')) ||
          categories[0];
        setActiveRootId((prev) => (prev && categories.some((c) => c.id === prev) ? prev : defaultBar.id));
      }
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
      if (showRefreshingSpinner) {
        setTimeout(() => setRefreshing(false), 400);
      }
    }
  }, []);

  // 检查权限状态
  useEffect(() => {
    let mounted = true;
    async function checkPerm() {
      const perm = await checkBookmarkPermission();
      if (!mounted) return;
      setHasPermission(perm);
      if (perm) {
        loadBookmarks(false, false);
      } else {
        setLoading(false);
      }
    }
    checkPerm();
    return () => {
      mounted = false;
    };
  }, [loadBookmarks]);

  useEffect(() => {
    if (!hasPermission) return;
    // 监听原生浏览器书签变动实时同步
    const unsubscribe = subscribeBookmarkChanges(() => {
      loadBookmarks(false, usingMock);
    });
    return () => {
      unsubscribe();
    };
  }, [hasPermission, usingMock, loadBookmarks]);

  // 处理权限申请
  const handleRequestPermission = async () => {
    setRequesting(true);
    try {
      const granted = await requestBookmarkPermission();
      setRequesting(false);
      if (granted) {
        setHasPermission(true);
        message.success(t.bookmarkPermissionSuccess);
        loadBookmarks(false, false);
      } else {
        message.warning(t.bookmarkPermissionDenied);
      }
    } catch {
      setRequesting(false);
      message.warning(t.bookmarkPermissionDenied);
    }
  };

  // 在网页调试环境下允许查看演示书签
  const handleLoadDemo = () => {
    setUsingMock(true);
    setHasPermission(true);
    loadBookmarks(false, true);
  };

  // 顶层主分类列表（如书签栏、其他书签、移动设备书签）
  const topCategories = useMemo(() => {
    if (!tree.length) return [];
    const rootNode = tree[0];
    if (rootNode?.id === '0' && rootNode.children) {
      return rootNode.children.filter((c) => !c.url);
    }
    return tree.filter((c) => !c.url);
  }, [tree]);

  // 当前活跃顶级目录节点
  const activeRootFolder = useMemo(() => {
    if (!topCategories.length) return null;
    return topCategories.find((c) => c.id === activeRootId) || topCategories[0];
  }, [topCategories, activeRootId]);

  // 当前正在浏览的目标目录节点
  const currentFolder = useMemo(() => {
    if (folderStack.length > 0) {
      return folderStack[folderStack.length - 1];
    }
    return activeRootFolder;
  }, [folderStack, activeRootFolder]);

  // 当前目录下的子文件夹与书签分离
  const { subfolders, bookmarks } = useMemo(() => {
    if (!currentFolder || !currentFolder.children) {
      return { subfolders: [], bookmarks: [] };
    }
    const folders: BookmarkNode[] = [];
    const bms: BookmarkNode[] = [];

    for (const item of currentFolder.children) {
      if (item.url) {
        bms.push(item);
      } else {
        folders.push(item);
      }
    }
    return { subfolders: folders, bookmarks: bms };
  }, [currentFolder]);

  // 全局递归搜索匹配结果
  const searchResults: BookmarkSearchResult[] = useMemo(() => {
    if (!searchQuery.trim() || !tree.length) return [];
    return searchBookmarksRecursive(tree, searchQuery);
  }, [tree, searchQuery]);

  // 切换顶级分类
  const handleSelectRoot = (catId: string) => {
    setActiveRootId(catId);
    setFolderStack([]);
    setSearchQuery('');
  };

  // 钻取进入子文件夹
  const handleEnterFolder = (folder: BookmarkNode) => {
    setFolderStack((prev) => [...prev, folder]);
  };

  // 面包屑返回至指定层级
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setFolderStack([]);
    } else {
      setFolderStack((prev) => prev.slice(0, index + 1));
    }
  };

  // 返回上一级
  const handleBackToParent = () => {
    setFolderStack((prev) => prev.slice(0, prev.length - 1));
  };

  // 打开书签链接
  const handleOpenBookmark = (url?: string) => {
    if (!url) return;
    if (openInNewTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  };

  // 搜索结果中点击路径直接定位到该文件夹
  const handleNavigateToPath = (result: BookmarkSearchResult) => {
    // 找出匹配该书签 parentId 的节点链路
    if (!result.bookmark.parentId) return;
    const pathNodes: BookmarkNode[] = [];

    const findParentChain = (node: BookmarkNode, targetParentId: string): boolean => {
      if (node.id === targetParentId) {
        pathNodes.unshift(node);
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (findParentChain(child, targetParentId)) {
            if (node.id !== '0') {
              pathNodes.unshift(node);
            }
            return true;
          }
        }
      }
      return false;
    };

    if (tree[0]) {
      findParentChain(tree[0], result.bookmark.parentId);
    }

    if (pathNodes.length > 0) {
      const topCat = pathNodes[0];
      setActiveRootId(topCat.id);
      setFolderStack(pathNodes.slice(1));
      setSearchQuery('');
    }
  };

  // 当未获得书签权限时，展示授权提示卡片
  if (hasPermission === false && !usingMock) {
    return (
      <div
        className="w-full max-w-xl mx-auto flex flex-col transition-all duration-300 pointer-events-auto"
        style={{
          borderRadius:
            glassStyle.radius === '3xl'
              ? '28px'
              : glassStyle.radius === '2xl'
              ? '24px'
              : glassStyle.radius === 'xl'
              ? '20px'
              : '16px',
        }}
      >
        <div
          className={`w-full border rounded-2xl p-6 sm:p-10 shadow-xl transition-all duration-300 flex flex-col items-center text-center ${
            isDark
              ? 'bg-black/40 border-white/15 text-white shadow-black/40'
              : 'bg-white/65 border-white/60 text-gray-900 shadow-gray-900/10'
          }`}
          style={{
            backdropFilter: `blur(${glassStyle.blur}px)`,
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-500 dark:text-blue-400 mb-4 shadow-inner">
            <BookmarkCheck size={32} />
          </div>

          <h3 className="text-base sm:text-lg font-semibold mb-2">
            {t.bookmarkPermissionTitle}
          </h3>

          <p
            className={`text-xs sm:text-sm max-w-md leading-relaxed mb-6 ${
              isDark ? 'text-white/65' : 'text-gray-600'
            }`}
          >
            {t.bookmarkPermissionDesc}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              disabled={requesting}
              onClick={handleRequestPermission}
              className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck size={16} />
              <span>{requesting ? `${t.bookmarkPermissionGrantBtn}...` : t.bookmarkPermissionGrantBtn}</span>
            </button>

            {!isExtension && (
              <button
                type="button"
                onClick={handleLoadDemo}
                className={`px-4 py-2.5 rounded-xl border text-xs sm:text-sm transition-all cursor-pointer ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 border-white/15 text-white/80'
                    : 'bg-white/80 hover:bg-white border-black/10 text-gray-700'
                }`}
              >
                {t.bookmarkPermissionDemoBtn}
              </button>
            )}
          </div>

          {!isExtension && (
            <div className="mt-4 text-[11px] text-amber-500/80 flex items-center gap-1.5">
              <span>{t.bookmarkWebEnvNotice}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-5xl mx-auto flex flex-col transition-all duration-300 pointer-events-auto"
      style={{
        borderRadius:
          glassStyle.radius === '3xl'
            ? '28px'
            : glassStyle.radius === '2xl'
            ? '24px'
            : glassStyle.radius === 'xl'
            ? '20px'
            : '16px',
      }}
    >
      {/* 顶部工具栏：分类药丸 / 面包屑 + 搜索框 + 刷新 */}
      <div
        className={`px-4 py-3 sm:px-5 sm:py-3.5 border rounded-2xl mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg transition-all duration-200 ${
          isDark
            ? 'bg-black/35 border-white/15 text-white shadow-black/30'
            : 'bg-white/55 border-white/60 text-gray-800 shadow-gray-900/5'
        }`}
        style={{
          backdropFilter: `blur(${glassStyle.blur}px)`,
        }}
      >
        {/* 左侧：分类切换与层级面包屑 */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5 sm:pb-0 min-w-0 flex-1">
          {/* 若在子文件夹内，显示返回上一级按钮 */}
          {folderStack.length > 0 && !searchQuery && (
            <button
              type="button"
              onClick={handleBackToParent}
              title={t.backToParentFolder}
              className={`p-1.5 rounded-lg flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 border-white/10 text-white/90'
                  : 'bg-white/70 hover:bg-white border-black/10 text-gray-700'
              }`}
            >
              <CornerUpLeft size={14} className="shrink-0" />
            </button>
          )}

          {/* 顶层分类选择（根目录且无搜索时） */}
          {folderStack.length === 0 && !searchQuery ? (
            <div className="flex items-center gap-1.5 shrink-0">
              {topCategories.map((cat) => {
                const isSelected = cat.id === activeRootFolder?.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectRoot(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-all cursor-pointer select-none border ${
                      isSelected
                        ? isDark
                          ? 'bg-white/25 border-white/30 text-white shadow-sm'
                          : 'bg-white border-black/10 text-gray-900 shadow-sm'
                        : isDark
                        ? 'bg-transparent border-transparent text-white/60 hover:text-white hover:bg-white/10'
                        : 'bg-transparent border-transparent text-gray-500 hover:text-gray-900 hover:bg-black/5'
                    }`}
                  >
                    <Folder size={14} className={isSelected ? 'text-amber-400' : 'opacity-70'} />
                    <span>{cat.title || t.rootBookmarks}</span>
                  </button>
                );
              })}
            </div>
          ) : !searchQuery ? (
            /* 面包屑钻取路径 */
            <nav className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap min-w-0">
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(-1)}
                className={`font-medium transition-colors cursor-pointer hover:underline truncate max-w-[120px] ${
                  isDark ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {activeRootFolder?.title || t.rootBookmarks}
              </button>

              {folderStack.map((folder, idx) => {
                const isLast = idx === folderStack.length - 1;
                return (
                  <React.Fragment key={folder.id}>
                    <ChevronRight size={13} className="shrink-0 opacity-40" />
                    {isLast ? (
                      <span
                        className={`font-semibold truncate max-w-[160px] ${
                          isDark ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        {folder.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBreadcrumbClick(idx)}
                        className={`font-medium transition-colors cursor-pointer hover:underline truncate max-w-[120px] ${
                          isDark ? 'text-white/70 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {folder.title}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          ) : (
            /* 搜索模式状态指示 */
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium">
              <Search size={14} className="text-blue-400 shrink-0" />
              <span>
                {searchResults.length > 0
                  ? t.itemsCount.replace('{count}', String(searchResults.length))
                  : t.noBookmarksFound}
              </span>
            </div>
          )}
        </div>

        {/* 右侧：书签搜索与手动刷新 */}
        <div className="flex items-center gap-2 shrink-0">
          {/* 实时搜索框 */}
          <div
            className={`relative flex items-center w-full sm:w-56 px-2.5 py-1.5 rounded-xl border transition-all ${
              isDark
                ? 'bg-black/25 border-white/15 focus-within:border-blue-400/80 focus-within:bg-black/40'
                : 'bg-white/70 border-black/10 focus-within:border-blue-500 focus-within:bg-white'
            }`}
          >
            <Search size={14} className={`shrink-0 mr-1.5 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchBookmarksPlaceholder}
              className="w-full bg-transparent text-xs sm:text-sm focus:outline-none placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-0.5 hover:opacity-100 opacity-60 transition-opacity cursor-pointer ml-1"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 刷新书签树按钮 */}
          <Tooltip title={t.refreshBookmarks} placement="bottom">
            <button
              type="button"
              onClick={() => loadBookmarks(true)}
              className={`p-2 rounded-xl flex items-center justify-center border transition-all cursor-pointer ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 border-white/10 text-white/80 hover:text-white'
                  : 'bg-white/70 hover:bg-white border-black/10 text-gray-700 hover:text-gray-900'
              }`}
            >
              <RefreshCw
                size={14}
                className={`transition-transform duration-700 ${refreshing ? 'animate-spin text-blue-400' : ''}`}
              />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 书签内容展示区 */}
      <div
        className={`w-full border rounded-2xl p-3 sm:p-5 shadow-xl transition-all duration-300 max-h-[min(52vh,540px)] overflow-y-auto custom-scrollbar flex flex-col gap-4 ${
          isDark
            ? 'bg-black/40 border-white/15 text-white shadow-black/40'
            : 'bg-white/55 border-white/60 text-gray-900 shadow-gray-900/10'
        }`}
        style={{
          backdropFilter: `blur(${glassStyle.blur}px)`,
        }}
      >
        {loading ? (
          /* 加载中状态骨架 */
          <div className="py-12 flex flex-col items-center justify-center gap-3 opacity-60">
            <RefreshCw size={24} className="animate-spin text-blue-400" />
            <span className="text-xs">{t.refreshBookmarks}...</span>
          </div>
        ) : searchQuery.trim() ? (
          /* 搜索结果视图 */
          searchResults.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 opacity-60 select-none">
              <Search size={36} className="text-gray-400 mb-1" />
              <div className="text-sm font-medium">{t.noBookmarksFound}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {searchResults.map((result) => {
                const { domain } = parseDomainAndOrigin(result.bookmark.url || '');
                return (
                  <div
                    key={result.bookmark.id}
                    onClick={() => handleOpenBookmark(result.bookmark.url)}
                    className={`group p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all duration-200 cursor-pointer select-none ${
                      isDark
                        ? 'bg-white/[0.04] hover:bg-white/[0.12] border-white/10 hover:border-white/30'
                        : 'bg-white/60 hover:bg-white/95 border-black/5 hover:border-black/15 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ShortcutIconView
                        url={result.bookmark.url || ''}
                        title={result.bookmark.title}
                        sizeClass="w-6 h-6 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-medium truncate group-hover:text-blue-400 transition-colors">
                          {result.bookmark.title || domain || 'Untitled'}
                        </div>
                        {result.path.length > 0 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateToPath(result);
                            }}
                            title={`${t.bookmarkPathPrefix}: ${result.path.join(' > ')}`}
                            className={`text-[11px] truncate flex items-center gap-1 mt-0.5 hover:underline cursor-pointer ${
                              isDark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'
                            }`}
                          >
                            <Folder size={10} className="shrink-0 text-amber-400" />
                            <span>{result.path.join(' / ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ExternalLink
                      size={12}
                      className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                    />
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* 常规目录与书签分层视图 */
          <>
            {/* 1. 子文件夹展示区域（精致胶囊设计，极高空间利用率） */}
            {subfolders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                {subfolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => handleEnterFolder(folder)}
                    title={folder.title}
                    className={`group px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border inline-flex items-center gap-2 transition-all duration-200 cursor-pointer select-none max-w-[200px] sm:max-w-[240px] active:scale-98 ${
                      isDark
                        ? 'bg-white/[0.06] hover:bg-white/[0.14] border-white/12 hover:border-amber-400/50 text-white/90 hover:text-white shadow-xs'
                        : 'bg-white/75 hover:bg-white border-black/8 hover:border-amber-500/50 text-gray-800 shadow-xs hover:shadow-md'
                    }`}
                  >
                    <Folder
                      size={14}
                      className="shrink-0 text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform"
                    />
                    <span className="text-xs sm:text-sm font-medium truncate">
                      {folder.title}
                    </span>
                    <ChevronRight
                      size={12}
                      className="shrink-0 opacity-30 group-hover:opacity-80 group-hover:translate-x-0.5 transition-all -mr-0.5"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* 若同时存在文件夹与书签，显示细微内敛分割线 */}
            {subfolders.length > 0 && bookmarks.length > 0 && (
              <div className={`w-full h-px my-1 ${isDark ? 'bg-white/10' : 'bg-black/5'}`} />
            )}

            {/* 2. 书签项目网格 */}
            {bookmarks.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-2.5">
                {bookmarks.map((bm) => {
                  const { domain } = parseDomainAndOrigin(bm.url || '');
                  return (
                    <div
                      key={bm.id}
                      onClick={() => handleOpenBookmark(bm.url)}
                      title={`${bm.title}\n${bm.url}`}
                      className={`group p-2 sm:p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all duration-200 cursor-pointer select-none active:scale-98 ${
                        isDark
                          ? 'bg-white/[0.03] hover:bg-white/[0.12] border-white/10 hover:border-white/25'
                          : 'bg-white/65 hover:bg-white border-black/6 hover:border-black/15 shadow-xs hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ShortcutIconView
                          url={bm.url || ''}
                          title={bm.title}
                          sizeClass="w-5 h-5 sm:w-6 sm:h-6 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-medium truncate group-hover:text-blue-400 transition-colors leading-tight">
                            {bm.title || domain || 'Untitled'}
                          </div>
                          {domain && (
                            <div
                              className={`text-[10px] sm:text-[11px] truncate mt-0.5 leading-none ${
                                isDark ? 'text-white/40' : 'text-gray-400'
                              }`}
                            >
                              {domain}
                            </div>
                          )}
                        </div>
                      </div>
                      <ExternalLink
                        size={11}
                        className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                      />
                    </div>
                  );
                })}
              </div>
            )}


            {/* 3. 目录为空状态 */}
            {subfolders.length === 0 && bookmarks.length === 0 && (
              <div className="py-16 flex flex-col items-center justify-center gap-2 opacity-50 select-none">
                <FolderOpen size={36} className="mb-1" />
                <div className="text-sm">{t.emptyBookmarkFolder}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
