import React from 'react';
import { SearchEngineId } from '../types';

import googleSvg from '../assets/icons/google.svg';
import bingSvg from '../assets/icons/bing.svg';
import baiduSvg from '../assets/icons/baidu.svg';
import duckduckgoSvg from '../assets/icons/duckduckgo.svg';
import githubSvg from '../assets/icons/github.svg';
import bilibiliSvg from '../assets/icons/bilibili.svg';

interface SearchEngineIconProps {
  engineId: SearchEngineId;
  className?: string;
  size?: number;
}

export const ENGINE_ICON_URLS: Record<SearchEngineId, string> = {
  google: googleSvg,
  bing: bingSvg,
  baidu: baiduSvg,
  duckduckgo: duckduckgoSvg,
  github: githubSvg,
  bilibili: bilibiliSvg,
};

export const SearchEngineIcon: React.FC<SearchEngineIconProps> = ({
  engineId,
  className = '',
  size = 18,
}) => {
  const iconUrl = ENGINE_ICON_URLS[engineId] || googleSvg;
  const isGithub = engineId === 'github';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={iconUrl}
        alt={engineId}
        className={`w-full h-full object-contain ${
          isGithub ? 'dark:invert dark:brightness-200' : ''
        }`}
        loading="eager"
        decoding="sync"
      />
    </span>
  );
};

export default SearchEngineIcon;
