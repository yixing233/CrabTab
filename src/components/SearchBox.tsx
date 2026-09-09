import React, { useState, useEffect, useRef } from 'react';
import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import {
  Search,
  ChevronDown,
  X,
  History,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { SearchEngineId, SuggestionEngineId, Language } from '../types';
import { SEARCH_ENGINES } from '../constants';
import { i18n } from '../i18n';
import { fetchSearchSuggestions } from '../utils/searchSuggestions';
import { SearchEngineIcon } from './SearchEngineIcons';

interface SearchBoxProps {
  currentEngineId: SearchEngineId;
  suggestionEngine?: SuggestionEngineId;
  searchHistory: string[];
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
}

export const SearchBox: React.FC<SearchBoxProps> = ({
  currentEngineId,
  suggestionEngine = 'auto',
  searchHistory,
  language,
  theme,
  glassStyle,
  onSearch,
  onSelectEngine,
  onRemoveHistoryItem,
  onClearHistory,
}) => {
  const [keyword, setKeyword] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [dropdownHeight, setDropdownHeight] = useState<number | undefined>(undefined);

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

  // 搜索联想请求防抖与请求管理
  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed || !isFocused) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingSuggestions(true);

    const timer = setTimeout(async () => {
      try {
        const results = await fetchSearchSuggestions(
          trimmed,
          currentEngineId,
          suggestionEngine,
          controller.signal
        );

        if (!controller.signal.aborted) {
          // 过滤掉完全与当前输入相同的联想词（如果有更丰富的长尾扩展），并去重
          const filtered = results.filter(
            (s) => s.toLowerCase() !== trimmed.toLowerCase()
          );
          setSuggestions(filtered.slice(0, 6));
          setIsLoadingSuggestions(false);
        }
      } catch (err) {
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
  }, [keyword, currentEngineId, suggestionEngine, isFocused]);

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
      // 当按下 Escape 时收起搜索框
      if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
        return;
      }

      // 如果当前焦点已经在可输入组件内（input, textarea, contenteditable, modal），则不抢占按键
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.ant-modal') ||
          target.closest('.ant-drawer'));

      // 1. Ctrl+K 或 Cmd+K 全局聚焦
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsFocused(true);
        return;
      }

      // 2. 在非输入状态下按单键 `/` 全局聚焦
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
    if (keyword.trim()) {
      onSearch(keyword.trim());
      setIsFocused(false);
    }
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
    }
  };

  const handleSelectItem = (text: string) => {
    setKeyword(text);
    onSearch(text);
    setIsFocused(false);
  };

  // 匹配的历史记录：未输入文本时显示最近历史（前 8 条）；输入文本后显示与关键词匹配的几条历史（前 3 条）
  const trimmed = keyword.trim().toLowerCase();
  const matchedHistory = trimmed
    ? searchHistory.filter((item) => item.toLowerCase().includes(trimmed)).slice(0, 3)
    : searchHistory.slice(0, 8);

  // 判断是否展示浮层卡片
  const hasHistory = matchedHistory.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const showDropdown = isFocused && (hasHistory || hasSuggestions || (trimmed.length > 0 && isLoadingSuggestions));

  // 动态测量内部内容高度，支持高度平滑自然过渡动画
  useEffect(() => {
    if (!showDropdown) {
      isInitialOpenRef.current = true;
      setDropdownHeight(undefined);
      return;
    }

    const innerEl = contentInnerRef.current;
    if (!innerEl) return;

    // 立即同步读取首帧内容高度
    let rafId: number | null = null;
    const currentH = innerEl.offsetHeight;
    if (currentH > 0) {
      setDropdownHeight((prev) => (prev === currentH ? prev : currentH));
    }

    // 首帧后允许高度自然过渡
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

  // 搜索引擎下拉菜单配置（从文本改为对应的图标）
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

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto flex flex-col items-center">
      {/* Search Input Bar (聚焦时绝不放大，保持精准尺寸) */}
      <form
        onSubmit={handleSubmit}
        className={`w-full relative transition-all duration-300 rounded-2xl flex items-center shadow-lg ${
          isFocused ? 'ring-2 ring-blue-500/80 shadow-2xl' : 'hover:shadow-xl'
        }`}
        style={{
          backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
          backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.75)'}`,
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
            <SearchEngineIcon
              engineId={currentEngine.id}
              size={18}
            />
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
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer transition-colors mr-1"
              aria-label="清空输入"
            >
              <X className="w-4 h-4" />
            </button>
          )}

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

      {/* Floating Dropdown: 搜索历史与实时搜索联想卡片 */}
      {showDropdown && (
        <div
          className="absolute top-[calc(100%+8px)] left-0 w-full z-50 rounded-2xl shadow-xl overflow-hidden history-dropdown-enter"
          style={{
            height: dropdownHeight !== undefined ? `${dropdownHeight}px` : 'auto',
            transition: isInitialOpenRef.current
              ? 'none'
              : 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s, border-color 0.2s',
            willChange: 'height',
            backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
            backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
            WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.75)'}`,
            boxShadow: isDark
              ? '0 20px 40px -12px rgba(0,0,0,0.5), inset 0 1px 1px 0 rgba(255,255,255,0.1)'
              : '0 20px 40px -12px rgba(0,0,0,0.12), inset 0 1px 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <div ref={contentInnerRef} className="w-full flex flex-col">
          {/* Section 1: 匹配的搜索历史记录 */}
          {hasHistory && (
            <div>
              {/* History Item Entries */}
              <div className="py-1">
                {matchedHistory.map((item, idx) => (
                  <div
                    key={`hist-${item}-${idx}`}
                    onClick={() => handleSelectItem(item)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectItem(item);
                    }}
                    style={{ animationDelay: `${idx * 25}ms` }}
                    className={`group flex items-center justify-between px-4 py-2 cursor-pointer transition-colors history-item-enter ${
                      isDark
                        ? 'hover:bg-white/10 text-gray-200 hover:text-white'
                        : 'hover:bg-black/5 text-gray-700 hover:text-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <History className="w-3.5 h-3.5 text-blue-400/80 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                      <span className="text-sm truncate font-normal">
                        {/* 高亮匹配字符 */}
                        {highlightKeyword(item, trimmed)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3">
                      <span className="text-xs text-gray-400 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3" />
                      </span>
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
                ))}
              </div>

              {/* 未输入任何关键词时，底部提供轻量清空历史按钮 */}
              {!trimmed && (
                <div className="px-4 py-2 border-t border-black/5 dark:border-white/10 flex justify-end select-none">
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

          {/* Section 2: 实时搜索联想词建议 */}
          {hasSuggestions && (
            <div className={hasHistory ? 'border-t border-black/5 dark:border-white/10' : ''}>
              {/* Suggestions Item Entries */}
              <div className="py-1">
                {suggestions.map((item, idx) => (
                  <div
                    key={`sug-${item}-${idx}`}
                    onClick={() => handleSelectItem(item)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectItem(item);
                    }}
                    className={`group flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                      isDark
                        ? 'hover:bg-white/10 text-gray-200 hover:text-white'
                        : 'hover:bg-black/5 text-gray-700 hover:text-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                      <span className="text-sm truncate font-normal">
                        {highlightKeyword(item, trimmed)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3 text-gray-400">
                      <ArrowUpRight className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              </div>
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
