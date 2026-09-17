export type Language = 'zh' | 'en';
export type ThemeMode = 'dark' | 'light' | 'auto';

export type WallpaperType = 'online' | 'favorites' | 'custom_url' | 'local' | 'local_image' | 'local_video';

export interface FavoriteWallpaperItem {
  id: string;
  url: string;
  title?: string;
  source?: string;
  createdAt: number;
}

export type WallpaperCategory =
  | 'all'
  | 'bing'
  | 'nature'
  | 'anime'
  | 'cyberpunk'
  | 'minimal'
  | 'space';

export interface OnlineWallpaperItem {
  id: string;
  category: WallpaperCategory;
  titleZh: string;
  titleEn: string;
  preview: string;
  url: string;
}

export type WallpaperProviderId = 'yumus' | 'upx8';

export interface OnlineWallpaperSourceItem {
  id: string;
  provider: WallpaperProviderId;
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
  badgeZh: string;
  badgeEn: string;
  type: 'daily' | 'api' | 'custom';
  preview: string;
}

export type WallpaperSource = string;

export type WallpaperAutoRefreshMode = 'off' | 'every-open' | '1h' | '1d';

export interface WallpaperConfig {
  type: WallpaperType;
  source: WallpaperSource;
  category?: WallpaperCategory;
  customUrl?: string; // For custom URL or indexedDB key
  blur: number; // 0 to 30px
  opacity: number; // 0.1 to 1.0 (brightness / overlay)
  maskDarkness: number; // 0 to 80%
  saturation: number; // 50 to 150%
  autoRefresh?: WallpaperAutoRefreshMode;
}

export type SearchEngineId = 'google' | 'bing' | 'baidu' | 'duckduckgo' | 'github' | 'bilibili';

export type SuggestionEngineId = 'auto' | 'bing' | 'baidu' | 'google' | 'duckduckgo' | 'off';

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  url: string; // url template with %s
  icon: string;
}

export interface SiteShortcut {
  id: string;
  title: string;
  url: string;
  icon?: string;
  color?: string;
  isFolder?: boolean;
  folderSize?: '1x1' | '2x2';
  gridPosition?: {
    column: number;
    row: number;
    page?: number; // 桌面分页（从 1 开始，默认 1）
  } | null;
  children?: SiteShortcut[];
}

export interface WeatherForecastItem {
  day: string;
  dayText: string;
  condition: string;
  conditionCode: number;
  tempMax: number;
  tempMin: number;
}

export interface WeatherData {
  city: string;
  sourceName?: string; // 比如 "小米天气" 或 "实时气象"
  temp: number;
  condition: string;
  conditionCode: number;
  windSpeed: number;
  windDirection?: string;
  windScale?: string;
  humidity: number;
  feelsLike?: number;
  tempMax?: number;
  tempMin?: number;
  sunrise?: string;
  sunset?: string;
  uvIndex?: number;
  uvText?: string;
  dressingText?: string;
  sportText?: string;
  carWashText?: string;
  forecast?: WeatherForecastItem[];
}

export interface BrowserHistoryItem {
  id: string;
  title: string;
  url: string;
  lastVisitTime?: number;
  visitCount?: number;
}

export type HitokotoType =
  | 'a' // 动画
  | 'b' // 漫画
  | 'c' // 游戏
  | 'd' // 文学
  | 'e' // 原创
  | 'f' // 来自网络
  | 'g' // 其他
  | 'h' // 影视
  | 'i' // 诗词
  | 'j' // 网易云
  | 'k' // 哲学
  | 'l'; // 抖机灵

export interface ClockStyleConfig {
  size: 'small' | 'medium' | 'large' | 'huge' | number; // 字体大小（支持预设或精确像素数值 px）
  verticalOffset: 'top' | 'center' | 'bottom' | number; // 竖直垂直位置（支持预设或精确偏移像素 px）
  fontFamily: 'system' | 'sans' | 'mono' | 'serif' | 'rounded' | 'handwriting'; // 字体样式
  fontWeight: 'thin' | 'normal' | 'semibold' | 'bold'; // 字体粗细
}

export type CountdownRepeat = 'none' | 'weekly' | 'monthly' | 'yearly';
export type CountdownCategory = 'work' | 'life' | 'holiday' | 'birthday' | 'anniversary' | 'target' | 'other';

export interface CountdownItem {
  id: string;
  title: string;
  targetDate: string; // 'YYYY-MM-DD'
  repeat: CountdownRepeat;
  category: CountdownCategory;
  isPinned: boolean;
  isPreset?: boolean;
  presetType?: 'year_progress' | 'weekend_countdown' | 'month_progress';
  color?: string;
  icon?: string;
  createdAt: number;
}

/**
 * 主屏中央展示的内容。
 * 「简洁模式」已移除，其布局并入桌面网格（窄屏自动降为 4 列），
 * 因此原先「快捷方式显示模式」与「主屏展示内容」两个开关合并为这一个三态开关。
 */
export type HomeContentMode = 'off' | 'shortcuts' | 'recent';

export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
}

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  wallpaper: WallpaperConfig;
  uiScale?: number; // 全局界面缩放比例（百分比，默认 100，支持 80 ~ 140）
  searchEngine: SearchEngineId;
  suggestionEngine?: SuggestionEngineId;
  searchBookmarks?: boolean; // 搜索框是否搜索书签（默认 true）
  searchHistory?: boolean; // 搜索框是否搜索历史记录（默认 true）
  showWeather: boolean;
  showBookmarkBar?: boolean; // 顶部常驻书签栏开关（默认 true）
  homeContentMode?: HomeContentMode; // 主屏内容展示模式：关闭 / 快捷方式 / 最近访问
  pinnedRecentUrls?: string[]; // 置顶钉住的最近访问网址
  recentVerticalOffset?: number; // 最近访问组件垂直位置偏移（像素 px，负数偏上，正数偏下，默认 0）
  searchVerticalOffset?: number; // 搜索框垂直位置偏移（像素 px，负数偏上，正数偏下，默认 0）
  /** @deprecated 已由 homeContentMode 取代，仅为兼容旧版本写入的设置而保留。 */
  shortcutMode?: 'off' | 'compact' | 'desktop';
  desktopPageCount?: number; // 桌面总分页数（默认 1，最多 9 页）
  /** @deprecated Kept for compatibility with settings saved by older versions. */
  showQuickLinks: boolean;
  shortcutAutoFill?: boolean; // 桌面快捷方式自动补位开关（默认 false，保持自由网格留白）
  showSeconds: boolean;
  timeFormat24: boolean;
  showGreeting: boolean;
  hitokotoTypes?: HitokotoType[]; // 一言自定义类型列表
  openInNewTab: boolean;
  autoCheckUpdate?: boolean; // 自动检查更新开关（默认开启，间隔 6 小时）
  clockStyle: ClockStyleConfig;
  glassStyle: {
    blur: number; // backdrop-blur px
    opacity: number; // background opacity %
    borderOpacity: number; // border opacity %
    radius: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  };
}

export type GlassStyle = AppSettings['glassStyle'];

