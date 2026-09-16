import React, { useState, useEffect, useRef } from 'react';
import { Spin, Tooltip } from 'antd';
import {
  MapPin,
  RotateCw,
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Gauge,
  Compass,
  Droplets,
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Language } from '../types';
import { fetchCurrentWeather, getCachedWeather, WeatherData } from '../utils/weather';
import { WeatherHourlyChart } from './WeatherHourlyChart';
import { WeatherDailyChart } from './WeatherDailyChart';
import { i18n } from '../i18n';

interface WeatherProps {
  language: Language;
  theme: 'dark' | 'light' | 'auto';
  glassStyle: {
    blur: number;
    opacity: number;
    borderOpacity: number;
  };
}

// 人性化格式化预警发布时间（去除生硬的 ISO T 和 +08:00 时区后缀）
function formatAlertPubTime(rawTime: string, lang: 'zh' | 'en'): string {
  if (!rawTime) return '';
  try {
    const d = new Date(rawTime);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');

      if (lang === 'zh') {
        return `${year}-${month}-${date} ${hours}:${minutes}`;
      } else {
        return `${month}/${date}/${year} ${hours}:${minutes}`;
      }
    }
  } catch {
    // ignore
  }

  // 兜底正则替换：2026-09-09T09:44:00+08:00 -> 2026-09-09 09:44
  return rawTime
    .replace('T', ' ')
    .replace(/\+08:?00$/, '')
    .replace(/:\d{2}$/, '')
    .trim();
}

export const Weather: React.FC<WeatherProps> = ({ language, theme, glassStyle }) => {
  // 优先从本地持久化缓存秒级加载，实现零延迟秒开展示
  const [data, setData] = useState<WeatherData | null>(() => getCachedWeather(language));
  const [loading, setLoading] = useState<boolean>(() => !getCachedWeather(language));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  // 关闭时保留浮层，待退场动画完成后再卸载，避免卡片瞬间消失。
  const [isPopoverMounted, setIsPopoverMounted] = useState<boolean>(false);
  const [isPopoverVisible, setIsPopoverVisible] = useState<boolean>(false);
  const [activeAlertIndex, setActiveAlertIndex] = useState<number>(0);
  const [isAlertExpanded, setIsAlertExpanded] = useState<boolean>(false);
  const [isAlertHovered, setIsAlertHovered] = useState<boolean>(false);
  const weatherContainerRef = useRef<HTMLDivElement>(null);

  const t = i18n[language];
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // 多预警自动轮播定时器（悬停或展开时自动暂停）
  useEffect(() => {
    const alertCount = data?.alerts?.length || 0;
    if (alertCount <= 1 || isAlertExpanded || isAlertHovered) return;

    const timer = setInterval(() => {
      setActiveAlertIndex((prev) => (prev + 1) % alertCount);
    }, 4500);

    return () => clearInterval(timer);
  }, [data?.alerts?.length, isAlertExpanded, isAlertHovered]);

  // 先挂载关闭态，等待浏览器完成一帧绘制后再切换为展开态，确保过渡可见。
  // 关闭时则保留节点至退场动画结束，快速重复点击会自动取消旧任务。
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let unmountTimer = 0;

    if (isOpen) {
      setIsPopoverMounted(true);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsPopoverVisible(true));
      });
    } else {
      setIsPopoverVisible(false);
      if (isPopoverMounted) {
        unmountTimer = window.setTimeout(() => setIsPopoverMounted(false), 220);
      }
    }

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(unmountTimer);
    };
  }, [isOpen]);

  // 点击外部和按 Esc 关闭天气卡片
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 如果点击的目标或者其祖先节点在天气组件容器内，绝不关闭
      if (
        (weatherContainerRef.current && weatherContainerRef.current.contains(target)) ||
        target.closest?.('.weather-component-root')
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const loadWeather = async (showRefreshAnimation = false, forceRefresh = false) => {
    if (showRefreshAnimation) {
      setIsRefreshing(true);
    } else if (!data) {
      setLoading(true);
    }
    try {
      const res = await fetchCurrentWeather(language, forceRefresh);
      setData(res);
    } catch (e) {
      console.error('Failed to load weather:', e);
    } finally {
      setLoading(false);
      if (showRefreshAnimation) {
        setTimeout(() => setIsRefreshing(false), 600);
      }
    }
  };

  useEffect(() => {
    // 页面初次加载：利用 30 分钟持久化缓存秒开，如过期自动静默更新
    loadWeather(false, false);

    // 自动刷新定时器严格设为 30 分钟（周期到期强制向远程获取最新数据并更新缓存）
    const interval = setInterval(() => {
      loadWeather(false, true);
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [language]);

  // 根据天气文字或状态码智能渲染精细的线条天气图标
  const renderWeatherIcon = (weatherText: string, code?: number, className = 'w-5 h-5') => {
    const text = weatherText || '';
    if (text.includes('雷') || (code !== undefined && code >= 95)) {
      return <CloudLightning className={`${className} ${isDark ? 'text-amber-300' : 'text-amber-500'}`} />;
    }
    if (text.includes('雪') || (code !== undefined && code >= 71 && code <= 77)) {
      return <CloudSnow className={`${className} ${isDark ? 'text-sky-200' : 'text-sky-500'}`} />;
    }
    if (text.includes('暴雨') || text.includes('大雨') || (code !== undefined && code === 82)) {
      return <CloudRain className={`${className} ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />;
    }
    if (text.includes('雨') || (code !== undefined && code >= 51 && code <= 81)) {
      return <CloudRain className={`${className} ${isDark ? 'text-sky-400' : 'text-sky-500'}`} />;
    }
    if (text.includes('雾') || (code !== undefined && code >= 45 && code <= 48)) {
      return <CloudFog className={`${className} ${isDark ? 'text-neutral-300' : 'text-neutral-500'}`} />;
    }
    if (text.includes('多云') || text.includes('阴') || (code !== undefined && (code === 2 || code === 3))) {
      return <Cloud className={`${className} ${isDark ? 'text-neutral-200' : 'text-neutral-600'}`} />;
    }
    if (text.includes('晴间多云') || (code !== undefined && code === 1)) {
      return <CloudSun className={`${className} ${isDark ? 'text-amber-200' : 'text-amber-500'}`} />;
    }
    // 默认或晴天
    return <Sun className={`${className} ${isDark ? 'text-amber-300' : 'text-amber-500'}`} />;
  };

  // 渲染今日主天气大图标
  const renderHeroWeatherIcon = () => {
    const code = data?.conditionCode ?? 0;
    const text = data?.conditionText || '';
    if (text.includes('雷') || code >= 95) {
      return <CloudLightning className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-amber-300' : 'text-amber-500'}`} />;
    }
    if (text.includes('雪') || (code >= 71 && code <= 77)) {
      return <CloudSnow className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-sky-200' : 'text-sky-500'}`} />;
    }
    if (text.includes('雨') || (code >= 51 && code <= 82)) {
      return <CloudRain className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-sky-300' : 'text-sky-500'}`} />;
    }
    if (text.includes('雾') || (code >= 45 && code <= 48)) {
      return <CloudFog className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-neutral-200' : 'text-neutral-500'}`} />;
    }
    if (text.includes('多云') || text.includes('阴') || code === 2 || code === 3) {
      return <Cloud className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-neutral-100' : 'text-neutral-600'}`} />;
    }
    // 晴天显示带放射线的纯净太阳
    return <Sun className={`w-9 h-9 stroke-[1.8] ${isDark ? 'text-white' : 'text-amber-500'}`} />;
  };

  // 主天气卡片详细内容 (对应截屏)
  const popoverContent = (
    <div
      className={`weather-popover-card ${
        isPopoverVisible ? 'weather-popover-card--open' : 'weather-popover-card--closing'
      } w-[360px] max-h-[82vh] overflow-y-auto custom-scrollbar p-5 select-none rounded-2xl shadow-xl ${
        isDark ? 'text-white' : 'text-neutral-800'
      }`}
      style={{
        backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
        WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
        backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(255, 255, 255, 0.75)',
        boxShadow: isDark
          ? '0 20px 40px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 20px 40px -12px rgba(0, 0, 0, 0.12), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
      }}
    >
      {/* 1. 顶部栏：城市、数据源标签、实时刷新 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4.5 h-4.5 text-[#2f7cf6] stroke-[2]" />
          <span className={`text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.city || (language === 'zh' ? '西安' : 'Xi\'an')}
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
              isDark
                ? 'bg-white/10 text-white/80 border border-white/15'
                : 'bg-black/5 text-neutral-700 border border-black/10'
            }`}
          >
            {data?.source === 'xiaomi'
              ? (language === 'zh' ? '小米天气' : 'Xiaomi')
              : (language === 'zh' ? '实时气象' : 'Meteo')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data?.updateTime && (
            <span
              className={`text-[11px] tabular-nums tracking-tight select-none ${
                isDark ? 'text-neutral-400' : 'text-neutral-600 font-medium'
              }`}
              title={language === 'zh' ? `最近更新时间: ${data.updateTime}` : `Last updated: ${data.updateTime}`}
            >
              {language === 'zh' ? `${data.updateTime} 更新` : `Updated ${data.updateTime}`}
            </span>
          )}

          <Tooltip title={language === 'zh' ? '刷新天气' : 'Refresh Weather'}>
            <button
              type="button"
              onClick={() => loadWeather(true, true)}
              disabled={loading || isRefreshing}
              aria-label="Refresh weather"
              className={`p-1.5 rounded-full cursor-pointer transition-colors duration-200 ${
                isDark ? 'hover:bg-white/10 text-neutral-400 hover:text-white' : 'hover:bg-black/5 text-neutral-600 hover:text-black'
              }`}
            >
              <RotateCw
                className={`w-4 h-4 transition-transform duration-700 ${
                  isRefreshing ? 'animate-spin text-[#2f7cf6]' : ''
                }`}
              />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* 分割细线 */}
      <div className={`mt-3 mb-3 border-b ${isDark ? 'border-white/[0.08]' : 'border-black/[0.06]'}`} />

      {/* 2. 灾害预警横幅（智能聚合卡片：多条预警单行轮播与切换，展开查看详情，不占据大面积版面） */}
      {data?.alerts && data.alerts.length > 0 && (() => {
        const totalAlerts = data.alerts.length;
        const safeIndex = activeAlertIndex >= totalAlerts ? 0 : activeAlertIndex;
        const currentAlert = data.alerts[safeIndex];

        const isRed = currentAlert.level?.includes('红') || currentAlert.title?.includes('红');
        const isOrange = currentAlert.level?.includes('橙') || currentAlert.title?.includes('橙');
        const isBlue = currentAlert.level?.includes('蓝') || currentAlert.title?.includes('蓝');

        const badgeBg = isRed
          ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          : isOrange
          ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400'
          : isBlue
          ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400';

        const iconColor = isRed
          ? 'text-rose-500'
          : isOrange
          ? 'text-orange-500'
          : isBlue
          ? 'text-sky-500'
          : 'text-amber-500';

        return (
          <div
            onMouseEnter={() => setIsAlertHovered(true)}
            onMouseLeave={() => setIsAlertHovered(false)}
            className={`mb-3.5 rounded-xl border text-xs transition-all duration-200 select-none ${badgeBg}`}
          >
            {/* 紧凑单行主栏目 */}
            <div className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div
                onClick={() => setIsAlertExpanded(!isAlertExpanded)}
                className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                title={isAlertExpanded ? (language === 'zh' ? '点击收起详情' : 'Click to collapse') : (language === 'zh' ? '点击查看预警详情' : 'Click to expand detail')}
              >
                <AlertTriangle className={`w-4 h-4 shrink-0 ${iconColor}`} />
                <span className="font-semibold tracking-tight truncate">
                  {currentAlert.title}
                </span>
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                {/* 多预警翻页指示器 (1/3 与左右切换微标) */}
                {totalAlerts > 1 && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-current/10 text-[10.5px] font-mono">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAlertIndex((prev) => (prev - 1 + totalAlerts) % totalAlerts);
                      }}
                      className="hover:opacity-100 opacity-70 p-0.5 rounded transition-opacity"
                      title={language === 'zh' ? '上一条预警' : 'Previous Alert'}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="tabular-nums font-semibold px-0.5">
                      {safeIndex + 1}/{totalAlerts}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveAlertIndex((prev) => (prev + 1) % totalAlerts);
                      }}
                      className="hover:opacity-100 opacity-70 p-0.5 rounded transition-opacity"
                      title={language === 'zh' ? '下一条预警' : 'Next Alert'}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* 展开/收起按钮 */}
                <button
                  type="button"
                  onClick={() => setIsAlertExpanded(!isAlertExpanded)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-current/10 transition-colors text-[11px] opacity-80 hover:opacity-100"
                >
                  <span>{isAlertExpanded ? (language === 'zh' ? '收起' : 'Less') : (language === 'zh' ? '详情' : 'More')}</span>
                  {isAlertExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* 展开查看完整详情 */}
            {isAlertExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-current/15">
                {currentAlert.detail && (
                  <div className="text-[11.5px] leading-relaxed opacity-95 whitespace-pre-wrap break-words max-h-44 overflow-y-auto pr-1.5 custom-scrollbar">
                    {currentAlert.detail}
                  </div>
                )}

                {currentAlert.pubTime && (
                  <div className="mt-2.5 pt-1.5 border-t border-current/10 text-[10.5px] opacity-70 flex items-center justify-between">
                    <span>
                      {language === 'zh'
                        ? `发布时间：${formatAlertPubTime(currentAlert.pubTime, 'zh')}`
                        : `Issued: ${formatAlertPubTime(currentAlert.pubTime, 'en')}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. 主温度区域与天气图 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className={`text-[46px] font-light leading-none tracking-tighter tabular-nums ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {data?.temp !== undefined ? `${data.temp}°` : '34°'}
            </span>
            <span className={`text-sm font-medium tabular-nums ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              {language === 'zh' ? '今日: ' : 'Today: '}{data?.todayRange || '22℃~15℃'}
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <span className={`text-base font-semibold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
              {data?.conditionText || (language === 'zh' ? '晴' : 'Clear')}
            </span>
            <span className={`text-xs ml-1 font-medium ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
              {data?.windDirection || (language === 'zh' ? '东北风' : 'NE')} {data?.windPower || (language === 'zh' ? '2级' : '2')}
            </span>
            {data?.aqi !== undefined && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  data.aqi.num <= 50
                    ? isDark
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                    : data.aqi.num <= 100
                    ? isDark
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                      : 'bg-amber-50 text-amber-800 border border-amber-300'
                    : isDark
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                      : 'bg-rose-50 text-rose-700 border border-rose-300'
                }`}
                title={data.aqi.suggest}
              >
                <Activity className="w-3 h-3" />
                <span>AQI {data.aqi.num} {data.aqi.text || '优'}</span>
              </span>
            )}
          </div>
        </div>

        {/* 右侧天气图标方块 */}
        <div
          className={`w-[66px] h-[66px] rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
            isDark
              ? 'bg-white/[0.08] border border-white/[0.1]'
              : 'bg-black/[0.04] border border-black/[0.06]'
          }`}
        >
          {renderHeroWeatherIcon()}
        </div>
      </div>

      {/* 3. 核心微气候指标卡片 (3×2 规整布局，字号加大，对齐工整) */}
      <div
        className={`mt-4 rounded-2xl p-3 grid grid-cols-3 gap-2.5 text-center ${
          isDark
            ? 'bg-white/[0.04] border border-white/[0.08]'
            : 'bg-black/[0.03] border border-black/[0.06]'
        }`}
      >
        {/* 体感温度 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Gauge className="w-3.5 h-3.5 text-[#2f7cf6]" />
            <span>{t.feelsLike}</span>
          </div>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.apparentTemp !== undefined ? `${data.apparentTemp}℃` : '35℃'}
          </div>
        </div>

        {/* 风速 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Compass className="w-3.5 h-3.5 text-[#2f7cf6]" />
            <span>{t.wind}</span>
          </div>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.windSpeed !== undefined ? `${data.windSpeed} km/h` : '6 km/h'}
          </div>
        </div>

        {/* 湿度 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Droplets className="w-3.5 h-3.5 text-[#2f7cf6]" />
            <span>{t.humidity}</span>
          </div>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.humidity !== undefined ? `${data.humidity}%` : '8%'}
          </div>
        </div>

        {/* 气压 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Gauge className="w-3.5 h-3.5 text-[#8b5cf6]" />
            <span>{language === 'zh' ? '气压' : 'Pressure'}</span>
          </div>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.pressure || '1013 hPa'}
          </div>
        </div>

        {/* 紫外线 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Sun className="w-3.5 h-3.5 text-[#ec4899]" />
            <span>{language === 'zh' ? '紫外线' : 'UV'}</span>
          </div>
          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.uvIndex || '1 (弱)'}
          </div>
        </div>

        {/* 日出日落 */}
        <div className="flex flex-col items-center justify-center p-1.5 rounded-xl">
          <div className={`flex items-center gap-1 text-[11px] font-medium mb-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            <Sun className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>{t.sunRiseSet}</span>
          </div>
          <div className={`text-xs font-bold tracking-tight ${isDark ? 'text-white' : 'text-neutral-900'}`}>
            {data?.sunTime || '06:22/19:02'}
          </div>
        </div>
      </div>

      {/* 4. 24小时逐时天气趋势（可横向滚动的气温与空气质量双曲线图） */}
      {data?.hourlyForecast && data.hourlyForecast.length > 0 && (
        <div className="mt-3.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-semibold ${isDark ? 'text-neutral-300' : 'text-neutral-800'}`}>
              {language === 'zh' ? '24小时预报' : 'Hourly Forecast'}
            </span>
            <div className="flex items-center gap-2.5 text-[10px]">
              <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <span className="w-2 h-0.5 rounded-full bg-amber-500 dark:bg-amber-400 inline-block" />
                {language === 'zh' ? '气温' : 'Temp'}
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400 inline-block border-b border-dashed" />
                {language === 'zh' ? '空气' : 'AQI'}
              </span>
            </div>
          </div>
          <div className={`p-2 rounded-2xl transition-colors ${isDark ? 'bg-white/[0.03] border border-white/[0.05]' : 'bg-black/[0.02] border border-black/[0.04]'}`}>
            <WeatherHourlyChart
              data={data.hourlyForecast}
              isDark={isDark}
              language={language}
            />
          </div>
        </div>
      )}

      {/* 5. 多日天气趋势 (气温双曲线图表) */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-semibold ${isDark ? 'text-neutral-300' : 'text-neutral-800'}`}>
            {language === 'zh' ? '多日天气趋势' : 'Daily Forecast'}
          </span>
          <div className="flex items-center gap-2.5 text-[11px] select-none font-medium">
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <span className="w-2 h-0.5 rounded-full bg-amber-500 dark:bg-amber-400" />
              {language === 'zh' ? '最高温' : 'High'}
            </span>
            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
              <span className="w-2 h-0.5 rounded-full bg-sky-500 dark:bg-sky-400" />
              {language === 'zh' ? '最低温' : 'Low'}
            </span>
          </div>
        </div>

        <WeatherDailyChart
          forecast={data?.forecast || [
            { dayText: '今天', weather: '阵雨', tempRange: '22℃~15℃', maxTemp: 22, minTemp: 15 },
            { dayText: '明天', weather: '中雨转阵雨', tempRange: '17℃~13℃', maxTemp: 17, minTemp: 13 },
            { dayText: '周四', weather: '中雨转多云', tempRange: '18℃~14℃', maxTemp: 18, minTemp: 14 },
            { dayText: '周五', weather: '阴转晴', tempRange: '24℃~14℃', maxTemp: 24, minTemp: 14 },
            { dayText: '周六', weather: '阵雨', tempRange: '25℃~17℃', maxTemp: 25, minTemp: 17 },
          ]}
          isDark={isDark}
          language={language}
        />
      </div>

      {/* 5. 生活指数建议 (3列网格 + 换行卡片) */}
      <div className="mt-4">
        <div className={`text-xs font-semibold mb-2 ${isDark ? 'text-neutral-300' : 'text-neutral-800'}`}>
          {language === 'zh' ? '生活指数建议' : 'Life Quality Indexes'}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(data?.livingIndices || [
            { name: '紫外线', index: '弱 (1级)', details: '无需特别防护' },
            { name: '洗车指数', index: '适宜', details: '无雨适合洗车' },
            { name: '运动指数', index: '适宜', details: '温度适宜尽情运动' },
          ]).map((idx, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-2xl flex flex-col justify-between ${
                isDark
                  ? 'bg-white/[0.04] border border-white/[0.08]'
                  : 'bg-black/[0.03] border border-black/[0.06]'
              }`}
            >
              <div className={`text-[11px] font-medium ${isDark ? 'text-neutral-400' : 'text-neutral-700'}`}>
                {idx.name}
              </div>
              <div className={`text-xs font-bold mt-1.5 truncate text-[#2f7cf6] dark:text-[#38bdf8]`} title={idx.details}>
                {idx.index}
              </div>
              {idx.details && (
                <div className={`text-[10px] truncate mt-1 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {idx.details}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={weatherContainerRef} className="weather-component-root relative select-none">
      {/* 天气胶囊胶囊按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={language === 'zh' ? '查看详细天气' : 'View detailed weather'}
        className={`group px-3.5 py-1.5 rounded-full flex items-center gap-2 cursor-pointer transition-all duration-200 shadow-md ${
          isDark
            ? 'text-white/90 hover:text-white border border-white/16 hover:border-white/50 hover:bg-white/10 active:bg-white/15'
            : 'text-neutral-800 hover:text-neutral-950 border border-white/80 hover:border-white hover:bg-white/80 active:bg-white/90'
        }`}
        style={{
          backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
          backgroundColor: isDark ? 'rgba(18, 22, 30, 0.60)' : 'rgba(255, 255, 255, 0.65)',
          boxShadow: isDark
            ? '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 4px 16px rgba(0, 0, 0, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
        }}
      >
        {loading && !data ? (
          <Spin size="small" />
        ) : (
          <>
            {renderWeatherIcon(data?.conditionText || '晴', data?.conditionCode, 'w-3.5 h-3.5 shrink-0')}
            <div className="flex items-baseline gap-1.5 text-sm font-medium whitespace-nowrap">
              <span className="tabular-nums drop-shadow-sm font-semibold">
                {data?.temp !== undefined ? `${data.temp}°` : '34°'}
              </span>
              <span className="text-xs opacity-90 drop-shadow-sm">
                {data?.conditionText || '晴'}
              </span>
              <span className="text-xs opacity-75 drop-shadow-sm ml-0.5 font-normal">
                {data?.city || '西安'}
              </span>
            </div>
          </>
        )}
      </button>

      {/* 原生浮层天气详情卡片 */}
      {isPopoverMounted && (
        <div
          className={`weather-popover-shell absolute top-[calc(100%+8px)] left-0 z-50 ${
            isPopoverVisible ? 'weather-popover-shell--open' : 'weather-popover-shell--closing'
          }`}
          aria-hidden={!isOpen}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {popoverContent}
        </div>
      )}
    </div>
  );
};
