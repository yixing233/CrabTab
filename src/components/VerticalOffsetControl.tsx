import React from 'react';
import { Slider, Segmented } from 'antd';
import { MoveVertical, RotateCcw } from 'lucide-react';

/**
 * 垂直位置调节的取值范围与档位（全站唯一来源）。
 *
 * 此前同一个概念散落在 5 处、各写各的参数：搜索框偏移在工具条浮层里是 ±100、
 * 在设置面板里是 ±120，同一个设置两个入口能拖到的极值不一样；时钟偏移的滑块是
 * ±60 而紧挨着的数字输入框是 ±100 —— 后者甚至在同一行内自相矛盾，滑到端点得到的
 * 值与输入框允许的值对不上。这里收敛为唯一来源，任何入口都不再自行写死数字。
 */
export const VERTICAL_OFFSET_RANGE = { min: -120, max: 120, step: 2 } as const;

/** 三个快捷档位的落点 */
export const VERTICAL_OFFSET_PRESETS = { top: -40, center: 0, bottom: 40 } as const;

/**
 * 时钟的垂直偏移量程。
 *
 * 时钟只在自身固定插槽内微调，可用空间远小于主屏中央区域，因此量程更窄 ——
 * 这是有意为之，不是笔误。放在这里是为了让全站每一处垂直偏移的量程都能在一处
 * 对照，避免再次出现「滑块 ±60、旁边的数字框 ±100」这种同行自相矛盾。
 */
export const CLOCK_VERTICAL_OFFSET_RANGE = { min: -60, max: 60, step: 2 } as const;

/** 把偏移值夹取到给定量程内（用于兼容量程收窄前存下的越界旧值） */
export function clampVerticalOffset(
  value: number,
  range: { min: number; max: number } = VERTICAL_OFFSET_RANGE
): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(range.max, Math.max(range.min, safe));
}

/**
 * 档位高亮判定边界：绝对值小于此值算「居中」。
 * 与档位落点（±40）保持足够间距，避免拖到中间附近时三档同时点亮或同时熄灭。
 */
export const VERTICAL_OFFSET_PRESET_THRESHOLD = 25;

/** 判定某个偏移值当前落在哪一档 */
export function resolveVerticalOffsetPreset(
  value: number
): keyof typeof VERTICAL_OFFSET_PRESETS {
  if (value <= -VERTICAL_OFFSET_PRESET_THRESHOLD) return 'top';
  if (value >= VERTICAL_OFFSET_PRESET_THRESHOLD) return 'bottom';
  return 'center';
}

/** 带正负号的像素读数（+12px / -40px / 0px） */
export function formatVerticalOffset(value: number): string {
  return `${value > 0 ? `+${value}` : value}px`;
}

export interface VerticalOffsetPresetLabels {
  top: string;
  center: string;
  bottom: string;
}

export interface VerticalOffsetControlProps {
  value: number;
  onChange: (value: number) => void;
  /** 档位文案（各设置项的三档措辞不同，由调用方提供本地化文案） */
  presetLabels: VerticalOffsetPresetLabels;
  /** 面板形态下的标题；不传则只渲染滑块（用于浮层里已有标题行的情况） */
  label?: string;
  /** 面板形态下的副标题说明 */
  description?: string;
  /**
   * 呈现形态：
   * - `panel`：设置面板内的独立卡片（标题 + 分段档位 + 重置，横向排布）
   * - `popover`：工具条/搜索框上的下拉浮层（紧凑、档位为实心小按钮）
   */
  variant?: 'panel' | 'popover';
  /** 是否显示一键归零（面板形态默认显示，浮层形态默认显示链接式） */
  showReset?: boolean;
  resetTitle?: string;
}

/**
 * 垂直位置偏移的统一控件。
 *
 * 全站共三个「垂直位置」设置（最近访问、搜索框、时钟），却散落着 5 个入口：
 * 两处工具条/搜索框浮层、设置面板里重复的两份搜索框偏移、以及时钟浮层。
 * 此前每个入口的控件形态、量程、档位落点与归零入口都各写各的：有的用实心
 * 分段按钮、有的用纯文字链接，有的带重置有的没带。统一后任何一处的拖动步进、
 * 档位落点与归零行为完全一致，改动范围也只需在这里调整一次。
 *
 * 不包含「快捷方式」——它从来没有垂直偏移设置，量程（±120）与档位（±40）
 * 都是按最近访问/搜索框的实际可用空间定的，不要照搬给别的组件。
 */
export const VerticalOffsetControl: React.FC<VerticalOffsetControlProps> = ({
  value,
  onChange,
  presetLabels,
  label,
  description,
  variant = 'panel',
  showReset = true,
  resetTitle,
}) => {
  const { min, max, step } = VERTICAL_OFFSET_RANGE;
  const isCompact = variant === 'popover';
  const activePreset = resolveVerticalOffsetPreset(value);
  const presetEntries = (['top', 'center', 'bottom'] as const).map((key) => ({
    key,
    offset: VERTICAL_OFFSET_PRESETS[key],
    label: presetLabels[key],
  }));

  const handleChange = (next: number | null) => {
    if (typeof next === 'number' && !Number.isNaN(next)) onChange(next);
  };

  const resetButton = showReset && value !== 0 && (
    <button
      type="button"
      onClick={() => onChange(VERTICAL_OFFSET_PRESETS.center)}
      className={
        isCompact
          ? 'text-[11px] text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer font-medium'
          : 'p-0.5 text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors'
      }
      title={resetTitle}
      aria-label={resetTitle}
    >
      {isCompact ? resetTitle : <RotateCcw className="w-3 h-3" />}
    </button>
  );

  // 浮层形态：紧凑，档位用实心小按钮（浮层空间小、需要明确的点按目标）。
  // 标题行不画底边框：浮层顶部原本就有分组分隔线（搜索框浮层）或直接是浮层首行
  // （最近访问浮层），再叠一条线会显得割裂。
  if (isCompact) {
    return (
      <div className="flex flex-col gap-2 select-none">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <MoveVertical className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>{label}</span>
          </span>
          {/* 读数只在滑块旁显示一次：紧凑浮层里同一数值出现两遍纯属噪音 */}
          {resetButton}
        </div>

        <div className="flex items-center gap-2">
          <Slider
            className="flex-1 my-1"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            tooltip={{ formatter: (val) => formatVerticalOffset(typeof val === 'number' ? val : 0) }}
          />
          <span className="text-xs font-mono w-12 text-right opacity-70">
            {formatVerticalOffset(value)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-0.5">
          {presetEntries.map(({ key, offset, label: presetLabel }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(offset)}
              className={`text-[11px] py-1 px-1.5 rounded-md border transition-all cursor-pointer text-center ${
                activePreset === key
                  ? 'bg-blue-500 text-white border-blue-500 font-semibold shadow-sm'
                  : 'border-black/10 dark:border-white/15 text-neutral-700 dark:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              {presetLabel}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 面板形态：与设置面板其他项同一语汇（Segmented 档位 + 滑块）
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <MoveVertical className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          {description && <div className="text-[11px] opacity-60 mt-0.5">{description}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Segmented
            size="small"
            value={activePreset}
            onChange={(val) => onChange(VERTICAL_OFFSET_PRESETS[val as keyof typeof VERTICAL_OFFSET_PRESETS] ?? 0)}
            options={presetEntries.map(({ key, label: presetLabel }) => ({ value: key, label: presetLabel }))}
          />
          {resetButton}
        </div>
      </div>

      <div className="flex items-center gap-3 px-1">
        <Slider
          className="flex-1 my-1"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          tooltip={{ formatter: (val) => formatVerticalOffset(typeof val === 'number' ? val : 0) }}
        />
        <span className="text-xs font-mono w-12 text-right opacity-70">
          {formatVerticalOffset(value)}
        </span>
      </div>
    </div>
  );
};
