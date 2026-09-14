import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { SiteShortcut, Language } from '../types';
import { i18n } from '../i18n';
import {
  getFaviconCandidates,
  getPrimaryFaviconUrl,
  getAvatarPalette,
  getIconCandidateOptions,
  parseDomainAndOrigin,
} from '../utils/favicon';
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
 * 支持多级 CDN 与源站探测降级加载的快捷图标组件
 */
const ShortcutIconView: React.FC<{ url: string; icon?: string; title: string; sizeClass?: string }> = ({
  url,
  icon,
  title,
  sizeClass = 'w-7 h-7 sm:w-8 sm:h-8',
}) => {
  const candidates = React.useMemo(() => getFaviconCandidates(url, icon), [url, icon]);
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 当外部 url 或 icon 变更时重置探测状态
  React.useEffect(() => {
    setCandidateIndex(0);
    setHasError(false);
    setIsLoaded(false);
  }, [url, icon]);

  const currentSrc = candidates[candidateIndex];

  const handleImageError = () => {
    setIsLoaded(false);
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex(candidateIndex + 1);
    } else {
      setHasError(true);
    }
  };

  if (icon === 'avatar:letter' || !currentSrc || hasError) {
    const palette = getAvatarPalette(title || url);
    const char = (title || url || 'A').trim().charAt(0).toUpperCase();
    return (
      <div
        style={{ background: palette.background, color: palette.color }}
        className={`${sizeClass} rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shadow-sm select-none transition-transform duration-200`}
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
      className={`${sizeClass} object-contain rounded-lg transition-opacity duration-200 ${
        isLoaded ? 'opacity-100' : 'opacity-0'
      }`}
      onLoad={() => setIsLoaded(true)}
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
      className={`w-full h-full rounded-[inherit] grid ${
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
  displayMode: 'compact' | 'desktop';
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
  onDeleteShortcut: (id: string) => void;
  onReorderShortcuts?: (shortcuts: SiteShortcut[]) => void;
  autoFill?: boolean;
  onToggleAutoFill?: (autoFill: boolean) => void;
}

export const Shortcuts: React.FC<ShortcutsProps> = ({
  shortcuts,
  displayMode,
  language,
  openInNewTab,
  theme,
  glassStyle,
  onAddShortcut,
  onEditShortcut,
  onDeleteShortcut,
  onReorderShortcuts,
  autoFill = false,
  onToggleAutoFill,
}) => {
  const t = i18n[language];
  const isDark = theme === 'dark';
  const isDesktop = displayMode === 'desktop';
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
  const [desktopColumns, setDesktopColumns] = useState(() => window.innerWidth >= 768 ? 7 : 4);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const dragAnchorRef = React.useRef<{ xRatio: number; yRatio: number } | null>(null);
  const gridPositions = React.useMemo(
    () => resolveGridPositions(orderedShortcuts, desktopColumns, autoFill),
    [orderedShortcuts, desktopColumns, autoFill]
  );
  const [gridDropPreview, setGridDropPreview] = useState<{
    column: number;
    row: number;
    span: number;
    valid: boolean;
  } | null>(null);
  const addButtonPosition = React.useMemo(
    () => findFirstFreePositionForSpan(orderedShortcuts, gridPositions, desktopColumns, 1),
    [orderedShortcuts, gridPositions, desktopColumns]
  );
  React.useEffect(() => {
    const handleResize = () => setDesktopColumns(window.innerWidth >= 768 ? 7 : 4);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const clickUnlockTimerRef = React.useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ShortcutContextMenu | null>(null);
  const [gridContextMenu, setGridContextMenu] = useState<GridContextMenu | null>(null);
  const [pendingAddPosition, setPendingAddPosition] = useState<{ column: number; row: number } | null>(null);

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
    if (clickUnlockTimerRef.current !== null) {
      window.clearTimeout(clickUnlockTimerRef.current);
    }
  }, []);

  React.useEffect(() => {
    if (!contextMenu && !gridContextMenu) return;
    const closeMenu = () => {
      setContextMenu(null);
      setGridContextMenu(null);
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
  }, [contextMenu, gridContextMenu]);

  React.useEffect(() => {
    orderedShortcutsRef.current = orderedShortcuts;
  }, [orderedShortcuts]);

  React.useEffect(() => {
    // 拖拽期间 props 可能仍是旧顺序，不能覆盖本地预览队列。
    if (isDraggingRef.current) return;
    orderedShortcutsRef.current = shortcuts;
    setOrderedShortcuts(shortcuts);
  }, [shortcuts]);

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
    setPendingAddPosition(position ?? (isDesktop ? addButtonPosition : null));
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
          gridPosition: pendingAddPosition || undefined,
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
    const maxRow = Math.max(1, Math.ceil((grid.scrollHeight + rowGap) / rowPitch) - span + 1);
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
    ) return false;

    return orderedShortcutsRef.current.every((shortcut) => {
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
    if (column < 1 || row < 1 || column > desktopColumns) return false;
    return orderedShortcutsRef.current.every((shortcut) => {
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

  const commitGridPosition = (sourceId: string, position: { column: number; row: number }) => {
    if (!canPlaceAt(sourceId, position.column, position.row)) return false;
    const updated = orderedShortcutsRef.current.map((shortcut) =>
      shortcut.id === sourceId ? { ...shortcut, gridPosition: position } : shortcut
    );
    const next = [...updated].sort((a, b) => {
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
    dragCommitRef.current = 'reorder';
    orderedShortcutsRef.current = next;
    setOrderedShortcuts(next);
    onReorderShortcuts?.(next);
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
          : s);
    } else {
      const targetPosition = gridPositions.get(targetId) || targetItem.gridPosition;
      const newFolder: SiteShortcut = {
        id: 'folder_' + Date.now(),
        title: language === 'zh' ? '新建文件夹' : 'New Folder',
        url: '',
        isFolder: true,
        gridPosition: targetPosition,
        children: [
          { ...targetItem, isFolder: false, children: undefined, gridPosition: undefined },
          { ...sourceItem, isFolder: false, children: undefined, gridPosition: undefined },
        ],
      };
      nextShortcuts = current
        .filter((s) => s.id !== sourceId)
        .map((s) => (s.id === targetId ? newFolder : s));
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
    setGridDropPreview(null);
    const sourceId = draggedIdRef.current;
    if (!sourceId || dragCommitRef.current === 'merge') return;
    if (sourceId === targetId) {
      clearMergeTimer();
      setDragOverId(null);
      setInsertSide(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const draggedItem = orderedShortcutsRef.current.find((s) => s.id === sourceId);
    const canMerge = Boolean(draggedItem && !draggedItem.isFolder);

    if (canMerge && ratioX >= 0.30 && ratioX <= 0.70) {
      setDragOverId(null);
      setInsertSide(null);
      if (mergeHoverTargetRef.current !== targetId) {
        clearMergeTimer();
        mergeHoverTargetRef.current = targetId;
        setMergeHoverTargetId(null);
        mergeHoverTimerRef.current = window.setTimeout(() => {
          mergeHoverTimerRef.current = null;
          if (
            mergeHoverTargetRef.current === targetId
            && draggedIdRef.current === sourceId
            && dragCommitRef.current === 'none'
          ) setMergeHoverTargetId(targetId);
        }, 500);
      }
      return;
    }

    clearMergeTimer();
    const side = ratioX < 0.5 ? 'left' : 'right';
    if (getAdjacentDropPosition(sourceId, targetId, side)) {
      setDragOverId(targetId);
      setInsertSide(side);
    } else {
      setDragOverId(null);
      setInsertSide(null);
    }
  };

  const finishDrag = () => {
    clearMergeTimer();
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
    const sorted = [...orderedShortcuts].sort((a, b) => {
      const posA = gridPositions.get(a.id) || { column: 1, row: 1 };
      const posB = gridPositions.get(b.id) || { column: 1, row: 1 };
      if (posA.row !== posB.row) return posA.row - posB.row;
      return posA.column - posB.column;
    });
    const compactedPositions = resolveGridPositions(sorted, desktopColumns, true);
    const next = sorted.map((item) => ({
      ...item,
      gridPosition: compactedPositions.get(item.id) || null,
    }));
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
        if (isDesktop && !autoFill) {
          // 默认不自动补位：删除前锁死其余所有图标当前的绝对网格位置，保证删除项原地留白，绝不自动向前挤压补位
          const next = orderedShortcuts
            .filter((s) => s.id !== item.id)
            .map((s) => ({
              ...s,
              gridPosition: s.gridPosition || gridPositions.get(s.id) || null,
            }));
          if (onReorderShortcuts) {
            onReorderShortcuts(next);
          }
        }
        onDeleteShortcut(item.id);
      },
    });
  };

  const contextMenuItem = contextMenu
    ? orderedShortcuts.find((item) => item.id === contextMenu.itemId) || null
    : null;

  const previewSource = orderedShortcuts.find((item) => item.id === draggedId);

  return (
    <div className={`group/shortcut-area relative w-full max-w-[680px] mx-auto ${
      isDesktop ? 'min-h-[276px] sm:min-h-[316px]' : 'shortcut-area-compact'
    }`}>
      {/* 桌面模式下悬浮添加按钮：仅在桌面自由网格模式下且鼠标悬浮在区域时显现，避免与简洁模式及搜索栏冲突 */}
      {isDesktop && (
        <button
          type="button"
          onClick={() => handleOpenAdd()}
          aria-label={t.addShortcut}
          title={t.addShortcut}
          className={`absolute -right-3 -top-7 z-30 flex h-7 w-7 items-center justify-center rounded-full border shadow-md backdrop-blur-xl transition-all active:scale-90 opacity-0 group-hover/shortcut-area:opacity-70 hover:!opacity-100 ${
            isDark
              ? 'border-white/15 bg-[#16181f]/80 text-white hover:bg-[#20242d]'
              : 'border-black/10 bg-white/80 text-neutral-700 hover:bg-white'
          }`}
        >
          <Plus size={15} strokeWidth={2.4} />
        </button>
      )}
      <div
        ref={gridRef}
        className={isDesktop ? 'shortcut-grid' : 'shortcut-grid-compact'}
        onDragOver={(e) => {
          if (!isDesktop) return;
          const sourceId = draggedIdRef.current;
          if (!sourceId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
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
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGridDropPreview(null);
        }}
        onDrop={isDesktop ? handleGridDrop : undefined}
        onContextMenu={(event) => {
          if (!isDesktop) return;
          if ((event.target as HTMLElement).closest('[data-shortcut-id]')) return;
          event.preventDefault();
          const pointedCell = getGridCellFromPointer(event.clientX, event.clientY);
          const position = pointedCell && canPlaceNewShortcutAt(pointedCell.column, pointedCell.row)
            ? pointedCell
            : addButtonPosition;
          if (!position) return;
          setContextMenu(null);
          setGridContextMenu({
            position,
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196 - 8)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 58 - 8)),
          });
        }}
      >
        {isDesktop && gridDropPreview && previewSource && (
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
        {orderedShortcuts.map((item) => {
          const isDragging = draggedId === item.id;
          const isDragTarget = dragOverId === item.id && !isDragging;
          const draggedItem = orderedShortcuts.find((s) => s.id === draggedId);
          const canMerge = draggedItem && !draggedItem.isFolder;
          const isMergeTarget = canMerge && mergeHoverTargetId === item.id && !isDragging;
          const isLargeFolder = isDesktop && item.isFolder && item.folderSize === '2x2';
          const gridPosition = isDesktop ? gridPositions.get(item.id) : undefined;
          const insertionClass = isDragTarget && insertSide
            ? insertSide === 'left'
              ? 'shortcut-insert-before'
              : 'shortcut-insert-after'
            : '';

          return (
            <div
              key={item.id}
              data-shortcut-id={item.id}
              draggable={isDesktop}
              onDragStart={isDesktop ? (e) => handleDragStart(e, item.id) : undefined}
              onDragOver={isDesktop ? (e) => handleDragOver(e, item.id) : undefined}
              onDragLeave={isDesktop ? handleDragLeave : undefined}
              onDragEnd={isDesktop ? handleDragEnd : undefined}
              onDrop={isDesktop ? (e) => handleDropOnItem(e, item.id) : undefined}
              className={`group relative flex flex-col items-center cursor-default select-none transition-all duration-200 ${
                isLargeFolder ? 'shortcut-grid-item-large' : 'shortcut-grid-item'
              } ${insertionClass} ${
                (activeFolderId === item.id || (isClosingFolder && cachedFolder?.id === item.id))
                  ? 'opacity-0 pointer-events-none scale-90'
                  : isDragging
                  ? 'opacity-25 scale-95'
                  : isMergeTarget
                  ? 'shortcut-merge-target scale-110 ring-2 ring-blue-400 ring-offset-2 ring-offset-transparent shadow-2xl z-20'
                  : isDragTarget
                  ? 'scale-105'
                  : 'opacity-100 active:scale-95'
              }`}
              style={{
                gridColumnStart: gridPosition?.column,
                gridRowStart: gridPosition?.row,
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const menuWidth = 196;
                const menuHeight = item.isFolder ? 202 : 150;
                setGridContextMenu(null);
                setContextMenu({
                  itemId: item.id,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
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
                  <FolderThumbnailView folder={item} compact={!isDesktop} onChildClick={handleFolderChildClick} />
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

        {/* 简洁模式：将添加按钮作为最后一个快捷方式项自然融入列表末尾 */}
        {!isDesktop && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleOpenAdd()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenAdd();
              }
            }}
            aria-label={t.addShortcut}
            className="group relative flex flex-col items-center cursor-pointer select-none transition-all duration-200 shortcut-grid-item active:scale-95"
          >
            <div
              className={`flex items-center justify-center shadow-lg transition-all duration-200 overflow-hidden border w-13 h-13 sm:w-14 sm:h-14 rounded-2xl ${
                isDark
                  ? 'border-white/15 border-dashed group-hover:border-white/50 group-hover:bg-white/10 group-active:bg-white/15 text-white/70 group-hover:text-white'
                  : 'border-white/80 border-dashed group-hover:border-white group-hover:bg-white/80 group-active:bg-white/90 text-neutral-600 group-hover:text-neutral-900'
              }`}
              style={{
                backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                backgroundColor: isDark ? 'rgba(18, 22, 30, 0.45)' : 'rgba(255, 255, 255, 0.45)',
                boxShadow: isDark
                  ? '0 10px 25px -5px rgba(0, 0, 0, 0.3), inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)'
                  : '0 10px 25px -5px rgba(0, 0, 0, 0.06), inset 0 1px 1px 0 rgba(255, 255, 255, 0.6)',
              }}
            >
              <Plus size={22} strokeWidth={2.2} className="transition-transform duration-200 group-hover:scale-110" />
            </div>
            <span className="mt-2 text-xs text-white/80 font-medium truncate max-w-full text-center drop-shadow-sm group-hover:text-white transition-colors">
              {t.addShortcut}
            </span>
          </div>
        )}

      </div>

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
              {isDesktop && (
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
              )}
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
        const fromX = folderOriginRect
          ? Math.round(folderOriginRect.left + folderOriginRect.width / 2 - window.innerWidth / 2)
          : 0;
        const fromY = folderOriginRect
          ? Math.round(folderOriginRect.top + folderOriginRect.height / 2 - window.innerHeight / 2)
          : 0;
        const scaleX = folderOriginRect ? (Math.max(32, folderOriginRect.width) / 340).toFixed(4) : '0.16';
        const scaleY = folderOriginRect ? (Math.max(32, folderOriginRect.height) / 240).toFixed(4) : '0.22';
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
            <div className="folder-items-spread grid grid-cols-3 gap-y-4 gap-x-3 items-center justify-items-center max-h-[55vh] overflow-y-auto custom-scrollbar p-1">
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
