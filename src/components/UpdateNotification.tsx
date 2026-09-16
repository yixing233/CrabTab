import React from 'react';
import { X, ExternalLink, ChevronRight } from 'lucide-react';
import { ReleaseInfo } from '../utils/versionCheck';
import { Language, ThemeMode } from '../types';

interface UpdateNotificationProps {
  updateInfo: ReleaseInfo;
  onOpenDetails: () => void;
  onDismiss: () => void;
  language: Language;
  theme: ThemeMode;
  glassStyle: { blur: number; opacity: number };
}

/**
 * 顶部常驻新版本更新提示组件
 */
export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  onOpenDetails,
  onDismiss,
  language,
  theme,
  glassStyle,
}) => {
  const zh = language === 'zh';
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const iconSrc =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('/icon.png')
      : '/icon.png';

  return (
    <aside
      role="status"
      aria-live="polite"
      className={`fixed top-16 right-6 z-40 max-w-[340px] w-[calc(var(--viewport-width)-48px)] p-3 rounded-2xl shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border select-none pointer-events-auto backdrop-blur-md animate-in fade-in slide-in-from-top-3 ${
        isDark
          ? 'bg-[#181a20]/90 hover:bg-[#181a20] text-white/90 border-blue-500/35 shadow-black/50'
          : 'bg-white/90 hover:bg-white text-neutral-800 border-blue-400/35 shadow-black/10'
      }`}
      style={{
        backdropFilter: `blur(${glassStyle.blur}px)`,
        WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* 扩展 Logo 图标徽标 */}
        <div className="relative w-8 h-8 rounded-xl overflow-hidden shrink-0 shadow-md border border-black/10 dark:border-white/10 mt-0.5 select-none bg-black/5 dark:bg-white/5">
          <img
            src={iconSrc}
            alt="CrabTab Logo"
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
          />
        </div>

        {/* 核心文案与操作 */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-neutral-900 dark:text-white">
              {zh ? '发现新版本' : 'Update Available'}
            </span>
            <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
              v{updateInfo.version}
            </span>
          </div>

          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate leading-tight">
            {updateInfo.notes || (zh ? '体验全新功能与体验优化' : 'Click to view changelog & update')}
          </p>

          {/* 操作按钮组 */}
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onOpenDetails}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-sm transition-all cursor-pointer"
            >
              <span>{zh ? '查看更新' : 'View Update'}</span>
              <ChevronRight size={12} />
            </button>
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isDark
                  ? 'hover:bg-white/10 text-neutral-300 hover:text-white'
                  : 'hover:bg-black/8 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Release</span>
              <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* 关闭/忽略按钮 */}
        <button
          type="button"
          onClick={onDismiss}
          title={zh ? '暂时忽略此版本' : 'Dismiss this version'}
          className="w-6 h-6 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/8 dark:hover:bg-white/12 transition-colors cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </aside>
  );
};
