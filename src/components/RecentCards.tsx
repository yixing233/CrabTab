import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Pin, RefreshCw, History, MoveVertical } from 'lucide-react';
import { Tooltip, Popover, Slider } from 'antd';
import { BrowserHistoryItem, Language, ThemeMode, GlassStyle } from '../types';
import { fetchBrowserHistory } from '../utils/history';
import { ShortcutIconView } from './Shortcuts';
import { parseDomainAndOrigin } from '../utils/favicon';
import { i18n } from '../i18n';

export interface RecentCardsProps {
  language: Language;
  theme: ThemeMode;
  glassStyle: GlassStyle;
  openInNewTab: boolean;
  pinnedUrls: string[];
  verticalOffset?: number;
  onUpdateVerticalOffset?: (offset: number) => void;
  onTogglePin: (item: BrowserHistoryItem) => void;
}

// 柔和马卡龙外框主题调色板（完美还原设计稿细节）
const CARD_THEMES = [
  {
    light: 'bg-[#edf3fc] border-[#d7e4f8] hover:border-blue-400 hover:shadow-blue-500/10', // 柔蓝
    dark: 'bg-blue-950/25 border-blue-800/40 hover:border-blue-400/80 hover:shadow-blue-400/10',
    accent: '#3b82f6',
  },
  {
    light: 'bg-[#f8f0fc] border-[#ebd6f5] hover:border-purple-400 hover:shadow-purple-500/10', // 柔紫
    dark: 'bg-purple-950/25 border-purple-800/40 hover:border-purple-400/80 hover:shadow-purple-400/10',
    accent: '#a855f7',
  },
  {
    light: 'bg-[#fcf0f2] border-[#f8d7dc] hover:border-rose-400 hover:shadow-rose-500/10', // 柔粉 / 玫瑰
    dark: 'bg-rose-950/25 border-rose-800/40 hover:border-rose-400/80 hover:shadow-rose-400/10',
    accent: '#f43f5e',
  },
  {
    light: 'bg-[#fcf7e8] border-[#f7e6b8] hover:border-amber-400 hover:shadow-amber-500/10', // 柔金 / 奶黄
    dark: 'bg-amber-950/25 border-amber-800/40 hover:border-amber-400/80 hover:shadow-amber-400/10',
    accent: '#f59e0b',
  },
  {
    light: 'bg-[#edfcf2] border-[#d3f5dd] hover:border-emerald-400 hover:shadow-emerald-500/10', // 柔绿
    dark: 'bg-emerald-950/25 border-emerald-800/40 hover:border-emerald-400/80 hover:shadow-emerald-400/10',
    accent: '#10b981',
  },
  {
    light: 'bg-[#f2f4f7] border-[#dde2e8] hover:border-slate-400 hover:shadow-slate-500/10', // 柔灰 / 浅冷灰
    dark: 'bg-slate-900/35 border-slate-700/45 hover:border-slate-400/80 hover:shadow-slate-400/10',
    accent: '#64748b',
  },
];

/**
 * 根据 URL 计算哈希并确定卡片主题色
 */
function getCardTheme(url: string, index: number) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  const themeIndex = Math.abs(hash + index) % CARD_THEMES.length;
  return CARD_THEMES[themeIndex];
}

/**
 * 从 URL 智能提取站点品牌名称
 */
function extractBrandName(url: string, title?: string): string {
  try {
    const { domain, rootDomain } = parseDomainAndOrigin(url);
    if (!domain) return title || 'Link';

    const BRAND_MAP: Record<string, string> = {
      'x.com': 'X',
      'twitter.com': 'X',
      'google.com': 'Google',
      'github.com': 'GitHub',
      'dribbble.com': 'Dribbble',
      'bilibili.com': 'Bilibili',
      'youtube.com': 'YouTube',
      'zhihu.com': '知乎',
      'weibo.com': '微博',
      'v2ex.com': 'V2EX',
      'reddit.com': 'Reddit',
      'wikipedia.org': 'Wikipedia',
      'stackoverflow.com': 'Stack Overflow',
      'figma.com': 'Figma',
      'notion.so': 'Notion',
      'tiptrans.com': 'tiptrans',
      'chatgpt.com': 'ChatGPT',
      'deepseek.com': 'DeepSeek',
    };

    if (BRAND_MAP[rootDomain]) return BRAND_MAP[rootDomain];
    if (BRAND_MAP[domain]) return BRAND_MAP[domain];

    const namePart = rootDomain.split('.')[0];
    if (namePart) {
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    return domain;
  } catch {
    return title || 'Link';
  }
}

/**
 * 格式化底部显示的精炼域名与路径
 */
function formatDisplayUrl(url: string): string {
  try {
    let clean = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return url;
  }
}

export const RecentCards: React.FC<RecentCardsProps> = ({
  language,
  theme,
  glassStyle,
  openInNewTab,
  pinnedUrls,
  verticalOffset = 0,
  onUpdateVerticalOffset,
  onTogglePin,
}) => {
  const t = i18n[language];
  const zh = language === 'zh';
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [historyItems, setHistoryItems] = useState<BrowserHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 加载最近历史
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchBrowserHistory(35);
      setHistoryItems(items);
    } catch (err) {
      console.error('Failed to load recent history for cards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 对历史项进行去重与置顶排序
  const displayItems = useMemo(() => {
    // 1. 过滤同域名且同路径完全重复的项目，保留访问最新的一条
    const seenUrls = new Set<string>();
    const uniqueItems: BrowserHistoryItem[] = [];

    for (const item of historyItems) {
      if (!item.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      uniqueItems.push(item);
    }

    // 2. 置顶排序：被 pinned 的 URL 优先排在最前
    const pinnedSet = new Set(pinnedUrls);
    const pinnedList: BrowserHistoryItem[] = [];
    const regularList: BrowserHistoryItem[] = [];

    // 先收集 pinned 的项目
    for (const url of pinnedUrls) {
      const match = uniqueItems.find((i) => i.url === url);
      if (match) {
        pinnedList.push(match);
      } else {
        // 如果历史中暂时移出了该条目，仍然凭 URL 保留置顶卡片
        pinnedList.push({
          id: `pinned-${url}`,
          title: extractBrandName(url),
          url,
        });
      }
    }

    // 收集非 pinned 项目
    for (const item of uniqueItems) {
      if (!pinnedSet.has(item.url)) {
        regularList.push(item);
      }
    }

    // 最多展示前 15 条（保证轻量不拖慢页面）
    return [...pinnedList, ...regularList].slice(0, 15);
  }, [historyItems, pinnedUrls]);

  // 横向滚动容器与滚轮事件
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
  }, [checkScroll, displayItems]);

  // 滚轮平滑插值与动量控制器
  const wheelTargetRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
    };
  }, []);

  // 滚轮横向极速丝滑滚动（支持高倍率卡片步进与触控板自适应）
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // 如果没有可滚动的超宽内容，放行默认垂直滚动
      if (el.scrollWidth <= el.clientWidth) return;

      const hasHoriz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const rawDelta = hasHoriz ? e.deltaX : e.deltaY;

      if (Math.abs(rawDelta) < 1) return;

      e.preventDefault();

      // 智能识别：离散鼠标滚轮（通常 deltaY 为整数且幅度较大）vs 精准触控板
      const isDiscreteWheel = Math.abs(rawDelta) >= 40;
      // 鼠标滚轮单次齿格大幅加速（约一张卡片宽度），触控板 1:1 自然线性手感
      const factor = isDiscreteWheel ? 2.1 : 1.0;
      const step = rawDelta * factor;

      const maxScroll = el.scrollWidth - el.clientWidth;
      const current = scrollContainerRef.current?.scrollLeft || 0;
      const base = wheelTargetRef.current !== null ? wheelTargetRef.current : current;
      const nextTarget = Math.max(0, Math.min(maxScroll, base + step));
      wheelTargetRef.current = nextTarget;

      // 触控板直接精准设定，避免多余延迟；鼠标齿轮采用 RAF 动量阻尼插值
      if (!isDiscreteWheel) {
        el.scrollLeft = nextTarget;
        wheelTargetRef.current = null;
        checkScroll();
        return;
      }

      const stepWheel = () => {
        if (!scrollContainerRef.current || wheelTargetRef.current === null) {
          wheelRafRef.current = null;
          return;
        }

        const curr = scrollContainerRef.current.scrollLeft;
        const target = wheelTargetRef.current;
        const diff = target - curr;

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

  // 点击卡片跳转
  const handleCardClick = (url: string) => {
    if (!url) return;
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-2 select-none pointer-events-auto">
      {/* 顶部标题栏：Recent / 最近访问（精致毛玻璃胶囊，全壁纸高清晰度对比） */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div
          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border shadow-sm select-none transition-all"
          style={{
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.68)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.55)',
            backdropFilter: `blur(${glassStyle.blur}px)`,
            WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
          }}
        >
          <span className="text-xs font-semibold tracking-wide text-neutral-800 dark:text-neutral-100">
            {t.recentTitle}
          </span>
          {displayItems.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/8 dark:bg-white/15 text-neutral-700 dark:text-neutral-200 font-semibold leading-none">
              {displayItems.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onUpdateVerticalOffset && (
            <Popover
              trigger="click"
              placement="bottomRight"
              arrow={false}
              content={
                <div className="w-60 p-1 flex flex-col gap-2.5 select-none">
                  <div className="flex items-center justify-between border-b pb-1.5 dark:border-white/10">
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-100">
                      {t.recentVerticalOffset}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateVerticalOffset(0)}
                      className="text-[11px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer font-medium"
                    >
                      {zh ? '恢复默认' : 'Reset'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Slider
                      className="flex-1 my-1"
                      min={-120}
                      max={120}
                      step={2}
                      value={verticalOffset}
                      onChange={(v) => onUpdateVerticalOffset(v)}
                      tooltip={{
                        formatter: (val) => `${val && val > 0 ? `+${val}` : val ?? 0}px`,
                      }}
                    />
                    <span className="text-xs font-mono w-12 text-right opacity-70">
                      {verticalOffset > 0 ? `+${verticalOffset}` : verticalOffset}px
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateVerticalOffset(-40)}
                      className={`text-[11px] py-1 px-1.5 rounded-md border transition-all cursor-pointer text-center ${
                        verticalOffset <= -25
                          ? 'bg-blue-500 text-white border-blue-500 font-semibold shadow-sm'
                          : 'border-black/10 dark:border-white/15 text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      {t.recentVerticalTop}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateVerticalOffset(0)}
                      className={`text-[11px] py-1 px-1.5 rounded-md border transition-all cursor-pointer text-center ${
                        verticalOffset > -25 && verticalOffset < 25
                          ? 'bg-blue-500 text-white border-blue-500 font-semibold shadow-sm'
                          : 'border-black/10 dark:border-white/15 text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      {t.recentVerticalCenter}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateVerticalOffset(40)}
                      className={`text-[11px] py-1 px-1.5 rounded-md border transition-all cursor-pointer text-center ${
                        verticalOffset >= 25
                          ? 'bg-blue-500 text-white border-blue-500 font-semibold shadow-sm'
                          : 'border-black/10 dark:border-white/15 text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                    >
                      {t.recentVerticalBottom}
                    </button>
                  </div>
                </div>
              }
            >
              <Tooltip title={zh ? '调节垂直位置' : 'Adjust vertical position'} placement="top">
                <button
                  type="button"
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border shadow-sm ${
                    verticalOffset !== 0
                      ? 'text-blue-500 dark:text-blue-400 font-bold'
                      : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
                  } active:scale-95`}
                  style={{
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.68)',
                    borderColor: verticalOffset !== 0
                      ? 'rgba(59, 130, 246, 0.5)'
                      : isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.55)',
                    backdropFilter: `blur(${glassStyle.blur}px)`,
                    WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
                  }}
                >
                  <MoveVertical size={12} />
                </button>
              </Tooltip>
            </Popover>
          )}

          <Tooltip title={zh ? '刷新最近访问' : 'Refresh recent'} placement="top">
            <button
              type="button"
              onClick={loadHistory}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border shadow-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white active:scale-95"
              style={{
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.68)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.55)',
                backdropFilter: `blur(${glassStyle.blur}px)`,
                WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
              }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin text-blue-500' : ''} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 卡片滚动容器外壳（附带左右边缘渐变遮罩提示） */}
      <div className="relative group">
        {/* 左侧平滑微渐变遮罩 */}
        {canScrollLeft && (
          <div
            className={`absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200 ${
              isDark
                ? 'bg-gradient-to-r from-[#141820]/90 to-transparent'
                : 'bg-gradient-to-r from-white/90 to-transparent'
            }`}
          />
        )}

        {/* 核心横向卡片列表 */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="flex items-center gap-3 overflow-x-auto scrollbar-none py-1 overscroll-contain select-none"
        >
          {loading && displayItems.length === 0 ? (
            <div className="w-full flex items-center justify-center py-6 text-xs text-neutral-400 gap-2">
              <RefreshCw size={13} className="animate-spin text-blue-400" />
              <span>{zh ? '正在读取最近访问...' : 'Loading recent visits...'}</span>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="w-full flex flex-col items-center justify-center py-8 text-xs text-neutral-400 gap-1.5 opacity-60">
              <History size={18} />
              <span>{t.recentEmpty}</span>
            </div>
          ) : (
            displayItems.map((item, index) => {
              const themeStyle = getCardTheme(item.url, index);
              const brand = extractBrandName(item.url, item.title);
              const displayUrl = formatDisplayUrl(item.url);
              const isPinned = pinnedUrls.includes(item.url);

              return (
                <div
                  key={item.id || item.url}
                  onClick={() => handleCardClick(item.url)}
                  title={`${item.title}\n${item.url}`}
                  className={`w-[205px] h-[104px] shrink-0 rounded-[18px] p-1.5 flex flex-col justify-between border transition-all duration-200 shadow-sm select-none cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                    isDark ? themeStyle.dark : themeStyle.light
                  }`}
                  style={{
                    backdropFilter: `blur(${glassStyle.blur}px)`,
                    WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
                  }}
                >
                  {/* 上半部：内嵌实体小盒（纯白/纯暗高对比度），承载 Favicon 与完整标题 */}
                  <div className="rounded-[13px] bg-white/95 dark:bg-[#181a20]/95 p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.04] dark:border-white/[0.06] flex flex-col justify-between h-[66px] overflow-hidden">
                    {/* 头部：Favicon 图标 + 站点大名 */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                        <ShortcutIconView
                          url={item.url}
                          title={item.title}
                          sizeClass="w-3.5 h-3.5 shrink-0"
                        />
                      </div>
                      <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                        {brand}
                      </span>
                    </div>

                    {/* 下部：网页实际标题（双行优雅截断，高对比度可读性） */}
                    <p className="text-[11px] leading-tight text-neutral-700 dark:text-neutral-300 line-clamp-2 mt-0.5 select-none font-normal">
                      {item.title || displayUrl}
                    </p>
                  </div>

                  {/* 下半部：精简 URL 路径 + 置顶 Pin 钉（优化清晰度） */}
                  <div className="px-2 pt-1 pb-0.5 flex items-center justify-between text-[11px]">
                    <span className="truncate max-w-[145px] font-mono text-[10.5px] font-medium text-neutral-600 dark:text-neutral-300">
                      {displayUrl}
                    </span>

                    <Tooltip
                      title={zh ? (isPinned ? t.unpinRecent : t.pinRecent) : (isPinned ? t.unpinRecent : t.pinRecent)}
                      placement="top"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(item);
                        }}
                        className={`w-5 h-5 -mr-1 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                          isPinned
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'opacity-50 hover:opacity-100 text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                      >
                        <Pin
                          size={11}
                          className={`transition-transform duration-150 ${
                            isPinned ? 'fill-blue-500/20 rotate-45' : ''
                          }`}
                        />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧平滑微渐变遮罩 */}
        {canScrollRight && (
          <div
            className={`absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none transition-opacity duration-200 ${
              isDark
                ? 'bg-gradient-to-l from-[#141820]/90 to-transparent'
                : 'bg-gradient-to-l from-white/90 to-transparent'
            }`}
          />
        )}
      </div>
    </div>
  );
};
