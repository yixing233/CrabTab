import React from 'react';
import {
  Target,
  CalendarClock,
  Sparkles,
  Rocket,
  Hourglass,
  Heart,
  Plane,
  Briefcase,
  Laptop,
  Cake,
  Gift,
  Flag,
  Flame,
  Sun,
} from 'lucide-react';

export const COUNTDOWN_ICON_OPTIONS = [
  { id: 'target', labelZh: '目标', labelEn: 'Target', Icon: Target },
  { id: 'cake', labelZh: '生日', labelEn: 'Birthday', Icon: Cake },
  { id: 'sparkles', labelZh: '节日', labelEn: 'Festival', Icon: Sparkles },
  { id: 'rocket', labelZh: '起航', labelEn: 'Launch', Icon: Rocket },
  { id: 'hourglass', labelZh: '时间', labelEn: 'Time', Icon: Hourglass },
  { id: 'heart', labelZh: '纪念', labelEn: 'Love', Icon: Heart },
  { id: 'plane', labelZh: '旅行', labelEn: 'Travel', Icon: Plane },
  { id: 'briefcase', labelZh: '工作', labelEn: 'Work', Icon: Briefcase },
  { id: 'laptop', labelZh: '开发', labelEn: 'Dev', Icon: Laptop },
  { id: 'gift', labelZh: '礼物', labelEn: 'Gift', Icon: Gift },
  { id: 'flag', labelZh: '里程碑', labelEn: 'Milestone', Icon: Flag },
  { id: 'flame', labelZh: '冲刺', labelEn: 'Sprint', Icon: Flame },
  { id: 'sun', labelZh: '假期', labelEn: 'Vacation', Icon: Sun },
];

const EMOJI_TO_LUCIDE: Record<string, string> = {
  '🎯': 'target',
  '🎂': 'cake',
  '🎉': 'sparkles',
  '🚀': 'rocket',
  '⏳': 'hourglass',
  '❤️': 'heart',
  '✈️': 'plane',
  '💼': 'briefcase',
  '🏖️': 'sun',
  '💻': 'laptop',
  '🎁': 'gift',
  '🚩': 'flag',
  '🔥': 'flame',
};

interface CountdownIconProps {
  name?: string;
  size?: number;
  className?: string;
}

export const CountdownIcon: React.FC<CountdownIconProps> = ({
  name = 'target',
  size = 14,
  className = '',
}) => {
  const normalized = (name && EMOJI_TO_LUCIDE[name]) ? EMOJI_TO_LUCIDE[name] : name;

  switch (normalized) {
    case 'cake':
      return <Cake size={size} className={className} />;
    case 'sparkles':
      return <Sparkles size={size} className={className} />;
    case 'rocket':
      return <Rocket size={size} className={className} />;
    case 'hourglass':
      return <Hourglass size={size} className={className} />;
    case 'heart':
      return <Heart size={size} className={className} />;
    case 'plane':
      return <Plane size={size} className={className} />;
    case 'briefcase':
      return <Briefcase size={size} className={className} />;
    case 'laptop':
      return <Laptop size={size} className={className} />;
    case 'gift':
      return <Gift size={size} className={className} />;
    case 'flag':
      return <Flag size={size} className={className} />;
    case 'flame':
      return <Flame size={size} className={className} />;
    case 'sun':
      return <Sun size={size} className={className} />;
    case 'target':
      return <Target size={size} className={className} />;
    default:
      return <CalendarClock size={size} className={className} />;
  }
};
