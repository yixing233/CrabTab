/**
 * CrabTab 首屏缩放引导脚本（外部文件，非内联）
 *
 * 为什么必须是独立文件：MV3 扩展页面的 CSP 为 `script-src 'self'`，页面内联
 * <script> 会被直接拒绝执行（控制台报 "Executing inline script violates the
 * following Content Security Policy directive 'script-src 'self''"）。原先把这段
 * 逻辑内联在 index.html 里，导致扩展环境下整段缩放引导被拦下 —— 首屏
 * --ui-scale 只有 React 挂载后才补上，用户自定义缩放会出现一次可见的跳变。
 *
 * 关键约束：这段逻辑必须在样式与 React 挂载之前同步执行，否则缩放会晚一帧生效，
 * 因此以普通（非 module、非 defer）脚本放在 <head> 中，保证阻塞式顺序执行。
 */
(function () {
  function apply(scale) {
    var n = typeof scale === 'number' && isFinite(scale) ? scale : 100;
    if (n < 80 || n > 140) n = 100;
    var root = document.documentElement;
    root.style.setProperty('--ui-scale', String(n / 100));
    if (n !== 100) {
      root.style.zoom = n + '%';
    }
  }

  // 通道 1：localStorage（普通网页调试与扩展环境都有）
  try {
    var raw = localStorage.getItem('crab_home_settings_v1');
    if (raw) {
      var s = JSON.parse(raw);
      if (s && s.uiScale) apply(s.uiScale);
    }
  } catch (e) {}

  // 通道 2：chrome.storage.local（扩展环境的权威介质）
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('crab_home_settings_v1', function (res) {
        var s = res && res['crab_home_settings_v1'];
        if (s && s.uiScale) apply(s.uiScale);
      });
    }
  } catch (e) {}
})();
