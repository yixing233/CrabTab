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
        colorBgLayout: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f0f2f5',
        colorBgElevated: isDark ? '#303846' : '#ffffff',
        colorText: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)',
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
