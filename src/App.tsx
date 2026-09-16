import React, { useState, useEffect } from 'react';
import { ConfigProvider, Tooltip, message } from 'antd';
import { 
  SunOutlined, 
  MoonOutlined, 
  TranslationOutlined, 
  SettingOutlined, 
  HistoryOutlined, 
  ReloadOutlined,
  BookOutlined
} from '@ant-design/icons';
import { AppSettings, SiteShortcut, SearchEngineId, CountdownItem } from './types';
import { 
  loadSettings, 
  saveSettings, 
  loadShortcuts, 
  saveShortcuts, 
  loadSearchHistory, 
  saveSearchHistory,
  loadCountdownsFromStorage,
  saveCountdownsToStorage,
  SETTINGS_KEY,
  SHORTCUTS_KEY,
  SEARCH_HISTORY_KEY
} from './utils/storage';
import { getDefaultCountdowns } from './utils/countdown';
import { getAntdTheme } from './theme';
import { SEARCH_ENGINES, RANDOM_WALLPAPER_POOL } from './constants';
import { fetchFromOnlineSource, ONLINE_WALLPAPER_SOURCES } from './utils/wallpaperSources';
import { 
  checkLatestVersion, 
  AUTO_CHECK_UPDATE_INTERVAL, 
  LAST_AUTO_CHECK_KEY,
  getCachedReleaseInfo,
  isUpdateDismissed,
  dismissUpdate,
  ReleaseInfo
} from './utils/versionCheck';
import { Wallpaper } from './components/Wallpaper';
import { Clock } from './components/Clock';
import { SearchBox } from './components/SearchBox';
import { Shortcuts } from './components/Shortcuts';
import { TopBookmarkBar } from './components/TopBookmarkBar';
import { Weather } from './components/Weather';
import { SettingsModal } from './components/SettingsModal';
import { BrowserHistoryDrawer } from './components/BrowserHistoryDrawer';
import { UtilityDrawer } from './components/UtilityDrawer';
import { RecentCards } from './components/RecentCards';
import { UpdateNotification } from './components/UpdateNotification';
import { BrowserHistoryItem } from './types';

// 防抖设置持久化：避免滑块滑动高频触发 chrome.storage 写入与跨标签页广播风暴
let saveSettingsTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSaveSettings = (s: AppSettings) => {
  if (saveSettingsTimer) clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(() => {
    saveSettings(s);
  }, 150);
};

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shortcuts, setShortcuts] = useState<SiteShortcut[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [refreshingWallpaper, setRefreshingWallpaper] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('wallpaper');
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseInfo | null>(() => {
    const cached = getCachedReleaseInfo();
    return cached?.hasUpdate ? cached : null;
  });
  const [isUpdateBannerDismissed, setIsUpdateBannerDismissed] = useState<boolean>(() => {
    const cached = getCachedReleaseInfo();
    return cached?.version ? isUpdateDismissed(cached.version) : false;
  });

  const handleDismissUpdate = () => {
    if (availableUpdate?.version) {
      dismissUpdate(availableUpdate.version);
    }
    setIsUpdateBannerDismissed(true);
  };

  const handleOpenUpdateDetails = () => {
    setSettingsInitialTab('about');
    setSettingsOpen(true);
  };

  // Initialize data
  useEffect(() => {
    async function initData() {
      const [s, sc, sh, cd] = await Promise.all([
        loadSettings(),
        loadShortcuts(),
        loadSearchHistory(),
        loadCountdownsFromStorage<CountdownItem>(),
      ]);
      setSettings(s);
      setShortcuts(sc);
      setSearchHistory(sh);
      setCountdowns(cd !== null ? cd : getDefaultCountdowns(s.language));
      setInitialized(true);
    }
    initData();
  }, []);

  const handleUpdateCountdowns = (newCountdowns: CountdownItem[]) => {
    setCountdowns(newCountdowns);
    saveCountdownsToStorage(newCountdowns);
  };

  // 全局界面缩放响应（根据设置中的 uiScale 动态调整，默认 100% 保持原生精致尺寸）
  useEffect(() => {
    const scale = settings?.uiScale ?? 100;
    if (scale && scale !== 100) {
      document.documentElement.style.zoom = `${scale}%`;
    } else {
      document.documentElement.style.zoom = '';
    }
  }, [settings?.uiScale]);

  // 监听多标签页同步：当用户在其他标签页修改设置、快捷方式或搜索历史时实时同步，避免多标签页陈旧数据互相覆盖
  useEffect(() => {
    if (!initialized) return;

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;

      if (changes[SETTINGS_KEY]?.newValue) {
        const nextVal = changes[SETTINGS_KEY].newValue as AppSettings;
        setSettings((prev) => {
          if (!prev) return nextVal;
          if (JSON.stringify(prev) === JSON.stringify(nextVal)) return prev;
          return nextVal;
        });
      }
      if (changes[SHORTCUTS_KEY]?.newValue) {
        const nextShortcuts = changes[SHORTCUTS_KEY].newValue as SiteShortcut[];
        setShortcuts((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(nextShortcuts)) return prev;
          return nextShortcuts;
        });
      }
      if (changes[SEARCH_HISTORY_KEY]?.newValue) {
        const nextHistory = changes[SEARCH_HISTORY_KEY].newValue as string[];
        setSearchHistory((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(nextHistory)) return prev;
          return nextHistory;
        });
      }
      if (changes['crab_utility_countdowns_v1']?.newValue) {
        const nextCds = changes['crab_utility_countdowns_v1'].newValue as CountdownItem[];
        setCountdowns((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(nextCds)) return prev;
          return nextCds;
        });
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, [initialized]);

  // 壁纸定时自动轮换调度 (每次打开新标签页 / 每小时 / 每天)
  useEffect(() => {
    if (!initialized || !settings || settings.wallpaper.type !== 'online') return;
    const mode = settings.wallpaper.autoRefresh || 'off';
    if (mode === 'off') return;

    const checkAndTrigger = () => {
      const lastRefreshStr = localStorage.getItem('crab_home_wallpaper_last_refresh');
      const now = Date.now();

      if (mode === 'every-open') {
        // 打开新标签页时更换（本次会话仅执行一次）
        if (!sessionStorage.getItem('crab_home_tab_refreshed_wallpaper')) {
          sessionStorage.setItem('crab_home_tab_refreshed_wallpaper', 'true');
          handleRefreshWallpaper(true);
        }
        return;
      }

      if (!lastRefreshStr) {
        // 初次无记录时标记当前时间
        localStorage.setItem('crab_home_wallpaper_last_refresh', String(now));
        return;
      }

      const last = parseInt(lastRefreshStr, 10);
      const diff = now - last;

      if (mode === '1h' && diff >= 60 * 60 * 1000) {
        handleRefreshWallpaper(true);
      } else if (mode === '1d' && diff >= 24 * 60 * 60 * 1000) {
        handleRefreshWallpaper(true);
      }
    };

    // 挂载时立即检测
    checkAndTrigger();

    // 运行定期轮询检测（每 60 秒检查一次是否到达 1h 或 1d）
    const intervalTimer = setInterval(checkAndTrigger, 60 * 1000);
    return () => clearInterval(intervalTimer);
  }, [initialized, settings?.wallpaper.type, settings?.wallpaper.autoRefresh]);

  // 用户进入页面后的自动检测更新（默认开启，距上次检测至少间隔 6 小时）
  useEffect(() => {
    if (!initialized || !settings || settings.autoCheckUpdate === false) return;

    const checkOnEnter = async () => {
      try {
        const lastCheckStr = localStorage.getItem(LAST_AUTO_CHECK_KEY);
        const lastCheckTime = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;
        const now = Date.now();

        // 距上次检测至少间隔 6 小时才发起网络请求
        if (now - lastCheckTime >= AUTO_CHECK_UPDATE_INTERVAL) {
          localStorage.setItem(LAST_AUTO_CHECK_KEY, now.toString());
          const info = await checkLatestVersion(true);
          if (info?.hasUpdate) {
            setAvailableUpdate(info);
            setIsUpdateBannerDismissed(isUpdateDismissed(info.version));
          }
        } else {
          // 间隔时间内同步本地缓存状态
          const cached = getCachedReleaseInfo();
          if (cached?.hasUpdate) {
            setAvailableUpdate(cached);
            setIsUpdateBannerDismissed(isUpdateDismissed(cached.version));
          }
        }
      } catch {
        // 静默捕获，不阻塞用户
      }
    };

    // 页面渲染就绪 3 秒后执行检测，避免干扰首屏关键加载
    const enterTimer = setTimeout(checkOnEnter, 3000);

    return () => {
      clearTimeout(enterTimer);
    };
  }, [initialized, settings?.autoCheckUpdate]);

  // Sync dark class to html document root for all Portals (Modal, Drawer, Popover)
  useEffect(() => {
    if (!settings) return;
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.theme]);


  // Update Settings
  const handleUpdateSettings = (newPartial: Partial<AppSettings>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...newPartial };
      debouncedSaveSettings(updated);
      return updated;
    });
  };

  // Switch Language
  const handleToggleLanguage = () => {
    if (!settings) return;
    const nextLang = settings.language === 'zh' ? 'en' : 'zh';
    handleUpdateSettings({ language: nextLang });
  };

  // Switch Theme (Dark / Light)
  const handleToggleTheme = () => {
    if (!settings) return;
    const currentIsDark =
      settings.theme === 'dark' ||
      (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const nextTheme = currentIsDark ? 'light' : 'dark';
    handleUpdateSettings({ theme: nextTheme });
  };

  // Search Action
  const handleSearch = (keyword: string) => {
    if (!keyword.trim() || !settings) return;
    const engine = SEARCH_ENGINES.find((e) => e.id === settings.searchEngine) || SEARCH_ENGINES[0];
    const targetUrl = engine.url.replace('%s', encodeURIComponent(keyword));

    // Save Search History (limit 20)
    const updatedHistory = [keyword, ...searchHistory.filter((k) => k !== keyword)].slice(0, 20);
    setSearchHistory(updatedHistory);
    saveSearchHistory(updatedHistory);

    if (settings.openInNewTab) {
      window.open(targetUrl, '_blank');
    } else {
      window.location.href = targetUrl;
    }
  };

  const handleSelectEngine = (engineId: SearchEngineId) => {
    handleUpdateSettings({ searchEngine: engineId });
  };

  const handleRemoveHistoryItem = (item: string) => {
    const updated = searchHistory.filter((k) => k !== item);
    setSearchHistory(updated);
    saveSearchHistory(updated);
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
    saveSearchHistory([]);
  };

  // Refresh Online Wallpaper with smooth transition & real dynamic online API
  const handleRefreshWallpaper = async (silent = false) => {
    if (!settings || refreshingWallpaper) return;
    setRefreshingWallpaper(true);

    try {
      // 优先从当前选中的在线源获取，若无则从支持动态获取的在线源列表中随机选一个
      const currentSource = settings.wallpaper.source;
      const validSources = ONLINE_WALLPAPER_SOURCES.map((s) => s.id);
      const targetSourceId = (currentSource && validSources.includes(currentSource))
        ? currentSource
        : validSources[Math.floor(Math.random() * validSources.length)];

      const res = await fetchFromOnlineSource(targetSourceId);
      const nextUrl = res.url;

      // 记录刷新时间戳
      localStorage.setItem('crab_home_wallpaper_last_refresh', String(Date.now()));

      // 立即更新壁纸状态，由底层 Wallpaper 组件平滑加载和渐变过渡
      handleUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: 'online',
          source: targetSourceId,
          customUrl: nextUrl,
        },
      });

      if (!silent) {
        const sourceMeta = ONLINE_WALLPAPER_SOURCES.find((s) => s.id === targetSourceId);
        const name = settings.language === 'zh' ? sourceMeta?.nameZh : sourceMeta?.nameEn;
        if (name) {
          message.success(
            settings.language === 'zh'
              ? `已从「${name}」获取新壁纸`
              : `New wallpaper fetched from ${name}`
          );
        }
      }
      setTimeout(() => setRefreshingWallpaper(false), 400);
    } catch (err) {
      console.error('Failed to fetch from live online wallpaper source:', err);
      // Fallback 到随机池
      const currentUrl = settings.wallpaper.customUrl || '';
      const filtered = RANDOM_WALLPAPER_POOL.filter((url) => url !== currentUrl);
      const nextUrl = filtered[Math.floor(Math.random() * filtered.length)] || RANDOM_WALLPAPER_POOL[0];
      handleUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: 'online',
          customUrl: nextUrl,
        },
      });
      setRefreshingWallpaper(false);
    }
  };

  // Shortcuts Operations
  const handleAddShortcut = (shortcut: SiteShortcut) => {
    setShortcuts((prev) => {
      const next = [...prev, shortcut];
      saveShortcuts(next);
      return next;
    });
  };

  const handleEditShortcut = (updated: SiteShortcut) => {
    setShortcuts((prev) => {
      const next = prev.map((s) => (s.id === updated.id ? updated : s));
      saveShortcuts(next);
      return next;
    });
  };

  const handleDeleteShortcut = (id: string) => {
    setShortcuts((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveShortcuts(next);
      return next;
    });
  };

  const handleReorderShortcuts = (reordered: SiteShortcut[]) => {
    setShortcuts(reordered);
    saveShortcuts(reordered);
  };

  const handleUpdateClockStyle = (newStyle: Partial<AppSettings['clockStyle']>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated: AppSettings = {
        ...prev,
        clockStyle: {
          ...prev.clockStyle,
          ...newStyle,
        },
      };
      debouncedSaveSettings(updated);
      return updated;
    });
  };

  const handleTogglePinRecent = (item: BrowserHistoryItem) => {
    if (!settings) return;
    const currentPinned = settings.pinnedRecentUrls || [];
    const isPinned = currentPinned.includes(item.url);
    const nextPinned = isPinned
      ? currentPinned.filter((u) => u !== item.url)
      : [item.url, ...currentPinned];
    handleUpdateSettings({ pinnedRecentUrls: nextPinned });
  };

  if (!initialized || !settings) return null;

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <ConfigProvider theme={getAntdTheme(settings.theme)}>
      {/* Root Container strictly constrained to screen dimensions (no horizontal overflow) */}
      <div
        className={`relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none ${
          isDark ? 'dark text-white' : 'text-gray-900'
        }`}
      >
        {/* Dynamic Multi-source Wallpaper */}
        <Wallpaper config={settings.wallpaper} theme={settings.theme} />

        {/* Top Navigation Bar: 天气（左） + 书签栏（中） + 操作按钮（右）- 整合于同一行 */}
        <header
          className="header-bar-responsive relative z-30 w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 pointer-events-auto transition-all"
        >
          {/* 1. Left: Weather Widget */}
          <div className="shrink-0 flex items-center">
            {settings.showWeather && (
              <Weather
                language={settings.language}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
              />
            )}
          </div>

          {/* 2. Center: Bookmark Bar (同一行自适应宽度展示，充分利用大屏空间，与两侧组件保持安全间距) */}
          {(settings.showBookmarkBar ?? true) ? (
            <div className="flex-1 min-w-0 flex justify-center px-1 sm:px-3">
              <TopBookmarkBar
                language={settings.language}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
                openInNewTab={settings.openInNewTab}
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0" />
          )}

          {/* 3. Right: Quick Action Buttons (统一胶囊形态与毛玻璃材质) */}
          <div className="shrink-0 flex items-center">
            <div
              className={`h-9 px-1.5 rounded-full border flex items-center gap-1 shadow-sm transition-all duration-200 select-none ${
                isDark
                  ? 'bg-black/35 hover:bg-black/45 border-white/12 text-white/90 shadow-black/20'
                  : 'bg-white/65 hover:bg-white/80 border-black/8 text-gray-800 shadow-black/5'
              }`}
              style={{
                backdropFilter: `blur(${settings.glassStyle.blur}px)`,
              }}
            >
              {/* Refresh Wallpaper */}
              <Tooltip title={settings.language === 'zh' ? '换一张壁纸' : 'New Wallpaper'} placement="bottom">
                <button
                  type="button"
                  onClick={() => handleRefreshWallpaper(false)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12'
                  }`}
                >
                  <ReloadOutlined className={`text-xs transition-transform duration-700 ${refreshingWallpaper ? "animate-spin text-blue-400" : ""}`} />
                </button>
              </Tooltip>

              {/* Theme Toggle Button */}
              <Tooltip title={settings.theme === 'dark' ? (settings.language === 'zh' ? '切换为浅色' : 'Light Mode') : (settings.language === 'zh' ? '切换为深色' : 'Dark Mode')} placement="bottom">
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12'
                  }`}
                >
                  {settings.theme === 'dark' ? <SunOutlined className="text-xs" /> : <MoonOutlined className="text-xs" />}
                </button>
              </Tooltip>

              {/* Language Toggle Button */}
              <Tooltip title={settings.language === 'zh' ? 'Switch to English' : '切换为简体中文'} placement="bottom">
                <button
                  type="button"
                  onClick={handleToggleLanguage}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12'
                  }`}
                >
                  <TranslationOutlined className="text-xs" />
                </button>
              </Tooltip>

              {/* Browser Bookmarks Bar Toggle Button */}
              <Tooltip
                title={
                  (settings.showBookmarkBar ?? true)
                    ? (settings.language === 'zh' ? '隐藏浏览器书签栏' : 'Hide Bookmarks Bar')
                    : (settings.language === 'zh' ? '显示浏览器书签栏' : 'Show Bookmarks Bar')
                }
                placement="bottom"
              >
                <button
                  type="button"
                  onClick={() => handleUpdateSettings({ showBookmarkBar: !(settings.showBookmarkBar ?? true) })}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    (settings.showBookmarkBar ?? true)
                      ? isDark
                        ? 'bg-white/15 text-emerald-400 font-semibold shadow-inner'
                        : 'bg-black/10 text-emerald-600 font-semibold shadow-inner'
                      : isDark
                        ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20 opacity-50 hover:opacity-100'
                        : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12 opacity-50 hover:opacity-100'
                  }`}
                  aria-label="切换浏览器书签栏"
                >
                  <BookOutlined className="text-xs" />
                </button>
              </Tooltip>

              {/* Browser History Drawer Toggle Button */}
              <Tooltip title={settings.language === 'zh' ? '浏览历史记录' : 'Browser History'} placement="bottom">
                <button
                  type="button"
                  onClick={() => setHistoryDrawerOpen(true)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12'
                  }`}
                >
                  <HistoryOutlined className="text-xs" />
                </button>
              </Tooltip>

              {/* Settings Modal Toggle Button */}
              <Tooltip
                title={
                  availableUpdate?.hasUpdate
                    ? (settings.language === 'zh'
                        ? `设置（发现新版本 v${availableUpdate.version}）`
                        : `Settings (New version v${availableUpdate.version} available)`)
                    : (settings.language === 'zh' ? '设置' : 'Settings')
                }
                placement="bottom"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (availableUpdate?.hasUpdate) {
                      setSettingsInitialTab('about');
                    } else {
                      setSettingsInitialTab('wallpaper');
                    }
                    setSettingsOpen(true);
                  }}
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    isDark
                      ? 'hover:bg-white/15 text-white/85 hover:text-white active:bg-white/20'
                      : 'hover:bg-black/8 text-gray-700 hover:text-gray-950 active:bg-black/12'
                  }`}
                >
                  <SettingOutlined className="text-xs" />
                  {availableUpdate?.hasUpdate && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-[#181a20] animate-pulse" />
                  )}
                </button>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* Central Core Layout: Clock, Search Box & Shortcuts - 基于页面顶部定位 */}
        <main className="main-layout-responsive relative z-10 w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 flex-1 flex flex-col items-center justify-start pointer-events-auto min-h-0 pt-3 sm:pt-4 md:pt-6 pb-6">
          {/* Digital Clock with Interactive Popover - 固定高度插槽与底部锚定，确保时间参数修改绝不引起下方搜索框位置变动 */}
          <div className="clock-slot-responsive w-full flex items-end justify-center h-[140px] sm:h-[156px] mb-4 sm:mb-6 flex-shrink-0 select-none">
            <Clock
              language={settings.language}
              theme={settings.theme}
              showSeconds={settings.showSeconds}
              timeFormat24={settings.timeFormat24}
              showGreeting={settings.showGreeting}
              hitokotoTypes={settings.hitokotoTypes}
              clockStyle={settings.clockStyle}
              onUpdateClockStyle={handleUpdateClockStyle}
            />
          </div>

          {/* Frosted Glass Search Bar */}
          <div
            className="searchbox-slot-responsive w-full flex justify-center mb-6 sm:mb-8 flex-shrink-0 relative z-20"
            style={{
              transform: `translateY(${settings.searchVerticalOffset || 0}px)`,
              transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
            }}
          >
            <SearchBox
              currentEngineId={settings.searchEngine}
              suggestionEngine={settings.suggestionEngine}
              searchHistory={searchHistory}
              searchBookmarks={settings.searchBookmarks ?? true}
              searchHistoryEnabled={settings.searchHistory ?? true}
              verticalOffset={settings.searchVerticalOffset || 0}
              openInNewTab={settings.openInNewTab}
              language={settings.language}
              theme={settings.theme}
              glassStyle={settings.glassStyle}
              onSearch={handleSearch}
              onSelectEngine={handleSelectEngine}
              onRemoveHistoryItem={handleRemoveHistoryItem}
              onClearHistory={handleClearHistory}
              onToggleSearchBookmarks={(enabled) => handleUpdateSettings({ searchBookmarks: enabled })}
              onToggleSearchHistory={(enabled) => handleUpdateSettings({ searchHistory: enabled })}
              onUpdateVerticalOffset={(val) => handleUpdateSettings({ searchVerticalOffset: val })}
              onOpenUrl={(url) => {
                if (settings.openInNewTab) {
                  window.open(url, '_blank');
                } else {
                  window.location.href = url;
                }
              }}
            />
          </div>

          {/* Main Content Area - 快捷方式 vs 最近访问卡片式流 */}
          {(settings.homeContentMode ?? 'shortcuts') === 'shortcuts' && settings.shortcutMode !== 'off' && (
            <div className={`w-full flex justify-center flex-shrink-0 ${
              settings.shortcutMode === 'desktop' ? 'min-h-[96px]' : 'min-h-0'
            }`}>
              <Shortcuts
                shortcuts={shortcuts}
                displayMode={settings.shortcutMode}
                language={settings.language}
                openInNewTab={settings.openInNewTab}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
                onAddShortcut={handleAddShortcut}
                onEditShortcut={handleEditShortcut}
                onDeleteShortcut={handleDeleteShortcut}
                onReorderShortcuts={handleReorderShortcuts}
                autoFill={settings.shortcutAutoFill === true}
                onToggleAutoFill={(autoFill) => handleUpdateSettings({ shortcutAutoFill: autoFill })}
                desktopPageCount={settings.desktopPageCount || 1}
                onUpdatePageCount={(count) => handleUpdateSettings({ desktopPageCount: count })}
              />
            </div>
          )}

          {(settings.homeContentMode ?? 'shortcuts') === 'recent' && (
            <div
              className="recent-cards-slot w-full flex justify-center flex-shrink-0 min-h-[110px]"
              style={{
                transform: `translateY(${settings.recentVerticalOffset || 0}px)`,
                transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
              }}
            >
              <RecentCards
                language={settings.language}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
                openInNewTab={settings.openInNewTab}
                pinnedUrls={settings.pinnedRecentUrls || []}
                verticalOffset={settings.recentVerticalOffset || 0}
                onUpdateVerticalOffset={(val) => handleUpdateSettings({ recentVerticalOffset: val })}
                onTogglePin={handleTogglePinRecent}
              />
            </div>
          )}
        </main>

        <UtilityDrawer
          language={settings.language}
          theme={settings.theme}
          glassStyle={settings.glassStyle}
          countdowns={countdowns}
          onUpdateCountdowns={handleUpdateCountdowns}
        />

        {/* Ant Design Settings Modal */}
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onRefreshWallpaper={handleRefreshWallpaper}
          initialTab={settingsInitialTab}
        />

        {/* 顶部常驻新版本提示组件 */}
        {availableUpdate?.hasUpdate && !isUpdateBannerDismissed && (
          <UpdateNotification
            updateInfo={availableUpdate}
            onOpenDetails={handleOpenUpdateDetails}
            onDismiss={handleDismissUpdate}
            language={settings.language}
            theme={settings.theme}
            glassStyle={settings.glassStyle}
          />
        )}

        {/* Ant Design History Drawer */}
        <BrowserHistoryDrawer
          open={historyDrawerOpen}
          onClose={() => setHistoryDrawerOpen(false)}
          language={settings.language}
          theme={settings.theme}
          glassStyle={settings.glassStyle}
        />
      </div>
    </ConfigProvider>
  );
};
