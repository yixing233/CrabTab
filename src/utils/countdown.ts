import { CountdownItem, Language } from '../types';

export interface CountdownStatus {
  days: number;
  type: 'countdown' | 'milestone' | 'today' | 'progress';
  displayText: string;
  subText: string;
  nextDateStr: string;
  percent?: number;
  color: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  work: '#3b82f6', // blue
  life: '#10b981', // emerald
  holiday: '#ef4444', // red
  birthday: '#f59e0b', // amber
  anniversary: '#ec4899', // pink
  target: '#8b5cf6', // purple
  other: '#6b7280', // gray
};

/**
 * 针对不同主题背景（浅色毛玻璃 / 暗色毛玻璃）智能优化倒数日色彩对比度
 * 遵循 Web 内容可访问性指南 (WCAG 2.1 AA) 标准，确保文本对比度 >= 4.5:1
 * 解决明亮浅色背景下黄色、浅橙色等由于发光度过高导致的文字发虚、可见度低问题
 */
export function getAccessibleCountdownColor(color: string, isDark: boolean = false): string {
  // 暗色模式下浅色高亮色天然具备 6:1~10:1 的高对比度，保留明亮原色
  if (isDark) {
    return color;
  }

  // 浅色模式高对比度映射表（保证在浅灰/白色毛玻璃背景下清晰醒目）
  const lightModeEnhancements: Record<string, string> = {
    // 琥珀黄 / 金黄系（原 #f59e0b 对比度仅 1.9:1 -> 加深至 #b45309，对比度 4.51:1+）
    '#f59e0b': '#b45309', // amber-500 -> amber-700
    '#fbbf24': '#b45309', // amber-400 -> amber-700
    '#fcd34d': '#b45309', // amber-300 -> amber-700
    '#d97706': '#b45309', // amber-600 -> amber-700
    '#eab308': '#a16207', // yellow-500 -> yellow-700
    '#ca8a04': '#a16207', // yellow-600 -> yellow-700
    '#facc15': '#a16207', // yellow-400 -> yellow-700
    '#fde047': '#a16207', // yellow-300 -> yellow-700

    // 橙色系
    '#f97316': '#c2410c', // orange-500 -> orange-700
    '#fb923c': '#c2410c', // orange-400 -> orange-700
    '#ea580c': '#c2410c', // orange-600 -> orange-700

    // 翡翠绿 / 浅青绿系（原 #10b981 对比度 2.28:1 -> 加深至 #047857，对比度 5.1:1+）
    '#10b981': '#047857', // emerald-500 -> emerald-700
    '#34d399': '#047857', // emerald-400 -> emerald-700
    '#059669': '#047857', // emerald-600 -> emerald-700
    '#22c55e': '#15803d', // green-500 -> green-700
    '#4ade80': '#15803d', // green-400 -> green-700
    '#14b8a6': '#0f766e', // teal-500 -> teal-700
    '#06b6d4': '#0e7490', // cyan-500 -> cyan-700
    '#38bdf8': '#0369a1', // sky-400 -> sky-700

    // 蓝 / 紫 / 粉系微调至高对比档位
    '#3b82f6': '#1d4ed8', // blue-500 -> blue-700 (对比度 5.2:1)
    '#8b5cf6': '#6d28d9', // purple-500 -> purple-700 (对比度 5.3:1)
    '#ec4899': '#be185d', // pink-500 -> pink-700 (对比度 5.1:1)
    '#ef4444': '#b91c1c', // red-500 -> red-700 (对比度 5.4:1)
  };

  const normalized = color.toLowerCase().trim();
  if (lightModeEnhancements[normalized]) {
    return lightModeEnhancements[normalized];
  }

  // 自定义未知十六进制颜色：通过相对亮度动态加深
  const hex = normalized.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum > 0.35) {
        const factor = Math.max(0.45, 0.35 / lum);
        const dr = Math.round(r * factor).toString(16).padStart(2, '0');
        const dg = Math.round(g * factor).toString(16).padStart(2, '0');
        const db = Math.round(b * factor).toString(16).padStart(2, '0');
        return `#${dr}${dg}${db}`;
      }
    }
  }

  return color;
}

/**
 * 格式化 YYYY-MM-DD
 */
export function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取本地自然日零点时间戳
 */
function getMidnight(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 获取下一个指定月日（用于每年重复）
 */
function getNextYearlyDate(targetDateStr: string, now: Date): Date {
  const [, targetMonth, targetDay] = targetDateStr.split('-').map(Number);
  const nowYear = now.getFullYear();
  const thisYearTarget = new Date(nowYear, targetMonth - 1, targetDay);

  if (getMidnight(thisYearTarget) >= getMidnight(now)) {
    return thisYearTarget;
  }
  return new Date(nowYear + 1, targetMonth - 1, targetDay);
}

/**
 * 获取下一个指定日（用于每月重复）
 */
function getNextMonthlyDate(targetDateStr: string, now: Date): Date {
  const [, , targetDay] = targetDateStr.split('-').map(Number);
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  // 当前月的目标日
  const thisMonthTarget = new Date(nowYear, nowMonth, targetDay);
  if (getMidnight(thisMonthTarget) >= getMidnight(now)) {
    return thisMonthTarget;
  }
  // 下个月的目标日
  return new Date(nowYear, nowMonth + 1, targetDay);
}

/**
 * 获取下一个指定星期几（用于每周重复）
 */
function getNextWeeklyDate(targetDateStr: string, now: Date): Date {
  const [y, m, d] = targetDateStr.split('-').map(Number);
  const originalDate = new Date(y, m - 1, d);
  const targetDayOfWeek = originalDate.getDay();
  const nowDayOfWeek = now.getDay();

  let diff = targetDayOfWeek - nowDayOfWeek;
  if (diff < 0) {
    diff += 7;
  }
  const result = new Date(now);
  result.setDate(now.getDate() + diff);
  return result;
}

/**
 * 计算单个倒数日实时状态与文案
 */
export function calculateCountdownStatus(
  item: CountdownItem,
  language: Language = 'zh',
  now: Date = new Date(),
  isDark: boolean = false
): CountdownStatus {
  const isZh = language === 'zh';
  const rawColor = item.color || CATEGORY_COLORS[item.category] || '#3b82f6';
  const defaultColor = getAccessibleCountdownColor(rawColor, isDark);

  // 1. 系统动态预设：今年进度条
  if (item.isPreset && item.presetType === 'year_progress') {
    const year = now.getFullYear();
    const start = new Date(year, 0, 1, 0, 0, 0).getTime();
    const end = new Date(year, 11, 31, 23, 59, 59).getTime();
    const current = now.getTime();
    const percent = Math.min(100, Math.max(0, Math.floor(((current - start) / (end - start)) * 100)));
    const endMidnight = getMidnight(new Date(year, 11, 31));
    const nowMidnight = getMidnight(now);
    const daysLeft = Math.max(0, Math.round((endMidnight - nowMidnight) / (1000 * 60 * 60 * 24)));

    return {
      days: daysLeft,
      type: 'progress',
      displayText: isZh ? `${year}年已过 ${percent}%` : `${percent}% of ${year}`,
      subText: isZh ? `剩 ${daysLeft} 天` : `${daysLeft}d left`,
      nextDateStr: `${year}-12-31`,
      percent,
      color: getAccessibleCountdownColor(item.color || '#8b5cf6', isDark),
    };
  }

  // 2. 系统动态预设：周末倒计时
  if (item.isPreset && item.presetType === 'weekend_countdown') {
    const dayOfWeek = now.getDay(); // 0(周日) ~ 6(周六)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        days: 0,
        type: 'today',
        displayText: isZh ? '周末进行中' : 'Weekend is here',
        subText: isZh ? '好好休息充电' : 'Relax & recharge',
        nextDateStr: formatDateYMD(now),
        color: getAccessibleCountdownColor('#10b981', isDark),
      };
    }
    const daysToFriday = 5 - dayOfWeek;
    return {
      days: daysToFriday,
      type: 'countdown',
      displayText: isZh ? `还有 ${daysToFriday} 天` : `${daysToFriday}d to Weekend`,
      subText: isZh ? '周五 18:00' : 'Fri 18:00',
      nextDateStr: formatDateYMD(new Date(now.getTime() + daysToFriday * 24 * 60 * 60 * 1000)),
      color: getAccessibleCountdownColor(item.color || '#f59e0b', isDark),
    };
  }

  // 3. 普通倒数日 / 纪念日计算
  let target: Date;
  if (item.repeat === 'yearly') {
    target = getNextYearlyDate(item.targetDate, now);
  } else if (item.repeat === 'monthly') {
    target = getNextMonthlyDate(item.targetDate, now);
  } else if (item.repeat === 'weekly') {
    target = getNextWeeklyDate(item.targetDate, now);
  } else {
    const [y, m, d] = item.targetDate.split('-').map(Number);
    target = new Date(y, m - 1, d);
  }

  const nowMidnight = getMidnight(now);
  const targetMidnight = getMidnight(target);
  const diffDays = Math.round((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
  const targetStr = formatDateYMD(target);

  if (diffDays === 0) {
    return {
      days: 0,
      type: 'today',
      displayText: isZh ? '就是今天！' : 'Today!',
      subText: targetStr,
      nextDateStr: targetStr,
      color: defaultColor,
    };
  }

  if (diffDays > 0) {
    return {
      days: diffDays,
      type: 'countdown',
      displayText: isZh ? `还有 ${diffDays} 天` : `${diffDays}d left`,
      subText: targetStr,
      nextDateStr: targetStr,
      color: defaultColor,
    };
  }

  // 过去的日子（纪念日/累计天数）
  const passedDays = Math.abs(diffDays);
  return {
    days: passedDays,
    type: 'milestone',
    displayText: isZh ? `已过去 ${passedDays} 天` : `${passedDays}d ago`,
    subText: targetStr,
    nextDateStr: targetStr,
    color: defaultColor,
  };
}

/**
 * 默认初始倒数日列表
 */
export function getDefaultCountdowns(language: Language = 'zh'): CountdownItem[] {
  const isZh = language === 'zh';
  const now = new Date();
  const nextYear = now.getFullYear() + 1;

  return [
    {
      id: 'preset-year-progress',
      title: isZh ? '年度进度' : 'Year Progress',
      targetDate: `${now.getFullYear()}-12-31`,
      repeat: 'yearly',
      category: 'life',
      isPinned: true,
      isPreset: true,
      presetType: 'year_progress',
      color: '#8b5cf6',
      icon: 'hourglass',
      createdAt: Date.now(),
    },
    {
      id: 'preset-weekend',
      title: isZh ? '周末倒计时' : 'Weekend',
      targetDate: formatDateYMD(now),
      repeat: 'weekly',
      category: 'life',
      isPinned: true,
      isPreset: true,
      presetType: 'weekend_countdown',
      color: '#f59e0b',
      icon: 'sparkles',
      createdAt: Date.now(),
    },
    {
      id: 'default-new-year',
      title: isZh ? '元旦跨年' : 'New Year',
      targetDate: `${nextYear}-01-01`,
      repeat: 'yearly',
      category: 'holiday',
      isPinned: true,
      color: '#ef4444',
      icon: 'target',
      createdAt: Date.now(),
    },
  ];
}
