import React, { useState } from 'react';
import { Modal, Form, Input, Tooltip, message, Popconfirm } from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  GlobalOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { SiteShortcut, Language } from '../types';
import { i18n } from '../i18n';
import { getFaviconCandidates, getPrimaryFaviconUrl } from '../utils/favicon';

/**
 * 支持多级 CDN 与源站探测降级加载的快捷图标组件
 */
const ShortcutIconView: React.FC<{ url: string; icon?: string; title: string }> = ({ url, icon, title }) => {
  const candidates = React.useMemo(() => getFaviconCandidates(url, icon), [url, icon]);
  const [candidateIndex, setCandidateIndex] = useState<number>(0);
  const [hasError, setHasError] = useState<boolean>(false);

  // 当外部 url 或 icon 变更时重置探测状态
  React.useEffect(() => {
    setCandidateIndex(0);
    setHasError(false);
  }, [url, icon]);

  const currentSrc = candidates[candidateIndex];

  const handleImageError = () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex(candidateIndex + 1);
    } else {
      setHasError(true);
    }
  };

  if (!currentSrc || hasError) {
    return (
      <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-base select-none">
        {title ? title.trim().charAt(0).toUpperCase() : '★'}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={title}
      loading="eager"
      decoding="async"
      className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg transition-opacity duration-200"
      onError={handleImageError}
    />
  );
};

interface ShortcutsProps {
  shortcuts: SiteShortcut[];
  language: Language;
  openInNewTab: boolean;
  theme: 'dark' | 'light' | 'auto';
  glassStyle: {
    blur: number;
    opacity: number;
    borderOpacity: number;
  };
  onAddShortcut: (shortcut: SiteShortcut) => void;
  onEditShortcut: (shortcut: SiteShortcut) => void;
  onDeleteShortcut: (id: string) => void;
}

export const Shortcuts: React.FC<ShortcutsProps> = ({
  shortcuts,
  language,
  openInNewTab,
  theme,
  glassStyle,
  onAddShortcut,
  onEditShortcut,
  onDeleteShortcut,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<SiteShortcut | null>(null);
  const [form] = Form.useForm();
  const t = i18n[language];
  const isDark = theme === 'dark';

  const handleOpenAdd = () => {
    setEditingShortcut(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleOpenEdit = (item: SiteShortcut) => {
    setEditingShortcut(item);
    form.setFieldsValue({
      title: item.title,
      url: item.url,
      icon: item.icon,
    });
    setModalOpen(true);
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      let formattedUrl = values.url.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }

      let favicon = values.icon?.trim();
      if (!favicon) {
        favicon = getPrimaryFaviconUrl(formattedUrl);
      }

      if (editingShortcut) {
        onEditShortcut({
          ...editingShortcut,
          title: values.title.trim(),
          url: formattedUrl,
          icon: favicon,
        });
        message.success(language === 'zh' ? '快捷方式已更新' : 'Shortcut updated');
      } else {
        const newShortcut: SiteShortcut = {
          id: String(Date.now()),
          title: values.title.trim(),
          url: formattedUrl,
          icon: favicon,
        };
        onAddShortcut(newShortcut);
        message.success(language === 'zh' ? '添加快捷方式成功' : 'Shortcut added');
      }
      setModalOpen(false);
      form.resetFields();
    } catch {
      // Form validation failure
    }
  };

  const handleLinkClick = (url: string) => {
    if (openInNewTab) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 min-h-[96px]">
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5">
        {shortcuts.map((item) => {
          return (
            <div
              key={item.id}
              className="group relative flex flex-col items-center w-18 sm:w-20 cursor-pointer select-none"
              onClick={() => handleLinkClick(item.url)}
            >
              {/* Icon Container */}
              <div
                className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 overflow-hidden border ${
                  isDark
                    ? 'border-white/16 group-hover:border-white/60 group-hover:bg-white/10 group-active:bg-white/15'
                    : 'border-white/75 group-hover:border-white group-hover:bg-white/80 group-active:bg-white/90'
                }`}
                style={{
                  backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                  WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
                  backgroundColor: isDark ? 'rgba(18, 22, 30, 0.65)' : 'rgba(255, 255, 255, 0.68)',
                  boxShadow: isDark
                    ? '0 10px 25px -5px rgba(0, 0, 0, 0.4), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)'
                    : '0 10px 25px -5px rgba(0, 0, 0, 0.08), inset 0 1px 1px 0 rgba(255, 255, 255, 0.8)',
                }}
              >
                <ShortcutIconView
                  url={item.url}
                  icon={item.icon}
                  title={item.title}
                />
              </div>

              {/* Title label */}
              <span className="mt-2 text-xs text-white/90 font-medium truncate max-w-full text-center drop-shadow-sm group-hover:text-white transition-colors">
                {item.title}
              </span>

              {/* Action Buttons: Pure Two-Icon Floating Bar (Edit + Delete) on Hover */}
              <div
                className="absolute -top-2.5 -right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/20 shadow-lg scale-90 group-hover:scale-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Edit Pure Icon */}
                <Tooltip title={t.editShortcut} placement="top" arrow={false}>
                  <button
                    type="button"
                    className="w-5 h-5 rounded-full hover:bg-white/20 text-gray-200 hover:text-white flex items-center justify-center text-[11px] cursor-pointer transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(item);
                    }}
                  >
                    <EditOutlined />
                  </button>
                </Tooltip>

                {/* Delete Pure Icon with Popconfirm */}
                <Popconfirm
                  title={language === "zh" ? `确认删除「${item.title}」？` : `Delete "${item.title}"?`}
                  description={language === "zh" ? "删除后该快捷方式将不再显示。" : "This shortcut will be removed."}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    onDeleteShortcut(item.id);
                  }}
                  okText={language === 'zh' ? '删除' : 'Delete'}
                  cancelText={language === 'zh' ? '取消' : 'Cancel'}
                  okButtonProps={{ danger: true, size: 'small' }}
                  cancelButtonProps={{ size: 'small' }}
                  placement="top"
                >
                  <Tooltip title={t.delete} placement="top" arrow={false}>
                    <button
                      type="button"
                      className="w-5 h-5 rounded-full hover:bg-red-500/30 text-gray-200 hover:text-red-400 flex items-center justify-center text-[11px] cursor-pointer transition-all"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DeleteOutlined />
                    </button>
                  </Tooltip>
                </Popconfirm>
              </div>
            </div>
          );
        })}

        {/* Add Shortcut Button */}
        <div
          className="group flex flex-col items-center w-18 sm:w-20 cursor-pointer select-none"
          onClick={handleOpenAdd}
        >
          <div
            className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-200 border-dashed ${
              isDark
                ? 'border-white/30 group-hover:border-white/80 group-hover:bg-white/10 group-active:bg-white/15'
                : 'border-white/65 group-hover:border-white group-hover:bg-white/80 group-active:bg-white/90'
            }`}
            style={{
              backdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
              WebkitBackdropFilter: `blur(${Math.max(glassStyle.blur, 16)}px) saturate(180%)`,
              backgroundColor: isDark ? 'rgba(18, 22, 30, 0.45)' : 'rgba(255, 255, 255, 0.45)',
              borderWidth: 1,
            }}
          >
            <PlusOutlined className="text-xl text-white/80 group-hover:text-white transition-colors" />
          </div>
          <span className="mt-2 text-xs text-white/75 font-medium truncate max-w-full text-center drop-shadow-sm group-hover:text-white transition-colors">
            {t.addShortcut}
          </span>
        </div>
      </div>

      {/* Ant Design Modal for Add/Edit */}
      <Modal
        title={editingShortcut ? t.editShortcut : t.addShortcut}
        open={modalOpen}
        onOk={handleFormSubmit}
        onCancel={() => setModalOpen(false)}
        okText={t.save}
        cancelText={t.cancel}
        width={420}
        centered
        destroyOnClose
        styles={{
          mask: {
            backdropFilter: 'blur(1px)',
            WebkitBackdropFilter: 'blur(1px)',
          },
        }}
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item
            name="title"
            label={t.siteName}
            rules={[{ required: true, message: language === 'zh' ? '请输入站点名称' : 'Please enter site name' }]}
          >
            <Input
              prefix={<GlobalOutlined className="text-gray-400" />}
              placeholder="e.g. GitHub"
              maxLength={20}
            />
          </Form.Item>

          <Form.Item
            name="url"
            label={t.siteUrl}
            rules={[{ required: true, message: language === 'zh' ? '请输入站点链接' : 'Please enter site URL' }]}
          >
            <Input
              prefix={<LinkOutlined className="text-gray-400" />}
              placeholder="https://example.com"
            />
          </Form.Item>

          <Form.Item
            name="icon"
            label={language === 'zh' ? '自定义图标地址 (可选)' : 'Custom Icon URL (Optional)'}
          >
            <Input placeholder="https://example.com/favicon.ico" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
