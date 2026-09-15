import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Segmented,
  ConfigProvider,
  theme as antdTheme,
  Select,
  DatePicker,
  Button,
  Progress,
  Tag,
  Modal,
  Input,
  Form,
  Switch,
  Tooltip,
  message,
} from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import {
  Languages,
  FileText,
  Activity,
  CheckSquare,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  Copy,
  Trash2,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  ArrowRightLeft,
  Calendar,
  CalendarClock,
  Edit2,
  Plus,
  Pin,
  Wifi,
  Download,
  Upload,
  Zap,
  Rocket,
  AlertTriangle,
  RotateCcw,
  Gauge,
} from 'lucide-react';
import { Language, ThemeMode, CountdownItem } from '../types';
import { loadTodosFromStorage, saveTodosToStorage } from '../utils/storage';
import { calculateCountdownStatus } from '../utils/countdown';
import { CountdownIcon, COUNTDOWN_ICON_OPTIONS } from './CountdownIcon';
import { i18n } from '../i18n';

export type TabType = 'translate' | 'text' | 'network' | 'todo' | 'countdown';

interface UtilityDrawerProps {
  language: Language;
  theme: ThemeMode;
  glassStyle: {
    blur: number;
    opacity: number;
  };
  countdowns?: CountdownItem[];
  onUpdateCountdowns?: (countdowns: CountdownItem[]) => void;
  openTabRequest?: { tab: TabType; timestamp: number } | null;
}

export interface TodoItem {
  id: string;
  title: string;
  content?: string;
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
  createdAt: number;
}

export interface SpeedPoint {
  time: number;
  speed: number;
  phase: 'download' | 'upload';
}

export interface SpeedTestResult {
  ping: number | null;
  jitter: number | null;
  download: number | null;
  peakDownload: number | null;
  upload: number | null;
  timestamp: number;
  serverName?: string;
  points?: SpeedPoint[];
}

type SpeedTestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'completed' | 'error';
type TranslationProvider = 'browser' | 'google' | 'mymemory' | 'libretranslate';

const STORAGE_TODO = 'crab_utility_todos';
const STORAGE_TAB = 'crab_utility_tab';
const STORAGE_SPEEDTEST = 'crab_utility_speedtest';
const SPEED_WARMUP_DURATION = 1000; // 预热阶段不计入测量结果：排除 DNS/TLS/TCP 慢启动。
const SPEED_DL_DURATION = 6000; // 下载有效测量窗口 6 秒。
const SPEED_UL_DURATION = 4000; // 上传有效测量窗口 4 秒。
const SPEED_SAMPLE_WINDOW = 750; // 实时读数使用 750ms 滑动窗口，避免累计平均值失真。
const SPEED_PHASE_GRACE_DURATION = 5000; // 为网络建连和慢速请求保留的最大宽限时间。
const SPEED_DOWNLOAD_CHUNK_BYTES = 50_000_000; // Cloudflare 当前公开端点允许的单次下载上限约为 50 MB。
const getTodayString = () => new Date().toISOString().slice(0, 10);
export const UtilityDrawer: React.FC<UtilityDrawerProps> = ({
  language,
  theme,
  glassStyle,
  countdowns = [],
  onUpdateCountdowns,
  openTabRequest,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabType>(() => {
    const saved = localStorage.getItem(STORAGE_TAB);
    return (saved as TabType) || 'translate';
  });

  // 待办数据与状态
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TODO);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // 兼容旧数据结构 { id, text, completed, date }
      return parsed.map((item: any) => ({
        id: item.id || Date.now().toString(),
        title: item.title || item.text || '',
        content: item.content || '',
        dueDate: item.dueDate || item.date || getTodayString(),
        completed: Boolean(item.completed),
        createdAt: item.createdAt || Date.now(),
      }));
    } catch {
      return [];
    }
  });

  // 编辑态状态
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoContent, setTodoContent] = useState('');
  const [todoDueDate, setTodoDueDate] = useState(getTodayString());
  const [todoPage, setTodoPage] = useState<'list' | 'detail' | 'editor'>('list');
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const [todoNavDirection, setTodoNavDirection] = useState<'forward' | 'backward'>('forward');
  const [, setIsFormExpanded] = useState(false);
  const [isCreatingTodo, setIsCreatingTodo] = useState(false);

  // 翻译功能状态
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [translationProvider, setTranslationProvider] = useState<TranslationProvider>('google');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);

  // 文本处理状态
  const [textContent, setTextContent] = useState('');

  // 网络检测与测速状态
  const [online, setOnline] = useState(navigator.onLine);
  const [testPhase, setTestPhase] = useState<SpeedTestPhase>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [speedNode, setSpeedNode] = useState<string>('cloudflare');
  const [speedStatusMsg, setSpeedStatusMsg] = useState<string>('');
  const [speedResult, setSpeedResult] = useState<SpeedTestResult>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SPEEDTEST);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      ping: null,
      jitter: null,
      download: null,
      peakDownload: null,
      upload: null,
      timestamp: 0,
    };
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSpeedTestRunningRef = useRef(false);
  useEffect(() => () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);
  const [speedPoints, setSpeedPoints] = useState<SpeedPoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SPEEDTEST);
      if (saved) {
        const parsed = JSON.parse(saved) as { points?: unknown };
        if (Array.isArray(parsed.points)) return parsed.points as SpeedPoint[];
      }
    } catch {}
    return [];
  });

  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const zh = language === 'zh';
  const t = i18n[language];

  // 监听外部打开指定标签页的请求（如点击时钟伴随胶囊）
  useEffect(() => {
    if (openTabRequest && openTabRequest.timestamp > 0) {
      setTab(openTabRequest.tab);
      setOpen(true);
    }
  }, [openTabRequest]);

  // 倒数日状态与操作
  const [countdownFilter, setCountdownFilter] = useState<string>('all');
  const [isCountdownModalOpen, setIsCountdownModalOpen] = useState(false);
  const [editingCountdown, setEditingCountdown] = useState<CountdownItem | null>(null);
  const [countdownForm] = Form.useForm();

  const pinnedCountdowns = useMemo(() => {
    return countdowns.filter((item) => item.isPinned);
  }, [countdowns]);

  const handleTogglePinCountdown = (item: CountdownItem) => {
    const next = countdowns.map((c) =>
      c.id === item.id ? { ...c, isPinned: !c.isPinned } : c
    );
    onUpdateCountdowns?.(next);
  };

  const handleOpenAddCountdown = () => {
    setEditingCountdown(null);
    countdownForm.resetFields();
    countdownForm.setFieldsValue({
      title: '',
      targetDate: dayjs().add(7, 'day'),
      repeat: 'none',
      category: 'work',
      isPinned: true,
      icon: 'target',
    });
    setIsCountdownModalOpen(true);
  };

  const handleOpenEditCountdown = (item: CountdownItem) => {
    setEditingCountdown(item);
    countdownForm.resetFields();
    countdownForm.setFieldsValue({
      title: item.title,
      targetDate: dayjs(item.targetDate),
      repeat: item.repeat || 'none',
      category: item.category || 'work',
      isPinned: Boolean(item.isPinned),
      icon: item.icon || 'target',
    });
    setIsCountdownModalOpen(true);
  };

  const handleSaveCountdownModal = async () => {
    try {
      const values = await countdownForm.validateFields();
      const targetDateStr = values.targetDate.format('YYYY-MM-DD');

      if (editingCountdown) {
        const next = countdowns.map((c) =>
          c.id === editingCountdown.id
            ? {
                ...c,
                title: values.title.trim(),
                targetDate: targetDateStr,
                repeat: values.repeat,
                category: values.category,
                isPinned: Boolean(values.isPinned),
                icon: values.icon,
              }
            : c
        );
        onUpdateCountdowns?.(next);
      } else {
        const newItem: CountdownItem = {
          id: `cd-${Date.now()}`,
          title: values.title.trim(),
          targetDate: targetDateStr,
          repeat: values.repeat,
          category: values.category,
          isPinned: Boolean(values.isPinned),
          icon: values.icon,
          createdAt: Date.now(),
        };
        onUpdateCountdowns?.([...countdowns, newItem]);
      }
      setIsCountdownModalOpen(false);
    } catch {
      // 表单校验拦截
    }
  };

  const handleDeleteCountdown = (item: CountdownItem) => {
    Modal.confirm({
      title: zh ? `确认删除「${item.title}」？` : `Delete "${item.title}"?`,
      content: zh ? '删除后该倒数日将不再显示。' : 'This countdown event will be removed.',
      okText: zh ? '删除' : 'Delete',
      cancelText: zh ? '取消' : 'Cancel',
      okButtonProps: { danger: true },
      centered: true,
      onOk: () => {
        const next = countdowns.filter((c) => c.id !== item.id);
        onUpdateCountdowns?.(next);
        message.success(zh ? '已删除' : 'Deleted');
      },
    });
  };

  const filteredCountdowns = useMemo(() => {
    if (countdownFilter === 'all') return countdowns;
    if (countdownFilter === 'anniversary') {
      return countdowns.filter((c) => c.category === 'anniversary' || c.category === 'birthday');
    }
    return countdowns.filter((c) => c.category === countdownFilter);
  }, [countdowns, countdownFilter]);

  const langOptions = useMemo(
    () => [
      { value: 'auto', label: zh ? '自动检测' : 'Auto Detect' },
      { value: 'zh', label: '中文 (简体)' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'ko', label: '한국어' },
      { value: 'fr', label: 'Français' },
      { value: 'de', label: 'Deutsch' },
      { value: 'es', label: 'Español' },
      { value: 'ru', label: 'Русский' },
    ],
    [zh]
  );

  const targetLangOptions = useMemo(
    () => langOptions.filter((item) => item.value !== 'auto'),
    [langOptions]
  );
  const translationProviderOptions = useMemo(
    () => [
      { value: 'google', label: zh ? 'Google 翻译（免费）' : 'Google Translate (Free)' },
      { value: 'mymemory', label: zh ? 'MyMemory（免费）' : 'MyMemory (Free)' },
      { value: 'libretranslate', label: zh ? 'LibreTranslate（免费）' : 'LibreTranslate (Free)' },
      { value: 'browser', label: zh ? '浏览器本地翻译' : 'Browser Local Translation' },
    ],
    [zh]
  );

  const antdThemeConfig = useMemo(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorText: isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
        colorTextSecondary: isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
        colorPrimary: '#3b82f6',
        borderRadius: 8,
        colorBgContainer: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        colorBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
        colorBgElevated: isDark ? 'rgba(28, 31, 38, 0.95)' : 'rgba(255, 255, 255, 0.96)',
      },
      components: {
        Segmented: {
          trackBg: isDark ? 'rgba(0, 0, 0, 0.36)' : 'rgba(0, 0, 0, 0.06)',
          itemSelectedBg: isDark ? '#3b4555' : '#ffffff',
          itemSelectedColor: isDark ? '#ffffff' : '#18181b',
          itemColor: isDark ? 'rgba(255, 255, 255, 0.52)' : 'rgba(0, 0, 0, 0.65)',
          itemHoverBg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
          itemHoverColor: isDark ? 'rgba(255, 255, 255, 0.9)' : '#18181b',
          itemActiveBg: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        },
        Select: {
          colorBgContainer: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
          selectorBg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        },
        DatePicker: {
          colorBgContainer: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
        },
        Input: {
          colorBgContainer: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
        },
      },
    }),
    [isDark]
  );

  const speedNodeOptions = useMemo(
    () => [
      { value: 'cloudflare', label: zh ? 'Cloudflare 公开测速节点' : 'Cloudflare Public Speed Test' },
    ],
    [zh]
  );

  const speedRating = useMemo(() => {
    const d = speedResult.download;
    if (d === null) return null;
    if (d >= 300) {
      return {
        color: 'success',
        icon: <Zap size={12} className="shrink-0" />,
        tag: zh ? '千兆极速' : 'Gigabit Ultra',
        desc: zh ? '极速响应，支持 4K/8K 超清流媒体与全屋多设备并发' : 'Gigabit speed, ideal for 8K streaming & multi-device load',
      };
    }
    if (d >= 100) {
      return {
        color: 'processing',
        icon: <Rocket size={12} className="shrink-0" />,
        tag: zh ? '高速光纤' : 'High Speed',
        desc: zh ? '百兆以上宽带，畅享 4K 观影与大型游戏更新' : 'Fast broadband for smooth 4K streaming & game downloads',
      };
    }
    if (d >= 30) {
      return {
        color: 'cyan',
        icon: <Check size={12} className="shrink-0" />,
        tag: zh ? '普通宽带' : 'Standard',
        desc: zh ? '满足 1080P 高清视频、在线会议与多任务办公' : 'Standard speed, smooth for 1080P video & daily productivity',
      };
    }
    if (d >= 10) {
      return {
        color: 'default',
        icon: <Check size={12} className="shrink-0" />,
        tag: zh ? '基础网络' : 'Basic',
        desc: zh ? '满足网页浏览、社交通讯与标清流媒体' : 'Basic connection for web surfing & messaging',
      };
    }
    return {
      color: 'warning',
      icon: <AlertTriangle size={12} className="shrink-0" />,
      tag: zh ? '网络偏慢' : 'Slow',
      desc: zh ? '速率较低，建议检查 WiFi 信号或重试' : 'Low bandwidth, please check WiFi signal or network traffic',
    };
  }, [speedResult.download, zh]);
  const speedChartData = useMemo(() => {
    const width = 480;
    const height = 96;
    const left = 42;
    const right = 12;
    const top = 12;
    const bottom = 20;

    const buildPhaseData = (phase: SpeedPoint['phase']) => {
      let phasePoints = speedPoints
        .filter((point) => point.phase === phase && Number.isFinite(point.time) && Number.isFinite(point.speed))
        .sort((a, b) => a.time - b.time);
      if (phasePoints.length === 0 && speedResult[phase] !== null) {
        const value = Number(speedResult[phase]) || 0;
        if (value > 0) {
          const duration = phase === 'download' ? SPEED_DL_DURATION : SPEED_UL_DURATION;
          phasePoints = [
            { time: phase === 'download' ? 0 : SPEED_DL_DURATION, speed: 0, phase },
            { time: phase === 'download' ? duration : SPEED_DL_DURATION + duration, speed: value, phase },
          ];
        }
      }
      const maxVal = Math.ceil(Math.max(10, ...phasePoints.map((point) => point.speed), Number(speedResult[phase]) || 0));
      if (phasePoints.length === 0) {
        return { hasData: false, maxVal, linePath: '', areaPath: '', lastX: left, lastY: height - bottom };
      }

      const duration = phase === 'download' ? SPEED_DL_DURATION : SPEED_UL_DURATION;
      const coords = phasePoints.map((point) => {
        const relativeTime = phase === 'download' ? point.time : point.time - SPEED_DL_DURATION;
        return {
          x: left + Math.min(1, Math.max(0, relativeTime / duration)) * (width - left - right),
          y: top + (1 - Math.min(1, point.speed / maxVal)) * (height - top - bottom),
        };
      });
      let linePath = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
      for (let index = 0; index < coords.length - 1; index++) {
        const current = coords[index];
        const next = coords[index + 1];
        const midX = (current.x + next.x) / 2;
        linePath += ` C ${midX.toFixed(1)},${current.y.toFixed(1)} ${midX.toFixed(1)},${next.y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
      }
      const first = coords[0];
      const last = coords[coords.length - 1];
      return {
        hasData: true,
        maxVal,
        linePath,
        areaPath: `${linePath} L ${last.x.toFixed(1)},${height - bottom} L ${first.x.toFixed(1)},${height - bottom} Z`,
        lastX: last.x,
        lastY: last.y,
      };
    };

    return { download: buildPhaseData('download'), upload: buildPhaseData('upload') };
  }, [speedPoints, speedResult.download, speedResult.upload]);

  // 智能推断网络类型（避免桌面浏览器误判为 4G）
  const smartNetworkInfo = useMemo(() => {
    if (!online) {
      return {
        typeText: zh ? '已断网' : 'Offline',
        subText: zh ? '网络未连接' : 'No Connection',
      };
    }

    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const conn = (nav as unknown as {
      connection?: {
        type?: string;
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
      };
    })?.connection;

    const rawType = conn?.type?.toLowerCase();
    const effectiveType = conn?.effectiveType?.toLowerCase();
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const dl = speedResult.download;

    // 1. 若浏览器提供了底层介质类型
    if (rawType === 'wifi') {
      return {
        typeText: zh ? 'WiFi 无线' : 'WiFi',
        subText: dl !== null ? `${dl} Mbps` : (zh ? '无线局域网' : 'WLAN'),
      };
    }
    if (rawType === 'ethernet') {
      return {
        typeText: zh ? '有线网络' : 'Ethernet',
        subText: dl !== null ? (dl >= 100 ? (zh ? '高速光纤' : 'Gigabit Fiber') : `${dl} Mbps`) : (zh ? '以太网' : 'LAN'),
      };
    }
    if (rawType === 'cellular') {
      const is5G = dl !== null ? dl >= 80 : effectiveType === '4g' && (conn?.downlink || 0) >= 20;
      return {
        typeText: is5G ? '5G 蜂窝' : '4G 蜂窝',
        subText: zh ? '移动网络' : 'Cellular',
      };
    }

    // 2. 桌面端（PC/Mac/Linux）：Chrome 由于隐私隐藏了 rawType，只默认返回 effectiveType: '4g'
    if (!isMobile) {
      if (dl !== null) {
        if (dl >= 300) {
          return {
            typeText: zh ? '千兆光纤' : 'Gigabit',
            subText: zh ? '超高速宽带' : 'Ultra Broadband',
          };
        }
        if (dl >= 80) {
          return {
            typeText: zh ? '高速光纤' : 'Fiber Optic',
            subText: zh ? '宽带 / WiFi' : 'High Speed',
          };
        }
        if (dl >= 30) {
          return {
            typeText: zh ? '宽带网络' : 'Broadband',
            subText: zh ? 'WiFi / 有线' : 'WiFi / LAN',
          };
        }
        return {
          typeText: zh ? '普通宽带' : 'Broadband',
          subText: zh ? '家庭/办公网络' : 'Standard Network',
        };
      }
      return {
        typeText: zh ? '宽带网络' : 'Broadband',
        subText: zh ? 'WiFi / 有线' : 'WiFi / LAN',
      };
    }

    // 3. 移动端设备
    if (effectiveType === '4g') {
      if (dl !== null && dl >= 80) {
        return {
          typeText: '5G / WiFi',
          subText: zh ? '高速无线' : 'High Speed',
        };
      }
      return {
        typeText: '4G / WiFi',
        subText: zh ? '移动网络' : 'Mobile / WiFi',
      };
    }

    return {
      typeText: zh ? '移动网络' : 'Mobile Net',
      subText: effectiveType?.toUpperCase() || '3G/4G',
    };
  }, [online, speedResult.download, zh]);

  // 待办统计与分类
  const uncompletedTodos = useMemo(() => todos.filter((t) => !t.completed), [todos]);
  const pendingCount = uncompletedTodos.length;

  const showToast = (msg: string) => {
    setCopiedNotice(msg);
    window.setTimeout(() => setCopiedNotice(null), 2000);
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(zh ? '已复制到剪贴板' : 'Copied to clipboard');
    } catch {
      showToast(zh ? '复制失败' : 'Failed to copy');
    }
  };

  // 快捷键 Esc 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // 网络在线监听
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const changeTab = (newTab: TabType) => {
    setTab(newTab);
    localStorage.setItem(STORAGE_TAB, newTab);
  };

  // 双写保存待办列表（同时写入 chrome.storage.local 与 localStorage，并生成快照备份）
  const saveTodos = (newTodos: TodoItem[]) => {
    setTodos(newTodos);
    void saveTodosToStorage(newTodos);
  };

  // 启动时从双层持久化中对齐待办数据（防止升级或换环境后未迁移）
  useEffect(() => {
    void (async () => {
      const stored = await loadTodosFromStorage<TodoItem>();
      if (Array.isArray(stored) && stored.length > 0) {
        setTodos((prev) => (prev.length > 0 ? prev : stored));
      }
    })();
  }, []);

  // 开启新建模式
  // 开启新建模式
  const handleStartCreate = () => {
    setTodoNavDirection('forward');
    setActiveTodoId(null);
    setEditingTodoId(null);
    setTodoTitle('');
    setTodoContent('');
    setTodoDueDate(getTodayString());
    setIsFormExpanded(true);
    setIsCreatingTodo(true);
    setTodoPage('editor');
  };

  // 点击列表项进入二级只读详情页
  const handleOpenDetail = (item: TodoItem) => {
    setTodoNavDirection('forward');
    setActiveTodoId(item.id);
    setEditingTodoId(item.id);
    setTodoTitle(item.title);
    setTodoContent(item.content || '');
    setTodoDueDate(item.dueDate);
    setIsCreatingTodo(false);
    setTodoPage('detail');
  };

  // 在详情页中点击“编辑”
  const handleStartEditFromDetail = (item: TodoItem) => {
    setTodoNavDirection('forward');
    setActiveTodoId(item.id);
    setEditingTodoId(item.id);
    setTodoTitle(item.title);
    setTodoContent(item.content || '');
    setTodoDueDate(item.dueDate);
    setIsCreatingTodo(false);
    setIsFormExpanded(true);
    setTodoPage('editor');
  };

  const handleBackToList = () => {
    setTodoNavDirection('backward');
    setActiveTodoId(null);
    setEditingTodoId(null);
    setTodoTitle('');
    setTodoContent('');
    setTodoDueDate(getTodayString());
    setIsFormExpanded(false);
    setIsCreatingTodo(false);
    setTodoPage('list');
  };

  const handleCancelEdit = () => {
    setTodoNavDirection('backward');
    if (isCreatingTodo || !activeTodoId) {
      handleBackToList();
      return;
    }
    const current = todos.find((t) => t.id === activeTodoId);
    if (current) {
      setTodoTitle(current.title);
      setTodoContent(current.content || '');
      setTodoDueDate(current.dueDate);
      setTodoPage('detail');
    } else {
      handleBackToList();
    }
  };
  const handleSaveTodo = () => {
    if (!todoTitle.trim()) return;
    setTodoNavDirection('backward');
    if (editingTodoId) {
      const next = todos.map((t) =>
        t.id === editingTodoId
          ? { ...t, title: todoTitle.trim(), content: todoContent.trim(), dueDate: todoDueDate || getTodayString() }
          : t
      );
      saveTodos(next);
      setActiveTodoId(editingTodoId);
      setTodoPage('detail');
    } else {
      const newId = Date.now().toString();
      const newItem: TodoItem = {
        id: newId,
        title: todoTitle.trim(),
        content: todoContent.trim(),
        dueDate: todoDueDate || getTodayString(),
        completed: false,
        createdAt: Date.now(),
      };
      saveTodos([newItem, ...todos]);
      setActiveTodoId(newId);
      setTodoPage('detail');
    }
  };

  const toggleTodo = (id: string) => {
    const next = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    saveTodos(next);
  };

  const deleteTodo = (id: string) => {
    const next = todos.filter((t) => t.id !== id);
    saveTodos(next);
    if (activeTodoId === id || editingTodoId === id) {
      handleBackToList();
    }
  };

  const clearCompletedTodos = () => {
    const next = todos.filter((t) => !t.completed);
    saveTodos(next);
  };

  // 点击胶囊直接打开抽屉并切换到该待办的详情展示
  const handlePillClick = (todo: TodoItem) => {
    setTab('todo');
    setOpen(true);
    handleOpenDetail(todo);
  };

  // 测网速中止与执行
  const cancelSpeedTest = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isSpeedTestRunningRef.current = false;
    setTestPhase('idle');
    setProgressPercent(0);
    setCurrentSpeed(0);
    setSpeedStatusMsg('');
  };
  const runFullSpeedTest = async () => {
    if (!online) return;
    if (isSpeedTestRunningRef.current) {
      cancelSpeedTest();
      return;
    }
    isSpeedTestRunningRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;
    const createPhaseSignal = (timeoutMs: number) => {
      const phaseController = new AbortController();
      const timeoutId = window.setTimeout(() => phaseController.abort(), timeoutMs);
      return {
        signal: AbortSignal.any([signal, phaseController.signal]),
        clear: () => window.clearTimeout(timeoutId),
      };
    };
    const points: SpeedPoint[] = [];
    const appendPoint = (point: SpeedPoint) => {
      const last = points[points.length - 1];
      if (last?.phase === point.phase && last.time === point.time) points[points.length - 1] = point;
      else points.push(point);
      setSpeedPoints([...points]);
    };
    const result: SpeedTestResult = {
      ping: null, jitter: null, download: null, peakDownload: null, upload: null,
      timestamp: Date.now(), serverName: 'Cloudflare CDN',
    };

    setTestPhase('ping');
    setProgressPercent(5);
    setCurrentSpeed(0);
    setSpeedStatusMsg(zh ? '正在测量延迟与抖动...' : 'Measuring Ping & Jitter...');
    setSpeedPoints([]);
    setSpeedResult({ ...result });

    try {
      const pingTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        if (signal.aborted) return;
        const phase = createPhaseSignal(SPEED_PHASE_GRACE_DURATION);
        const startedAt = performance.now();
        try {
          const response = await fetch(`https://speed.cloudflare.com/__down?bytes=0&_t=${Date.now()}_${i}`, {
            method: 'HEAD', mode: 'cors', cache: 'no-store', signal: phase.signal,
          });
          if (response.ok) pingTimes.push(performance.now() - startedAt);
        } catch {
          if (signal.aborted) return;
        } finally {
          phase.clear();
        }
        if (pingTimes.length > 0) {
          result.ping = Math.round(pingTimes.reduce((sum, time) => sum + time, 0) / pingTimes.length);
          const changes = pingTimes.slice(1).map((time, index) => Math.abs(time - pingTimes[index]));
          result.jitter = Number((changes.reduce((sum, value) => sum + value, 0) / Math.max(1, changes.length)).toFixed(1));
          setSpeedResult({ ...result });
        }
        setProgressPercent(4 + (i + 1) * 3);
        if (i < 4) await new Promise((resolve) => window.setTimeout(resolve, 180));
      }
      if (pingTimes.length === 0) throw new Error('PING_FAILED');
      if (signal.aborted) return;

      setTestPhase('download');
      setProgressPercent(20);
      setCurrentSpeed(0);
      setSpeedStatusMsg(zh ? '正在预热下载连接...' : 'Warming up download connection...');
      const downloadPhase = createPhaseSignal(SPEED_WARMUP_DURATION + SPEED_DL_DURATION + SPEED_PHASE_GRACE_DURATION);
      let downloadedBytes = 0;
      let downloadStart = 0;
      let downloadCompleted = false;
      let peakDownload = 0;
      const downloadSamples: Array<{ time: number; bytes: number }> = [];
      const sampleDownload = (final = false) => {
        if (!downloadStart || signal.aborted) return;
        const now = performance.now();
        const elapsed = Math.min(SPEED_DL_DURATION, now - downloadStart);
        downloadSamples.push({ time: now, bytes: downloadedBytes });
        while (downloadSamples.length > 1 && now - downloadSamples[0].time > SPEED_SAMPLE_WINDOW) downloadSamples.shift();
        const oldest = downloadSamples[0];
        const speed = Number((((downloadedBytes - oldest.bytes) * 8) / (Math.max(0.1, (now - oldest.time) / 1000) * 1_000_000)).toFixed(1));
        peakDownload = Math.max(peakDownload, speed);
        setCurrentSpeed(speed);
        setProgressPercent(Math.min(70, Math.round(20 + elapsed / SPEED_DL_DURATION * 50)));
        appendPoint({ time: final ? SPEED_DL_DURATION : Math.round(elapsed), speed, phase: 'download' });
      };
      const downloadSampler = window.setInterval(sampleDownload, 125);
      try {
        const warmupStart = performance.now();
        while (performance.now() - warmupStart < SPEED_WARMUP_DURATION + SPEED_DL_DURATION) {
          const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${SPEED_DOWNLOAD_CHUNK_BYTES}&_t=${Date.now()}`, {
            cache: 'no-store', signal: downloadPhase.signal,
          });
          if (!response.ok || !response.body) throw new Error('DOWNLOAD_FAILED');
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const now = performance.now();
              if (!downloadStart && now - warmupStart >= SPEED_WARMUP_DURATION) {
                downloadStart = now;
                appendPoint({ time: 0, speed: 0, phase: 'download' });
                setSpeedStatusMsg(zh ? '正在测量下载速率...' : 'Measuring download speed...');
              }
              if (downloadStart) downloadedBytes += value.byteLength;
              if (downloadStart && now - downloadStart >= SPEED_DL_DURATION) {
                downloadCompleted = true;
                break;
              }
            }
          } finally {
            await reader.cancel().catch(() => undefined);
          }
          if (downloadCompleted) break;
        }
      } finally {
        window.clearInterval(downloadSampler);
        downloadPhase.clear();
      }
      if (signal.aborted) return;
      if (!downloadStart || downloadedBytes === 0) throw new Error('DOWNLOAD_FAILED');
      const downloadSeconds = Math.min(SPEED_DL_DURATION, performance.now() - downloadStart) / 1000;
      const finalDownload = Number(((downloadedBytes * 8) / (Math.max(0.1, downloadSeconds) * 1000 * 1000)).toFixed(1));
      result.download = finalDownload;
      result.peakDownload = Math.max(peakDownload, finalDownload);
      appendPoint({ time: SPEED_DL_DURATION, speed: finalDownload, phase: 'download' });
      setCurrentSpeed(finalDownload);
      setSpeedResult({ ...result });

      setTestPhase('upload');
      setProgressPercent(70);
      setCurrentSpeed(0);
      setSpeedStatusMsg(zh ? '正在预热上传连接...' : 'Warming up upload connection...');
      const uploadPhase = createPhaseSignal(SPEED_WARMUP_DURATION + SPEED_UL_DURATION + SPEED_PHASE_GRACE_DURATION);
      const uploadChunk = new Uint8Array(2 * 1024 * 1024);
      let uploadedBytes = 0;
      let uploadStart = 0;
      const uploadSamples: Array<{ time: number; bytes: number }> = [];
      appendPoint({ time: SPEED_DL_DURATION, speed: 0, phase: 'upload' });
      const sampleUpload = () => {
        if (!uploadStart || signal.aborted) return;
        const now = performance.now();
        const elapsed = Math.min(SPEED_UL_DURATION, now - uploadStart);
        uploadSamples.push({ time: now, bytes: uploadedBytes });
        while (uploadSamples.length > 1 && now - uploadSamples[0].time > SPEED_SAMPLE_WINDOW) uploadSamples.shift();
        const oldest = uploadSamples[0];
        const speed = Number((((uploadedBytes - oldest.bytes) * 8) / (Math.max(0.1, (now - oldest.time) / 1000) * 1000 * 1000)).toFixed(1));
        setCurrentSpeed(speed);
        setProgressPercent(Math.min(98, Math.round(70 + elapsed / SPEED_UL_DURATION * 28)));
        appendPoint({ time: SPEED_DL_DURATION + Math.round(elapsed), speed, phase: 'upload' });
      };
      const uploadSampler = window.setInterval(sampleUpload, 125);
      try {
        const warmupStart = performance.now();
        while (performance.now() - warmupStart < SPEED_WARMUP_DURATION + SPEED_UL_DURATION) {
          const response = await fetch('https://speed.cloudflare.com/__up', {
            method: 'POST', body: uploadChunk, cache: 'no-store', signal: uploadPhase.signal,
          });
          if (!response.ok) throw new Error(`UPLOAD_HTTP_${response.status}`);
          const now = performance.now();
          if (!uploadStart && now - warmupStart >= SPEED_WARMUP_DURATION) {
            uploadStart = now;
            appendPoint({ time: SPEED_DL_DURATION, speed: 0, phase: 'upload' });
            setSpeedStatusMsg(zh ? '正在测量上传速率...' : 'Measuring upload speed...');
          }
          if (uploadStart) uploadedBytes += uploadChunk.byteLength;
          if (uploadStart && now - uploadStart >= SPEED_UL_DURATION) break;
        }
      } finally {
        window.clearInterval(uploadSampler);
        uploadPhase.clear();
      }
      if (signal.aborted) return;
      if (!uploadStart || uploadedBytes === 0) throw new Error('UPLOAD_FAILED');
      const uploadSeconds = Math.min(SPEED_UL_DURATION, performance.now() - uploadStart) / 1000;
      const finalUpload = Number(((uploadedBytes * 8) / (Math.max(0.1, uploadSeconds) * 1000 * 1000)).toFixed(1));
      result.upload = finalUpload;
      appendPoint({ time: SPEED_DL_DURATION + SPEED_UL_DURATION, speed: finalUpload, phase: 'upload' });
      setCurrentSpeed(finalUpload);
      setProgressPercent(100);
      setTestPhase('completed');
      setSpeedStatusMsg(zh ? '测速完成' : 'Completed');
      result.timestamp = Date.now();
      result.points = points;
      setSpeedResult({ ...result });
      localStorage.setItem(STORAGE_SPEEDTEST, JSON.stringify(result));
    } catch {
      if (signal.aborted) return;
      setTestPhase('error');
      setSpeedStatusMsg(zh ? '测速失败：节点不可达或未返回有效数据' : 'Test failed: the node was unavailable or returned no valid data');
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      isSpeedTestRunningRef.current = false;
    }
  };
  // 翻译处理：服务商由用户明确选择，失败时不会静默切换到其他服务。
  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslatedText('');
    const source = sourceLang === 'auto' ? 'auto' : sourceLang;
    try {
      if (translationProvider === 'browser') {
        const ai = (window as unknown as { ai?: { translator?: { create: (opts: unknown) => Promise<{ translate: (text: string) => Promise<string> }> } } }).ai;
        if (!ai?.translator) throw new Error('BROWSER_TRANSLATOR_UNAVAILABLE');
        const translator = await ai.translator.create({
          sourceLanguage: source === 'auto' ? 'en' : source,
          targetLanguage: targetLang,
        });
        setTranslatedText(await translator.translate(sourceText));
        return;
      }

      if (translationProvider === 'google') {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${targetLang}&dt=t&q=${encodeURIComponent(sourceText)}`);
        if (!response.ok) throw new Error('GOOGLE_REQUEST_FAILED');
        const data = await response.json();
        setTranslatedText((data[0] as Array<[string]>).map((item) => item[0]).join(''));
        return;
      }

      if (translationProvider === 'mymemory') {
        if (source === 'auto') throw new Error('MYMEMORY_NEEDS_SOURCE_LANGUAGE');
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=${source}|${targetLang}`);
        if (!response.ok) throw new Error('MYMEMORY_REQUEST_FAILED');
        const data = await response.json() as { responseData?: { translatedText?: string } };
        if (!data.responseData?.translatedText) throw new Error('MYMEMORY_EMPTY_RESPONSE');
        setTranslatedText(data.responseData.translatedText);
        return;
      }

      // 使用标准表单编码请求，扩展环境不会触发 JSON Content-Type 的 CORS 预检；.com 为直接 API 地址，避免 .de 的重定向。
      const requestBody = new URLSearchParams({
        q: sourceText,
        source,
        target: targetLang,
        format: 'text',
      });
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: requestBody,
      });
      if (!response.ok) throw new Error('LIBRETRANSLATE_REQUEST_FAILED');
      const data = await response.json() as { translatedText?: string };
      if (!data.translatedText) throw new Error('LIBRETRANSLATE_EMPTY_RESPONSE');
      setTranslatedText(data.translatedText);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'MYMEMORY_NEEDS_SOURCE_LANGUAGE') {
        setTranslatedText(zh ? 'MyMemory 需要明确选择源语言，请不要使用“自动检测”。' : 'MyMemory needs an explicit source language; do not use Auto Detect.');
      } else if (code === 'BROWSER_TRANSLATOR_UNAVAILABLE') {
        setTranslatedText(zh ? '当前浏览器不支持本地翻译模型，请选择其他服务。' : 'This browser does not support a local translation model. Choose another provider.');
      } else {
        setTranslatedText(zh ? '该免费翻译服务暂不可用或请求受限，请切换服务后重试。' : 'This free provider is unavailable or rate-limited. Switch provider and try again.');
      }
    } finally {
      setTranslating(false);
    }
  };

  // 文本处理
  const processText = (action: string) => {
    if (!textContent) return;
    switch (action) {
      case 'trim':
        setTextContent(textContent.split('\n').map((l) => l.trim()).join('\n'));
        break;
      case 'removeEmpty':
        setTextContent(textContent.split('\n').filter((l) => l.trim().length > 0).join('\n'));
        break;
      case 'removeDuplicate':
        setTextContent(Array.from(new Set(textContent.split('\n'))).join('\n'));
        break;
      case 'upper':
        setTextContent(textContent.toUpperCase());
        break;
      case 'lower':
        setTextContent(textContent.toLowerCase());
        break;
      case 'jsonFormat':
        try {
          setTextContent(JSON.stringify(JSON.parse(textContent), null, 2));
        } catch {
          showToast(zh ? '非有效 JSON 格式' : 'Invalid JSON');
        }
        break;
      case 'jsonCompress':
        try {
          setTextContent(JSON.stringify(JSON.parse(textContent)));
        } catch {
          showToast(zh ? '非有效 JSON 格式' : 'Invalid JSON');
        }
        break;
      case 'urlEncode':
        setTextContent(encodeURIComponent(textContent));
        break;
      case 'urlDecode':
        try {
          setTextContent(decodeURIComponent(textContent));
        } catch {
          showToast(zh ? '解码失败' : 'Decode failed');
        }
        break;
      default:
        break;
    }
  };

  const textStats = useMemo(() => {
    const chars = Array.from(textContent).length;
    // 中文、日文和韩文通常不以空格分词；逐字符统计，英文/数字连续片段则算作一个词。
    const cjkChars = textContent.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length ?? 0;
    const chineseChars = textContent.match(/\p{Script=Han}/gu)?.length ?? 0;
    const englishChars = textContent.match(/[A-Za-z]/g)?.length ?? 0;
    const nonCjkText = textContent.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ');
    const latinWords = nonCjkText.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
    const words = cjkChars + latinWords;
    const lines = textContent ? textContent.split('\n').length : 0;
    return { chars, chineseChars, englishChars, words, lines };
  }, [textContent]);

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'translate', label: zh ? '翻译' : 'Translate', icon: <Languages size={15} /> },
    { id: 'text', label: zh ? '文本处理' : 'Text', icon: <FileText size={15} /> },
    { id: 'network', label: zh ? '网络测速' : 'Speedtest', icon: <Gauge size={15} /> },
    { id: 'todo', label: zh ? '待办事项' : 'Tasks', icon: <CheckSquare size={15} /> },
    { id: 'countdown', label: zh ? '倒数日' : 'Countdown', icon: <CalendarClock size={15} /> },
  ];

  return (
    <>
      {/* 遮罩层 */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity duration-300 pointer-events-auto ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
        }}
        onClick={() => setOpen(false)}
      />

      {/* 底部左下角独立待办胶囊区（抽屉未展开时显示在视口左下角，不与中央工具把手挤在一起） */}
      {!open && uncompletedTodos.length > 0 && (
        <div className="fixed left-6 bottom-4 z-40 flex items-center gap-2 max-w-[45vw] overflow-x-auto custom-scrollbar pointer-events-auto py-1">
          {uncompletedTodos.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handlePillClick(item)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium shadow-lg transition-colors border cursor-pointer select-none backdrop-blur-md ${
                isDark
                  ? 'bg-[#181a20]/80 hover:bg-[#181a20]/95 text-white/90 border-white/10 hover:border-white/20'
                  : 'bg-white/80 hover:bg-white/95 text-neutral-800 border-black/10 hover:border-black/20'
              }`}
              style={{
                backdropFilter: `blur(${glassStyle.blur}px)`,
                WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
              }}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTodo(item.id);
                }}
                className="w-3.5 h-3.5 rounded-full border border-current opacity-60 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
              />
              <span className="max-w-[120px] truncate">{item.title}</span>
              {item.dueDate && (
                <span className="text-[10px] opacity-50 flex items-center gap-0.5">
                  <Calendar size={10} />
                  {item.dueDate.slice(5)}
                </span>
              )}
            </button>
          ))}

          {uncompletedTodos.length > 3 && (
            <button
              type="button"
              onClick={() => {
                setTab('todo');
                setOpen(true);
              }}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/20 text-blue-500 border border-blue-500/30 cursor-pointer backdrop-blur-md"
            >
              +{uncompletedTodos.length - 3}
            </button>
          )}
        </div>
      )}

      {/* 底部右下角独立倒数日胶囊区（纵向靠右堆叠，统一定宽与两端对齐，保证边距与视觉间距完全均匀） */}
      {!open && pinnedCountdowns.length > 0 && (
        <div className="pinned-countdown-container fixed right-6 bottom-4 z-40 flex flex-col items-end gap-2 max-h-[42vh] overflow-y-auto custom-scrollbar pointer-events-auto p-1 select-none">
          {pinnedCountdowns.map((item) => {
            const status = calculateCountdownStatus(item, language);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab('countdown');
                  setOpen(true);
                }}
                title={zh ? `${item.title}（点击管理倒数日）` : `${item.title} (Manage)`}
                className={`w-[240px] h-8 flex items-center justify-between pl-1.5 pr-3.5 rounded-full text-xs font-medium shadow-md transition-colors border cursor-pointer select-none backdrop-blur-md shrink-0 ${
                  isDark
                    ? 'bg-[#181a20]/80 hover:bg-[#181a20]/95 text-white/90 border-white/10 hover:border-white/30'
                    : 'bg-white/80 hover:bg-white/95 text-neutral-800 border-black/10 hover:border-black/20'
                }`}
                style={{
                  backdropFilter: `blur(${glassStyle.blur}px)`,
                  WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
                }}
              >
                {/* 左侧：图标与标题 */}
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${status.color}22`,
                      color: status.color,
                    }}
                  >
                    <CountdownIcon name={item.icon} size={12} />
                  </div>
                  <span className="truncate max-w-[110px] text-neutral-800 dark:text-neutral-100">
                    {item.title}
                  </span>
                </div>

                {/* 右侧：状态文案与天数 */}
                <span
                  className="text-[11px] font-semibold opacity-95 shrink-0 tabular-nums"
                  style={{ color: status.color }}
                >
                  {status.displayText}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 底部居中外壳：包含抽屉面板与居中把手 */}
      <div className="fixed left-0 right-0 bottom-0 z-50 flex flex-col items-center pointer-events-none">
        
        {/* 抽屉整体容器 */}
        <div
          className={`w-full flex flex-col items-center transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'translate-y-0' : 'translate-y-[380px]'
          }`}
        >
          {/* 顶部/底部把手：展开/收起 */}
          <div className="flex items-center justify-center px-3 pb-0 pointer-events-auto">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className={`flex items-center gap-2 px-5 py-2 rounded-t-2xl font-medium text-xs shadow-lg transition-all duration-200 border border-b-0 cursor-pointer ${
                isDark
                  ? 'bg-[#181a20]/80 hover:bg-[#181a20]/95 text-white/90 border-white/10'
                  : 'bg-white/80 hover:bg-white/95 text-neutral-800 border-black/10'
              }`}
              style={{
                backdropFilter: `blur(${glassStyle.blur}px)`,
                WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
              }}
            >
              {open ? <ChevronDown size={14} className="opacity-70" /> : <ChevronUp size={14} className="opacity-70" />}
              <span>{zh ? '实用工具' : 'Tools'}</span>
            </button>
          </div>

          {/* 下方内容面板 */}
          <ConfigProvider theme={antdThemeConfig} locale={zh ? zhCN : enUS}>
            <div
              className={`pointer-events-auto w-full max-w-3xl h-[380px] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden border border-b-0 ${
                isDark
                  ? 'bg-[#16181d]/85 text-white border-white/10'
                  : 'bg-white/85 text-neutral-800 border-black/10'
              }`}
              style={{
                backdropFilter: `blur(${glassStyle.blur}px)`,
                WebkitBackdropFilter: `blur(${glassStyle.blur}px)`,
              }}
            >
              {/* 工具标签栏：Ant Design 分段器 */}
              <div className="flex items-center justify-center p-2.5 border-b border-black/5 dark:border-white/10 shrink-0">
                <Segmented<TabType>
                  className="custom-utility-segmented"
                  value={tab}
                  onChange={(val) => changeTab(val as TabType)}
                  size="middle"
                  options={tabs.map((t) => ({
                    value: t.id,
                    label: (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium">
                        <span className="opacity-90">{t.icon}</span>
                        <span>{t.label}</span>
                      </div>
                    ),
                  }))}
                />
              </div>

              {/* 工具内容区 */}
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                {/* 翻译 */}
                {tab === 'translate' && (
                  <div className="h-full flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <Select
                          size="small"
                          value={sourceLang}
                          onChange={(value) => setSourceLang(value)}
                          options={langOptions}
                          style={{ width: 110 }}
                          popupClassName="utility-ant-dropdown"
                        />
                        <ArrowRightLeft size={13} className="shrink-0 opacity-50" />
                        <Select
                          size="small"
                          value={targetLang}
                          onChange={(value) => setTargetLang(value)}
                          options={targetLangOptions}
                          style={{ width: 110 }}
                          popupClassName="utility-ant-dropdown"
                        />
                        <Select<TranslationProvider>
                          size="small"
                          value={translationProvider}
                          onChange={(value) => setTranslationProvider(value)}
                          options={translationProviderOptions}
                          style={{ width: 172 }}
                          popupClassName="utility-ant-dropdown"
                        />
                      </div>
                      <a
                        href={translationProvider === 'google'
                          ? `https://translate.google.com/?sl=${sourceLang}&tl=${targetLang}&text=${encodeURIComponent(sourceText)}`
                          : translationProvider === 'mymemory'
                          ? 'https://mymemory.translated.net/'
                          : translationProvider === 'libretranslate'
                          ? 'https://libretranslate.com/'
                          : 'https://developer.chrome.com/docs/ai/translator-api'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex shrink-0 items-center gap-1 text-[11px] opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <span>{translationProviderOptions.find((item) => item.value === translationProvider)?.label}</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>

                  <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleTranslate();
                          }
                        }}
                        placeholder={zh ? '输入文本，Ctrl+Enter 翻译...' : 'Enter text, Ctrl+Enter to translate...'}
                        className="w-full flex-1 p-2.5 rounded-xl resize-none text-xs bg-black/5 dark:bg-white/5 border border-white/10 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] opacity-50">{sourceText.length} 字符</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSourceText('')}
                            className="px-2.5 py-1 text-xs rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                          >
                            {zh ? '清空' : 'Clear'}
                          </button>
                          <button
                            type="button"
                            onClick={handleTranslate}
                            disabled={translating || !sourceText.trim()}
                            className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 cursor-pointer"
                          >
                            {translating ? (zh ? '翻译中...' : 'Translating...') : (zh ? '翻译' : 'Translate')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 relative">
                      <div className="w-full flex-1 p-2.5 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-white/10 overflow-y-auto select-text">
                        {translatedText ? (
                          <p className="whitespace-pre-wrap">{translatedText}</p>
                        ) : (
                          <span className="opacity-40">{zh ? '翻译结果将显示在这里' : 'Translation will appear here'}</span>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(translatedText)}
                          disabled={!translatedText}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
                        >
                          <Copy size={12} />
                          <span>{zh ? '复制' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 文本处理 */}
              {tab === 'text' && (
                <div className="h-full flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <span>{zh ? `字数: ${textStats.words} · 字符数: ${textStats.chars} · 中文: ${textStats.chineseChars} · 英文: ${textStats.englishChars} · 行数: ${textStats.lines}` : `Words: ${textStats.words} · Chars: ${textStats.chars} · Chinese: ${textStats.chineseChars} · English: ${textStats.englishChars} · Lines: ${textStats.lines}`}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTextContent('')}
                        className="flex items-center gap-1 hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>{zh ? '清空' : 'Clear'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(textContent)}
                        className="flex items-center gap-1 hover:text-blue-400 cursor-pointer"
                      >
                        <Copy size={12} />
                        <span>{zh ? '复制' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder={zh ? '在此粘贴文本进行处理（去重、去空行、大小写转换、JSON格式化等，完全本地运行）...' : 'Paste text here to format, trim, convert case, deduplicate...'}
                    className="w-full flex-1 p-3 rounded-xl resize-none text-xs font-mono bg-black/5 dark:bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/10 dark:border-white/5">
                    {[
                      ['trim', zh ? '两端去空格' : 'Trim Lines'],
                      ['removeEmpty', zh ? '去除空行' : 'Remove Empty'],
                      ['removeDuplicate', zh ? '文本去重' : 'Unique Lines'],
                      ['upper', '大写 (UPPER)'],
                      ['lower', '小写 (lower)'],
                      ['jsonFormat', 'JSON 格式化'],
                      ['jsonCompress', 'JSON 压缩'],
                      ['urlEncode', 'URL 编码'],
                      ['urlDecode', 'URL 解码'],
                    ].map(([act, label]) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => processText(act)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 网络测速（全功能 Speedtest） */}
              {tab === 'network' && (
                <div className="h-full flex flex-col justify-between gap-2.5">
                  {/* 顶部控制栏 */}
                  <div className="flex items-center justify-between gap-3 pb-2 border-b border-black/5 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-2">
                      <Select
                        size="small"
                        value={speedNode}
                        onChange={(val) => setSpeedNode(val)}
                        options={speedNodeOptions}
                        style={{ width: 170 }}
                        popupClassName="utility-ant-dropdown"
                        disabled={testPhase !== 'idle' && testPhase !== 'completed' && testPhase !== 'error'}
                      />
                      <div className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-neutral-700 dark:text-neutral-300">
                        <span
                          className={`w-2 h-2 rounded-full transition-colors ${
                            online
                              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                              : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-[11px] font-medium">
                          {online ? (zh ? '已联网' : 'Online') : (zh ? '已断网' : 'Offline')}
                        </span>
                      </div>
                    </div>

                    {/* 进度条与评价/状态（测速按钮左侧） */}
                    <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
                      {/* 进度条：测速中或已有进度时展示 */}
                      {(testPhase !== 'idle' || progressPercent > 0) && (
                        <div className="flex items-center gap-1.5 w-32 shrink-0">
                          <Progress
                            percent={progressPercent}
                            showInfo={false}
                            size="small"
                            strokeColor={{ '0%': '#3b82f6', '50%': '#10b981', '100%': '#a855f7' }}
                            trailColor={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
                            className="m-0 flex-1"
                          />
                          <span className="text-[10px] font-mono font-medium opacity-60 w-6 text-right shrink-0">{progressPercent}%</span>
                        </div>
                      )}

                      {/* 状态 / 评价提示 */}
                      <div className="flex items-center gap-1.5 min-w-0 truncate text-right">
                        {testPhase !== 'idle' && testPhase !== 'completed' && testPhase !== 'error' ? (
                          <div className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400 text-xs shrink-0">
                            <RotateCcw size={11} className="animate-spin shrink-0" />
                            <span className="text-[11px] truncate max-w-[130px]">{speedStatusMsg}</span>
                          </div>
                        ) : speedRating ? (
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <Tag
                              color={speedRating.color}
                              icon={speedRating.icon}
                              className="m-0 text-[10px] px-1.5 py-0 border-0 font-medium inline-flex items-center gap-1 leading-tight shrink-0"
                            >
                              {speedRating.tag}
                            </Tag>
                            <span className="text-[11px] opacity-75 truncate max-w-[160px]">{speedRating.desc}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* 测速按钮 */}
                      <div className="shrink-0">
                        {testPhase !== 'idle' && testPhase !== 'completed' && testPhase !== 'error' ? (
                          <Button
                            danger
                            size="small"
                            icon={<RotateCcw size={13} className="animate-spin" />}
                            onClick={cancelSpeedTest}
                            className="flex items-center gap-1.5 text-xs font-medium"
                          >
                            {zh ? '停止测速' : 'Stop'}
                          </Button>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            icon={<Zap size={13} />}
                            onClick={runFullSpeedTest}
                            disabled={!online}
                            className="flex items-center gap-1.5 text-xs font-medium shadow-sm"
                          >
                            {speedResult.download !== null
                              ? (zh ? '重新测速' : 'Retest')
                              : (zh ? '开始测速' : 'Start Test')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 测速双排结构：
                      [下载曲线图（含实时速率/峰值）] [延迟卡片（Ping/抖动）]
                      [上传曲线图（含实时速率/吞吐）] [网络类型]
                  */}
                  <div className="flex-1 min-h-0 flex flex-col gap-2.5">
                    {/* 上排：下载曲线图 + 延迟卡片 */}
                    <div className="flex-1 min-h-[105px] grid grid-cols-12 gap-2.5">
                      {/* 下载曲线图 */}
                      <div className="col-span-8 p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 flex flex-col justify-between relative overflow-hidden">
                        <div className="flex items-center justify-between shrink-0 mb-1 z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                              <Download size={13} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                              {zh ? '下载速率' : 'Download'}
                            </span>
                            {testPhase === 'download' && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 animate-pulse">
                                Testing
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                              {testPhase === 'download'
                                ? currentSpeed.toFixed(1)
                                : (speedResult.download !== null ? speedResult.download : '—')}
                            </span>
                            <span className="text-[11px] font-semibold text-neutral-400">Mbps</span>
                            {speedResult.peakDownload !== null && (
                              <span className="ml-1.5 text-[10px] text-neutral-400 font-mono">
                                ({zh ? '峰值' : 'Peak'} {speedResult.peakDownload}M)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 下载平滑曲线绘制区域 */}
                        <div className="w-full flex-1 relative overflow-hidden rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-black/40 min-h-[56px]">
                          {/* Y 轴刻度 */}
                          <div className="absolute left-2 top-[12%] -translate-y-1/2 flex items-baseline gap-0.5 text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300 select-none pointer-events-none z-10">
                            <span>{speedChartData.download.maxVal}</span>
                            <span className="text-[9px] font-normal text-neutral-400">M</span>
                          </div>
                          <div className="absolute left-2 top-[50%] -translate-y-1/2 flex items-baseline gap-0.5 text-[11px] font-mono font-semibold text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            <span>{Math.round(speedChartData.download.maxVal / 2)}</span>
                            <span className="text-[9px] font-normal text-neutral-400">M</span>
                          </div>
                          <div className="absolute left-2 top-[84%] -translate-y-1/2 flex items-baseline text-[11px] font-mono font-semibold text-neutral-500 dark:text-neutral-500 select-none pointer-events-none z-10">
                            <span>0</span>
                          </div>

                          {/* X 轴刻度 */}
                          <div className="absolute left-[42px] bottom-0.5 text-[10px] font-mono font-medium text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            0s
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 text-[10px] font-mono font-medium text-neutral-500 dark:text-neutral-400 select-none pointer-events-none z-10">
                            {`${(SPEED_DL_DURATION / 2000).toFixed(0)}s`}
                          </div>
                          <div className="absolute right-2 bottom-0.5 text-[10px] font-mono font-medium text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            {`${(SPEED_DL_DURATION / 1000).toFixed(0)}s`}
                          </div>

                          <svg viewBox="0 0 480 96" preserveAspectRatio="none" className="w-full h-full pointer-events-none">
                            <defs>
                              <linearGradient id="dlAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                                <stop offset="85%" stopColor="#10b981" stopOpacity="0.05" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {[12, 44, 76].map((y) => (
                              <line key={`dl-h-${y}`} x1="42" y1={y} x2="468" y2={y} stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 4" />
                            ))}
                            {[42, 148, 255, 361, 468].map((x) => (
                              <line key={`dl-v-${x}`} x1={x} y1="12" x2={x} y2="76" stroke="currentColor" strokeOpacity="0.04" />
                            ))}
                            {speedChartData.download.hasData && (
                              <>
                                <path d={speedChartData.download.areaPath} fill="url(#dlAreaGrad)" />
                                <path d={speedChartData.download.linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx={speedChartData.download.lastX} cy={speedChartData.download.lastY} r="3.5" fill="#10b981" />
                                {testPhase === 'download' && (
                                  <circle cx={speedChartData.download.lastX} cy={speedChartData.download.lastY} r="3.5" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.55">
                                    <animate attributeName="r" values="3.5;8;3.5" dur="1.2s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.55;0;0.55" dur="1.2s" repeatCount="indefinite" />
                                  </circle>
                                )}
                              </>
                            )}
                          </svg>
                        </div>
                      </div>

                      {/* 延迟卡片 */}
                      <div className="col-span-4 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 flex flex-col justify-between overflow-hidden">
                        <div className="flex items-center justify-between shrink-0">
                          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{zh ? '延迟 Ping' : 'Ping'}</span>
                          <div className="w-5 h-5 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                            <Activity size={13} />
                          </div>
                        </div>
                        <div className="my-1.5 flex items-baseline gap-1.5">
                          <div className="text-[26px] leading-none font-black font-mono tracking-tight text-neutral-800 dark:text-neutral-100">
                            {speedResult.ping !== null ? `${speedResult.ping}` : '—'}
                          </div>
                          <span className="text-xs font-bold text-neutral-400">ms</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-black/5 dark:border-white/5">
                          <span className="text-neutral-500 dark:text-neutral-400 truncate">
                            {speedResult.jitter !== null ? `${zh ? '抖动' : 'Jitter'} ${speedResult.jitter} ms` : (zh ? '往返延时' : 'Round-trip')}
                          </span>
                          <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400/90 shrink-0">
                            {testPhase === 'ping' ? (zh ? '探测中' : 'Testing') : (zh ? '正常' : 'Optimal')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 下排：上传曲线图 + 网络类型 */}
                    <div className="flex-1 min-h-[105px] grid grid-cols-12 gap-2.5">
                      {/* 上传曲线图 */}
                      <div className="col-span-8 p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 flex flex-col justify-between relative overflow-hidden">
                        <div className="flex items-center justify-between shrink-0 mb-1 z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-md bg-purple-500/10 text-purple-400 flex items-center justify-center">
                              <Upload size={13} />
                            </div>
                            <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                              {zh ? '上传速率' : 'Upload'}
                            </span>
                            {testPhase === 'upload' && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-600 dark:text-purple-300 animate-pulse">
                                Testing
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-extrabold font-mono tracking-tight text-purple-600 dark:text-purple-400">
                              {testPhase === 'upload'
                                ? currentSpeed.toFixed(1)
                                : (speedResult.upload !== null ? speedResult.upload : '—')}
                            </span>
                            <span className="text-[11px] font-semibold text-neutral-400">Mbps</span>
                            <span className="ml-1.5 text-[10px] text-neutral-400 font-medium">
                              ({zh ? '上行吞吐' : 'Upstream'})
                            </span>
                          </div>
                        </div>

                        {/* 上传平滑曲线绘制区域 */}
                        <div className="w-full flex-1 relative overflow-hidden rounded-lg border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-black/40 min-h-[56px]">
                          {/* Y 轴刻度 */}
                          <div className="absolute left-2 top-[12%] -translate-y-1/2 flex items-baseline gap-0.5 text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300 select-none pointer-events-none z-10">
                            <span>{speedChartData.upload.maxVal}</span>
                            <span className="text-[9px] font-normal text-neutral-400">M</span>
                          </div>
                          <div className="absolute left-2 top-[50%] -translate-y-1/2 flex items-baseline gap-0.5 text-[11px] font-mono font-semibold text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            <span>{Math.round(speedChartData.upload.maxVal / 2)}</span>
                            <span className="text-[9px] font-normal text-neutral-400">M</span>
                          </div>
                          <div className="absolute left-2 top-[84%] -translate-y-1/2 flex items-baseline text-[11px] font-mono font-semibold text-neutral-500 dark:text-neutral-500 select-none pointer-events-none z-10">
                            <span>0</span>
                          </div>

                          {/* X 轴刻度 */}
                          <div className="absolute left-[42px] bottom-0.5 text-[10px] font-mono font-medium text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            0s
                          </div>
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-0.5 text-[10px] font-mono font-medium text-neutral-500 dark:text-neutral-400 select-none pointer-events-none z-10">
                            {`${(SPEED_UL_DURATION / 2000).toFixed(0)}s`}
                          </div>
                          <div className="absolute right-2 bottom-0.5 text-[10px] font-mono font-medium text-neutral-600 dark:text-neutral-400 select-none pointer-events-none z-10">
                            {`${(SPEED_UL_DURATION / 1000).toFixed(0)}s`}
                          </div>

                          <svg viewBox="0 0 480 96" preserveAspectRatio="none" className="w-full h-full pointer-events-none">
                            <defs>
                              <linearGradient id="upAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                                <stop offset="85%" stopColor="#a855f7" stopOpacity="0.05" />
                                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {[12, 44, 76].map((y) => (
                              <line key={`up-h-${y}`} x1="42" y1={y} x2="468" y2={y} stroke="currentColor" strokeOpacity="0.07" strokeDasharray="3 4" />
                            ))}
                            {[42, 148, 255, 361, 468].map((x) => (
                              <line key={`up-v-${x}`} x1={x} y1="12" x2={x} y2="76" stroke="currentColor" strokeOpacity="0.04" />
                            ))}
                            {speedChartData.upload.hasData && (
                              <>
                                <path d={speedChartData.upload.areaPath} fill="url(#upAreaGrad)" />
                                <path d={speedChartData.upload.linePath} fill="none" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx={speedChartData.upload.lastX} cy={speedChartData.upload.lastY} r="3.5" fill="#c084fc" />
                                {testPhase === 'upload' && (
                                  <circle cx={speedChartData.upload.lastX} cy={speedChartData.upload.lastY} r="3.5" fill="none" stroke="#c084fc" strokeWidth="1.5" opacity="0.55">
                                    <animate attributeName="r" values="3.5;8;3.5" dur="1.2s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.55;0;0.55" dur="1.2s" repeatCount="indefinite" />
                                  </circle>
                                )}
                              </>
                            )}
                          </svg>
                        </div>
                      </div>

                      {/* 网络类型卡片 */}
                      <div className="col-span-4 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/8 dark:border-white/10 flex flex-col justify-between overflow-hidden">
                        <div className="flex items-center justify-between shrink-0">
                          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{zh ? '网络类型' : 'Network'}</span>
                          <div className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                            <Wifi size={13} />
                          </div>
                        </div>
                        <div className="my-1.5">
                          <div className="text-[20px] leading-none font-bold text-neutral-800 dark:text-neutral-100 truncate">
                            {smartNetworkInfo.typeText}
                          </div>
                          <div className="text-[11px] font-medium text-neutral-400 mt-1 truncate">
                            {smartNetworkInfo.subText}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-black/5 dark:border-white/5">
                          <span className="text-neutral-500 dark:text-neutral-400 truncate">
                            {zh ? '网络状态' : 'Status'}
                          </span>
                          <span className={`text-[10px] font-medium shrink-0 ${online ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500'}`}>
                            {online ? (zh ? '已连接' : 'Connected') : (zh ? '已断开' : 'Offline')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 待办事项：一级仅展示列表；创建、查看与编辑均在二级页面完成。 */}
              {tab === 'todo' && (
                <div className="h-full relative overflow-hidden flex flex-col">
                  <div
                    key={`${todoPage}-${activeTodoId || 'root'}`}
                    className={`h-full flex flex-col gap-3 ${
                      todoNavDirection === 'forward' ? 'todo-page-anim-forward' : 'todo-page-anim-backward'
                    }`}
                  >
                    {todoPage === 'list' ? (
                    <>
                      <div className="flex items-center justify-between gap-3 pb-1 border-b border-black/5 dark:border-white/10">
                        <div>
                          <div className="text-sm font-semibold">{zh ? '待办事项' : 'Tasks'}</div>
                          <div className="text-[11px] opacity-55 mt-0.5">
                            {zh ? `未完成 ${pendingCount} 项${todos.length ? ` · 共 ${todos.length} 项` : ''}` : `${pendingCount} pending${todos.length ? ` · ${todos.length} total` : ''}`}
                          </div>
                        </div>
                        <Button type="primary" size="small" icon={<Plus size={14} />} onClick={handleStartCreate} className="flex items-center gap-1.5 text-xs font-medium shadow-sm">
                          {zh ? '新建待办' : 'New task'}
                        </Button>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                        {todos.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center gap-2 text-xs opacity-45">
                            <CheckSquare size={22} strokeWidth={1.5} />
                            <span>{zh ? '暂无待办事项' : 'No tasks yet'}</span>
                          </div>
                        ) : (
                          todos.map((item) => (
                            <div key={item.id} className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-white/5 bg-black/5 dark:bg-white/5 hover:border-blue-400/40 hover:bg-blue-500/5 transition-all cursor-pointer" onClick={() => handleOpenDetail(item)}>
                              <button type="button" onClick={(event) => { event.stopPropagation(); toggleTodo(item.id); }} className={`w-4 h-4 rounded flex items-center justify-center border transition-colors cursor-pointer shrink-0 ${item.completed ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/30 hover:border-blue-400'}`}>
                                {item.completed && <Check size={11} />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className={`text-xs font-medium truncate ${item.completed ? 'line-through opacity-40' : ''}`}>{item.title}</div>
                                <div className="mt-1 flex items-center gap-2 text-[10px] opacity-50">
                                  {item.dueDate && <span className="flex items-center gap-1"><Calendar size={10} />{item.dueDate}</span>}
                                  {item.content && <span className="truncate">{item.content}</span>}
                                </div>
                              </div>
                              <ChevronDown size={14} className="-rotate-90 opacity-35 group-hover:opacity-80 shrink-0" />
                            </div>
                          ))
                        )}
                      </div>

                      {todos.some((item) => item.completed) && (
                        <div className="flex justify-end pt-1 border-t border-white/10 dark:border-white/5">
                          <button type="button" onClick={clearCompletedTodos} className="text-[11px] opacity-60 hover:opacity-100 hover:text-red-400 cursor-pointer">{zh ? '清除所有已完成' : 'Clear all completed'}</button>
                        </div>
                      )}
                    </>
                  ) : todoPage === 'detail' ? (
                    (() => {
                      const current = todos.find((t) => t.id === activeTodoId);
                      if (!current) {
                        return (
                          <div className="h-full flex flex-col items-center justify-center gap-3 text-xs opacity-60">
                            <span>{zh ? '待办事项不存在或已被删除' : 'Task not found or deleted'}</span>
                            <Button size="small" onClick={handleBackToList}>{zh ? '返回列表' : 'Back to list'}</Button>
                          </div>
                        );
                      }
                      return (
                        <div className="h-full flex flex-col">
                          {/* 顶部极简工具栏 */}
                          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
                            <button
                              type="button"
                              onClick={handleBackToList}
                              className="flex items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100 hover:text-blue-500 transition-colors cursor-pointer"
                            >
                              <ArrowLeft size={15} /> {zh ? '全部待办' : 'All Tasks'}
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleTodo(current.id)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  current.completed
                                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                title={current.completed ? (zh ? '标记为未完成' : 'Mark incomplete') : (zh ? '标记为已完成' : 'Mark complete')}
                              >
                                {current.completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                <span>{current.completed ? (zh ? '已完成' : 'Completed') : (zh ? '未完成' : 'Pending')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartEditFromDetail(current)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium opacity-75 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                title={zh ? '编辑事项' : 'Edit task'}
                              >
                                <Edit2 size={13} />
                                <span>{zh ? '编辑' : 'Edit'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTodo(current.id)}
                                className="p-1 rounded-md text-red-400/80 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title={zh ? '删除事项' : 'Delete task'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* 笔记正文：纯粹舒适的文档排版流 */}
                          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1 py-1 flex flex-col select-text">
                            <h1 className={`text-lg font-bold tracking-tight leading-snug break-words ${
                              current.completed ? 'line-through opacity-40' : 'text-neutral-900 dark:text-neutral-100'
                            }`}>
                              {current.title}
                            </h1>

                            {current.dueDate && (
                              <div className="mt-2 mb-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                <Calendar size={13} className="shrink-0 opacity-70" />
                                <span className="font-mono text-[12px]">{current.dueDate}</span>
                                {current.dueDate === getTodayString() && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                    {zh ? '今天截止' : 'Due today'}
                                  </span>
                                )}
                              </div>
                            )}

                            <div className="h-px bg-black/[0.05] dark:bg-white/[0.07] my-1 shrink-0" />

                            {current.content ? (
                              <div className="pt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
                                {current.content}
                              </div>
                            ) : (
                              <div
                                onClick={() => handleStartEditFromDetail(current)}
                                className="pt-4 text-xs opacity-40 italic cursor-pointer hover:opacity-70 transition-opacity"
                              >
                                {zh ? '暂无正文内容，点击此处或右上角“编辑”补充说明...' : 'No content yet. Click here or Edit to add notes...'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-full flex flex-col">
                      {/* 编辑态顶部栏 */}
                      <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="flex items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100 hover:text-blue-500 transition-colors cursor-pointer"
                        >
                          <ArrowLeft size={15} /> {editingTodoId ? (zh ? '取消' : 'Cancel') : (zh ? '返回' : 'Back')}
                        </button>
                        <div className="flex items-center gap-2">
                          {editingTodoId && (
                            <button
                              type="button"
                              onClick={() => deleteTodo(editingTodoId)}
                              className="p-1 rounded-md text-red-400/80 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title={zh ? '删除待办' : 'Delete task'}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <Button
                            type="primary"
                            size="small"
                            onClick={handleSaveTodo}
                            disabled={!todoTitle.trim()}
                            className="text-xs px-3 font-medium shadow-none"
                          >
                            {zh ? '完成' : 'Done'}
                          </Button>
                        </div>
                      </div>

                      {/* 无边框笔记式书写区 */}
                      <div className="flex-1 min-h-0 flex flex-col px-1 py-1 overflow-y-auto custom-scrollbar">
                        <input
                          type="text"
                          value={todoTitle}
                          onChange={(event) => setTodoTitle(event.target.value)}
                          placeholder={zh ? '事项标题...' : 'Task title...'}
                          autoFocus
                          className="w-full text-lg font-bold bg-transparent border-none outline-none focus:outline-none placeholder:opacity-35 text-neutral-900 dark:text-neutral-100 tracking-tight"
                        />

                        <div className="mt-2 mb-2 flex items-center gap-2">
                          <DatePicker
                            value={todoDueDate ? dayjs(todoDueDate) : null}
                            onChange={(_, dateString) => setTodoDueDate(typeof dateString === 'string' ? dateString : '')}
                            placeholder={zh ? '选择截止日期' : 'Add due date'}
                            allowClear
                            variant="borderless"
                            size="small"
                            className="px-0 text-xs w-36 hover:bg-black/[0.03] dark:hover:bg-white/[0.05] rounded transition-colors"
                            popupClassName="utility-ant-dropdown"
                          />
                        </div>

                        <div className="h-px bg-black/[0.05] dark:bg-white/[0.07] my-1 shrink-0" />

                        <textarea
                          value={todoContent}
                          onChange={(event) => setTodoContent(event.target.value)}
                          placeholder={zh ? '在此输入笔记正文或详细说明...' : 'Write note description or details here...'}
                          className="w-full flex-1 min-h-[160px] bg-transparent border-none outline-none focus:outline-none resize-none text-[13px] leading-relaxed placeholder:opacity-35 text-neutral-700 dark:text-neutral-300 custom-scrollbar"
                        />
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}

              {/* 倒数日 / 纪念日 */}
              {tab === 'countdown' && (
                <div className="h-full flex flex-col gap-3">
                  {/* 顶部标题栏与新建按钮 */}
                  <div className="flex items-center justify-between gap-3 pb-1 border-b border-black/5 dark:border-white/10 shrink-0">
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        <span>{t.countdownTitle}</span>
                        <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400">
                          {pinnedCountdowns.length} {zh ? '已置顶桌面' : 'pinned'}
                        </span>
                      </div>
                    </div>
                    <Button
                      type="primary"
                      size="small"
                      icon={<Plus size={14} />}
                      onClick={handleOpenAddCountdown}
                      className="flex items-center gap-1.5 text-xs font-medium shadow-sm cursor-pointer"
                    >
                      {t.addCountdown}
                    </Button>
                  </div>

                  {/* 分类过滤标签 */}
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 py-0.5">
                    {[
                      { key: 'all', label: zh ? '全部' : 'All' },
                      { key: 'work', label: t.catWork },
                      { key: 'life', label: t.catLife },
                      { key: 'holiday', label: t.catHoliday },
                      { key: 'anniversary', label: t.catAnniversary },
                      { key: 'target', label: t.catTarget },
                    ].map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setCountdownFilter(cat.key)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer select-none shrink-0 ${
                          countdownFilter === cat.key
                            ? 'bg-blue-500 text-white shadow-xs'
                            : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* 倒数日卡片列表 */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {filteredCountdowns.length === 0 ? (
                      <div className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2.5 text-xs opacity-45">
                        <CalendarClock size={28} strokeWidth={1.5} />
                        <span>{t.countdownEmpty}</span>
                        <Button size="small" onClick={handleOpenAddCountdown}>
                          {t.addCountdown}
                        </Button>
                      </div>
                    ) : (
                      filteredCountdowns.map((item) => {
                        const status = calculateCountdownStatus(item, language);
                        return (
                          <div
                            key={item.id}
                            className="group flex items-center justify-between gap-3 p-3 rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] hover:border-blue-400/40 hover:bg-blue-500/[0.04] transition-all"
                          >
                            {/* 左侧大数字与类型 */}
                            <div
                              className="w-20 sm:w-24 shrink-0 flex flex-col items-center justify-center p-2 rounded-xl text-center"
                              style={{
                                backgroundColor: `${status.color}15`,
                              }}
                            >
                              <div
                                className="text-xl sm:text-2xl font-black font-mono tracking-tight leading-none"
                                style={{ color: status.color }}
                              >
                                {status.type === 'progress' ? `${status.percent}%` : status.days}
                              </div>
                              <div
                                className="text-[10px] font-semibold mt-1 truncate max-w-full"
                                style={{ color: status.color }}
                              >
                                {status.displayText}
                              </div>
                            </div>

                            {/* 中间信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-neutral-700 dark:text-neutral-200">
                                  <CountdownIcon name={item.icon} size={14} />
                                </div>
                                <span className="font-semibold text-sm truncate text-neutral-800 dark:text-neutral-100">
                                  {item.title}
                                </span>
                                {item.isPreset && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 shrink-0 font-medium">
                                    {zh ? '动态预设' : 'Preset'}
                                  </span>
                                )}
                              </div>

                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs opacity-60">
                                <span className="flex items-center gap-1 font-mono text-[11px]">
                                  <Calendar size={11} />
                                  {status.nextDateStr}
                                </span>
                                {item.repeat && item.repeat !== 'none' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 font-medium">
                                    {item.repeat === 'yearly'
                                      ? t.countdownRepeatYearly
                                      : item.repeat === 'monthly'
                                      ? t.countdownRepeatMonthly
                                      : t.countdownRepeatWeekly}
                                  </span>
                                )}
                                {status.type === 'milestone' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-500/10 text-pink-500 font-medium">
                                    {t.catAnniversary}
                                  </span>
                                )}
                              </div>

                              {/* 如果是进度条类展示 mini progress */}
                              {status.type === 'progress' && status.percent !== undefined && (
                                <div className="mt-2 w-full max-w-xs">
                                  <Progress
                                    percent={status.percent}
                                    size="small"
                                    showInfo={false}
                                    strokeColor={status.color}
                                  />
                                </div>
                              )}
                            </div>

                            {/* 右侧操作按钮 */}
                            <div className="flex items-center gap-1 shrink-0">
                              <Tooltip title={item.isPinned ? (zh ? '已置顶桌面胶囊' : 'Pinned') : t.pinToClock}>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePinCountdown(item)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    item.isPinned
                                      ? 'border-blue-400 bg-blue-500/15 text-blue-500 dark:text-blue-400 scale-105'
                                      : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/5 dark:hover:bg-white/10'
                                  }`}
                                >
                                  <Pin size={15} className={item.isPinned ? 'fill-current' : ''} />
                                </button>
                              </Tooltip>

                              {!item.isPreset && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditCountdown(item)}
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                  title={zh ? '编辑' : 'Edit'}
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDeleteCountdown(item)}
                                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                                title={zh ? '删除' : 'Delete'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 倒数日新建/编辑弹窗 */}
          <Modal
            title={editingCountdown ? t.editCountdown : t.addCountdown}
            open={isCountdownModalOpen}
            onOk={handleSaveCountdownModal}
            onCancel={() => setIsCountdownModalOpen(false)}
            okText={zh ? '保存' : 'Save'}
            cancelText={zh ? '取消' : 'Cancel'}
            centered
            width={440}
            destroyOnClose
          >
            <Form form={countdownForm} layout="vertical" className="mt-3">
              <Form.Item
                label={t.countdownName}
                name="title"
                rules={[{ required: true, message: zh ? '请输入事项名称' : 'Please input title' }]}
              >
                <Input placeholder={zh ? '例如：产品发版、考研初试、生日' : 'e.g. Project Launch, Birthday'} maxLength={30} />
              </Form.Item>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  label={t.countdownDate}
                  name="targetDate"
                  rules={[{ required: true, message: zh ? '请选择目标日期' : 'Please select date' }]}
                >
                  <DatePicker className="w-full" allowClear={false} />
                </Form.Item>

                <Form.Item label={t.countdownRepeat} name="repeat">
                  <Select
                    options={[
                      { value: 'none', label: t.countdownRepeatNone },
                      { value: 'yearly', label: t.countdownRepeatYearly },
                      { value: 'monthly', label: t.countdownRepeatMonthly },
                      { value: 'weekly', label: t.countdownRepeatWeekly },
                    ]}
                  />
                </Form.Item>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Form.Item label={t.countdownCategory} name="category">
                  <Select
                    options={[
                      { value: 'work', label: t.catWork },
                      { value: 'life', label: t.catLife },
                      { value: 'holiday', label: t.catHoliday },
                      { value: 'birthday', label: t.catBirthday },
                      { value: 'anniversary', label: t.catAnniversary },
                      { value: 'target', label: t.catTarget },
                      { value: 'other', label: t.catOther },
                    ]}
                  />
                </Form.Item>

                <Form.Item label={zh ? '图标' : 'Icon'} name="icon">
                  <Select
                    options={COUNTDOWN_ICON_OPTIONS.map((opt) => ({
                      value: opt.id,
                      label: (
                        <div className="flex items-center gap-2">
                          <opt.Icon size={14} className="text-blue-500 shrink-0" />
                          <span>{zh ? opt.labelZh : opt.labelEn}</span>
                        </div>
                      ),
                    }))}
                  />
                </Form.Item>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="text-xs font-semibold">{t.pinToClock}</div>
                <Form.Item name="isPinned" valuePropName="checked" className="mb-0">
                  <Switch checkedChildren={zh ? '开' : 'On'} unCheckedChildren={zh ? '关' : 'Off'} />
                </Form.Item>
              </div>
            </Form>
          </Modal>
        </ConfigProvider>
        </div>
      </div>
      {/* 复制提示气泡 */}
      {copiedNotice && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] px-3 py-1.5 rounded-lg bg-black/80 text-white text-xs shadow-lg pointer-events-none animate-in fade-in">
          {copiedNotice}
        </div>
      )}
    </>
  );
};
