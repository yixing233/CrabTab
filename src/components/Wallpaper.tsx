import React, { useEffect, useState, useRef } from 'react';
import { WallpaperConfig } from '../types';
import { getLocalMediaInfo } from '../utils/storage';
import { DEFAULT_LOCAL_WALLPAPER, DEFAULT_SETTINGS } from '../constants';

interface WallpaperProps {
  config: WallpaperConfig;
  theme: 'dark' | 'light' | 'auto';
}

export const Wallpaper: React.FC<WallpaperProps> = ({ config }) => {
  const [localMedia, setLocalMedia] = useState<{ url: string; isVideo: boolean } | null>(null);

  // 双缓冲壁纸状态：保证切换时旧图不闪烁，新图即刻加载并平滑交叉淡入
  const [currentOnlineUrl, setCurrentOnlineUrl] = useState<string>('');
  const currentOnlineUrlRef = useRef<string>('');
  const [nextOnlineUrl, setNextOnlineUrl] = useState<string | null>(null);
  const [nextReady, setNextReady] = useState<boolean>(false);
  const loadingTimerRef = useRef<any>(null);
  // 本地图片/视频统一合并为本地壁纸
  useEffect(() => {
    let active = true;
    const isLocal = config.type === 'local' || config.type === 'local_image' || config.type === 'local_video';
    if (isLocal) {
      getLocalMediaInfo().then((info) => {
        if (active && info) {
          setLocalMedia({ url: info.url, isVideo: info.isVideo });
        }
      });
    } else {
      setLocalMedia(null);
    }
    return () => {
      active = false;
    };
  }, [config.type, config.customUrl]);

  // 计算目标网络/收藏壁纸 URL
  const targetOnlineUrl = React.useMemo(() => {
    if (config.type === 'local' || config.type === 'local_image' || config.type === 'local_video') {
      return '';
    }
    const raw = config.customUrl;
    if (
      raw &&
      raw !== 'idb_local_wallpaper' &&
      !raw.startsWith('blob:') &&
      (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/'))
    ) {
      return raw;
    }
    return DEFAULT_SETTINGS.wallpaper.customUrl || 'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_1920x1080.jpg';
  }, [config.type, config.customUrl]);

  // 当目标 URL 变动时，实时预加载并交叉淡入，无需刷新页面
  useEffect(() => {
    if (!targetOnlineUrl) return;
    const prev = currentOnlineUrlRef.current;
    if (!prev) {
      currentOnlineUrlRef.current = targetOnlineUrl;
      setCurrentOnlineUrl(targetOnlineUrl);
      return;
    }

    if (targetOnlineUrl === prev) {
      if (currentOnlineUrl !== targetOnlineUrl) {
        setCurrentOnlineUrl(targetOnlineUrl);
      }
      return;
    }
    // 准备切换新图
    setNextOnlineUrl(targetOnlineUrl);
    setNextReady(false);

    let isCancelled = false;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';

    const defaultFallback =
      DEFAULT_SETTINGS.wallpaper.customUrl ||
      'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_1920x1080.jpg';

    const onImageLoaded = () => {
      if (isCancelled) return;
      setNextReady(true);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      // 500ms 后旧图退场，新图成为当前主图
      loadingTimerRef.current = setTimeout(() => {
        if (!isCancelled) {
          currentOnlineUrlRef.current = targetOnlineUrl;
          setCurrentOnlineUrl(targetOnlineUrl);
          setNextOnlineUrl(null);
          setNextReady(false);
        }
      }, 550);
    };

    img.onload = onImageLoaded;
    img.onerror = () => {
      if (isCancelled) return;
      if (targetOnlineUrl !== defaultFallback) {
        console.warn('Failed to load wallpaper image, fallback to default:', targetOnlineUrl);
        currentOnlineUrlRef.current = defaultFallback;
        setCurrentOnlineUrl(defaultFallback);
        setNextOnlineUrl(null);
        setNextReady(false);
      } else {
        onImageLoaded();
      }
    };
    img.src = targetOnlineUrl;

    // 兜底超时：若网络慢或跨域挂起，最长 1.2s 强制应用并显示
    const fallbackTimer = setTimeout(onImageLoaded, 1200);

    return () => {
      isCancelled = true;
      clearTimeout(fallbackTimer);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [targetOnlineUrl, currentOnlineUrl]);

  // 背景渲染内容
  let backgroundContent: React.ReactNode = null;
  const isLocal = config.type === 'local' || config.type === 'local_image' || config.type === 'local_video';
  if (isLocal) {
    const activeLocalUrl = localMedia?.url || DEFAULT_LOCAL_WALLPAPER;
    const isVideo = localMedia?.isVideo ?? false;
    if (isVideo) {
      backgroundContent = (
        <video
          key={activeLocalUrl}
          src={activeLocalUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover select-none pointer-events-none"
        />
      );
    } else {
      backgroundContent = (
        <img
          key={activeLocalUrl}
          src={activeLocalUrl}
          alt="Wallpaper"
          className="w-full h-full object-cover select-none pointer-events-none transition-opacity duration-700"
        />
      );
    }
  } else {
    // 双缓冲在线壁纸图层
    const currentUrl =
      currentOnlineUrl ||
      targetOnlineUrl ||
      DEFAULT_SETTINGS.wallpaper.customUrl ||
      'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_1920x1080.jpg';
    backgroundContent = (
      <div className="relative w-full h-full overflow-hidden">
        {/* 当前图层 */}
        {currentUrl && (
          <div
            key={`curr-${currentUrl}`}
            className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-700 transform scale-105"
            style={{
              backgroundImage: `url(${currentUrl})`,
            }}
          />
        )}

        {/* 新壁纸平滑交叉淡入层 */}
        {nextOnlineUrl && (
          <div
            key={`next-${nextOnlineUrl}`}
            className={`absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-500 ease-out transform scale-105 ${
              nextReady ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              backgroundImage: `url(${nextOnlineUrl})`,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full -z-50 overflow-hidden pointer-events-none select-none">
      {/* Background layer with blur & saturation */}
      <div
        className="w-full h-full transition-all duration-500 will-change-transform"
        style={{
          filter: `blur(${config.blur}px) saturate(${config.saturation}%)`,
          transform: config.blur > 0 ? 'scale(1.08)' : 'scale(1.02)',
        }}
      >
        {backgroundContent}
      </div>

      {/* Dark mask overlay for readability */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-500 pointer-events-none"
        style={{
          opacity: config.maskDarkness / 100,
        }}
      />

      {/* Ambient subtle vignette */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.4)_100%] pointer-events-none" />
    </div>
  );
};
