import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  IconAlertCircle,
  IconAppWindow,
  IconBookmarkPlus,
  IconClipboard,
  IconCopy,
  IconExternalLink,
  IconEyeOff,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconRefresh,
  IconScissors,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { createPortal } from 'react-dom';
import { Dropdown, Tooltip, Modal, message } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { BookmarkNode, Language, ThemeMode, GlassStyle } from '../types';
import { ShortcutIconView } from './Shortcuts';
import { BookmarkEditor, BookmarkEditorMode } from './BookmarkEditor';
import {
  fetchBookmarkTree,
  subscribeBookmarkChanges,
  searchBookmarksRecursive,
  checkBookmarkPermission,
  isExtensionEnvironment,
  canWriteBookmarks,
  createBookmark,
  updateBookmark,
  removeBookmark,
  removeBookmarkItem,
  moveBookmark,
  copyBookmarkTree,
  resolveMoveIndex,
  isSelfOrDescendant,
  BookmarkSearchResult,
} from '../utils/bookmarks';
import { i18n } from '../i18n';

export interface TopBookmarkBarProps {
  language: Language;
  theme: ThemeMode;
  glassStyle: GlassStyle;
  openInNewTab: boolean;
}

/**
 * 书签栏空白处的虚拟右键目标。
 * 用一个 id 不会与真实书签冲突的哨兵节点表示「右键点在空白区」，
 * 这样整栏只需要一个右键菜单，菜单内容按目标类型切换即可。
 */
const BAR_BLANK_TARGET = {
  id: '__bar_blank__',
  title: '',
} as BookmarkNode;

/**
 * 把鼠标事件的视觉坐标换算成 CSS 像素坐标。
 *
 * 为什么需要：CrabTab 的「界面缩放」是用 root.style.zoom 实现的，而
 * getBoundingClientRect 与 event.clientX/Y 返回的都是**缩放后**的视觉坐标，
 * 但 position:fixed 的 left/top 是**缩放前**的 CSS 像素（会被 zoom 再放大一次）。
 * 直接把 clientX 赋给 left，缩放 110% 时就会多偏移 10%（越靠右偏得越多），
 * 菜单和拖拽卡片会明显跑偏。除以缩放倍数即可对齐。
 */
const toCssPixels = (value: number): number => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
  const scale = Number.parseFloat(raw);
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return value;
  return value / scale;
};

export const TopBookmarkBar: React.FC<TopBookmarkBarProps> = ({
  language,
  theme,
  glassStyle,
  openInNewTab,
}) => {  const t = i18n[language];
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

  // ==========================================================================
  // 书签编辑能力（新建 / 修改 / 删除 / 剪切粘贴 / 拖拽排序）
  //
  // 全部走 chrome.bookmarks 原生写入 API，改动即时反映到浏览器真实书签库，
  // 与浏览器自带书签管理器完全等价；写入成功后由 onCreated/onMoved 等事件
  // 触发 loadBookmarks() 自动刷新，这里不手工拼接本地状态，避免状态漂移。
  // ==========================================================================

  /** 当前环境是否允许写入（普通网页调试 / 演示数据为只读） */
  const writable = useMemo(() => canWriteBookmarks(), []);
  const [messageApi, messageHolder] = message.useMessage();
  // 编辑弹窗
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<BookmarkEditorMode>('new-bookmark');
  const [editorTarget, setEditorTarget] = useState<BookmarkNode | null>(null);
  /** 新建时的落地父目录 */
  const [editorParentId, setEditorParentId] = useState<string>('');
  const [editorParentTitle, setEditorParentTitle] = useState<string>('');

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<BookmarkNode | null>(null);

  // 剪切/复制剪贴板（页面级，不跨页签持久化，与原生书签栏行为一致）
  const [clipboard, setClipboard] = useState<{
    node: BookmarkNode;
    mode: 'cut' | 'copy';
  } | null>(null);

  const notifyError = useCallback(
    (err: string) => {
      messageApi.error(t.bmErrorFailed.replace('{msg}', err));
    },
    [messageApi, t]
  );

  const requireWritable = useCallback((): boolean => {
    if (writable) return true;
    messageApi.warning(t.bmErrorNotWritable);
    return false;
  }, [writable, messageApi, t]);

  const openEditor = useCallback(
    (mode: BookmarkEditorMode, target: BookmarkNode | null, parentId: string, parentTitle?: string) => {
      if (!requireWritable()) return;
      // 新建必须知道落点目录：parentId 为空说明书签树结构异常（如根节点缺失）
      const isCreate = mode === 'new-bookmark' || mode === 'new-folder';
      if (isCreate && !parentId) {
        notifyError(
          language === 'zh' ? '无法定位书签栏目录，请刷新后重试' : 'Cannot locate the bookmarks bar folder, please refresh'
        );
        return;
      }
      // 快照当前展开的文件夹：弹窗存续期间用它兜底维持下拉不乱收。
      // 用 ref 读取而非直接引用 folderOpenId，避免依赖它的声明顺序。
      folderOpenSnapshotRef.current = folderOpenIdRef.current;
      setEditorMode(mode);
      setEditorTarget(target);
      setEditorParentId(parentId);
      setEditorParentTitle(parentTitle || '');
      setEditorOpen(true);
    },
    [requireWritable, notifyError, language]
  );

  /** 编辑弹窗提交：区分新建/修改与书签/文件夹四种组合 */
  const handleEditorSubmit = useCallback(
    async (values: { title: string; url?: string }) => {
      const isEdit = editorMode === 'edit-bookmark' || editorMode === 'edit-folder';
      if (isEdit && editorTarget) {
        const res = await updateBookmark(editorTarget.id, {
          title: values.title,
          // 文件夹不传 url
          url: editorMode === 'edit-bookmark' ? values.url : undefined,
        });
        if (!res.ok) {
          notifyError(res.error);
          return;
        }
        messageApi.success(t.bmSuccessUpdated);
      } else {
        const res = await createBookmark({
          parentId: editorParentId || undefined,
          title: values.title,
          url: editorMode === 'new-bookmark' ? values.url : undefined,
        });
        if (!res.ok) {
          notifyError(res.error);
          return;
        }
        messageApi.success(t.bmSuccessCreated);
      }
      setEditorOpen(false);
      loadBookmarks();
    },
    [editorMode, editorTarget, editorParentId, notifyError, messageApi, t, loadBookmarks]
  );

  /** 打开编辑器：在某个文件夹内新建 */
  const handleNewInside = useCallback(
    (parent: { id: string; title: string }, kind: 'bookmark' | 'folder') => {
      openEditor(
        kind === 'bookmark' ? 'new-bookmark' : 'new-folder',
        null,
        parent.id,
        parent.title
      );
    },
    [openEditor]
  );

  /** 打开编辑器：修改已有节点 */
  const handleEditNode = useCallback(
    (node: BookmarkNode) => {
      openEditor(node.url ? 'edit-bookmark' : 'edit-folder', node, node.parentId || '');
    },
    [openEditor]
  );

  /** 删除节点 */
  const handleConfirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;
    const res = target.url
      ? await removeBookmarkItem(target.id)
      : await removeBookmark(target.id);
    if (!res.ok) {
      notifyError(res.error);
      setDeleteTarget(null);
      return;
    }
    messageApi.success(t.bmSuccessDeleted);
    setDeleteTarget(null);
    loadBookmarks();
  }, [deleteTarget, notifyError, messageApi, t, loadBookmarks]);

  /** 剪切 / 复制 */
  const handleCopyNode = useCallback(
    (node: BookmarkNode, mode: 'cut' | 'copy') => {
      if (!requireWritable()) return;
      setClipboard({ node, mode });
      if (mode === 'cut') {
        messageApi.info(t.bmCutPending.replace('{name}', node.title || node.url || ''));
      }
    },
    [requireWritable, messageApi, t]
  );

  /**
   * 粘贴到指定父目录。
   * index 用于「粘到某个书签的同级位置」（紧跟在它之后），不传则追加到末尾。
   */
  const handlePasteInto = useCallback(
    async (parentId: string, index?: number) => {
      if (!clipboard) return;
      if (!requireWritable()) return;
      const { node, mode } = clipboard;

      // 防环：不能把文件夹粘进自己或自己的后代
      if (!node.url && isSelfOrDescendant(tree, node.id, parentId)) {
        notifyError(
          language === 'zh' ? '不能把文件夹移动到自己内部' : 'Cannot move a folder into itself'
        );
        return;
      }

      if (mode === 'cut') {
        // 同父移动且向后插时要让 Chromium 自己处理自减，这里直接传目标槽位
        const res = await moveBookmark({ id: node.id, parentId, index });
        if (!res.ok) {
          notifyError(res.error);
          return;
        }
        messageApi.success(t.bmSuccessMoved);
        setClipboard(null);
      } else {
        // 复制：文件夹需要连带整个子树一起复制（原生无复制 API，递归自建）。
        // 指定 index 时把新建的节点插到该位置。
        const res = await copyBookmarkTree(node, parentId, index);
        if (!res.ok) {
          notifyError(res.error);
          return;
        }
        messageApi.success(t.bmSuccessCreated);
      }
      loadBookmarks();
    },
    [clipboard, requireWritable, tree, notifyError, messageApi, t, loadBookmarks, language]
  );

  /**
   * 粘贴到某个节点旁边（同级、紧跟其后）；目标是文件夹时粘进它内部。
   * 这里从 tree 自行推导兄弟列表，避免依赖下方 barItems/barFolderId 的声明顺序。
   */
  const handlePasteBeside = useCallback(
    (target: BookmarkNode) => {
      if (!clipboard) return;
      if (!target.url) {
        // 文件夹：粘进内部末尾
        void handlePasteInto(target.id);
        return;
      }
      const parentId = target.parentId;
      if (!parentId) return;

      // 在树中定位父目录，取得真实兄弟顺序
      const findFolder = (nodes: BookmarkNode[]): BookmarkNode | null => {
        for (const n of nodes) {
          if (n.id === parentId) return n;
          if (n.children) {
            const hit = findFolder(n.children);
            if (hit) return hit;
          }
        }
        return null;
      };
      const parent = findFolder(tree);
      const siblings = parent?.children || [];
      const targetIndex = siblings.findIndex((n) => n.id === target.id);
      const index = targetIndex >= 0 ? targetIndex + 1 : undefined;
      void handlePasteInto(parentId, index);
    },
    [clipboard, handlePasteInto, tree]
  );

  /** 打开书签（指定窗口模式） */
  const handleOpenWithMode = useCallback(
    (url: string, mode: 'current' | 'tab' | 'window' | 'incognito') => {
      if (!url) return;
      // 扩展环境下用原生 API 才能真正开「新窗口 / 无痕窗口」：
      // window.open 无法创建无痕窗口（会被浏览器静默降级为普通窗口），
      // 必须走 chrome.windows.create({ incognito: true })。
      const canUseChromeWindows =
        typeof chrome !== 'undefined' && !!chrome.windows && typeof chrome.windows.create === 'function';

      if (mode === 'current') {
        window.location.href = url;
      } else if (mode === 'incognito') {
        if (canUseChromeWindows) {
          chrome.windows.create({ url, incognito: true }, () => {
            // 扩展未获准在无痕模式运行时会失败，此时退回普通窗口并提示
            if (chrome.runtime?.lastError) {
              void chrome.runtime.lastError;
              messageApi.warning(
                language === 'zh'
                  ? '无法打开无痕窗口，请先在扩展详情中允许「在无痕模式下启用」'
                  : 'Cannot open incognito window — enable "Allow in Incognito" for this extension'
              );
              window.open(url, '_blank', 'noopener,noreferrer');
            }
          });
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } else if (mode === 'window') {
        if (canUseChromeWindows) {
          chrome.windows.create({ url });
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      if (searchModalOpen) setSearchModalOpen(false);
    },
    [searchModalOpen, messageApi, language]
  );


  const { barItems, otherFolder, barFolderId } = useMemo(() => {
    if (!tree || tree.length === 0) {
      return {
        barItems: [] as BookmarkNode[],
        otherFolder: null as BookmarkNode | null,
        barFolderId: '',
      };
    }

    const root = tree[0];
    const rootChildren = root.children || [];

    if (rootChildren.length === 0) {
      return {
        barItems: (root.url ? [root] : []) as BookmarkNode[],
        otherFolder: null as BookmarkNode | null,
        barFolderId: root.id || '',
      };
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
      barFolderId: barNode?.id || '',
    };
  }, [tree]);


  /**
   * 下拉菜单（文件夹展开的内容）里的右键处理。
   *
   * 为什么必须绑在 menu 层而不是每个 label 的 div 上：
   * antd 的菜单项是 <li class="ant-dropdown-menu-item">，它自带左右 8px 的
   * padding，而 label 的 div 只覆盖中间内容区。鼠标落在这段 8px 内时，
   * 事件目标是 li 而非 div，挂在 div 上的 onContextMenu 根本不触发，
   * 事件继续冒泡到外层「文件夹」的 Dropdown，于是弹出的是文件夹菜单
   * —— 这正是「鼠标明明在书签行上、却出现文件夹菜单」的原因。
   * 绑在 menu 层后，靠 closest 反查 li 再映射回节点，整个条目范围都能覆盖。
   */
  const handleMenuContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const li = target.closest('.ant-dropdown-menu-item') as HTMLElement | null;
      if (!li) return;
      // antd 通过 data-menu-id 关联菜单项 key（形如 "rc-menu-uuid-_r_u_-<key>"）。
      // 注意不能用 split('-').pop()：书签 id 自身可能含连字符会被截断。
      // 改为「目录内所有节点 id 的降序长度匹配」——取 data-menu-id 以
      // `${prefix}-${id}` 结尾的那个节点，天然避开歧义。
      const dataId = li.getAttribute('data-menu-id') || '';
      if (!dataId) return;

      const collectNodes = (nodes: BookmarkNode[], out: BookmarkNode[] = []): BookmarkNode[] => {
        nodes.forEach((n) => {
          out.push(n);
          if (n.children) collectNodes(n.children, out);
        });
        return out;
      };
      const allNodes = collectNodes(tree);
      // 长 id 优先，避免短 id 恰好是长 id 后缀时误匹配
      allNodes.sort((a, b) => b.id.length - a.id.length);
      const node = allNodes.find((n) => dataId.endsWith(`-${n.id}`)) || null;
      if (!node) return;

      e.preventDefault();
      e.stopPropagation();
      setContextMenuNode(node);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [tree, barItems]
  );

  /** 右键菜单：书签节点（严格对齐浏览器原生菜单） */
  const buildNodeContextMenu = useCallback(
    (node: BookmarkNode): ItemType[] => {
      const items: ItemType[] = [];
      const isFolder = !node.url;

      // 第一组：打开方式。原生菜单对书签提供三种窗口目标；
      // 文件夹的原生菜单只有「打开」相关项，这里不臆造「打开全部」之类的功能。
      if (node.url) {
        items.push({
          key: 'open-new-tab',
          label: t.bmMenuOpenNewTab,
          icon: <IconExternalLink size={13} />,
          onClick: () => handleOpenWithMode(node.url!, 'tab'),
        });
        items.push({
          key: 'open-new-window',
          label: t.bmMenuOpenNewWindow,
          icon: <IconAppWindow size={13} />,
          onClick: () => handleOpenWithMode(node.url!, 'window'),
        });
        items.push({
          key: 'open-incognito',
          label: t.bmMenuOpenIncognito,
          icon: <IconEyeOff size={13} />,
          onClick: () => handleOpenWithMode(node.url!, 'incognito'),
        });
        items.push({ type: 'divider' });
      }

      if (writable) {
        // 文件夹：原生在此处提供新建子项
        if (isFolder) {
          items.push({
            key: 'new-bookmark',
            label: t.bmMenuNewBookmark,
            icon: <IconBookmarkPlus size={13} />,
            onClick: () => handleNewInside({ id: node.id, title: node.title }, 'bookmark'),
          });
          items.push({
            key: 'new-folder',
            label: t.bmMenuNewFolder,
            icon: <IconFolderPlus size={13} />,
            onClick: () => handleNewInside({ id: node.id, title: node.title }, 'folder'),
          });
          items.push({ type: 'divider' });
        }

        // 第二组：编辑
        items.push({
          key: 'edit',
          label: t.bmMenuEdit,
          icon: <IconPencil size={13} />,
          onClick: () => handleEditNode(node),
        });
        items.push({ type: 'divider' });

        // 第三组：剪切 / 复制 / 粘贴。
        // 原生始终显示「粘贴」并按可用性置灰：剪贴板为空时不可用。
        // 目标是文件夹 → 粘进内部末尾；目标是书签 → 粘到它的同级位置（紧跟其后）。
        const canPaste = !!clipboard;
        items.push({
          key: 'cut',
          label: t.bmMenuCut,
          icon: <IconScissors size={13} />,
          onClick: () => handleCopyNode(node, 'cut'),
        });
        items.push({
          key: 'copy',
          label: t.bmMenuCopy,
          icon: <IconCopy size={13} />,
          onClick: () => handleCopyNode(node, 'copy'),
        });
        items.push({
          key: 'paste',
          label: isFolder
            ? t.bmPasteInto.replace('{name}', node.title)
            : t.bmMenuPaste,
          icon: <IconClipboard size={13} />,
          disabled: !canPaste,
          onClick: () => {
            if (canPaste) handlePasteBeside(node);
          },
        });
        items.push({ type: 'divider' });

        // 第四组：删除
        items.push({
          key: 'delete',
          label: t.bmMenuDelete,
          danger: true,
          icon: <IconTrash size={13} />,
          onClick: () => setDeleteTarget(node),
        });
      }

      return items;
    },
    [
      t,
      writable,
      clipboard,
      handleOpenWithMode,
      handleNewInside,
      handleEditNode,
      handleCopyNode,
      handlePasteBeside,
    ]
  );

  /** 右键菜单：书签栏空白处 */
  const buildBarContextMenu = useCallback((): ItemType[] => {
    const items: ItemType[] = [];
    if (writable) {
      items.push({
        key: 'new-bookmark',
        label: t.bmMenuNewBookmark,
        icon: <IconBookmarkPlus size={13} />,
        onClick: () => handleNewInside({ id: barFolderId, title: t.bookmarkBarTitle }, 'bookmark'),
      });
      items.push({
        key: 'new-folder',
        label: t.bmMenuNewFolder,
        icon: <IconFolderPlus size={13} />,
        onClick: () => handleNewInside({ id: barFolderId, title: t.bookmarkBarTitle }, 'folder'),
      });
      if (clipboard) {
        items.push({
          key: 'paste',
          label: t.bmPasteToBar,
          icon: <IconClipboard size={13} />,
          onClick: () => void handlePasteInto(barFolderId),
        });
      }
      items.push({ type: 'divider' });
    }
    items.push({
      key: 'refresh',
      label: t.bmMenuRefresh,
      icon: <IconRefresh size={13} />,
      onClick: () => loadBookmarks(),
    });
    return items;
  }, [t, writable, clipboard, barFolderId, handleNewInside, handlePasteInto, loadBookmarks]);

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
  /** 拖拽排序结束后抑制紧随其后的 click，避免松手时误打开书签 */
  const suppressClickRef = useRef<boolean>(false);
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

  // 鼠标拖拽捕获与惯性滚动（按住左键拖动 = 横向滑动浏览）
  // 与条目拖拽排序共用同一套 pointer 事件：条目上的长按（320ms）会先把会话切到
  // 拖拽态，此时这里必须立刻退出，否则滑动会与拖拽争夺同一次指针交互。
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || dragRef.current.pointerId !== -1) return;
    // 已在条目拖拽会话中（长按已成立）则不再启动滑动
    if (dragSessionRef.current?.active) return;
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
    // 拖拽排序态：本次 pointer 已被长按切入拖拽，改为更新落点提示，不滚动
    if (dragSessionRef.current?.active) {
      updateDragHover(e.clientX, e.clientY);
      return;
    }
    // 尚未进入拖拽但已经开始滑动：必须撤掉长按计时，否则滑到一半会突然变成拖拽
    if (dragSessionRef.current && hasDraggedRef.current) {
      if (pressTimerRef.current) {
        window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      dragSessionRef.current = null;
    }
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
    // 拖拽排序态：抬起即提交移动，不走滑动收尾
    if (dragSessionRef.current?.active) {
      // 必须完整走一遍指针收尾，否则 dragRef.pointerId 残留会让后续滑动永久失效
      const el = scrollContainerRef.current;
      if (el && e.currentTarget.hasPointerCapture(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
      }
      dragRef.current.pointerId = -1;
      dragRef.current.velocity = 0;
      hasDraggedRef.current = false;
      setIsDragging(false);
      // 标记本次交互是拖拽，阻止紧随其后的 click 把书签打开
      suppressClickRef.current = true;
      void commitDrag(e.clientX, e.clientY).finally(() => {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      });
      return;
    }
    // 未进入拖拽：清掉长按计时，避免松手后误触发
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    dragSessionRef.current = null;
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

  // ==========================================================================
  // 拖拽排序（pointer 事件 + 长按闸门）
  //
  // 为什么不用 HTML5 drag & drop：书签栏已有「按住左键拖动 = 横向滑动浏览」的
  // 指针手势，浏览器原生 DnD 同样从 mousedown 起步，两者会争夺同一次按下。
  // 因此统一到同一套 pointer 体系，用「长按 320ms」作为进入拖拽的显式闸门：
  //   - 按下后 320ms 内移动 = 普通滑动浏览（原行为完全不变）；
  //   - 按住不动 320ms = 进入拖拽，此后移动改为调整落点，不再滚动。
  //
  // 关键实现细节：容器在 handlePointerDown 里调用了 setPointerCapture，
  // 之后的 pointermove/pointerup 全部被重定向到容器自身，条目上的同名事件
  // 根本不会触发。所以拖拽的 move/up 必须挂在**容器**上（见下面的
  // handlePointerMove / stopDragging），条目只负责上报「我按下了谁」。
  // ==========================================================================
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /**
   * 拖拽跟随卡片的屏幕坐标。
   * 用 state 而非直接在 DOM 上写 style，是因为需要随 pointermove 触发重渲染；
   * 卡片本身 fixed + pointer-events-none，且刻意偏移到光标右下角，
   * 避免遮住光标下方用于命中判定的元素（elementFromPoint 会跳过 pointer-events-none）。
   */
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);

  /**
   * 当前右键菜单的目标节点。
   *
   * 为什么用「全局唯一菜单」而不是给每个条目各包一层 Dropdown：
   * 文件夹条目本身已经嵌套了一层 hover/click Dropdown，其下拉里的子书签是由
   * buildMenuItems 生成的原生菜单项，无法再各自挂 contextMenu 触发器。若外层
   * 再套一个 contextMenu Dropdown，在下拉里的子书签上右键时，事件会被外层
   * 捕获，弹出的是「该文件夹」的菜单而不是那个书签的菜单 —— 这正是此前的 bug。
   * 改为整栏共用一个受控 Dropdown，右键任何节点时只设置「当前目标」，菜单内容
   * 随之切换，层级干扰彻底消失。
   */
  const [contextMenuNode, setContextMenuNode] = useState<BookmarkNode | null>(null);
  /** 右键菜单的屏幕坐标（contextMenu 触发时为鼠标位置） */
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  /** 右键菜单关闭后，需要吞掉的那一次 click（防止穿透到书签） */
  const swallowNextClickRef = useRef<boolean>(false);
  /** 与 contextMenuNode 同步的 ref：常驻监听里读取最新菜单状态 */
  const contextMenuNodeRef = useRef<BookmarkNode | null>(null);
  contextMenuNodeRef.current = contextMenuNode;
  /** 当前展开的文件夹 id（受控，便于被右键菜单状态干预） */
  const [folderOpenId, setFolderOpenId] = useState<string | null>(null);
  /** 与 folderOpenId 同步的 ref：供声明在它之前的 openEditor 读取 */
  const folderOpenIdRef = useRef<string | null>(null);
  folderOpenIdRef.current = folderOpenId;

  // 弹窗关闭后作废快照，避免下次打开时误用上一次的文件夹 id
  useEffect(() => {
    if (!editorOpen) folderOpenSnapshotRef.current = null;
  }, [editorOpen]);
  /**
   * 打开编辑弹窗时「当时正在展开的文件夹」。
   *
   * 为什么需要单独记住：点「修改…」的瞬间鼠标在右键菜单上，文件夹下拉的
   * mouseLeaveDelay 可能已经在倒计时，甚至在 editorOpen 置位前就触发了收起。
   * 因此不能只靠「editorOpen 期间忽略收起」这一道条件，必须在打开弹窗的
   * 那一刻把当时的展开状态快照下来，弹窗期间由它兜底维持。
   */
  const folderOpenSnapshotRef = useRef<string | null>(null);

  const [dropHint, setDropHint] = useState<{ targetId: string; after: boolean } | null>(null);
  const [dropIntoFolderId, setDropIntoFolderId] = useState<string | null>(null);

  /** 长按计时器与拖拽会话（session 存在即表示「本次按下可能是拖拽」） */
  const pressTimerRef = useRef<number | null>(null);
  const dragSessionRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    active: boolean;
    /** 触发本次拖拽的 pointerId，用于在长按成立时建立指针捕获 */
    pointerId: number;
  } | null>(null);

  const clearDragState = useCallback(() => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    dragSessionRef.current = null;
    setDraggingId(null);
    setDragGhost(null);
    setDropHint(null);
    setDropIntoFolderId(null);
  }, []);

  /** 命中判定：返回落点条目、插入侧、以及是否「移入该文件夹」 */
  const resolveDropTarget = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const host = el?.closest('[data-bm-item]') as HTMLElement | null;
    if (!host) return null;
    const id = host.dataset.bmItem || '';
    if (!id) return null;
    const isFolder = host.dataset.bmFolder === '1';
    const rect = host.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
    if (isFolder) {
      // 左右各 25% 为排序区，中间 50% 为移入区（与原生书签栏一致）
      if (ratio < 0.25) return { id, after: false, into: false };
      if (ratio > 0.75) return { id, after: true, into: false };
      return { id, after: false, into: true };
    }
    return { id, after: ratio > 0.5, into: false };
  }, []);

  /** 条目按下：只登记会话并启动长按计时，滑动仍交给容器 */
  const handleItemPointerDown = useCallback(
    (e: React.PointerEvent, node: BookmarkNode) => {
      if (!writable || e.button !== 0) return;
      dragSessionRef.current = {
        id: node.id,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        pointerId: e.pointerId,
      };
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = window.setTimeout(() => {
        const session = dragSessionRef.current;
        if (!session) return;
        session.active = true;
        setDraggingId(session.id);
        // 卡片立即出现在按下点，避免等第一次 pointermove 前闪到左上角
        setDragGhost({ x: session.startX, y: session.startY });
        // 关键：显式建立指针捕获。
        // 长按进入拖拽时，容器上的 handlePointerDown 会因为「已是拖拽会话」而
        // 提前 return（见该函数首行的守卫），从未调用 setPointerCapture。
        // 结果是把书签拖到书签栏之外再松手时，pointerup 落在别的元素上，
        // 容器上的 onPointerUp 不触发 —— 提交逻辑永远不执行，拖拽卡片卡死，
        // 且 dragSessionRef.active 一直是 true，此后连滑动都会被拦掉。
        // 在这里补上捕获后，无论指针移到哪里，pointerup 都会回到容器。
        const container = scrollContainerRef.current;
        if (container) {
          try {
            container.setPointerCapture(session.pointerId);
          } catch {
            // 某些环境下 pointerId 可能已失效，忽略即可，
            // 下面还有 window 级兜底监听
          }
        }
        // 中断可能正在进行的滑动与惯性
        if (momentumAnimRef.current) cancelAnimationFrame(momentumAnimRef.current);
        momentumAnimRef.current = null;
        if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
        wheelTargetRef.current = null;
      }, 320);
    },
    [writable]
  );

  // 递归构建 Ant Design 级联菜单树
  const buildMenuItems = useCallback(
    (nodes: BookmarkNode[]): ItemType[] => {
      return nodes.map((node) => {
        if (node.url) {
          return {
            key: node.id,
            label: (
              <div
                className="flex items-center gap-2.5 py-0 max-w-[360px] select-none"
                data-sub-bookmark="1"
                title={`${node.title} - ${node.url}`}
                // 右键处理必须挂在 label 的 div 上：antd 的 Menu 不透传
                // onContextMenu，挂到 menu 层会被丢弃。为覆盖 li 的左右 padding，
                // 下面用 CSS 把 li 的水平 padding 归零、由本 div 撑满整行。
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenuNode(node);
                  setContextMenuPos({ x: e.clientX, y: e.clientY });
                }}
                onPointerDown={(e) => {
                  // 必须截断冒泡：文件夹下拉是挂在该条目 DOM 内部的 portal，
                  // 不拦截的话 pointerdown 会继续冒到外层文件夹条目的
                  // onPointerDown，把拖拽会话覆盖成「文件夹」，
                  // 表现为拖书签却显示文件夹的卡片。
                  e.stopPropagation();
                  handleItemPointerDown(e, node);
                }}
              >
                <ShortcutIconView
                  url={node.url}
                  title={node.title}
                  sizeClass="w-4.5 h-4.5 shrink-0"
                  roundedClass="rounded-none"
                />
                <span className="truncate text-[14px] leading-snug text-inherit">{node.title || node.url}</span>
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
                    <span className="text-[14px] opacity-50 px-3 py-1.5 select-none">
                      {t.emptyBookmarkFolder}
                    </span>
                  ),
                  disabled: true,
                },
              ];

        return {
          key: node.id,
          label: (
            <div
              className="flex items-center gap-2.5 py-0 max-w-[360px] select-none"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenuNode(node);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
              }}
              onPointerDown={(e) => {
                // 同上：阻止冒泡到外层文件夹条目，保住本次拖拽会话
                e.stopPropagation();
                handleItemPointerDown(e, node);
              }}
            >
              <IconFolder size={16} className="text-amber-500 dark:text-amber-400 shrink-0" fill="currentColor" />
              <span className="truncate text-[14px] font-medium leading-snug text-inherit">{node.title}</span>
            </div>
          ),
          children: childItems,
          popupClassName: 'crab-bookmark-dropdown',
        };
      });
    },
    // handleItemPointerDown 必须列入依赖：下拉里的条目靠它登记拖拽会话，
    // 漏掉会让闭包捕获到声明前的空引用，表现为「在子书签上长按，拖拽卡片
    // 却显示外层文件夹」。
    [handleOpenBookmark, t.emptyBookmarkFolder, handleItemPointerDown]
  );

  /**
   * 按屏幕坐标解析出「用户主观上在操作的那个条目」。
   *
   * 用于右键落在条目之间的间隙时兜底：书签栏条目之间有 4px 间距（gap-1），
   * 这点空隙属于容器而不属于任何条目，若直接当成空白区就会弹出
   * 「新建书签/新建文件夹」菜单 —— 但用户主观上是在点相邻的那个书签。
   * 这里优先用 CSS :hover 取真正悬停的条目，退而求其次取几何上最近的条目，
   * 并限定一个较小容差，超出容差才算真的点在空白处。
   */
  const resolveNearestItemId = useCallback((clientX: number, clientY: number): string => {
    const container = scrollContainerRef.current;
    if (!container) return '';

    // 1) 真正处于 hover 状态的条目（浏览器原生命中结果，最贴合用户感知）
    const hovered = container.querySelector('[data-bm-item]:hover') as HTMLElement | null;
    const hoveredId = hovered?.dataset.bmItem || '';
    if (hoveredId) return hoveredId;

    // 2) 几何最近：仅在同一水平带内比较，避免误取上下排元素
    let bestId = '';
    let bestDist = Infinity;
    container.querySelectorAll<HTMLElement>('[data-bm-item]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (clientY < r.top - 2 || clientY > r.bottom + 2) return;
      const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (dx < bestDist) {
        bestDist = dx;
        bestId = el.dataset.bmItem || '';
      }
    });
    // 间隙只有 4px，容差给到 16px 足以覆盖条目内外边距与抗锯齿误差
    return bestDist <= 16 ? bestId : '';
  }, []);

  /** 拖拽态下更新落点提示（由容器的 pointermove 调用） */
  const updateDragHover = useCallback(
    (clientX: number, clientY: number) => {
      const session = dragSessionRef.current;
      if (!session || !session.active) return;
      // 卡片始终跟随光标
      setDragGhost({ x: clientX, y: clientY });
      const target = resolveDropTarget(clientX, clientY);
      if (!target || target.id === session.id) {
        setDropHint(null);
        setDropIntoFolderId(null);
        return;
      }
      const dragged = barItems.find((n) => n.id === session.id);
      // 防环：文件夹不能拖进自己或自己的后代
      if (dragged && !dragged.url && isSelfOrDescendant(tree, dragged.id, target.id)) {
        setDropHint(null);
        setDropIntoFolderId(null);
        return;
      }
      if (target.into) {
        setDropHint(null);
        setDropIntoFolderId(target.id);
      } else {
        setDropIntoFolderId(null);
        setDropHint({ targetId: target.id, after: target.after });
      }
    },
    [resolveDropTarget, barItems, tree]
  );

  /** 拖拽提交：按当前落点执行移动（由容器的 pointerup 调用） */
  const commitDrag = useCallback(
    async (clientX: number, clientY: number) => {
      const session = dragSessionRef.current;
      if (!session || !session.active) return false;

      // 从整棵树查找被拖节点：被拖的可能是文件夹下拉里的子书签，
      // 它不在顶栏的 barItems 中，只查 barItems 会导致静默失败
      //（卡片正常消失但什么都没移动）—— 这正是「子书签无法拖到一级」的原因。
      const findAny = (nodes: BookmarkNode[]): BookmarkNode | null => {
        for (const n of nodes) {
          if (n.id === session.id) return n;
          if (n.children) {
            const hit = findAny(n.children);
            if (hit) return hit;
          }
        }
        return null;
      };
      const dragged = findAny(tree) || barItems.find((n) => n.id === session.id);
      const target = resolveDropTarget(clientX, clientY);
      clearDragState();
      if (!dragged) return true;

      // 1) 移入文件夹
      if (target && target.into) {
        const res = await moveBookmark({ id: dragged.id, parentId: target.id });
        if (!res.ok) notifyError(res.error);
        else messageApi.success(t.bmSuccessMoved);
        loadBookmarks();
        return true;
      }

      // 2) 落在空白处 = 移到书签栏末尾
      if (!target) {
        if (dragged.parentId === barFolderId) return true;
        const res = await moveBookmark({ id: dragged.id, parentId: barFolderId });
        if (!res.ok) notifyError(res.error);
        else messageApi.success(t.bmSuccessMoved);
        loadBookmarks();
        return true;
      }

      // 3) 排序 / 跨层级移动
      // 关键：落点可能在顶栏（一级），也可能在下拉里（某个文件夹内部）。
      // 目标节点同样要从整棵树查，并把「落点所在父目录的兄弟列表」作为
      // 计算 index 的依据 —— 这样把子书签拖到一级时，用的是书签栏这一层
      // 的真实顺序，而不是顶栏可见项的子集。
      // 找到落点所在的父目录节点，取其 children 作为兄弟列表。
      // 同时用「父目录节点的 id」作为新的 parentId —— 不能依赖 targetNode.parentId，
      // 因为书签树来自浏览器 API，各层节点的 parentId 字段并不总是可靠
      //（实测出现过子节点带着错误 parentId 的情况），按树结构推导才准确。
      const findParentFolder = (
        nodes: BookmarkNode[],
        childId: string
      ): BookmarkNode | null => {
        for (const n of nodes) {
          if (n.children) {
            if (n.children.some((c) => c.id === childId)) return n;
            const hit = findParentFolder(n.children, childId);
            if (hit) return hit;
          }
        }
        return null;
      };
      const targetParent = findParentFolder(tree, target.id);
      // 顶栏一级条目的父目录就是「书签栏」，某些浏览器返回的树里
      // 根节点下可能少一层包装，因此找不到时回退到 barItems + barFolderId。
      const siblings = targetParent?.children || barItems;
      const parentId = targetParent?.id || barFolderId;

      const targetIndex = siblings.findIndex((n) => n.id === target.id);
      // 被拖节点若与本段落点是同一父目录，才用它在本层的旧索引；
      // 跨目录时旧索引无意义，按 -1 处理（Chromium 会直接按目标槽位插入）。
      const oldIndex = siblings.findIndex((n) => n.id === dragged.id);
      if (targetIndex < 0) return true;

      const index = resolveMoveIndex({
        sameParent: dragged.parentId === parentId,
        oldIndex: oldIndex >= 0 ? oldIndex : -1,
        targetIndex,
        after: target.after,
      });

      const res = await moveBookmark({ id: dragged.id, parentId, index });
      if (!res.ok) notifyError(res.error);
      else messageApi.success(t.bmSuccessMoved);
      loadBookmarks();
      return true;
    },
    [
      barItems,
      tree,
      resolveDropTarget,
      clearDragState,
      barFolderId,
      notifyError,
      messageApi,
      t,
      loadBookmarks,
    ]
  );

  // 拖拽中若窗口失焦 / 指针被系统取消（切窗口、Alt+Tab、触控笔中断等），
  // 收不到 pointerup，卡片会永久悬在屏幕上，因此兜底清理。
  useEffect(() => {
    if (!draggingId) return;
    const reset = () => clearDragState();
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [draggingId, clearDragState]);

  // 拖拽期间：禁止页面选中 + 全页光标改为「抓取中」，
  // 让用户明确感知已进入拖拽态（此时松手即提交移动，而不是点击打开）
  useEffect(() => {
    if (!draggingId) return;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [draggingId]);

  /**
   * 拖拽的全局兜底收尾。
   *
   * 主路径是容器的 pointerup（配合长按时建立的指针捕获）。但仍有几种情况会漏：
   * 指针在窗口外松开、被系统/其他程序抢走、或浏览器触发 pointercancel 时目标不在
   * 容器上。若不兜底，dragSessionRef.active 会一直为 true，拖拽卡片永久卡在页面，
   * 之后连横向滑动都会被「拖拽中」守卫拦掉，只能刷新。
   * 这里在 window 上监听 pointerup / pointercancel，命中同一 pointerId 时
   * 强制走完提交，保证任何路径都能结束拖拽。
   */
  useEffect(() => {
    if (!draggingId) return;

    const finish = (clientX?: number, clientY?: number) => {
      const session = dragSessionRef.current;
      if (!session || !session.active) return;
      const x = typeof clientX === 'number' ? clientX : session.startX;
      const y = typeof clientY === 'number' ? clientY : session.startY;
      suppressClickRef.current = true;
      void commitDrag(x, y).finally(() => {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      });
    };

    const onUp = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || !session.active) return;
      if (e.pointerId !== session.pointerId) return;
      finish(e.clientX, e.clientY);
    };
    const onCancel = (e: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || !session.active) return;
      if (e.pointerId !== session.pointerId) return;
      // 取消时不动数据，只清理状态
      clearDragState();
    };

    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
  }, [draggingId, commitDrag, clearDragState]);

  /**
   * 右键菜单的外部点击关闭。
   *
   * 不能用 rc-trigger 自带的「点击外部关闭」当唯一手段：本菜单的触发器是一个
   * 固定在鼠标坐标上的 1px 锚点，菜单本体通过 Portal 渲染到 body。一旦触发源
   * 状态变化（例如列表刷新导致锚点重新挂载），rc-trigger 的判定会漏掉，
   * 表现为「菜单点外面关不掉」。这里补一层显式兜底：
   *   - pointerdown / contextmenu 落在菜单与锚点之外 → 关闭；
   *   - Esc 关闭。
   * 菜单本体通过 .crab-bookmark-dropdown 类名识别（antd 会把该类挂到浮层根节点）。
   */
  useEffect(() => {
    // 常驻监听：不依赖 contextMenuNode，否则「关闭菜单 → effect 卸载 → 
    // 随后的 click 无人拦截」会导致点击穿透、误打开书签。
    // 是否需要动作由下面的事件处理函数自行判断。

    // 只把「右键菜单自身」（含其子菜单）与定位锚点算作内部。
    // 关键：文件夹下拉用的是 .crab-bookmark-dropdown，与此处的
    // .crab-bm-context-menu 互相独立 —— 右键菜单开着时，点文件夹下拉算「外部」，
    // 会先关掉右键菜单，而不会穿透去触发下拉里书签的点击。
    const hasMenu = () => contextMenuNodeRef.current !== null;
    const isInsideContextMenu = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== 'function') return false;
      return !!el.closest('.crab-bm-context-menu') || !!el.closest('[data-bm-anchor]');
    };

    const close = () => {
      setContextMenuNode(null);
      setContextMenuPos(null);
    };

    // 问题1：右键菜单打开时，点菜单外部（含文件夹下拉）应先关闭菜单，
    // 并吞掉随之而来的 click，避免穿透去打开书签。
    // 这里只对左键按下生效；右键由 contextmenu 分支处理。
    const onPointerDown = (e: PointerEvent) => {
      if (!hasMenu()) return;
      if (e.button !== 0) return;
      if (isInsideContextMenu(e.target)) return;
      // 标记吞掉紧随其后的 click：pointerdown 关闭菜单会让依赖
      // contextMenuNode 的 effect 卸载，若把吞点击逻辑也放在这里就会失效，
      // 因此改用常驻 ref + 常驻监听（本 effect 不依赖 contextMenuNode）。
      swallowNextClickRef.current = true;
      // 兜底：若后续没有 click（按下后拖走、或事件被系统吞掉），
      // 也要把标记复位，否则会误吞用户之后的第一下正常点击。
      window.setTimeout(() => {
        swallowNextClickRef.current = false;
      }, 400);
      close();
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!swallowNextClickRef.current) return;
      swallowNextClickRef.current = false;
      // 阻止这次点击继续传播到书签/文件夹，避免误打开
      e.preventDefault();
      e.stopPropagation();
    };

    // 问题2：右键另一个书签时，先关闭当前菜单，再让目标条目自己的
    // onContextMenu 重新打开对应菜单。这里不能 stopPropagation，
    // 否则会拦掉目标条目的事件，新菜单就打不开了。
    const onContextMenu = (e: MouseEvent) => {
      if (!hasMenu()) return;
      if (isInsideContextMenu(e.target)) return;
      // 右键也会触发一次 pointerdown(button=2)，上面已跳过，
      // 这里清掉可能残留的吞点击标记，避免影响之后的左键点击。
      swallowNextClickRef.current = false;
      close();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!hasMenu()) return;
      if (e.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return (
    <>
      {/* 顶部极简吸顶/轻量悬浮书签栏（自适应内容宽度与最大可用宽度，数量多时横向滚动） */}
      <div className="w-fit max-w-full min-w-0 pointer-events-auto transition-all duration-300">
        <div
          className={`h-10 px-2 sm:px-3 rounded-2xl border flex items-center justify-between gap-1 shadow-sm transition-all duration-200 select-none max-w-full ${
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
                className={`absolute left-0 top-0 bottom-0 w-5 z-10 pointer-events-none transition-opacity duration-200 ${
                  isDark
                    ? 'bg-gradient-to-r from-[#141820]/90 to-transparent'
                    : 'bg-gradient-to-r from-white/90 to-transparent'
                }`}
              />
            )}

            {/* 核心横向滚动列表。空白区右键同样走整栏唯一的全局菜单：
                用一个特殊的「空白」目标节点表示，避免再嵌套一层 Dropdown。
                条目自身的 onContextMenu 已 stopPropagation，因此这里只会在
                真正点到空白处时触发。 */}
            <div
              ref={scrollContainerRef}
              onScroll={checkScroll}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onContextMenu={(e) => {
                // 直接命中条目时由条目自己的 onContextMenu 处理（已截断冒泡），
                // 能走到这里说明点在了间隙或真正的空白处。
                if ((e.target as HTMLElement).closest('[data-bm-item]')) return;

                e.preventDefault();
                e.stopPropagation();

                // 夹在两个条目之间时，用户主观上操作的是相邻那个书签，
                // 因此先尝试解析出「悬停中 / 最近」的条目，只有确实离得很远
                // 才回退成空白区菜单。
                const nearestId = resolveNearestItemId(e.clientX, e.clientY);
                const nearestNode = nearestId
                  ? barItems.find((n) => n.id === nearestId) || null
                  : null;

                setContextMenuNode(nearestNode || BAR_BLANK_TARGET);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
              }}

              onClickCapture={(e) => {
                if (hasDraggedRef.current || suppressClickRef.current) {
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
              className={`flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none py-1 overscroll-contain select-none transition-[cursor] ${
                isDragging
                  ? 'cursor-grabbing'
                  : canScrollLeft || canScrollRight
                    ? 'cursor-grab'
                    : 'cursor-default'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-1.5 px-2 text-[14px] opacity-50">
                  <IconRefresh size={14} className="animate-spin text-blue-400" />
                  <span>{t.refreshBookmarks}...</span>
                </div>
              ) : !permissionGranted ? (
                <div className="flex items-center gap-1.5 px-2 text-[14px] text-amber-500">
                  <IconAlertCircle size={15} className="shrink-0" />
                  <span>{t.bookmarkPermissionNotGranted}</span>
                </div>
              ) : barItems.length === 0 ? (
                <div className="px-2 text-[14px] opacity-40 italic">{t.bookmarkBarEmpty}</div>
              ) : (
                barItems.map((item) => {
                  const isDraggedItem = draggingId === item.id;
                  const hint = dropHint?.targetId === item.id ? dropHint : null;

                  // 拖拽插入指示线（横向书签栏 → 竖直细线）
                  const indicator = hint ? (
                    <div
                      className={`absolute top-0.5 bottom-0.5 w-0.5 rounded-full z-20 pointer-events-none ${
                        isDark ? 'bg-blue-400' : 'bg-blue-500'
                      }`}
                      style={{ [hint.after ? 'right' : 'left']: -1 }}
                    />
                  ) : null;

                  // 通用包裹：拖拽 + 右键上报 + 插入指示线。
                  // 这里不再套 Dropdown —— 整栏共用下方唯一的右键菜单。
                  // 原因：文件夹条目自身已嵌套 hover/click Dropdown，其下拉里的子书签
                  // 由 buildMenuItems 生成、无法各自挂 contextMenu 触发器；若外层再套
                  // 一个 contextMenu Dropdown，在子书签上右键会被外层抢走，弹出的是
                  // 「该文件夹」的菜单而不是那个书签的菜单。
                  const wrap = (inner: React.ReactNode) => (
                    <div
                      key={item.id}
                      data-bm-item={item.id}
                      data-bm-folder={item.url ? '0' : '1'}
                      className={`relative shrink-0 flex items-center transition-all ${
                        isDraggedItem ? 'opacity-35 scale-95' : ''
                      } ${
                        dropIntoFolderId === item.id
                          ? isDark
                            ? 'ring-2 ring-blue-400 rounded-xl'
                            : 'ring-2 ring-blue-500 rounded-xl'
                          : ''
                      }`}
                      onPointerDown={(e) => handleItemPointerDown(e, item)}
                      onContextMenu={(e) => {
                        // 记录右键目标与坐标，由整栏唯一的菜单渲染；
                        // 同时截断冒泡，避免又触发书签栏空白区的菜单。
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenuNode(item);
                        setContextMenuPos({ x: e.clientX, y: e.clientY });
                        // 不要在这里收起文件夹下拉：用户右键后往往要把鼠标
                        // 移到菜单上，下拉若被收起会让人失去上下文。
                      }}
                    >
                      {indicator}
                      {inner}
                    </div>
                  );

                  // 1. 文件夹项：触发下拉/级联菜单
                  if (!item.url) {
                    const menuItems = buildMenuItems(item.children || []);
                    return wrap(
                      <Dropdown
                        menu={{
                          items: menuItems,
                          className: 'crab-bookmark-dropdown-menu',
                          onContextMenu: handleMenuContextMenu,
                        }}
                        trigger={['click', 'hover']}
                        open={
                          // 弹窗存续期间锁定为打开时记录的快照，鼠标怎么移动都不收；
                          // 否则交给常规的 folderOpenId 受控开合。
                          editorOpen
                            ? folderOpenSnapshotRef.current === item.id
                            : folderOpenId === item.id
                        }
                        onOpenChange={(next) => {
                          // 冻结文件夹下拉的开合，覆盖两种场景：
                          //  1) 右键菜单展开期间 —— 鼠标要从文件夹移到右键菜单上，
                          //     必然触发 mouseLeave，不拦截就会 150ms 后自动收起；
                          //  2) 编辑弹窗打开期间 —— 用户正在填写表单，下拉若在背后
                          //     自己收起，会丢失上下文，也让人以为操作被打断。
                          if (contextMenuNode || editorOpen) return;
                          setFolderOpenId(next ? item.id : null);
                        }}
                        mouseEnterDelay={0.08}
                        mouseLeaveDelay={0.15}
                        rootClassName="crab-bookmark-dropdown"
                        overlayClassName="crab-bookmark-dropdown"
                        placement="bottomLeft"
                      >
                        <button
                          type="button"
                          className={`px-2 py-1.5 rounded-xl flex items-center gap-1.5 text-[14px] font-medium shrink-0 transition-all ${
                            isDragging ? 'pointer-events-none' : 'cursor-pointer'
                          } ${
                            isDark
                              ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                              : 'hover:bg-black/8 text-gray-700 hover:text-gray-900 active:bg-black/12'
                          }`}
                        >
                          <IconFolder
                            size={15}
                            className="text-amber-500 dark:text-amber-400 shrink-0"
                            fill="currentColor"
                          />
                          <span className="truncate max-w-[160px]">{item.title}</span>
                        </button>
                      </Dropdown>
                    );
                  }

                  // 2. 单个直达书签项：点击直接打开
                  return wrap(
                    <button
                      type="button"
                      onClick={() => handleOpenBookmark(item.url || '')}
                      title={`${item.title} - ${item.url}`}
                      className={`px-2 py-1.5 rounded-xl flex items-center gap-1.5 text-[14px] shrink-0 transition-all ${
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
                        sizeClass="w-4 h-4 shrink-0"
                        roundedClass="rounded-none"
                      />
                      <span className="truncate max-w-[160px]">
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
                className={`absolute right-0 top-0 bottom-0 w-5 z-10 pointer-events-none transition-opacity duration-200 ${
                  isDark
                    ? 'bg-gradient-to-l from-[#141820]/90 to-transparent'
                    : 'bg-gradient-to-l from-white/90 to-transparent'
                }`}
              />
            )}
          </div>

          {/* 右侧固定功能区：「其他书签」+「快速搜索书签」 */}
          <div
            className={`shrink-0 flex items-center gap-1 pl-1.5 border-l ${
              isDark ? 'border-white/10' : 'border-black/10'
            }`}
          >
            {otherFolder && (
              <Dropdown
                menu={{
                  items: buildMenuItems(otherFolder.children || []),
                  className: 'crab-bookmark-dropdown-menu',
                  onContextMenu: handleMenuContextMenu,
                }}
                trigger={['click', 'hover']}
                mouseEnterDelay={0.08}
                mouseLeaveDelay={0.15}
                rootClassName="crab-bookmark-dropdown"
                overlayClassName="crab-bookmark-dropdown"
                placement="bottomRight"
              >
                <button
                  type="button"
                  className={`px-2 py-1.5 rounded-xl flex items-center gap-1.5 text-[14px] font-medium shrink-0 transition-all cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-900'
                  }`}
                >
                  <IconFolder
                    size={15}
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
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                  isDark
                    ? 'hover:bg-white/15 text-white/70 hover:text-white'
                    : 'hover:bg-black/8 text-gray-600 hover:text-gray-900'
                }`}
              >
                <IconSearch size={15} />
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
            <IconSearch size={16} className={isDark ? 'text-white/40' : 'text-gray-400'} />
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
                <IconX size={14} />
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
                <IconSearch size={32} />
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
                        roundedClass="rounded-none"
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
                            <IconFolder size={10} className="shrink-0 text-amber-400" fill="currentColor" />
                            <span>{res.path.join(' / ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <IconExternalLink size={12} className="shrink-0 opacity-40" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 编辑弹窗：新建/修改书签与文件夹 */}
      <BookmarkEditor
        open={editorOpen}
        mode={editorMode}
        language={language}
        theme={theme}
        target={editorTarget}
        parentTitle={editorParentTitle}
        onCancel={() => setEditorOpen(false)}
        onSubmit={(values) => void handleEditorSubmit(values)}
      />

      {/* 删除确认（书签栏原生行为：删除前必须确认，文件夹提示不可撤销） */}
      <Modal
        open={!!deleteTarget}
        title={t.bmConfirmDeleteTitle}
        centered
        width={400}
        okText={t.bmDelete}
        cancelText={t.bmCancel}
        okButtonProps={{ danger: true }}
        onOk={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        destroyOnClose
        className="crab-bookmark-editor-modal"
      >
        <div className={`text-[12px] leading-relaxed ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
          {(deleteTarget?.url
            ? t.bmConfirmDeleteBookmark
            : t.bmConfirmDeleteFolder
          ).replace('{name}', deleteTarget?.title || '')}
        </div>
      </Modal>

      {/* 拖拽跟随卡片：长按拖拽时贴在光标右下方的书签/文件夹浮层。
          必须 pointer-events-none —— 否则它会挡住光标下方的元素，
          导致 elementFromPoint 命中不到真实的落点条目；同时它也是命中的
          视觉反馈，与栏内的条目高亮/插入指示线互为呼应。 */}
      {draggingId && dragGhost && createPortal((() => {
        // 从整棵树查找而非只看 barItems：被拖的可能是文件夹下拉里的子书签，
        // 它不在顶栏的 barItems 中，只查 barItems 会导致卡片取不到节点而消失。
        const findAny = (nodes: BookmarkNode[]): BookmarkNode | null => {
          for (const n of nodes) {
            if (n.id === draggingId) return n;
            if (n.children) {
              const hit = findAny(n.children);
              if (hit) return hit;
            }
          }
          return null;
        };
        const ghostItem = findAny(tree) || barItems.find((n) => n.id === draggingId);
        if (!ghostItem) return null;
        return (
          <div
            className="fixed z-[9999] pointer-events-none select-none"
            style={{
              // 缩放环境下需换算成 CSS 像素，否则会被 zoom 二次放大而偏移
              left: toCssPixels(dragGhost.x),
              top: toCssPixels(dragGhost.y),
              // 让光标落在卡片正中央：用百分比位移而非固定像素，
              // 卡片宽度随书签标题长度变化时依然居中。
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className={`flex items-center gap-1.5 px-2 h-8 rounded-xl text-[14px] shadow-2xl border backdrop-blur-md ${
                isDark
                  ? 'bg-[#181a20]/92 text-white border-white/20'
                  : 'bg-white/95 text-gray-900 border-black/10'
              }`}
              style={{
                backdropFilter: `blur(${glassStyle.blur}px)`,
                WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
                boxShadow: isDark
                  ? '0 10px 30px rgba(0,0,0,0.5)'
                  : '0 10px 30px rgba(0,0,0,0.18)',
                transform: 'rotate(-1.5deg) scale(1.03)',
              }}
            >
              {ghostItem.url ? (
                <ShortcutIconView
                  url={ghostItem.url}
                  title={ghostItem.title}
                  sizeClass="w-4 h-4 shrink-0"
                  roundedClass="rounded-none"
                />
              ) : (
                <IconFolder
                  size={15}
                  className="text-amber-500 dark:text-amber-400 shrink-0"
                  fill="currentColor"
                />
              )}
              <span className="truncate max-w-[180px]">
                {ghostItem.title || ghostItem.url || 'Untitled'}
              </span>
            </div>
          </div>
        );
      })(), document.body)}

      {/* 整栏唯一的右键菜单。
          所有条目（含文件夹下拉里的子书签）右键时都只更新 contextMenuNode，
          菜单内容随之切换。这样不存在「嵌套 Dropdown 抢事件」的问题。
          用受控 open + 手动坐标定位，因为触发源可能早已不在视口或已卸载。 */}
      {contextMenuNode &&
        createPortal(
          <Dropdown
            open={!!contextMenuNode}
            onOpenChange={(next) => {
              if (!next) {
                setContextMenuNode(null);
                setContextMenuPos(null);
              }
            }}
            menu={{
              items:
                contextMenuNode.id === BAR_BLANK_TARGET.id
                  ? buildBarContextMenu()
                  : buildNodeContextMenu(contextMenuNode),
              className: 'crab-bookmark-dropdown-menu crab-bm-context-menu-list',
              onClick: () => {
                setContextMenuNode(null);
                setContextMenuPos(null);
              },
            }}
            trigger={[]}
            rootClassName="crab-bm-context-menu"
            overlayClassName="crab-bm-context-menu"
            placement="bottomLeft"
          >
            {/* 定位锚点：用 1px 尺寸而非 0，避免 rc-trigger 对零尺寸元素的
                对齐计算退化（宽度为 0 时部分 placement 会得到 NaN 偏移）。
                pointer-events:none 保证它不拦截任何交互。 */}
            <div
              data-bm-anchor="1"
              style={{
                position: 'fixed',
                left: toCssPixels(contextMenuPos?.x ?? 0),
                top: toCssPixels(contextMenuPos?.y ?? 0),
                width: 1,
                height: 1,
                pointerEvents: 'none',
              }}
            />
          </Dropdown>,
          document.body
        )}

      {messageHolder}
    </>
  );
};
