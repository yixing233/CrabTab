import { OnlineWallpaperSourceItem, WallpaperProviderId } from '../types';
import { isWallpaperBlocked } from './wallpaperStorage';

export interface WallpaperProviderInfo {
  id: WallpaperProviderId;
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
}

export const WALLPAPER_PROVIDERS: WallpaperProviderInfo[] = [
  {
    id: 'upx8',
    nameZh: 'UPX8 壁纸',
    nameEn: 'UPX8 Wallpapers',
    descZh: '双源自动切换高可用壁纸库',
    descEn: 'High-availability multi-category wallpapers',
  },
  {
    id: 'yumus',
    nameZh: '语幕壁纸',
    nameEn: 'Yumus Wallpapers',
    descZh: '微软必应 4K 与 360 原生超清图库',
    descEn: 'Microsoft Bing 4K & 360 Ultra HD repository',
  },
];

// 语幕壁纸源（含必应 4K 与 360 官方直连 API 分类）
export const YUMUS_SOURCES: OnlineWallpaperSourceItem[] = [
  {
    id: 'bing_uhd',
    provider: 'yumus',
    nameZh: '必应 4K 超清',
    nameEn: 'Bing 4K UHD',
    descZh: '微软每日官方 4K 超清',
    descEn: 'Bing daily 4K wallpaper',
    badgeZh: '4K',
    badgeEn: '4K',
    type: 'daily',
    preview: 'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_UHD.jpg&rf=LaDigue_UHD.jpg&w=1000&c=8&rs=1',
  },
  {
    id: 'bing_random',
    provider: 'yumus',
    nameZh: '必应每日精选',
    nameEn: 'Bing Daily PC',
    descZh: '微软经典壁纸精选轮播',
    descEn: 'Bing featured wallpapers',
    badgeZh: '精选',
    badgeEn: 'Featured',
    type: 'api',
    preview: 'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_UHD.jpg&rf=LaDigue_UHD.jpg&w=1000&c=8&rs=1',
  },
  {
    id: '360_4k',
    provider: 'yumus',
    nameZh: '360 4K 专区',
    nameEn: '360 4K Selection',
    descZh: '极致超清大屏壁纸',
    descEn: 'Ultra HD 4K wallpapers',
    badgeZh: '4K',
    badgeEn: '4K',
    type: 'api',
    preview: 'https://p15.qhimg.com/bdr/__100/t01df91b8a88983ca86.jpg',
  },
  {
    id: '360_landscape',
    provider: 'yumus',
    nameZh: '自然风光',
    nameEn: 'Nature & Scenery',
    descZh: '壮丽山川与自然风光',
    descEn: 'Mountains and landscape',
    badgeZh: '风光',
    badgeEn: 'Nature',
    type: 'api',
    preview: 'https://p6.qhimg.com/bdr/__100/t018ce9fad0ce711cdd.jpg',
  },
  {
    id: '360_anime',
    provider: 'yumus',
    nameZh: '唯美二次元',
    nameEn: 'Anime Art',
    descZh: '动漫同人与精美插画',
    descEn: 'Anime and illustrations',
    badgeZh: '动漫',
    badgeEn: 'Anime',
    type: 'api',
    preview: 'https://p18.qhimg.com/bdr/__100/d/_open360/20140317PCyushangxian/179.jpg',
  },
  {
    id: '360_cool',
    provider: 'yumus',
    nameZh: '炫酷视觉',
    nameEn: 'Cool & Dynamic',
    descZh: '质感设计与流光视效',
    descEn: 'Visual design & 3D art',
    badgeZh: '炫酷',
    badgeEn: 'Cool',
    type: 'api',
    preview: 'https://p17.qhimg.com/bdr/__100/d/_open360/cy0708/10.jpg',
  },
  {
    id: '360_game',
    provider: 'yumus',
    nameZh: '游戏精选',
    nameEn: 'Gaming World',
    descZh: '热门主机与电竞壁纸',
    descEn: 'Epic gaming wallpapers',
    badgeZh: '游戏',
    badgeEn: 'Game',
    type: 'api',
    preview: 'https://p17.qhimg.com/bdr/__100/t01cb1f7eb0c88b4963.jpg',
  },
  {
    id: '360_pets',
    provider: 'yumus',
    nameZh: '萌宠动物',
    nameEn: 'Cute Animals',
    descZh: '治愈系可爱生灵',
    descEn: 'Cute animals and pets',
    badgeZh: '萌宠',
    badgeEn: 'Animals',
    type: 'api',
    preview: 'https://p18.qhimg.com/bdr/__100/d/_open360/20140707daifabu/567.jpg',
  },
  {
    id: '360_movie',
    provider: 'yumus',
    nameZh: '影视剧照',
    nameEn: 'Cinema & Movie',
    descZh: '大片剧照与电影场景',
    descEn: 'Movie scenes and stills',
    badgeZh: '影视',
    badgeEn: 'Cinema',
    type: 'api',
    preview: 'https://p15.qhimg.com/bdr/__100/t017036980c7f7efdc9.jpg',
  },
  {
    id: '360_auto',
    provider: 'yumus',
    nameZh: '汽车机械',
    nameEn: 'Supercars & Auto',
    descZh: '超级跑车与工业机械',
    descEn: 'Sports cars & automotive',
    badgeZh: '汽车',
    badgeEn: 'Cars',
    type: 'api',
    preview: 'https://p15.qhimg.com/bdr/__100/d/_open360/xx0821/25.jpg',
  },
  {
    id: '360_fresh',
    provider: 'yumus',
    nameZh: '清新唯美',
    nameEn: 'Fresh & Aesthetic',
    descZh: '治愈极简小清新色彩',
    descEn: 'Fresh & warm aesthetic',
    badgeZh: '清新',
    badgeEn: 'Fresh',
    type: 'api',
    preview: 'https://p16.qhimg.com/bdr/__100/d/_open360/xqx0730/5.jpg',
  },
  {
    id: '360_text',
    provider: 'yumus',
    nameZh: '品味文字',
    nameEn: 'Typography',
    descZh: '排版灵感与极简语录',
    descEn: 'Typography and quotes',
    badgeZh: '文字',
    badgeEn: 'Text',
    type: 'api',
    preview: 'https://p16.qhimg.com/bdr/__100/t01aacb1f6046327740.jpg',
  },
];

// UPX8 壁纸源（对应 https://wp.upx8.com/#quickstart 的 10 大分类）
export const UPX8_SOURCES: OnlineWallpaperSourceItem[] = [
  {
    id: 'upx8_nature',
    provider: 'upx8',
    nameZh: '自然风光',
    nameEn: 'Nature',
    descZh: '广袤原野与壮丽风景',
    descEn: 'Beautiful natural landscapes',
    badgeZh: '风光',
    badgeEn: 'Nature',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202604/ad5e13374346ddece09e8a7a63848e6e--1018377470.jpg',
  },
  {
    id: 'upx8_anime',
    provider: 'upx8',
    nameZh: '动漫二次元',
    nameEn: 'Anime',
    descZh: '精选动漫插画二次元',
    descEn: 'Anime & manga illustrations',
    badgeZh: '动漫',
    badgeEn: 'Anime',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202511/ee90bd2cdb522b707f5f00a2fd279299--3224552551.jpg',
  },
  {
    id: 'upx8_game',
    provider: 'upx8',
    nameZh: '游戏世界',
    nameEn: 'Game',
    descZh: '高清热门游戏壁纸',
    descEn: 'Top video game wallpapers',
    badgeZh: '游戏',
    badgeEn: 'Game',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202602/0f9accc75326a16178a4562c4587b3af--2235169116.jpg',
  },
  {
    id: 'upx8_animal',
    provider: 'upx8',
    nameZh: '萌宠动物',
    nameEn: 'Animal',
    descZh: '灵动生灵与可爱萌宠',
    descEn: 'Cute wildlife & pets',
    badgeZh: '动物',
    badgeEn: 'Animal',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202401/948c977abf37ef2ee3331dcb402c18fd--583152779.jpg',
  },
  {
    id: 'upx8_city',
    provider: 'upx8',
    nameZh: '城市建筑',
    nameEn: 'City & Architecture',
    descZh: '现代摩登都会与天际线',
    descEn: 'City skylines & architecture',
    badgeZh: '城市',
    badgeEn: 'City',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202210/9fafd3ee9b12a24a3871c45797bdd11d--3064459498.jpg',
  },
  {
    id: 'upx8_abstract',
    provider: 'upx8',
    nameZh: '抽象艺术',
    nameEn: 'Abstract',
    descZh: '几何色块与视觉艺术',
    descEn: 'Abstract visuals & 3D renders',
    badgeZh: '抽象',
    badgeEn: 'Abstract',
    type: 'api',
    preview: 'https://cdn-hsyq-static-bak.shanhutech.cn/bizhi/staticwp/201211/t016043bf0927b9ca1c.jpg',
  },
  {
    id: 'upx8_space',
    provider: 'upx8',
    nameZh: '星空宇宙',
    nameEn: 'Space & Galaxy',
    descZh: '深空星云与银河夜空',
    descEn: 'Deep galaxy & nebula stars',
    badgeZh: '宇宙',
    badgeEn: 'Space',
    type: 'api',
    preview: 'https://cdn-hsyq-static-bak.shanhutech.cn/bizhi/staticwp/201903/3c6a2111dbc1c413ec7acf83dba1bfa0.jpg',
  },
  {
    id: 'upx8_car',
    provider: 'upx8',
    nameZh: '豪车超跑',
    nameEn: 'Supercars',
    descZh: '跑车机车与速度美学',
    descEn: 'Sports cars and speed',
    badgeZh: '汽车',
    badgeEn: 'Car',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202206/9083bdb9189200cfe23f837689c9ce4c--3876374305.jpg',
  },
  {
    id: 'upx8_girl',
    provider: 'upx8',
    nameZh: '唯美人像',
    nameEn: 'Portrait',
    descZh: '清纯人像与时尚写真',
    descEn: 'Portraits & photography',
    badgeZh: '人像',
    badgeEn: 'Portrait',
    type: 'api',
    preview: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202106/b30fc828be42ec4b9106ec8e2e8fba68--3093898920.jpg',
  },
  {
    id: 'upx8_sport',
    provider: 'upx8',
    nameZh: '竞技运动',
    nameEn: 'Sports',
    descZh: '极限运动与赛场瞬间',
    descEn: 'Sports action & athletics',
    badgeZh: '运动',
    badgeEn: 'Sport',
    type: 'api',
    preview: 'https://cdn-hsyq-static-bak.shanhutech.cn/bizhi/staticwp/201406/70cf2d5921ba1e75ffd262cb76ef73558.jpg',
  },
];

// 合并所有在线壁纸源（UPX8 为默认首选源）
export const ONLINE_WALLPAPER_SOURCES: OnlineWallpaperSourceItem[] = [
  ...UPX8_SOURCES,
  ...YUMUS_SOURCES,
];

// 360 官方 API 分类 ID 映射
const THREE_SIXTY_CID_MAP: Record<string, number> = {
  '360_4k': 36,
  '360_landscape': 9,
  '360_anime': 26,
  '360_cool': 10,
  '360_game': 5,
  '360_pets': 14,
  '360_movie': 7,
  '360_auto': 12,
  '360_fresh': 15,
  '360_text': 35,
};

// UPX8 分类 Key 映射
const UPX8_CATEGORY_MAP: Record<string, string> = {
  upx8_nature: 'nature',
  upx8_anime: 'anime',
  upx8_game: 'game',
  upx8_animal: 'animal',
  upx8_city: 'city',
  upx8_abstract: 'abstract',
  upx8_space: 'space',
  upx8_car: 'car',
  upx8_girl: 'girl',
  upx8_sport: 'sport',
};

/**
 * 从微软必应官方接口拉取壁纸
 */
async function fetchBingWallpaper(isUhd = true): Promise<string> {
  const randomOffset = Math.floor(Math.random() * 8);
  const api = `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=${randomOffset}&n=1&mkt=zh-CN`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Bing API error: ${res.status}`);
  const data = await res.json();
  const item = data.images?.[0];
  if (!item?.urlbase) throw new Error('No Bing image returned');

  const baseId = item.urlbase.replace('/th?id=', '');
  if (isUhd) {
    return `https://cn.bing.com/th?id=${baseId}_UHD.jpg&rf=LaDigue_UHD.jpg&w=3840&h=2160&c=8&rs=1&o=3&r=0`;
  }
  return `https://cn.bing.com/th?id=${baseId}_1920x1080.jpg&rf=LaDigue_UHD.jpg&w=1920&h=1080&c=8&rs=1&o=3&r=0`;
}

/**
 * 直接从 360 官方接口拉取 JSON，绕过 301 重定向与跨域限制
 */
async function fetch360Wallpaper(sourceId: string): Promise<string> {
  const cid = THREE_SIXTY_CID_MAP[sourceId] || 36;
  const maxStart = cid === 36 ? 1200 : cid === 35 ? 400 : 3000;
  const start = Math.floor(Math.random() * maxStart);
  const count = 10;
  const api = `http://wallpaper.apc.360.cn/index.php?c=WallPaper&a=getAppsByCategory&cid=${cid}&start=${start}&count=${count}&from=360chrome`;

  const res = await fetch(api);
  if (!res.ok) throw new Error(`360 API error: ${res.status}`);
  const data = await res.json();
  const list = data.data || [];
  if (!list.length) throw new Error('No 360 images found');

  const picked = list[Math.floor(Math.random() * list.length)];
  const rawUrl: string = picked.url_mid || picked.url || '';
  if (!rawUrl) throw new Error('Empty 360 image URL');

  // 将 URL 升级为 https 并提取 100% 原始最高清晰度
  return rawUrl
    .replace('http://', 'https://')
    .replace('/bdr/__85/', '/bdr/__100/')
    .replace('/bdr/__70/', '/bdr/__100/');
}

/**
 * 从 UPX8 接口拉取壁纸 (format=json)
 */
async function fetchUpx8Wallpaper(sourceId: string): Promise<string> {
  const category = UPX8_CATEGORY_MAP[sourceId] || 'nature';
  const api = `https://wp.upx8.com/api.php?format=json&category=${category}&count=1`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`UPX8 API error: ${res.status}`);
  const json = await res.json();
  const itemUrl = json.data?.url;
  if (!itemUrl) throw new Error('UPX8 returned empty URL');

  // 确保使用 https 链接
  return itemUrl.replace('http://', 'https://');
}

/**
 * 获取指定壁纸源的高清图片
 */
export async function fetchWallpaperFromSource(sourceId: string): Promise<string> {
  const found = ONLINE_WALLPAPER_SOURCES.find((s) => s.id === sourceId);
  const fallback = found?.preview || 'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_UHD.jpg&rf=LaDigue_UHD.jpg&w=3840&h=2160&c=8&rs=1&o=3&r=0';

  // 尝试最多 4 次，避开用户已屏蔽的壁纸
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let result = '';
      if (sourceId.startsWith('upx8_')) {
        result = await fetchUpx8Wallpaper(sourceId);
      } else if (sourceId === 'bing_uhd') {
        result = await fetchBingWallpaper(true);
      } else if (sourceId === 'bing_random') {
        result = await fetchBingWallpaper(false);
      } else if (sourceId.startsWith('360_')) {
        result = await fetch360Wallpaper(sourceId);
      } else {
        result = fallback;
      }

      // 若未被屏蔽，立即采用
      if (result && !isWallpaperBlocked(result)) {
        return result;
      }
    } catch (err) {
      console.warn(`[Wallpaper] Fetch attempt ${attempt + 1} failed for ${sourceId}:`, err);
    }
  }

  return fallback;
}

/**
 * 兼容旧组件的调用签名
 */
export async function fetchFromOnlineSource(sourceId: string): Promise<{ url: string; title: string }> {
  const url = await fetchWallpaperFromSource(sourceId);
  const item = ONLINE_WALLPAPER_SOURCES.find((s) => s.id === sourceId);
  return {
    url,
    title: item?.nameZh || '高清壁纸',
  };
}
