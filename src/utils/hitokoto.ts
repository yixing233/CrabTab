/**
 * Hitokoto (一言) API 服务封装
 * 官方文档: https://developer.hitokoto.cn/sentence/
 */

import { HitokotoType } from '../types';

export interface HitokotoData {
  id: number | string;
  uuid?: string;
  hitokoto: string;
  type?: string;
  from?: string;
  from_who?: string | null;
  creator?: string;
  created_at?: string;
  length?: number;
}

export interface HitokotoTypeOption {
  key: HitokotoType;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
}

export const ALL_HITOKOTO_TYPES: HitokotoTypeOption[] = [
  { key: 'a', labelZh: '动画', labelEn: 'Anime', descZh: '经典动漫名言名句', descEn: 'Quotes from animation' },
  { key: 'b', labelZh: '漫画', labelEn: 'Comic', descZh: '漫画作品经典对白', descEn: 'Quotes from comics' },
  { key: 'c', labelZh: '游戏', labelEn: 'Game', descZh: '热门与经典游戏金句', descEn: 'Quotes from games' },
  { key: 'd', labelZh: '文学', labelEn: 'Literature', descZh: '中外文学名著摘录', descEn: 'Literature extracts' },
  { key: 'e', labelZh: '原创', labelEn: 'Original', descZh: '创作者原创生活灵感', descEn: 'Original creations' },
  { key: 'f', labelZh: '来自网络', labelEn: 'Internet', descZh: '互联网流行趣味流行语', descEn: 'Internet culture' },
  { key: 'g', labelZh: '其他', labelEn: 'Other', descZh: '综合杂类精选句子', descEn: 'Miscellaneous quotes' },
  { key: 'h', labelZh: '影视', labelEn: 'Film & TV', descZh: '电影与剧集高光台词', descEn: 'Movie & TV lines' },
  { key: 'i', labelZh: '诗词', labelEn: 'Poetry', descZh: '中国古典诗词名篇名句', descEn: 'Classical poetry' },
  { key: 'j', labelZh: '网易云', labelEn: 'Music Story', descZh: '音乐热评与抒情共鸣', descEn: 'Music comments' },
  { key: 'k', labelZh: '哲学', labelEn: 'Philosophy', descZh: '深度思考与哲思感悟', descEn: 'Philosophical insights' },
  { key: 'l', labelZh: '抖机灵', labelEn: 'Witty', descZh: '幽默风趣俏皮话', descEn: 'Humorous & witty' },
];

export const DEFAULT_SELECTED_HITOKOTO_TYPES: HitokotoType[] = ['d', 'i', 'k', 'h'];

const HITOKOTO_STORAGE_KEY = 'crab_home_hitokoto_cache_v1';
const HITOKOTO_API_URL = 'https://v1.hitokoto.cn';

// 备选保底数据（弱网或离线时秒级呈现）
const DEFAULT_HITOKOTO_ZH: HitokotoData = {
  id: 0,
  hitokoto: '保持热爱，奔赴山海。',
  from: '生活',
  from_who: null,
};

const DEFAULT_HITOKOTO_EN: HitokotoData = {
  id: 0,
  hitokoto: 'Stay hungry, stay foolish.',
  from: 'Whole Earth Catalog',
  from_who: 'Steve Jobs',
};

export interface CachedHitokoto {
  data: HitokotoData;
  timestamp: number;
}

/**
 * 获取本地缓存的一言
 */
export function getCachedHitokoto(): HitokotoData | null {
  try {
    const raw = localStorage.getItem(HITOKOTO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHitokoto;
    if (parsed && parsed.data && parsed.data.hitokoto) {
      return parsed.data;
    }
  } catch (e) {
    console.error('Failed to read hitokoto cache', e);
  }
  return null;
}

/**
 * 保存一言到本地缓存
 */
export function setCachedHitokoto(data: HitokotoData): void {
  try {
    const payload: CachedHitokoto = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(HITOKOTO_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to save hitokoto cache', e);
  }
}

/**
 * 获取一条新的一言
 * 支持传入自定义句子类型筛选
 */
export async function fetchHitokoto(
  types: HitokotoType[] = DEFAULT_SELECTED_HITOKOTO_TYPES,
  language: 'zh' | 'en' = 'zh'
): Promise<HitokotoData> {
  const isEn = language === 'en';

  const validTypes = types && types.length > 0 ? types : DEFAULT_SELECTED_HITOKOTO_TYPES;
  const typeParams = validTypes.map((t) => `c=${encodeURIComponent(t)}`).join('&');
  const url = `${HITOKOTO_API_URL}?${typeParams}&max_length=35&encode=json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Hitokoto API HTTP error: ${response.status}`);
    }

    const data: HitokotoData = await response.json();
    if (data && data.hitokoto) {
      setCachedHitokoto(data);
      return data;
    }
    throw new Error('Invalid hitokoto response');
  } catch (error) {
    console.warn('Hitokoto fetch error, falling back to cache or default:', error);
    const cached = getCachedHitokoto();
    if (cached) {
      return cached;
    }
    return isEn ? DEFAULT_HITOKOTO_EN : DEFAULT_HITOKOTO_ZH;
  }
}
