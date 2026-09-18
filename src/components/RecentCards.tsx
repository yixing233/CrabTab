import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Pin, RefreshCw, History, MoveVertical } from 'lucide-react';
import { Tooltip, Popover } from 'antd';
import { BrowserHistoryItem, Language, ThemeMode, GlassStyle, HomeContentMode } from '../types';
import { fetchBrowserHistory } from '../utils/history';
import { ShortcutIconView } from './Shortcuts';
import { HomeStageBar } from './HomeStageBar';
import { useResolvedIsDark } from '../theme';
import { VerticalOffsetControl } from './VerticalOffsetControl';
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
  /** 主屏内容三态；本组件即「最近访问」态，开关由共用工具条渲染以保持随时可切换 */
  homeContentMode: HomeContentMode;
  onUpdateHomeContentMode: (mode: HomeContentMode) => void;
}

/**
 * 卡片材质：与舞台其余内容块同源（快捷方式图标盒、搜索框、天气胶囊、
 * 同组件的工具条按钮都使用这套中性毛玻璃）。
 *
 * 此前卡片是全站唯一的例外：按 URL 哈希在 6 套马卡龙色（蓝/紫/粉/金/绿/灰）
 * 之间轮换底色。问题有两层：
 *  1. 颜色与站点毫无关系 —— 同一个站点的不同路径会拿到不同颜色（实测同一
 *     localhost 的三个页面分别是绿、黄、蓝），读起来像分类着色，实际纯属哈希噪音；
 *  2. 材质与全站割裂 —— 卡片是唯一带彩色底的组件，与正上方同组件的工具条按钮
 *     都不是一套材质，同一块舞台内出现两种视觉语言。
 *
 * 统一为中性玻璃后，卡片之间颜色恒定，且与快捷方式图标盒（两者在同一插槽
 * 交替出现）读作同一套材质。悬停反馈改由描边增亮承担，不再靠换色。
 */
function getCardMaterial(isDark: boolean, blur: number): React.CSSProperties {
  return {
    backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
    // 与 Shortcuts 图标盒同一手法：给模糊下限，低模糊设置下仍保证文字背后可读
    backdropFilter: `blur(${Math.max(blur, 16)}px) saturate(180%)`,
    WebkitBackdropFilter: `blur(${Math.max(blur, 16)}px) saturate(180%)`,
    boxShadow: isDark
      ? '0 10px 25px -5px rgba(0, 0, 0, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)'
      : '0 10px 25px -5px rgba(0, 0, 0, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
  };
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

    // IP 地址与 localhost 特殊处理
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain.includes(':');
    if (domain === 'localhost' || isIp) {
      if (title && title.trim() && !title.startsWith('http')) {
        const clean = title.split(/[-_|–—]/)[0].trim();
        return clean || title.trim();
      }
      return domain === 'localhost' ? 'Localhost' : domain;
    }

    const namePart = rootDomain.split('.')[0];
    if (namePart && !/^\d+$/.test(namePart)) {
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    if (title && title.trim() && !title.startsWith('http')) {
      const clean = title.split(/[-_|–—]/)[0].trim();
      return clean || title.trim();
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
  homeContentMode,
  onUpdateHomeContentMode,
}) => {
  const t = i18n[language];
  const zh = language === 'zh';
  // 与工具条、快捷方式网格共用同一解析（theme.ts）：三态切换时中央区域
  // 的配色判定必须同源，否则切换过程中会出现一闪而过的反色。
  const isDark = useResolvedIsDark(theme);

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
    setCanScrollLeft(hasScroll && el.scrollLeft > 6);
    setCanScrollRight(hasScroll && el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
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
    <div className="recent-cards-stage w-full select-none pointer-events-auto">
      {/* 舞台工具条：与快捷方式共用同一组件，三态开关在此状态下同样可达 */}
      <HomeStageBar
        language={language}
        theme={theme}
        blur={glassStyle.blur}
        homeContentMode={homeContentMode}
        onUpdateHomeContentMode={onUpdateHomeContentMode}
        badge={
          displayItems.length > 0 ? (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-black/8 dark:bg-white/15 font-semibold leading-none">
              {displayItems.length}
            </span>
          ) : undefined
        }
        actions={
          <>
            {onUpdateVerticalOffset && (
              <Popover
                trigger="click"
                placement="bottomRight"
                arrow={false}
                content={
                  <div className="w-60 p-1">
                    <VerticalOffsetControl
                      variant="popover"
                      label={t.recentVerticalOffset}
                      value={verticalOffset}
                      onChange={onUpdateVerticalOffset}
                      resetTitle={zh ? '恢复默认' : 'Reset'}
                      presetLabels={{
                        top: t.recentVerticalTop,
                        center: t.recentVerticalCenter,
                        bottom: t.recentVerticalBottom,
                      }}
                    />
                  </div>
                }
              >
                <Tooltip title={zh ? '调节垂直位置' : 'Adjust vertical position'} placement="top">
                  <button
                    type="button"
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border shadow-sm ${
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
                    <MoveVertical size={13} />
                  </button>
                </Tooltip>
              </Popover>
            )}

            <Tooltip title={zh ? '刷新最近访问' : 'Refresh recent'} placement="top">
              <button
                type="button"
                onClick={loadHistory}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer border shadow-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white active:scale-95"
                style={{
                  backgroundColor: isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.68)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.55)',
                  backdropFilter: `blur(${glassStyle.blur}px)`,
                  WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
                }}
              >
                <RefreshCw size={13} className={loading ? 'animate-spin text-blue-500' : ''} />
              </button>
            </Tooltip>
          </>
        }
      />

      {/* 卡片滚动容器外壳（附带左右边缘渐变遮罩提示）
          垂直偏移只作用于卡片区，工具条保持与快捷方式状态同一条基线 */}
      <div
        className="relative group home-stage-content"
        style={{
          transform: verticalOffset ? `translateY(${verticalOffset}px)` : undefined,
          transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
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
          className="flex items-center gap-3 overflow-x-auto scrollbar-none px-1.5 py-1.5 overscroll-contain select-none"
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
            displayItems.map((item) => {
              const brand = extractBrandName(item.url, item.title);
              const displayUrl = formatDisplayUrl(item.url);
              const isPinned = pinnedUrls.includes(item.url);

              return (
                <div
                  key={item.id || item.url}
                  onClick={() => handleCardClick(item.url)}
                  title={`${item.title}\n${item.url}`}
                  className={`w-[205px] h-[104px] shrink-0 rounded-[18px] p-1.5 flex flex-col justify-between border transition-all duration-200 select-none cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                    isDark
                      ? 'border-white/16 hover:border-white/60'
                      : 'border-white/75 hover:border-white'
                  }`}
                  style={getCardMaterial(isDark, glassStyle.blur)}
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
