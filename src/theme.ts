import { ThemeConfig, theme } from 'antd';

export function getAntdTheme(mode: 'dark' | 'light' | 'auto'): ThemeConfig {
  const isDark = mode === 'dark';

  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff', // 经典 Ant Design 蓝
      borderRadius: 8,
      colorBgMask: 'rgba(0, 0, 0, 0)', // 遮罩不透明度改为 0
      fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
      ...(isDark
        ? {
            colorText: 'rgba(255, 255, 255, 0.88)',
            colorTextSecondary: 'rgba(255, 255, 255, 0.55)',
            colorTextHeading: '#ffffff',
            colorBgElevated: '#1f1f1f',
            colorBorderSecondary: 'rgba(255, 255, 255, 0.09)',
          }
        : {
            colorText: 'rgba(0, 0, 0, 0.88)',
            colorTextSecondary: 'rgba(0, 0, 0, 0.55)',
            colorTextHeading: 'rgba(0, 0, 0, 0.88)',
          }),
    },
    components: {
      Dropdown: {
        colorBgElevated: isDark ? '#1a1d24' : '#ffffff',
      },
      Popover: {
        colorBgElevated: isDark ? '#1a1d24' : '#ffffff',
      },
      Modal: {
        headerBg: isDark ? '#1a1d24' : '#ffffff',
        contentBg: isDark ? '#1a1d24' : '#ffffff',
      },
      Tabs: {
        colorBgContainer: isDark ? '#1a1d24' : '#ffffff',
      },
      Segmented: {
        colorBgLayout: isDark ? 'rgba(0, 0, 0, 0.28)' : '#f0f2f5',
        colorBgElevated: isDark ? '#3b4454' : '#ffffff',
        itemSelectedBg: isDark ? '#3b4454' : '#ffffff',
        itemActiveBg: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
        itemHoverColor: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.88)',
        colorText: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.65)',
        itemSelectedColor: isDark ? '#ffffff' : '#1677ff',
      },
      Drawer: {
        colorBgElevated: isDark ? '#1a1d24' : '#ffffff',
      },
      Divider: {
        colorSplit: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      },
    },
  };
}
