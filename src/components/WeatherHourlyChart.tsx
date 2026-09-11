import React, { useRef, useState } from 'react';
import { WeatherHourlyForecast } from '../utils/weather';
import { Language } from '../types';

interface WeatherHourlyChartProps {
  data: WeatherHourlyForecast[];
  isDark: boolean;
  language: Language;
}

// 辅助函数：根据 AQI 返回颜色
function getAqiColor(aqi: number): { text: string; bg: string; border: string; stroke: string } {
  if (aqi <= 50) {
    return {
      text: '#10b981', // 优 绿
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.25)',
      stroke: '#10b981',
    };
  }
  if (aqi <= 100) {
    return {
      text: '#f59e0b', // 良 黄
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
      stroke: '#f59e0b',
    };
  }
  if (aqi <= 150) {
    return {
      text: '#f97316', // 轻度 橙
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.25)',
      stroke: '#f97316',
    };
  }
  return {
    text: '#ef4444', // 中度/重度 红
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.25)',
    stroke: '#ef4444',
  };
}

// 平滑贝塞尔曲线路径生成器
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export const WeatherHourlyChart: React.FC<WeatherHourlyChartProps> = ({
  data,
  isDark,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || dragRef.current.pointerId !== -1) return;
    const container = containerRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    container.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId || !containerRef.current) return;
    const distance = event.clientX - dragRef.current.startX;
    if (!isDragging && Math.abs(distance) > 3) setIsDragging(true);
    containerRef.current.scrollLeft = dragRef.current.startScrollLeft - distance;
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current.pointerId = -1;
    setIsDragging(false);
  };

  if (!data || data.length === 0) return null;

  const itemWidth = 58;
  const paddingX = 28;
  const totalWidth = paddingX * 2 + (data.length - 1) * itemWidth;

  // 图表总高度与纵向分层
  // SVG 高度 145px
  // 上层：温度折线 (Y 范围 28px ~ 68px)
  // 下层：空气质量折线 (Y 范围 88px ~ 124px)
  const svgHeight = 145;

  const temps = data.map((d) => d.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempSpan = Math.max(maxTemp - minTemp, 2);

  const hasAqi = data.some((d) => d.aqi !== undefined);
  const validAqis = data.filter((d) => d.aqi !== undefined).map((d) => d.aqi as number);
  const minAqi = validAqis.length > 0 ? Math.min(...validAqis) : 0;
  const maxAqi = validAqis.length > 0 ? Math.max(...validAqis) : 100;
  const aqiSpan = Math.max(maxAqi - minAqi, 10);

  // 计算每个数据点的坐标
  const points = data.map((item, idx) => {
    const x = paddingX + idx * itemWidth;

    // 温度 Y 坐标映射到 [28, 68] (数值越大越靠上)
    const tempRatio = (item.temp - minTemp) / tempSpan;
    const tempY = 68 - tempRatio * 38;

    // AQI Y 坐标映射到 [88, 122]
    const itemAqi = item.aqi ?? minAqi;
    const aqiRatio = (itemAqi - minAqi) / aqiSpan;
    const aqiY = 122 - aqiRatio * 32;

    return {
      x,
      tempY,
      aqiY,
      item,
      idx,
    };
  });

  const tempLinePath = buildSmoothPath(points.map((p) => ({ x: p.x, y: p.tempY })));
  const aqiLinePath = hasAqi ? buildSmoothPath(points.map((p) => ({ x: p.x, y: p.aqiY }))) : '';

  // 面积阴影区域闭合路径
  const tempAreaPath = points.length > 0
    ? `${tempLinePath} L ${points[points.length - 1].x} 75 L ${points[0].x} 75 Z`
    : '';

  return (
    <div className="w-full">
      {/* 滚动容器 */}
      <div
        ref={containerRef}
        className={`weather-chart-drag w-full overflow-x-auto select-none custom-scrollbar pb-1 ${
          isDragging ? 'is-dragging' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onDragStart={(event) => event.preventDefault()}
      >
        <div
          className="relative"
          style={{ width: `${totalWidth}px`, height: `${svgHeight + 24}px` }}
        >
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            width={totalWidth}
            height={svgHeight}
          >
            <defs>
              {/* 温度曲线微光渐变 */}
              <linearGradient id="hourlyTempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={isDark ? "0.26" : "0.2"} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* 辅助水平网格弱虚线 */}
            <line
              x1={paddingX - 10}
              y1={76}
              x2={totalWidth - paddingX + 10}
              y2={76}
              stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
              strokeDasharray="2 3"
            />

            {/* 温度面积底色 */}
            <path d={tempAreaPath} fill="url(#hourlyTempGrad)" />

            {/* 温度曲线 */}
            <path
              d={tempLinePath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* AQI 曲线 */}
            {hasAqi && (
              <path
                d={aqiLinePath}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 3"
                opacity={0.85}
              />
            )}

            {/* 点位与数字标注 */}
            {points.map((p) => {
              const isHovered = hoveredIdx === p.idx;
              const aqiStyle = p.item.aqi !== undefined ? getAqiColor(p.item.aqi) : null;

              return (
                <g key={p.idx}>
                  {/* 悬停竖向参考线 */}
                  {isHovered && (
                    <line
                      x1={p.x}
                      y1={12}
                      x2={p.x}
                      y2={135}
                      stroke={isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)'}
                      strokeDasharray="2 2"
                    />
                  )}

                  {/* 温度数值 */}
                  <text
                    x={p.x}
                    y={p.tempY - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={isDark ? '#ffffff' : '#1f2937'}
                  >
                    {p.item.temp}°
                  </text>

                  {/* 温度点圆环 */}
                  <circle
                    cx={p.x}
                    cy={p.tempY}
                    r={isHovered ? 4.5 : 3}
                    fill="#f59e0b"
                    stroke={isDark ? '#1e1e24' : '#ffffff'}
                    strokeWidth="1.5"
                  />

                  {/* AQI 数值与点位 */}
                  {p.item.aqi !== undefined && aqiStyle && (
                    <>
                      {/* AQI 点 */}
                      <circle
                        cx={p.x}
                        cy={p.aqiY}
                        r={isHovered ? 3.8 : 2.5}
                        fill={aqiStyle.stroke}
                        stroke={isDark ? '#1e1e24' : '#ffffff'}
                        strokeWidth="1.2"
                      />

                      {/* AQI 标签背景药丸 */}
                      <rect
                        x={p.x - 12}
                        y={p.aqiY + 5}
                        width="24"
                        height="14"
                        rx="4"
                        fill={aqiStyle.bg}
                        stroke={aqiStyle.border}
                        strokeWidth="0.8"
                      />
                      <text
                        x={p.x}
                        y={p.aqiY + 15}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        fill={aqiStyle.text}
                      >
                        {p.item.aqi}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* 交互触发区域与横轴时间标签 */}
          <div className="absolute inset-0 flex">
            {points.map((p) => (
              <div
                key={p.idx}
                className="relative flex flex-col justify-end items-center cursor-pointer group"
                style={{
                  width: `${itemWidth}px`,
                  left: `${p.x - itemWidth / 2}px`,
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                }}
                onMouseEnter={() => setHoveredIdx(p.idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* 底部横轴时间 */}
                <div className="pb-0.5 text-center">
                  <span
                    className={`text-[10px] font-medium transition-colors ${
                      hoveredIdx === p.idx
                        ? isDark ? 'text-white font-semibold' : 'text-neutral-900 font-semibold'
                        : isDark ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                  >
                    {p.item.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
