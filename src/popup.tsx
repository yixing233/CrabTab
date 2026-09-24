import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, Input, Button, Tag, message, theme as antdTheme } from 'antd';
import {
  BookmarkPlus,
  BookmarkCheck,
  Globe,
  Sparkles,
  AlertTriangle,
  Check,
  Compass,
  RotateCcw,
} from 'lucide-react';
import { SiteShortcut } from './types';
import './index.css';

// 快捷方式存储常数（严格与主页保持一致）
const SHORTCUTS_KEY = 'crab_home_shortcuts_v1';
const SHORTCUTS_BACKUP_KEY = 'crab_home_shortcuts_backup';

/**
 * 调色板：当网页无图标或加载失败时的彩底首字母头像
 */
const AVATAR_PALETTES = [
  { bg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #db2777 0%, #f43f5e 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)', color: '#fff' },
  { bg: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)', color: '#fff' },
];

function getAvatarPalette(text: string) {
  let hash = 0;
  const safeText = text || 'A';
  for (let i = 0; i < safeText.length; i += 1) {
    hash = (hash << 5) - hash + safeText.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/**
 * 严格且安全的 HTTP/HTTPS 链接校验（绝不抛出任何异常）
 */
function isValidHttpUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * 安全提取主机名（绝不抛出任何异常）
 */
function getSafeHostname(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname.replace(/^www\./i, '') || '';
  } catch {
    return '';
  }
}

/**
 * 提取备用友好标题
 */
function getFallbackTitle(url: string): string {
  const host = getSafeHostname(url);
  return host || '快捷方式';
}

/**
 * 安全获取扩展内部资源绝对路径
 */
function getExtensionIconUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('icon.png');
  }
  return 'icon.png';
}

// 错误边界组件：防止任何意外异常导致整页黑屏/白屏
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Popup ErrorBoundary] 捕获渲染异常:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-[320px] p-5 text-center text-white bg-[#12161f] flex flex-col items-center justify-center gap-3 box-border">
          <AlertTriangle size={32} className="text-amber-500" />
          <div className="text-sm font-bold">扩展菜单加载出现微小异常</div>
          <div className="text-xs text-gray-400 font-mono text-left max-w-full overflow-hidden truncate">
            {this.state.error?.message || '未知错误'}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<RotateCcw size={12} />}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重新加载
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const PopupApp: React.FC = () => {
  const [title, setTitle] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [favIconUrl, setFavIconUrl] = useState<string>('');
  const [isExisting, setIsExisting] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [isSpecialPage, setIsSpecialPage] = useState<boolean>(false);
  const [iconLoadError, setIconLoadError] = useState<boolean>(false);

  // 监听系统深色模式偏好
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      if (mql.addEventListener) {
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
        return () => mql.removeListener(handler);
      }
    } catch {}
  }, []);

  // 多重策略安全读取当前活动标签页
  useEffect(() => {
    async function initCurrentTab() {
      try {
        let activeTab: chrome.tabs.Tab | null = null;

        if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
          try {
            const tabs1 = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tabs1 && tabs1.length > 0 && tabs1[0].url) {
              activeTab = tabs1[0];
            }
          } catch (e) {
            console.warn('策略 1 读取失败:', e);
          }

          if (!activeTab) {
            try {
              const tabs2 = await chrome.tabs.query({ active: true, currentWindow: true });
              if (tabs2 && tabs2.length > 0 && tabs2[0].url) {
                activeTab = tabs2[0];
              }
            } catch (e) {
              console.warn('策略 2 读取失败:', e);
            }
          }

          if (!activeTab) {
            try {
              const tabs3 = await chrome.tabs.query({ active: true });
              if (tabs3 && tabs3.length > 0 && tabs3[0].url) {
                activeTab = tabs3[0];
              }
            } catch (e) {
              console.warn('策略 3 读取失败:', e);
            }
          }
        }

        const rawUrl = (activeTab?.url || '').trim();
        const rawTitle = (activeTab?.title || '').trim();
        const rawIcon = (activeTab?.favIconUrl || '').trim();

        const valid = isValidHttpUrl(rawUrl);
        setIsSpecialPage(!valid);

        if (valid) {
          setUrl(rawUrl);
          setTitle(rawTitle || getFallbackTitle(rawUrl));
          setFavIconUrl(rawIcon);
          checkUrlExists(rawUrl);
        } else {
          setTitle(rawTitle || '我的网站');
          setUrl(rawUrl && !rawUrl.startsWith('chrome') && !rawUrl.startsWith('edge') ? rawUrl : 'https://');
        }
      } catch (err) {
        console.error('获取标签页信息异常:', err);
      }
    }

    initCurrentTab();
  }, []);

  // 检查 URL 是否已存在于快捷方式中
  const checkUrlExists = async (targetUrl: string) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      const data = await chrome.storage.local.get([SHORTCUTS_KEY]);
      const list = Array.isArray(data[SHORTCUTS_KEY]) ? (data[SHORTCUTS_KEY] as SiteShortcut[]) : [];
      const normalizedTarget = targetUrl.trim().replace(/\/+$/, '');
      const found = list.some((s) => s.url && s.url.trim().replace(/\/+$/, '') === normalizedTarget);
      setIsExisting(found);
    } catch (err) {
      console.warn('检查快捷方式状态异常:', err);
    }
  };

  // 添加或更新快捷方式
  const handleSaveShortcut = async () => {
    const trimmedUrl = url.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      message.warning('请输入以 http:// 或 https:// 开头的完整有效网址');
      return;
    }

    const finalTitle = (title || getFallbackTitle(trimmedUrl)).trim();
    setSubmitting(true);

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await chrome.storage.local.get([SHORTCUTS_KEY]);
        const list = Array.isArray(data[SHORTCUTS_KEY]) ? (data[SHORTCUTS_KEY] as SiteShortcut[]) : [];

        const normalizedTarget = trimmedUrl.replace(/\/+$/, '');
        const existingIndex = list.findIndex(
          (s) => s.url && s.url.trim().replace(/\/+$/, '') === normalizedTarget
        );

        let nextList: SiteShortcut[];
        if (existingIndex >= 0) {
          nextList = list.map((item, idx) =>
            idx === existingIndex
              ? { ...item, title: finalTitle, icon: favIconUrl || item.icon }
              : item
          );
        } else {
          const newShortcut: SiteShortcut = {
            id: String(Date.now()),
            title: finalTitle,
            url: trimmedUrl,
            icon: favIconUrl || undefined,
          };
          nextList = [...list, newShortcut];
        }

        await chrome.storage.local.set({
          [SHORTCUTS_KEY]: nextList,
          [SHORTCUTS_BACKUP_KEY]: nextList,
        });

        // 扩展角标动画反馈
        if (chrome.action?.setBadgeText) {
          chrome.action.setBadgeText({ text: '✓' });
          chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 2500);
        }

        setIsSuccess(true);
        setIsExisting(true);
        message.success(existingIndex >= 0 ? '快捷方式已更新' : '已成功添加到快捷方式');

        setTimeout(() => {
          setIsSuccess(false);
        }, 1800);
      }
    } catch (err) {
      console.error('保存快捷方式失败:', err);
      message.error('保存失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 图标回退配色
  const avatarPalette = useMemo(() => getAvatarPalette(title || url), [title, url]);
  const avatarChar = useMemo(() => (title || url || 'A').trim().charAt(0).toUpperCase(), [title, url]);
  const hostnameDisplay = useMemo(() => getSafeHostname(url) || '支持输入任意网址', [url]);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 8,
          fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
        },
      }}
    >
      <div
        style={{ width: 320, height: 345 }}
        className={`w-[320px] h-[345px] p-3.5 select-none flex flex-col justify-between font-sans transition-colors box-border overflow-hidden ${
          isDark ? 'text-white/90 bg-[#12161f]' : 'text-gray-800 bg-[#f9fafb]'
        }`}
      >
        {/* 顶部标题栏 */}
        <header className="flex items-center justify-between pb-2 border-b border-black/8 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <img
              src={getExtensionIconUrl()}
              alt="CrabTab"
              className="w-5 h-5 rounded-md object-contain shadow-xs"
            />
            <span className="text-sm font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              CrabTab
            </span>
          </div>

          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            添加快捷方式
          </span>
        </header>

        {/* 核心卡片：当前网页信息 */}
        <div
          className={`p-3 rounded-2xl border transition-all ${
            isDark
              ? 'bg-black/35 border-white/10 shadow-black/20'
              : 'bg-white/80 border-black/8 shadow-black/5'
          } shadow-sm backdrop-blur-md flex flex-col gap-2.5`}
        >
          {/* 站点 Favicon 与识别标签 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 shadow-xs ${
                  isDark ? 'bg-white/5 border-white/12' : 'bg-gray-50 border-black/8'
                }`}
              >
                {favIconUrl && !iconLoadError ? (
                  <img
                    src={favIconUrl}
                    alt="site icon"
                    className="w-4.5 h-4.5 object-contain"
                    onError={() => setIconLoadError(true)}
                  />
                ) : (
                  <div
                    style={{ background: avatarPalette.bg, color: avatarPalette.color }}
                    className="w-full h-full flex items-center justify-center font-bold text-xs"
                  >
                    {avatarChar}
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-gray-800 dark:text-white/90 truncate max-w-[130px]">
                  {isSpecialPage ? '自定义快捷方式' : '当前网页'}
                </span>
                <span className="text-[10.5px] text-gray-400 dark:text-gray-500 truncate max-w-[130px]">
                  {hostnameDisplay}
                </span>
              </div>
            </div>

            {isExisting ? (
              <Tag color="warning" icon={<BookmarkCheck size={11} className="inline mr-0.5" />} className="m-0 text-[10.5px] font-medium px-1.5 py-0">
                已在快捷方式
              </Tag>
            ) : isSpecialPage ? (
              <Tag color="default" icon={<AlertTriangle size={11} className="inline mr-0.5" />} className="m-0 text-[10.5px] px-1.5 py-0">
                手动添加
              </Tag>
            ) : (
              <Tag color="processing" icon={<Compass size={11} className="inline mr-0.5" />} className="m-0 text-[10.5px] px-1.5 py-0">
                网页直通
              </Tag>
            )}
          </div>

          {/* 标题与网址输入区域 */}
          <div className="flex flex-col gap-2 mt-0.5">
            <div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Sparkles size={11} className="text-amber-500" />
                <span>标题名称</span>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onPressEnter={handleSaveShortcut}
                placeholder="例如: GitHub"
                maxLength={60}
                allowClear
                size="middle"
                className="text-xs rounded-lg"
              />
            </div>

            <div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                <Globe size={11} className="text-blue-500" />
                <span>网页网址 (URL)</span>
              </div>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (isValidHttpUrl(e.target.value)) {
                    checkUrlExists(e.target.value);
                  }
                }}
                onPressEnter={handleSaveShortcut}
                placeholder="https://..."
                allowClear
                size="middle"
                className="text-xs font-mono rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* 底部按钮与指引 */}
        <div className="flex flex-col gap-2 pt-0.5">
          <Button
            type="primary"
            size="large"
            loading={submitting}
            icon={
              isSuccess ? (
                <Check size={15} />
              ) : isExisting ? (
                <BookmarkCheck size={15} />
              ) : (
                <BookmarkPlus size={15} />
              )
            }
            onClick={handleSaveShortcut}
            className={`w-full font-semibold rounded-xl transition-all shadow-md h-10 ${
              isSuccess
                ? '!bg-emerald-600 hover:!bg-emerald-500 shadow-emerald-500/25'
                : '!bg-blue-600 hover:!bg-blue-500 shadow-blue-500/25'
            }`}
          >
            {isSuccess
              ? '✓ 保存成功'
              : isExisting
              ? '更新此快捷方式'
              : '添加为快捷方式'}
          </Button>

          <footer className="flex items-center justify-center gap-1 text-[10.5px] text-gray-400 dark:text-gray-500">
            <span>保存后将自动同步到 CrabTab 桌面</span>
          </footer>
        </div>
      </div>
    </ConfigProvider>
  );
};

// 挂载
function mount() {
  const rootElement = document.getElementById('popup-root');
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <ErrorBoundary>
        <PopupApp />
      </ErrorBoundary>
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
