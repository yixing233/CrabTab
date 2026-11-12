import React from 'react';
import {
  IconBriefcase,
  IconCake,
  IconCalendarClock,
  IconDeviceLaptop,
  IconFlag,
  IconFlame,
  IconGift,
  IconHeart,
  IconHourglass,
  IconPlane,
  IconRocket,
  IconSparkles,
  IconSun,
  IconTarget,
} from '@tabler/icons-react';

export const COUNTDOWN_ICON_OPTIONS = [
  { id: 'target', labelZh: '目标', labelEn: 'Target', Icon: IconTarget },
  { id: 'cake', labelZh: '生日', labelEn: 'Birthday', Icon: IconCake },
  { id: 'sparkles', labelZh: '节日', labelEn: 'Festival', Icon: IconSparkles },
  { id: 'rocket', labelZh: '起航', labelEn: 'Launch', Icon: IconRocket },
  { id: 'hourglass', labelZh: '时间', labelEn: 'Time', Icon: IconHourglass },
  { id: 'heart', labelZh: '纪念', labelEn: 'Love', Icon: IconHeart },
  { id: 'plane', labelZh: '旅行', labelEn: 'Travel', Icon: IconPlane },
  { id: 'briefcase', labelZh: '工作', labelEn: 'Work', Icon: IconBriefcase },
  { id: 'laptop', labelZh: '开发', labelEn: 'Dev', Icon: IconDeviceLaptop },
  { id: 'gift', labelZh: '礼物', labelEn: 'Gift', Icon: IconGift },
  { id: 'flag', labelZh: '里程碑', labelEn: 'Milestone', Icon: IconFlag },
  { id: 'flame', labelZh: '冲刺', labelEn: 'Sprint', Icon: IconFlame },
  { id: 'sun', labelZh: '假期', labelEn: 'Vacation', Icon: IconSun },
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
  strokeWidth?: number;
}

export const CountdownIcon: React.FC<CountdownIconProps> = ({
  name = 'target',
  size = 14,
  className = '',
  strokeWidth = 2,
}) => {
  const normalized = (name && EMOJI_TO_LUCIDE[name]) ? EMOJI_TO_LUCIDE[name] : name;

  switch (normalized) {
    case 'cake':
      return <IconCake size={size} strokeWidth={strokeWidth} className={className} />;
    case 'sparkles':
      return <IconSparkles size={size} strokeWidth={strokeWidth} className={className} />;
    case 'rocket':
      return <IconRocket size={size} strokeWidth={strokeWidth} className={className} />;
    case 'hourglass':
      return <IconHourglass size={size} strokeWidth={strokeWidth} className={className} />;
    case 'heart':
      return <IconHeart size={size} strokeWidth={strokeWidth} className={className} />;
    case 'plane':
      return <IconPlane size={size} strokeWidth={strokeWidth} className={className} />;
    case 'briefcase':
      return <IconBriefcase size={size} strokeWidth={strokeWidth} className={className} />;
    case 'laptop':
      return <IconDeviceLaptop size={size} strokeWidth={strokeWidth} className={className} />;
    case 'gift':
      return <IconGift size={size} strokeWidth={strokeWidth} className={className} />;
    case 'flag':
      return <IconFlag size={size} strokeWidth={strokeWidth} className={className} />;
    case 'flame':
      return <IconFlame size={size} strokeWidth={strokeWidth} className={className} />;
    case 'sun':
      return <IconSun size={size} strokeWidth={strokeWidth} className={className} />;
    case 'target':
      return <IconTarget size={size} strokeWidth={strokeWidth} className={className} />;
    default:
      return <IconCalendarClock size={size} strokeWidth={strokeWidth} className={className} />;
  }
};
