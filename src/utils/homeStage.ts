import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { getUiScale } from './viewport';

/**
 * 主屏中央「舞台」的宽度基准。
 *
 * 快捷方式与最近访问共用同一块中央区域（同一时刻只有其一渲染），因此两者的
 * 宽度必须同源。此前各自为政：快捷方式把 `--shortcut-area-width` 锁定为搜索框
 * 实测宽度，最近访问却用独立的 `max-w-5xl xl:max-w-6xl 2xl:max-w-7xl`
 * （1874px 窗口下可达 1280px）。切换状态时中央区域的左右边界相差近 600px，
 * 视觉重心整体错位，读起来像两个不相干的页面。
 *
 * 现在收敛为唯一入口：**舞台宽度 = 搜索框宽度**。搜索框是全局的视觉基准，
 * 快捷方式网格与工具栏两端此前已对齐它（见 index.css 中 .shortcut-area 注释），
 * 最近访问同样对齐即可让整个中央区域读作同一列。
 *
 * 坐标系：全局界面缩放挂在 <html> 的 CSS `zoom` 上，`getBoundingClientRect()`
 * 返回「设备空间」像素。参与 CSS 变量与网格推导前必须除以缩放倍数，否则每轮
 * 测量都会在上一次结果上继续放大（棘轮效应）。
 */
export const HOME_STAGE_SEARCHBOX_SELECTOR = '.searchbox-slot-responsive form';

/** 读取舞台宽度（布局空间 px）；搜索框尚未挂载时依次回退到宿主容器与视口宽度 */
export function measureHomeStageWidth(fallback?: HTMLElement | null): number {
  if (typeof window === 'undefined') return 0;
  const scale = getUiScale();

  const searchBox = document.querySelector(HOME_STAGE_SEARCHBOX_SELECTOR);
  const searchBoxRect = searchBox?.getBoundingClientRect();
  if (searchBoxRect && searchBoxRect.width > 0) return searchBoxRect.width / scale;

  const fallbackRect = fallback?.getBoundingClientRect();
  if (fallbackRect && fallbackRect.width > 0) return fallbackRect.width / scale;

  return window.innerWidth / scale;
}

/**
 * 订阅舞台宽度。
 *
 * 用 ResizeObserver 而不是只监听 window.resize：uiScale 变化、书签栏显隐、
 * 抽屉开合都会改变可用宽度，这些都不必然触发 window.resize。
 *
 * `enabled` 用于「宿主组件首帧尚未渲染搜索框」的场景（如 App 在配置水合完成前
 * 返回 null）：此时测量无效，必须等挂载后再跑一次，否则会一直停留在回退宽度。
 *
 * `measured` 表示已完成首次有效测量。消费方在测量完成前不应依据宽度固化任何
 * 持久化数据（例如快捷方式的网格坐标），否则会把粗估值写进用户配置。
 */
export function useHomeStageWidth(
  hostRef: RefObject<HTMLElement | null>,
  enabled = true
): { width: number; measured: boolean } {
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const apply = () => {
      const next = measureHomeStageWidth(hostRef.current);
      if (!Number.isFinite(next) || next <= 0) return;
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
      setMeasured(true);
    };

    apply();

    const ro = new ResizeObserver(apply);
    // 观察搜索框与宿主容器：任一尺寸变化（含缩放档位切换）都要重新测量。
    // 宿主仅在「搜索框缺失」时观察：宿主自身的宽度正是由本测量结果驱动的，
    // 同时观察两者会形成「测量 → 改宽度 → 再测量」的自激循环。
    const searchBox = document.querySelector(HOME_STAGE_SEARCHBOX_SELECTOR);
    if (searchBox) {
      ro.observe(searchBox);
    } else if (hostRef.current) {
      ro.observe(hostRef.current);
    }
    window.addEventListener('resize', apply);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, [hostRef, enabled]);

  return { width, measured };
}
