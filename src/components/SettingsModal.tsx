import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Tabs, 
  Select, 
  Switch, 
  Slider, 
  Upload, 
  Button, 
  Segmented,
  Typography,
  Input,
  message,
  Popconfirm,
  Empty,
  Tooltip
} from 'antd';
import type { UploadProps } from 'antd';
import { 
  PictureOutlined, 
  SettingOutlined, 
  BgColorsOutlined, 
  InfoCircleOutlined,
  LinkOutlined,
  GithubOutlined
} from '@ant-design/icons';
import { 
  RotateCw, 
  Check, 
  Image as ImageIcon, 
  Video, 
  Trash2 as TrashIcon, 
  Moon, 
  Sun,
  Heart,
  Ban,
  ExternalLink,
  Copy,
  FolderHeart,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import { AppSettings, Language, WallpaperProviderId, HitokotoType, ShortcutDisplayMode } from '../types';
import { SEARCH_ENGINES, DEFAULT_LOCAL_WALLPAPER, DEFAULT_SETTINGS } from '../constants';
import { ALL_HITOKOTO_TYPES, HitokotoTypeOption } from '../utils/hitokoto';
import { 
  WALLPAPER_PROVIDERS, 
  ONLINE_WALLPAPER_SOURCES,
  fetchFromOnlineSource,
} from '../utils/wallpaperSources';
import { saveLocalMedia, clearLocalMedia, getLocalMediaInfo } from '../utils/storage';
import {
  loadFavoriteWallpapers,
  addFavoriteWallpaper,
  removeFavoriteWallpaper,
  isWallpaperFavorited,
  addBlockedWallpaper,
  clearAllFavoriteWallpapers,
  FavoriteWallpaperItem
} from '../utils/wallpaperStorage';
import { checkLatestVersion, ReleaseInfo, CURRENT_VERSION, GITHUB_REPO_URL } from '../utils/versionCheck';
import { i18n } from '../i18n';
import { SearchEngineIcon } from './SearchEngineIcons';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onRefreshWallpaper: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  onUpdateSettings,
  onRefreshWallpaper,
}) => {
  const [activeTab, setActiveTab] = useState('wallpaper');
  const [favorites, setFavorites] = useState<FavoriteWallpaperItem[]>([]);
  const [isFavorited, setIsFavorited] = useState<boolean>(false);
  const [localMedia, setLocalMedia] = useState<{ url: string; isVideo: boolean; name?: string; isCustom?: boolean } | null>(null);

  const [providerOverride, setProviderOverride] = useState<WallpaperProviderId | null>(null);
  const activeProvider: WallpaperProviderId = providerOverride ?? (
    settings.wallpaper.source?.startsWith('upx8_') ? 'upx8' : 'yumus'
  );

  const [uploading, setUploading] = useState(false);
  const [fetchingSourceId, setFetchingSourceId] = useState<string | null>(null);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null);
  const t = i18n[settings.language];
  const { Text } = Typography;

  // Resolve active theme polarity
  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // 加载收藏与检测当前壁纸状态
  const isLocalWallpaper =
    settings.wallpaper.type === 'local' ||
    settings.wallpaper.type === 'local_image' ||
    settings.wallpaper.type === 'local_video';

  const currentWallpaperUrl = settings.wallpaper.customUrl || '';
  const previewUrl = isLocalWallpaper
    ? (localMedia?.url || DEFAULT_LOCAL_WALLPAPER)
    : (currentWallpaperUrl && currentWallpaperUrl !== 'idb_local_wallpaper' && !currentWallpaperUrl.startsWith('blob:'))
      ? currentWallpaperUrl
      : (DEFAULT_SETTINGS.wallpaper.customUrl || 'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_1920x1080.jpg');

  useEffect(() => {
    if (open) {
      loadFavoriteWallpapers().then((favs) => {
        setFavorites(favs);
        if (!isLocalWallpaper && currentWallpaperUrl && currentWallpaperUrl !== 'idb_local_wallpaper' && !currentWallpaperUrl.startsWith('blob:')) {
          setIsFavorited(isWallpaperFavorited(currentWallpaperUrl));
        } else {
          setIsFavorited(false);
        }
      });
      getLocalMediaInfo().then((info) => {
        setLocalMedia(info);
      });
    }
  }, [open, isLocalWallpaper, currentWallpaperUrl]);

  // 打开设置时静默检查一次；壁纸切换不应触发版本网络请求
  useEffect(() => {
    if (!open) return;
    checkLatestVersion(false)
      .then((res) => {
        setReleaseInfo(res);
      })
      .catch((error) => {
        console.warn('[VersionCheck] Automatic check failed:', error);
      });
  }, [open]);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await checkLatestVersion(true);
      setReleaseInfo(res);
      if (res.hasUpdate) {
        message.info(`${t.newVersionAvailable}: v${res.version}`);
      } else {
        message.success(t.isLatestVersion);
      }
    } catch {
      message.error(settings.language === 'zh' ? '检测更新失败，请检查网络' : 'Check update failed, please check network');
    } finally {
      setCheckingUpdate(false);
    }
  };

  // 恢复一级子标签：在线壁纸(online) / 本地壁纸(local) / 网络外链(custom_url) / 我的收藏(favorites)
  const currentSubTab: 'online' | 'local' | 'custom_url' | 'favorites' =
    settings.wallpaper.type === 'local' ||
    settings.wallpaper.type === 'local_image' ||
    settings.wallpaper.type === 'local_video'
      ? 'local'
      : settings.wallpaper.type === 'favorites'
        ? 'favorites'
        : settings.wallpaper.source === 'custom_url' || settings.wallpaper.type === 'custom_url'
          ? 'custom_url'
          : 'online';

  const handleSubTabChange = (tabKey: 'online' | 'local' | 'custom_url' | 'favorites') => {
    if (tabKey === 'local') {
      onUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: localMedia?.isVideo ? 'local_video' : 'local_image',
        },
      });
    } else if (tabKey === 'favorites') {
      const firstFav = favorites[0];
      onUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: 'favorites',
          customUrl: firstFav ? firstFav.url : settings.wallpaper.customUrl,
        },
      });
    } else if (tabKey === 'custom_url') {
      onUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: 'custom_url',
          source: 'custom_url',
        },
      });
    } else {
      // online
      const currentUrl = settings.wallpaper.customUrl;
      const isValidOnlineUrl =
        currentUrl &&
        currentUrl !== 'idb_local_wallpaper' &&
        !currentUrl.startsWith('blob:') &&
        (currentUrl.startsWith('http://') || currentUrl.startsWith('https://') || currentUrl.startsWith('/'));

      if (isValidOnlineUrl) {
        onUpdateSettings({
          wallpaper: {
            ...settings.wallpaper,
            type: 'online',
          },
        });
      } else {
        // 若没有有效在线壁纸 URL，自动从当前在线源拉取一张
        const activeSource = settings.wallpaper.source || 'bing';
        handleSelectLiveSource(activeSource);
      }
    }
  };

  // 收藏 / 取消收藏当前壁纸
  const handleToggleFavorite = async () => {
    if (isLocalWallpaper || !currentWallpaperUrl || currentWallpaperUrl === 'idb_local_wallpaper' || currentWallpaperUrl.startsWith('blob:')) {
      message.warning(settings.language === 'zh' ? '当前本地媒体保存在本地数据库中，无需网络收藏' : 'Local media is saved in IndexedDB');
      return;
    }
    if (isFavorited) {
      await removeFavoriteWallpaper(currentWallpaperUrl);
      setIsFavorited(false);
      const updated = await loadFavoriteWallpapers();
      setFavorites(updated);
      message.success(t.wallpaperUnfavorited);
    } else {
      await addFavoriteWallpaper({
        url: currentWallpaperUrl,
        title: settings.wallpaper.source || 'Curated Wallpaper',
        source: settings.wallpaper.source,
      });
      setIsFavorited(true);
      const updated = await loadFavoriteWallpapers();
      setFavorites(updated);
      message.success(t.wallpaperFavorited);
    }
  };

  // 屏蔽当前壁纸
  const handleBlockCurrent = async () => {
    if (isLocalWallpaper || !currentWallpaperUrl || currentWallpaperUrl === 'idb_local_wallpaper' || currentWallpaperUrl.startsWith('blob:')) {
      message.warning(settings.language === 'zh' ? '本地壁纸不支持加入屏蔽列表' : 'Local media cannot be blocked');
      return;
    }
    await addBlockedWallpaper(currentWallpaperUrl);
    if (isFavorited) {
      await removeFavoriteWallpaper(currentWallpaperUrl);
      setIsFavorited(false);
      const updated = await loadFavoriteWallpapers();
      setFavorites(updated);
    }
    message.success(t.wallpaperBlockedSuccess);
    onRefreshWallpaper();
  };

  // 复制原图链接
  const handleCopyUrl = async () => {
    if (isLocalWallpaper || !currentWallpaperUrl || currentWallpaperUrl === 'idb_local_wallpaper' || currentWallpaperUrl.startsWith('blob:')) {
      message.info(settings.language === 'zh' ? '本地壁纸为私有二进制文件' : 'Local media is private file');
      return;
    }
    try {
      await navigator.clipboard.writeText(currentWallpaperUrl);
      message.success(t.copySuccess);
    } catch {
      message.error(settings.language === 'zh' ? '复制失败' : 'Failed to copy');
    }
  };

  // 设为当前壁纸（从收藏列表）
  const handleApplyFavoriteItem = (fav: FavoriteWallpaperItem) => {
    onUpdateSettings({
      wallpaper: {
        ...settings.wallpaper,
        type: 'favorites',
        customUrl: fav.url,
      },
    });
    setIsFavorited(true);
    message.success(t.appliedSuccess);
  };

  // 从收藏夹移除某项
  const handleRemoveFavoriteItem = async (url: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await removeFavoriteWallpaper(url);
    const updated = await loadFavoriteWallpapers();
    setFavorites(updated);
    if (url === currentWallpaperUrl) {
      setIsFavorited(false);
    }
    message.success(t.wallpaperUnfavorited);
  };

  // 清空所有收藏
  const handleClearAllFavorites = async () => {
    await clearAllFavoriteWallpapers();
    setFavorites([]);
    setIsFavorited(false);
    message.success(t.clearSuccess);
  };

  const uploadProps: UploadProps = {
    name: 'file',
    showUploadList: false,
    beforeUpload: async (file) => {
      setUploading(true);
      try {
        const result = await saveLocalMedia(file);
        const info = await getLocalMediaInfo();
        setLocalMedia(info);
        onUpdateSettings({
          wallpaper: {
            ...settings.wallpaper,
            type: result.type,
          },
        });
        message.success(t.uploadSuccess);
      } catch (err) {
        message.error(t.uploadFail);
        console.error(err);
      } finally {
        setUploading(false);
      }
      return false; // Prevent default form upload
    },
  };

  const handleClearLocal = async () => {
    await clearLocalMedia();
    setLocalMedia({
      url: DEFAULT_LOCAL_WALLPAPER,
      isVideo: false,
      name: settings.language === 'zh' ? '默认内置本地壁纸' : 'Default Local Wallpaper',
      isCustom: false,
    });
    onUpdateSettings({
      wallpaper: {
        ...settings.wallpaper,
        type: 'local_image',
      },
    });
    message.success(settings.language === 'zh' ? '已恢复内置默认本地壁纸' : 'Reset to default local wallpaper');
  };

  // 选择具体的壁纸类型（动漫、自然风景、游戏等）
  const handleSelectLiveSource = async (sourceId: string) => {
    setFetchingSourceId(sourceId);
    try {
      const res = await fetchFromOnlineSource(sourceId);
      onUpdateSettings({
        wallpaper: {
          ...settings.wallpaper,
          type: 'online',
          source: sourceId,
          customUrl: res.url,
        },
      });
      setIsFavorited(isWallpaperFavorited(res.url));
      message.success(
        `${t.appliedSuccess}${res.title ? `: ${res.title}` : ''}`
      );
    } catch (e) {
      console.error(e);
      message.error(t.uploadFail);
    } finally {
      setFetchingSourceId(null);
    }
  };

  const handleApplyCustomUrl = () => {
    const trimmed = customUrlInput.trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      message.warning(t.invalidUrlTip);
      return;
    }
    onUpdateSettings({
      wallpaper: {
        ...settings.wallpaper,
        type: 'custom_url',
        source: 'custom_url',
        customUrl: trimmed,
      },
    });
    setIsFavorited(isWallpaperFavorited(trimmed));
    message.success(t.appliedSuccess);
  };

  // 当前激活的在线壁纸分类 ID
  const currentOnlineSourceId = settings.wallpaper.source || 'upx8_nature';
  const currentSourceItem = ONLINE_WALLPAPER_SOURCES.find((s) => s.id === currentOnlineSourceId);

  // 1. Wallpaper Tab Content
  const wallpaperTabContent = (
    <div className="space-y-4 py-1">
      {/* 顶部：当前壁纸实时预览大卡片与操作 */}
      <div className={`p-3 sm:p-3.5 rounded-2xl border transition-all ${
        isDark ? 'border-white/10 bg-white/[0.04]' : 'border-gray-200/80 bg-gray-50/70'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-400" />
            <span>{t.currentWallpaperPreview}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* 收藏 / 取消收藏 */}
            <Tooltip title={isFavorited ? t.unfavoriteWallpaper : t.favoriteWallpaper}>
              <Button
                size="small"
                shape="round"
                onClick={handleToggleFavorite}
                className={`flex items-center gap-1 !text-xs !h-7 !px-2.5 transition-all ${
                  isFavorited
                    ? '!bg-rose-500/15 !border-rose-500/40 !text-rose-500 font-semibold hover:!bg-rose-500/25'
                    : '!border-current/20 hover:!border-rose-400 hover:!text-rose-400'
                }`}
              >
                <Heart size={13} className={isFavorited ? 'fill-rose-500 text-rose-500' : ''} />
                <span>{isFavorited ? t.favoritedTag : t.favoriteWallpaper}</span>
              </Button>
            </Tooltip>

            {/* 屏蔽此壁纸 */}
            <Popconfirm
              title={t.confirmBlockWallpaper}
              description={t.confirmBlockWallpaperDesc}
              onConfirm={handleBlockCurrent}
              okText={t.blockWallpaper}
              okButtonProps={{ danger: true }}
              cancelText={settings.language === 'zh' ? '取消' : 'Cancel'}
            >
              <Tooltip title={t.blockWallpaperDesc}>
                <Button
                  size="small"
                  shape="round"
                  danger
                  className="flex items-center gap-1 !text-xs !h-7 !px-2.5 !border-red-500/30 !bg-red-500/10 hover:!bg-red-500/20"
                >
                  <Ban size={13} />
                  <span>{t.blockWallpaper}</span>
                </Button>
              </Tooltip>
            </Popconfirm>

            {/* 换一张 */}
            <Tooltip title={t.refreshWallpaper}>
              <Button
                size="small"
                shape="round"
                onClick={onRefreshWallpaper}
                className="flex items-center gap-1 !text-xs !h-7 !px-2.5 !border-current/20"
              >
                <RotateCw size={13} />
                <span>{t.refreshWallpaper}</span>
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* 预览画面本体 */}
        <div className="relative w-full h-36 sm:h-40 rounded-xl overflow-hidden shadow-inner border border-black/10 bg-black/40 flex items-center justify-center group">
          {isLocalWallpaper && localMedia?.isVideo ? (
            <video
              src={localMedia.url}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Current Wallpaper"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  DEFAULT_SETTINGS.wallpaper.customUrl ||
                  'https://cn.bing.com/th?id=OHR.BeechEngland_ZH-CN1807343872_1920x1080.jpg';
              }}
            />
          )}

          {/* 浮动标签 */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-black/60 text-white/90 backdrop-blur-md border border-white/20">
              {currentSubTab === 'online'
                ? (currentSourceItem ? (settings.language === 'zh' ? `在线 · ${currentSourceItem.nameZh}` : `Online · ${currentSourceItem.nameEn}`) : '在线精选壁纸')
                : currentSubTab === 'favorites'
                  ? (settings.language === 'zh' ? '收藏夹壁纸' : 'Favorite Collection')
                  : currentSubTab === 'custom_url'
                    ? (settings.language === 'zh' ? '自定义外链' : 'Custom Direct URL')
                    : (localMedia?.isVideo ? (settings.language === 'zh' ? '本地动态视频' : 'Local Video') : (settings.language === 'zh' ? '本地静态图片' : 'Local Image'))}
            </span>
          </div>

          {/* 快捷跳转 / 复制浮层 (仅在线壁纸显示) */}
          {!isLocalWallpaper && currentWallpaperUrl && currentWallpaperUrl !== 'idb_local_wallpaper' && !currentWallpaperUrl.startsWith('blob:') && (
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip title={t.copyUrl}>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/90 backdrop-blur-md border border-white/20 cursor-pointer transition-transform active:scale-95"
                >
                  <Copy size={13} />
                </button>
              </Tooltip>
              <Tooltip title={t.openOriginal}>
                <a
                  href={currentWallpaperUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white/90 backdrop-blur-md border border-white/20 cursor-pointer transition-transform active:scale-95 flex items-center"
                >
                  <ExternalLink size={13} />
                </a>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* 恢复一级子标签：在线壁纸 / 本地壁纸 / 自定义外链 / 我的收藏 (Segmented) */}
      <div className="flex justify-center my-1">
        <Segmented<'online' | 'local' | 'custom_url' | 'favorites'>
          value={currentSubTab}
          onChange={handleSubTabChange}
          className="!rounded-xl p-1"
          options={[
            {
              value: 'online',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <PictureOutlined />
                  <span>{settings.language === 'zh' ? '在线壁纸' : 'Online'}</span>
                </span>
              ),
            },
            {
              value: 'local',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <FolderOpen size={13} />
                  <span>{settings.language === 'zh' ? '本地壁纸' : 'Local'}</span>
                </span>
              ),
            },
            {
              value: 'custom_url',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <LinkOutlined />
                  <span>{settings.language === 'zh' ? '自定义外链' : 'Direct URL'}</span>
                </span>
              ),
            },
            {
              value: 'favorites',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <Heart size={13} className="text-rose-400" />
                  <span>{settings.language === 'zh' ? '我的收藏' : 'Favorites'}</span>
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* 1. 在线壁纸面板：壁纸类型（风景、动漫、游戏等）改为简单优雅的下拉菜单切换 */}
      {currentSubTab === 'online' && (
        <div className="space-y-3.5">
          {/* 壁纸源服务商卡片 */}
          <div className={`p-3 sm:p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
          }`}>
            <div>
              <div className="text-xs font-semibold">
                {settings.language === 'zh' ? '壁纸源服务商' : 'Wallpaper Provider'}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {settings.language === 'zh'
                  ? '切换官方高可用图库服务商'
                  : 'Switch between curated wallpaper providers'}
              </div>
            </div>

            <Segmented<WallpaperProviderId>
              value={activeProvider}
              onChange={(val) => setProviderOverride(val)}
              options={WALLPAPER_PROVIDERS.map((p) => ({
                value: p.id,
                label: (
                  <span className="font-medium text-xs px-2 py-0.5">
                    {settings.language === 'zh' ? p.nameZh : p.nameEn}
                  </span>
                ),
              }))}
            />
          </div>

          {/* 下拉菜单切换壁纸类型（动漫、风景、游戏、萌宠等） */}
          <div className={`p-3 sm:p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
          }`}>
            <div>
              <div className="text-xs font-semibold">
                {settings.language === 'zh' ? '壁纸分类 / 类型' : 'Wallpaper Category'}
              </div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {settings.language === 'zh'
                  ? '下拉选择动漫、风景、游戏等不同题材壁纸'
                  : 'Select category such as Anime, Scenery, Gaming, etc.'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={
                  ONLINE_WALLPAPER_SOURCES.some((s) => s.id === currentOnlineSourceId && s.provider === activeProvider)
                    ? currentOnlineSourceId
                    : (ONLINE_WALLPAPER_SOURCES.find((s) => s.provider === activeProvider)?.id || '')
                }
                onChange={(sourceId) => handleSelectLiveSource(sourceId)}
                loading={fetchingSourceId !== null}
                style={{ width: 110 }}
                options={ONLINE_WALLPAPER_SOURCES.filter((s) => s.provider === activeProvider).map((src) => ({
                  value: src.id,
                  label: settings.language === 'zh' ? src.badgeZh : src.badgeEn,
                }))}
              />

              {/* 换一张按钮 */}
              <Tooltip title={settings.language === 'zh' ? '换一张当前类型的壁纸' : 'Switch wallpaper within this category'}>
                <Button
                  onClick={() => {
                    const activeSrc = ONLINE_WALLPAPER_SOURCES.some((s) => s.id === currentOnlineSourceId && s.provider === activeProvider)
                      ? currentOnlineSourceId
                      : (ONLINE_WALLPAPER_SOURCES.find((s) => s.provider === activeProvider)?.id || '');
                    if (activeSrc) handleSelectLiveSource(activeSrc);
                  }}
                  loading={fetchingSourceId !== null}
                  icon={<RotateCw size={13} className={fetchingSourceId ? 'animate-spin' : ''} />}
                  className="flex items-center justify-center !text-xs !h-8"
                >
                  {t.refreshWallpaper}
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* 定时自动换壁纸频率 */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
          }`}>
            <div>
              <div className="text-xs font-semibold">{t.wallpaperAutoRefresh}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">{t.wallpaperAutoRefreshDesc}</div>
            </div>
            <Segmented
              value={settings.wallpaper.autoRefresh || 'off'}
              onChange={(val) =>
                onUpdateSettings({
                  wallpaper: {
                    ...settings.wallpaper,
                    autoRefresh: val as any,
                  },
                })
              }
              options={[
                { value: 'off', label: t.autoRefreshOff },
                { value: 'every-open', label: t.autoRefreshEveryOpen },
                { value: '1h', label: t.autoRefresh1h },
                { value: '1d', label: t.autoRefresh1d },
              ]}
            />
          </div>
        </div>
      )}

      {/* 2. 本地壁纸面板 */}
      {currentSubTab === 'local' && (
        <div className="space-y-3">
          <Upload.Dragger {...uploadProps} disabled={uploading} className="!p-4 sm:!p-6 !rounded-2xl border-dashed">
            <p className="ant-upload-drag-icon flex justify-center mb-2">
              <ImageIcon className="text-blue-500 w-10 h-10 animate-pulse" />
            </p>
            <p className="ant-upload-text text-sm font-medium">
              {t.uploadLocal}
            </p>
            <p className="ant-upload-hint text-xs text-neutral-400 mt-1">
              {t.uploadLocalDesc}
            </p>
          </Upload.Dragger>

          {localMedia && (
            <div className={`flex items-center justify-between p-3 rounded-xl border ${
              isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
            }`}>
              <div className="flex items-center gap-2.5">
                {localMedia.isVideo ? (
                  <Video size={16} className="text-purple-400" />
                ) : (
                  <ImageIcon size={16} className="text-blue-400" />
                )}
                <span className="text-xs font-medium truncate max-w-[200px] sm:max-w-[280px]">
                  {localMedia.name || (localMedia.isVideo ? '自定义本地视频' : '自定义本地图片')}
                </span>
                {!localMedia.isCustom && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-400 font-medium">
                    {settings.language === 'zh' ? '内置' : 'Built-in'}
                  </span>
                )}
              </div>
              {localMedia.isCustom && (
                <Button
                  danger
                  size="small"
                  type="text"
                  icon={<TrashIcon size={14} />}
                  onClick={handleClearLocal}
                  className="flex items-center !text-xs text-red-500 hover:text-red-600"
                >
                  {settings.language === 'zh' ? '恢复默认壁纸' : 'Reset to Default'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. 网络外链面板 */}
      {currentSubTab === 'custom_url' && (
        <div className={`p-4 rounded-xl border space-y-3 ${
          isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
        }`}>
          <div>
            <div className="text-xs font-semibold">{t.customWallpaper}</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              {settings.language === 'zh' ? '支持输入任何以 http:// 或 https:// 开头的网络图片直链' : 'Enter direct image URL (http/https)'}
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/wallpaper.jpg"
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              onPressEnter={handleApplyCustomUrl}
              className="!text-xs"
            />
            <Button type="primary" onClick={handleApplyCustomUrl} className="!text-xs shrink-0">
              {t.apply}
            </Button>
          </div>
        </div>
      )}

      {/* 4. 我的收藏查看与管理页面 (Favorites Manager) */}
      {currentSubTab === 'favorites' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs text-neutral-400 flex items-center gap-1.5">
              <FolderHeart size={14} className="text-rose-400" />
              <span>
                {settings.language === 'zh'
                  ? `共收藏 ${favorites.length} 张壁纸`
                  : `${favorites.length} saved wallpapers`}
              </span>
            </div>
            {favorites.length > 0 && (
              <Popconfirm
                title={t.clearFavoritesConfirm}
                onConfirm={handleClearAllFavorites}
                okText={settings.language === 'zh' ? '清空' : 'Clear'}
                okButtonProps={{ danger: true }}
                cancelText={settings.language === 'zh' ? '取消' : 'Cancel'}
              >
                <Button type="link" danger size="small" className="!text-xs !p-0 !h-auto">
                  {t.clearAllFavorites}
                </Button>
              </Popconfirm>
            )}
          </div>

          {favorites.length === 0 ? (
            <div className={`py-10 px-4 rounded-xl border flex flex-col items-center justify-center text-center ${
              isDark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-200/80 bg-gray-50/40'
            }`}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div className="text-xs text-neutral-400 max-w-xs mt-1">
                    {t.noFavoritesTip}
                  </div>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {favorites.map((fav) => {
                const isSelected =
                  settings.wallpaper.type === 'favorites' &&
                  settings.wallpaper.customUrl === fav.url;

                return (
                  <div
                    key={fav.id}
                    onClick={() => handleApplyFavoriteItem(fav)}
                    className={`group relative h-24 rounded-xl overflow-hidden cursor-pointer border transition-all duration-200 ${
                      isSelected
                        ? 'border-rose-500 ring-2 ring-rose-500/40 shadow-lg scale-[1.01]'
                        : isDark
                          ? 'border-white/10 hover:border-rose-400/50'
                          : 'border-gray-200 hover:border-rose-400/70'
                    }`}
                  >
                    <img
                      src={fav.url}
                      alt={fav.title || 'Favorite'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

                    {/* 状态标与操作 */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip title={t.openOriginal}>
                        <a
                          href={fav.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded bg-black/60 hover:bg-black/80 text-white/90 cursor-pointer flex items-center"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </Tooltip>
                      <Tooltip title={t.unfavoriteWallpaper}>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveFavoriteItem(fav.url, e)}
                          className="p-1 rounded bg-black/60 hover:bg-red-600/80 text-white/90 cursor-pointer transition-colors"
                        >
                          <TrashIcon size={12} />
                        </button>
                      </Tooltip>
                    </div>

                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between">
                      <div className="truncate">
                        <div className="text-[11px] font-semibold text-white truncate drop-shadow-sm">
                          {fav.title || '精选壁纸'}
                        </div>
                        <div className="text-[9px] text-white/70">
                          {new Date(fav.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center shrink-0 shadow-sm">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. 通用微调面板：毛玻璃高斯模糊与暗度遮罩 */}
      <div className={`p-3.5 rounded-xl border space-y-3.5 ${
        isDark ? 'border-white/8 bg-white/[0.03]' : 'border-gray-200/80 bg-gray-50/50'
      }`}>
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          {t.customGlassStyle}
        </div>
        
        {/* 背景模糊 */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>{t.blurEffect}</span>
            <span className="font-mono text-neutral-400">{settings.wallpaper.blur}px</span>
          </div>
          <Slider
            min={0}
            max={30}
            value={settings.wallpaper.blur}
            onChange={(val) =>
              onUpdateSettings({
                wallpaper: { ...settings.wallpaper, blur: val },
              })
            }
          />
        </div>

        {/* 遮罩暗度叠加 */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>{t.opacity}</span>
            <span className="font-mono text-neutral-400">{settings.wallpaper.maskDarkness ?? 25}%</span>
          </div>
          <Slider
            min={0}
            max={80}
            value={settings.wallpaper.maskDarkness ?? 25}
            onChange={(val) =>
              onUpdateSettings({
                wallpaper: { ...settings.wallpaper, maskDarkness: val },
              })
            }
          />
        </div>

        {/* 画面饱和度 */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>{settings.language === 'zh' ? '色彩饱和度' : 'Color Saturation'}</span>
            <span className="font-mono text-neutral-400">{settings.wallpaper.saturation ?? 100}%</span>
          </div>
          <Slider
            min={50}
            max={150}
            value={settings.wallpaper.saturation ?? 100}
            onChange={(val) =>
              onUpdateSettings({
                wallpaper: { ...settings.wallpaper, saturation: val },
              })
            }
          />
        </div>
      </div>
    </div>
  );

  // 2. Appearance & Theme Tab
  const appearanceTabContent = (
    <div className="space-y-6 py-2 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.appearanceTheme}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.theme}</Text>
          </div>
        </div>
        <Segmented
          value={settings.theme}
          onChange={(val) => onUpdateSettings({ theme: val as 'dark' | 'light' })}
          options={[
            {
              value: 'dark',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <Moon size={14} />
                  <span>{t.darkTheme}</span>
                </span>
              ),
            },
            {
              value: 'light',
              label: (
                <span className="flex items-center gap-1.5 px-1 py-0.5">
                  <Sun size={14} />
                  <span>{t.lightTheme}</span>
                </span>
              ),
            },
          ]}
        />
      </div>

      {/* 界面语言（归属外观设置） */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.language}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.languageDesc}</Text>
          </div>
        </div>
        <Segmented<Language>
          value={settings.language}
          onChange={(val) => onUpdateSettings({ language: val })}
          options={[
            { value: 'zh', label: <span className="px-1.5 py-0.5">简体中文</span> },
            { value: 'en', label: <span className="px-1.5 py-0.5">English</span> },
          ]}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.weather}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.showWeather}</Text>
          </div>
        </div>
        <Switch
          checked={settings.showWeather}
          onChange={(checked) => onUpdateSettings({ showWeather: checked })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.quickLinks}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.showQuickLinks}</Text>
          </div>
        </div>
        <Segmented<ShortcutDisplayMode>
          value={settings.shortcutMode}
          onChange={(shortcutMode) => onUpdateSettings({
            shortcutMode,
            showQuickLinks: shortcutMode !== 'off',
          })}
          options={[
            { value: 'off', label: t.shortcutModeOff },
            { value: 'compact', label: t.shortcutModeCompact },
            { value: 'desktop', label: t.shortcutModeDesktop },
          ]}
        />
      </div>

      {/* 桌面模式下自动补位开关 */}
      {settings.shortcutMode === 'desktop' && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 -mt-2 mb-2 transition-colors ${
          isDark ? 'bg-white/[0.03] border-white/10' : 'bg-gray-50 border-gray-100'
        }`}>
          <div>
            <div className="text-xs font-semibold">{t.shortcutAutoFill}</div>
            <div className="text-[11px] opacity-60 mt-0.5">{t.shortcutAutoFillDesc}</div>
          </div>
          <Switch
            checked={settings.shortcutAutoFill === true}
            onChange={(checked) => onUpdateSettings({ shortcutAutoFill: checked })}
          />
        </div>
      )}

      {/* 24 小时制时间 */}
      <div className="flex items-center justify-between">
        <div>
          <div>
            <Text strong>{t.timeFormat24}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs">{t.timeFormatDesc}</Text>
          </div>
        </div>
        <Switch
          checked={settings.timeFormat24}
          onChange={(checked) => onUpdateSettings({ timeFormat24: checked })}
        />
      </div>

      {/* 时间显示秒数 */}
      <div className="flex items-center justify-between">
        <div>
          <div>
            <Text strong>{t.showSeconds}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs">{t.showSecondsDesc}</Text>
          </div>
        </div>
        <Switch
          checked={settings.showSeconds}
          onChange={(checked) => onUpdateSettings({ showSeconds: checked })}
        />
      </div>

      {/* 一言显示与类型自定义 */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <div>
              <Text strong>{t.showGreeting}</Text>
            </div>
            <div>
              <Text type="secondary" className="text-xs">{t.showGreetingDesc}</Text>
            </div>
          </div>
          <Switch
            checked={settings.showGreeting}
            onChange={(checked) => onUpdateSettings({ showGreeting: checked })}
          />
        </div>

        {settings.showGreeting && (
          <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-2.5 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-black/80 dark:text-white/80">
                {t.hitokotoTypesSetting}
              </span>
              <span className="text-[11px] text-black/50 dark:text-white/50">
                {t.hitokotoTypesSettingDesc}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ALL_HITOKOTO_TYPES.map((cat: HitokotoTypeOption) => {
                const currentTypes: HitokotoType[] = settings.hitokotoTypes && settings.hitokotoTypes.length > 0 
                  ? settings.hitokotoTypes 
                  : ['d', 'i', 'k', 'h'];
                const isChecked = currentTypes.includes(cat.key);

                return (
                  <button
                    key={cat.key}
                    type="button"
                    title={settings.language === 'zh' ? cat.descZh : cat.descEn}
                    onClick={() => {
                      let nextTypes: HitokotoType[];
                      if (isChecked) {
                        if (currentTypes.length <= 1) {
                          message.info(settings.language === 'zh' ? '至少保留一种类型' : 'Keep at least one category');
                          return;
                        }
                        nextTypes = currentTypes.filter((k: HitokotoType) => k !== cat.key);
                      } else {
                        nextTypes = [...currentTypes, cat.key];
                      }
                      onUpdateSettings({ hitokotoTypes: nextTypes });
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-normal border transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-blue-500/10 dark:bg-blue-400/20 border-blue-500/30 dark:border-blue-400/40 text-blue-600 dark:text-blue-300 shadow-xs'
                        : 'bg-black/5 dark:bg-white/5 border-transparent text-black/70 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10'
                    }`}
                  >
                    <span>{settings.language === 'zh' ? cat.labelZh : cat.labelEn}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center border text-[9px] transition-colors ${
                        isChecked
                          ? 'bg-blue-500 text-white border-blue-500 dark:bg-blue-400 dark:text-slate-900 dark:border-blue-400 font-bold'
                          : 'border-black/20 dark:border-white/20 bg-transparent'
                      }`}
                    >
                      {isChecked ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // 3. General Tab
  const generalTabContent = (
    <div className="space-y-6 py-2 text-sm">
      {/* 默认搜索引擎 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.searchEngine}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.searchEngineDesc}</Text>
          </div>
        </div>
        <Select
          value={settings.searchEngine}
          style={{ width: 155 }}
          onChange={(val) => onUpdateSettings({ searchEngine: val })}
          options={SEARCH_ENGINES.map((e) => ({
            value: e.id,
            label: (
              <div className="flex items-center gap-2">
                <SearchEngineIcon engineId={e.id} size={15} />
                <span>{e.name}</span>
              </div>
            ),
          }))}
        />
      </div>

      {/* 搜索联想引擎 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">
            <Text strong>{t.suggestionEngine}</Text>
          </div>
          <div className="text-xs mt-0.5">
            <Text type="secondary">{t.suggestionEngineDesc}</Text>
          </div>
        </div>
        <Select
          value={settings.suggestionEngine || 'auto'}
          style={{ width: 140 }}
          onChange={(val) => onUpdateSettings({ suggestionEngine: val })}
          options={[
            { value: 'auto', label: t.suggestionEngineAuto },
            { value: 'bing', label: 'Bing 必应' },
            { value: 'baidu', label: '百度' },
            { value: 'google', label: 'Google' },
            { value: 'duckduckgo', label: 'DuckDuckGo' },
            { value: 'off', label: t.suggestionEngineOff },
          ]}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div>
            <Text strong>{t.openInNewTab}</Text>
          </div>
          <div>
            <Text type="secondary" className="text-xs">{t.openInNewTabDesc}</Text>
          </div>
        </div>
        <Switch
          checked={settings.openInNewTab}
          onChange={(checked) => onUpdateSettings({ openInNewTab: checked })}
        />
      </div>
    </div>
  );

  // 4. About Tab
  const aboutTabContent = (
    <div className="py-2 space-y-5">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <img
          src="/icon.png"
          alt="CrabTab Logo"
          className="w-16 h-16 mx-auto rounded-2xl shadow-lg border border-white/10 object-cover select-none"
        />
        <div>
          <div className="font-bold text-base">
            <Text strong className="text-base">CrabTab</Text>
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-semibold border border-blue-500/20">
              v{CURRENT_VERSION}
            </span>
            <Button
              type="text"
              size="small"
              loading={checkingUpdate}
              onClick={handleCheckUpdate}
              icon={!checkingUpdate ? <RotateCw className="w-3 h-3" /> : undefined}
              className="!text-xs !h-6 !px-2 !rounded-lg"
            >
              {checkingUpdate ? t.checkingUpdate : t.checkUpdate}
            </Button>
            <Button
              type="text"
              size="small"
              icon={<GithubOutlined className="text-xs" />}
              onClick={() => window.open(GITHUB_REPO_URL, '_blank')}
              className="!text-xs !h-6 !px-2 !rounded-lg"
            >
              {t.viewOnGitHub}
            </Button>
          </div>
        </div>
        <p className="max-w-md mx-auto leading-relaxed text-xs opacity-75">
          {t.aboutDesc}
        </p>
      </div>

      {/* Auto Check Update Toggle */}
      <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
        isDark ? 'bg-white/[0.03] border-white/10' : 'bg-gray-50 border-gray-100'
      }`}>
        <div>
          <div className="text-xs font-semibold">{t.autoCheckUpdate}</div>
          <div className="text-[11px] opacity-60 mt-0.5">{t.autoCheckUpdateDesc}</div>
        </div>
        <Switch
          checked={settings.autoCheckUpdate !== false}
          onChange={(checked) => onUpdateSettings({ autoCheckUpdate: checked })}
        />
      </div>

      {/* New Version Alert Banner */}
      {releaseInfo?.hasUpdate && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
          isDark ? 'bg-blue-950/30 border-blue-500/30' : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
              <span>{t.newVersionAvailable}: v{releaseInfo.version}</span>
            </div>
            {releaseInfo.notes && (
              <div className="text-[11px] opacity-75 mt-0.5 line-clamp-1 truncate">
                {releaseInfo.notes}
              </div>
            )}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<ExternalLink className="w-3 h-3" />}
            onClick={() => window.open(releaseInfo.releaseUrl || GITHUB_REPO_URL, '_blank')}
            className="!text-xs !rounded-lg shrink-0"
          >
            {t.viewReleaseNotes}
          </Button>
        </div>
      )}

      {/* Open Source Libraries Grid */}
      <div className="space-y-2.5">
        <div>
          <div className="text-xs font-semibold">{t.openSourceComponents}</div>
          <div className="text-[11px] opacity-60 mt-0.5">{t.openSourceComponentsDesc}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              name: 'React 19',
              version: '^19.2.8',
              descZh: '用于构建高性能用户界面的现代前端框架与并发特性',
              descEn: 'Modern UI library with concurrent rendering features',
              url: 'https://react.dev',
              tag: 'Framework',
            },
            {
              name: 'Ant Design 6',
              version: '^6.6.2',
              descZh: '企业级产品级 UI 设计语言与精致交互组件库',
              descEn: 'Enterprise-class React UI component library',
              url: 'https://ant.design',
              tag: 'UI Library',
            },
            {
              name: 'Tailwind CSS 4',
              version: '^4.3.3',
              descZh: '新一代原子化 CSS 引擎，驱动极简毛玻璃与暗色模式',
              descEn: 'Next-gen utility-first CSS framework for glassy aesthetics',
              url: 'https://tailwindcss.com',
              tag: 'Styling',
            },
            {
              name: 'Lucide Icons',
              version: '^1.41.0',
              descZh: '轻巧优美、风格统一的现代 SVG 矢量图标系统',
              descEn: 'Consistent and beautiful open-source SVG icon system',
              url: 'https://lucide.dev',
              tag: 'Icons',
            },
            {
              name: 'idb-keyval',
              version: '^6.3.0',
              descZh: '基于 IndexedDB 的极简高性能大容量媒体本地存储',
              descEn: 'Super-simple small promise-based keyval store with IDB',
              url: 'https://github.com/jakearchibald/idb-keyval',
              tag: 'Storage',
            },
            {
              name: 'Vite 8',
              version: '^8.2.2',
              descZh: '极速冷启动的前端构建工具与 Chrome 插件打包环境',
              descEn: 'Next generation fast frontend tooling and bundler',
              url: 'https://vite.dev',
              tag: 'Tooling',
            },
          ].map((lib) => (
            <a
              key={lib.name}
              href={lib.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2.5 rounded-xl border flex flex-col justify-between transition-colors duration-150 group ${
                isDark
                  ? 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05] hover:border-blue-500/40'
                  : 'border-gray-200/80 bg-gray-50/60 hover:bg-white hover:border-blue-400/60 hover:shadow-none'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold group-hover:text-blue-500 transition-colors">
                    {lib.name}
                  </span>
                  <span className="text-[10px] font-mono opacity-50">{lib.version}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] opacity-60 group-hover:opacity-100 transition-opacity">
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
                    {lib.tag}
                  </span>
                  <ExternalLink size={11} />
                </div>
              </div>
              <div className="text-[11px] opacity-65 mt-1.5 line-clamp-2">
                {settings.language === 'zh' ? lib.descZh : lib.descEn}
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* APIs & Services Grid */}
      <div className="space-y-2.5 pt-1">
        <div>
          <div className="text-xs font-semibold">{t.dataAndServices}</div>
          <div className="text-[11px] opacity-60 mt-0.5">{t.dataAndServicesDesc}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              name: 'Hitokoto 一言',
              provider: 'developer.hitokoto.cn',
              descZh: '每日金句、文学诗词与哲理语录开放接口',
              descEn: 'Daily curated quotes and philosophy sentences',
              url: 'https://developer.hitokoto.cn/sentence/',
            },
            {
              name: '小米天气 API',
              provider: 'Xiaomi Weather Service',
              descZh: '逐小时降水走势、官方灾害预警与多日温度走势',
              descEn: 'Hourly precipitation, official alerts and daily forecast',
              url: 'https://weatherapi.market.xiaomi.com',
            },
            {
              name: 'Open-Meteo',
              provider: 'open-meteo.com',
              descZh: '免费开源的全球多模式高精度气象数据兜底服务',
              descEn: 'Open-source global weather API for high-precision fallback',
              url: 'https://open-meteo.com',
            },
            {
              name: 'UPX8 & 语睦超清图库',
              provider: 'Curated 4K Wallpapers',
              descZh: '必应 4K 与风景、动漫、萌宠等多题材精选在线壁纸源',
              descEn: 'Curated 4K Bing & multi-category high resolution wallpapers',
              url: 'https://www.yumus.cn/apidoc',
            },
          ].map((api) => (
            <a
              key={api.name}
              href={api.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2.5 rounded-xl border flex flex-col justify-between transition-colors duration-150 group ${
                isDark
                  ? 'border-white/8 bg-white/[0.03] hover:bg-white/[0.05] hover:border-blue-500/40'
                  : 'border-gray-200/80 bg-gray-50/60 hover:bg-white hover:border-blue-400/60 hover:shadow-none'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold group-hover:text-blue-500 transition-colors">
                  {api.name}
                </span>
                <ExternalLink size={11} className="opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="text-[11px] opacity-65 mt-1.5">
                {settings.language === 'zh' ? api.descZh : api.descEn}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  const wrapTabScroll = (content: React.ReactNode) => (
    <div
      style={{
        maxHeight: 'calc(68vh - 60px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingRight: '6px',
        overscrollBehavior: 'contain',
      }}
      className="custom-scrollbar"
    >
      {content}
    </div>
  );

  const tabItems = [
    {
      key: 'wallpaper',
      label: (
        <span className="flex items-center gap-1.5">
          <PictureOutlined />
          {t.wallpaper}
        </span>
      ),
      children: wrapTabScroll(wallpaperTabContent),
    },
    {
      key: 'appearance',
      label: (
        <span className="flex items-center gap-1.5">
          <BgColorsOutlined />
          {t.appearance}
        </span>
      ),
      children: wrapTabScroll(appearanceTabContent),
    },
    {
      key: 'general',
      label: (
        <span className="flex items-center gap-1.5">
          <SettingOutlined />
          {t.general}
        </span>
      ),
      children: wrapTabScroll(generalTabContent),
    },
    {
      key: 'about',
      label: (
        <span className="flex items-center gap-1.5">
          <InfoCircleOutlined />
          {t.about}
        </span>
      ),
      children: wrapTabScroll(aboutTabContent),
    },
  ];

  return (
    <Modal
      open={open}
      title={t.settings}
      onCancel={onClose}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          {t.close}
        </Button>,
      ]}
      width={640}
      style={{ top: 50 }}
      destroyOnClose={true}
      className={`custom-settings-modal ${isDark ? 'dark' : ''}`}
      wrapClassName={`custom-settings-wrap ${isDark ? 'dark' : ''}`}
      styles={{
        mask: {
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
        },
        body: {
          paddingTop: '2px',
          paddingBottom: '2px',
        },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
      />
    </Modal>
  );
};
