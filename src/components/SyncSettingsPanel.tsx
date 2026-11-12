import React, { useCallback, useEffect, useState } from 'react';
import {
  IconCloud,
  IconCloudDown,
  IconCloudUp,
  IconReload,
} from '@tabler/icons-react';
import { Alert, Button, Input, Switch, Typography, Space } from 'antd';
import { Language, ThemeMode } from '../types';
import { i18n } from '../i18n';
import {
  WebDavConfig,
  SyncMeta,
  DEFAULT_WEBDAV_CONFIG,
  loadWebDavConfig,
  saveWebDavConfig,
  loadSyncMeta,
  runSync,
  testConnection,
  ensureHostPermission,
} from '../utils/webdavSync';

const { Text } = Typography;

export interface SyncSettingsPanelProps {
  language: Language;
  theme: ThemeMode;
  /** 同步成功后通知上层刷新数据 */
  onApplied?: () => void;
}

/** 把内部错误码翻成人话，避免把 'unauthorized' 直接甩给用户 */
// 只依赖真正用到的键：i18n[language] 是 zh/en 的联合类型，
// 直接标注完整类型会因两套文案结构被推断成不可赋值。
type SyncI18n = Pick<
  typeof i18n['zh'],
  'syncNeedUrl' | 'syncNoRemote' | 'syncPermDenied'
>;
function humanizeError(code: string, t: SyncI18n): string {
  switch (code) {
    case 'unauthorized':
    case 'forbidden':
      return '认证失败，请检查用户名与密码（部分服务需使用应用专用密码）';
    case 'timeout':
      return '连接超时，请检查服务器地址与网络';
    case 'url required':
      return t.syncNeedUrl;
    case 'no remote data':
      return t.syncNoRemote;
    case 'permission required':
      return t.syncPermDenied;
    case 'storage degraded':
      return '本机存储当前不可读，为避免覆盖真实数据已跳过同步';
    default:
      return code;
  }
}

export const SyncSettingsPanel: React.FC<SyncSettingsPanelProps> = ({
  language,
  theme,
  onApplied,
}) => {
  const t = i18n[language];
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const [config, setConfig] = useState<WebDavConfig>({ ...DEFAULT_WEBDAV_CONFIG });
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [busy, setBusy] = useState<'' | 'test' | 'upload' | 'download' | 'sync'>('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  // 载入已保存的配置
  useEffect(() => {
    void (async () => {
      const [cfg, m] = await Promise.all([loadWebDavConfig(), loadSyncMeta()]);
      setConfig(cfg);
      setMeta(m);
    })();
  }, []);

  /** 修改后立即持久化（凭据只存本机） */
  const patch = useCallback(async (next: Partial<WebDavConfig>) => {
    const merged = { ...config, ...next };
    setConfig(merged);
    await saveWebDavConfig(merged);
  }, [config]);

  const refreshMeta = useCallback(async () => {
    setMeta(await loadSyncMeta());
  }, []);

  const handleTest = useCallback(async () => {
    if (!config.url.trim()) {
      setStatus({ kind: 'err', text: t.syncNeedUrl });
      return;
    }
    setBusy('test');
    setStatus({ kind: 'info', text: t.syncTesting });
    try {
      // 必须由用户手势触发权限申请
      const granted = await ensureHostPermission(config.url);
      if (!granted) {
        setStatus({ kind: 'err', text: t.syncPermDenied });
        return;
      }
      const res = await testConnection(config);
      if (res.ok) {
        setStatus({ kind: 'ok', text: t.syncTestOk });
      } else {
        setStatus({ kind: 'err', text: t.syncTestFail.replace('{msg}', humanizeError(res.error, t)) });
      }
    } finally {
      setBusy('');
      await refreshMeta();
    }
  }, [config, t, refreshMeta]);

  const doSync = useCallback(
    async (direction: 'upload' | 'download' | 'auto') => {
      if (!config.url.trim()) {
        setStatus({ kind: 'err', text: t.syncNeedUrl });
        return;
      }
      setBusy(direction === 'auto' ? 'sync' : direction);
      try {
        const granted = await ensureHostPermission(config.url);
        if (!granted) {
          setStatus({ kind: 'err', text: t.syncPermDenied });
          return;
        }
        const label = direction === 'upload' ? t.syncUploadOk : direction === 'download' ? t.syncDownloadOk : '';
        const res = await runSync({ direction });
        if (!res.ok) {
          setStatus({ kind: 'err', text: t.syncFailed.replace('{msg}', humanizeError(res.error, t)) });
          return;
        }
        // 自动模式的文案按实际动作给出
        const autoText =
          res.action === 'uploaded' ? t.syncActionUploaded
          : res.action === 'downloaded' ? t.syncActionDownloaded
          : t.syncActionIdentical;
        setStatus({ kind: 'ok', text: label || autoText });

        // 下载/拉取后需要让上层重新读取数据
        if (res.action === 'downloaded') {
          onApplied?.();
        }
      } finally {
        setBusy('');
        await refreshMeta();
      }
    },
    [config, t, refreshMeta, onApplied]
  );

  const labelClass = `text-[12px] font-medium mb-1 block ${isDark ? 'text-white/70' : 'text-gray-600'}`;
  const hintClass = `text-[11px] mt-1 ${isDark ? 'text-white/45' : 'text-gray-500'}`;

  const lastSyncText = meta?.lastSyncAt
    ? new Date(meta.lastSyncAt).toLocaleString()
    : t.syncNeverSynced;

  return (
    <div className="flex flex-col gap-4">
      {/* 启用开关 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Text strong className="text-[13px]">{t.syncEnable}</Text>
          <div className={hintClass}>{t.syncEnableDesc}</div>
        </div>
        <Switch
          checked={config.enabled}
          onChange={(checked) => void patch({ enabled: checked })}
        />
      </div>

      {/* 配置表单 */}
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelClass}>{t.syncServerUrl}</label>
          <Input
            size="small"
            value={config.url}
            placeholder={t.syncServerUrlPlaceholder}
            spellCheck={false}
            onChange={(e) => setConfig({ ...config, url: e.target.value })}
            onBlur={(e) => void patch({ url: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t.syncUsername}</label>
            <Input
              size="small"
              value={config.username}
              autoComplete="off"
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              onBlur={(e) => void patch({ username: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>{t.syncPassword}</label>
            <Input.Password
              size="small"
              value={config.password}
              autoComplete="new-password"
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              onBlur={(e) => void patch({ password: e.target.value })}
            />
          </div>
        </div>
        <div className={hintClass}>{t.syncPasswordHint}</div>

        <div>
          <label className={labelClass}>{t.syncPath}</label>
          <Input
            size="small"
            value={config.path}
            placeholder={t.syncPathPlaceholder}
            spellCheck={false}
            onChange={(e) => setConfig({ ...config, path: e.target.value })}
            onBlur={(e) => void patch({ path: e.target.value })}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <Space wrap>
        <Button
          size="small"
          icon={<IconReload size={14} />}
          loading={busy === 'test'}
          onClick={() => void handleTest()}
        >
          {t.syncTest}
        </Button>
        <Button
          size="small"
          icon={<IconCloudUp size={14} />}
          loading={busy === 'upload'}
          onClick={() => void doSync('upload')}
        >
          {t.syncUpload}
        </Button>
        <Button
          size="small"
          icon={<IconCloudDown size={14} />}
          loading={busy === 'download'}
          onClick={() => void doSync('download')}
        >
          {t.syncDownload}
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<IconCloud size={14} />}
          loading={busy === 'sync'}
          onClick={() => void doSync('auto')}
        >
          {t.syncNow}
        </Button>
      </Space>

      {/* 结果提示 */}
      {status && (
        <Alert
          type={status.kind === 'ok' ? 'success' : status.kind === 'err' ? 'error' : 'info'}
          showIcon
          className="!py-1.5 !text-[11px]"
          message={<span className="text-[11px]">{status.text}</span>}
          closable
          onClose={() => setStatus(null)}
        />
      )}

      {/* 同步状态 */}
      <div className={`text-[11px] flex flex-col gap-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
        <span>{t.syncLastSync}：{lastSyncText}</span>
        {meta?.lastAction && (
          <span>
            {meta.lastAction === 'uploaded' ? t.syncActionUploaded : t.syncActionDownloaded}
          </span>
        )}
        {meta?.lastError && (
          <span className="text-amber-500">
            {t.syncFailed.replace('{msg}', humanizeError(meta.lastError, t))}
          </span>
        )}
        <span className="mt-1 opacity-80">{t.syncConflictNote}</span>
      </div>
    </div>
  );
};
