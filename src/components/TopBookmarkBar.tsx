import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Folder,
  Search,
  RefreshCw,
  ExternalLink,
  X,
  AlertCircle,
} from 'lucide-react';
import { Dropdown, Tooltip, Modal } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { BookmarkNode, Language, ThemeMode, GlassStyle } from '../types';
import { ShortcutIconView } from './Shortcuts';
import {
  fetchBookmarkTree,
  subscribeBookmarkChanges,
  searchBookmarksRecursive,
  checkBookmarkPermission,
  isExtensionEnvironment,
  BookmarkSearchResult,
} from '../utils/bookmarks';
import { i18n } from '../i18n';

export interface TopBookmarkBarProps {
  language: Language;
  theme: ThemeMode;
  glassStyle: GlassStyle;
  openInNewTab: boolean;
}

export const TopBookmarkBar: React.FC<TopBookmarkBarProps> = ({
  language,
  theme,
  glassStyle,
  openInNewTab,
}) => {
  const t = i18n[language];
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);

  // 快速搜索弹窗状态
  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadBookmarks = useCallback(async () => {
    try {
      const hasPerm = await checkBookmarkPermission();
      setPermissionGranted(hasPerm);

      const isExt = isExtensionEnvironment();
      const nodes = await fetchBookmarkTree(!isExt);
      setTree(nodes || []);
    } catch (err) {
      console.error('Failed to load bookmark tree:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
    const unsubscribe = subscribeBookmarkChanges(() => {
      loadBookmarks();
    });
    return () => {
      unsubscribe();
    };
  }, [loadBookmarks]);

  const handleOpenBookmark = useCallback(
    (url: string) => {
      if (!url) return;
      if (openInNewTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = url;
      }
      if (searchModalOpen) {
        setSearchModalOpen(false);
      }
    },
    [openInNewTab, searchModalOpen]
  );

  // 解析并分离「书签栏」主要项目与「其他书签」
  const { barItems, otherFolder } = useMemo(() => {
    if (!tree || tree.length === 0) {
      return { barItems: [] as BookmarkNode[], otherFolder: null as BookmarkNode | null };
    }

    const root = tree[0];
    const rootChildren = root.children || [];

    if (rootChildren.length === 0) {
      return { barItems: root.url ? [root] : [], otherFolder: null };
    }

    // 优先匹配标准书签栏（id 为 "1" 或名称匹配）
    let barNode = rootChildren.find(
      (c) => c.id === '1' || /书签栏|收藏夹栏|bookmarks bar/i.test(c.title || '')
    );

    if (!barNode && rootChildren.length > 0) {
      barNode = rootChildren[0];
    }

    // 匹配其他书签（id 为 "2" 或名称匹配）
    const otherNode = rootChildren.find(
      (c) => c.id === '2' || /其他书签|其他收藏夹|other bookmarks/i.test(c.title || '')
    );

    return {
      barItems: barNode?.children || [],
      otherFolder:
        otherNode && otherNode.children && otherNode.children.length > 0 ? otherNode : null,
    };
  }, [tree]);

  // 递归构建 Ant Design 级联菜单树
  const buildMenuItems = useCallback(
    (nodes: BookmarkNode[]): ItemType[] => {
      return nodes.map((node) => {
        if (node.url) {
          return {
            key: node.id,
            label: (
              <div
                className="flex items-center gap-2 py-0.5 max-w-[280px] select-none"
                title={`${node.title}\n${node.url}`}
              >
                <ShortcutIconView
                  url={node.url}
                  title={node.title}
                  sizeClass="w-4 h-4 shrink-0"
                />
                <span className="truncate text-xs text-inherit">{node.title || node.url}</span>
              </div>
            ),
            onClick: () => handleOpenBookmark(node.url!),
          };
        }

        const childItems =
          node.children && node.children.length > 0
            ? buildMenuItems(node.children)
            : [
                {
                  key: `${node.id}-empty`,
                  label: (
                    <span className="text-xs opacity-50 px-2 py-1 select-none">
                      {t.emptyBookmarkFolder}
                    </span>
                  ),
                  disabled: true,
                },
              ];

        return {
          key: node.id,
          label: (
            <div className="flex items-center gap-2 py-0.5 max-w-[280px] select-none">
              <Folder size={14} className="text-amber-500 dark:text-amber-400 shrink-0" fill="currentColor" />
              <span className="truncate text-xs font-medium text-inherit">{node.title}</span>
            </div>
          ),
          children: childItems,
          popupClassName: 'crab-bookmark-dropdown',
        };
      });
    },
    [handleOpenBookmark, t.emptyBookmarkFolder]
  );

  // 搜索结果集
  // 滚动容器引用与滚轮横向滚动支持
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasScroll = el.scrollWidth > el.clientWidth;
    setCanScrollLeft(hasScroll && el.scrollLeft > 4);
    setCanScrollRight(hasScroll && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, barItems]);

  // 滚轮平滑插值与动量控制器
  const wheelTargetRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);

  // 鼠标拖拽滑动状态管理
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const hasDraggedRef = useRef<boolean>(false);
  const momentumAnimRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (momentumAnimRef.current) cancelAnimationFrame(momentumAnimRef.current);
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
    };
  }, []);

  // 滚轮横向极速丝滑滚动（高响应步进与触控板平滑自适应）
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;

      let rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (rawDelta === 0) return;

      e.preventDefault();

      if (e.deltaMode === 1) {
        rawDelta *= 36;
      } else if (e.deltaMode === 2) {
        rawDelta *= el.clientWidth;
      }

      if (momentumAnimRef.current) {
        cancelAnimationFrame(momentumAnimRef.current);
        momentumAnimRef.current = null;
      }

      const isTouchpad = Math.abs(rawDelta) < 35 && e.deltaMode === 0;

      if (isTouchpad) {
        if (wheelRafRef.current) {
          cancelAnimationFrame(wheelRafRef.current);
          wheelRafRef.current = null;
        }
        wheelTargetRef.current = null;
        el.scrollLeft += rawDelta * 1.25;
        checkScroll();
        return;
      }

      // 标签栏单书签宽度约 90-130px，一档滚轮 (~100) 对应推进约 180px（约 1.5 ~ 2 个书签）
      const multiplier = 1.8;
      const maxScroll = el.scrollWidth - el.clientWidth;

      if (wheelTargetRef.current === null) {
        wheelTargetRef.current = el.scrollLeft;
      }

      wheelTargetRef.current = Math.max(0, Math.min(maxScroll, wheelTargetRef.current + rawDelta * multiplier));

      const stepWheel = () => {
        if (!scrollContainerRef.current || wheelTargetRef.current === null) {
          wheelRafRef.current = null;
          return;
        }

        const current = scrollContainerRef.current.scrollLeft;
        const target = wheelTargetRef.current;
        const diff = target - current;

        if (Math.abs(diff) < 0.8) {
          scrollContainerRef.current.scrollLeft = target;
          wheelTargetRef.current = null;
          wheelRafRef.current = null;
          checkScroll();
          return;
        }

        scrollContainerRef.current.scrollLeft += diff * 0.22;
        checkScroll();
        wheelRafRef.current = requestAnimationFrame(stepWheel);
      };

      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(stepWheel);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
    };
  }, [checkScroll]);

  // 鼠标拖拽捕获与惯性滚动
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || dragRef.current.pointerId !== -1) return;
    const el = scrollContainerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    if (wheelRafRef.current) {
      cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
      wheelTargetRef.current = null;
    }
    if (momentumAnimRef.current) {
      cancelAnimationFrame(momentumAnimRef.current);
      momentumAnimRef.current = null;
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
    };
    hasDraggedRef.current = false;
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const distance = e.clientX - dragRef.current.startX;

    if (!hasDraggedRef.current && Math.abs(distance) > 4) {
      hasDraggedRef.current = true;
      setIsDragging(true);
    }

    if (hasDraggedRef.current) {
      const now = performance.now();
      const dt = Math.max(now - dragRef.current.lastTime, 1);
      const dx = e.clientX - dragRef.current.lastX;
      dragRef.current.velocity = dx / dt;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastTime = now;

      el.scrollLeft = dragRef.current.startScrollLeft - distance;
      checkScroll();
    }
  };

  const stopDragging = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    const el = scrollContainerRef.current;
    if (el && e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    dragRef.current.pointerId = -1;

    if (hasDraggedRef.current) {
      setIsDragging(false);

      const initialVelocity = dragRef.current.velocity;
      if (el && Math.abs(initialVelocity) > 0.12) {
        let currentSpeed = initialVelocity * 15;
        const friction = 0.94;

        const momentumStep = () => {
          if (!scrollContainerRef.current || Math.abs(currentSpeed) < 0.5) {
            momentumAnimRef.current = null;
            checkScroll();
            return;
          }
          scrollContainerRef.current.scrollLeft -= currentSpeed;
          currentSpeed *= friction;
          checkScroll();
          momentumAnimRef.current = requestAnimationFrame(momentumStep);
        };

        if (momentumAnimRef.current) cancelAnimationFrame(momentumAnimRef.current);
        momentumAnimRef.current = requestAnimationFrame(momentumStep);
      }

      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 80);
    } else {
      setIsDragging(false);
      hasDraggedRef.current = false;
    }
  };

  const searchResults: BookmarkSearchResult[] = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchBookmarksRecursive(tree, searchQuery);
  }, [tree, searchQuery]);

  return (
    <>
      {/* 顶部极简吸顶/轻量悬浮书签栏（自适应内容宽度与最大可用宽度，数量多时横向滚动） */}
      <div className="w-fit max-w-full min-w-0 pointer-events-auto transition-all duration-300">
        <div
          className={`h-9 xl:h-10 px-1.5 sm:px-2.5 xl:px-3.5 rounded-2xl border flex items-center justify-between gap-1 shadow-sm transition-all duration-200 select-none max-w-full ${
            isDark
              ? 'bg-black/35 hover:bg-black/45 border-white/12 text-white/90 shadow-black/20'
              : 'bg-white/65 hover:bg-white/80 border-black/8 text-gray-800 shadow-black/5'
          }`}
          style={{
            backdropFilter: `blur(${glassStyle.blur}px)`,
          }}
        >
          {/* 左侧：可水平平滑滚动的书签/文件夹区域 */}
          <div className="relative flex-1 min-w-0 flex items-center overflow-hidden">
            {/* 左侧平滑微渐变遮罩 */}
            {canScrollLeft && (
              <div
                className={`absolute left-0 top-0 bottom-0 w-4 z-10 pointer-events-none transition-opacity duration-200 ${
                  isDark
                    ? 'bg-gradient-to-r from-[#141820]/90 to-transparent'
                    : 'bg-gradient-to-r from-white/90 to-transparent'
                }`}
              />
            )}

            {/* 核心横向滚动列表 */}
            <div
              ref={scrollContainerRef}
              onScroll={checkScroll}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onClickCapture={(e) => {
                if (hasDraggedRef.current) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
              className={`flex-1 min-w-0 flex items-center gap-0.5 xl:gap-1 overflow-x-auto scrollbar-none py-1 overscroll-contain select-none transition-[cursor] ${
                isDragging
                  ? 'cursor-grabbing'
                  : canScrollLeft || canScrollRight
                    ? 'cursor-grab'
                    : 'cursor-default'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-1.5 px-2 text-xs xl:text-sm opacity-50">
                  <RefreshCw size={12} className="animate-spin text-blue-400" />
                  <span>{t.refreshBookmarks}...</span>
                </div>
              ) : !permissionGranted ? (
                <div className="flex items-center gap-1 px-2 text-xs xl:text-sm text-amber-500">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{t.bookmarkPermissionNotGranted}</span>
                </div>
              ) : barItems.length === 0 ? (
                <div className="px-2 text-xs xl:text-sm opacity-40 italic">{t.bookmarkBarEmpty}</div>
              ) : (
                barItems.map((item) => {
                  // 1. 文件夹项：触发下拉/级联菜单
                  if (!item.url) {
                    const menuItems = buildMenuItems(item.children || []);
                    return (
                      <Dropdown
                        key={item.id}
                        menu={{ items: menuItems, className: 'crab-bookmark-dropdown-menu' }}
                        trigger={['click', 'hover']}
                        mouseEnterDelay={0.08}
                        mouseLeaveDelay={0.15}
                        rootClassName="crab-bookmark-dropdown"
                        overlayClassName="crab-bookmark-dropdown"
                        placement="bottomLeft"
                      >
                        <button
                          type="button"
                          className={`px-1.5 py-1 xl:px-2 xl:py-1.5 rounded-lg flex items-center gap-1 xl:gap-1.5 text-xs xl:text-[13px] font-medium shrink-0 transition-all ${
                            isDragging ? 'pointer-events-none' : 'cursor-pointer'
                          } ${
                            isDark
                              ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                              : 'hover:bg-black/8 text-gray-700 hover:text-gray-900 active:bg-black/12'
                          }`}
                        >
                          <Folder
                            size={14}
                            className="text-amber-500 dark:text-amber-400 shrink-0"
                            fill="currentColor"
                          />
                          <span className="truncate max-w-[130px] xl:max-w-[180px]">{item.title}</span>
                        </button>
                      </Dropdown>
                    );
                  }

                  // 2. 单个直达书签项：点击直接打开
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleOpenBookmark(item.url || '')}
                      title={`${item.title}\n${item.url}`}
                      className={`px-1.5 py-1 xl:px-2 xl:py-1.5 rounded-lg flex items-center gap-1 xl:gap-1.5 text-xs xl:text-[13px] shrink-0 transition-all ${
                        isDragging ? 'pointer-events-none' : 'cursor-pointer'
                      } ${
                        isDark
                          ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                          : 'hover:bg-black/8 text-gray-700 hover:text-gray-900 active:bg-black/12'
                      }`}
                    >
                      <ShortcutIconView
                        url={item.url || ''}
                        title={item.title}
                        sizeClass="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0"
                      />
                      <span className="truncate max-w-[140px] xl:max-w-[200px]">
                        {item.title || item.url || 'Untitled'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* 右侧平滑微渐变遮罩 */}
            {canScrollRight && (
              <div
                className={`absolute right-0 top-0 bottom-0 w-4 z-10 pointer-events-none transition-opacity duration-200 ${
                  isDark
                    ? 'bg-gradient-to-l from-[#141820]/90 to-transparent'
                    : 'bg-gradient-to-l from-white/90 to-transparent'
                }`}
              />
            )}
          </div>

          {/* 右侧固定功能区：「其他书签」+「快速搜索书签」 */}
          <div
            className={`shrink-0 flex items-center gap-0.5 pl-1 border-l ${
              isDark ? 'border-white/10' : 'border-black/10'
            }`}
          >
            {otherFolder && (
              <Dropdown
                menu={{ items: buildMenuItems(otherFolder.children || []), className: 'crab-bookmark-dropdown-menu' }}
                trigger={['click', 'hover']}
                mouseEnterDelay={0.08}
                mouseLeaveDelay={0.15}
                rootClassName="crab-bookmark-dropdown"
                overlayClassName="crab-bookmark-dropdown"
                placement="bottomRight"
              >
                <button
                  type="button"
                  className={`px-1.5 py-1 xl:px-2 xl:py-1.5 rounded-lg flex items-center gap-1 xl:gap-1.5 text-xs xl:text-[13px] font-medium shrink-0 transition-all cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-900'
                  }`}
                >
                  <Folder
                    size={14}
                    className="text-amber-500 dark:text-amber-400 shrink-0"
                    fill="currentColor"
                  />
                  <span>{otherFolder.title || t.otherBookmarks}</span>
                </button>
              </Dropdown>
            )}

            <Tooltip title={t.quickSearchBookmarks} placement="bottom">
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className={`w-7 h-7 xl:w-8 xl:h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isDark
                    ? 'hover:bg-white/15 text-white/70 hover:text-white'
                    : 'hover:bg-black/8 text-gray-600 hover:text-gray-900'
                }`}
              >
                <Search size={13} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* 快捷书签搜索模态窗（单层毛玻璃极简 Spotlight 风格） */}
      <Modal
        open={searchModalOpen}
        onCancel={() => {
          setSearchModalOpen(false);
          setSearchQuery('');
        }}
        footer={null}
        closable={false}
        width={560}
        destroyOnClose
        centered
        className="crab-bookmark-search-modal"
        styles={{
          mask: { backdropFilter: 'blur(4px)' },
          body: { padding: 0 },
        }}
      >
        <div className="flex flex-col max-h-[520px]">
          {/* 搜索输入栏 */}
          <div
            className={`p-3.5 flex items-center gap-2.5 border-b ${
              isDark ? 'border-white/10' : 'border-black/5'
            }`}
          >
            <Search size={16} className={isDark ? 'text-white/40' : 'text-gray-400'} />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchBookmarksPlaceholder}
              className={`flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 hover:opacity-100 opacity-50 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                isDark
                  ? 'bg-white/10 border-white/15 text-white/60'
                  : 'bg-black/5 border-black/10 text-gray-500'
              }`}
            >
              ESC
            </span>
          </div>

          {/* 搜索结果列表 */}
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar max-h-[440px]">
            {!searchQuery.trim() ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 opacity-40 select-none">
                <Search size={32} />
                <span className="text-xs">{t.searchBookmarksPlaceholder}</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 opacity-40 select-none">
                <span className="text-xs">{t.noBookmarksFound}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {searchResults.map((res) => (
                  <div
                    key={res.bookmark.id}
                    onClick={() => handleOpenBookmark(res.bookmark.url || '')}
                    className={`p-2.5 rounded-xl flex items-center justify-between gap-2.5 transition-colors cursor-pointer select-none ${
                      isDark
                        ? 'hover:bg-white/10 active:bg-white/15'
                        : 'hover:bg-black/5 active:bg-black/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ShortcutIconView
                        url={res.bookmark.url || ''}
                        title={res.bookmark.title}
                        sizeClass="w-5 h-5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-xs font-medium truncate ${
                            isDark ? 'text-white/90' : 'text-gray-900'
                          }`}
                        >
                          {res.bookmark.title || res.bookmark.url}
                        </div>
                        {res.path.length > 0 && (
                          <div className="text-[10px] opacity-50 truncate mt-0.5 flex items-center gap-1">
                            <Folder size={10} className="shrink-0 text-amber-400" fill="currentColor" />
                            <span>{res.path.join(' / ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ExternalLink size={12} className="shrink-0 opacity-40" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
