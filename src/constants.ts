import { AppSettings, SearchEngine, SiteShortcut } from './types';

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', icon: 'Google' },
  { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s', icon: 'Bing' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', icon: 'Baidu' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', icon: 'DuckDuckGo' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', icon: 'GitHub' },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=%s', icon: 'Bilibili' },
];

export const DEFAULT_SHORTCUTS: SiteShortcut[] = [
  { id: '1', title: 'GitHub', url: 'https://github.com', icon: 'https://github.githubassets.com/favicons/favicon.svg' },
  { id: '2', title: 'Bilibili', url: 'https://www.bilibili.com', icon: 'https://www.bilibili.com/favicon.ico' },
  { id: '3', title: 'YouTube', url: 'https://www.youtube.com', icon: 'https://www.youtube.com/s/desktop/f2905187/img/favicon.ico' },
  { id: '4', title: 'DeepSeek', url: 'https://chat.deepseek.com', icon: 'https://www.deepseek.com/favicon.ico' },
  { id: '5', title: 'ChatGPT', url: 'https://chatgpt.com', icon: 'https://chatgpt.com/favicon.ico' },
  { id: '6', title: '知乎', url: 'https://www.zhihu.com', icon: 'https://static.zhihu.com/heifetz/favicon.ico' },
  { id: '7', title: 'V2EX', url: 'https://www.v2ex.com', icon: 'https://www.v2ex.com/static/img/icon_rayps_64.png' },
  { id: '8', title: 'Notion', url: 'https://www.notion.so', icon: 'https://www.notion.so/images/favicon.ico' },
];

export const RANDOM_WALLPAPER_POOL = [
  'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_UHD.jpg&rf=LaDigue_UHD.jpg&w=3840&h=2160&c=8&rs=1&o=3&r=0',
  'https://p17.qhimg.com/bdr/__100/t013a50192afb7f39cd.jpg',
  'https://p15.qhimg.com/bdr/__100/t01ff97cbb3fbe21605.jpg',
  'https://p15.qhimg.com/bdr/__100/d/_open360/201406125/13.jpg',
  'https://p17.qhimg.com/bdr/__100/t01cb1f7eb0c88b4963.jpg',
  'https://p15.qhimg.com/bdr/__100/d/_open360/xx0821/25.jpg',
  'https://p17.qhimg.com/bdr/__100/d/_open360/cy0708/10.jpg',
  'https://p18.qhimg.com/bdr/__100/d/_open360/20140707daifabu/567.jpg',
  'https://p15.qhimg.com/bdr/__100/t017036980c7f7efdc9.jpg',
  'https://p19.qhimg.com/bdr/__100/d/_open360/design0108/35.jpg',
  'https://p16.qhimg.com/bdr/__100/d/_open360/xqx0730/5.jpg',
  'https://p17.qhimg.com/bdr/__100/t01a4879c330b8b3ffb.jpg',
];

/** 内置默认本地壁纸（避免本地壁纸为空或初次切换时出错黑屏） */
export const DEFAULT_LOCAL_WALLPAPER = '/default-local-wallpaper.jpg';
export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  theme: 'dark',
  wallpaper: {
    type: 'online',
    source: 'upx8_nature',
    customUrl: 'https://cdn-hsyq-static.shanhutech.cn/bizhi/staticwp/202604/ad5e13374346ddece09e8a7a63848e6e--1018377470.jpg',
    blur: 0,
    opacity: 1,
    maskDarkness: 25,
    saturation: 100,
    autoRefresh: 'off',
  },
  uiScale: 100,
  searchEngine: 'google',
  suggestionEngine: 'auto',
  searchBookmarks: true,
  searchHistory: true,
  showWeather: true,
  showBookmarkBar: true,
  homeContentMode: 'shortcuts',
  pinnedRecentUrls: [],
  recentVerticalOffset: 0,
  searchVerticalOffset: 0,
  shortcutMode: 'desktop',
  desktopPageCount: 1, // 桌面默认总分页数
  shortcutAutoFill: false, // 默认不自动补位
  showQuickLinks: true,
  showSeconds: false,
  timeFormat24: true,
  showGreeting: true,
  hitokotoTypes: ['d', 'i', 'k', 'h'],
  openInNewTab: true,
  autoCheckUpdate: true,
  clockStyle: {
    size: 'large',
    verticalOffset: 'center',
    fontFamily: 'mono',
    fontWeight: 'normal',
  },
  glassStyle: {
    blur: 16,
    opacity: 20,
    borderOpacity: 25,
    radius: '2xl'
  }
};
