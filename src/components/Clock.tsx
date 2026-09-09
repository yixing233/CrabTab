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
  theme: _theme,
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

  // 解析垂直位置偏移为精确数值 (像素 px, 负数偏上, 正数偏下)
  const currentOffsetPx = typeof clockStyle.verticalOffset === 'number'
    ? clockStyle.verticalOffset
    : clockStyle.verticalOffset === 'top' ? -36 : clockStyle.verticalOffset === 'bottom' ? 24 : 0;

  // Vertical Offset Spacing
  const getVerticalTransformStyle = (): React.CSSProperties => {
    return { transform: `translateY(${currentOffsetPx}px)` };
  };

  // Font Family inline styling
  const getFontFamilyStyle = (): React.CSSProperties => {
    switch (clockStyle.fontFamily) {
      case 'sans':
        return { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
      case 'serif':
        return { fontFamily: '"Times New Roman", Times, Georgia, "Noto Serif SC", serif' };
      case 'rounded':
        return { fontFamily: 'ui-rounded, "PingFang SC Round", system-ui, -apple-system, sans-serif' };
      case 'handwriting':
        return { fontFamily: 'cursive, "Brush Script MT", "KaiTi", "STKaiti", serif' };
      case 'mono':
      default:
        return { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' };
    }
  };

  // Weight styling
  const getFontWeightClass = (): string => {
    switch (clockStyle.fontWeight) {
      case 'thin':
        return 'font-light';
      case 'bold':
        return 'font-bold';
      case 'normal':
      default:
        return 'font-medium';
    }
  };

  const fontStyle = getFontFamilyStyle();
  const weightClass = getFontWeightClass();
  const verticalTransformStyle = getVerticalTransformStyle();

  // 一言出处格式化
  const quoteSource = hitokoto?.from ? `「${hitokoto.from}」` : '';
  const quoteAuthor = hitokoto?.from_who ? `${hitokoto.from_who} ` : '';
  const authorAndSource = (quoteAuthor || quoteSource) ? `${quoteAuthor}${quoteSource}`.trim() : '';

  // Settings Card Inside Popover
  const settingCardContent = (
    <div className="w-80 p-2 space-y-4 text-white/90">
      <div className="flex items-center justify-between pb-2 border-b border-white/10">
        <span className="font-semibold text-sm flex items-center gap-1.5 text-white/95">
          <SettingOutlined />
          {t.clockCustomization}
        </span>
        <span className="text-xs text-white/50">{clockStyle.fontFamily}</span>
      </div>

      {/* 1. Size Slider & Exact Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <FontSizeOutlined />
            {t.clockSize}
          </span>
          <span className="text-xs font-mono text-gray-300">{currentSizePx}px</span>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            min={40}
            max={140}
            step={2}
            value={currentSizePx}
            onChange={(val) => onUpdateClockStyle?.({ size: val })}
            className="flex-1 m-0"
          />
          <InputNumber
            size="small"
            min={36}
            max={160}
            value={currentSizePx}
            onChange={(val) => val && onUpdateClockStyle?.({ size: val })}
            className="w-16 text-xs"
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 px-1 pt-0.5">
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ size: 48 })}>{t.clockSizeSmall} (48)</span>
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ size: 64 })}>{t.clockSizeMedium} (64)</span>
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ size: 80 })}>{t.clockSizeLarge} (80)</span>
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ size: 104 })}>{t.clockSizeHuge} (104)</span>
        </div>
      </div>

      {/* 2. Vertical Position Offset (Fine Pixels Slider) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <VerticalAlignMiddleOutlined />
            {t.clockVerticalOffset}
          </span>
          <span className="text-xs font-mono text-gray-300">
            {currentOffsetPx > 0 ? `+${currentOffsetPx}px` : `${currentOffsetPx}px`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            min={-60}
            max={60}
            step={2}
            value={currentOffsetPx}
            onChange={(val) => onUpdateClockStyle?.({ verticalOffset: val })}
            className="flex-1 m-0"
          />
          <InputNumber
            size="small"
            min={-100}
            max={100}
            value={currentOffsetPx}
            onChange={(val) => val !== null && onUpdateClockStyle?.({ verticalOffset: val })}
            className="w-16 text-xs"
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 px-1 pt-0.5">
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ verticalOffset: -36 })}>{t.clockVerticalTop} (-36)</span>
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ verticalOffset: 0 })}>{t.clockVerticalCenter} (0)</span>
          <span className="cursor-pointer hover:text-white" onClick={() => onUpdateClockStyle?.({ verticalOffset: 24 })}>{t.clockVerticalBottom} (+24)</span>
        </div>
      </div>

      {/* 3. Font Family Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FontColorsOutlined />
          <span>{t.clockFontFamily}</span>
        </div>
        <Segmented
          block
          size="small"
          value={clockStyle.fontFamily}
          onChange={(val) => onUpdateClockStyle?.({ fontFamily: val as ClockStyleConfig['fontFamily'] })}
          options={[
            { label: 'Mono', value: 'mono' },
            { label: 'Sans', value: 'sans' },
            { label: 'Serif', value: 'serif' },
            { label: 'Round', value: 'rounded' },
            { label: 'Art', value: 'handwriting' },
          ]}
        />
      </div>

      {/* 4. Font Weight Selection */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
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
    <div className="w-full flex flex-col items-center justify-end relative">
      <Popover
        content={settingCardContent}
        trigger="click"
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        placement="bottom"
        arrow={{ pointAtCenter: true }}
      >
        <div
          role="button"
          tabIndex={0}
          className="flex flex-col items-center text-center cursor-pointer group transition-transform duration-100 px-4 py-2 rounded-3xl border border-transparent hover:border-white/25 hover:bg-white/5 active:bg-white/10 select-none text-white drop-shadow-md outline-none" 
          style={verticalTransformStyle}
          title={t.clockCardHint}
        >
          {/* Time Display with dynamic font & size */}
          <div
            className={`flex items-baseline tracking-tight backdrop-blur-xs select-none ${weightClass}`}
            style={{ ...fontStyle, fontSize: `${currentSizePx}px`, lineHeight: 1 }}
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

          {/* Date */}
          <div className="mt-2 text-sm sm:text-base font-normal tracking-wide text-white/85">
            {dateStr}
          </div>
        </div>
      </Popover>

      {/* Hitokoto (一言) 金句展示区 - 独立于时间弹窗，支持点击刷新与查看出处 */}
      {showGreeting && (
        <div 
          className="mt-1.5 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-light tracking-wide text-white/80 max-w-xl px-4 py-1 rounded-full cursor-pointer hover:bg-white/10 active:scale-[0.99] transition-all group duration-200 select-none"
          onClick={(e) => {
            e.stopPropagation();
            loadSentence(true);
          }}
          title={t.hitokotoRefresh}
          style={verticalTransformStyle}
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
