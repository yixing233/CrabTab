import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Button, Alert } from 'antd';
import { BookmarkNode, Language, ThemeMode } from '../types';
import { i18n } from '../i18n';

export type BookmarkEditorMode = 'new-bookmark' | 'new-folder' | 'edit-bookmark' | 'edit-folder';

export interface BookmarkEditorProps {
  open: boolean;
  mode: BookmarkEditorMode;
  language: Language;
  theme: ThemeMode;
  /** 编辑时传入原节点；新建时为 null */
  target: BookmarkNode | null;
  /** 新建时默认落点父目录标题，仅用于展示 */
  parentTitle?: string;
  onCancel: () => void;
  /** 返回校验后的标题与网址；url 仅书签模式有值 */
  onSubmit: (values: { title: string; url?: string }) => void;
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

/** 与浏览器原生一致的网址补全：省略协议时按 https 处理 */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // "example.com" / "localhost:3000" / "192.168.1.1" 等统一补 https
  if (/^(localhost|[\d.]+)(:\d+)?(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  if (/^[^\s/]+\.[^\s/]+/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export const BookmarkEditor: React.FC<BookmarkEditorProps> = ({
  open,
  mode,
  language,
  theme,
  target,
  parentTitle,
  onCancel,
  onSubmit,
}) => {
  const t = i18n[language];
  const zh = language === 'zh';
  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const isFolderMode = mode === 'new-folder' || mode === 'edit-folder';
  const isEdit = mode === 'edit-bookmark' || mode === 'edit-folder';

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 每次打开时按目标节点重置表单
  useEffect(() => {
    if (!open) return;
    setTitle(target?.title ?? '');
    setUrl(target?.url ?? '');
    setError(null);
  }, [open, target, mode]);

  const dialogTitle = useMemo(() => {
    switch (mode) {
      case 'new-bookmark':
        return t.bmDialogNewBookmark;
      case 'new-folder':
        return t.bmDialogNewFolder;
      case 'edit-bookmark':
        return t.bmDialogEditBookmark;
      default:
        return t.bmDialogEditFolder;
    }
  }, [mode, t]);

  const handleSubmit = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t.bmErrorNameRequired);
      return;
    }
    if (!isFolderMode) {
      const normalized = normalizeUrlInput(url);
      if (!normalized) {
        setError(t.bmErrorUrlRequired);
        return;
      }
      if (!URL_PATTERN.test(normalized)) {
        setError(t.bmErrorUrlInvalid);
        return;
      }
      onSubmit({ title: trimmedTitle, url: normalized });
      return;
    }
    onSubmit({ title: trimmedTitle });
  };

  const labelClass = `text-[12px] font-medium mb-1 block ${isDark ? 'text-white/70' : 'text-gray-600'}`;

  return (
    <Modal
      open={open}
      title={dialogTitle}
      onCancel={onCancel}
      centered
      width={440}
      destroyOnClose
      // antd 默认 Dropdown 的 zIndex = zIndexPopupBase + 50，而 Modal 只有
      // zIndexPopupBase —— 书签下拉卡片会盖在弹窗之上。这里把弹窗抬到更高一层，
      // 保证「右键 → 修改」时对话框始终浮在下拉卡片之上。
      zIndex={2000}
      className="crab-bookmark-editor-modal"
      footer={[
        <Button key="cancel" onClick={onCancel} size="small">
          {t.bmCancel}
        </Button>,
        <Button key="save" type="primary" onClick={handleSubmit} size="small">
          {t.bmSave}
        </Button>,
      ]}
    >
      <div className="flex flex-col gap-3 pt-1">
        {isEdit && parentTitle && (
          <div className={`text-[11px] ${isDark ? 'text-white/45' : 'text-gray-500'}`}>
            {t.bmFieldParent}：{parentTitle}
          </div>
        )}

        <div>
          <label className={labelClass}>{t.bmFieldName}</label>
          <Input
            autoFocus
            size="small"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            onPressEnter={handleSubmit}
            placeholder={t.bmFieldNamePlaceholder}
            maxLength={200}
          />
        </div>

        {!isFolderMode && (
          <div>
            <label className={labelClass}>{t.bmFieldUrl}</label>
            <Input
              size="small"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onPressEnter={handleSubmit}
              placeholder={t.bmFieldUrlPlaceholder}
              spellCheck={false}
            />
          </div>
        )}

        {error && (
          <Alert type="error" showIcon banner message={error} className="!py-1.5 !text-[11px]" />
        )}

        {!isFolderMode && !error && (
          <div className={`text-[10px] leading-relaxed ${isDark ? 'text-white/35' : 'text-gray-400'}`}>
            {zh
              ? '保存后立即写入浏览器书签库，与浏览器自带书签管理器同步。'
              : 'Saved straight to your browser bookmarks — stays in sync with the native manager.'}
          </div>
        )}
      </div>
    </Modal>
  );
};
