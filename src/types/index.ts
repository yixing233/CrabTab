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
  };
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

export interface AppSettings {
  language: Language;
  theme: ThemeMode;
  wallpaper: WallpaperConfig;
  searchEngine: SearchEngineId;
  suggestionEngine?: SuggestionEngineId;
  showWeather: boolean;
  showQuickLinks: boolean;
  showSeconds: boolean;
  timeFormat24: boolean;
  showGreeting: boolean;
  hitokotoTypes?: HitokotoType[]; // 一言自定义类型列表
  openInNewTab: boolean;
  clockStyle: ClockStyleConfig;
  glassStyle: {
    blur: number; // backdrop-blur px
    opacity: number; // background opacity %
    borderOpacity: number; // border opacity %
    radius: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  };
}
