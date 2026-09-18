import React, { useState, useEffect, useCallback } from 'react';
import { Popover, Segmented, Slider, InputNumber } from 'antd';
import { 
  SettingOutlined,
  VerticalAlignMiddleOutlined,
  FontSizeOutlined,
  FontColorsOutlined,
  BoldOutlined
} from '@ant-design/icons';
import { RotateCw, Quote } from 'lucide-react';
import { CLOCK_VERTICAL_OFFSET_RANGE, clampVerticalOffset } from './VerticalOffsetControl';
import { i18n } from '../i18n';
import { Language, ClockStyleConfig, ThemeMode, HitokotoType } from '../types';
import { fetchHitokoto, getCachedHitokoto, HitokotoData, DEFAULT_SELECTED_HITOKOTO_TYPES } from '../utils/hitokoto';

interface ClockProps {
  language: Language;
  theme: ThemeMode;
  showSeconds: boolean;
  timeFormat24: boolean;
  showGreeting: boolean;
  hitokotoTypes?: HitokotoType[];
  clockStyle?: ClockStyleConfig;
  onUpdateClockStyle?: (newStyle: Partial<ClockStyleConfig>) => void;
}

export const Clock: React.FC<ClockProps> = ({
  language,
  theme,
  showSeconds,
  timeFormat24,
  showGreeting,
  hitokotoTypes = DEFAULT_SELECTED_HITOKOTO_TYPES,
  clockStyle = {
    size: 'large',
    verticalOffset: 'center',
    fontFamily: 'mono',
    fontWeight: 'normal',
  },
  onUpdateClockStyle,
}) => {
  const [time, setTime] = useState(new Date());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [hitokoto, setHitokoto] = useState<HitokotoData | null>(() => getCachedHitokoto());
  const [isRefreshingSentence, setIsRefreshingSentence] = useState(false);

  const t = i18n[language];

  // 设置面板（Popover）在浅色模式下底色为白色，其中若沿用只适合深色的
  // 半透明白字（text-white/xx）会几乎看不见，因此这里按主题切换文字色。
  // 时钟本身显示在壁纸上，仍保持白色，不受此影响。
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const panelTitle = isDark ? 'text-white/95' : 'text-neutral-800';
  const panelSubtle = isDark ? 'text-white/50' : 'text-neutral-500';
  const panelLabel = isDark ? 'text-gray-400' : 'text-neutral-500';
  const panelValue = isDark ? 'text-gray-300' : 'text-neutral-600';
  const panelDivider = isDark ? 'border-white/10' : 'border-black/10';
  const panelHintHover = isDark ? 'hover:text-white' : 'hover:text-neutral-900';

  // 定时更新时钟时间
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 加载一言每日金句
  const loadSentence = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshingSentence(true);
    }
    try {
      const data = await fetchHitokoto(hitokotoTypes, language);
      setHitokoto(data);
    } catch (e) {
      console.warn('Hitokoto load failure', e);
    } finally {
      if (forceRefresh) {
        setTimeout(() => setIsRefreshingSentence(false), 400);
      }
    }
  }, [hitokotoTypes, language]);

  useEffect(() => {
    if (showGreeting) {
      loadSentence(false);
    }
  }, [showGreeting, loadSentence]);

  // Format Hours & Minutes
  let hoursNum = time.getHours();
  let ampm = '';
  if (!timeFormat24) {
    ampm = hoursNum >= 12 ? ' PM' : ' AM';
    hoursNum = hoursNum % 12 || 12;
  }
  const hours = String(hoursNum).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  // Format Date
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  };
  const dateStr = time.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', dateOptions);

  // 解析尺寸为精确数值 (像素 px)
  const currentSizePx = typeof clockStyle.size === 'number' 
    ? clockStyle.size 
    : clockStyle.size === 'small' ? 48 : clockStyle.size === 'medium' ? 64 : clockStyle.size === 'huge' ? 104 : 80;

  // 解析垂直位置偏移为精确数值 (像素 px, 负数偏上, 正数偏下)。
  // 夹取到共用量程内：旧版本曾允许 ±100，存过的越界值会让滑块/输入框显示与
  // 实际位移不一致（输入框显示 100 而滑块只能到 60）。
  const currentOffsetPx = clampVerticalOffset(
    typeof clockStyle.verticalOffset === 'number' && !Number.isNaN(clockStyle.verticalOffset)
      ? clockStyle.verticalOffset
      : clockStyle.verticalOffset === 'top' ? -36 : clockStyle.verticalOffset === 'bottom' ? 24 : 0,
    CLOCK_VERTICAL_OFFSET_RANGE
  );

  // Vertical Offset Spacing (使用相对定位 top 属性精确位移，负数偏上，正数偏下，完全避免 flex items-end 约束失效问题，且不影响外部布局流与 GPU 复合层)
  const getVerticalOffsetStyle = (): React.CSSProperties => {
    if (currentOffsetPx === 0) return {};
    return { top: `${currentOffsetPx}px` };
  };

  // 当垂直位移或尺寸变动时，通知挂载在 body 上的浮层更新对齐位置，避免浮层与时钟错位
  useEffect(() => {
    if (popoverOpen) {
      window.dispatchEvent(new Event('resize'));
    }
  }, [currentOffsetPx, currentSizePx, popoverOpen]);

  // Font Family inline styling
  const getFontFamilyStyle = (): React.CSSProperties => {
    switch (clockStyle.fontFamily) {
      case 'sans':
        return {
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        };
      case 'serif':
        return {
          fontFamily: '"Noto Serif SC", "Sitka Banner", "Sitka Display", "Sitka Text", "New York", "Didot", "Songti SC", "Baskerville", "Garamond", Georgia, "Times New Roman", serif',
        };
      case 'rounded':
        return {
          fontFamily: 'ui-rounded, "SF Pro Rounded", "Bahnschrift", "Quicksand", "Comfortaa", "Varela Round", "PingFang SC Round", "Segoe UI Variable Display", system-ui, sans-serif',
        };
      case 'handwriting':
        return {
          fontFamily: '"Ink Free", "Gabriola", "Caveat", "Segoe Script", "Segoe Print", "Snell Roundhand", "Bradley Hand", "KaiTi", "STKaiti", cursive, serif',
        };
      case 'mono':
      default:
        return {
          fontFamily: '"Cascadia Code", "Cascadia Mono", "SF Mono", "JetBrains Mono", "Fira Code", "Source Code Pro", ui-monospace, Menlo, Monaco, Consolas, monospace',
        };
    }
  };

  // Weight styling: 提供精确数值 fontWeight，完美激活可变字体 (Variable Fonts) 与系统字体的细体/特细轴 (Weight 200)
  const getFontWeightStyle = (): React.CSSProperties => {
    switch (clockStyle.fontWeight) {
      case 'thin':
        return { fontWeight: 200 };
      case 'bold':
        return { fontWeight: 700 };
      case 'normal':
      default:
        return { fontWeight: 400 };
    }
  };

  const getFontWeightClass = (): string => {
    switch (clockStyle.fontWeight) {
      case 'thin':
        return 'font-extralight';
      case 'bold':
        return 'font-bold';
      case 'normal':
      default:
        return 'font-normal';
    }
  };

  const fontStyle = getFontFamilyStyle();
  const fontWeightStyle = getFontWeightStyle();
  const weightClass = getFontWeightClass();

  // 一言出处格式化
  const quoteSource = hitokoto?.from ? `「${hitokoto.from}」` : '';
  const quoteAuthor = hitokoto?.from_who ? `${hitokoto.from_who} ` : '';
  const authorAndSource = (quoteAuthor || quoteSource) ? `${quoteAuthor}${quoteSource}`.trim() : '';

  // Settings Card Inside Popover
  const fontFamilyLabels: Record<string, string> = {
    mono: t.clockFontMono,
    sans: t.clockFontSans,
    serif: t.clockFontSerif,
    rounded: t.clockFontRounded,
    handwriting: t.clockFontHandwriting,
  };

  const settingCardContent = (
    <div className={`w-80 p-2 space-y-4 ${isDark ? 'text-white/90' : 'text-neutral-700'}`}>
      <div className={`flex items-center justify-between pb-2 border-b ${panelDivider}`}>
        <span className={`font-semibold text-sm flex items-center gap-1.5 ${panelTitle}`}>
          <SettingOutlined />
          {t.clockCustomization}
        </span>
        <span className={`text-xs ${panelSubtle}`}>{fontFamilyLabels[clockStyle.fontFamily] || clockStyle.fontFamily}</span>
      </div>

      {/* 1. Size Slider & Exact Input */}
      <div className="space-y-1.5">
        <div className={`flex items-center justify-between text-xs ${panelLabel}`}>
          <span className="flex items-center gap-1.5">
            <FontSizeOutlined />
            {t.clockSize}
          </span>
          <span className={`text-xs font-mono ${panelValue}`}>{currentSizePx}px</span>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            min={40}
            max={140}
            step={2}
            value={currentSizePx}
            onChange={(val) => {
              if (typeof val === 'number' && !Number.isNaN(val)) {
                onUpdateClockStyle?.({ size: val });
              }
            }}
            className="flex-1 m-0"
          />
          <InputNumber
            size="small"
            min={36}
            max={160}
            value={currentSizePx}
            onChange={(val) => {
              if (typeof val === 'number' && !Number.isNaN(val)) {
                onUpdateClockStyle?.({ size: val });
              }
            }}
            className="w-16 text-xs"
          />
        </div>
        <div className={`flex justify-between text-[10px] px-1 pt-0.5 ${panelLabel}`}>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ size: 48 })}>{t.clockSizeSmall} (48)</span>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ size: 64 })}>{t.clockSizeMedium} (64)</span>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ size: 80 })}>{t.clockSizeLarge} (80)</span>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ size: 104 })}>{t.clockSizeHuge} (104)</span>
        </div>
      </div>

      {/* 2. Vertical Position Offset (Fine Pixels Slider) */}
      <div className="space-y-1.5">
        <div className={`flex items-center justify-between text-xs ${panelLabel}`}>
          <span className="flex items-center gap-1.5">
            <VerticalAlignMiddleOutlined />
            {t.clockVerticalOffset}
          </span>
          <span className={`text-xs font-mono ${panelValue}`}>
            {currentOffsetPx > 0 ? `+${currentOffsetPx}px` : `${currentOffsetPx}px`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            min={CLOCK_VERTICAL_OFFSET_RANGE.min}
            max={CLOCK_VERTICAL_OFFSET_RANGE.max}
            step={CLOCK_VERTICAL_OFFSET_RANGE.step}
            value={currentOffsetPx}
            onChange={(val) => {
              if (typeof val === 'number' && !Number.isNaN(val)) {
                onUpdateClockStyle?.({ verticalOffset: val });
              }
            }}
            className="flex-1 m-0"
          />
          {/* 数字输入框与滑块共用同一量程：此前滑块是 ±60、输入框是 ±100，
              同一行内能取到的极值不一致，滑到端点与手输大值互相打架 */}
          <InputNumber
            size="small"
            min={CLOCK_VERTICAL_OFFSET_RANGE.min}
            max={CLOCK_VERTICAL_OFFSET_RANGE.max}
            value={currentOffsetPx}
            onChange={(val) => {
              if (typeof val === 'number' && !Number.isNaN(val)) {
                onUpdateClockStyle?.({ verticalOffset: val });
              }
            }}
            className="w-16 text-xs"
          />
        </div>
        <div className={`flex justify-between text-[10px] px-1 pt-0.5 ${panelLabel}`}>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ verticalOffset: -36 })}>{t.clockVerticalTop} (-36)</span>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ verticalOffset: 0 })}>{t.clockVerticalCenter} (0)</span>
          <span className={`cursor-pointer ${panelHintHover}`} onClick={() => onUpdateClockStyle?.({ verticalOffset: 24 })}>{t.clockVerticalBottom} (+24)</span>
        </div>
      </div>

      {/* 3. Font Family Selection */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1.5 text-xs ${panelLabel}`}>
          <FontColorsOutlined />
          <span>{t.clockFontFamily}</span>
        </div>
        <Segmented
          block
          size="small"
          value={clockStyle.fontFamily}
          onChange={(val) => onUpdateClockStyle?.({ fontFamily: val as ClockStyleConfig['fontFamily'] })}
          options={[
            { label: t.clockFontMono, value: 'mono' },
            { label: t.clockFontSans, value: 'sans' },
            { label: t.clockFontSerif, value: 'serif' },
            { label: t.clockFontRounded, value: 'rounded' },
            { label: t.clockFontHandwriting, value: 'handwriting' },
          ]}
        />
      </div>

      {/* 4. Font Weight Selection */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1.5 text-xs ${panelLabel}`}>
          <BoldOutlined />
          <span>{t.clockWeight}</span>
        </div>
        <Segmented
          block
          size="small"
          value={clockStyle.fontWeight}
          onChange={(val) => onUpdateClockStyle?.({ fontWeight: val as ClockStyleConfig['fontWeight'] })}
          options={[
            { label: t.clockWeightLight, value: 'thin' },
            { label: t.clockWeightNormal, value: 'normal' },
            { label: t.clockWeightBold, value: 'bold' },
          ]}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full flex flex-col items-center justify-end relative" style={getVerticalOffsetStyle()}>
      <Popover
        content={settingCardContent}
        trigger="click"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        placement="bottom"
        autoAdjustOverflow={false}
        arrow={{ pointAtCenter: true }}
      >
        <div
          role="button"
          tabIndex={0}
          className="flex flex-col items-center text-center cursor-pointer select-none text-white outline-none"
        >
          {/* Time Display with dynamic font & size */}
          <div
            className={`clock-time-display flex items-baseline tracking-tight select-none ${weightClass}`}
            style={{ ...fontStyle, ...fontWeightStyle, fontSize: `${currentSizePx}px`, lineHeight: 1 }}
          >
            <span className="tabular-nums drop-shadow-lg text-white/95">
              {hours}:{minutes}
            </span>
            {showSeconds && (
              <span 
                className="font-light text-white/70 ml-2 tabular-nums"
                style={{ fontSize: `${Math.round(currentSizePx * 0.4)}px` }}
              >
                :{seconds}
              </span>
            )}
            {!timeFormat24 && (
              <span 
                className="font-sans font-medium text-white/80 ml-2"
                style={{ fontSize: `${Math.round(currentSizePx * 0.28)}px` }}
              >
                {ampm}
              </span>
            )}
          </div>
        </div>
      </Popover>

      {/* Date Display */}
      <div className="clock-date-display mt-2 text-sm sm:text-base font-normal tracking-wide text-white/85 drop-shadow-sm select-none">
        <span 
          className="cursor-pointer hover:text-white transition-colors"
          onClick={() => setPopoverOpen(true)}
        >
          {dateStr}
        </span>
      </div>

      {/* Hitokoto (一言) 金句展示区 - 独立于时间弹窗，支持点击刷新与查看出处 */}
      {showGreeting && (
        <div 
          className="hitokoto-container mt-1.5 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-light tracking-wide text-white/80 max-w-xl px-4 py-1 rounded-full cursor-pointer hover:bg-white/10 active:scale-[0.99] transition-all group duration-200 select-none"
          onClick={(e) => {
            e.stopPropagation();
            loadSentence(true);
          }}
          title={t.hitokotoRefresh}
        >
          <Quote className="w-3 h-3 text-white/50 group-hover:text-white/80 shrink-0 rotate-180 transition-colors" />
          <span className="truncate drop-shadow-sm text-white/90">
            {hitokoto?.hitokoto || '保持热爱，奔赴山海。'}
          </span>
          {authorAndSource && (
            <span className="text-[11px] sm:text-xs text-white/60 shrink-0 font-normal">
              —— {authorAndSource}
            </span>
          )}
          <RotateCw 
            className={`w-3 h-3 ml-0.5 text-white/40 group-hover:text-white/80 shrink-0 transition-transform duration-500 ${
              isRefreshingSentence ? 'animate-spin text-white/90' : 'opacity-0 group-hover:opacity-100'
            }`} 
          />
        </div>
      )}
    </div>
  );
};
