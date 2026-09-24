/**
 * CrabTab - Background Service Worker
 *
 * 负责管理扩展上下文菜单（右键菜单）以及快捷方式后台写入与状态反馈。
 */

const SHORTCUTS_KEY = 'crab_home_shortcuts_v1';
const SHORTCUTS_BACKUP_KEY = 'crab_home_shortcuts_v1_backup';

/**
 * 规范化并校验 URL 是否可作为快捷方式
 */
function isValidShortcutUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // 过滤浏览器内部页面与非网络协议页面
  if (
    trimmed.startsWith('chrome://') ||
    trimmed.startsWith('edge://') ||
    trimmed.startsWith('chrome-extension://') ||
    trimmed.startsWith('devtools://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('view-source:') ||
    trimmed.startsWith('javascript:')
  ) {
    return false;
  }
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * 提取备用友好标题
 */
function getFallbackTitle(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '') || '快捷方式';
  } catch {
    return '快捷方式';
  }
}

/**
 * 保存快捷方式到 chrome.storage.local
 */
async function addShortcutToStorage({ title, url, icon }) {
  if (!isValidShortcutUrl(url)) {
    showBadgeFeedback('!', '#ef4444');
    return { success: false, reason: 'invalid_url' };
  }

  const finalUrl = url.trim();
  const finalTitle = (title && title.trim()) ? title.trim() : getFallbackTitle(finalUrl);

  try {
    const data = await chrome.storage.local.get([SHORTCUTS_KEY]);
    const currentShortcuts = Array.isArray(data[SHORTCUTS_KEY]) ? data[SHORTCUTS_KEY] : [];

    // 检查是否已有完全匹配的网址
    const existingIndex = currentShortcuts.findIndex((s) => s.url === finalUrl);
    let updatedShortcuts;

    if (existingIndex >= 0) {
      // 若已存在，更新标题与图标
      updatedShortcuts = currentShortcuts.map((s, idx) =>
        idx === existingIndex
          ? { ...s, title: finalTitle, icon: icon || s.icon }
          : s
      );
    } else {
      // 若不存在，新增并推入末尾
      const newShortcut = {
        id: String(Date.now()),
        title: finalTitle,
        url: finalUrl,
        icon: icon || undefined,
      };
      updatedShortcuts = [...currentShortcuts, newShortcut];
    }

    await chrome.storage.local.set({
      [SHORTCUTS_KEY]: updatedShortcuts,
      [SHORTCUTS_BACKUP_KEY]: updatedShortcuts,
    });

    showBadgeFeedback('✓', '#10b981');
    return { success: true, updated: existingIndex >= 0, shortcut: { title: finalTitle, url: finalUrl } };
  } catch (err) {
    console.error('[CrabTab Background] 保存快捷方式失败:', err);
    showBadgeFeedback('!', '#ef4444');
    return { success: false, reason: 'storage_error', error: err };
  }
}

/**
 * 在扩展图标上显示暂存角标反馈
 */
function showBadgeFeedback(text, color) {
  if (!chrome.action) return;
  try {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2500);
  } catch {
    // 忽略异常
  }
}

/**
 * 初始化扩展右键菜单与操作菜单
 */
function initContextMenus() {
  if (!chrome.contextMenus) return;

  chrome.contextMenus.removeAll(() => {
    // 1. 网页上下文与扩展图标上下文：添加当前网页为快捷方式
    chrome.contextMenus.create({
      id: 'crabtab-add-page-to-shortcuts',
      title: '添加当前网页为快捷方式',
      contexts: ['page', 'action'],
    });

    // 2. 超链接上下文：添加链接为快捷方式
    chrome.contextMenus.create({
      id: 'crabtab-add-link-to-shortcuts',
      title: '添加链接为快捷方式',
      contexts: ['link'],
    });

    // 3. 扩展图标上下文：打开书签侧边栏
    chrome.contextMenus.create({
      id: 'crabtab-open-sidepanel',
      title: '打开书签侧边栏 (Alt+S)',
      contexts: ['action'],
    });

    // 4. 扩展图标上下文：打开 CrabTab 起始页
    chrome.contextMenus.create({
      id: 'crabtab-open-newtab',
      title: '打开 CrabTab 新标签页',
      contexts: ['action'],
    });
  });
}

// 扩展安装或更新时注册菜单
chrome.runtime.onInstalled.addListener(() => {
  initContextMenus();
});

// 浏览器启动时确保菜单注册
chrome.runtime.onStartup.addListener(() => {
  initContextMenus();
});

// 处理右键菜单点击
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'crabtab-add-page-to-shortcuts') {
    const targetUrl = tab?.url || info.pageUrl;
    const targetTitle = tab?.title || '';
    const targetIcon = tab?.favIconUrl || '';
    await addShortcutToStorage({ title: targetTitle, url: targetUrl, icon: targetIcon });
  } else if (info.menuItemId === 'crabtab-add-link-to-shortcuts') {
    const targetUrl = info.linkUrl;
    const targetTitle = (info.selectionText || '').trim();
    await addShortcutToStorage({ title: targetTitle, url: targetUrl });
  } else if (info.menuItemId === 'crabtab-open-sidepanel') {
    if (chrome.sidePanel?.open) {
      const targetWindowId = tab?.windowId;
      if (targetWindowId) {
        chrome.sidePanel.open({ windowId: targetWindowId }).catch(console.error);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].windowId) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(console.error);
          }
        });
      }
    }
  } else if (info.menuItemId === 'crabtab-open-newtab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  }
});

// 全局快捷键监听
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'open_side_panel') {
    if (chrome.sidePanel?.open) {
      try {
        const win = await chrome.windows.getLastFocused({ populate: false });
        if (win?.id) {
          await chrome.sidePanel.open({ windowId: win.id });
        }
      } catch (err) {
        console.warn('[CrabTab Background] 快捷键呼出侧边栏捕获:', err);
      }
    }
  }
});

// 监听来自前台的消息请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'ADD_SHORTCUT') {
    addShortcutToStorage(message.payload).then(sendResponse);
    return true; // 保持异步消息通道开启
  }
  if (message?.type === 'CHECK_SHORTCUT_EXISTS') {
    const targetUrl = message.payload?.url;
    chrome.storage.local.get([SHORTCUTS_KEY]).then((data) => {
      const list = Array.isArray(data[SHORTCUTS_KEY]) ? data[SHORTCUTS_KEY] : [];
      const exists = list.some((s) => s.url === targetUrl);
      sendResponse({ exists });
    });
    return true;
  }
});
