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

const CATEGORY_COLORS: Record<string, string> = {
  work: '#3b82f6', // blue
  life: '#10b981', // emerald
  holiday: '#ef4444', // red
  birthday: '#f59e0b', // amber
  anniversary: '#ec4899', // pink
  target: '#8b5cf6', // purple
  other: '#6b7280', // gray
};

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
  now: Date = new Date()
): CountdownStatus {
  const isZh = language === 'zh';
  const defaultColor = item.color || CATEGORY_COLORS[item.category] || '#3b82f6';

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
      color: '#8b5cf6',
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
        color: '#10b981',
      };
    }
    const daysToFriday = 5 - dayOfWeek;
    return {
      days: daysToFriday,
      type: 'countdown',
      displayText: isZh ? `还有 ${daysToFriday} 天` : `${daysToFriday}d to Weekend`,
      subText: isZh ? '周五 18:00' : 'Fri 18:00',
      nextDateStr: formatDateYMD(new Date(now.getTime() + daysToFriday * 24 * 60 * 60 * 1000)),
      color: '#f59e0b',
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
