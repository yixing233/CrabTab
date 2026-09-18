import React from 'react';
import { ThemeConfig, theme } from 'antd';
import type { ThemeMode } from './types';

/**
 * 解析实际生效的暗色状态（唯一来源）。
 *
 * 不能只判断 `theme === 'dark'`：`auto` 时页面根节点由 App 依系统偏好打上 `dark`
 * class，若某组件仍按 `theme === 'auto'` 走浅色分支，就会在暗色页面上渲染出亮色，
 * 与紧邻的组件割裂。此前主屏中央舞台正栽在这里 —— 共用工具条按真实生效值取暗色、
 * 正下方的快捷方式网格按字面值取浅色，auto + 系统暗色下工具条与图标分属两套配色，
 * 而「最近访问」态却解析正确，于是三态切换中枢忽明忽暗。
 */
export function resolveIsDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'auto' && systemPrefersDark);
}

/**
 * 订阅系统深色偏好的生效值。
 *
 * 订阅（而非渲染时一次性 `matchMedia().matches`）是必须的：用户在系统里切换
 * 深浅色时，页面根节点的 dark class 会随之变化，组件若只读一次就会停留在旧配色，
 * 直到下次因其它状态重渲染才回正。
 */
export function useResolvedIsDark(mode: ThemeMode): boolean {
  const [systemDark, setSystemDark] = React.useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return resolveIsDark(mode, systemDark);
}

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
