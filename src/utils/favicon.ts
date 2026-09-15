/**
 * Favicon 图标获取与多级降级兜底引擎
 * 具备根域名智能识别、高频官方高清映射、Touch-Icon 探测、高可用全球/国内 CDN 与哈希渐变兜底。
 */

/**
 * 提取 URL 的域名、根域名与源
 */
export function parseDomainAndOrigin(inputUrl: string): {
  domain: string;
  rootDomain: string;
  origin: string;
  rootOrigin: string;
} {
  try {
    let formatted = inputUrl.trim();
    if (!formatted) return { domain: '', rootDomain: '', origin: '', rootOrigin: '' };
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = `https://${formatted}`;
    }
    const parsed = new URL(formatted);
    const domain = parsed.hostname.toLowerCase();
    const parts = domain.split('.');
    let rootDomain = domain;

    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain.includes(':');
    const isLocalhost = domain === 'localhost' || domain.endsWith('.local') || isIp;

    // 智能提取二级根域名，处理形如 chat.deepseek.com -> deepseek.com, www.bilibili.com -> bilibili.com
    if (!isLocalhost && parts.length >= 2) {
      const isSpecialTld =
        parts.length >= 3 &&
        ['com', 'net', 'org', 'gov', 'edu', 'co'].includes(parts[parts.length - 2]);
      if (isSpecialTld && parts.length >= 3) {
        rootDomain = parts.slice(-3).join('.');
      } else {
        rootDomain = parts.slice(-2).join('.');
      }
    }

    const origin = parsed.origin;
    const rootOrigin = `${parsed.protocol}//${rootDomain}`;
    return { domain, rootDomain, origin, rootOrigin };
  } catch {
    return { domain: '', rootDomain: '', origin: '', rootOrigin: '' };
  }
}

/**
 * 常见主流高频站点高清官方矢量 / 高分辨率图标映射表
 */
const KNOWN_HIGH_RES_ICONS: Record<string, string> = {
  // 顶流 AI 站点
  'deepseek.com': 'https://www.deepseek.com/favicon.ico',
  'chat.deepseek.com': 'https://www.deepseek.com/favicon.ico',
  'chatgpt.com': 'https://chatgpt.com/favicon.ico',
  'openai.com': 'https://chatgpt.com/favicon.ico',
  'claude.ai': 'https://claude.ai/favicon.ico',
  'anthropic.com': 'https://claude.ai/favicon.ico',
  'kimi.ai': 'https://kimi.moonshot.cn/favicon.ico',
  'moonshot.cn': 'https://kimi.moonshot.cn/favicon.ico',
  'kimi.moonshot.cn': 'https://kimi.moonshot.cn/favicon.ico',

  // 开发者与科技社区
  'github.com': 'https://github.githubassets.com/favicons/favicon.svg',
  'v2ex.com': 'https://www.v2ex.com/static/img/icon_rayps_64.png',
  'linux.do': 'https://linux.do/uploads/default/optimized/1X/a62c4fc72877a5b3a4a9cfd7b7dbd7d965bb74ea_2_32x32.png',
  'juejin.cn': 'https://lf3-cdn-tos.bytescm.com/obj/static/xitu_juejin_web/static/favicons/favicon-32x32.png',
  'sspai.com': 'https://cdn.sspai.com/sspai/assets/img/favicon/icon.ico',
  'stackoverflow.com': 'https://cdn.sstatic.net/Sites/stackoverflow/Img/favicon.ico',
  'figma.com': 'https://static.figma.com/app/icon/1/favicon.svg',
  'notion.so': 'https://www.notion.so/images/favicon.ico',

  // 视频与内容社区
  'bilibili.com': 'https://www.bilibili.com/favicon.ico',
  'youtube.com': 'https://www.youtube.com/s/desktop/f2905187/img/favicon.ico',
  'zhihu.com': 'https://static.zhihu.com/heifetz/favicon.ico',
  'reddit.com': 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png',
  'x.com': 'https://abs.twimg.com/favicons/twitter.3.ico',
  'twitter.com': 'https://abs.twimg.com/favicons/twitter.3.ico',
  'douban.com': 'https://img3.doubanio.com/favicon.ico',
  'weibo.com': 'https://weibo.com/favicon.ico',
  'xiaohongshu.com': 'https://fe-static.xhscdn.com/biz-static/freya-assets/fe-common/favicon.ico',
  'wikipedia.org': 'https://en.wikipedia.org/static/favicon/wikipedia.ico',

  // 搜索引擎与日常服务
  'google.com': 'https://www.google.com/favicon.ico',
  'google.cn': 'https://www.google.com/favicon.ico',
  'baidu.com': 'https://www.baidu.com/favicon.ico',
  'taobao.com': 'https://img.alicdn.com/tps/i3/T1OjaVFl4dXXa.JOZB-114-114.png',
  'jd.com': 'https://www.jd.com/favicon.ico',
  'steamcommunity.com': 'https://store.steampowered.com/favicon.ico',
  'steampowered.com': 'https://store.steampowered.com/favicon.ico',
  'music.163.com': 'https://s1.music.126.net/style/favicon.ico',
};

/**
 * 尝试获取 Chrome 原生缓存 Favicon（Manifest V3 官方 API：0 延迟、免联网、本地高分辨率提取）
 */
export function getChromeNativeFaviconUrl(siteUrl: string, size = 64): string {
  try {
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
      const base = chrome.runtime.getURL('/_favicon/');
      const url = new URL(base);
      url.searchParams.set('pageUrl', siteUrl);
      url.searchParams.set('size', size.toString());
      return url.toString();
    }
  } catch {}
  return '';
}

/**
 * 获取站点匹配的高清图标（优先子域名，无匹配时自动匹配根域名）
 */
function getKnownHighResIcon(domain: string, rootDomain: string): string | undefined {
  if (domain && KNOWN_HIGH_RES_ICONS[domain]) {
    return KNOWN_HIGH_RES_ICONS[domain];
  }
  if (rootDomain && KNOWN_HIGH_RES_ICONS[rootDomain]) {
    return KNOWN_HIGH_RES_ICONS[rootDomain];
  }
  return undefined;
}

/**
 * 获取某 URL 候选 Favicon 地址数组（按可用性和画质优先级降序排序）
 */
export function getFaviconCandidates(siteUrl: string, customIcon?: string): string[] {
  const result: string[] = [];
  const add = (url?: string) => {
    if (url && typeof url === 'string' && url.trim().length > 0 && !result.includes(url)) {
      result.push(url.trim());
    }
  };

  // 1. 若用户指定了自定义图标地址
  if (customIcon && customIcon.trim()) {
    if (customIcon.trim() === 'avatar:letter') {
      return []; // 触发首字徽标
    }
    add(customIcon);
  }

  const { domain, rootDomain, origin, rootOrigin } = parseDomainAndOrigin(siteUrl);
  if (!domain) return result;

  // 2. 匹配官方高清晰度图源（直接覆盖 DeepSeek、ChatGPT、GitHub 等主流网站）
  const known = getKnownHighResIcon(domain, rootDomain);
  if (known) {
    add(known);
  }

  // 3. 源站 Touch 图标与根域名备选
  if (origin) {
    add(`${origin}/apple-touch-icon.png`);
    add(`${origin}/apple-touch-icon-precomposed.png`);
    add(`${origin}/favicon.ico`);
  }
  if (rootOrigin && rootOrigin !== origin) {
    add(`${rootOrigin}/apple-touch-icon.png`);
    add(`${rootOrigin}/favicon.ico`);
    add(`https://www.${rootDomain}/favicon.ico`);
  }

  // 4. 高可靠全球与国内 CDN 智能探测（仅对公网域名生效，局域网与 IP 直接使用原生源或首字徽标）
  const isLocalOrIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain.includes(':') || domain === 'localhost' || domain.endsWith('.local');
  if (!isLocalOrIp) {
    add(`https://icon.horse/icon/${domain}`);
    if (rootDomain && rootDomain !== domain) {
      add(`https://icon.horse/icon/${rootDomain}`);
    }
    add(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    if (rootDomain && rootDomain !== domain) {
      add(`https://icons.duckduckgo.com/ip3/${rootDomain}.ico`);
    }
    add(`https://www.google.com/s2/favicons?domain=${rootDomain || domain}&sz=128`);
  }

  // 5. Chrome 原生本地 Favicon（作为环境候选之一）
  const chromeFavicon = getChromeNativeFaviconUrl(siteUrl, 64);
  if (chromeFavicon) {
    add(chromeFavicon);
  }

  return result;
}

/**
 * 获取首推的单一 Favicon 地址
 */
export function getPrimaryFaviconUrl(siteUrl: string, customIcon?: string): string {
  const candidates = getFaviconCandidates(siteUrl, customIcon);
  return candidates[0] || '';
}

/**
 * 图标候选结构体定义
 */
export interface IconCandidateOption {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  type: 'chrome' | 'known' | 'touch' | 'cdn' | 'favicon' | 'avatar';
}

/**
 * 生成并返回供用户在弹窗中点选的图标候选列表
 */
export function getIconCandidateOptions(siteUrl: string): IconCandidateOption[] {
  const options: IconCandidateOption[] = [];
  const addedUrls = new Set<string>();

  const pushOpt = (opt: IconCandidateOption) => {
    if (!opt.url || addedUrls.has(opt.url)) return;
    addedUrls.add(opt.url);
    options.push(opt);
  };

  const { domain, rootDomain, origin, rootOrigin } = parseDomainAndOrigin(siteUrl);
  if (!domain) return options;

  // 1. 官方高清 / 知名网站矢量源
  const known = getKnownHighResIcon(domain, rootDomain);
  if (known) {
    pushOpt({
      id: 'known',
      name: '官方高清',
      nameEn: 'Official',
      url: known,
      type: 'known',
    });
  }

  // 2. 源站 Apple Touch Icon（高质量大图）
  if (origin) {
    pushOpt({
      id: 'touch-origin',
      name: '高清Touch',
      nameEn: 'Touch Icon',
      url: `${origin}/apple-touch-icon.png`,
      type: 'touch',
    });
  }
  if (rootOrigin && rootOrigin !== origin) {
    pushOpt({
      id: 'touch-root',
      name: '根站Touch',
      nameEn: 'Root Touch',
      url: `${rootOrigin}/apple-touch-icon.png`,
      type: 'touch',
    });
  }

  // 3. 高质量 CDN 镜像
  pushOpt({
    id: 'cdn-iconhorse',
    name: '高清镜像',
    nameEn: 'HD Mirror',
    url: `https://icon.horse/icon/${rootDomain || domain}`,
    type: 'cdn',
  });

  pushOpt({
    id: 'cdn-ddg',
    name: 'DuckDuckGo',
    nameEn: 'DuckDuckGo',
    url: `https://icons.duckduckgo.com/ip3/${rootDomain || domain}.ico`,
    type: 'cdn',
  });

  // 4. 源站基础 Favicon
  if (origin) {
    pushOpt({
      id: 'favicon-origin',
      name: '站点图标',
      nameEn: 'Favicon',
      url: `${origin}/favicon.ico`,
      type: 'favicon',
    });
  }
  if (rootOrigin && rootOrigin !== origin) {
    pushOpt({
      id: 'favicon-root',
      name: '主站图标',
      nameEn: 'Main Favicon',
      url: `https://www.${rootDomain}/favicon.ico`,
      type: 'favicon',
    });
  }

  // 5. Chrome 原生本地 Favicon（仅在扩展环境可用时提供）
  const chromeUrl = getChromeNativeFaviconUrl(siteUrl, 64);
  if (chromeUrl) {
    pushOpt({
      id: 'chrome-native',
      name: '浏览器本地',
      nameEn: 'Browser Native',
      url: chromeUrl,
      type: 'chrome',
    });
  }

  // 6. 动态首字渐变徽标（保底选项）
  pushOpt({
    id: 'avatar-letter',
    name: '首字徽标',
    nameEn: 'Avatar',
    url: 'avatar:letter',
    type: 'avatar',
  });

  return options;
}

/**
 * 精选 8 组高质感现代毛玻璃渐变色系
 */
const AVATAR_PALETTES = [
  { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: '#ffffff' }, // 极光紫
  { background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)', color: '#ffffff' }, // 深海蓝
  { background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#ffffff' }, // 薄荷翠
  { background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)', color: '#ffffff' }, // 落日橙
  { background: 'linear-gradient(135deg, #db2777 0%, #f43f5e 100%)', color: '#ffffff' }, // 珊瑚红
  { background: 'linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)', color: '#ffffff' }, // 青蓝玉
  { background: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)', color: '#ffffff' }, // 琥珀金
  { background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)', color: '#ffffff' }, // 冷萃墨
];

/**
 * 根据字符串种子计算稳定的哈希渐变色板
 */
export function getAvatarPalette(seed: string): { background: string; color: string } {
  let hash = 0;
  const str = (seed || 'crab').trim().toLowerCase();
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[index];
}
