import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dropdown, Tooltip, Popover, Switch, Slider } from 'antd';
import type { MenuProps } from 'antd';
import {
  Search,
  ChevronDown,
  X,
  History,
  Trash2,
  ArrowUpRight,
  Bookmark,
  Clock,
  Check,
  SlidersHorizontal,
  MoveVertical,
  RotateCcw,
} from 'lucide-react';
import { SearchEngineId, SuggestionEngineId, Language, BrowserHistoryItem } from '../types';
import { SEARCH_ENGINES } from '../constants';
import { i18n } from '../i18n';
import { fetchSearchSuggestions } from '../utils/searchSuggestions';
import { searchBookmarks, BookmarkSearchResult } from '../utils/bookmarks';
import { searchBrowserHistory } from '../utils/history';
import { SearchEngineIcon } from './SearchEngineIcons';
import { ShortcutIconView } from './Shortcuts';

interface SearchBoxProps {
  currentEngineId: SearchEngineId;
  suggestionEngine?: SuggestionEngineId;
  searchHistory: string[];
  searchBookmarks?: boolean;
  searchHistoryEnabled?: boolean;
  verticalOffset?: number;
  openInNewTab?: boolean;
  language: Language;
  theme: 'dark' | 'light' | 'auto';
  glassStyle: {
    blur: number;
    opacity: number;
    borderOpacity: number;
  };
  onSearch: (keyword: string) => void;
  onSelectEngine: (engineId: SearchEngineId) => void;
  onRemoveHistoryItem: (item: string) => void;
  onClearHistory: () => void;
  onOpenUrl?: (url: string) => void;
  onToggleSearchBookmarks?: (enabled: boolean) => void;
  onToggleSearchHistory?: (enabled: boolean) => void;
  onUpdateVerticalOffset?: (offset: number) => void;
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  currentEngineId,
  suggestionEngine = 'auto',
  searchHistory,
  searchBookmarks: enableBookmarksSearch = true,
  searchHistoryEnabled = true,
  verticalOffset = 0,
  openInNewTab = true,
  language,
  theme,
  glassStyle,
  onSearch,
  onSelectEngine,
  onRemoveHistoryItem,
  onClearHistory,
  onOpenUrl,
  onToggleSearchBookmarks,
  onToggleSearchHistory,
  onUpdateVerticalOffset,
}) => {
  const [keyword, setKeyword] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [settingsPopoverOpen, setSettingsPopoverOpen] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [matchedBookmarks, setMatchedBookmarks] = useState<BookmarkSearchResult[]>([]);
  const [matchedHistoryItems, setMatchedHistoryItems] = useState<BrowserHistoryItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [dropdownHeight, setDropdownHeight] = useState<number | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentInnerRef = useRef<HTMLDivElement>(null);
  const isInitialOpenRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const t = i18n[language];

  // Keep latest refs for clean event listener usage without stale closures
  const currentEngineIdRef = useRef(currentEngineId);
  currentEngineIdRef.current = currentEngineId;

  const onSelectEngineRef = useRef(onSelectEngine);
  onSelectEngineRef.current = onSelectEngine;

  // Resolve active dark mode
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const currentEngine =
    SEARCH_ENGINES.find((e) => e.id === currentEngineId) || SEARCH_ENGINES[0];

  const trimmed = keyword.trim();
  const trimmedLower = trimmed.toLowerCase();

  // 搜索词历史匹配：输入文本时显示与关键词匹配的几条（前 2 条）；未输入文本时显示最近历史（前 8 条）
  const matchedHistory = trimmedLower
    ? searchHistory.filter((item) => item.toLowerCase().includes(trimmedLower)).slice(0, 2)
    : searchHistory.slice(0, 8);

  // 统一构建可键盘导航的平面列表
  type NavItem =
    | { type: 'bookmark'; item: BookmarkSearchResult; key: string }
    | { type: 'history'; item: BrowserHistoryItem; key: string }
    | { type: 'suggestion'; text: string; key: string }
    | { type: 'searchHistory'; text: string; key: string };

  const navigableItems: NavItem[] = useMemo(() => {
    const list: NavItem[] = [];
    if (trimmed) {
      matchedBookmarks.forEach((b) => {
        list.push({ type: 'bookmark', item: b, key: `bm-${b.bookmark.id || b.bookmark.url}` });
      });
      matchedHistoryItems.forEach((h) => {
        list.push({ type: 'history', item: h, key: `hist-${h.id || h.url}` });
      });
      suggestions.forEach((s) => {
        list.push({ type: 'suggestion', text: s, key: `sug-${s}` });
      });
      matchedHistory.forEach((h) => {
        list.push({ type: 'searchHistory', text: h, key: `shist-${h}` });
      });
    } else {
      matchedHistory.forEach((h) => {
        list.push({ type: 'searchHistory', text: h, key: `shist-${h}` });
      });
    }
    return list;
  }, [trimmed, matchedBookmarks, matchedHistoryItems, suggestions, matchedHistory]);

  const keyToIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    navigableItems.forEach((item, index) => {
      map.set(item.key, index);
    });
    return map;
  }, [navigableItems]);

  // 并行防抖调度：书签、历史记录与网络搜索建议
  useEffect(() => {
    if (!trimmed || !isFocused) {
      setSuggestions([]);
      setMatchedBookmarks([]);
      setMatchedHistoryItems([]);
      setIsLoadingSuggestions(false);
      setActiveIndex(-1);
      return;
    }

    setActiveIndex(-1);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingSuggestions(true);

    const timer = setTimeout(async () => {
      try {
        const promises: [
          Promise<string[]>,
          Promise<BookmarkSearchResult[]>,
          Promise<BrowserHistoryItem[]>
        ] = [
          fetchSearchSuggestions(trimmed, currentEngineId, suggestionEngine, controller.signal),
          enableBookmarksSearch ? searchBookmarks(trimmed, 4) : Promise.resolve([]),
          searchHistoryEnabled ? searchBrowserHistory(trimmed, 6) : Promise.resolve([]),
        ];

        const [sugResults, bmResults, histResults] = await Promise.all(promises);

        if (!controller.signal.aborted) {
          // 过滤掉已被书签匹配的重复历史记录 URL，避免信息冗余
          const bookmarkedUrls = new Set(
            bmResults.map((b) => b.bookmark.url?.toLowerCase().replace(/\/$/, '')).filter(Boolean)
          );
          const filteredHist = histResults
            .filter((h) => !bookmarkedUrls.has(h.url?.toLowerCase().replace(/\/$/, '')))
            .slice(0, 3);

          const filteredSug = sugResults
            .filter((s) => s.toLowerCase() !== trimmedLower)
            .slice(0, 4);

          setSuggestions(filteredSug);
          setMatchedBookmarks(bmResults.slice(0, 3));
          setMatchedHistoryItems(filteredHist);
          setIsLoadingSuggestions(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsLoadingSuggestions(false);
        }
      }
    }, 150); // 150ms 优雅防抖

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    trimmed,
    trimmedLower,
    currentEngineId,
    suggestionEngine,
    isFocused,
    enableBookmarksSearch,
    searchHistoryEnabled,
  ]);

  // Tab 按键监听：阻止浏览器默认跳焦并即时切换搜索引擎
  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;

    const onNativeKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const activeId = currentEngineIdRef.current;
        const currentIndex = SEARCH_ENGINES.findIndex((eng) => eng.id === activeId);
        const total = SEARCH_ENGINES.length;
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + total) % total
          : (currentIndex + 1) % total;
        const nextEngineId = SEARCH_ENGINES[nextIndex].id;
        currentEngineIdRef.current = nextEngineId;
        onSelectEngineRef.current(nextEngineId);
      }
    };

    inputEl.addEventListener('keydown', onNativeKeyDown);
    return () => inputEl.removeEventListener('keydown', onNativeKeyDown);
  }, []);

  // 点击组件外部收起浮层
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 全局快捷键监听：按 `/` 键或 `Ctrl+K` / `Cmd+K` 直接聚焦到搜索框；按 Escape 退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.ant-modal') ||
          target.closest('.ant-drawer'));

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsFocused(true);
        return;
      }

      if (e.key === '/' && !isInputFocused && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsFocused(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (trimmed) {
      onSearch(trimmed);
      setIsFocused(false);
    }
  };

  const handleSelectItem = (text: string) => {
    setKeyword(text);
    onSearch(text);
    setIsFocused(false);
  };

  const handleOpenUrl = (url?: string) => {
    if (!url) return;
    if (onOpenUrl) {
      onOpenUrl(url);
    } else if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
    setIsFocused(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = SEARCH_ENGINES.findIndex((eng) => eng.id === currentEngineId);
      const total = SEARCH_ENGINES.length;
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + total) % total
        : (currentIndex + 1) % total;
      onSelectEngine(SEARCH_ENGINES[nextIndex].id);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (navigableItems.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (navigableItems.length > 0) {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
      }
      return;
    }

    if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < navigableItems.length) {
        e.preventDefault();
        const selected = navigableItems[activeIndex];
        if (selected.type === 'bookmark') {
          handleOpenUrl(selected.item.bookmark.url);
        } else if (selected.type === 'history') {
          handleOpenUrl(selected.item.url);
        } else if (selected.type === 'suggestion' || selected.type === 'searchHistory') {
          handleSelectItem(selected.text);
        }
      }
    }
  };

  // 判断是否展示浮层卡片
  const hasBookmarks = matchedBookmarks.length > 0;
  const hasHistoryItems = matchedHistoryItems.length > 0;
  const hasHistory = matchedHistory.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const showDropdown =
    isFocused &&
    (hasBookmarks ||
      hasHistoryItems ||
      hasHistory ||
      hasSuggestions ||
      (trimmed.length > 0 && isLoadingSuggestions));

  // 动态测量内部内容高度，支持高度平滑自然过渡动画
  useEffect(() => {
    if (!showDropdown) {
      isInitialOpenRef.current = true;
      setDropdownHeight(undefined);
      return;
    }

    const innerEl = contentInnerRef.current;
    if (!innerEl) return;

    let rafId: number | null = null;
    const currentH = innerEl.offsetHeight;
    if (currentH > 0) {
      setDropdownHeight((prev) => (prev === currentH ? prev : currentH));
    }

    const timer = setTimeout(() => {
      isInitialOpenRef.current = false;
    }, 60);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        if (h > 0) {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            setDropdownHeight((prev) => (prev === h ? prev : h));
          });
        }
      }
    });

    observer.observe(innerEl);

    return () => {
      clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [showDropdown]);

  // 搜索引擎下拉菜单配置
  const engineMenuItems: MenuProps['items'] = SEARCH_ENGINES.map((engine) => ({
    key: engine.id,
    label: (
      <div className="flex items-center gap-2.5 px-1 py-1" title={engine.name}>
        <SearchEngineIcon engineId={engine.id} size={18} className="w-[18px] h-[18px]" />
        <span className="font-medium text-sm">{engine.name}</span>
      </div>
    ),
    onClick: () => {
      onSelectEngine(engine.id);
      inputRef.current?.focus();
    },
  }));

  // 统一定义搜索框与下拉联想卡片的毛玻璃材质样式，确保二者在任何壁纸与主题下材质、透明度、模糊度与色彩完全绝对一致
  const glassBackgroundColor = isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)';
  const glassBackdropFilter = `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`;
  const glassBorder = `1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.75)'}`;

  // 搜索偏好与位置调节下拉浮层内容（极简轻量版）
  const searchSettingsContent = (
    <div className="w-56 p-0.5 flex flex-col gap-2 select-none text-neutral-800 dark:text-neutral-100">
      {/* 快捷功能开关列表 */}
      <div className="flex flex-col gap-0.5">
        {/* 书签快速开关 */}
        <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
            <Bookmark className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t.searchBookmarks}</span>
          </div>
          <Switch
            size="small"
            checked={enableBookmarksSearch}
            onChange={(checked) => onToggleSearchBookmarks?.(checked)}
          />
        </div>

        {/* 历史记录快速开关 */}
        <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
            <Clock className="w-3.5 h-3.5 text-purple-500" />
            <span>{t.searchHistory}</span>
          </div>
          <Switch
            size="small"
            checked={searchHistoryEnabled}
            onChange={(checked) => onToggleSearchHistory?.(checked)}
          />
        </div>
      </div>

      {/* 搜索框垂直位置调节 */}
      {onUpdateVerticalOffset && (
        <>
          <div className="border-t border-black/8 dark:border-white/10" />

          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
              <span className="flex items-center gap-1.5">
                <MoveVertical className="w-3.5 h-3.5 text-blue-500" />
                <span>{t.searchVerticalOffset}</span>
              </span>
              <div className="flex items-center gap-1 font-mono text-[11px]">
                <span className={verticalOffset !== 0 ? 'text-blue-500 font-medium' : 'opacity-40'}>
                  {(verticalOffset ?? 0) > 0 ? `+${verticalOffset}` : (verticalOffset ?? 0)}px
                </span>
                {verticalOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateVerticalOffset(0)}
                    className="p-0.5 text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors"
                    title={t.resetDefault}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="pt-0.5 px-0.5">
              <Slider
                className="my-1"
                min={-100}
                max={100}
                step={2}
                value={verticalOffset ?? 0}
                onChange={(v) => onUpdateVerticalOffset(v)}
                tooltip={{
                  formatter: (val) => `${val && val > 0 ? `+${val}` : val ?? 0}px`,
                }}
              />
            </div>

            {/* 极简快捷档位 */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500 px-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => onUpdateVerticalOffset(-40)}
                className={`transition-colors cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200 ${
                  (verticalOffset ?? 0) <= -25 ? 'text-blue-500 font-medium' : ''
                }`}
              >
                {t.searchVerticalTop}
              </button>
              <button
                type="button"
                onClick={() => onUpdateVerticalOffset(0)}
                className={`transition-colors cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200 ${
                  (verticalOffset ?? 0) > -25 && (verticalOffset ?? 0) < 25 ? 'text-blue-500 font-medium' : ''
                }`}
              >
                {t.searchVerticalCenter}
              </button>
              <button
                type="button"
                onClick={() => onUpdateVerticalOffset(40)}
                className={`transition-colors cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200 ${
                  (verticalOffset ?? 0) >= 25 ? 'text-blue-500 font-medium' : ''
                }`}
              >
                {t.searchVerticalBottom}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto flex flex-col items-center">
      {/* Search Input Bar */}
      <form
        onSubmit={handleSubmit}
        className={`w-full relative transition-all duration-300 rounded-2xl flex items-center shadow-lg ${
          isFocused ? 'ring-2 ring-blue-500/80 shadow-2xl' : 'hover:shadow-xl'
        }`}
        style={{
          backgroundColor: glassBackgroundColor,
          backdropFilter: glassBackdropFilter,
          WebkitBackdropFilter: glassBackdropFilter,
          border: glassBorder,
        }}
      >
        {/* Search Engine Selector Dropdown */}
        <Dropdown menu={{ items: engineMenuItems }} trigger={['click']} placement="bottomLeft">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-3 rounded-l-2xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer text-sm font-medium border-r border-black/5 dark:border-white/10 flex-shrink-0"
            aria-label="切换搜索引擎"
            title={`当前搜索引擎：${currentEngine.name}`}
          >
            <SearchEngineIcon engineId={currentEngine.id} size={18} />
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-transform ml-0.5" />
          </button>
        </Dropdown>

        {/* Input Form */}
        <div className="flex-1 flex items-center px-3 py-1.5 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleInputKeyDown}
            placeholder={t.searchPlaceholder}
            className={`w-full bg-transparent border-0 outline-none text-base font-normal px-2 py-1 placeholder:text-gray-400/90 ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}
          />

          {/* Keyboard shortcut badge when idle */}
          {!keyword && !isFocused && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono opacity-40 px-1.5 py-0.5 rounded border border-current/20 pointer-events-none select-none mr-1.5">
              <span>/</span>
            </div>
          )}

          {/* Quick Clear Input button */}
          {keyword && (
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                inputRef.current?.focus();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer transition-colors mr-0.5"
              aria-label="清空输入"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Preferences Dropdown Trigger Button (Arrow) */}
          <Popover
            open={settingsPopoverOpen}
            onOpenChange={setSettingsPopoverOpen}
            trigger="click"
            placement="bottomRight"
            arrow={false}
            content={searchSettingsContent}
          >
            <Tooltip title={t.searchPreferences} placement="top">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFocused(false);
                }}
                className={`p-1 rounded-md flex items-center justify-center transition-all cursor-pointer mr-0.5 shrink-0 ${
                  settingsPopoverOpen
                    ? 'text-blue-500 bg-blue-500/10'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
                } active:scale-95`}
                aria-label={t.searchPreferences}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    settingsPopoverOpen ? 'rotate-180 text-blue-500' : ''
                  }`}
                />
              </button>
            </Tooltip>
          </Popover>

          {/* Submit Search Button */}
          <button
            type="submit"
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white flex items-center justify-center transition-all shadow-md cursor-pointer flex-shrink-0 ml-1"
            aria-label="执行搜索"
          >
            <Search className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>
      </form>

      {/* Floating Dropdown: 聚合搜索卡片（书签、历史记录、联想词与搜索历史） */}
      {showDropdown && (
        <div
          className="absolute top-[calc(100%+8px)] left-0 w-full z-50 rounded-2xl shadow-xl overflow-hidden history-dropdown-enter"
          style={{
            height: dropdownHeight !== undefined ? `${dropdownHeight}px` : 'auto',
            maxHeight: '480px',
            transition: isInitialOpenRef.current
              ? 'none'
              : 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, border-color 0.2s',
            willChange: 'height',
            backgroundColor: glassBackgroundColor,
            backdropFilter: glassBackdropFilter,
            WebkitBackdropFilter: glassBackdropFilter,
            border: glassBorder,
            boxShadow: isDark
              ? '0 20px 40px -12px rgba(0,0,0,0.5)'
              : '0 20px 40px -12px rgba(0,0,0,0.12)',
          }}
        >
          <div
            ref={contentInnerRef}
            className="w-full flex flex-col max-h-[480px] overflow-y-auto scrollbar-none py-1.5"
          >
            {/* 分组 1：书签检索结果 */}
            {trimmed && hasBookmarks && (
              <div className="space-y-0.5">
                {matchedBookmarks.map((b) => {
                  const key = `bm-${b.bookmark.id || b.bookmark.url}`;
                  const globalIdx = keyToIndexMap.get(key) ?? -1;
                  const isActive = activeIndex === globalIdx;
                  const displayDomain = formatDisplayUrl(b.bookmark.url || '');

                  return (
                    <div
                      key={key}
                      onClick={() => handleOpenUrl(b.bookmark.url)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleOpenUrl(b.bookmark.url);
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={`group flex items-center justify-between px-3 py-1.5 mx-1.5 rounded-xl cursor-pointer transition-colors ${
                        isActive
                          ? isDark
                            ? 'bg-white/12 text-white'
                            : 'bg-black/8 text-neutral-950'
                          : isDark
                            ? 'hover:bg-white/8 text-neutral-200 hover:text-white'
                            : 'hover:bg-black/5 text-neutral-700 hover:text-neutral-950'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                          <ShortcutIconView
                            url={b.bookmark.url || ''}
                            title={b.bookmark.title || displayDomain}
                            sizeClass="w-3.5 h-3.5 shrink-0"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs sm:text-sm truncate font-medium">
                            {highlightKeyword(b.bookmark.title || displayDomain, trimmed)}
                          </span>
                          <span className="text-[10.5px] text-neutral-400 dark:text-neutral-500 truncate font-mono">
                            {displayDomain}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                          {t.searchResultBookmarks}
                        </span>
                        {isActive ? (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono opacity-80 pl-1">
                            ↵
                          </span>
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 分组 2：历史记录检索结果 */}
            {trimmed && hasHistoryItems && (
              <div className="space-y-0.5">
                {matchedHistoryItems.map((h) => {
                  const key = `hist-${h.id || h.url}`;
                  const globalIdx = keyToIndexMap.get(key) ?? -1;
                  const isActive = activeIndex === globalIdx;
                  const displayDomain = formatDisplayUrl(h.url);

                  return (
                    <div
                      key={key}
                      onClick={() => handleOpenUrl(h.url)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleOpenUrl(h.url);
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={`group flex items-center justify-between px-3 py-1.5 mx-1.5 rounded-xl cursor-pointer transition-colors ${
                        isActive
                          ? isDark
                            ? 'bg-white/12 text-white'
                            : 'bg-black/8 text-neutral-950'
                          : isDark
                            ? 'hover:bg-white/8 text-neutral-200 hover:text-white'
                            : 'hover:bg-black/5 text-neutral-700 hover:text-neutral-950'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                          <ShortcutIconView
                            url={h.url || ''}
                            title={h.title || displayDomain}
                            sizeClass="w-3.5 h-3.5 shrink-0"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs sm:text-sm truncate font-medium">
                            {highlightKeyword(h.title || displayDomain, trimmed)}
                          </span>
                          <span className="text-[10.5px] text-neutral-400 dark:text-neutral-500 truncate font-mono">
                            {displayDomain}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 font-medium">
                          {t.searchResultHistory}
                        </span>
                        {isActive ? (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono opacity-80 pl-1">
                            ↵
                          </span>
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 分组 3：实时搜索联想词建议 */}
            {hasSuggestions && (
              <div className="space-y-0.5">
                {suggestions.map((item) => {
                  const key = `sug-${item}`;
                  const globalIdx = keyToIndexMap.get(key) ?? -1;
                  const isActive = activeIndex === globalIdx;

                  return (
                    <div
                      key={key}
                      onClick={() => handleSelectItem(item)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectItem(item);
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      className={`group flex items-center justify-between px-3.5 py-1.5 mx-1.5 rounded-xl cursor-pointer transition-colors ${
                        isActive
                          ? isDark
                            ? 'bg-white/12 text-white'
                            : 'bg-black/8 text-neutral-950'
                          : isDark
                            ? 'hover:bg-white/8 text-neutral-200 hover:text-white'
                            : 'hover:bg-black/5 text-neutral-700 hover:text-neutral-950'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                        <span className="text-sm truncate font-normal">
                          {highlightKeyword(item, trimmed)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-3 text-gray-400">
                        {isActive ? (
                          <span className="text-[10px] font-mono opacity-80">↵</span>
                        ) : (
                          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 分组 4：历史搜索词记录 */}
            {hasHistory && (
              <div className="space-y-0.5">
                {matchedHistory.map((item, idx) => {
                  const key = `shist-${item}`;
                  const globalIdx = keyToIndexMap.get(key) ?? -1;
                  const isActive = activeIndex === globalIdx;

                  return (
                    <div
                      key={`hist-${item}-${idx}`}
                      onClick={() => handleSelectItem(item)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectItem(item);
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      style={{ animationDelay: `${idx * 25}ms` }}
                      className={`group flex items-center justify-between px-3.5 py-1.5 mx-1.5 rounded-xl cursor-pointer transition-colors history-item-enter ${
                        isActive
                          ? isDark
                            ? 'bg-white/12 text-white'
                            : 'bg-black/8 text-neutral-950'
                          : isDark
                            ? 'hover:bg-white/8 text-neutral-200 hover:text-white'
                            : 'hover:bg-black/5 text-neutral-700 hover:text-neutral-950'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <History className="w-3.5 h-3.5 text-amber-500/75 group-hover:text-amber-500 transition-colors flex-shrink-0" />
                        <span className="text-sm truncate font-normal">
                          {highlightKeyword(item, trimmed)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {isActive ? (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono opacity-80">
                            ↵
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowUpRight className="w-3 h-3" />
                          </span>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveHistoryItem(item);
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemoveHistoryItem(item);
                          }}
                          className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title={language === 'zh' ? '删除此条记录' : 'Remove entry'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* 未输入任何关键词时，底部提供轻量清空历史按钮 */}
                {!trimmed && (
                  <div className="px-4 py-2 mt-1 border-t border-black/5 dark:border-white/10 flex justify-end select-none">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onClearHistory();
                      }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer px-1.5 py-0.5 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t.clearHistory}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 辅助函数：关键词局部高亮展示
 */
function highlightKeyword(fullText: string, searchKeyword: string) {
  if (!searchKeyword) return fullText;
  const lowerText = fullText.toLowerCase();
  const lowerKeyword = searchKeyword.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerKeyword);

  if (matchIndex === -1) return fullText;

  const before = fullText.slice(0, matchIndex);
  const match = fullText.slice(matchIndex, matchIndex + searchKeyword.length);
  const after = fullText.slice(matchIndex + searchKeyword.length);

  return (
    <>
      {before}
      <span className="text-blue-500 dark:text-blue-400 font-semibold">{match}</span>
      {after}
    </>
  );
}

/**
 * 辅助函数：格式化展示 URL（去除 http/https/www 与末尾斜杠）
 */
function formatDisplayUrl(rawUrl: string): string {
  try {
    const formatted = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    const u = new URL(formatted);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname !== '/' ? u.pathname : '';
    return `${host}${path}`.replace(/\/$/, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
  }
}
