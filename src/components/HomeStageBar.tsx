import React from 'react';
import { LayoutGrid, EyeOff, History as HistoryIcon, ChevronDown } from 'lucide-react';
import { HomeContentMode, Language, ThemeMode } from '../types';
import { i18n } from '../i18n';
import { useResolvedIsDark } from '../theme';

export interface HomeStageBarProps {
  language: Language;
  theme: ThemeMode;
  /** 菜单/按钮的毛玻璃模糊半径，与各组件共享的 glassStyle.blur 同源 */
  blur: number;
  homeContentMode: HomeContentMode;
  onUpdateHomeContentMode: (mode: HomeContentMode) => void;
  /** 状态专属的设置项，接在「主屏展示内容」三态开关之后；close 用于点击后收起菜单 */
  children?: (close: () => void) => React.ReactNode;
  /** 右侧状态专属操作区（添加快捷站点 / 刷新 / 垂直位置） */
  actions?: React.ReactNode;
  /** 附加在模式标签后的计数徽标（如最近访问条目数） */
  badge?: React.ReactNode;
  /**
   * 幽灵态：平时淡出、悬停或键盘聚焦时才完全显现。
   *
   * 用于「关闭」状态 —— 用户明确要求清空主屏中央，此时常驻一条工具条会直接
   * 违背该意图；但完全不渲染又会让三态开关失去入口，只能绕回设置面板。
   * 幽灵态在两者间取中：静默时几乎不可见，鼠标移入或 Tab 聚焦即现身。
   */
  ghost?: boolean;
}

const MODE_ICON: Record<HomeContentMode, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  off: EyeOff,
  shortcuts: LayoutGrid,
  recent: HistoryIcon,
};

/**
 * 主屏中央舞台的共用工具条。
 *
 * 快捷方式与最近访问共用同一块中央区域，因此这块区域的「门面」必须同源：
 * 宽度对齐搜索框、高度一致、毛玻璃与描边同档，切换状态时工具条纹丝不动，
 * 只有下方内容换形。此前两个状态各画各的头部——快捷方式工具条在左、最近访问
 * 是标题胶囊——宽度、偏移与质感都不一致，切过去像换了个页面。
 *
 * 更关键的是可达性：三态开关原先只存在于快捷方式工具条的下拉菜单里，一旦切到
 * 「最近访问」或「关闭」，这个入口连同整个工具条一起消失，用户只能绕回设置面板
 * 才能切回来。现在工具条由两个状态共同渲染，开关因此在任何状态下都只差一次点击。
 */
/**
 * 解析实际生效的暗色状态。
 *
 * 实现在 theme.ts 中（全站唯一来源）：不能只判断 `theme === 'dark'`，`auto` 时
 * 页面根节点由 App 依系统偏好打上 dark，共用的工具条若按 'auto' 走浅色分支，
 * 就会在暗色页面上渲染出一条亮条 —— 而它正下方的快捷方式网格/卡片流又各有各的
 * 判断，同一块舞台内会同时出现两套配色。
 */
export const HomeStageBar: React.FC<HomeStageBarProps> = ({
  language,
  theme,
  blur,
  homeContentMode,
  onUpdateHomeContentMode,
  children,
  actions,
  badge,
  ghost = false,
}) => {
  const t = i18n[language];
  const isDark = useResolvedIsDark(theme);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // 点击/滚动/失焦关闭，与组件内其他浮层保持同一套关闭语义
  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuOpen]);

  const ModeIcon = MODE_ICON[homeContentMode];
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const modeLabel =
    homeContentMode === 'off'
      ? t.shortcutModeOff
      : homeContentMode === 'recent'
        ? t.homeContentRecent
        : t.homeContentShortcuts;

  const shellStyle: React.CSSProperties = {
    backdropFilter: `blur(${blur}px)`,
    WebkitBackdropFilter: `blur(${blur}px)`,
  };

  return (
    <div
      className={`home-stage-shell home-stage-bar flex items-center justify-between gap-3 select-none ${
        ghost
          ? 'opacity-25 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100'
          : ''
      }`}
    >
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t.homeContentMode}
          title={t.homeContentMode}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm transition-all cursor-pointer active:scale-95 ${
            menuOpen
              ? isDark
                ? 'border-white/35 bg-white/15 text-white'
                : 'border-black/25 bg-white/85 text-neutral-900'
              : isDark
                ? 'border-white/15 bg-white/[0.06] text-white/75 hover:border-white/35 hover:bg-white/12 hover:text-white'
                : 'border-black/12 bg-white/50 text-neutral-600 hover:border-black/25 hover:bg-white/80 hover:text-neutral-900'
          }`}
          style={shellStyle}
        >
          <ModeIcon size={14} strokeWidth={2.2} className="shrink-0" />
          <span>{modeLabel}</span>
          {badge}
          <ChevronDown
            size={13}
            strokeWidth={2.4}
            className={`shrink-0 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label={t.homeContentMode}
            className={`absolute left-0 top-[calc(100%+8px)] z-[70] w-[264px] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl ${
              isDark
                ? 'border-white/15 bg-[#16181f]/95 text-white shadow-black/60'
                : 'border-black/10 bg-white/95 text-neutral-800 shadow-neutral-900/15'
            }`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* 主屏展示内容：关闭 / 快捷方式 / 最近访问 */}
            <div className="px-2.5 pt-1.5 pb-2">
              <div className="text-[11px] font-semibold opacity-55 mb-1.5">{t.homeContentMode}</div>
              <div className={`flex items-center gap-0.5 rounded-xl p-0.5 ${isDark ? 'bg-white/8' : 'bg-black/6'}`}>
                {([
                  { value: 'off' as HomeContentMode, label: t.shortcutModeOff, Icon: EyeOff },
                  { value: 'shortcuts' as HomeContentMode, label: t.homeContentShortcuts, Icon: LayoutGrid },
                  { value: 'recent' as HomeContentMode, label: t.homeContentRecent, Icon: HistoryIcon },
                ]).map(({ value, label, Icon }) => {
                  const active = homeContentMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onUpdateHomeContentMode(value);
                        setMenuOpen(false);
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

            {children && (
              <>
                <div className="my-1 h-px bg-black/5 dark:bg-white/10" />
                {children(closeMenu)}
              </>
            )}
          </div>
        )}
      </div>

      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
};
