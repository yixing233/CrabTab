import React, { useRef, useState } from 'react';
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
} from 'lucide-react';
import { WeatherDailyForecast } from '../utils/weather';
import { Language } from '../types';

interface WeatherDailyChartProps {
  forecast: WeatherDailyForecast[];
  isDark: boolean;
  language: Language;
}

// 对应 weather condition 的图标获取
function getConditionIcon(weatherDesc: string = '', conditionCode?: number, className = 'w-4 h-4') {
  const desc = weatherDesc.toLowerCase();
  // 优先依据描述判断，避免不同数据源对 1/2 编码的含义不一致。
  if (desc.includes('雷') || desc.includes('thunder')) return <CloudLightning className={`${className} text-amber-500`} />;
  if (desc.includes('雪') || desc.includes('snow')) return <CloudSnow className={`${className} text-indigo-300`} />;
  if (desc.includes('雨') || desc.includes('rain') || desc.includes('shower')) return <CloudRain className={`${className} text-sky-400`} />;
  if (desc.includes('雾') || desc.includes('霾') || desc.includes('fog')) return <CloudFog className={`${className} text-neutral-400`} />;
  if (desc.includes('晴间多云') || desc.includes('多云') || desc.includes('partly cloud') || desc.includes('mainly clear')) {
    return <CloudSun className={`${className} text-amber-300`} />;
  }
  if (desc.includes('阴') || desc.includes('overcast') || desc.includes('cloudy')) {
    return <Cloud className={`${className} text-neutral-400`} />;
  }
  if (conditionCode !== undefined) {
    if (conditionCode === 0) return <Sun className={`${className} text-amber-400`} />;
    if (conditionCode === 1 || conditionCode === 2) return <CloudSun className={`${className} text-amber-300`} />;
    if (conditionCode === 3) return <Cloud className={`${className} text-neutral-400`} />;
    if (conditionCode >= 45 && conditionCode <= 48) return <CloudFog className={`${className} text-neutral-400`} />;
    if (conditionCode >= 51 && conditionCode <= 67) return <CloudRain className={`${className} text-sky-400`} />;
    if (conditionCode >= 71 && conditionCode <= 77) return <CloudSnow className={`${className} text-indigo-300`} />;
    if (conditionCode >= 80 && conditionCode <= 82) return <CloudRain className={`${className} text-blue-400`} />;
    if (conditionCode >= 85 && conditionCode <= 86) return <CloudSnow className={`${className} text-indigo-300`} />;
    if (conditionCode >= 95) return <CloudLightning className={`${className} text-amber-500`} />;
  }
  return <Sun className={`${className} text-amber-400`} />;
}

// 从 tempRange 解析出高低温度数字（例如 "25℃~15℃" 或 "25°/15°"）
function parseTempNumbers(item: WeatherDailyForecast): { high: number; low: number } {
  if (item.maxTemp !== undefined && item.minTemp !== undefined) {
    return { high: item.maxTemp, low: item.minTemp };
  }
  const matches = item.tempRange.match(/-?\d+/g);
  if (matches && matches.length >= 2) {
    const num1 = parseInt(matches[0], 10);
    const num2 = parseInt(matches[1], 10);
    return {
      high: Math.max(num1, num2),
      low: Math.min(num1, num2),
    };
  }
  if (matches && matches.length === 1) {
    const num = parseInt(matches[0], 10);
    return { high: num, low: num - 5 };
  }
  return { high: 20, low: 12 };
}

// 平滑贝塞尔曲线生成
function createSmoothCurve(points: { x: number; y: number }[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

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

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return path;
}

export const WeatherDailyChart: React.FC<WeatherDailyChartProps> = ({
  forecast,
  isDark,
  language: _language,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startScrollLeft: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || dragRef.current.pointerId !== -1) return;
    const container = scrollRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: container.scrollLeft,
    };
    container.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId || !scrollRef.current) return;
    const distance = event.clientX - dragRef.current.startX;
    if (!isDragging && Math.abs(distance) > 3) setIsDragging(true);
    scrollRef.current.scrollLeft = dragRef.current.startScrollLeft - distance;
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current.pointerId = -1;
    setIsDragging(false);
  };

  if (!forecast || forecast.length === 0) {
    return null;
  }

  const items = forecast.map((f) => ({
    ...f,
    ...parseTempNumbers(f),
  }));

  // 计算多日全局最大/最小温，用于纵向归一化坐标计算
  const allHighs = items.map((i) => i.high);
  const allLows = items.map((i) => i.low);
  const maxHigh = Math.max(...allHighs);
  const minLow = Math.min(...allLows);
  const tempRangeSpan = Math.max(maxHigh - minLow, 6);

  // 图表几何规格
  const colWidth = 64; // 每个日期的列宽
  const totalWidth = items.length * colWidth;
  const svgHeight = 110;
  const topPadding = 20;
  const bottomPadding = 20;
  const availableChartHeight = svgHeight - topPadding - bottomPadding;

  // 将温度映射到 SVG Y 坐标
  const getY = (val: number) => {
    const ratio = (val - minLow) / tempRangeSpan;
    return topPadding + (1 - ratio) * availableChartHeight;
  };

  const highPoints = items.map((item, i) => ({
    x: i * colWidth + colWidth / 2,
    y: getY(item.high),
    val: item.high,
  }));

  const lowPoints = items.map((item, i) => ({
    x: i * colWidth + colWidth / 2,
    y: getY(item.low),
    val: item.low,
  }));

  const highCurvePath = createSmoothCurve(highPoints);
  const lowCurvePath = createSmoothCurve(lowPoints);

  // 检查是否有任何一天有非零降水概率
  const hasAnyPrecipitation = items.some(
    (item) => item.precipitation && item.precipitation !== '0%' && item.precipitation !== '--'
  );

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        className={`weather-chart-drag overflow-x-auto custom-scrollbar pb-1.5 -mx-1 px-1 ${
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
          className="relative select-none"
          style={{ width: `${Math.max(totalWidth, 340)}px` }}
        >
          {/* 1. 顶部日期与天气状况 */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, ${colWidth}px)` }}>
            {items.map((item, idx) => {
              const isHovered = hoverIndex === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                  className={`flex flex-col items-center py-1 rounded-xl transition-colors cursor-pointer ${
                    isHovered
                      ? isDark
                        ? 'bg-white/10'
                        : 'bg-black/5'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`text-[12px] font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>
                    {item.dayText}
                  </span>
                  {item.dateText && (
                    <span className="text-[10px] text-neutral-400 mt-0.5">
                      {item.dateText}
                    </span>
                  )}
                  <div className="my-1.5 flex items-center justify-center">
                    {getConditionIcon(item.weather, item.conditionCode, 'w-5 h-5')}
                  </div>
                  <span className="text-[10.5px] text-neutral-400 text-center truncate max-w-[56px]" title={item.weather}>
                    {item.weather}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 2. 中间高低温度平滑曲线图 */}
          <div className="relative my-1" style={{ height: `${svgHeight}px` }}>
            <svg
              width={totalWidth}
              height={svgHeight}
              className="overflow-visible pointer-events-none"
            >
              <defs>
                {/* 最高温渐变 */}
                <linearGradient id="highTempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>
                {/* 最低温渐变 */}
                <linearGradient id="lowTempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* 纵向参考辅助线与列高亮 */}
              {items.map((_, idx) => {
                const cx = idx * colWidth + colWidth / 2;
                const isHovered = hoverIndex === idx;
                return (
                  <g key={idx}>
                    <line
                      x1={cx}
                      y1={8}
                      x2={cx}
                      y2={svgHeight - 8}
                      stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'}
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    {isHovered && (
                      <line
                        x1={cx}
                        y1={0}
                        x2={cx}
                        y2={svgHeight}
                        stroke="#2f7cf6"
                        strokeWidth="1.5"
                        strokeDasharray="3,3"
                        opacity="0.8"
                      />
                    )}
                  </g>
                );
              })}

              {/* 最高温曲线填充阴影与线条 */}
              <path
                d={highCurvePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* 最低温曲线线条 */}
              <path
                d={lowCurvePath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* 曲线上的高低温关键数据点与标签 */}
              {highPoints.map((pt, idx) => {
                const isHovered = hoverIndex === idx;
                return (
                  <g key={`high-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 4.5 : 3.5}
                      fill={isDark ? '#1e293b' : '#ffffff'}
                      stroke="#f59e0b"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={pt.y - 8}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill={isDark ? '#f8fafc' : '#0f172a'}
                    >
                      {pt.val}°
                    </text>
                  </g>
                );
              })}

              {lowPoints.map((pt, idx) => {
                const isHovered = hoverIndex === idx;
                return (
                  <g key={`low-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 4.5 : 3.5}
                      fill={isDark ? '#1e293b' : '#ffffff'}
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y={pt.y + 16}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="500"
                      fill={isDark ? '#94a3b8' : '#64748b'}
                    >
                      {pt.val}°
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* 3. 底部降水概率（仅当有降水概率数据时才呈现） */}
          {hasAnyPrecipitation && (
            <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${items.length}, ${colWidth}px)` }}>
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-center items-center">
                  {item.precipitation && item.precipitation !== '0%' && item.precipitation !== '--' ? (
                    <span className="text-[10px] font-medium text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded-full">
                      {item.precipitation}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
