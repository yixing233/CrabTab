import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Input, Empty, Spin } from 'antd';
import { 
  GlobalOutlined, 
  HistoryOutlined,
  CompassOutlined
} from '@ant-design/icons';
import { Search, ExternalLink, Clock, Calendar } from 'lucide-react';
import { Language, BrowserHistoryItem, ThemeMode } from '../types';
import { fetchBrowserHistory } from '../utils/history';
import { i18n } from '../i18n';

interface BrowserHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  theme: ThemeMode;
  glassStyle: {
    blur: number;
    opacity: number;
  };
}

// 现代微质感站点图标（精准居中、圆角柔光、失败时优雅退回地球仪）
const HistoryFavicon: React.FC<{ domain: string }> = ({ domain }) => {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="w-9 h-9 rounded-xl bg-white/[0.06] dark:bg-white/[0.05] border border-black/5 dark:border-white/10 flex items-center justify-center text-neutral-400 overflow-hidden shrink-0 shadow-sm transition-transform duration-200 group-hover:border-blue-500/40">
      {!hasError ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-4.5 h-4.5 object-contain"
          onError={() => setHasError(true)}
        />
      ) : (
        <GlobalOutlined className="text-xs text-neutral-400 opacity-60" />
      )}
    </div>
  );
};

export const BrowserHistoryDrawer: React.FC<BrowserHistoryDrawerProps> = ({
  open,
  onClose,
  language,
  theme,
}) => {
  const [historyItems, setHistoryItems] = useState<BrowserHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const t = i18n[language];
  const isDark = theme === 'dark';

  const loadHistory = async () => {
    setLoading(true);
    try {
      const items = await fetchBrowserHistory(80);
      setHistoryItems(items);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open]);

  // 搜索过滤
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return historyItems;
    return historyItems.filter((item) =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.url || '').toLowerCase().includes(q)
    );
  }, [historyItems, searchQuery]);

  // 智能时间分组（今天、昨天、更早）
  const groupedSections = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const todayList: BrowserHistoryItem[] = [];
    const yesterdayList: BrowserHistoryItem[] = [];
    const olderList: BrowserHistoryItem[] = [];

    filteredItems.forEach((item) => {
      const d = item.lastVisitTime ? new Date(item.lastVisitTime) : new Date();
      const dStr = d.toDateString();
      if (dStr === todayStr) {
        todayList.push(item);
      } else if (dStr === yesterdayStr) {
        yesterdayList.push(item);
      } else {
        olderList.push(item);
      }
    });

    const sections: { title: string; items: BrowserHistoryItem[] }[] = [];
    if (todayList.length > 0) {
      sections.push({
        title: language === 'zh' ? '今天' : 'Today',
        items: todayList,
      });
    }
    if (yesterdayList.length > 0) {
      sections.push({
        title: language === 'zh' ? '昨天' : 'Yesterday',
        items: yesterdayList,
      });
    }
    if (olderList.length > 0) {
      sections.push({
        title: language === 'zh' ? '更早' : 'Older',
        items: olderList,
      });
    }
    return sections;
  }, [filteredItems, language]);

  const formatClock = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const handleOpenFullHistory = () => {
    // 优先使用 Chrome / Edge 扩展 API 打开历史页，避免网页端 CSP/跨协议拦截
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://history' });
      return;
    }
    // 非扩展模式或浏览器拦截 window.open('chrome://history') 时的降级处理
    try {
      window.open('chrome://history', '_blank');
    } catch {
      // 忽略直接调用受限协议抛出的静默错误
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
    });
  };

  return (
    <Drawer
      title={
        <div className="flex items-center justify-between pr-2">
          <div className="flex items-center gap-2">
            <HistoryOutlined className="text-base" />
            <span className="font-semibold text-sm text-neutral-800 dark:text-white">
              {t.browserHistoryTitle}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenFullHistory}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <CompassOutlined className="text-sm" />
            <span>{language === 'zh' ? '完整记录' : 'Full History'}</span>
          </button>
        </div>
      }
      placement="right"
      width={400}
      open={open}
      onClose={onClose}
      className="custom-history-drawer"
      styles={{
        header: {
          padding: '16px 20px',
          borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
          background: isDark ? '#14161d' : '#ffffff',
        },
        body: {
          padding: '16px 16px 24px',
          background: isDark ? '#14161d' : '#f8f9fa',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <div className="flex flex-col h-full space-y-3.5">
        {/* 顶部搜索输入框 */}
        <div className="relative">
          <Input
            prefix={<Search className="w-4 h-4 text-neutral-400 mr-1 shrink-0" />}
            placeholder={language === 'zh' ? '检索历史记录或网址...' : 'Search history titles or URLs...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            allowClear
            className="h-10 rounded-xl bg-black/5 dark:bg-white/[0.06] border-black/10 dark:border-white/10 hover:border-blue-500 focus:border-blue-500 text-xs transition-all shadow-inner"
          />
        </div>

        {/* 历史记录列表区 */}
        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center items-center py-24">
              <Spin />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-24 text-center">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span className="text-xs text-neutral-400">
                    {searchQuery
                      ? (language === 'zh' ? '未找到相关历史记录' : 'No matching history found')
                      : t.noBrowserHistory}
                  </span>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSections.map((sec) => (
                <div key={sec.title} className="space-y-1.5">
                  {/* 时间分组标头 */}
                  <div className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-neutral-400 select-none">
                    <Calendar className="w-3 h-3 opacity-60" />
                    <span>{sec.title}</span>
                    <span className="text-[10px] text-neutral-500 opacity-60">· {sec.items.length}</span>
                  </div>

                  {/* 该分组下的记录卡片 */}
                  <div className="space-y-1">
                    {sec.items.map((item) => {
                      let domain = '';
                      try {
                        domain = new URL(item.url).hostname.replace(/^www\./, '');
                      } catch {
                        domain = item.url;
                      }

                      return (
                        <div
                          key={item.id}
                          onClick={() => window.open(item.url, '_blank')}
                          className="group relative flex items-center gap-3 p-2 rounded-xl transition-all duration-150 cursor-pointer select-none bg-white/[0.02] hover:bg-white/[0.08] dark:hover:bg-white/[0.07] border border-transparent hover:border-black/5 dark:hover:border-white/10"
                        >
                          <HistoryFavicon domain={domain} />

                          <div className="flex-1 min-w-0 pr-1">
                            <div className="text-xs font-medium truncate text-neutral-800 dark:text-neutral-100 group-hover:text-blue-500 transition-colors">
                              {item.title || domain}
                            </div>
                            <div className="text-[11px] truncate text-neutral-400/80 mt-0.5 font-mono flex items-center gap-1">
                              <span>{domain}</span>
                            </div>
                          </div>

                          {/* 右侧悬停动作或时间显示 */}
                          <div className="shrink-0 flex items-center justify-end text-neutral-400">
                            <div className="group-hover:hidden flex items-center gap-1 text-[11px] font-mono opacity-60">
                              <Clock className="w-2.5 h-2.5 opacity-60" />
                              <span>{item.lastVisitTime ? (sec.title === (language === 'zh' ? '今天' : 'Today') ? formatClock(item.lastVisitTime) : formatDate(item.lastVisitTime)) : ''}</span>
                            </div>
                            <div className="hidden group-hover:flex items-center gap-0.5 text-blue-500 text-xs">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
