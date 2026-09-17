import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { SiteShortcut, Language, HomeContentMode } from '../types';
import { i18n } from '../i18n';
import {
  getFaviconCandidates,
  getPrimaryFaviconUrl,
  getAvatarPalette,
  getIconCandidateOptions,
  parseDomainAndOrigin,
} from '../utils/favicon';
import {
  setCachedFavicon,
  setCachedFaviconFailed,
  subscribeFaviconCache,
} from '../utils/faviconCache';
import {
  deviceToLayoutPx,
  getLayoutViewport,
  getUiScale,
  resolveFloatingPosition,
} from '../utils/viewport';
import {
  Folder,
  Edit2,
  Trash2,
  CornerUpLeft,
  Ungroup,
  Plus,
  Maximize2,
  Minimize2,
  Check,
  Globe2,
  Link,
  ExternalLink,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Settings2,
  ChevronDown,
  EyeOff,
  History as HistoryIcon,
} from 'lucide-react';

type ShortcutContextMenu = {
  itemId: string;
  x: number;
  y: number;
};

type GridContextMenu = {
  x: number;
  y: number;
  position: { column: number; row: number };
};

/**
 * 支持本地 IndexedDB 缓存、极速 Chrome 原生与多级降级兜底的快捷图标组件
 */
export const ShortcutIconView: React.FC<{ url: string; icon?: string; title: string; sizeClass?: string }> = ({
  url,
  icon,
  title,
  sizeClass = 'w-7 h-7 sm:w-8 sm:h-8',
}) => {
  // 订阅本地 IndexedDB 缓存加载与更新事件
  const [cacheVersion, setCacheVersion] = useState<number>(0);
  React.useEffect(() => {
    return subscribeFaviconCache(() => {
      setCacheVersion((v) => v + 1);
    });
  }, []);

  const candidates = React.useMemo(() => getFaviconCandidates(url, icon), [url, icon, cacheVersion]);
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(false);

  // 当外部 url 或 icon 或缓存更新变更时重置探测状态
  React.useEffect(() => {
    setCandidateIndex(0);
    setHasError(false);
  }, [url, icon, cacheVersion]);

  const currentSrc = candidates[candidateIndex];

  // 图标探测成功后写入本地持久化缓存
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    const loadedSrc = target.currentSrc || currentSrc;
    if (loadedSrc && !loadedSrc.startsWith('data:image/svg+xml;base64,PHN2Zy')) {
      setCachedFavicon(url, loadedSrc);
    }
  };

  const handleImageError = () => {
    setCandidateIndex((prev) => {
      if (prev + 1 < candidates.length) {
        return prev + 1;
      }
      // 所有候选耗尽后，记录失败状态到缓存，避免后续每次打开新标签页重复发起十几个 404 网络请求
      setHasError(true);
      setCachedFaviconFailed(url);
      return prev;
    });
  };

  if (icon === 'avatar:letter' || !currentSrc || hasError) {
    const palette = getAvatarPalette(title || url);
    const char = (title || url || 'A').trim().charAt(0).toUpperCase();
    const isTiny = sizeClass.includes('w-3') || sizeClass.includes('w-4');
    return (
      <div
        style={{ background: palette.background, color: palette.color }}
        className={`${sizeClass} ${
          isTiny ? 'rounded text-[9.5px] leading-none font-bold' : 'rounded-xl text-xs sm:text-sm font-bold'
        } flex items-center justify-center shadow-sm select-none transition-transform duration-200 shrink-0`}
      >
        {char}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={title}
      loading="eager"
      decoding="async"
      draggable={false}
      className={`${sizeClass} object-contain rounded-lg select-none pointer-events-none`}
      onLoad={handleImageLoad}
      onError={handleImageError}
    />
  );
};
/**
 * 文件夹缩略图：大文件夹固定为 3×3，并允许直接打开内部快捷方式。
 */
const FolderThumbnailView: React.FC<{
  folder: SiteShortcut;
  compact?: boolean;
  onChildClick?: (event: React.MouseEvent, child: SiteShortcut) => void;
}> = ({ folder, compact = false, onChildClick }) => {
  const children = (folder.children || []).slice(0, 9);
  const count = children.length;
  const isLarge = !compact && folder.folderSize === '2x2';
  const isNineGrid = isLarge || count > 4;

  return (
    <div
      className={`folder-thumbnail-grid w-full h-full rounded-[inherit] grid ${
        isNineGrid
          ? isLarge ? 'grid-cols-3 grid-rows-3 gap-1.5 p-3 sm:gap-2 sm:p-4' : 'grid-cols-3 gap-0.5 p-1.5'
          : 'grid-cols-2 gap-1 p-1.5'
      } items-center justify-items-center overflow-hidden bg-black/[0.04] dark:bg-white/[0.06]`}
    >
      {children.map((child, idx) => (
        <button
          key={child.id || idx}
          type="button"
          className={`w-full h-full flex items-center justify-center ${isLarge ? 'cursor-pointer rounded-xl hover:bg-white/10 active:scale-90 transition-all' : 'pointer-events-none'}`}
          onClick={isLarge ? (event) => onChildClick?.(event, child) : undefined}
          title={isLarge ? child.title : undefined}
        >
          <ShortcutIconView
            url={child.url}
            icon={child.icon}
            title={child.title}
            sizeClass={isLarge ? 'w-7 h-7 sm:w-8 sm:h-8' : isNineGrid ? 'w-3 h-3' : 'w-4 h-4'}
          />
        </button>
      ))}
      {count === 0 && (
        <div className="col-span-full row-span-full text-neutral-400 dark:text-neutral-500 flex items-center justify-center">
          <Folder size={isLarge ? 24 : 16} />
        </div>

      )}
    </div>
  );
};

const getShortcutSpan = (shortcut: SiteShortcut) =>
  shortcut.isFolder && shortcut.folderSize === '2x2' ? 2 : 1;

/** 桌面网格列数上限（超宽屏也避免出现极长单行） */
const MAX_DESKTOP_COLUMNS = 12;
/** 移动端固定列数（与 CSS 基础值一致） */
const MOBILE_COLUMNS = 4;
/** 桌面断点：与 CSS @media (min-width: 768px) 保持一致 */
const DESKTOP_MIN_WIDTH = 768;
/** 单元格宽度下限：为多排一个图标可以略微收紧，但不能小到标题被截断 */
const MIN_CELL_WIDTH = 72;
/** 列间距下限：图标之间必须留出可辨识的间隔，过窄会糊成一片 */
const MIN_GRID_GAP = 10;

/**
 * 依据「宽度上限 + 当前页图标数」推导桌面网格的列数、单元格宽度与列间距。
 *
 * 宽度上限由调用方传入「搜索框宽度」，因此快捷方式区域（含工具栏与翻页按钮）
 * 永远不会比搜索框更宽，两者左右边界对齐 —— 此前网格会宽出 136px，
 * 明显外扩于搜索框，观感突兀。
 *
 * 同时尽量让所有图标排进一行：先按单元格下限算出上限内最多能塞几列，
 * 再把这几个列宽连同间距均摊到上限宽度上。这样「一行能多放」与「不超出搜索框」
 * 同时成立；只有当图标确实多到一行放不下时才老实换行。
 *
 * 注意：放大的是「列」间距。行间距由 --shortcut-row-gap 单独控制，两者若共用同一
 * 变量，网格高度会被一起撑高，矮屏下会把翻页按钮挤出视口（实测 140% 下溢出 79px）。
 *
 * 列数与单元格宽度必须与 resolveGridPositions() 完全一致，否则拖拽/换页坐标会与
 * 视觉网格错位，因此结果同时写回 CSS 变量与 React state。
 */
function computeGridLayout(
  capWidth: number,
  itemCount: number,
  baseCell: number,
  baseGap: number
): { columns: number; cell: number; gap: number } {
  const cell = Number.isFinite(baseCell) && baseCell > 0 ? baseCell : 80;
  const gap = Number.isFinite(baseGap) && baseGap > 0 ? baseGap : 20;
  const cap = Math.max(0, capWidth);

  if (cap <= 0) {
    return { columns: MOBILE_COLUMNS, cell, gap };
  }

  // 1. 目标列数：所有图标排一行；但不超过列数上限与「上限宽度能容纳的列数」
  const wanted = Math.max(MOBILE_COLUMNS, Math.min(MAX_DESKTOP_COLUMNS, itemCount));
  const maxFit = Math.floor((cap + MIN_GRID_GAP) / (MIN_CELL_WIDTH + MIN_GRID_GAP));
  const columns = Math.max(MOBILE_COLUMNS, Math.min(wanted, Math.max(MOBILE_COLUMNS, maxFit)));

  // 2. 图标是主体，尽量保留基础单元格尺寸；宽度不够时先压间距，再小幅收单元格
  const idealCell = columns > 1 ? (cap - (columns - 1) * MIN_GRID_GAP) / columns : cell;
  const resolvedCell = Math.max(MIN_CELL_WIDTH, Math.min(cell, idealCell));
  const resolvedGap =
    columns > 1
      ? Math.max(MIN_GRID_GAP, Math.min(gap, (cap - columns * resolvedCell) / (columns - 1)))
      : gap;

  return { columns, cell: resolvedCell, gap: resolvedGap };
}

const resolveGridPositions = (
  shortcuts: SiteShortcut[],
  columns: number,
  autoFill = false
) => {
  const positions = new Map<string, { column: number; row: number }>();
  const occupied = new Set<string>();
  const canPlace = (column: number, row: number, span: number) => {
    if (column < 1 || row < 1 || column + span - 1 > columns) return false;
    for (let y = row; y < row + span; y += 1) {
      for (let x = column; x < column + span; x += 1) {
        if (occupied.has(`${x}:${y}`)) return false;
      }
    }
    return true;
  };
  const occupy = (id: string, column: number, row: number, span: number) => {
    positions.set(id, { column, row });
    for (let y = row; y < row + span; y += 1) {
      for (let x = column; x < column + span; x += 1) occupied.add(`${x}:${y}`);
    }
  };

  // 1. 默认不自动补位：严格尊重并锁定每个图标已有的自定义网格坐标
  if (!autoFill) {
    shortcuts.forEach((shortcut) => {
      const span = getShortcutSpan(shortcut);
      const position = shortcut.gridPosition;
      if (position && canPlace(position.column, position.row, span)) {
        occupy(shortcut.id, position.column, position.row, span);
      }
    });

    // 对于未指定坐标的项，按顺序寻找空闲网格填充
    shortcuts.forEach((shortcut) => {
      if (positions.has(shortcut.id)) return;
      const span = getShortcutSpan(shortcut);
      for (let row = 1; ; row += 1) {
        for (let column = 1; column <= columns - span + 1; column += 1) {
          if (canPlace(column, row, span)) {
            occupy(shortcut.id, column, row, span);
            return;
          }
        }
      }
    });
  } else {
    // 2. 开启自动补位：必须按照图标已有的实际空间位置排序（行优先，从上到下、从左到右），严禁使用底层数组索引导致视觉顺序错乱！
    const sorted = [...shortcuts].sort((a, b) => {
      const posA = a.gridPosition;
      const posB = b.gridPosition;
      if (posA && posB) {
        if (posA.row !== posB.row) return posA.row - posB.row;
        return posA.column - posB.column;
      }
      if (posA) return -1;
      if (posB) return 1;
      return 0;
    });

    // 按照正确的空间几何顺序，依次紧密填补空白网格槽位
    sorted.forEach((shortcut) => {
      const span = getShortcutSpan(shortcut);
      for (let row = 1; ; row += 1) {
        for (let column = 1; column <= columns - span + 1; column += 1) {
          if (canPlace(column, row, span)) {
            occupy(shortcut.id, column, row, span);
            return;
          }
        }
      }
    });
  }
  return positions;
};

const findFirstFreePositionForSpan = (
  shortcuts: SiteShortcut[],
  positions: Map<string, { column: number; row: number }>,
  columns: number,
  span: number,
  excludedId?: string
) => {
  const occupied = new Set<string>();
  shortcuts.forEach((shortcut) => {
    if (shortcut.id === excludedId) return;
    const position = positions.get(shortcut.id);
    if (!position) return;
    const shortcutSpan = getShortcutSpan(shortcut);
    for (let row = position.row; row < position.row + shortcutSpan; row += 1) {
      for (let column = position.column; column < position.column + shortcutSpan; column += 1) {
        occupied.add(`${column}:${row}`);
      }
    }
  });
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= columns - span + 1; column += 1) {
      let available = true;
      for (let y = row; y < row + span && available; y += 1) {
        for (let x = column; x < column + span; x += 1) {
          if (occupied.has(`${x}:${y}`)) {
            available = false;
            break;
          }
        }
      }
      if (available) return { column, row };
    }
  }
};

/**
 * 图标候选选择面板
 */
const IconCandidatePicker: React.FC<{
  siteUrl: string;
  title: string;
  selectedUrl?: string;
  onSelect: (url: string) => void;
  language: Language;
}> = ({ siteUrl, title, selectedUrl, onSelect, language }) => {
  const options = React.useMemo(() => getIconCandidateOptions(siteUrl), [siteUrl]);
  const optionsKey = React.useMemo(
    () => options.map((option) => `${option.id}:${option.url}`).join('|'),
    [options]
  );
  const activeOptionsKeyRef = React.useRef(optionsKey);
  activeOptionsKeyRef.current = optionsKey;
  const [failedOptions, setFailedOptions] = useState<{ key: string; urls: Set<string> }>({
    key: optionsKey,
    urls: new Set(),
  });
  const failedUrls = failedOptions.key === optionsKey ? failedOptions.urls : new Set<string>();

  const markOptionFailed = (url: string) => {
    const failedKey = optionsKey;
    setFailedOptions((previous) => {
      if (activeOptionsKeyRef.current !== failedKey) return previous;
      const urls = previous.key === failedKey ? new Set(previous.urls) : new Set<string>();
      urls.add(url);
      return { key: failedKey, urls };
    });
  };

  if (!siteUrl || options.length === 0) return null;

  return (
    <div className="mb-3.5">
      <div className="text-[11px] font-medium opacity-65 mb-1.5 flex items-center justify-between">
        <span>{language === 'zh' ? '图标候选来源 (点击切换)' : 'Icon Candidates (Click to select)'}</span>
        {selectedUrl && (
          <button
            type="button"
            onClick={() => onSelect('')}
            className="text-[11px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
          >
            {language === 'zh' ? '使用智能推荐' : 'Use Recommended'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {options.map((opt) => {
          const hasFailed = failedUrls.has(opt.url);
          const recommendedOption = options.find((option) =>
            option.type !== 'avatar' && !failedUrls.has(option.url)
          );
          const isSelected = !hasFailed && (selectedUrl
            ? selectedUrl === opt.url
            : opt === recommendedOption);

          return (
            <button
              key={opt.id + opt.url}
              type="button"
              disabled={hasFailed}
              onClick={() => onSelect(opt.url)}
              title={hasFailed ? (language === 'zh' ? '该图标暂不可用' : 'Icon unavailable') : undefined}
              className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-colors select-none ${
                hasFailed
                  ? 'border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] opacity-45 cursor-not-allowed'
                  : isSelected
                    ? 'border-blue-500 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/40 cursor-pointer'
                    : 'border-black/5 dark:border-white/10 hover:border-black/20 dark:hover:border-white/25 bg-black/[0.02] dark:bg-white/[0.03] cursor-pointer'
              }`}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                {opt.type === 'avatar' ? (
                  <div
                    style={getAvatarPalette(title || siteUrl)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs"
                  >
                    {(title || siteUrl || 'A').trim().charAt(0).toUpperCase()}
                  </div>
                ) : hasFailed ? (
                  <Globe2 size={22} className="text-neutral-400 dark:text-neutral-500" aria-hidden="true" />
                ) : (
                  <img
                    src={opt.url}
                    alt={opt.name}
                    className="w-7 h-7 object-contain rounded"
                    onError={() => markOptionFailed(opt.url)}
                  />
                )}
              </div>
              <span className="text-[10px] opacity-70 truncate max-w-full text-center leading-tight">
                {language === 'zh' ? opt.name : opt.nameEn}
              </span>
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-xs">
                  <Check size={9} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface ShortcutsProps {
  shortcuts: SiteShortcut[];
  language: Language;
  openInNewTab: boolean;
  theme: 'dark' | 'light' | 'auto';
  glassStyle: {
    blur: number;
    opacity: number;
    borderOpacity: number;
  };
  onAddShortcut: (shortcut: SiteShortcut) => void;
  onEditShortcut: (shortcut: SiteShortcut) => void;
  onReorderShortcuts?: (shortcuts: SiteShortcut[]) => void;
  autoFill?: boolean;
  onToggleAutoFill?: (autoFill: boolean) => void;
  desktopPageCount?: number;
  onUpdatePageCount?: (count: number) => void;
  /** 主屏内容三态；组件内只需区分「快捷方式 / 最近访问」，'off' 时本组件不会被渲染 */
  homeContentMode?: HomeContentMode;
  onUpdateHomeContentMode?: (mode: HomeContentMode) => void;
}

export const Shortcuts: React.FC<ShortcutsProps> = ({
  shortcuts,
  language,
  openInNewTab,
  theme,
  glassStyle,
  onAddShortcut,
  onEditShortcut,
  onReorderShortcuts,
  autoFill = false,
  onToggleAutoFill,
  desktopPageCount = 1,
  onUpdatePageCount,
  homeContentMode,
  onUpdateHomeContentMode,
}) => {
  const t = i18n[language];
  const isDark = theme === 'dark';
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<SiteShortcut | null>(null);
  const [orderedShortcuts, setOrderedShortcuts] = useState<SiteShortcut[]>(shortcuts);
  const orderedShortcutsRef = React.useRef<SiteShortcut[]>(shortcuts);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const draggedIdRef = React.useRef<string | null>(null);
  const dragCommitRef = React.useRef<'none' | 'reorder' | 'merge'>('none');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [insertSide, setInsertSide] = useState<'left' | 'right' | null>(null);
  const isDraggingRef = React.useRef(false);
  // 初始列数先按窗口宽度与图标数粗估，避免首帧按旧写死的 7 列落位后被误固化；
  // useLayoutEffect 会在首次绘制前用真实容器宽度精确校正，用户看不到中间态。
  const [desktopColumns, setDesktopColumns] = useState(() => {
    if (typeof window === 'undefined' || window.innerWidth < DESKTOP_MIN_WIDTH) return MOBILE_COLUMNS;
    return computeGridLayout(window.innerWidth, Math.max(1, shortcuts.length), 80, 20).columns;
  });
  // 布局测量是否已稳定：未稳定前不得固化网格坐标，否则会把错误列数写进用户数据
  const [layoutMeasured, setLayoutMeasured] = useState(false);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  // 快捷方式区域容器：用于把推导出的网格尺寸写回 CSS 变量
  const areaRef = React.useRef<HTMLDivElement | null>(null);
  const dragAnchorRef = React.useRef<{ xRatio: number; yRatio: number } | null>(null);

  // 桌面多分页状态管理 (最多支持 9 页)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const wheelCooldownRef = React.useRef<number>(0);
  const pageHoverTimerRef = React.useRef<number | null>(null);
  const hoveredDotPageRef = React.useRef<number | null>(null);
  const [hoveredDotPage, setHoveredDotPage] = useState<number | null>(null);
  const edgeFlipTimerRef = React.useRef<number | null>(null);
  const edgeFlipDirectionRef = React.useRef<'left' | 'right' | null>(null);
  const [edgeHoverActive, setEdgeHoverActive] = useState<'left' | 'right' | null>(null);
  const lastEdgeFlipTimeRef = React.useRef<number>(0);
  const [pageDotContextMenu, setPageDotContextMenu] = useState<{
    page: number;
    x: number;
    y?: number;
    bottom?: number;
  } | null>(null);

  const maxUsedPage = React.useMemo(() => {
    return Math.max(
      1,
      orderedShortcuts.reduce((max, s) => Math.max(max, s.gridPosition?.page || 1), 1)
    );
  }, [orderedShortcuts]);

  const totalPages = React.useMemo(() => {
    const count = Math.max(1, desktopPageCount || 1, maxUsedPage);
    return Math.min(9, count);
  }, [desktopPageCount, maxUsedPage]);

  const currentPageRef = React.useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = React.useRef(totalPages);
  totalPagesRef.current = totalPages;

  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // 自动收敛此前因异常连环创建导致的大量多余空白页（超过最大使用页 + 1 以上的空白页自动清理）
  React.useEffect(() => {
    if (desktopPageCount && desktopPageCount > maxUsedPage + 1) {
      const trimmed = Math.max(1, maxUsedPage);
      onUpdatePageCount?.(trimmed);
      if (currentPage > trimmed) {
        setCurrentPage(trimmed);
      }
    }
  }, [desktopPageCount, maxUsedPage]);

  // 关键：拖拽期间，正在被拖拽的源节点必须保持在 DOM 树中，绝不能被 React 卸载！
  // 否则 Chromium/WebKit 内核检测到拖拽源节点被从文档中移除会立即强行中断 HTML5 Drag 流程。
  const currentPageShortcuts = React.useMemo(() => {
    const pageItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
    const activeDragId = draggedId || draggedIdRef.current;
    if (activeDragId && !pageItems.some((s) => s.id === activeDragId)) {
      const draggedItem = orderedShortcuts.find((s) => s.id === activeDragId);
      if (draggedItem) {
        return [...pageItems, draggedItem];
      }
    }
    return pageItems;
  }, [orderedShortcuts, currentPage, draggedId]);

  /**
   * 网格列数所依据的图标数量：取**所有分页中最多的那一页**，而不是当前页。
   *
   * 若按当前页计数，切页时列数会随之变化（实测 8 项页 672px、2 项页 380px），
   * 整个网格宽度跟着跳动，翻页时观感非常不稳。按「最宽的一页」计算后，
   * 列数与网格宽度在整个会话中保持恒定，切页只换内容不动布局。
   */
  const gridItemCountForLayout = React.useMemo(() => {
    const perPage = new Map<number, number>();
    for (const s of orderedShortcuts) {
      const p = s.gridPosition?.page || 1;
      perPage.set(p, (perPage.get(p) || 0) + 1);
    }
    let max = 1;
    for (const n of perPage.values()) if (n > max) max = n;
    return max;
  }, [orderedShortcuts]);

  const gridPositions = React.useMemo(() => {
    const pageItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
    return resolveGridPositions(pageItems, desktopColumns, autoFill);
  }, [orderedShortcuts, currentPage, desktopColumns, autoFill]);

  const [gridDropPreview, setGridDropPreview] = useState<{
    column: number;
    row: number;
    span: number;
    valid: boolean;
  } | null>(null);

  const addButtonPosition = React.useMemo(() => {
    const pageItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
    return findFirstFreePositionForSpan(pageItems, gridPositions, desktopColumns, 1);
  }, [orderedShortcuts, currentPage, gridPositions, desktopColumns]);

  const clearEdgeFlipTimer = () => {
    if (edgeFlipTimerRef.current !== null) {
      window.clearTimeout(edgeFlipTimerRef.current);
      edgeFlipTimerRef.current = null;
    }
    edgeFlipDirectionRef.current = null;
    setEdgeHoverActive(null);
  };

  const checkEdgeFlip = (clientX: number, clientY?: number) => {
    if (!isDraggingRef.current) return;
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();

    if (clientY !== undefined) {
      if (clientY < rect.top - 80 || clientY > rect.bottom + 80) {
        clearEdgeFlipTimer();
        return;
      }
    }

    if (Date.now() - lastEdgeFlipTimeRef.current < 600) return;

    const edgeThreshold = 56;
    const isLeftZone = clientX <= rect.left + edgeThreshold;
    const isRightZone = clientX >= rect.right - edgeThreshold;

    const cur = currentPageRef.current;
    const total = totalPagesRef.current;

    if (isLeftZone) {
      if (cur > 1) {
        if (edgeFlipDirectionRef.current !== 'left') {
          clearEdgeFlipTimer();
          edgeFlipDirectionRef.current = 'left';
          setEdgeHoverActive('left');
          edgeFlipTimerRef.current = window.setTimeout(() => {
            const nextCur = currentPageRef.current;
            if (nextCur > 1) {
              lastEdgeFlipTimeRef.current = Date.now();
              handleSwitchPage(nextCur - 1);
            }
            clearEdgeFlipTimer();
          }, 350);
        }
      } else {
        clearEdgeFlipTimer();
      }
    } else if (isRightZone) {
      if (cur < total) {
        if (edgeFlipDirectionRef.current !== 'right') {
          clearEdgeFlipTimer();
          edgeFlipDirectionRef.current = 'right';
          setEdgeHoverActive('right');
          edgeFlipTimerRef.current = window.setTimeout(() => {
            const nextCur = currentPageRef.current;
            const nextTotal = totalPagesRef.current;
            if (nextCur < nextTotal) {
              lastEdgeFlipTimeRef.current = Date.now();
              handleSwitchPage(nextCur + 1);
            }
            clearEdgeFlipTimer();
          }, 350);
        }
      } else {
        clearEdgeFlipTimer();
      }
    } else {
      if (edgeFlipDirectionRef.current !== null) {
        clearEdgeFlipTimer();
      }
    }
  };

  React.useEffect(() => {
    if (!draggedId) return;

    const handleWindowDragOver = (e: DragEvent) => {
      if (!isDraggingRef.current) return;
      checkEdgeFlip(e.clientX, e.clientY);
    };

    window.addEventListener('dragover', handleWindowDragOver);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      clearEdgeFlipTimer();
    };
  }, [draggedId]);

  /**
   * 依据容器真实可用宽度推导列数 / 单元格宽度 / 间距，并写回 CSS 变量。
   *
   * 用 ResizeObserver 而不是只监听 window.resize：uiScale 变化、书签栏显隐、
   * 抽屉开合都会改变可用宽度，这些都不必然触发 window.resize。
   *
   * 图标数量取「所有分页中最多的一页」（gridItemCountForLayout），而非当前页或
   * DOM 查询结果：前者保证切页时列数与网格宽度恒定，后者会把「添加快捷站点」
   * 等磁贴也算进去。
   */
  React.useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const apply = () => {
      const scale = getUiScale();
      // 宽度上限取「搜索框宽度」：快捷方式区域与搜索框左右对齐，不会比它更宽。
      // 找不到搜索框时退回父容器宽度，保证仍有合理上限。
      const searchForm = document.querySelector('.searchbox-slot-responsive form');
      const parent = area.parentElement;
      const hostWidth = searchForm
        ? searchForm.getBoundingClientRect().width / scale
        : parent
          ? parent.getBoundingClientRect().width / scale
          : window.innerWidth / scale;

      if (window.innerWidth < DESKTOP_MIN_WIDTH) {
        // 移动端：沿用 CSS 里的基础变量（4 列），JS 不干预
        area.style.removeProperty('--shortcut-columns');
        area.style.removeProperty('--shortcut-cell-width');
        area.style.removeProperty('--shortcut-grid-gap');
        area.style.removeProperty('--shortcut-area-width');
        setDesktopColumns(MOBILE_COLUMNS);
        setLayoutMeasured(true);
        return;
      }

      // 读取 CSS 中未被 JS 覆盖的基础值（--shortcut-cell-base / --shortcut-grid-gap-base
      // 只在样式表里定义）。绝不能读 JS 自己写回的 --shortcut-columns /
      // --shortcut-cell-width / --shortcut-grid-gap，否则每轮测量都会在上一次的
      // 结果上继续累加（棘轮效应）。
      const cs = getComputedStyle(area);
      const baseCell = parseFloat(cs.getPropertyValue('--shortcut-cell-base'));
      const baseGap = parseFloat(cs.getPropertyValue('--shortcut-grid-gap-base'));

      const layout = computeGridLayout(
        hostWidth,
        Math.max(1, gridItemCountForLayout),
        baseCell,
        baseGap
      );
      area.style.setProperty('--shortcut-columns', String(layout.columns));
      area.style.setProperty('--shortcut-cell-width', `${layout.cell}px`);
      area.style.setProperty('--shortcut-grid-gap', `${layout.gap}px`);
      // 区域整体宽度锁定为搜索框宽度，使工具栏两端与搜索框对齐
      area.style.setProperty('--shortcut-area-width', `${hostWidth}px`);
      setDesktopColumns(layout.columns);
      setLayoutMeasured(true);
    };

    apply();
    const ro = new ResizeObserver(apply);
    // 观察搜索框与父容器：两者任一变化（含 uiScale 变化）都要重新推导
    const searchForm = document.querySelector('.searchbox-slot-responsive form');
    if (searchForm) ro.observe(searchForm);
    if (area.parentElement) ro.observe(area.parentElement);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [gridItemCountForLayout]);
  const clickUnlockTimerRef = React.useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ShortcutContextMenu | null>(null);
  const [gridContextMenu, setGridContextMenu] = useState<GridContextMenu | null>(null);
  const [pendingAddPosition, setPendingAddPosition] = useState<{ column: number; row: number } | null>(null);
  // 「快捷方式设置」下拉菜单开关（锚定工具栏左侧按钮）
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<boolean>(false);

  // 文件夹展开气泡状态
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState<boolean>(false);
  const [folderRenameTitle, setFolderRenameTitle] = useState<string>('');
  const [targetFolderForAdd, setTargetFolderForAdd] = useState<string | null>(null);

  // 悬停 0.5s（500ms）合并判定计时器
  const mergeHoverTimerRef = React.useRef<number | null>(null);
  const mergeHoverTargetRef = React.useRef<string | null>(null);
  const [mergeHoverTargetId, setMergeHoverTargetId] = useState<string | null>(null);

  const clearMergeTimer = () => {
    if (mergeHoverTimerRef.current !== null) {
      window.clearTimeout(mergeHoverTimerRef.current);
      mergeHoverTimerRef.current = null;
    }
    mergeHoverTargetRef.current = null;
    setMergeHoverTargetId(null);
  };

  React.useEffect(() => () => {
    if (mergeHoverTimerRef.current !== null) {
      window.clearTimeout(mergeHoverTimerRef.current);
    }
    if (pageHoverTimerRef.current !== null) {
      window.clearTimeout(pageHoverTimerRef.current);
    }
    clearEdgeFlipTimer();
    if (clickUnlockTimerRef.current !== null) {
      window.clearTimeout(clickUnlockTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!contextMenu && !gridContextMenu && !pageDotContextMenu && !toolbarMenuOpen) return;
    const closeMenu = () => {
      setContextMenu(null);
      setGridContextMenu(null);
      setPageDotContextMenu(null);
      setToolbarMenuOpen(false);
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu, gridContextMenu, pageDotContextMenu, toolbarMenuOpen]);

  React.useEffect(() => {
    orderedShortcutsRef.current = orderedShortcuts;
  }, [orderedShortcuts]);

  React.useEffect(() => {
    // 拖拽期间 props 可能仍是旧顺序，不能覆盖本地预览队列。
    if (isDraggingRef.current) return;
    orderedShortcutsRef.current = shortcuts;
    setOrderedShortcuts(shortcuts);
  }, [shortcuts]);

  // 监听 autoFill 状态变化及自动补位开启时的坐标同步，防止关闭自动补位时坐标回退
  const prevAutoFillRef = React.useRef(autoFill);
  React.useEffect(() => {
    // 布局尚未测量完成时列数仍是粗估，此时固化坐标会把错误列数写进用户数据
    if (!layoutMeasured) return;
    const wasAutoFill = prevAutoFillRef.current;
    prevAutoFillRef.current = autoFill;

    // 1. 从关闭切换为开启（如在设置面板中开启）：仅对当前分页内的图标立即紧凑排列并固化保存坐标
    if (!wasAutoFill && autoFill) {
      const curPageItems = orderedShortcutsRef.current.filter(
        (s) => (s.gridPosition?.page || 1) === currentPage
      );
      const otherPageItems = orderedShortcutsRef.current.filter(
        (s) => (s.gridPosition?.page || 1) !== currentPage
      );
      const sorted = [...curPageItems].sort((a, b) => {
        const posA = a.gridPosition || { column: 1, row: 1 };
        const posB = b.gridPosition || { column: 1, row: 1 };
        if (posA.row !== posB.row) return posA.row - posB.row;
        return posA.column - posB.column;
      });
      const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
      let changed = false;
      const nextCurrent = sorted.map((item) => {
        const targetPos = compactedPositions.get(item.id) || null;
        if (
          !item.gridPosition ||
          !targetPos ||
          item.gridPosition.column !== targetPos.column ||
          item.gridPosition.row !== targetPos.row ||
          item.gridPosition.page !== currentPage
        ) {
          changed = true;
        }
        return {
          ...item,
          gridPosition: targetPos ? { ...targetPos, page: currentPage } : null,
        };
      });
      if (changed) {
        const next = [...nextCurrent, ...otherPageItems];
        orderedShortcutsRef.current = next;
        setOrderedShortcuts(next);
        onReorderShortcuts?.(next);
      }
      return;
    }

    // 2. 从开启切换为关闭（如在设置面板中关闭）：锁定当前分页已补位的绝对坐标，绝不恢复为开启前的空白散落状态
    if (wasAutoFill && !autoFill) {
      let changed = false;
      const next = orderedShortcutsRef.current.map((item) => {
        if ((item.gridPosition?.page || 1) !== currentPage) return item;
        const pos = gridPositions.get(item.id);
        if (
          pos &&
          (!item.gridPosition ||
            item.gridPosition.column !== pos.column ||
            item.gridPosition.row !== pos.row ||
            item.gridPosition.page !== currentPage)
        ) {
          changed = true;
          return { ...item, gridPosition: { ...pos, page: currentPage } };
        }
        return item;
      });
      if (changed) {
        orderedShortcutsRef.current = next;
        setOrderedShortcuts(next);
        onReorderShortcuts?.(next);
      }
      return;
    }

    // 3. 开启自动补位期间（非拖拽中）：若当前分页有未对齐或缺失的坐标，自动保持紧凑网格同步
    if (autoFill && !isDraggingRef.current) {
      let changed = false;
      const next = orderedShortcuts.map((item) => {
        if ((item.gridPosition?.page || 1) !== currentPage) return item;
        const pos = gridPositions.get(item.id);
        if (
          pos &&
          (!item.gridPosition ||
            item.gridPosition.column !== pos.column ||
            item.gridPosition.row !== pos.row ||
            item.gridPosition.page !== currentPage)
        ) {
          changed = true;
          return { ...item, gridPosition: { ...pos, page: currentPage } };
        }
        return item;
      });
      if (changed) {
        orderedShortcutsRef.current = next;
        setOrderedShortcuts(next);
        onReorderShortcuts?.(next);
      }
    }

    // 4. 关闭自动补位状态下（非拖拽中）：为初始或缺少坐标的项（如新安装扩展后的默认快捷方式）固化当前分页的网格坐标
    if (!autoFill && !isDraggingRef.current) {
      let changed = false;
      const next = orderedShortcuts.map((item) => {
        if ((item.gridPosition?.page || 1) !== currentPage) return item;
        if (!item.gridPosition || !item.gridPosition.page) {
          const pos = gridPositions.get(item.id);
          if (pos) {
            changed = true;
            return { ...item, gridPosition: { ...pos, page: currentPage } };
          }
        }
        return item;
      });
      if (changed) {
        orderedShortcutsRef.current = next;
        setOrderedShortcuts(next);
        onReorderShortcuts?.(next);
      }
    }
  }, [autoFill, desktopColumns, gridPositions, orderedShortcuts, onReorderShortcuts, currentPage]);

  /**
   * 列数变化 / 首次测量完成后的自适应重排。
   *
   * 网格坐标会持久化到用户数据里，而列数现在随窗口宽度变化。若不重排，
   * 用户把窗口拉宽后会看到「一行明明放得下 8 个却只排了 7 个、最后 1 个孤零零
   * 掉到第二行」—— 因为旧坐标是按更少的列算出来的。
   *
   * 保守策略：**只在重排能实际减少占用行数时才动手**（即消除"明明放得下却换行"
   * 的空隙）。当用户刻意留白、重排并不会更省行时，完全保持其手工摆放不动。
   */
  const reflow = React.useCallback(() => {
    if (isDraggingRef.current) return;

    const items = orderedShortcutsRef.current;
    const pageItems = items.filter((s) => (s.gridPosition?.page || 1) === currentPage);
    if (pageItems.length === 0) return;
    const otherItems = items.filter((s) => (s.gridPosition?.page || 1) !== currentPage);

    // 当前占用的最大行号（无坐标的项按未定位处理，不参与比较）
    const currentMaxRow = pageItems.reduce(
      (max, s) => Math.max(max, s.gridPosition?.row || 1),
      0
    );

    // 保持既有视觉顺序：先按行、再按列排序（无坐标的排在最后）
    const ordered = [...pageItems].sort((a, b) => {
      const pa = a.gridPosition;
      const pb = b.gridPosition;
      if (pa && pb) {
        if (pa.row !== pb.row) return pa.row - pb.row;
        return pa.column - pb.column;
      }
      if (pa) return -1;
      if (pb) return 1;
      return 0;
    });

    const nextPositions = resolveGridPositions(ordered, desktopColumns, true);
    const packedMaxRow = ordered.reduce((max, item) => {
      const pos = nextPositions.get(item.id);
      return Math.max(max, pos ? pos.row : 0);
    }, 0);

    // 只有在确实能减少行数时才重排，避免打乱用户刻意保留的布局
    if (packedMaxRow === 0 || packedMaxRow >= currentMaxRow) return;

    let changed = false;
    const reflowed = ordered.map((item) => {
      const pos = nextPositions.get(item.id);
      if (!pos) return item;
      const cur = item.gridPosition;
      if (cur && cur.column === pos.column && cur.row === pos.row && cur.page === currentPage) return item;
      changed = true;
      return { ...item, gridPosition: { ...pos, page: currentPage } };
    });
    if (!changed) return;

    const next = [...reflowed, ...otherItems];
    orderedShortcutsRef.current = next;
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
  }, [currentPage, desktopColumns, onReorderShortcuts]);

  // 列数变化时重排（窗口缩放 / 拉宽）
  React.useEffect(() => {
    if (!layoutMeasured) return;
    reflow();
  }, [desktopColumns, layoutMeasured, reflow]);

  // 首次测量完成后补一次：修正历史数据里按旧列数固化的坐标（如升级前写死的 7 列）
  const firstMeasureRef = React.useRef(false);
  React.useEffect(() => {
    if (!layoutMeasured || firstMeasureRef.current) return;
    firstMeasureRef.current = true;
    reflow();
  }, [layoutMeasured, reflow]);

  const [form] = Form.useForm();
  const formUrl = Form.useWatch('url', form);
  const formTitle = Form.useWatch('title', form);
  const formIcon = Form.useWatch('icon', form);

  // 当前正在展开的文件夹对象
  const activeFolder = React.useMemo(() => {
    if (!activeFolderId) return null;
    return orderedShortcuts.find((s) => s.id === activeFolderId && s.isFolder) || null;
  }, [activeFolderId, orderedShortcuts]);

  // 文件夹内子项拖拽与移出状态
  const [draggedChildId, setDraggedChildId] = useState<string | null>(null);
  const [, setDragOverChildId] = useState<string | null>(null);
  const [isDraggingOverBackdrop, setIsDraggingOverBackdrop] = useState<boolean>(false);
  const isChildDraggingRef = React.useRef<boolean>(false);
  // 物理连续形态渐变（Morphing Animation）状态机
  const [folderOriginRect, setFolderOriginRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [, setIsFolderExpanded] = useState<boolean>(false);
  const [isClosingFolder, setIsClosingFolder] = useState<boolean>(false);
  const [cachedFolder, setCachedFolder] = useState<SiteShortcut | null>(null);
  const closingTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (activeFolder) {
      setCachedFolder(activeFolder);
    }
  }, [activeFolder]);


  // 连贯形变收纳退出：干脆平滑地缩回原图标位置
  const handleCloseFolder = React.useCallback(() => {
    if ((!activeFolderId && !cachedFolder) || isClosingFolder) return;
    setIsClosingFolder(true);
    setIsFolderExpanded(false); // 触发变回小卡片
    if (closingTimerRef.current !== null) {
      window.clearTimeout(closingTimerRef.current);
    }
    closingTimerRef.current = window.setTimeout(() => {
      setActiveFolderId(null);
      setIsClosingFolder(false);
      setIsRenamingFolder(false);
      setFolderOriginRect(null);
      closingTimerRef.current = null;
    }, 200);
  }, [activeFolderId, cachedFolder, isClosingFolder]);

  const handleUrlBlur = (inputUrl: string) => {
    if (!inputUrl) return;
    const { domain } = parseDomainAndOrigin(inputUrl);
    if (!domain) return;
    const currentTitle = form.getFieldValue('title');
    if (!currentTitle || !currentTitle.trim()) {
      const clean = domain.replace(/^(www\.)/i, '');
      const mainPart = clean.split('.')[0];
      if (mainPart) {
        const capitalized = mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
        form.setFieldValue('title', capitalized);
      }
    }
  };

  const handleOpenAdd = (position?: { column: number; row: number }) => {
    setEditingShortcut(null);
    setTargetFolderForAdd(null);
    setPendingAddPosition(position ?? addButtonPosition);
    setContextMenu(null);
    setGridContextMenu(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleOpenEdit = (item: SiteShortcut) => {
    setEditingShortcut(item);
    setTargetFolderForAdd(null);
    setPendingAddPosition(null);
    form.setFieldsValue({
      title: item.title,
      url: item.url,
      icon: item.icon,
    });
    setModalOpen(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      let formattedUrl = values.url.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }

      let favicon = values.icon?.trim();
      if (!favicon) {
        favicon = getPrimaryFaviconUrl(formattedUrl);
      }

      if (targetFolderForAdd) {
        // 向指定文件夹内添加或编辑子快捷方式
        const next = orderedShortcuts.map((s) => {
          if (s.id === targetFolderForAdd) {
            const currentChildren = s.children ? [...s.children] : [];
            if (editingShortcut) {
              return {
                ...s,
                children: currentChildren.map((c) =>
                  c.id === editingShortcut.id
                    ? { ...c, title: values.title.trim(), url: formattedUrl, icon: favicon }
                    : c
                ),
              };
            }
            const newChild: SiteShortcut = {
              id: String(Date.now()),
              title: values.title.trim(),
              url: formattedUrl,
              icon: favicon,
            };
            return { ...s, children: [...currentChildren, newChild] };
          }
          return s;
        });
        setOrderedShortcuts(next);
        onReorderShortcuts?.(next);
        setTargetFolderForAdd(null);
        message.success(language === 'zh' ? '已更新文件夹内容' : 'Folder items updated');
      } else if (editingShortcut) {
        onEditShortcut({
          ...editingShortcut,
          title: values.title.trim(),
          url: formattedUrl,
          icon: favicon,
        });
        message.success(language === 'zh' ? '快捷方式已更新' : 'Shortcut updated');
      } else {
        const newShortcut: SiteShortcut = {
          id: String(Date.now()),
          title: values.title.trim(),
          url: formattedUrl,
          icon: favicon,
          gridPosition: pendingAddPosition
            ? { ...pendingAddPosition, page: currentPage }
            : addButtonPosition
              ? { ...addButtonPosition, page: currentPage }
              : undefined,
        };
        onAddShortcut(newShortcut);
        message.success(language === 'zh' ? '添加快捷方式成功' : 'Shortcut added');
      }
      setPendingAddPosition(null);
      setModalOpen(false);
      form.resetFields();
    } catch {
      // Form validation failure
    }
  };

  const handleLinkClick = (url: string) => {
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  const getGridCellFromPointer = (
    clientX: number,
    clientY: number,
    span = 1,
    preserveDragAnchor = false
  ) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (
      clientX < rect.left || clientX > rect.right
      || clientY < rect.top || clientY > rect.bottom
      || rect.width <= 0 || rect.height <= 0
    ) return null;

    const styles = window.getComputedStyle(grid);
    const columnGap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
    const rowGap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
    const columnWidth = (grid.clientWidth - (desktopColumns - 1) * columnGap) / desktopColumns;
    const rowHeight = Number.parseFloat(styles.gridAutoRows)
      || Number.parseFloat(styles.gridTemplateRows)
      || 92;

    // DOMRect 使用变换后的屏幕坐标，而 CSS 网格轨道使用布局坐标；
    // 先反算到网格本地坐标，避免父级缩放或浏览器缩放导致命中偏移。
    const localX = (clientX - rect.left) * (grid.clientWidth / rect.width);
    const localY = (clientY - rect.top) * (grid.clientHeight / rect.height) + grid.scrollTop;
    const columnPitch = columnWidth + columnGap;
    const rowPitch = rowHeight + rowGap;
    const maxColumn = Math.max(1, desktopColumns - span + 1);
    const maxRow = Math.max(1, 3 - span + 1); // 桌面模式单页固定最多 3 行
    const anchor = preserveDragAnchor ? dragAnchorRef.current : null;
    const footprintWidth = span * columnWidth + (span - 1) * columnGap;
    const footprintHeight = span * rowHeight + (span - 1) * rowGap;

    // 拖拽时以卡片左上角为落点基准，并保留鼠标按下时的相对抓取位置。
    // 非拖拽操作（如空白处右键）仍按离指针最近的格子命中。
    const column = anchor
      ? Math.round((localX - anchor.xRatio * footprintWidth) / columnPitch) + 1
      : Math.round((localX - columnWidth / 2) / columnPitch) + 1;
    const row = anchor
      ? Math.round((localY - anchor.yRatio * footprintHeight) / rowPitch) + 1
      : Math.round((localY - rowHeight / 2) / rowPitch) + 1;

    return {
      column: Math.min(maxColumn, Math.max(1, column)),
      row: Math.min(maxRow, Math.max(1, row)),
    };
  };
  const canPlaceSpanAt = (
    sourceId: string,
    column: number,
    row: number,
    sourceSpan: number
  ) => {
    if (
      column < 1 || row < 1
      || column + sourceSpan - 1 > desktopColumns
      || row + sourceSpan - 1 > 3
    ) return false;

    return currentPageShortcuts.every((shortcut) => {
      if (shortcut.id === sourceId) return true;
      const position = gridPositions.get(shortcut.id);
      if (!position) return true;
      const span = getShortcutSpan(shortcut);
      return column + sourceSpan <= position.column
        || position.column + span <= column
        || row + sourceSpan <= position.row
        || position.row + span <= row;
    });
  };

  const canPlaceAt = (sourceId: string, column: number, row: number) => {
    const source = orderedShortcutsRef.current.find((shortcut) => shortcut.id === sourceId);
    return source ? canPlaceSpanAt(sourceId, column, row, getShortcutSpan(source)) : false;
  };

  const canPlaceNewShortcutAt = (column: number, row: number) => {
    if (column < 1 || row < 1 || column > desktopColumns || row > 3) return false;
    return currentPageShortcuts.every((shortcut) => {
      const position = gridPositions.get(shortcut.id);
      if (!position) return true;
      const span = getShortcutSpan(shortcut);
      return column < position.column
        || column >= position.column + span
        || row < position.row
        || row >= position.row + span;
    });
  };

  const getAdjacentDropPosition = (
    sourceId: string,
    targetId: string,
    side: 'left' | 'right'
  ) => {
    const source = orderedShortcutsRef.current.find((item) => item.id === sourceId);
    const target = orderedShortcutsRef.current.find((item) => item.id === targetId);
    const targetPosition = gridPositions.get(targetId);
    if (!source || !target || !targetPosition) return null;
    const column = side === 'left'
      ? targetPosition.column - getShortcutSpan(source)
      : targetPosition.column + getShortcutSpan(target);
    const position = { column, row: targetPosition.row };
    return canPlaceAt(sourceId, position.column, position.row) ? position : null;
  };

  const commitGridPosition = (
    sourceId: string,
    position: { column: number; row: number },
    targetPageOverride?: number
  ) => {
    const targetPage = targetPageOverride ?? currentPageRef.current;
    const current = orderedShortcutsRef.current;
    const sourceItem = current.find((s) => s.id === sourceId);
    if (!sourceItem) return false;

    const sourceOldPage = sourceItem.gridPosition?.page || 1;
    const sourceSpan = getShortcutSpan(sourceItem);

    if (
      position.column < 1 || position.row < 1
      || position.column + sourceSpan - 1 > desktopColumns
      || position.row + sourceSpan - 1 > 3
    ) {
      return false;
    }

    // 针对目标页面的所有快捷方式（排除当前移动的源项）做碰撞检测
    const targetPageItems = current.filter(
      (s) => s.id !== sourceId && (s.gridPosition?.page || 1) === targetPage
    );
    const targetPositions = resolveGridPositions(targetPageItems, desktopColumns, autoFill);
    const hasCollision = targetPageItems.some((item) => {
      const pos = targetPositions.get(item.id);
      if (!pos) return false;
      const span = getShortcutSpan(item);
      return (
        position.column + sourceSpan > pos.column &&
        pos.column + span > position.column &&
        position.row + sourceSpan > pos.row &&
        pos.row + span > position.row
      );
    });

    if (hasCollision) return false;

    const posWithPage = { column: position.column, row: position.row, page: targetPage };
    let updated = current.map((shortcut) => {
      if (shortcut.id === sourceId) {
        return { ...shortcut, gridPosition: posWithPage };
      }
      const itemPage = shortcut.gridPosition?.page || 1;
      if (itemPage === currentPageRef.current) {
        const existingPos = shortcut.gridPosition || gridPositions.get(shortcut.id);
        return {
          ...shortcut,
          gridPosition: existingPos ? { ...existingPos, page: currentPageRef.current } : null,
        };
      }
      return shortcut;
    });

    if (autoFill) {
      const pagesToCompact = new Set([targetPage]);
      if (sourceOldPage !== targetPage) pagesToCompact.add(sourceOldPage);

      for (const p of pagesToCompact) {
        const pageItems = updated.filter((s) => (s.gridPosition?.page || 1) === p);
        const otherItems = updated.filter((s) => (s.gridPosition?.page || 1) !== p);
        const sorted = [...pageItems].sort((a, b) => {
          const posA = a.gridPosition;
          const posB = b.gridPosition;
          if (posA && posB) {
            if (posA.row !== posB.row) return posA.row - posB.row;
            return posA.column - posB.column;
          }
          if (posA) return -1;
          if (posB) return 1;
          return 0;
        });
        const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
        const compactedItems = sorted.map((item) => ({
          ...item,
          gridPosition: compactedPositions.get(item.id)
            ? { ...compactedPositions.get(item.id)!, page: p }
            : item.gridPosition || null,
        }));
        updated = [...compactedItems, ...otherItems];
      }
    }

    dragCommitRef.current = 'reorder';
    orderedShortcutsRef.current = updated;
    setOrderedShortcuts(updated);
    onReorderShortcuts?.(updated);
    return true;
  };

  const handleGridDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggedIdRef.current;
    const source = orderedShortcutsRef.current.find((item) => item.id === sourceId);
    const cell = getGridCellFromPointer(
      e.clientX,
      e.clientY,
      source ? getShortcutSpan(source) : 1,
      true
    );
    if (sourceId && cell) commitGridPosition(sourceId, cell);
    finishDrag();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    if (clickUnlockTimerRef.current !== null) {
      window.clearTimeout(clickUnlockTimerRef.current);
      clickUnlockTimerRef.current = null;
    }
    isDraggingRef.current = true;
    draggedIdRef.current = id;
    dragCommitRef.current = 'none';
    clearMergeTimer();
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {}

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(rect.width, 1)));
    const yRatio = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(rect.height, 1)));
    dragAnchorRef.current = { xRatio, yRatio };

    if (e.dataTransfer.setDragImage) {
      const dragGhost = target.cloneNode(true) as HTMLElement;
      dragGhost.style.position = 'fixed';
      dragGhost.style.top = '-9999px';
      dragGhost.style.left = '-9999px';
      dragGhost.style.width = `${rect.width}px`;
      dragGhost.style.height = `${rect.height}px`;
      dragGhost.style.opacity = '0.98';
      dragGhost.style.transform = 'none';
      dragGhost.style.pointerEvents = 'none';
      dragGhost.style.zIndex = '99999';
      dragGhost.style.borderRadius = '16px';
      dragGhost.style.filter = 'drop-shadow(0 14px 24px rgba(0, 0, 0, 0.35))';
      document.body.appendChild(dragGhost);
      e.dataTransfer.setDragImage(dragGhost, xRatio * rect.width, yRatio * rect.height);
      window.setTimeout(() => dragGhost.remove(), 0);
    }

    window.setTimeout(() => {
      if (draggedIdRef.current === id && dragCommitRef.current === 'none') setDraggedId(id);
    }, 0);
  };

  // 合并使用 ref 中的最新预览顺序，避免计时器闭包读取旧队列。
  const triggerMerge = (sourceId: string, targetId: string) => {
    clearMergeTimer();
    if (dragCommitRef.current === 'merge') return;

    const current = orderedShortcutsRef.current;
    const sourceItem = current.find((s) => s.id === sourceId);
    const targetItem = current.find((s) => s.id === targetId);
    if (!sourceItem || !targetItem || sourceItem.isFolder) return;

    let nextShortcuts: SiteShortcut[];
    if (targetItem.isFolder) {
      nextShortcuts = current
        .filter((s) => s.id !== sourceId)
        .map((s) => s.id === targetId
          ? {
              ...s,
              children: [
                ...(s.children || []),
                {
                  ...sourceItem,
                  isFolder: false,
                  children: undefined,
                  gridPosition: undefined,
                },
              ],
            }
          : {
              ...s,
              gridPosition: s.gridPosition || gridPositions.get(s.id)
                ? { ...(s.gridPosition || gridPositions.get(s.id)!), page: (s.gridPosition?.page || 1) }
                : null,
            });
    } else {
      const targetPosition = gridPositions.get(targetId) || targetItem.gridPosition;
      const targetPage = targetItem.gridPosition?.page || currentPage;
      const targetPosWithPage = targetPosition
        ? { ...targetPosition, page: targetPage }
        : { column: 1, row: 1, page: targetPage };
      const newFolder: SiteShortcut = {
        id: 'folder_' + Date.now(),
        title: language === 'zh' ? '新建文件夹' : 'New Folder',
        url: '',
        isFolder: true,
        gridPosition: targetPosWithPage,
        children: [
          { ...targetItem, isFolder: false, children: undefined, gridPosition: undefined },
          { ...sourceItem, isFolder: false, children: undefined, gridPosition: undefined },
        ],
      };
      nextShortcuts = current
        .filter((s) => s.id !== sourceId)
        .map((s) => (s.id === targetId ? newFolder : {
          ...s,
          gridPosition: s.gridPosition || gridPositions.get(s.id)
            ? { ...(s.gridPosition || gridPositions.get(s.id)!), page: (s.gridPosition?.page || 1) }
            : null,
        }));
    }

    if (autoFill) {
      const curPageItems = nextShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
      const otherPageItems = nextShortcuts.filter((s) => (s.gridPosition?.page || 1) !== currentPage);
      const sorted = [...curPageItems].sort((a, b) => {
        const posA = a.gridPosition || { column: 1, row: 1 };
        const posB = b.gridPosition || { column: 1, row: 1 };
        if (posA.row !== posB.row) return posA.row - posB.row;
        return posA.column - posB.column;
      });
      const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
      const nextCurrent = sorted.map((s) => ({
        ...s,
        gridPosition: compactedPositions.get(s.id)
          ? { ...compactedPositions.get(s.id)!, page: currentPage }
          : null,
      }));
      nextShortcuts = [...nextCurrent, ...otherPageItems];
    }

    dragCommitRef.current = 'merge';
    orderedShortcutsRef.current = nextShortcuts;
    setOrderedShortcuts(nextShortcuts);
    onReorderShortcuts?.(nextShortcuts);
    setDraggedId(null);
    draggedIdRef.current = null;
    dragAnchorRef.current = null;
    setDragOverId(null);
    setInsertSide(null);
    isDraggingRef.current = false;
    message.success(language === 'zh' ? '已合并为文件夹' : 'Merged into folder');
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const sourceId = draggedIdRef.current;
    if (!sourceId || sourceId === targetId) return;

    const draggedItem = orderedShortcutsRef.current.find((s) => s.id === sourceId);
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const isCenterZone = ratioX >= 0.30 && ratioX <= 0.70;

    if (draggedItem && !draggedItem.isFolder && isCenterZone) {
      setDragOverId(null);
      setInsertSide(null);
      if (mergeHoverTargetRef.current !== targetId) {
        clearMergeTimer();
        mergeHoverTargetRef.current = targetId;
        setMergeHoverTargetId(targetId);
        mergeHoverTimerRef.current = window.setTimeout(() => {
          triggerMerge(sourceId, targetId);
        }, 500);
      }
    } else {
      clearMergeTimer();
      setDragOverId(targetId);
      setInsertSide(ratioX < 0.5 ? 'left' : 'right');
    }
  };

  const finishDrag = () => {
    clearMergeTimer();
    clearEdgeFlipTimer();
    if (pageHoverTimerRef.current !== null) {
      window.clearTimeout(pageHoverTimerRef.current);
      pageHoverTimerRef.current = null;
    }
    hoveredDotPageRef.current = null;
    setHoveredDotPage(null);
    setDraggedId(null);
    draggedIdRef.current = null;
    dragAnchorRef.current = null;
    setDragOverId(null);
    setInsertSide(null);
    setGridDropPreview(null);
    // 立即恢复外部数据同步；clickUnlockTimerRef 单独承担释放后的防误触窗口。
    isDraggingRef.current = false;
    if (clickUnlockTimerRef.current !== null) {
      window.clearTimeout(clickUnlockTimerRef.current);
    }
    clickUnlockTimerRef.current = window.setTimeout(() => {
      clickUnlockTimerRef.current = null;
    }, 160);
  };

  const handleDropOnItem = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggedIdRef.current;
    if (!sourceId || sourceId === targetId) {
      finishDrag();
      return;
    }

    const draggedItem = orderedShortcutsRef.current.find((s) => s.id === sourceId);
    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const isCenterZone = ratioX >= 0.30 && ratioX <= 0.70;

    if (draggedItem && !draggedItem.isFolder && isCenterZone) {
      triggerMerge(sourceId, targetId);
      return;
    }
    const side = ratioX < 0.5 ? 'left' : 'right';
    const adjacentPosition = getAdjacentDropPosition(sourceId, targetId, side);
    if (adjacentPosition) commitGridPosition(sourceId, adjacentPosition);
    finishDrag();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // 子元素切换会触发 dragleave；只有真正离开卡片时才清理意图。
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    clearMergeTimer();
    setDragOverId(null);
    setInsertSide(null);
  };

  const handleDragEnd = () => {
    // 浏览器在 drop 后仍会触发 dragend；提交状态由具体 drop 处理。
    finishDrag();
  };

  // 文件夹操作方法
  const handleRenameFolder = (folderId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    setIsRenamingFolder(false);
    if (!trimmed) return;
    const next = orderedShortcuts.map((s) =>
      s.id === folderId ? { ...s, title: trimmed } : s
    );
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
  };

  const handleToggleFolderSize = (folderId: string) => {
    const current = orderedShortcutsRef.current;
    const folder = current.find((shortcut) => shortcut.id === folderId);
    if (!folder) return;
    const isExpanding = folder.folderSize !== '2x2';
    let gridPosition = gridPositions.get(folderId) || folder.gridPosition;
    if (isExpanding && (!gridPosition || !canPlaceSpanAt(folderId, gridPosition.column, gridPosition.row, 2))) {
      gridPosition = findFirstFreePositionForSpan(current, gridPositions, desktopColumns, 2, folderId);
    }
    const next = current.map((shortcut) => shortcut.id === folderId
      ? { ...shortcut, folderSize: isExpanding ? '2x2' as const : '1x1' as const, gridPosition }
      : shortcut);
    orderedShortcutsRef.current = next;
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
  };

  const handleUngroupFolder = (folderId: string) => {
    const folder = orderedShortcuts.find((s) => s.id === folderId);
    if (!folder) return;
    const children = folder.children || [];
    const folderIndex = orderedShortcuts.findIndex((s) => s.id === folderId);
    if (folderIndex === -1) return;
    const next = [...orderedShortcuts];
    next.splice(folderIndex, 1, ...children);
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
    setActiveFolderId(null);
    message.success(language === 'zh' ? '已解散文件夹' : 'Folder ungrouped');
  };

  const handleRemoveChildFromFolder = (folderId: string, childId: string) => {
    const folder = orderedShortcuts.find((s) => s.id === folderId);
    if (!folder || !folder.children) return;
    const targetChild = folder.children.find((c) => c.id === childId);
    if (!targetChild) return;
    const remainingChildren = folder.children.filter((c) => c.id !== childId);

    let next: SiteShortcut[] = [];
    if (remainingChildren.length <= 1) {
      const folderIndex = orderedShortcuts.findIndex((s) => s.id === folderId);
      next = [...orderedShortcuts];
      next.splice(folderIndex, 1, ...remainingChildren, targetChild);
      setActiveFolderId(null);
    } else {
      next = orderedShortcuts.map((s) =>
        s.id === folderId ? { ...s, children: remainingChildren } : s
      );
      const folderIndex = next.findIndex((s) => s.id === folderId);
      next.splice(folderIndex + 1, 0, targetChild);
    }
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
    message.success(language === 'zh' ? '已移出至桌面' : 'Moved to desktop');
  };

  const handleDeleteChildInFolder = (folderId: string, childId: string) => {
    const folder = orderedShortcuts.find((s) => s.id === folderId);
    if (!folder || !folder.children) return;
    const remainingChildren = folder.children.filter((c) => c.id !== childId);
    let next: SiteShortcut[] = [];
    if (remainingChildren.length <= 1) {
      const folderIndex = orderedShortcuts.findIndex((s) => s.id === folderId);
      next = [...orderedShortcuts];
      next.splice(folderIndex, 1, ...remainingChildren);
      setActiveFolderId(null);
    } else {
      next = orderedShortcuts.map((s) =>
        s.id === folderId ? { ...s, children: remainingChildren } : s
      );
    }
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
    message.success(language === 'zh' ? '已删除快捷方式' : 'Shortcut deleted');
  };
  // 文件夹内部拖拽排序与移出
  const handleChildDragStart = (e: React.DragEvent<HTMLDivElement>, child: SiteShortcut) => {
    isChildDraggingRef.current = true;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', child.id);
    } catch {}
    const target = e.currentTarget;
    if (target && e.dataTransfer.setDragImage) {
      const rect = target.getBoundingClientRect();
      const dragGhost = target.cloneNode(true) as HTMLElement;
      dragGhost.style.position = 'absolute';
      dragGhost.style.top = '-9999px';
      dragGhost.style.left = '-9999px';
      dragGhost.style.opacity = '0.96';
      dragGhost.style.transform = 'scale(1.06)';
      dragGhost.style.pointerEvents = 'none';
      dragGhost.style.zIndex = '99999';
      document.body.appendChild(dragGhost);
      e.dataTransfer.setDragImage(dragGhost, rect.width / 2, rect.height / 2);
      window.setTimeout(() => {
        if (document.body.contains(dragGhost)) {
          document.body.removeChild(dragGhost);
        }
      }, 0);
    }
    window.setTimeout(() => {
      setDraggedChildId(child.id);
    }, 0);
  };
  const handleChildDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    folderId: string,
    targetChildId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOverBackdrop(false);
    if (!draggedChildId || draggedChildId === targetChildId) return;
    setDragOverChildId(targetChildId);

    // 文件夹内部实时对调位置，所拖即所见
    const folder = orderedShortcuts.find((s) => s.id === folderId);
    if (!folder || !folder.children) return;

    const children = [...folder.children];
    const fromIndex = children.findIndex((c) => c.id === draggedChildId);
    const toIndex = children.findIndex((c) => c.id === targetChildId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      const [moved] = children.splice(fromIndex, 1);
      children.splice(toIndex, 0, moved);
      const next = orderedShortcuts.map((s) =>
        s.id === folderId ? { ...s, children } : s
      );
      setOrderedShortcuts(next);
      onReorderShortcuts?.(next);
    }
  };
  const handleChildDropOnChild = (
    e: React.DragEvent<HTMLDivElement>,
    folderId: string,
    targetChildId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedChildId || draggedChildId === targetChildId) {
      handleChildDragEnd();
      return;
    }
    const folder = orderedShortcuts.find((s) => s.id === folderId);
    if (!folder || !folder.children) {
      handleChildDragEnd();
      return;
    }
    const children = [...folder.children];
    const fromIndex = children.findIndex((c) => c.id === draggedChildId);
    const toIndex = children.findIndex((c) => c.id === targetChildId);
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      const [moved] = children.splice(fromIndex, 1);
      children.splice(toIndex, 0, moved);
      const next = orderedShortcuts.map((s) =>
        s.id === folderId ? { ...s, children } : s
      );
      setOrderedShortcuts(next);
      onReorderShortcuts?.(next);
    }
    handleChildDragEnd();
  };
  const handleChildDragEnd = () => {
    setDraggedChildId(null);
    setDragOverChildId(null);
    setIsDraggingOverBackdrop(false);
    window.setTimeout(() => {
      isChildDraggingRef.current = false;
    }, 160);
  };
  const handleChildClick = (url: string) => {
    if (isChildDraggingRef.current) return;
    handleLinkClick(url);
  };

  const handleCardClick = (e: React.MouseEvent, item: SiteShortcut) => {
    if (isDraggingRef.current || clickUnlockTimerRef.current !== null) return;
    if (item.isFolder) {
      const box = (e.currentTarget as HTMLElement).querySelector('.folder-icon-box') || (e.currentTarget as HTMLElement);

      const rect = box.getBoundingClientRect();
      setFolderOriginRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      setActiveFolderId(item.id);
    } else {
      handleLinkClick(item.url);
    }
  };

  const handleFolderChildClick = (event: React.MouseEvent, child: SiteShortcut) => {
    event.stopPropagation();
    if (isDraggingRef.current || clickUnlockTimerRef.current !== null) return;
    handleLinkClick(child.url);
  };

  const handleOpenFolderFromMenu = (item: SiteShortcut) => {
    const card = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-shortcut-id]') || [])
      .find((element) => element.dataset.shortcutId === item.id);
    const box = card?.querySelector<HTMLElement>('.folder-icon-box') || card;
    if (box) {
      const rect = box.getBoundingClientRect();
      setFolderOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
    setActiveFolderId(item.id);
  };

  const handleCompactGrid = () => {
    const curPageItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
    const otherPageItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) !== currentPage);
    const sorted = [...curPageItems].sort((a, b) => {
      const posA = gridPositions.get(a.id) || { column: 1, row: 1 };
      const posB = gridPositions.get(b.id) || { column: 1, row: 1 };
      if (posA.row !== posB.row) return posA.row - posB.row;
      return posA.column - posB.column;
    });
    const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
    const nextCurrent = sorted.map((item) => ({
      ...item,
      gridPosition: compactedPositions.get(item.id)
        ? { ...compactedPositions.get(item.id)!, page: currentPage }
        : null,
    }));
    const next = [...nextCurrent, ...otherPageItems];
    setOrderedShortcuts(next);
    if (onReorderShortcuts) {
      onReorderShortcuts(next);
    }
    setGridContextMenu(null);
    message.success(t.gridCompacted);
  };

  const confirmDeleteShortcut = (item: SiteShortcut) => {
    Modal.confirm({
      title: item.isFolder
        ? (language === 'zh' ? `确认删除文件夹「${item.title}」？` : `Delete folder "${item.title}"?`)
        : (language === 'zh' ? `确认删除「${item.title}」？` : `Delete "${item.title}"?`),
      content: item.isFolder
        ? (language === 'zh' ? '文件夹及其包含的快捷方式都将被移除。' : 'The folder and all shortcuts inside it will be removed.')
        : (language === 'zh' ? '该快捷方式将不再显示。' : 'This shortcut will be removed.'),
      okText: language === 'zh' ? '删除' : 'Delete',
      cancelText: language === 'zh' ? '取消' : 'Cancel',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        if (!autoFill) {
          // 默认不自动补位：删除前锁死当前页其余所有图标当前的绝对网格位置，保证删除项原地留白
          const next = orderedShortcuts
            .filter((s) => s.id !== item.id)
            .map((s) => ({
              ...s,
              gridPosition: (s.gridPosition?.page || 1) === currentPage
                ? (s.gridPosition || (gridPositions.get(s.id) ? { ...gridPositions.get(s.id)!, page: currentPage } : null))
                : s.gridPosition || null,
            }));
          orderedShortcutsRef.current = next;
          setOrderedShortcuts(next);
          if (onReorderShortcuts) {
            onReorderShortcuts(next);
          }
        } else {
          // 开启自动补位：删除项后，仅对当前页的图标紧凑补齐空缺
          const remaining = orderedShortcuts.filter((s) => s.id !== item.id);
          const curPageItems = remaining.filter((s) => (s.gridPosition?.page || 1) === currentPage);
          const otherPageItems = remaining.filter((s) => (s.gridPosition?.page || 1) !== currentPage);
          const sorted = [...curPageItems].sort((a, b) => {
            const posA = gridPositions.get(a.id) || a.gridPosition || { column: 1, row: 1 };
            const posB = gridPositions.get(b.id) || b.gridPosition || { column: 1, row: 1 };
            if (posA.row !== posB.row) return posA.row - posB.row;
            return posA.column - posB.column;
          });
          const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
          const nextCurrent = sorted.map((s) => ({
            ...s,
            gridPosition: compactedPositions.get(s.id)
              ? { ...compactedPositions.get(s.id)!, page: currentPage }
              : null,
          }));
          const next = [...nextCurrent, ...otherPageItems];
          orderedShortcutsRef.current = next;
          setOrderedShortcuts(next);
          if (onReorderShortcuts) {
            onReorderShortcuts(next);
          }
        }
      },
    });
  };

  const handleSwitchPage = (targetPage: number) => {
    if (targetPage === currentPage || targetPage < 1 || targetPage > 9) return;
    setSlideDirection(targetPage > currentPage ? 'left' : 'right');
    setCurrentPage(targetPage);
  };

  const handleAddPage = () => {
    if (totalPages >= 9) {
      message.warning(t.maxPagesReached);
      return;
    }
    const newCount = totalPages + 1;
    onUpdatePageCount?.(newCount);
    setSlideDirection('left');
    setCurrentPage(newCount);
  };

  const handleDeletePage = (pageToDelete: number) => {
    if (totalPages <= 1) return;
    setPageDotContextMenu(null);

    const shortcutsOnPage = orderedShortcuts.filter(
      (s) => (s.gridPosition?.page || 1) === pageToDelete
    );

    const executeDelete = () => {
      const targetFallbackPage = Math.max(1, pageToDelete - 1);
      const updatedShortcuts = orderedShortcuts.map((s) => {
        const page = s.gridPosition?.page || 1;
        if (page === pageToDelete) {
          return {
            ...s,
            gridPosition: s.gridPosition
              ? { ...s.gridPosition, page: targetFallbackPage }
              : { column: 1, row: 1, page: targetFallbackPage },
          };
        }
        if (page > pageToDelete) {
          return {
            ...s,
            gridPosition: s.gridPosition
              ? { ...s.gridPosition, page: page - 1 }
              : null,
          };
        }
        return s;
      });

      const newPageCount = Math.max(1, totalPages - 1);
      onUpdatePageCount?.(newPageCount);

      if (currentPage >= pageToDelete) {
        handleSwitchPage(Math.max(1, currentPage - 1));
      }

      setOrderedShortcuts(updatedShortcuts);
      onReorderShortcuts?.(updatedShortcuts);
      message.success(language === 'zh' ? `已删除第 ${pageToDelete} 页` : `Page ${pageToDelete} deleted`);
    };

    if (shortcutsOnPage.length > 0) {
      Modal.confirm({
        title: t.deleteDesktopPage,
        content: t.deleteDesktopPageConfirm.replace('{page}', String(pageToDelete)),
        okText: language === 'zh' ? '删除' : 'Delete',
        cancelText: language === 'zh' ? '取消' : 'Cancel',
        okButtonProps: { danger: true },
        centered: true,
        onOk: executeDelete,
      });
    } else {
      executeDelete();
    }
  };

  const handleCleanEmptyPages = () => {
    setPageDotContextMenu(null);
    if (totalPages <= maxUsedPage) {
      message.info(language === 'zh' ? '暂无多余空白页' : 'No empty pages to clean up');
      return;
    }
    onUpdatePageCount?.(maxUsedPage);
    if (currentPage > maxUsedPage) {
      handleSwitchPage(maxUsedPage);
    }
    message.success(t.cleanEmptyDesktopPagesSuccess);
  };

  const handlePageDotContextMenu = (e: React.MouseEvent, pageIndex: number) => {
    if (totalPages <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setGridContextMenu(null);

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = totalPages > maxUsedPage ? 116 : 76;

    // 注意：rect 与 window.innerWidth/Height 均为「设备空间」（zoom 后的实际像素），
    // 而写入 style.left/top/bottom 的数值属于「布局空间」，两者相差一个缩放倍数，
    // 故先在设备空间完成居中与夹取计算，再统一换算到布局空间。

    // 水平方向：以点击的指示器为中心居中展示，并保留左右安全视口边距
    const targetCenterX = rect.left + rect.width / 2;
    const clampedX = Math.max(12, Math.min(targetCenterX - menuWidth / 2, window.innerWidth - menuWidth - 12));

    // 垂直方向：分页栏处于桌面下方（紧邻底部工具抽屉），优先向上弹出（以 bottom 锚定上方 8px），彻底避免遮挡抽屉与屏幕溢出
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldShowAbove = spaceAbove >= menuHeight + 16 || spaceAbove >= spaceBelow;

    if (shouldShowAbove) {
      setPageDotContextMenu({
        page: pageIndex,
        x: deviceToLayoutPx(clampedX),
        bottom: deviceToLayoutPx(Math.max(12, window.innerHeight - rect.top + 8)),
      });
    } else {
      setPageDotContextMenu({
        page: pageIndex,
        x: deviceToLayoutPx(clampedX),
        y: deviceToLayoutPx(Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 12)),
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (totalPages <= 1 || activeFolderId) return;
    const now = Date.now();
    if (now - wheelCooldownRef.current < 350) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 25) return;

    if (delta > 0) {
      if (currentPage < totalPages) {
        wheelCooldownRef.current = now;
        handleSwitchPage(currentPage + 1);
      }
    } else {
      if (currentPage > 1) {
        wheelCooldownRef.current = now;
        handleSwitchPage(currentPage - 1);
      }
    }
  };

  const contextMenuItem = contextMenu
    ? orderedShortcuts.find((item) => item.id === contextMenu.itemId) || null
    : null;

  const previewSource = orderedShortcuts.find((item) => item.id === draggedId);

  return (
    <div
      ref={areaRef}
      className="group/shortcut-area shortcut-area relative w-full mx-auto min-h-[276px] sm:min-h-[316px]"
      onWheel={handleWheel}
      onDragOver={draggedId ? (e) => { e.preventDefault(); checkEdgeFlip(e.clientX, e.clientY); } : undefined}
    >
      {/* 左右翻页浮动按钮 */}
      {totalPages > 1 || (draggedId && totalPages < 9) ? (
        <>
          {currentPage > 1 && (
            <button
              type="button"
              aria-label={t.prevPage}
              title={t.prevPage}
              onClick={() => handleSwitchPage(currentPage - 1)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (edgeFlipDirectionRef.current !== 'left') {
                  clearEdgeFlipTimer();
                  edgeFlipDirectionRef.current = 'left';
                  setEdgeHoverActive('left');
                  edgeFlipTimerRef.current = window.setTimeout(() => {
                    const nextCur = currentPageRef.current;
                    if (nextCur > 1) {
                      lastEdgeFlipTimeRef.current = Date.now();
                      handleSwitchPage(nextCur - 1);
                    }
                    clearEdgeFlipTimer();
                  }, 300);
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                clearEdgeFlipTimer();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearEdgeFlipTimer();
                const sourceId = draggedIdRef.current;
                const targetPage = currentPageRef.current - 1;
                handleSwitchPage(targetPage);
                if (sourceId) {
                  const targetPageItems = orderedShortcutsRef.current.filter((s) => s.id !== sourceId && (s.gridPosition?.page || 1) === targetPage);
                  const targetPagePositions = resolveGridPositions(targetPageItems, desktopColumns, autoFill);
                  const source = orderedShortcutsRef.current.find((s) => s.id === sourceId);
                  const span = source ? getShortcutSpan(source) : 1;
                  const freePos = findFirstFreePositionForSpan(targetPageItems, targetPagePositions, desktopColumns, span);
                  if (freePos && freePos.row <= 3) {
                    commitGridPosition(sourceId, freePos, targetPage);
                  }
                }
                finishDrag();
              }}
              className={`absolute -left-10 sm:-left-12 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur-xl transition-all cursor-pointer ${
                edgeHoverActive === 'left'
                  ? 'scale-125 !opacity-100 ring-4 ring-blue-400/50 bg-blue-500 text-white border-blue-400'
                  : draggedId
                  ? 'opacity-80 scale-105 hover:!opacity-100'
                  : 'opacity-0 group-hover/shortcut-area:opacity-60 hover:!opacity-100 active:scale-90'
              } ${
                isDark
                  ? 'border-white/15 bg-[#16181f]/80 text-white hover:bg-[#20242d]'
                  : 'border-black/10 bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          {currentPage < totalPages && (
            <button
              type="button"
              aria-label={t.nextPage}
              title={t.nextPage}
              onClick={() => handleSwitchPage(currentPage + 1)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (edgeFlipDirectionRef.current !== 'right') {
                  clearEdgeFlipTimer();
                  edgeFlipDirectionRef.current = 'right';
                  setEdgeHoverActive('right');
                  edgeFlipTimerRef.current = window.setTimeout(() => {
                    const nextCur = currentPageRef.current;
                    const nextTotal = totalPagesRef.current;
                    if (nextCur < nextTotal) {
                      lastEdgeFlipTimeRef.current = Date.now();
                      handleSwitchPage(nextCur + 1);
                    }
                    clearEdgeFlipTimer();
                  }, 300);
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                clearEdgeFlipTimer();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearEdgeFlipTimer();
                const sourceId = draggedIdRef.current;
                const targetPage = currentPageRef.current + 1;
                handleSwitchPage(targetPage);
                if (sourceId) {
                  const targetPageItems = orderedShortcutsRef.current.filter((s) => s.id !== sourceId && (s.gridPosition?.page || 1) === targetPage);
                  const targetPagePositions = resolveGridPositions(targetPageItems, desktopColumns, autoFill);
                  const source = orderedShortcutsRef.current.find((s) => s.id === sourceId);
                  const span = source ? getShortcutSpan(source) : 1;
                  const freePos = findFirstFreePositionForSpan(targetPageItems, targetPagePositions, desktopColumns, span);
                  if (freePos && freePos.row <= 3) {
                    commitGridPosition(sourceId, freePos, targetPage);
                  }
                }
                finishDrag();
              }}
              className={`absolute -right-10 sm:-right-12 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur-xl transition-all cursor-pointer ${
                edgeHoverActive === 'right'
                  ? 'scale-125 !opacity-100 ring-4 ring-blue-400/50 bg-blue-500 text-white border-blue-400'
                  : draggedId
                  ? 'opacity-80 scale-105 hover:!opacity-100'
                  : 'opacity-0 group-hover/shortcut-area:opacity-60 hover:!opacity-100 active:scale-90'
              } ${
                isDark
                  ? 'border-white/15 bg-[#16181f]/80 text-white hover:bg-[#20242d]'
                  : 'border-black/10 bg-white/80 text-neutral-700 hover:bg-white'
              }`}
            >
              <ChevronRight size={20} strokeWidth={2.5} />
            </button>
          )}
        </>
      ) : null}

      {/* 快捷方式工具栏：左侧「快捷方式设置」、右侧「添加快捷站点」 */}
      <div className="shortcut-toolbar mb-3 flex items-center justify-between gap-3 select-none">
        {/* 快捷方式设置菜单 */}
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={toolbarMenuOpen}
            aria-label={t.shortcutSettings}
            title={t.shortcutSettings}
            onClick={(e) => {
              e.stopPropagation();
              setToolbarMenuOpen((prev) => !prev);
            }}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm backdrop-blur-xl transition-all cursor-pointer active:scale-95 ${
              toolbarMenuOpen
                ? isDark
                  ? 'border-white/35 bg-white/15 text-white'
                  : 'border-black/25 bg-white/85 text-neutral-900'
                : isDark
                ? 'border-white/15 bg-white/[0.06] text-white/75 hover:border-white/35 hover:bg-white/12 hover:text-white'
                : 'border-black/12 bg-white/50 text-neutral-600 hover:border-black/25 hover:bg-white/80 hover:text-neutral-900'
            }`}
          >
            <Settings2 size={14} strokeWidth={2.2} className="shrink-0" />
            <span>{t.shortcutSettings}</span>
            <ChevronDown
              size={13}
              strokeWidth={2.4}
              className={`shrink-0 transition-transform duration-200 ${toolbarMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>

            {toolbarMenuOpen && (
              <div
                role="menu"
                aria-label={t.shortcutSettings}
                className={`absolute left-0 top-[calc(100%+8px)] z-[70] w-[264px] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl ${
                  isDark
                    ? 'border-white/15 bg-[#16181f]/95 text-white shadow-black/60'
                    : 'border-black/10 bg-white/95 text-neutral-800 shadow-neutral-900/15'
                }`}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* 1. 主屏展示内容：关闭 / 快捷方式 / 最近访问 */}
                <div className="px-2.5 pt-1.5 pb-2">
                  <div className="text-[11px] font-semibold opacity-55 mb-1.5">{t.homeContentMode}</div>
                  <div className={`flex items-center gap-0.5 rounded-xl p-0.5 ${isDark ? 'bg-white/8' : 'bg-black/6'}`}>
                    {([
                      { value: 'off' as HomeContentMode, label: t.shortcutModeOff, Icon: EyeOff },
                      { value: 'shortcuts' as HomeContentMode, label: t.homeContentShortcuts, Icon: LayoutGrid },
                      { value: 'recent' as HomeContentMode, label: t.homeContentRecent, Icon: HistoryIcon },
                    ]).map(({ value, label, Icon }) => {
                      const active = (homeContentMode ?? 'shortcuts') === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            onUpdateHomeContentMode?.(value);
                            setToolbarMenuOpen(false);
                          }}
                          className={`flex flex-1 items-center justify-center gap-1 rounded-[9px] px-1.5 py-1.5 text-[11px] font-medium transition-all cursor-pointer ${
                            active
                              ? isDark
                                ? 'bg-white/18 text-white shadow-sm'
                                : 'bg-white text-blue-600 shadow-sm'
                              : 'opacity-65 hover:opacity-100'
                          }`}
                        >
                          <Icon size={12} strokeWidth={2.3} className="shrink-0" />
                          <span className="truncate">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                {/* 2. 自动补位开关 */}
                {onToggleAutoFill && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={autoFill}
                    className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => {
                      if (autoFill) {
                        // 关闭自动补位前，确保当前页补位坐标固化锁定
                        const locked = orderedShortcuts.map((item) => {
                          if ((item.gridPosition?.page || 1) !== currentPage) return item;
                          const pos = gridPositions.get(item.id);
                          return {
                            ...item,
                            gridPosition: pos ? { ...pos, page: currentPage } : item.gridPosition || null,
                          };
                        });
                        orderedShortcutsRef.current = locked;
                        setOrderedShortcuts(locked);
                        onReorderShortcuts?.(locked);
                      } else {
                        const currentItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
                        const otherItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) !== currentPage);
                        const sorted = [...currentItems].sort((a, b) => {
                          const posA = a.gridPosition || { column: 1, row: 1 };
                          const posB = b.gridPosition || { column: 1, row: 1 };
                          if (posA.row !== posB.row) return posA.row - posB.row;
                          return posA.column - posB.column;
                        });
                        const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
                        const nextCurrent = sorted.map((item) => ({
                          ...item,
                          gridPosition: compactedPositions.get(item.id)
                            ? { ...compactedPositions.get(item.id)!, page: currentPage }
                            : null,
                        }));
                        const next = [...nextCurrent, ...otherItems];
                        orderedShortcutsRef.current = next;
                        setOrderedShortcuts(next);
                        onReorderShortcuts?.(next);
                      }
                      onToggleAutoFill(!autoFill);
                      setToolbarMenuOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <LayoutGrid size={15} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                      <span className="truncate font-medium">{t.shortcutAutoFillMenu || '自动补位'}</span>
                    </div>
                    {autoFill ? (
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-blue-500 text-white shadow-xs">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-4 w-4 shrink-0 rounded-[5px] border border-neutral-400/60 dark:border-neutral-500/60 bg-transparent" />
                    )}
                  </button>
                )}

                {/* 3. 紧凑重整图标 */}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => {
                    handleCompactGrid();
                    setToolbarMenuOpen(false);
                  }}
                >
                  <Maximize2 size={15} className="shrink-0" />
                  <span>{t.compactGridNow}</span>
                </button>

                <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

                {/* 4. 桌面分页管理 */}
                <div className="px-2.5 pb-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold opacity-55">{t.desktopPagesLabel}</div>
                    <div className="text-[11px] tabular-nums opacity-55">
                      {t.desktopPagesSummary
                        .replace('{total}', String(totalPages))
                        .replace('{used}', String(maxUsedPage))}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={totalPages >= 9}
                      onClick={() => {
                        handleAddPage();
                        setToolbarMenuOpen(false);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-1.5 py-1.5 text-[10.5px] font-medium transition-all ${
                        totalPages >= 9
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/10'
                      } ${isDark ? 'border-white/12' : 'border-black/10'}`}
                    >
                      <Plus size={12} strokeWidth={2.5} />
                      <span>{t.addDesktopPage}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={totalPages <= 1}
                      onClick={() => {
                        handleDeletePage(currentPage);
                        setToolbarMenuOpen(false);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-1.5 py-1.5 text-[10.5px] font-medium transition-all ${
                        totalPages <= 1
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer text-red-500 hover:bg-red-500/10'
                      } ${isDark ? 'border-white/12' : 'border-black/10'}`}
                    >
                      <Trash2 size={12} strokeWidth={2.3} />
                      <span>{t.deleteDesktopPage}</span>
                    </button>
                  </div>
                  {totalPages > maxUsedPage && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        handleCleanEmptyPages();
                        setToolbarMenuOpen(false);
                      }}
                      className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-amber-500 transition-colors cursor-pointer hover:bg-amber-500/10"
                    >
                      <Trash2 size={12} strokeWidth={2.3} />
                      <span>{t.cleanEmptyDesktopPages}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右侧添加入口 */}
          <button
            type="button"
            onClick={() => handleOpenAdd()}
            aria-label={t.addShortcut}
            title={t.addShortcut}
            className={`group/addbtn flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-xs font-medium shadow-sm backdrop-blur-xl transition-all cursor-pointer active:scale-95 ${
              isDark
                ? 'border-white/25 bg-white/[0.06] text-white/75 hover:border-white/50 hover:bg-white/12 hover:text-white'
                : 'border-black/20 bg-white/50 text-neutral-600 hover:border-black/35 hover:bg-white/80 hover:text-neutral-900'
            }`}
          >
            <Plus size={14} strokeWidth={2.5} className="shrink-0 transition-transform duration-200 group-hover/addbtn:rotate-90" />
            <span>{t.addShortcut}</span>
          </button>
      </div>
      <div
        ref={gridRef}
        className={`shortcut-grid ${
          !draggedId && slideDirection === 'left' ? 'desktop-page-slide-left' : ''
        } ${
          !draggedId && slideDirection === 'right' ? 'desktop-page-slide-right' : ''
        }`}
        onAnimationEnd={() => setSlideDirection(null)}
        onDragOver={(e) => {
          const sourceId = draggedIdRef.current;
          if (!sourceId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          checkEdgeFlip(e.clientX, e.clientY);
          clearMergeTimer();
          setDragOverId(null);
          setInsertSide(null);
          const source = orderedShortcutsRef.current.find((item) => item.id === sourceId);
          if (!source) return setGridDropPreview(null);
          const cell = getGridCellFromPointer(
            e.clientX,
            e.clientY,
            getShortcutSpan(source),
            true
          );
          if (!cell) return setGridDropPreview(null);
          const preview = {
            ...cell,
            span: getShortcutSpan(source),
            valid: canPlaceAt(sourceId, cell.column, cell.row),
          };
          setGridDropPreview((current) => current
            && current.column === preview.column
            && current.row === preview.row
            && current.span === preview.span
            && current.valid === preview.valid ? current : preview);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setGridDropPreview(null);
          }
        }}
        onDrop={handleGridDrop}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('[data-shortcut-id]')) return;
          event.preventDefault();
          const pointedCell = getGridCellFromPointer(event.clientX, event.clientY);
          const position = pointedCell && canPlaceNewShortcutAt(pointedCell.column, pointedCell.row)
            ? pointedCell
            : addButtonPosition;
          if (!position) return;
          // clientX/Y 为设备空间坐标，写入 style.left/top 前需换算到布局空间并夹取。
          // 菜单高度按实际渲染留足余量（实测约 131px），避免贴底时溢出屏幕。
          const menuPos = resolveFloatingPosition(event.clientX, event.clientY, 196, 148, 8);
          setContextMenu(null);
          setGridContextMenu({
            position,
            x: menuPos.x,
            y: menuPos.y,
          });
        }}
      >
        {gridDropPreview && previewSource && (
          <div
            aria-hidden="true"
            className={`shortcut-drop-preview ${gridDropPreview.valid ? 'is-valid' : 'is-invalid'}`}
            style={{
              ['--preview-column' as string]: gridDropPreview.column,
              ['--preview-row' as string]: gridDropPreview.row,
              ['--preview-span' as string]: gridDropPreview.span,
            }}
          />
        )}
        {currentPageShortcuts.map((item) => {
          const isFromDifferentPage = (item.gridPosition?.page || 1) !== currentPage;
          const isDragging = draggedId === item.id;
          const isDragTarget = dragOverId === item.id && !isDragging;
          const draggedItem = orderedShortcuts.find((s) => s.id === draggedId);
          const canMerge = draggedItem && !draggedItem.isFolder;
          const isMergeTarget = canMerge && mergeHoverTargetId === item.id && !isDragging;
          const isLargeFolder = item.isFolder && item.folderSize === '2x2';
          const gridPosition = gridPositions.get(item.id);
          const insertionClass = isDragTarget && insertSide
            ? insertSide === 'left'
              ? 'shortcut-insert-before'
              : 'shortcut-insert-after'
            : '';

          return (
            <div
              key={item.id}
              data-shortcut-id={item.id}
              draggable
              onDragStart={(e) => handleDragStart(e, item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDropOnItem(e, item.id)}
              className={`group relative flex flex-col items-center cursor-default select-none transition-all duration-200 ${
                isLargeFolder ? 'shortcut-grid-item-large' : 'shortcut-grid-item'
              } ${insertionClass} ${
                isFromDifferentPage
                  ? 'opacity-0 pointer-events-none'
                  : (activeFolderId === item.id || (isClosingFolder && cachedFolder?.id === item.id))
                  ? 'opacity-0 pointer-events-none scale-90'
                  : isDragging
                  ? 'opacity-25 scale-95'
                  : isMergeTarget
                  ? 'shortcut-merge-target scale-110 ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent shadow-2xl z-20'
                  : isDragTarget
                  ? 'scale-105'
                  : 'opacity-100 active:scale-95'
              }`}
              style={
                isFromDifferentPage
                  ? {
                      position: 'fixed',
                      left: -9999,
                      top: -9999,
                      width: 1,
                      height: 1,
                      opacity: 0,
                      pointerEvents: 'none',
                    }
                  : {
                      gridColumnStart: gridPosition?.column,
                      gridRowStart: gridPosition?.row,
                    }
              }
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const menuWidth = 196;
                // 实测高度：普通快捷方式约 163px、文件夹约 214px，均留出余量以避免贴底溢出
                const menuHeight = item.isFolder ? 226 : 176;
                // 同上：clientX/Y 为设备空间，需换算到布局空间并夹取
                const menuPos = resolveFloatingPosition(event.clientX, event.clientY, menuWidth, menuHeight, 8);
                setGridContextMenu(null);
                setContextMenu({
                  itemId: item.id,
                  x: menuPos.x,
                  y: menuPos.y,
                });
              }}
              onClick={(e) => handleCardClick(e, item)}
            >
              {/* Icon Container */}
              <div
                className={`folder-icon-box flex items-center justify-center shadow-lg transition-all duration-200 overflow-hidden border ${
                  isLargeFolder ? 'w-full aspect-square shrink-0 rounded-[20px]' : 'w-13 h-13 sm:w-14 sm:h-14 rounded-2xl'
                } ${
                  isDark
                    ? 'border-white/16 group-hover:border-white/60 group-hover:bg-white/10 group-active:bg-white/15'
                    : 'border-white/75 group-hover:border-white group-hover:bg-white/80 group-active:bg-white/90'
                }`}
                style={{
                  backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                  WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                  backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
                  boxShadow: isDark
                    ? '0 10px 25px -5px rgba(0, 0, 0, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)'
                    : '0 10px 25px -5px rgba(0, 0, 0, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
                }}
              >
                {item.isFolder ? (
                  <FolderThumbnailView folder={item} onChildClick={handleFolderChildClick} />
                ) : (
                  <ShortcutIconView
                    url={item.url}
                    icon={item.icon}
                    title={item.title}
                  />
                )}
              </div>

              {/* Title label */}
              <span className="mt-2 text-xs text-white/90 font-medium truncate max-w-full text-center drop-shadow-sm group-hover:text-white transition-colors">
                {item.title}
              </span>

            </div>
          );
        })}

      </div>

      {/* 底部毛玻璃分页指示器 */}
      <div className="desktop-pagination-container flex items-center justify-center mt-3 select-none">
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-xl transition-all ${
              isDark
                ? 'bg-black/30 border-white/10 text-white'
                : 'bg-white/45 border-black/10 text-neutral-800'
            }`}
            onContextMenu={(e) => {
              if (e.target === e.currentTarget && totalPages > 1) {
                handlePageDotContextMenu(e, currentPage);
              }
            }}
          >
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageIndex) => {
              const isActive = pageIndex === currentPage;
              const isHoveredByDrag = hoveredDotPage === pageIndex;
              return (
                <div
                  key={pageIndex}
                  role="button"
                  tabIndex={0}
                  aria-label={t.desktopPageIndex.replace('{page}', String(pageIndex))}
                  title={t.desktopPageIndex.replace('{page}', String(pageIndex))}
                  onClick={() => handleSwitchPage(pageIndex)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSwitchPage(pageIndex);
                    }
                  }}
                  onContextMenu={(e) => handlePageDotContextMenu(e, pageIndex)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (hoveredDotPageRef.current !== pageIndex) {
                      if (pageHoverTimerRef.current !== null) {
                        window.clearTimeout(pageHoverTimerRef.current);
                        pageHoverTimerRef.current = null;
                      }
                      hoveredDotPageRef.current = pageIndex;
                      setHoveredDotPage(pageIndex);
                      if (pageIndex !== currentPageRef.current) {
                        pageHoverTimerRef.current = window.setTimeout(() => {
                          handleSwitchPage(pageIndex);
                          pageHoverTimerRef.current = null;
                        }, 350);
                      }
                    }
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    if (hoveredDotPageRef.current === pageIndex) {
                      if (pageHoverTimerRef.current !== null) {
                        window.clearTimeout(pageHoverTimerRef.current);
                        pageHoverTimerRef.current = null;
                      }
                      hoveredDotPageRef.current = null;
                      setHoveredDotPage(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pageHoverTimerRef.current !== null) {
                      window.clearTimeout(pageHoverTimerRef.current);
                      pageHoverTimerRef.current = null;
                    }
                    hoveredDotPageRef.current = null;
                    setHoveredDotPage(null);
                    clearEdgeFlipTimer();

                    const sourceId = draggedIdRef.current;
                    if (!sourceId) {
                      finishDrag();
                      return;
                    }
                    handleSwitchPage(pageIndex);
                    const targetPageItems = orderedShortcutsRef.current.filter(
                      (s) => s.id !== sourceId && (s.gridPosition?.page || 1) === pageIndex
                    );
                    const targetPagePositions = resolveGridPositions(targetPageItems, desktopColumns, autoFill);
                    const source = orderedShortcutsRef.current.find((s) => s.id === sourceId);
                    const span = source ? getShortcutSpan(source) : 1;
                    const freePos = findFirstFreePositionForSpan(targetPageItems, targetPagePositions, desktopColumns, span);
                    if (freePos && freePos.row <= 3) {
                      commitGridPosition(sourceId, freePos, pageIndex);
                    }
                    finishDrag();
                  }}
                  className="flex items-center justify-center px-0.5 py-1 cursor-pointer"
                >
                  <span
                    className={`block transition-all duration-300 rounded-full ${
                      isActive
                        ? 'w-5 h-2 bg-blue-500 dark:bg-blue-400 shadow-sm'
                        : isHoveredByDrag
                        ? 'w-4 h-2.5 bg-blue-400 ring-2 ring-blue-400/60 shadow-md scale-125'
                        : 'w-2 h-2 bg-neutral-400/50 hover:bg-neutral-500/80 dark:bg-white/30 dark:hover:bg-white/60'
                    }`}
                  />
                </div>
              );
            })}

            {/* 新建分页按钮 */}
            {totalPages < 9 && (
              <button
                type="button"
                aria-label={t.addDesktopPage}
                title={t.addDesktopPage}
                onClick={handleAddPage}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                  if (hoveredDotPageRef.current !== -1) {
                    hoveredDotPageRef.current = -1;
                    setHoveredDotPage(-1);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  if (hoveredDotPageRef.current === -1) {
                    hoveredDotPageRef.current = null;
                    setHoveredDotPage(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  hoveredDotPageRef.current = null;
                  setHoveredDotPage(null);
                  clearEdgeFlipTimer();

                  const sourceId = draggedIdRef.current;
                  if (!sourceId) {
                    finishDrag();
                    return;
                  }
                  const newPage = totalPages + 1;
                  onUpdatePageCount?.(newPage);
                  handleSwitchPage(newPage);
                  commitGridPosition(sourceId, { column: 1, row: 1 }, newPage);
                  finishDrag();
                }}
                className={`flex items-center justify-center rounded-full transition-all cursor-pointer ${
                  hoveredDotPage === -1
                    ? 'h-4.5 w-4.5 bg-blue-500 text-white scale-110 shadow-md ring-2 ring-blue-400/50'
                    : 'h-3.5 w-3.5 text-neutral-400 hover:text-blue-500 dark:text-neutral-400 dark:hover:text-blue-400 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <Plus size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
      </div>

      {/* 分页圆点右键快捷菜单 */}
      {pageDotContextMenu && (
        <div
          role="menu"
          aria-label={t.deleteDesktopPage}
          className={`fixed z-[90] w-[176px] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl transition-opacity duration-150 ${
            isDark
              ? 'border-white/15 bg-[#16181f]/95 text-white shadow-black/60'
              : 'border-black/10 bg-white/95 text-neutral-800 shadow-neutral-900/15'
          }`}
          style={{
            left: pageDotContextMenu.x,
            ...(pageDotContextMenu.bottom !== undefined
              ? { bottom: pageDotContextMenu.bottom }
              : { top: pageDotContextMenu.y }),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold opacity-65 border-b border-black/5 dark:border-white/10 mb-1">
            <span>{t.desktopPageIndex.replace('{page}', String(pageDotContextMenu.page))}</span>
            {currentPage === pageDotContextMenu.page && (
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500 dark:text-blue-400">
                {language === 'zh' ? '当前页' : 'Current'}
              </span>
            )}
          </div>
          <button
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-left text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer active:scale-[0.98]"
            onClick={() => handleDeletePage(pageDotContextMenu.page)}
          >
            <Trash2 size={14} className="shrink-0" />
            <span className="truncate">{t.deleteDesktopPage}</span>
          </button>
          {totalPages > maxUsedPage && (
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-left text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer border-t border-black/5 dark:border-white/10 mt-1 pt-1.5 active:scale-[0.98]"
              onClick={handleCleanEmptyPages}
            >
              <Trash2 size={14} className="shrink-0" />
              <span className="truncate">{t.cleanEmptyDesktopPages}</span>
            </button>
          )}
        </div>
      )}

      {gridContextMenu && (
        <div
          role="menu"
          aria-label={language === 'zh' ? '桌面空白处操作菜单' : 'Empty grid actions'}
          className={`fixed z-[80] w-[196px] rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl ${
            isDark
              ? 'border-white/15 bg-[#16181f]/92 text-white'
              : 'border-black/10 bg-white/92 text-neutral-800'
          }`}
          style={{ left: gridContextMenu.x, top: gridContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => handleOpenAdd(gridContextMenu.position)}
          >
            <Plus size={15} />
            <span>{t.addShortcut}</span>
          </button>

          <div className="my-1 h-px bg-black/5 dark:bg-white/10" />

          {onToggleAutoFill && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10 select-none"
              onClick={() => {
                if (autoFill) {
                  // 关闭自动补位前，确保当前页所有图标的补位坐标固化锁定
                  const locked = orderedShortcuts.map((item) => {
                    if ((item.gridPosition?.page || 1) !== currentPage) return item;
                    const pos = gridPositions.get(item.id);
                    return {
                      ...item,
                      gridPosition: pos ? { ...pos, page: currentPage } : item.gridPosition || null,
                    };
                  });
                  orderedShortcutsRef.current = locked;
                  setOrderedShortcuts(locked);
                  onReorderShortcuts?.(locked);
                } else {
                  // 开启自动补位时，仅对当前页执行紧凑重排并固化保存
                  const currentItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) === currentPage);
                  const otherItems = orderedShortcuts.filter((s) => (s.gridPosition?.page || 1) !== currentPage);
                  const sorted = [...currentItems].sort((a, b) => {
                    const posA = a.gridPosition || { column: 1, row: 1 };
                    const posB = b.gridPosition || { column: 1, row: 1 };
                    if (posA.row !== posB.row) return posA.row - posB.row;
                    return posA.column - posB.column;
                  });
                  const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
                  const nextCurrent = sorted.map((item) => ({
                    ...item,
                    gridPosition: compactedPositions.get(item.id)
                      ? { ...compactedPositions.get(item.id)!, page: currentPage }
                      : null,
                  }));
                  const next = [...nextCurrent, ...otherItems];
                  orderedShortcutsRef.current = next;
                  setOrderedShortcuts(next);
                  onReorderShortcuts?.(next);
                }
                onToggleAutoFill(!autoFill);
                setGridContextMenu(null);
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <LayoutGrid size={15} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                <span className="truncate font-medium">{t.shortcutAutoFillMenu || '自动补位'}</span>
              </div>
              {autoFill ? (
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-blue-500 text-white shadow-xs">
                  <Check size={12} strokeWidth={3} />
                </div>
              ) : (
                <div className="h-4 w-4 shrink-0 rounded-[5px] border border-neutral-400/60 dark:border-neutral-500/60 bg-transparent" />
              )}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            onClick={handleCompactGrid}
          >
            <Maximize2 size={15} />
            <span>{t.compactGridNow}</span>
          </button>
        </div>
      )}

      {contextMenu && contextMenuItem && (
        <div
          role="menu"
          aria-label={language === 'zh' ? `${contextMenuItem.title} 操作菜单` : `${contextMenuItem.title} actions`}
          className={`fixed z-[80] w-[196px] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl ${
            isDark
              ? 'border-white/15 bg-[#16181f]/92 text-white'
              : 'border-black/10 bg-white/92 text-neutral-800'
          }`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-2.5 py-2 text-xs font-semibold truncate opacity-65">
            {contextMenuItem.title}
          </div>
          <button
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            onClick={() => {
              setContextMenu(null);
              if (contextMenuItem.isFolder) handleOpenFolderFromMenu(contextMenuItem);
              else handleLinkClick(contextMenuItem.url);
            }}
          >
            {contextMenuItem.isFolder ? <Folder size={15} /> : <ExternalLink size={15} />}
            <span>{contextMenuItem.isFolder ? (language === 'zh' ? '打开文件夹' : 'Open folder') : (language === 'zh' ? '打开快捷方式' : 'Open shortcut')}</span>
          </button>
          {contextMenuItem.isFolder ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => {
                  setContextMenu(null);
                  handleToggleFolderSize(contextMenuItem.id);
                }}
              >
                {contextMenuItem.folderSize === '2x2' ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                <span>{contextMenuItem.folderSize === '2x2' ? (language === 'zh' ? '缩小为 1×1' : 'Shrink to 1×1') : (language === 'zh' ? '放大为 2×2' : 'Enlarge to 2×2')}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => {
                  setContextMenu(null);
                  handleUngroupFolder(contextMenuItem.id);
                }}
              >
                <Ungroup size={15} />
                <span>{language === 'zh' ? '解散文件夹' : 'Ungroup folder'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              onClick={() => {
                setContextMenu(null);
                handleOpenEdit(contextMenuItem);
              }}
            >
              <Edit2 size={15} />
              <span>{language === 'zh' ? '编辑快捷方式' : 'Edit shortcut'}</span>
            </button>
          )}
          <div className="my-1 h-px bg-black/8 dark:bg-white/10" />
          <button
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-left text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            onClick={() => {
              setContextMenu(null);
              confirmDeleteShortcut(contextMenuItem);
            }}
          >
            <Trash2 size={15} />
            <span>{contextMenuItem.isFolder ? (language === 'zh' ? '删除文件夹' : 'Delete folder') : (language === 'zh' ? '删除快捷方式' : 'Delete shortcut')}</span>
          </button>
        </div>
      )}

      {/* Ant Design Modal for Add/Edit */}
      <Modal
        title={editingShortcut ? t.editShortcut : t.addShortcut}
        open={modalOpen}
        onOk={handleFormSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditingShortcut(null);
          setTargetFolderForAdd(null);
          setPendingAddPosition(null);
          form.resetFields();
        }}
        okText={t.save}
        cancelText={t.cancel}
        width={420}
        centered
        destroyOnClose
        styles={{
          mask: {
            backdropFilter: 'blur(1px)',
            WebkitBackdropFilter: 'blur(1px)',
          },
        }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="title"
            label={t.siteName}
            rules={[{ required: true, message: language === 'zh' ? '请输入站点名称' : 'Please enter site name' }]}
          >
            <Input
              prefix={<Globe2 size={14} className="text-gray-400" />}
              placeholder="e.g. GitHub"
              maxLength={20}
            />
          </Form.Item>

          <Form.Item
            name="url"
            label={t.siteUrl}
            rules={[{ required: true, message: language === 'zh' ? '请输入站点链接' : 'Please enter site URL' }]}
          >
            <Input
              prefix={<Link size={14} className="text-gray-400" />}
              placeholder="https://example.com"
              onBlur={(e) => handleUrlBlur(e.target.value)}
            />
          </Form.Item>

          {formUrl && (
            <IconCandidatePicker
              siteUrl={formUrl}
              title={formTitle || ''}
              selectedUrl={formIcon}
              onSelect={(chosenUrl) => form.setFieldValue('icon', chosenUrl)}
              language={language}
            />
          )}

          <Form.Item
            name="icon"
            label={language === 'zh' ? '自定义图标地址 (可选)' : 'Custom Icon URL (Optional)'}
          >
            <Input placeholder="https://example.com/favicon.ico" />
          </Form.Item>
        </Form>
      </Modal>
      {/* iOS 风格文件夹展开毛玻璃气泡（带真正原位连贯形变动画） */}
      {(activeFolder || isClosingFolder) && (activeFolder || cachedFolder) && (() => {
        const displayFolder = (activeFolder || cachedFolder)!;
        // 形变位移与缩放作用在布局空间的元素上，而 folderOriginRect / innerWidth 都是设备空间，
        // 因此统一换算到布局空间，否则缩放越大、气泡起始位置偏得越远。
        const fromX = folderOriginRect
          ? Math.round(deviceToLayoutPx(folderOriginRect.left + folderOriginRect.width / 2) - getLayoutViewport().width / 2)
          : 0;
        const fromY = folderOriginRect
          ? Math.round(deviceToLayoutPx(folderOriginRect.top + folderOriginRect.height / 2) - getLayoutViewport().height / 2)
          : 0;
        const scaleX = folderOriginRect ? (Math.max(32, deviceToLayoutPx(folderOriginRect.width)) / 340).toFixed(4) : '0.16';
        const scaleY = folderOriginRect ? (Math.max(32, deviceToLayoutPx(folderOriginRect.height)) / 240).toFixed(4) : '0.22';
        return (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
              isClosingFolder ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            onClick={handleCloseFolder}
            onDragOver={(e) => {
              if (draggedChildId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setIsDraggingOverBackdrop(true);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) {
                setIsDraggingOverBackdrop(false);
              }
            }}
            onDrop={(e) => {
              if (draggedChildId && displayFolder) {
                e.preventDefault();
                handleRemoveChildFromFolder(displayFolder.id, draggedChildId);
                handleChildDragEnd();
              }
            }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none backdrop-blur-[1px]"
            />
            {/* 拖拽到卡片外移出到桌面的视觉引导 */}
            {/* 仅在真正拖拽到卡片外时，才显示移出桌面的引导提示 */}
            {draggedChildId && isDraggingOverBackdrop && (
              <div className="absolute top-10 z-20 flex items-center gap-2 px-5 py-2 rounded-full font-medium text-xs shadow-2xl transition-all pointer-events-none bg-blue-500 text-white scale-110 ring-4 ring-blue-500/30 animate-bounce">
                <CornerUpLeft size={14} />
                <span>{language === 'zh' ? '松开鼠标即可移出到桌面' : 'Release to move to desktop'}</span>
              </div>
            )}
            <div
              className={`relative z-10 w-[320px] sm:w-[350px] p-5 rounded-3xl shadow-2xl border select-none ${
                isClosingFolder ? 'folder-morph-close' : 'folder-morph-open'
              } ${
                isDark
                  ? 'bg-[#16181f]/85 border-white/18 text-white'
                  : 'bg-white/85 border-black/10 text-neutral-800'
              }`}
              style={{
                ['--morph-from-x' as string]: `${fromX}px`,
                ['--morph-from-y' as string]: `${fromY}px`,
                ['--morph-scale-x' as string]: `${scaleX}`,
                ['--morph-scale-y' as string]: `${scaleY}`,
                backdropFilter: 'blur(32px) saturate(190%)',
                WebkitBackdropFilter: 'blur(32px) saturate(190%)',
                boxShadow: isDark
                  ? '0 24px 48px -12px rgba(0, 0, 0, 0.65), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)'
                  : '0 24px 48px -12px rgba(0, 0, 0, 0.12), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
              }}
              onClick={(e) => e.stopPropagation()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverBackdrop(false);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingOverBackdrop(false);
              }}
              onDrop={(e) => {
                e.stopPropagation();
              }}
            >
            {/* 顶部标题行（支持点击内联重命名） */}
            <div className="flex items-center justify-between pb-3.5 mb-3">
              <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                <Folder size={18} className="text-blue-500 shrink-0" />
                {isRenamingFolder ? (
                  <input
                    type="text"
                    value={folderRenameTitle}
                    onChange={(e) => setFolderRenameTitle(e.target.value)}
                    onBlur={() => handleRenameFolder(displayFolder.id, folderRenameTitle)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(displayFolder.id, folderRenameTitle);
                      if (e.key === 'Escape') setIsRenamingFolder(false);
                    }}
                    className="w-full text-base font-bold bg-transparent border-b border-blue-500 outline-none px-1 text-neutral-900 dark:text-white"
                  />
                ) : (
                  <div
                    onClick={() => {
                      setFolderRenameTitle(displayFolder.title);
                      setIsRenamingFolder(true);
                    }}
                    className="flex items-center gap-1.5 cursor-pointer group/title truncate"
                    title={language === 'zh' ? '点击修改文件夹名称' : 'Click to rename folder'}
                  >
                    <span className="text-base font-bold truncate text-white dark:text-white">
                      {displayFolder.title}
                    </span>
                  </div>
                )}
              </div>

              {/* 右侧文件夹操作；关闭仅通过点击外侧遮罩 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingShortcut(null);
                    setTargetFolderForAdd(displayFolder.id);
                    form.resetFields();
                    setModalOpen(true);
                  }}
                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  title={language === 'zh' ? '添加网址至此文件夹' : 'Add site to folder'}
                >
                  <Plus size={12} />
                  <span>{language === 'zh' ? '添加' : 'Add'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFolderSize(displayFolder.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center opacity-65 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title={displayFolder.folderSize === '2x2' ? (language === 'zh' ? '缩小为 1×1' : 'Shrink to 1×1') : (language === 'zh' ? '放大为 2×2' : 'Enlarge to 2×2')}
                >
                  {displayFolder.folderSize === '2x2' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleUngroupFolder(displayFolder.id)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full opacity-65 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title={language === 'zh' ? '解散文件夹' : 'Ungroup folder'}
                >
                  <Ungroup size={13} />
                  <span>{language === 'zh' ? '解散' : 'Ungroup'}</span>
                </button>
              </div>
            </div>

            {/* 文件夹内部快捷方式网格 */}
            {/* 文件夹内部快捷方式网格 */}
            <div className="folder-items-spread grid grid-cols-3 gap-y-4 gap-x-3 items-center justify-items-center max-h-[calc(var(--viewport-height)*0.55)] overflow-y-auto custom-scrollbar p-1">
              {(displayFolder.children || []).map((child) => {
                const isChildDragging = draggedChildId === child.id;
                return (
                  <div
                    key={child.id}
                    draggable={true}
                    onDragStart={(e) => handleChildDragStart(e, child)}
                    onDragOver={(e) => handleChildDragOver(e, displayFolder.id, child.id)}
                    onDragEnd={handleChildDragEnd}
                    onDrop={(e) => handleChildDropOnChild(e, displayFolder.id, child.id)}
                    className={`group/child relative flex flex-col items-center cursor-default select-none transition-all duration-200 w-18 sm:w-20 ${
                      isChildDragging
                        ? 'opacity-25 scale-95'
                        : 'opacity-100 active:scale-95'
                    }`}
                    onClick={() => handleChildClick(child.url)}
                  >
                  <div
                    className={`pointer-events-none w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 overflow-hidden border ${
                      isDark
                        ? 'border-white/16 bg-white/10 group-hover/child:border-white/60 group-hover/child:bg-white/15'
                        : 'border-white/75 bg-white/70 group-hover/child:border-white group-hover/child:bg-white/90'
                    }`}
                  >
                    <ShortcutIconView
                      url={child.url}
                      icon={child.icon}
                      title={child.title}
                    />
                  </div>
                  <span className="pointer-events-none mt-2 text-xs font-medium truncate max-w-full text-center text-white/95 drop-shadow-sm group-hover/child:text-white transition-colors">
                    {child.title}
                  </span>

                  <div
                    className={`absolute -top-2 -right-1 ${
                      draggedChildId ? 'hidden' : 'opacity-0 group-hover/child:opacity-100'
                    } transition-opacity duration-200 z-10 flex items-center gap-0.5 bg-black/75 backdrop-blur-md px-1 py-0.5 rounded-full border border-white/20 shadow-md scale-90`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChildFromFolder(displayFolder.id, child.id);
                      }}
                      className="w-4 h-4 rounded-full text-gray-200 hover:text-white flex items-center justify-center text-[10px] cursor-pointer"
                      title={language === 'zh' ? '移出到桌面' : 'Move to desktop'}
                    >
                      <CornerUpLeft size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingShortcut(child);
                        setTargetFolderForAdd(displayFolder.id);
                        form.setFieldsValue({ title: child.title, url: child.url, icon: child.icon });
                        setModalOpen(true);
                      }}
                      className="w-4 h-4 rounded-full text-gray-200 hover:text-white flex items-center justify-center text-[10px] cursor-pointer"
                      title={language === 'zh' ? '编辑' : 'Edit'}
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChildInFolder(displayFolder.id, child.id);
                      }}
                      className="w-4 h-4 rounded-full text-red-400 hover:text-red-500 flex items-center justify-center text-[10px] cursor-pointer"
                      title={language === 'zh' ? '删除' : 'Delete'}
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                );
              })}

            </div>
          </div>
        </div>
      );
    })()}
    </div>
  );
};
