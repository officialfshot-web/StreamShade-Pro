// StreamShade Pro - Original Gentle Approach
// Hides timer/premium popup, auto-clicks "go to show" and "continue watching"
// Does NOT use aggressive ad blocking - moves elements off-screen instead

(function() {
  'use strict';

  // ===== CONFIGURATION =====
  const DEFAULT_INTRO_SKIP = 40;
  const DEFAULT_FULLSCREEN_DELAY = 35;

  // ===== STATE =====
  let videoElement = null;
  let videoContainer = null;
  let currentShowId = null;
  let closeInterval = null;
  let observer = null;

  let settings = {
    // StreamShade features
    autoCloseEnabled: true,
    continueWatchingEnabled: true,
    
    // Skipper features
    introStartSeconds: 0,
    introSkipSeconds: DEFAULT_INTRO_SKIP,
    fullscreenDelaySeconds: DEFAULT_FULLSCREEN_DELAY,
    outroStart: null,
    autoSkipOutro: true,
    skipIntro: true,
    autoFullscreen: true,
    autoLearnIntro: true,
    showNotifications: true,
    defaultSpeed: 1,

    // Bedtime mode
    bedtimeEnabled: false,
    bedtimeTime: '23:00',
    bedtimeUrl: 'https://www.youtube.com/watch?v=HH0pojCvq44',

    // UI
    fastStartup: true,
    autoClickSkipOverlays: true,
    defaultVolume: null,

    // Outro
    autoDetectOutro: true,

    // Audio fingerprinting for intro detection
    audioFingerprintIntro: false,

    // Universal Auto-Click
    universalAutoClick: true,
    autoClickDelay: 500,

    // Generic Popup Auto-Clicker
    popupAutoClick: true,
    popupClickDelay: 300,
    popupSelectors: [
      // Common popup/dialog patterns
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[role="modal"]',
      '.modal',
      '.popup',
      '.dialog',
      '.overlay',
      '.lightbox',
      // High z-index elements (likely popups)
      '*[style*="z-index"]',
      // Fixed positioned elements (likely overlays)
      '*[style*="position: fixed"]',
      // Elements with backdrop
      '.backdrop',
      '.modal-backdrop',
      '.overlay-backdrop'
    ],

    // Per-show settings
    perShowSettings: {},
    customSegments: []
  };
  
  let state = {
    hasSkippedIntro: false,
    hasSkippedOutro: false,
    hasGoneFullscreen: false,
    fullscreenTimer: null,
    introSkipTimeout: null,
    outroSkipTimeout: null,
    isProcessing: false,
    isFullscreenProcessing: false,
    fullscreenTargetTime: null,
    fullscreenAttempted: false,
    fullscreenAwaitingGesture: false,
    skippedSegments: new Set(),
    stats: {
      totalTimeSaved: 0,
      introsSkipped: 0,
      outrosSkipped: 0,
      segmentsSkipped: 0
    }
  };

  let notificationEl = null;
  let controlsEl = null;
  let speedIndicatorEl = null;
  let skipOutroOverlayEl = null;
  let skipOutroOverlayTimer = null;
  let skipOutroProgressEl = null;
  let skipIntroOverlayEl = null;
  let skipIntroOverlayTimer = null;
  let skipIntroProgressEl = null;
  let floatingControlsHoverVideo = null;
  let floatingHideTimer = null;
  let bedtimeTimer = null;
  let keyboardShortcutsInstalled = false;

  // Audio fingerprinting
  let audioContext = null;
  let audioSource = null;
  let audioAnalyser = null;
  let audioCaptureInterval = null;
  let audioFingerprintBuffer = [];
  const FP_SAMPLE_RATE = 5; // samples per second
  const FP_BUFFER_SECONDS = 120; // keep last 2 minutes of audio fingerprints
  const FP_BANDS = 8; // number of frequency bands in the fingerprint
  const FP_MATCH_THRESHOLD = 35; // distance threshold for a band match
  const FP_MATCH_RATIO = 0.65; // min ratio of matching bands to declare a match

  // ===== SHARED STYLES =====
  const GLASS_PILL_CSS = `
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-weight: 600;
    letter-spacing: -0.2px;
    color: #1a1d2b;
  `;

  const OVERLAY_TRANSITION = 'opacity 0.35s cubic-bezier(0.25,0.46,0.45,0.94), transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)';
  const OVERLAY_SHOW = { opacity: '1', transform: 'translateY(0) scale(1)' };
  const OVERLAY_HIDE = { opacity: '0', transform: 'translateY(-10px) scale(0.96)' };

  function applyOverlayState(el, show) {
    if (!el) return;
    const s = show ? OVERLAY_SHOW : OVERLAY_HIDE;
    el.style.opacity = s.opacity;
    el.style.transform = s.transform;
  }

  // ===== UTILITY FUNCTIONS =====
  function loadSettings() {
    chrome.storage.local.get(['streamshade_settings', 'streamshade_stats'], (result) => {
      if (result.streamshade_settings) {
        settings = { ...settings, ...result.streamshade_settings };
      }
      if (result.streamshade_stats) {
        state.stats = { ...state.stats, ...result.streamshade_stats };
      }
      
      currentShowId = extractShowId();
      if (currentShowId && settings.perShowSettings[currentShowId]) {
        const showSettings = settings.perShowSettings[currentShowId];
        settings.outroStart = showSettings.outroStart || settings.outroStart;
        settings.customSegments = showSettings.customSegments || [];
      }
      
      init();
    });
  }

  function saveSettings() {
    chrome.storage.local.set({ 
      streamshade_settings: settings,
      streamshade_stats: state.stats
    });
  }

  // Safe className reader: SVG elements have an SVGAnimatedString, not a string.
  function classStr(node) {
    if (!node) return '';
    const c = node.className;
    if (typeof c === 'string') return c;
    if (c && typeof c.baseVal === 'string') return c.baseVal;
    return '';
  }

  function extractShowId() {
    const parse = (url) => {
      if (!url || typeof url !== 'string') return null;
      const m = url.match(/\/shows?\/play\/(\d+)|\/movies?\/play\/(\d+)/);
      return m ? (m[1] || m[2]) : null;
    };
    try {
      // Works in the top frame (own URL) and in the player iframe (via referrer).
      return parse(location.pathname) || parse(location.href) || parse(document.referrer);
    } catch (_) {
      return null;
    }
  }

  function getLookMovieStorage() {
    try {
      return window.show_storage || window['show_storage'] || null;
    } catch (_) {
      return null;
    }
  }

  function parseEpisodeHash(hash = '') {
    if (!hash) return null;
    const m = hash.replace(/^#/, '').match(/^S(\d+)-E(\d+)-(\d+)$/i);
    if (!m) return null;
    return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), idEpisode: parseInt(m[3], 10) };
  }

  function buildEpisodeHash(ep) {
    if (!ep) return null;
    const id = ep.id_episode || ep.idEpisode || ep.epid || ep.id || '';
    if (!id) return null;
    return `S${ep.season}-E${ep.episode}-${id}`;
  }

  function findCurrentEpisodeIndex() {
    const storage = getLookMovieStorage();
    const current = parseEpisodeHash(location.hash);
    if (!storage || !current || !Array.isArray(storage.seasons)) return { storage: null, idx: -1 };

    const idx = storage.seasons.findIndex((ep) =>
      String(ep.season) === String(current.season) &&
      String(ep.episode) === String(current.episode) &&
      parseInt(ep.id_episode, 10) === current.idEpisode
    );
    return { storage, idx };
  }

  function buildEpisodeUrl(ep) {
    const hash = buildEpisodeHash(ep);
    return hash ? `${location.origin}${location.pathname}#${hash}` : null;
  }

  function getNextEpisodeUrl() {
    const { storage, idx } = findCurrentEpisodeIndex();
    if (idx < 0 || !storage || idx >= storage.seasons.length - 1) return null;
    return buildEpisodeUrl(storage.seasons[idx + 1]);
  }

  function getPreviousEpisodeUrl() {
    const { storage, idx } = findCurrentEpisodeIndex();
    if (idx <= 0 || !storage) return null;
    return buildEpisodeUrl(storage.seasons[idx - 1]);
  }

  function getCurrentEpisodeInfo() {
    const { storage, idx } = findCurrentEpisodeIndex();
    if (idx < 0 || !storage) return null;
    const ep = storage.seasons[idx];
    return {
      showTitle: storage.title || '',
      season: ep.season,
      episode: ep.episode,
      title: ep.title || '',
      idEpisode: ep.id_episode
    };
  }

  // ===== NOTIFICATION SYSTEM =====
  function showNotification(message, duration = 2000) {
    if (!settings.showNotifications) return;
    
    if (!notificationEl) {
      notificationEl = document.createElement('div');
      notificationEl.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        ${GLASS_PILL_CSS}
        border: 1px solid rgba(0,0,0,0.08);
        padding: 12px 20px; font-size: 14px;
        white-space: nowrap; z-index: 2147483646;
        opacity: 0; transform: translateY(-10px) scale(0.96);
        transition: ${OVERLAY_TRANSITION};
        pointer-events: none;
      `;
      document.body.appendChild(notificationEl);
    }
    
    const parent = getOverlayParent();
    if (notificationEl.parentElement !== parent) {
      parent.appendChild(notificationEl);
    }
    notificationEl.textContent = message;
    applyOverlayState(notificationEl, true);
    
    if (showNotification._hideTimer) clearTimeout(showNotification._hideTimer);
    showNotification._hideTimer = setTimeout(() => {
      showNotification._hideTimer = null;
      applyOverlayState(notificationEl, false);
    }, duration);
  }

  function getOverlayParent() {
    return (videoContainer && videoContainer.tagName !== 'VIDEO') ? videoContainer : document.body;
  }

  // ===== SKIP OUTRO OVERLAY =====
  function showSkipOutroOverlay() {
    if (!settings.showNotifications) return;
    if (skipOutroOverlayTimer) clearTimeout(skipOutroOverlayTimer);

    if (!skipOutroOverlayEl) {
      skipOutroOverlayEl = document.createElement('div');
      skipOutroOverlayEl.style.cssText = `
        position: fixed; top: 60px; right: 30px;
        z-index: 2147483647; display: flex; align-items: center; gap: 12px;
        padding: 12px 18px 12px 16px; font-size: 14px;
        ${GLASS_PILL_CSS}
        cursor: pointer; opacity: 0; transform: translateY(-10px) scale(0.96);
        transition: ${OVERLAY_TRANSITION};
        pointer-events: auto; user-select: none; overflow: hidden;
      `;
      skipOutroOverlayEl.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
        <span>Skip Outro</span>
        <div class="ss-overlay-progress" style="position:absolute;bottom:0;left:0;height:3px;width:100%;background:rgba(0,0,0,0.12);transform-origin:left;transform:scaleX(1);"></div>
      `;
      skipOutroProgressEl = skipOutroOverlayEl.querySelector('.ss-overlay-progress');
      skipOutroOverlayEl.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        hideSkipOutroOverlay();
        if (state.outroSkipTimeout) {
          clearTimeout(state.outroSkipTimeout);
          state.outroSkipTimeout = null;
        }
        state.isProcessing = false;
        skipOutro();
      });
    }

    const parent = getOverlayParent();
    if (skipOutroOverlayEl.parentElement !== parent) {
      parent.appendChild(skipOutroOverlayEl);
    }

    if (skipOutroProgressEl) {
      skipOutroProgressEl.style.transition = 'none';
      skipOutroProgressEl.style.transform = 'scaleX(1)';
    }

    const rect = videoElement?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const videoRight = rect.right;
      const videoTop = rect.top;
      skipOutroOverlayEl.style.top = `${Math.max(10, videoTop + 10)}px`;
      skipOutroOverlayEl.style.right = `${Math.max(10, window.innerWidth - videoRight + 10)}px`;
      skipOutroOverlayEl.style.left = 'auto';
    }

    requestAnimationFrame(() => {
      applyOverlayState(skipOutroOverlayEl, true);
      if (skipOutroProgressEl) {
        skipOutroProgressEl.style.transition = 'transform 3s linear';
        skipOutroProgressEl.style.transform = 'scaleX(0)';
      }
    });

    skipOutroOverlayTimer = setTimeout(() => hideSkipOutroOverlay(), 7000);
  }

  function hideSkipOutroOverlay() {
    if (!skipOutroOverlayEl) return;
    applyOverlayState(skipOutroOverlayEl, false);
    if (skipOutroOverlayTimer) {
      clearTimeout(skipOutroOverlayTimer);
      skipOutroOverlayTimer = null;
    }
    // If there is no pending auto-skip, clear the processing lock so the
    // overlay can reappear if the user seeks back into the outro.
    if (!state.outroSkipTimeout) {
      state.isProcessing = false;
    }
  }

  // ===== SKIP INTRO OVERLAY =====
  function showSkipIntroOverlay() {
    if (!settings.showNotifications) return;
    if (skipIntroOverlayTimer) clearTimeout(skipIntroOverlayTimer);

    if (!skipIntroOverlayEl) {
      skipIntroOverlayEl = document.createElement('div');
      skipIntroOverlayEl.style.cssText = `
        position: fixed; top: 60px; right: 30px;
        z-index: 2147483647; display: flex; align-items: center; gap: 12px;
        padding: 12px 18px 12px 16px; font-size: 14px;
        ${GLASS_PILL_CSS}
        cursor: pointer; opacity: 0; transform: translateY(-10px) scale(0.96);
        transition: ${OVERLAY_TRANSITION};
        pointer-events: auto; user-select: none; overflow: hidden;
      `;
      skipIntroOverlayEl.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5"></line>
        </svg>
        <span>Skip Intro</span>
        <div class="ss-overlay-progress" style="position:absolute;bottom:0;left:0;height:3px;width:100%;background:rgba(0,0,0,0.12);transform-origin:left;transform:scaleX(1);"></div>
      `;
      skipIntroProgressEl = skipIntroOverlayEl.querySelector('.ss-overlay-progress');
      skipIntroOverlayEl.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        hideSkipIntroOverlay();
        if (state.introSkipTimeout) {
          clearTimeout(state.introSkipTimeout);
          state.introSkipTimeout = null;
        }
        skipIntro(true);
      });
    }

    const parent = getOverlayParent();
    if (skipIntroOverlayEl.parentElement !== parent) {
      parent.appendChild(skipIntroOverlayEl);
    }

    if (skipIntroProgressEl) {
      skipIntroProgressEl.style.transition = 'none';
      skipIntroProgressEl.style.transform = 'scaleX(1)';
    }

    const rect = videoElement?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      skipIntroOverlayEl.style.top = `${Math.max(10, rect.top + 10)}px`;
      skipIntroOverlayEl.style.right = `${Math.max(10, window.innerWidth - rect.right + 10)}px`;
      skipIntroOverlayEl.style.left = 'auto';
    }

    requestAnimationFrame(() => {
      applyOverlayState(skipIntroOverlayEl, true);
      if (skipIntroProgressEl) {
        skipIntroProgressEl.style.transition = 'transform 1.2s linear';
        skipIntroProgressEl.style.transform = 'scaleX(0)';
      }
    });

    skipIntroOverlayTimer = setTimeout(() => hideSkipIntroOverlay(), 8000);
  }

  function hideSkipIntroOverlay() {
    if (!skipIntroOverlayEl) return;
    applyOverlayState(skipIntroOverlayEl, false);
    if (skipIntroOverlayTimer) {
      clearTimeout(skipIntroOverlayTimer);
      skipIntroOverlayTimer = null;
    }
  }

  // ===== FAST STARTUP (skip LookMovie's pre-init countdown) =====
  // LookMovie shows a 10-second countdown before initialising the player
  // (their pre-init ad timer). It runs as setInterval(fn, 1000). Because page
  // scripts and content scripts live in separate JS worlds, we have to inject a
  // <script> into the page context to patch its setInterval. This runs at
  // document_start, before LookMovie's scripts execute.
  function injectFastStartup() {
    if (window.top !== window) return; // only the top frame
    if (!isPlayPage()) return;
    // Use a guard so we don't inject multiple times.
    if (window.__ssFastStartupInjected) return;
    window.__ssFastStartupInjected = true;

    const code = `(()=>{
      try {
        const start = Date.now();
        const WINDOW_MS = 30000;
        const _setInterval = window.setInterval;
        const _setTimeout = window.setTimeout;
        window.setInterval = function(fn, delay) {
          const args = Array.prototype.slice.call(arguments, 2);
          let d = +delay || 0;
          if (typeof fn === 'function' && d >= 900 && d <= 1100 && (Date.now() - start) < WINDOW_MS) {
            d = 5; // 10s countdown finishes in ~50ms
          }
          return _setInterval.apply(this, [fn, d].concat(args));
        };
        window.setTimeout = function(fn, delay) {
          const args = Array.prototype.slice.call(arguments, 2);
          let d = +delay || 0;
          if (typeof fn === 'function' && d >= 900 && d <= 1100 && (Date.now() - start) < WINDOW_MS) {
            d = 5;
          }
          return _setTimeout.apply(this, [fn, d].concat(args));
        };
        // Restore originals after the window so we don't disturb the player.
        _setTimeout(() => {
          window.setInterval = _setInterval;
          window.setTimeout  = _setTimeout;
        }, WINDOW_MS + 50);
      } catch (e) { /* noop */ }
    })();`;

    try {
      const s = document.createElement('script');
      s.textContent = code;
      (document.documentElement || document.head).appendChild(s);
      s.remove();
      console.log('[StreamShade] Fast startup injected');
    } catch (e) {
      console.warn('[StreamShade] Fast startup inject failed', e);
    }
  }

  // Force-click pre-init/go-to-show buttons even if they're disabled.
  function forceSkipPreInit() {
    const sel = '.pre-init-ads--back-button, .pre-init-ads--close, .pre-init-ads--button, .pre-init-ads--go-to-show, [class*="pre-init"] button';
    document.querySelectorAll(sel).forEach(btn => {
      try {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.style.pointerEvents = 'auto';
        btn.click();
      } catch (_) {}
    });
  }

  // ===== GENERIC POPUP AUTO-CLICKER =====
  // Detects and clicks any popup/dialog/window that appears on screen
  
  function isPopupElement(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // Check if element matches popup selectors
    for (const selector of settings.popupSelectors) {
      try {
        if (element.matches && element.matches(selector)) return true;
      } catch (e) {
        // Invalid selector, skip
      }
    }
    
    // Check for high z-index (likely popup)
    const style = window.getComputedStyle(element);
    const zIndex = parseInt(style.zIndex);
    if (zIndex > 1000) return true;
    
    // Check for fixed positioning with overlay-like properties
    if (style.position === 'fixed' || style.position === 'absolute') {
      const rect = element.getBoundingClientRect();
      // If it covers a significant portion of the screen
      const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
      if (coverage > 0.3) return true;
    }
    
    // Check for backdrop-like styling
    if (style.position === 'fixed' && 
        (style.backgroundColor === 'rgba(0, 0, 0, 0.5)' ||
         style.backgroundColor === 'rgba(0, 0, 0, 0.3)' ||
         style.backgroundColor === 'rgba(0, 0, 0, 0.7)')) {
      return true;
    }
    
    // Check for common popup class names
    const className = classStr(element).toLowerCase();
    const popupKeywords = ['modal', 'popup', 'dialog', 'overlay', 'lightbox', 'alert', 'notification', 'toast'];
    if (popupKeywords.some(keyword => className.includes(keyword))) return true;
    
    return false;
  }

  function findClickableInPopup(popupElement) {
    // Look for buttons, links, or clickable elements within the popup
    const clickableSelectors = [
      'button',
      'a[href]',
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      '.btn',
      '.button',
      '.close',
      '.dismiss',
      '.accept',
      '.confirm',
      '.ok',
      '.yes',
      '.continue',
      '.proceed'
    ];
    
    for (const selector of clickableSelectors) {
      const elements = popupElement.querySelectorAll(selector);
      if (elements.length > 0) {
        // Return the first visible clickable element
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && 
              window.getComputedStyle(el).display !== 'none') {
            return el;
          }
        }
      }
    }
    
    // If no specific button found, try clicking the popup itself
    return popupElement;
  }

  function autoClickPopup() {
    if (!settings.popupAutoClick) return false;
    
    // Find all potential popup elements
    const allElements = document.querySelectorAll('*');
    const popups = Array.from(allElements).filter(el => isPopupElement(el));
    
    let clicked = false;
    for (const popup of popups) {
      // Skip if we recently clicked this popup
      const popupId = popup.tagName + (popup.id || '') + (popup.className || '');
      if (state.recentlyClickedPopups && state.recentlyClickedPopups.has(popupId)) continue;
      
      const clickableElement = findClickableInPopup(popup);
      if (clickableElement) {
        try {
          // Ensure element is clickable
          if (clickableElement.disabled) {
            clickableElement.disabled = false;
            clickableElement.removeAttribute('disabled');
          }
          clickableElement.style.pointerEvents = 'auto';
          
          // Click it
          clickableElement.click();
          
          // Track clicked popup
          if (!state.recentlyClickedPopups) state.recentlyClickedPopups = new Set();
          state.recentlyClickedPopups.add(popupId);
          
          // Clean up after 5 seconds
          setTimeout(() => {
            if (state.recentlyClickedPopups) {
              state.recentlyClickedPopups.delete(popupId);
            }
          }, 5000);
          
          console.log('[StreamShade] Auto-clicked popup:', clickableElement.tagName, clickableElement.textContent);
          if (settings.showNotifications) {
            showNotification('🎯 Auto-clicked popup', 1000);
          }
          
          clicked = true;
          break; // Only click one popup per check
        } catch (err) {
          console.warn('[StreamShade] Popup click failed:', err);
        }
      }
    }
    
    return clicked;
  }

  // ===== UNIVERSAL AUTO-CLICK SYSTEM =====
  // Automatically clicks any clickable element that appears on screen
  
  function isElementClickable(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // Skip if element is hidden or has no dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (window.getComputedStyle(element).display === 'none') return false;
    if (window.getComputedStyle(element).visibility === 'hidden') return false;
    if (window.getComputedStyle(element).opacity === '0') return false;
    
    // Check for common clickable attributes and tags
    const clickableTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'OPTION', 'LABEL'];
    const hasClickableTag = clickableTags.includes(element.tagName);
    
    const hasClickableClass = /\b(button|btn|click|link|nav|menu|item|option|choice|action)\b/i.test(classStr(element));
    const hasClickableRole = element.getAttribute('role') && /\b(button|link|menuitem|option|tab|button)\b/i.test(element.getAttribute('role'));
    const hasOnClick = element.onclick || element.getAttribute('onclick');
    const hasHref = element.tagName === 'A' && element.getAttribute('href');
    const isSubmitInput = element.tagName === 'INPUT' && /\b(submit|button)\b/i.test(element.getAttribute('type'));
    const hasTabIndex = element.getAttribute('tabindex') && parseInt(element.getAttribute('tabindex')) >= 0;
    
    // Check for cursor pointer
    const hasPointerCursor = window.getComputedStyle(element).cursor === 'pointer';
    
    // Check if element has event listeners (simplified check)
    const hasEventListeners = element.onclick || element.onmousedown || element.onmouseup || element.hasAttribute('data-click');
    
    return hasClickableTag || hasClickableClass || hasClickableRole || hasOnClick || hasHref || 
           isSubmitInput || hasTabIndex || hasPointerCursor || hasEventListeners;
  }

  function shouldAutoClickElement(element) {
    if (!settings.universalAutoClick || !isElementClickable(element)) return false;
    
    // Safety filters - avoid clicking certain elements
    const unsafeSelectors = [
      'script', 'style', 'meta', 'link', 'head', 'title',
      '[type="password"]', '[type="file"]', '[type="checkbox"]', '[type="radio"]',
      '.ads', '.advertisement', '.ad-container', '.google-ads',
      '[data-ad]', '[data-ads]', '[id*="ad"]', '[class*="ad-"]',
      'iframe', 'object', 'embed', 'video', 'audio'
    ];
    
    for (const selector of unsafeSelectors) {
      if (element.matches && element.matches(selector)) return false;
      if (element.closest && element.closest(selector)) return false;
    }
    
    // Skip elements that are too small (likely decorative)
    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    
    // Skip elements that are part of the video player controls (we handle those separately)
    if (element.closest('.video-js, .jwplayer, .plyr, .vjs-control-bar, .jw-controlbar')) return false;
    
    // Skip elements that contain only whitespace or are empty
    const text = element.textContent?.trim() || '';
    if (text.length === 0 && !element.querySelector('svg, img, i, [class*="icon"]')) return false;
    
    return true;
  }

  function autoClickElement(element) {
    if (!shouldAutoClickElement(element)) return false;
    
    try {
      // Ensure element is enabled and clickable
      if (element.disabled) {
        element.disabled = false;
        element.removeAttribute('disabled');
      }
      element.style.pointerEvents = 'auto';
      
      // Create a proper click event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      element.dispatchEvent(clickEvent);
      
      // Log the click for debugging
      const elementInfo = element.tagName.toLowerCase() + 
                         (element.id ? '#' + element.id : '') + 
                         (element.className ? '.' + element.className.split(' ').join('.') : '') +
                         (element.textContent ? ' "' + element.textContent.trim().substring(0, 30) + '"' : '');
      console.log('[StreamShade] Auto-clicked:', elementInfo);
      
      // Show notification for important clicks
      if (settings.showNotifications && (element.tagName === 'BUTTON' || element.tagName === 'A')) {
        showNotification('🖱 Auto-clicked element', 1000);
      }
      
      return true;
    } catch (err) {
      console.warn('[StreamShade] Auto-click failed:', err);
      return false;
    }
  }

  function scanAndClickNewElements() {
    if (!settings.universalAutoClick) return;
    
    // Find all clickable elements that are visible
    const allElements = document.querySelectorAll('*');
    const clickableElements = Array.from(allElements).filter(el => shouldAutoClickElement(el));
    
    // Click newly found elements (limit to avoid excessive clicking)
    const maxClicksPerScan = 3;
    let clickedCount = 0;
    
    for (const element of clickableElements) {
      if (clickedCount >= maxClicksPerScan) break;
      
      // Skip if we recently clicked this element
      const elementId = element.tagName + (element.id || '') + (element.className || '');
      if (state.recentlyClicked && state.recentlyClicked.has(elementId)) continue;
      
      if (autoClickElement(element)) {
        clickedCount++;
        // Track recently clicked elements to avoid duplicate clicks
        if (!state.recentlyClicked) state.recentlyClicked = new Set();
        state.recentlyClicked.add(elementId);
        
        // Clean up old entries after 10 seconds
        setTimeout(() => {
          if (state.recentlyClicked) {
            state.recentlyClicked.delete(elementId);
          }
        }, 10000);
      }
    }
  }

  // ===== STREAMSHADE: ORIGINAL GENTLE POPUP CLOSER =====
  // Uses CSS injection to move elements off-screen (NOT display:none)
  // This prevents the site from detecting ad blockers
  
  function hidePremiumPopup() {
    if (!settings.autoCloseEnabled) return;
    
    try {
      // Inject CSS to move ad container off-screen (keeps it loaded but invisible)
      if (!document.getElementById('streamshade-styles')) {
        const style = document.createElement('style');
        style.id = 'streamshade-styles';
        style.textContent = `
          .player-pre-init-ads {
            transform: translateX(100vw) !important;
            pointer-events: none !important;
          }
          .player-pre-init-ads * {
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(style);
        console.log('[StreamShade] Injected gentle popup hider CSS');
      }
      
      // Click "Go to Show" / "Back" buttons on timer ads
      const backButtons = document.querySelectorAll('.pre-init-ads--back-button, .pre-init-ads--close');
      backButtons.forEach(btn => {
        if (btn && btn.offsetParent !== null) {
          btn.click();
          console.log('[StreamShade] Clicked back/close button');
        }
      });
      
    } catch (err) {
      console.error('[StreamShade] Popup hide error:', err);
    }
  }

  function clickContinueWatching() {
    if (!settings.continueWatchingEnabled) return;

    try {
      const selectors = [
        '#vjs-continue-watching',
        '.vjs-continue-watching',
        'a[href="#vjs-continue-watching"]',
        '.only-prem-1080p__continue-watching',
        '#progress-continue-button'
      ];
      let continueBtn = null;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          continueBtn = el;
          break;
        }
      }

      if (continueBtn) {
        continueBtn.style.pointerEvents = 'auto';
        continueBtn.style.opacity = '1';
        if (continueBtn.disabled != null) continueBtn.disabled = false;
        continueBtn.click();
        console.log('[StreamShade] Auto-clicked Continue Watching');
        showNotification('▶ Continue watching', 1500);
        return;
      }
    } catch (err) {
      console.error('[StreamShade] Continue watching error:', err);
    }
  }

  function startPopupWatcher() {
    if (!settings.autoCloseEnabled && !settings.universalAutoClick && !settings.popupAutoClick) return;
    
    // Start immediately - don't wait for video
    closeInterval = setInterval(() => {
      hidePremiumPopup();
      clickContinueWatching();
      scanAndClickNewElements();
      autoClickPopup();
    }, 2000);
    
    // MutationObserver for dynamic popups and new elements
    observer = new MutationObserver((mutations) => {
      if (!settings.autoCloseEnabled && !settings.universalAutoClick && !settings.popupAutoClick) return;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // Check if added node is a popup or continue button
            if (node.id === 'progress-continue-button' || 
                classStr(node).includes('pre-init') || 
                node.querySelector?.('#progress-continue-button, .player-pre-init-ads')) {
              setTimeout(() => {
                hidePremiumPopup();
                clickContinueWatching();
              }, 500);
            }
            
            // Generic popup auto-click for new elements
            if (settings.popupAutoClick && isPopupElement(node)) {
              setTimeout(() => {
                autoClickPopup();
              }, settings.popupClickDelay || 300);
            }
            
            // Universal auto-click for new elements
            if (settings.universalAutoClick) {
              setTimeout(() => {
                // Check the new node itself
                if (shouldAutoClickElement(node)) {
                  autoClickElement(node);
                }
                
                // Check all descendants of the new node
                const clickableDescendants = node.querySelectorAll('*');
                clickableDescendants.forEach(descendant => {
                  if (shouldAutoClickElement(descendant)) {
                    autoClickElement(descendant);
                  }
                });
              }, settings.autoClickDelay || 500);
            }
          }
        });
      });
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    console.log('[StreamShade] Enhanced popup watcher started with generic popup auto-click');
  }

  // ===== VIDEO DETECTION =====
  function findVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;

    let best = null;
    let bestScore = -1;

    for (const video of videos) {
      if (!video || !video.isConnected) continue;

      const rect = video.getBoundingClientRect?.();
      const area = rect ? (Math.max(0, rect.width) * Math.max(0, rect.height)) : 0;
      const visible = rect && rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;

      const hasSrc = Boolean(
        video.currentSrc ||
        video.src ||
        video.getAttribute('src') ||
        video.getAttribute('data-src') ||
        video.querySelector('source[src]')
      );

      const readyBoost = (video.readyState || 0) >= 2 ? 500000 : 0;
      const srcBoost = hasSrc ? 1000000 : 0;
      const playingBoost = !video.paused && video.currentTime > 0 ? 2000000 : 0;
      const visibleBoost = visible ? 300000 : 0;

      const score = area + readyBoost + srcBoost + playingBoost + visibleBoost;

      // Ignore tiny/hidden videos unless it's the only one.
      if (videos.length > 1 && area < 2500 && !hasSrc) continue;

      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }

    return best || videos[0];
  }

  function findVideoContainer(video) {
    let el = video;
    for (let i = 0; i < 5; i++) {
      el = el.parentElement;
      if (!el) break;
      const style = window.getComputedStyle(el);
      if (style.position === 'relative' || style.position === 'absolute' || style.position === 'fixed') {
        return el;
      }
    }
    return video;
  }

  // ===== PER-SHOW EFFECTIVE SETTINGS =====
  function getEffectiveIntroDuration() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && Number.isFinite(perShow.introSkipSeconds) && perShow.introSkipSeconds > 0) {
      return perShow.introSkipSeconds;
    }
    return settings.introSkipSeconds || DEFAULT_INTRO_SKIP;
  }

  function getEffectiveIntroEnd() {
    return getEffectiveIntroStartSeconds() + getEffectiveIntroDuration();
  }

  function getEffectiveIntroStartSeconds() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && Number.isFinite(perShow.introStartSeconds) && perShow.introStartSeconds >= 0) {
      return perShow.introStartSeconds;
    }
    return settings.introStartSeconds || 0;
  }

  function getEffectiveSpeed() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && Number.isFinite(perShow.defaultSpeed) && perShow.defaultSpeed > 0) {
      return perShow.defaultSpeed;
    }
    return settings.defaultSpeed || 1;
  }

  function getEffectiveSkipIntro() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && typeof perShow.skipIntro === 'boolean') return perShow.skipIntro;
    return settings.skipIntro !== false;
  }

  // ===== AUDIO FINGERPRINTING FOR INTRO DETECTION =====
  function setupAudioFingerprinting() {
    if (!videoElement || audioContext) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      audioSource = audioContext.createMediaElementSource(videoElement);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 2048;
      audioAnalyser.smoothingTimeConstant = 0.8;
      audioSource.connect(audioAnalyser);
      audioAnalyser.connect(audioContext.destination);
      audioFingerprintBuffer = [];
      startAudioCapture();
      console.log('[StreamShade] Audio fingerprinting ready');
    } catch (err) {
      console.error('[StreamShade] Audio fingerprinting setup failed:', err);
    }
  }

  function teardownAudioFingerprinting() {
    if (audioCaptureInterval) {
      clearInterval(audioCaptureInterval);
      audioCaptureInterval = null;
    }
    if (audioSource) {
      try { audioSource.disconnect(); } catch (_) {}
      audioSource = null;
    }
    if (audioAnalyser) {
      try { audioAnalyser.disconnect(); } catch (_) {}
      audioAnalyser = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch (_) {}
      audioContext = null;
    }
    audioFingerprintBuffer = [];
  }

  function startAudioCapture() {
    if (!audioAnalyser || audioCaptureInterval) return;
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    audioCaptureInterval = setInterval(() => {
      if (!audioAnalyser || !videoElement) return;
      if (videoElement.paused || audioContext?.state === 'suspended') return;

      audioAnalyser.getByteFrequencyData(dataArray);
      const fingerprint = createAudioFingerprint(dataArray);
      audioFingerprintBuffer.push({
        time: videoElement.currentTime,
        fingerprint: fingerprint
      });

      const maxSize = FP_BUFFER_SECONDS * FP_SAMPLE_RATE;
      if (audioFingerprintBuffer.length > maxSize) {
        audioFingerprintBuffer.shift();
      }

      checkForIntroFingerprintMatch();
    }, 1000 / FP_SAMPLE_RATE);
  }

  function stopAudioCapture() {
    if (audioCaptureInterval) {
      clearInterval(audioCaptureInterval);
      audioCaptureInterval = null;
    }
  }

  function createAudioFingerprint(dataArray) {
    const bandSize = Math.floor(dataArray.length / FP_BANDS);
    const fingerprint = [];
    for (let i = 0; i < FP_BANDS; i++) {
      let sum = 0;
      for (let j = 0; j < bandSize; j++) {
        sum += dataArray[i * bandSize + j];
      }
      fingerprint.push(Math.round(sum / bandSize));
    }
    return fingerprint;
  }

  function fingerprintDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum / a.length);
  }

  function fingerprintMatch(a, b) {
    return fingerprintDistance(a, b) < FP_MATCH_THRESHOLD;
  }

  function recordIntroFingerprint() {
    if (!settings.audioFingerprintIntro || !currentShowId || !videoElement) return;
    if (!audioContext || audioFingerprintBuffer.length === 0) {
      showNotification('🎵 Audio not ready yet', 1500);
      return;
    }

    const introStart = getEffectiveIntroStartSeconds();
    const currentTime = videoElement.currentTime;
    if (currentTime <= introStart + 1) return;

    // Resume audio context in case it was suspended (browser autoplay policy).
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const samples = audioFingerprintBuffer
      .filter(entry => entry.time >= introStart && entry.time <= currentTime)
      .map(entry => entry.fingerprint);

    if (samples.length < 10) return;

    if (!settings.perShowSettings[currentShowId]) {
      settings.perShowSettings[currentShowId] = {};
    }
    settings.perShowSettings[currentShowId].introFingerprint = {
      startTime: introStart,
      duration: currentTime - introStart,
      samples: samples,
      createdAt: Date.now()
    };
    saveSettings();
    console.log('[StreamShade] Recorded intro fingerprint for show', currentShowId, samples.length, 'samples');
    showNotification('🎵 Intro signature saved', 2000);
  }

  function checkForIntroFingerprintMatch() {
    if (!settings.audioFingerprintIntro || !currentShowId || !videoElement) return;
    if (state.hasSkippedIntro) return;

    const showSettings = settings.perShowSettings[currentShowId];
    if (!showSettings || !showSettings.introFingerprint) return;

    const stored = showSettings.introFingerprint;
    if (!stored.samples || stored.samples.length < 10) return;

    const expectedStart = getEffectiveIntroStartSeconds();
    const currentTime = videoElement.currentTime;
    if (Math.abs(currentTime - expectedStart) > 5) return;

    if (findFingerprintMatch(stored.samples)) {
      console.log('[StreamShade] Intro fingerprint matched at', currentTime);
      showNotification('🎵 Intro detected, skipping...', 2000);
      skipIntro(true, true);
    }
  }

  function findFingerprintMatch(storedSamples) {
    if (audioFingerprintBuffer.length < storedSamples.length) return false;

    const maxMismatches = Math.floor(storedSamples.length * (1 - FP_MATCH_RATIO));
    // We only need to search a small window around the end of the buffer
    // because the intro should be playing right now.
    const searchWindow = storedSamples.length + 50;
    const startIdx = Math.max(0, audioFingerprintBuffer.length - storedSamples.length - searchWindow);

    for (let i = startIdx; i <= audioFingerprintBuffer.length - storedSamples.length; i++) {
      let matches = 0;
      for (let j = 0; j < storedSamples.length; j++) {
        if (fingerprintMatch(audioFingerprintBuffer[i + j].fingerprint, storedSamples[j])) {
          matches++;
        } else if (j + 1 - matches > maxMismatches) {
          break; // too many mismatches, abort early
        }
      }
      if (matches / storedSamples.length >= FP_MATCH_RATIO) {
        return true;
      }
    }
    return false;
  }

  function clearIntroFingerprint() {
    if (!currentShowId) return;
    const showSettings = settings.perShowSettings[currentShowId];
    if (showSettings) {
      delete showSettings.introFingerprint;
      saveSettings();
    }
  }

  // ===== CORE FEATURES =====
  function skipIntro(force = false, fromFingerprint = false) {
    if (!videoElement) return;

    const introEnabled = getEffectiveSkipIntro();
    if (!force) {
      if (state.hasSkippedIntro || !introEnabled) return;
    }

    const duration = videoElement.duration || Infinity;
    const currentTime = videoElement.currentTime;
    const introStart = getEffectiveIntroStartSeconds();
    const introDuration = getEffectiveIntroDuration();
    const introEnd = introStart + introDuration;

    // Auto: only act when the playhead is inside the intro window [introStart, introEnd).
    // Manual (force): if inside or before the window, jump to introEnd.
    //   If AFTER the window, auto-learn this position as the new intro start
    //   (the user is telling us the intro actually starts here on this show).
    let skipTime = null;
    if (currentTime >= introStart - 0.5 && currentTime < introEnd) {
      skipTime = introEnd;
    } else if (force && currentTime < introStart) {
      skipTime = introEnd;
    } else if (force && currentTime >= introEnd && currentTime < duration * 0.5) {
      // User pressed Skip Intro at a position past our configured window.
      // Learn this as the new intro START for this show, skip forward by duration.
      if (settings.autoLearnIntro && currentShowId) {
        if (!settings.perShowSettings[currentShowId]) settings.perShowSettings[currentShowId] = {};
        settings.perShowSettings[currentShowId].introStartSeconds = Math.round(currentTime);
        console.log(`[StreamShade] Learned intro start for show ${currentShowId}: ${Math.round(currentTime)}s`);
      }
      skipTime = currentTime + introDuration;
    }

    if (skipTime == null) return;
    skipTime = Math.min(Math.max(skipTime, currentTime + 0.5), duration - 5);
    if (skipTime <= 0 || currentTime >= skipTime - 0.5) return;

    state.hasSkippedIntro = true;
    videoElement.currentTime = skipTime;

    state.stats.introsSkipped++;
    state.stats.totalTimeSaved += Math.max(0, skipTime - currentTime);
    saveSettings();

    // When the user manually skips an intro, record its audio fingerprint
    // so future episodes can auto-detect the same intro.
    if (force && settings.audioFingerprintIntro && !fromFingerprint) {
      recordIntroFingerprint();
    }

    showNotification(`⏭ Skipped intro (${Math.round(skipTime)}s)`, 2000);
    console.log(`[StreamShade] Intro: ${currentTime.toFixed(1)}s → ${skipTime}s`);
  }

  function findNextEpisodeButton() {
    const selectors = [
      '[data-next-episode]',
      '.next-episode',
      '#next-episode',
      'a.next-episode',
      '.jw-next',
      '.plyr__next',
      'button[aria-label*="Next" i]',
      'button[title*="Next" i]',
      '.episode-next',
      '.ss-next',
      '.vjs-next-button'
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) return btn;
    }
    // Also search parent frame if same-origin (player iframe scenario).
    try {
      if (window.parent && window.parent !== window) {
        for (const sel of selectors) {
          const btn = window.parent.document.querySelector(sel);
          if (btn && btn.offsetParent !== null) return btn;
        }
      }
    } catch (_) { /* cross-origin */ }
    return null;
  }

  function navigateToNextEpisode() {
    // Use the native player event if the page exposes it (Video.js on LookMovie).
    try {
      if (typeof window.show_storage === 'object' &&
          window.currentEpisodeIndex + 1 < window.show_storage.total_episodes) {
        window.dispatchEvent(new Event('switch-next-episode'));
        return true;
      }
    } catch (_) {}

    // Fallback: structured data + URL hash swap.
    const nextUrl = getNextEpisodeUrl();
    if (nextUrl) {
      window.location.href = nextUrl;
      return true;
    }

    // Last resort: click the player's next button if it exists.
    const nextBtn = findNextEpisodeButton();
    if (nextBtn) {
      try {
        nextBtn.click();
      } catch (_) {
        if (nextBtn.href) window.location.href = nextBtn.href;
      }
      return true;
    }
    return false;
  }

  function skipOutro() {
    if (navigateToNextEpisode()) {
      state.stats.outrosSkipped++;
      saveSettings();
      showNotification('⏭ Next episode...', 1500);
      return;
    }

    // If user has set an outroStart, jump there (manual button case).
    if (videoElement && settings.outroStart != null) {
      const duration = videoElement.duration || 0;
      const target = typeof settings.outroStart === 'number'
        ? settings.outroStart
        : parseTime(settings.outroStart, duration);
      const oldTime = videoElement.currentTime || 0;

      if (Number.isFinite(target) && target > oldTime + 0.5) {
        videoElement.currentTime = target;
        state.stats.outrosSkipped++;
        state.stats.totalTimeSaved += (target - oldTime);
        saveSettings();
        showNotification('⏭ Skipped to outro', 1500);
        return;
      }
    }

    if (videoElement && videoElement.duration) {
      videoElement.currentTime = Math.max(0, videoElement.duration - 1);
      state.stats.outrosSkipped++;
      saveSettings();
      showNotification('⏭ Jumped to end', 1500);
    }
  }

  async function enterFullscreen() {
    if (state.hasGoneFullscreen || state.isFullscreenProcessing) return;
    state.isFullscreenProcessing = true;

    try {
      if (document.fullscreenElement) {
        state.hasGoneFullscreen = true;
        state.isFullscreenProcessing = false;
        return;
      }

      // Try the Video.js player API first (LookMovie uses Video.js).
      try {
        const vjs = window.videojs || window.videoJS;
        const player = vjs && vjs.getPlayer && vjs.getPlayer('video_player');
        if (player && typeof player.requestFullscreen === 'function') {
          await player.requestFullscreen();
          state.hasGoneFullscreen = true;
          state.fullscreenAwaitingGesture = false;
          showNotification('⛶ Fullscreen activated', 1500);
          return true;
        }
      } catch (_) {}

      const candidates = [
        videoContainer,
        videoElement,
        document.documentElement
      ].filter(Boolean);

      let entered = false;
      for (const el of candidates) {
        try {
          if (el.requestFullscreen) {
            await el.requestFullscreen();
          } else if (el.webkitRequestFullscreen) {
            await el.webkitRequestFullscreen();
          } else if (el.msRequestFullscreen) {
            await el.msRequestFullscreen();
          }
          entered = !!document.fullscreenElement;
          if (entered) break;
        } catch (e) {
          // Try next candidate
        }
      }
      
      if (!document.fullscreenElement) {
        throw new Error('Fullscreen request did not succeed');
      }

      state.hasGoneFullscreen = true;
      state.fullscreenAwaitingGesture = false;
      showNotification('⛶ Fullscreen activated', 1500);
      return true;
    } catch (err) {
      state.fullscreenAwaitingGesture = true;
      console.log('[StreamShade] Fullscreen blocked', err);
      showNotification('Fullscreen blocked — click once to retry', 2500);
      tryPlayerFullscreenButton();
      return false;
    } finally {
      state.isFullscreenProcessing = false;
    }
  }

  function tryPlayerFullscreenButton() {
    const selectors = [
      '[data-plyr="fullscreen"]',
      '.plyr__control--fullscreen',
      'button[aria-label*="Fullscreen" i]',
      'button[title*="Fullscreen" i]',
      '.jw-icon-fullscreen',
      '.vjs-fullscreen-control'
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function ensureFullscreenGestureRetryHook() {
    if (ensureFullscreenGestureRetryHook._installed) return;
    ensureFullscreenGestureRetryHook._installed = true;

    const handler = async () => {
      if (!settings.autoFullscreen) return;
      if (!state.fullscreenAwaitingGesture) return;
      if (state.hasGoneFullscreen) return;
      if (!videoElement || videoElement.paused) return;

      // This handler runs under a real user gesture.
      const ok = await enterFullscreen();
      if (!ok) {
        tryPlayerFullscreenButton();
      }
    };

    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('keydown', handler, true);
  }

  function computeAutoOutroStart(duration) {
    if (!Number.isFinite(duration) || duration < 60) return null;
    // Long-form content (movies, > 1 hour): credits at the last ~5%.
    if (duration > 3600) return duration * 0.95;
    // Episodes: last 1:30 or last 8%, whichever is closer to the end.
    return Math.max(duration * 0.92, duration - 90);
  }

  function checkOutro() {
    if (!videoElement || !settings.autoSkipOutro) return;

    const currentTime = videoElement.currentTime;
    const duration = videoElement.duration;
    if (!duration || duration < 60) return;

    // Resolve effective outro start: per-show override, then manual global,
    // then auto-detected.
    let outroStartTime = null;
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    const perShowOutro = perShow && perShow.outroStart;
    const manualOutro = (perShowOutro != null) ? perShowOutro : settings.outroStart;

    if (manualOutro != null && manualOutro !== '') {
      outroStartTime = typeof manualOutro === 'number'
        ? manualOutro
        : parseTime(manualOutro, duration);
    } else if (settings.autoDetectOutro !== false) {
      outroStartTime = computeAutoOutroStart(duration);
    } else {
      return;
    }

    // Sanity: ignore obviously-bogus values.
    if (!Number.isFinite(outroStartTime)) return;
    if (outroStartTime < 60) return;
    if (outroStartTime < duration * 0.4) return;
    if (outroStartTime >= duration) return;
    
    if (currentTime >= outroStartTime && !state.hasSkippedOutro && !state.isProcessing) {
      state.hasSkippedOutro = true;
      state.isProcessing = true;

      if (settings.showNotifications) {
        showSkipOutroOverlay();
        if (settings.autoClickSkipOverlays !== false) {
          state.outroSkipTimeout = setTimeout(() => {
            state.outroSkipTimeout = null;
            hideSkipOutroOverlay();
            skipOutro();
            state.isProcessing = false;
          }, 3000);
        }
      } else {
        skipOutro();
        state.isProcessing = false;
      }
    }

    if (currentTime < outroStartTime) {
      state.hasSkippedOutro = false;
      hideSkipOutroOverlay();
      if (state.outroSkipTimeout) {
        clearTimeout(state.outroSkipTimeout);
        state.outroSkipTimeout = null;
      }
      state.isProcessing = false;
    }
  }

  function parseTime(value, duration) {
    if (typeof value === 'number') return value;
    if (value.endsWith('%')) {
      return duration * (parseFloat(value) / 100);
    }
    const parts = value.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parseFloat(value);
  }

  // ===== CUSTOM SEGMENTS =====
  function checkCustomSegments() {
    if (!videoElement || settings.customSegments.length === 0) return;
    
    const currentTime = videoElement.currentTime;
    
    settings.customSegments.forEach(segment => {
      if (currentTime >= segment.start && currentTime < segment.end && !state.skippedSegments.has(segment.id)) {
        state.skippedSegments.add(segment.id);
        videoElement.currentTime = segment.end;
        state.stats.segmentsSkipped++;
        state.stats.totalTimeSaved += (segment.end - segment.start);
        saveSettings();
        
        showNotification(`⏭ Skipped "${segment.name}"`, 2000);
      }
    });
  }

  function addCustomSegment() {
    if (!videoElement) return;
    
    const currentTime = videoElement.currentTime;
    const name = prompt('Segment name (e.g., "Sponsor", "Recap"):', 'Skip');
    if (!name) return;
    
    const duration = parseFloat(prompt('Duration (seconds):', '30')) || 30;
    
    const segment = {
      name,
      start: currentTime,
      end: currentTime + duration,
      id: Date.now()
    };
    
    settings.customSegments.push(segment);
    
    if (currentShowId) {
      if (!settings.perShowSettings[currentShowId]) {
        settings.perShowSettings[currentShowId] = {};
      }
      settings.perShowSettings[currentShowId].customSegments = settings.customSegments;
    }
    
    saveSettings();
    showNotification(`✓ Added "${name}" (${duration}s)`, 2500);
  }

  // ===== PLAYBACK SPEED =====
  function setSpeed(speed) {
    if (!videoElement) return;
    videoElement.playbackRate = speed;

    if (currentShowId) {
      if (!settings.perShowSettings[currentShowId]) settings.perShowSettings[currentShowId] = {};
      settings.perShowSettings[currentShowId].defaultSpeed = speed;
    } else {
      settings.defaultSpeed = speed;
    }
    saveSettings();
    updateFloatingControlsSpeed(speed);

    if (!speedIndicatorEl) {
      speedIndicatorEl = document.createElement('div');
      speedIndicatorEl.style.cssText = `
        position: fixed; top: 20px; left: 20px;
        ${GLASS_PILL_CSS}
        border: 1px solid rgba(0,0,0,0.08);
        padding: 8px 16px; font-size: 13px;
        z-index: 999999; pointer-events: none; display: none;
      `;
      document.body.appendChild(speedIndicatorEl);
    }
    
    const parent = getOverlayParent();
    if (speedIndicatorEl.parentElement !== parent) {
      parent.appendChild(speedIndicatorEl);
    }
    speedIndicatorEl.textContent = `${speed}x`;
    speedIndicatorEl.style.display = 'block';
    if (setSpeed._hideTimer) clearTimeout(setSpeed._hideTimer);
    setSpeed._hideTimer = setTimeout(() => {
      setSpeed._hideTimer = null;
      if (speedIndicatorEl) speedIndicatorEl.style.display = 'none';
    }, 2000);
  }

  // ===== VOLUME PERSISTENCE =====
  function applySavedVolume() {
    if (!videoElement) return;
    const saved = settings.defaultVolume;
    if (Number.isFinite(saved) && saved >= 0 && saved <= 1) {
      videoElement.muted = saved === 0;
      if (saved > 0) {
        videoElement.volume = saved;
      }
    }
  }

  function onVolumeChange() {
    if (!videoElement) return;
    const vol = videoElement.muted ? 0 : videoElement.volume;
    if (Number.isFinite(vol) && vol >= 0 && vol <= 1) {
      settings.defaultVolume = vol;
      saveSettings();
    }
  }

  // ===== VIDEO EVENT HANDLERS =====
  function triggerIntroSkip() {
    state.hasSkippedIntro = true;
    if (settings.showNotifications) {
      showSkipIntroOverlay();
      if (settings.autoClickSkipOverlays !== false) {
        state.introSkipTimeout = setTimeout(() => {
          state.introSkipTimeout = null;
          hideSkipIntroOverlay();
          skipIntro(true);
        }, 1200);
      }
    } else {
      skipIntro(true);
    }
  }

  function onTimeUpdate() {
    // Rebind if the video element died or a better one appeared.
    if (!videoElement || !videoElement.isConnected) {
      const v = findVideoElement();
      if (v && v !== videoElement) {
        videoElement = v;
        videoContainer = findVideoContainer(videoElement);
        resetState();
        bindVideoElement(videoElement);
      }
      if (!videoElement) return;
    }

    const currentTime = videoElement.currentTime;
    const introStart = getEffectiveIntroStartSeconds();
    const introEnd = getEffectiveIntroEnd();

    if (currentTime < introStart - 0.5) {
      state.hasSkippedIntro = false;
      hideSkipIntroOverlay();
      if (state.introSkipTimeout) {
        clearTimeout(state.introSkipTimeout);
        state.introSkipTimeout = null;
      }
    }

    if (getEffectiveSkipIntro() && !state.hasSkippedIntro && currentTime > 0.5 && currentTime >= introStart - 0.5 && currentTime < introEnd) {
      triggerIntroSkip();
    }

    checkCustomSegments();
    checkOutro();

    // Auto fullscreen: trigger when we reach target time (playStart + delay)
    if (settings.autoFullscreen && !state.hasGoneFullscreen) {
      if (state.fullscreenTargetTime == null && !videoElement.paused) {
        // If we missed the play event, arm it here.
        state.fullscreenTargetTime = currentTime + (settings.fullscreenDelaySeconds || DEFAULT_FULLSCREEN_DELAY);
      }

      if (
        state.fullscreenTargetTime != null &&
        currentTime >= state.fullscreenTargetTime &&
        !state.fullscreenAttempted &&
        !state.isFullscreenProcessing
      ) {
        state.fullscreenAttempted = true;
        ensureFullscreenGestureRetryHook();
        enterFullscreen();
      }
    }
  }

  function onVideoPlay() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    if (!settings.autoFullscreen || state.hasGoneFullscreen) return;

    // Arm fullscreen relative to when playback starts/resumes.
    state.fullscreenTargetTime = videoElement?.currentTime + (settings.fullscreenDelaySeconds || DEFAULT_FULLSCREEN_DELAY);
    state.fullscreenAttempted = false;
    ensureFullscreenGestureRetryHook();

    if (getEffectiveSkipIntro() && !state.hasSkippedIntro) {
      setTimeout(() => {
        if (!videoElement || state.hasSkippedIntro || state.introSkipTimeout) return;
        const t = videoElement.currentTime;
        const iStart = getEffectiveIntroStartSeconds();
        const iEnd = getEffectiveIntroEnd();
        if (t > 0.5 && t >= iStart - 0.5 && t < iEnd) {
          triggerIntroSkip();
        }
      }, 650);
    }
  }

  function onVideoSeeking() {
    // Any seek (manual or from skipIntro) should NOT trigger an outro
    // auto-skip just because we crossed the outroStart marker. Mark it
    // as already-skipped; the reset-on-rewind logic in checkOutro will
    // re-arm it if the user actually plays back to before the outro.
    state.hasSkippedOutro = true;
  }

  function onVideoPause() {
    if (state.fullscreenTimer) {
      clearTimeout(state.fullscreenTimer);
      state.fullscreenTimer = null;
    }
  }

  function resetState() {
    state.hasSkippedIntro = false;
    state.hasSkippedOutro = false;
    state.hasGoneFullscreen = false;
    state.fullscreenTargetTime = null;
    state.fullscreenAttempted = false;
    state.fullscreenAwaitingGesture = false;
    state.skippedSegments.clear();
    hideSkipOutroOverlay();
    hideSkipIntroOverlay();
    if (state.fullscreenTimer) {
      clearTimeout(state.fullscreenTimer);
      state.fullscreenTimer = null;
    }
    if (state.introSkipTimeout) {
      clearTimeout(state.introSkipTimeout);
      state.introSkipTimeout = null;
    }
    if (state.outroSkipTimeout) {
      clearTimeout(state.outroSkipTimeout);
      state.outroSkipTimeout = null;
    }
    state.isProcessing = false;
    state.isFullscreenProcessing = false;
    teardownAudioFingerprinting();
  }

  // ===== FLOATING CONTROLS =====
  function ensureFloatingControls() {
    if (controlsEl) return;

    controlsEl = document.createElement('div');
    controlsEl.style.cssText = `
      position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
      ${GLASS_PILL_CSS}
      padding: 6px 8px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;
      z-index: 999999; opacity: 0; transition: opacity 0.3s; pointer-events: none;
    `;

    const baseBtn = 'border: none; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-size: 12px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; letter-spacing: -0.2px; transition: transform 100ms, background 120ms, color 120ms;';

    const spdBtn = (speed) => `
      <button class="ss-spd-btn" data-speed="${speed}" style="${baseBtn} background: rgba(0,0,0,0.06); color: #1a1d2b;"
        onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('speed', {detail:${speed}}))"
      >${speed}×</button>
    `;

    const actionBtn = (label, type) => `
      <button class="ss-action-btn" style="${baseBtn} background: #0ea5e9; color: #fff;"
        onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('${type}'))"
      >${label}</button>
    `;

    const navBtn = (label, type) => `
      <button style="${baseBtn} background: rgba(0,0,0,0.06); color: #1a1d2b;"
        onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('${type}'))"
      >${label}</button>
    `;

    controlsEl.innerHTML = `
      ${spdBtn(0.5)}
      ${spdBtn(1)}
      ${spdBtn(1.5)}
      ${spdBtn(2)}
      ${actionBtn('Skip Intro', 'skipIntro')}
      ${navBtn('←', 'previousEpisode')}
      ${navBtn('→', 'nextEpisode')}
    `;

    controlsEl.className = 'ss-controls';

    controlsEl.addEventListener('click', (e) => e.stopPropagation());
    controlsEl.addEventListener('mouseenter', cancelHideFloatingControls);
    controlsEl.addEventListener('mouseleave', hideFloatingControls);
    controlsEl.addEventListener('speed', (e) => setSpeed(e.detail));
    controlsEl.addEventListener('skipIntro', () => skipIntro(true));
    controlsEl.addEventListener('previousEpisode', () => {
      const prevUrl = getPreviousEpisodeUrl();
      if (prevUrl) window.location.href = prevUrl;
    });
    controlsEl.addEventListener('nextEpisode', navigateToNextEpisode);
    document.body.appendChild(controlsEl);
  }

  function updateFloatingControlsSpeed(speed) {
    if (!controlsEl) return;
    controlsEl.querySelectorAll('.ss-spd-btn').forEach((btn) => {
      const btnSpeed = parseFloat(btn.dataset.speed);
      const active = Math.abs(btnSpeed - speed) < 0.01;
      btn.style.background = active ? '#0ea5e9' : 'rgba(0,0,0,0.06)';
      btn.style.color = active ? '#fff' : '#1a1d2b';
    });
  }

  function attachFloatingControlsHover(video) {
    if (!controlsEl || !video) return;
    if (floatingControlsHoverVideo === video) return;

    // Clean up old listeners
    if (floatingControlsHoverVideo) {
      floatingControlsHoverVideo.removeEventListener('mouseenter', showFloatingControls);
      floatingControlsHoverVideo.removeEventListener('mouseleave', hideFloatingControls);
    }

    floatingControlsHoverVideo = video;
    video.addEventListener('mouseenter', showFloatingControls);
    video.addEventListener('mouseleave', hideFloatingControls);
  }

  function showFloatingControls() {
    if (!controlsEl || !videoElement || videoElement.paused) return;
    const rect = videoElement.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 120) return;
    cancelHideFloatingControls();
    // Reparent into the current video container so controls survive fullscreen.
    const parent = (videoContainer && videoContainer.tagName !== 'VIDEO') ? videoContainer : document.body;
    if (controlsEl.parentElement !== parent) {
      parent.appendChild(controlsEl);
    }
    controlsEl.style.opacity = '1';
    controlsEl.style.pointerEvents = 'auto';
  }

  function hideFloatingControls() {
    if (!controlsEl) return;
    if (floatingHideTimer) clearTimeout(floatingHideTimer);
    floatingHideTimer = setTimeout(() => {
      floatingHideTimer = null;
      controlsEl.style.opacity = '0';
      controlsEl.style.pointerEvents = 'none';
    }, 2000);
  }

  function cancelHideFloatingControls() {
    if (floatingHideTimer) {
      clearTimeout(floatingHideTimer);
      floatingHideTimer = null;
    }
  }

  // ===== KEYBOARD SHORTCUTS =====
  function ensureKeyboardShortcuts() {
    if (keyboardShortcutsInstalled) return;
    keyboardShortcutsInstalled = true;
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case 'i':
        case 'I':
          if (e.shiftKey) {
            e.preventDefault();
            skipIntro(true);
          }
          break;
        case 'o':
        case 'O':
          if (e.shiftKey) {
            e.preventDefault();
            skipOutro();
          }
          break;
        case 'f':
        case 'F':
          if (e.shiftKey) {
            e.preventDefault();
            enterFullscreen();
          }
          break;
        case 'n':
        case 'N':
          if (e.shiftKey) {
            e.preventDefault();
            navigateToNextEpisode();
          }
          break;
        case 's':
        case 'S':
          if (e.shiftKey) {
            e.preventDefault();
            addCustomSegment();
          }
          break;
        case '>':
        case '.':
          e.preventDefault();
          setSpeed(Math.min(3, (videoElement?.playbackRate || 1) + 0.25));
          break;
        case '<':
        case ',':
          e.preventDefault();
          setSpeed(Math.max(0.25, (videoElement?.playbackRate || 1) - 0.25));
          break;
        case 'ArrowUp':
          if (e.shiftKey && videoElement) {
            e.preventDefault();
            videoElement.volume = Math.min(1, videoElement.volume + 0.1);
            showNotification(`Volume ${Math.round(videoElement.volume * 100)}%`, 1500);
          }
          break;
        case 'ArrowDown':
          if (e.shiftKey && videoElement) {
            e.preventDefault();
            videoElement.volume = Math.max(0, videoElement.volume - 0.1);
            showNotification(`Volume ${Math.round(videoElement.volume * 100)}%`, 1500);
          }
          break;
      }
    });
  }

  // ===== INITIALIZATION =====
  function bindVideoElement(video) {
    if (video === videoElement && video?.dataset?.streamshadeBound === '1') return;

    videoElement = video;
    videoContainer = findVideoContainer(videoElement);
    resetState();

    try {
      videoElement.dataset.streamshadeBound = '1';
    } catch (_) {}

    // Remove old listeners (in case a previous element was passed)
    videoElement.removeEventListener('timeupdate', onTimeUpdate);
    videoElement.removeEventListener('play', onVideoPlay);
    videoElement.removeEventListener('playing', onVideoPlay);
    videoElement.removeEventListener('pause', onVideoPause);
    videoElement.removeEventListener('seeking', onVideoSeeking);
    videoElement.removeEventListener('ended', resetState);
    videoElement.removeEventListener('volumechange', onVolumeChange);

    // Add listeners
    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('play', onVideoPlay);
    videoElement.addEventListener('playing', onVideoPlay);
    videoElement.addEventListener('pause', onVideoPause);
    videoElement.addEventListener('seeking', onVideoSeeking);
    videoElement.addEventListener('ended', resetState);
    videoElement.addEventListener('volumechange', onVolumeChange);

    // Apply settings
    setSpeed(getEffectiveSpeed());
    applySavedVolume();
    ensureKeyboardShortcuts();
    ensureFloatingControls();
    attachFloatingControlsHover(videoElement);

    if (!videoElement.paused) {
      onVideoPlay();
    }

    // Setup audio fingerprinting if enabled.
    if (settings.audioFingerprintIntro) {
      setupAudioFingerprinting();
    }

    console.log('[StreamShade] Active | Intro:', getEffectiveIntroStartSeconds() + 's–' + getEffectiveIntroEnd() + 's | Fullscreen:', settings.fullscreenDelaySeconds + 's');
    showNotification('StreamShade ready', 2000);
  }

  function startMonitoring() {
    const found = findVideoElement();
    if (!found) {
      setTimeout(startMonitoring, 500);
      return;
    }

    bindVideoElement(found);
  }

  // ===== BEDTIME MODE (top frame only) =====
  function startBedtimeWatcher() {
    if (window.top !== window) return;
    if (bedtimeTimer) clearInterval(bedtimeTimer);
    bedtimeTimer = setInterval(checkBedtime, 30000);
    checkBedtime();
  }

  function checkBedtime() {
    try {
      if (!settings.bedtimeEnabled) return;
      const t = settings.bedtimeTime || '';
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) return;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (!(h >= 0 && h < 24 && min >= 0 && min < 60)) return;

      const now = new Date();
      const cur = now.getHours() * 60 + now.getMinutes();
      const target = h * 60 + min;

      // 5-minute trigger window after the target time.
      if (cur < target || cur > target + 5) return;

      const key = `ss_bedtime_${now.toDateString()}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');

      const url = settings.bedtimeUrl || 'https://www.youtube.com/watch?v=HH0pojCvq44';
      showNotification('🌙 Bedtime — switching to YouTube...', 3500);
      if (videoElement) { try { videoElement.pause(); } catch (_) {} }
      setTimeout(() => {
        try { window.location.href = url; } catch (_) {}
      }, 2000);
    } catch (_) {}
  }

  function isPlayPage() {
    return /\/shows?\/play\/|\/movies?\/play\//.test(location.pathname);
  }

  // Re-apply settings in every frame whenever they change in storage. This is
  // essential because chrome.tabs.sendMessage from the popup only reaches the
  // top frame by default, but the <video> lives in the player iframe — so the
  // storage change is how the iframe learns it should turn on audio.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.streamshade_settings) return;
      const next = changes.streamshade_settings.newValue;
      if (!next) return;
      settings = { ...settings, ...next };
      try { startBedtimeWatcher(); } catch (_) {}
    });
  } catch (_) { /* extension context not ready */ }

  function init() {
    // Aggressively click pre-init skip buttons for the first 10s.
    if (isPlayPage()) {
      let n = 0;
      const skipInterval = setInterval(() => {
        forceSkipPreInit();
        if (++n > 20) clearInterval(skipInterval);
      }, 250);
    }

    // Start popup closer with universal and generic popup auto-click
    startPopupWatcher();

    // Initial scan for existing clickable elements and popups
    if (settings.universalAutoClick || settings.popupAutoClick) {
      setTimeout(() => {
        scanAndClickNewElements();
        autoClickPopup();
      }, 1000);
    }

    // Top-frame-only UI features
    startBedtimeWatcher();

    const startVideoSystem = () => {
      const root = document.documentElement;

      const monitor = new MutationObserver(() => {
        startMonitoring();
      });
      monitor.observe(root, { childList: true, subtree: true });

      startMonitoring();

      let lastUrl = location.href;
      const navObserver = new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          resetState();
          currentShowId = extractShowId();
          // Load custom segments for the new show so per-show segments stay correct.
          if (currentShowId && settings.perShowSettings[currentShowId]?.customSegments) {
            settings.customSegments = settings.perShowSettings[currentShowId].customSegments;
          } else {
            settings.customSegments = [];
          }
          setTimeout(startMonitoring, 500);
        }
      });
      navObserver.observe(root, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startVideoSystem, { once: true });
    } else {
      startVideoSystem();
    }
  }

  // ===== MESSAGE HANDLING =====
  // Actions that need a real video element. If this frame has no video,
  // we must NOT respond, so the message can be answered by the iframe
  // that does contain the player.
  const VIDEO_REQUIRED_ACTIONS = new Set([
    'getSettings', 'setOutroNow', 'skipIntroNow', 'skipNow',
    'triggerFullscreen', 'setSpeed', 'getStats'
  ]);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Refresh handle in case the player swapped its <video> element.
    if (!videoElement || !videoElement.isConnected) {
      const v = findVideoElement();
      if (v) videoElement = v;
    }

    if (VIDEO_REQUIRED_ACTIONS.has(request.action) && !videoElement) {
      // Yield to a sibling frame that may have the video.
      return false;
    }

    switch(request.action) {
      case 'getSettings':
        sendResponse({ 
          settings,
          showId: currentShowId,
          showSettings: currentShowId ? (settings.perShowSettings[currentShowId] || {}) : null,
          currentTime: videoElement?.currentTime || 0,
          duration: videoElement?.duration || 0,
          playbackRate: videoElement?.playbackRate || 1,
          episodeInfo: getCurrentEpisodeInfo()
        });
        break;
        
      case 'updateSettings':
        const hadAudioFingerprint = settings.audioFingerprintIntro;
        Object.assign(settings, request.settings);
        saveSettings();
        startBedtimeWatcher();
        if (request.settings && typeof request.settings.audioFingerprintIntro === 'boolean') {
          if (request.settings.audioFingerprintIntro && !hadAudioFingerprint && videoElement) {
            setupAudioFingerprinting();
          } else if (!request.settings.audioFingerprintIntro && hadAudioFingerprint) {
            stopAudioCapture();
          } else if (request.settings.audioFingerprintIntro && hadAudioFingerprint && audioContext && videoElement) {
            startAudioCapture();
          }
        }
        sendResponse({ success: true });
        break;

      case 'setPerShowSetting':
        if (!currentShowId) {
          sendResponse({ success: false, error: 'No show detected' });
          break;
        }
        if (!settings.perShowSettings[currentShowId]) settings.perShowSettings[currentShowId] = {};
        if (request.value === null || request.value === '' || request.value === undefined) {
          delete settings.perShowSettings[currentShowId][request.key];
        } else {
          settings.perShowSettings[currentShowId][request.key] = request.value;
        }
        saveSettings();
        // Apply speed immediately if the user changed the per-show default speed.
        if (request.key === 'defaultSpeed' && videoElement) {
          const speed = Number.isFinite(parseFloat(request.value)) && parseFloat(request.value) > 0
            ? parseFloat(request.value)
            : (settings.defaultSpeed || 1);
          videoElement.playbackRate = speed;
        }
        sendResponse({ success: true, showSettings: settings.perShowSettings[currentShowId] });
        break;
        
      case 'setOutroNow':
        if (!videoElement) {
          sendResponse({ success: false, error: 'No video detected' });
          break;
        }

        settings.outroStart = videoElement.currentTime;
        if (currentShowId) {
          if (!settings.perShowSettings[currentShowId]) {
            settings.perShowSettings[currentShowId] = {};
          }
          settings.perShowSettings[currentShowId].outroStart = videoElement.currentTime;
        }
        saveSettings();
        sendResponse({ success: true, outroStart: videoElement.currentTime });
        break;
        
      case 'skipIntroNow':
        if (!videoElement) {
          sendResponse({ success: false, error: 'No video detected' });
          break;
        }
        skipIntro(true);
        sendResponse({ success: true });
        break;
        
      case 'skipNow':
        if (!videoElement) {
          sendResponse({ success: false, error: 'No video detected' });
          break;
        }
        skipOutro();
        sendResponse({ success: true });
        break;

      case 'nextEpisode':
        if (navigateToNextEpisode()) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No next episode found' });
        }
        break;

      case 'previousEpisode':
        try {
          const prevUrl = getPreviousEpisodeUrl();
          if (prevUrl) {
            window.location.href = prevUrl;
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No previous episode found' });
          }
        } catch (_) {
          sendResponse({ success: false, error: 'No previous episode found' });
        }
        break;
        
      case 'triggerFullscreen':
        enterFullscreen();
        sendResponse({ success: true });
        break;
        
      case 'setSpeed':
        setSpeed(request.speed);
        sendResponse({ success: true });
        break;
        
      case 'getStats':
        sendResponse({ 
          success: true, 
          stats: state.stats,
          segments: settings.customSegments
        });
        break;
        
      case 'clearSegments':
        settings.customSegments = [];
        state.skippedSegments.clear();
        if (currentShowId && settings.perShowSettings[currentShowId]) {
          settings.perShowSettings[currentShowId].customSegments = [];
        }
        saveSettings();
        sendResponse({ success: true });
        break;

      case 'clearIntroFingerprint':
        clearIntroFingerprint();
        sendResponse({ success: true });
        break;
        
      case 'exportSettings':
        sendResponse({ 
          success: true, 
          data: {
            settings,
            stats: state.stats,
            exportedAt: new Date().toISOString()
          }
        });
        break;
        
      case 'importSettings':
        if (request.data) {
          Object.assign(settings, request.data.settings);
          Object.assign(state.stats, request.data.stats);
          saveSettings();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No data provided' });
        }
        break;

      case 'reset':
        chrome.storage.local.remove(['streamshade_settings', 'streamshade_stats'], () => {
          sendResponse({ success: true });
          try { window.location.reload(); } catch (_) {}
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action: ' + request.action });
        break;
    }
    return true;
  });

  // Inject the fast-startup patch SYNCHRONOUSLY at document_start, before
  // LookMovie's own scripts begin. This must run before chrome.storage's async
  // callback or the countdown will already be ticking. The patch is a no-op
  // off play pages, so it's safe to always run.
  try { injectFastStartup(); } catch (_) {}

  // Load and start
  loadSettings();
})();
