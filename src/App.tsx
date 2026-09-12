import React, { useState, useEffect } from 'react';
import { ConfigProvider, Tooltip, message } from 'antd';
import { 
  SunOutlined, 
  MoonOutlined, 
  TranslationOutlined, 
  SettingOutlined, 
  HistoryOutlined, 
  ReloadOutlined
} from '@ant-design/icons';
import { AppSettings, SiteShortcut, SearchEngineId } from './types';
import { 
  loadSettings, 
  saveSettings, 
  loadShortcuts, 
  saveShortcuts, 
  loadSearchHistory, 
  saveSearchHistory 
} from './utils/storage';
import { getAntdTheme } from './theme';
import { SEARCH_ENGINES, RANDOM_WALLPAPER_POOL } from './constants';
import { fetchFromOnlineSource, ONLINE_WALLPAPER_SOURCES } from './utils/wallpaperSources';
import { Wallpaper } from './components/Wallpaper';
import { Clock } from './components/Clock';
import { SearchBox } from './components/SearchBox';
import { Shortcuts } from './components/Shortcuts';
import { Weather } from './components/Weather';
import { SettingsModal } from './components/SettingsModal';
import { BrowserHistoryDrawer } from './components/BrowserHistoryDrawer';
import { UtilityDrawer } from './components/UtilityDrawer';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shortcuts, setShortcuts] = useState<SiteShortcut[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [refreshingWallpaper, setRefreshingWallpaper] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize data
  useEffect(() => {
    async function initData() {
      const [s, sc, sh] = await Promise.all([
        loadSettings(),
        loadShortcuts(),
        loadSearchHistory(),
      ]);
      setSettings(s);
      setShortcuts(sc);
      setSearchHistory(sh);
      setInitialized(true);
    }
    initData();
  }, []);

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
    if (!settings) return;
    const updated = { ...settings, ...newPartial };
    setSettings(updated);
    saveSettings(updated);
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
    const next = [...shortcuts, shortcut];
    setShortcuts(next);
    saveShortcuts(next);
  };

  const handleEditShortcut = (updated: SiteShortcut) => {
    const next = shortcuts.map((s) => (s.id === updated.id ? updated : s));
    setShortcuts(next);
    saveShortcuts(next);
  };

  const handleDeleteShortcut = (id: string) => {
    const next = shortcuts.filter((s) => s.id !== id);
    setShortcuts(next);
    saveShortcuts(next);
  };
  const handleReorderShortcuts = (reordered: SiteShortcut[]) => {
    setShortcuts(reordered);
    saveShortcuts(reordered);
  };

  const handleUpdateClockStyle = (newStyle: Partial<AppSettings['clockStyle']>) => {
    if (!settings) return;
    const updated: AppSettings = {
      ...settings,
      clockStyle: {
        ...settings.clockStyle,
        ...newStyle,
      },
    };
    setSettings(updated);
    saveSettings(updated);
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

        {/* Top Navigation Bar - 高层叠层级 z-30 确保弹出的天气卡片与操作浮层绝对置顶，绝不被 main 遮挡 */}
        <header className="relative z-30 w-full px-6 py-4 flex items-center justify-between pointer-events-auto">
          {/* Weather Widget (Top Left) */}
          <div>
            {settings.showWeather && (
              <Weather
                language={settings.language}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
              />
            )}
          </div>

          {/* Quick Action Buttons (Top Right) */}
          <div className="flex items-center gap-2.5">
            {/* Refresh Wallpaper */}
            <Tooltip title={settings.language === 'zh' ? '换一张壁纸' : 'New Wallpaper'} placement="bottom">
              <button
                type="button"
                onClick={() => handleRefreshWallpaper(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 text-white/80 hover:text-white cursor-pointer shadow-md border border-white/20 hover:border-white/60 hover:bg-white/20 active:bg-white/30"
                style={{
                  backdropFilter: `blur(${settings.glassStyle.blur}px)`,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                  <ReloadOutlined className={`text-sm transition-transform duration-700 ${refreshingWallpaper ? "animate-spin text-blue-400" : ""}`} />
              </button>
            </Tooltip>

            {/* Theme Toggle Button */}
            <Tooltip title={settings.theme === 'dark' ? (settings.language === 'zh' ? '切换为浅色' : 'Light Mode') : (settings.language === 'zh' ? '切换为深色' : 'Dark Mode')} placement="bottom">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 text-white/80 hover:text-white cursor-pointer shadow-md border border-white/20 hover:border-white/60 hover:bg-white/20 active:bg-white/30"
                style={{
                  backdropFilter: `blur(${settings.glassStyle.blur}px)`,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                {settings.theme === 'dark' ? <SunOutlined className="text-sm" /> : <MoonOutlined className="text-sm" />}
              </button>
            </Tooltip>

            {/* Language Toggle Button */}
            <Tooltip title={settings.language === 'zh' ? 'Switch to English' : '切换为简体中文'} placement="bottom">
              <button
                type="button"
                onClick={handleToggleLanguage}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 text-white/80 hover:text-white cursor-pointer shadow-md border border-white/20 hover:border-white/60 hover:bg-white/20 active:bg-white/30"
                style={{
                  backdropFilter: `blur(${settings.glassStyle.blur}px)`,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                <TranslationOutlined className="text-sm" />
              </button>
            </Tooltip>

            {/* Browser History Drawer Toggle Button */}
            <Tooltip title={settings.language === 'zh' ? '浏览历史记录' : 'Browser History'} placement="bottom">
              <button
                type="button"
                onClick={() => setHistoryDrawerOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 text-white/80 hover:text-white cursor-pointer shadow-md border border-white/20 hover:border-white/60 hover:bg-white/20 active:bg-white/30"
                style={{
                  backdropFilter: `blur(${settings.glassStyle.blur}px)`,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                <HistoryOutlined className="text-sm" />
              </button>
            </Tooltip>

            {/* Settings Modal Toggle Button */}
            <Tooltip title={settings.language === 'zh' ? '主页个性化设置' : 'Settings'} placement="bottom">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 text-white/80 hover:text-white cursor-pointer shadow-md border border-white/20 hover:border-white/60 hover:bg-white/20 active:bg-white/30"
                style={{
                  backdropFilter: `blur(${settings.glassStyle.blur}px)`,
                  backgroundColor: settings.theme === 'dark' ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)',
                }}
              >
                <SettingOutlined className="text-sm" />
              </button>
            </Tooltip>
          </div>
        </header>

        {/* Central Core Layout: Clock, Search Box & Shortcuts - 基于页面顶部定位 */}
        <main className="relative z-10 w-full max-w-5xl mx-auto px-4 flex-1 flex flex-col items-center justify-start pointer-events-auto min-h-0 pt-3 sm:pt-4 md:pt-6 pb-6">
          {/* Digital Clock with Interactive Popover - 固定高度插槽与底部锚定，确保时间参数修改绝不引起下方搜索框位置变动 */}
          <div className="w-full flex items-end justify-center h-[140px] sm:h-[156px] mb-4 sm:mb-6 flex-shrink-0 select-none">
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
          <div className="w-full flex justify-center mb-6 sm:mb-8 flex-shrink-0">
            <SearchBox
              currentEngineId={settings.searchEngine}
              suggestionEngine={settings.suggestionEngine}
              searchHistory={searchHistory}
              language={settings.language}
              theme={settings.theme}
              glassStyle={settings.glassStyle}
              onSearch={handleSearch}
              onSelectEngine={handleSelectEngine}
              onRemoveHistoryItem={handleRemoveHistoryItem}
              onClearHistory={handleClearHistory}
            />
          </div>

          {/* Quick Shortcuts */}
          {settings.showQuickLinks && (
            <div className="w-full flex justify-center min-h-[96px] flex-shrink-0">
              <Shortcuts
                shortcuts={shortcuts}
                language={settings.language}
                openInNewTab={settings.openInNewTab}
                theme={settings.theme}
                glassStyle={settings.glassStyle}
                onAddShortcut={handleAddShortcut}
                onEditShortcut={handleEditShortcut}
                onDeleteShortcut={handleDeleteShortcut}
                onReorderShortcuts={handleReorderShortcuts}
              />
            </div>
          )}
        </main>

        <UtilityDrawer
          language={settings.language}
          theme={settings.theme}
          glassStyle={settings.glassStyle}
        />

        {/* Ant Design Settings Modal */}
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onRefreshWallpaper={handleRefreshWallpaper}
        />

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
