// StreamShade Pro - Original Gentle Approach
// Hides timer/premium popup, auto-clicks "go to show" and "continue watching"
// Does NOT use aggressive ad blocking - moves elements off-screen instead

(function() {
  'use strict';

  // ===== CONFIGURATION =====
  const DEFAULT_INTRO_SKIP = 40;
  const DEFAULT_FULLSCREEN_DELAY = 35;
  const SKIP_BUFFER = 2;

  // ===== STATE =====
  let videoElement = null;
  let videoContainer = null;
  let currentShowId = null;
  let closeInterval = null;
  let observer = null;
  let autoCloseEnabled = true;
  let continueWatchingEnabled = true;
  
  let settings = {
    // StreamShade features
    autoCloseEnabled: true,
    continueWatchingEnabled: true,
    
    // Skipper features
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

    // Outro
    autoDetectOutro: true,

    // Audio enhancements
    audioEnhancements: false,
    volumeBoost: 1.0,       // 1.0 = 100%, range 0..4 (0% = mute, 400% = max boost)
    eqPreset: 'flat',       // flat | voice | bass | cinema | music
    compressor: false,
    balance: 0,             // -1 left, 0 center, 1 right
    
    // Per-show settings
    perShowSettings: {},
    customSegments: []
  };
  
  let state = {
    hasSkippedIntro: false,
    hasSkippedOutro: false,
    hasGoneFullscreen: false,
    fullscreenTimer: null,
    isProcessing: false,
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

  // ===== NOTIFICATION SYSTEM =====
  function showNotification(message, duration = 2000) {
    if (!settings.showNotifications) return;
    
    if (!notificationEl) {
      notificationEl = document.createElement('div');
      notificationEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #e50914 0%, #b20710 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 2147483647;
        opacity: 0;
        transform: translateX(100px);
        transition: all 0.3s ease;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(notificationEl);
    }
    
    notificationEl.textContent = message;
    notificationEl.style.opacity = '1';
    notificationEl.style.transform = 'translateX(0)';
    
    setTimeout(() => {
      notificationEl.style.opacity = '0';
      notificationEl.style.transform = 'translateX(100px)';
    }, duration);
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
      const continueBtn = document.getElementById('progress-continue-button');
      if (continueBtn && continueBtn.offsetParent !== null) {
        // Check if button is inside the continue watching DIALOG (not player controls)
        const parentDialog = continueBtn.closest('[role="dialog"], .modal, .overlay, .popup') || 
                             continueBtn.parentElement?.parentElement;
        
        if (parentDialog) {
          const dialogText = parentDialog.textContent?.toLowerCase() || '';
          
          // Only click if it's the "Continue watching" dialog
          const isContinueDialog = dialogText.includes('continue') || 
                                   dialogText.includes('still watching') ||
                                   dialogText.includes('are you there') ||
                                   classStr(parentDialog).includes('dialog') ||
                                   parentDialog.getAttribute('role') === 'dialog';
          
          if (isContinueDialog) {
            continueBtn.style.pointerEvents = 'auto';
            continueBtn.style.opacity = '1';
            continueBtn.disabled = false;
            continueBtn.click();
            console.log('[StreamShade] Auto-clicked Continue Watching');
            showNotification('▶ Continue watching', 1500);
          }
        }
      }
    } catch (err) {
      console.error('[StreamShade] Continue watching error:', err);
    }
  }

  function startPopupWatcher() {
    if (!settings.autoCloseEnabled) return;
    
    // Start immediately - don't wait for video
    closeInterval = setInterval(() => {
      hidePremiumPopup();
      clickContinueWatching();
    }, 2000);
    
    // MutationObserver for dynamic popups
    observer = new MutationObserver((mutations) => {
      if (!settings.autoCloseEnabled) return;
      
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
          }
        });
      });
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    console.log('[StreamShade] Popup watcher started');
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

      const hasSrc = Boolean(
        video.currentSrc ||
        video.src ||
        video.getAttribute('src') ||
        video.getAttribute('data-src') ||
        video.querySelector('source[src]')
      );

      const readyBoost = (video.readyState || 0) >= 2 ? 500000 : 0;
      const srcBoost = hasSrc ? 1000000 : 0;

      const score = area + readyBoost + srcBoost;

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
  function getEffectiveIntroSeconds() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && Number.isFinite(perShow.introSkipSeconds) && perShow.introSkipSeconds > 0) {
      return perShow.introSkipSeconds;
    }
    return settings.introSkipSeconds || DEFAULT_INTRO_SKIP;
  }

  function getEffectiveSkipIntro() {
    const perShow = currentShowId && settings.perShowSettings[currentShowId];
    if (perShow && typeof perShow.skipIntro === 'boolean') return perShow.skipIntro;
    return settings.skipIntro !== false;
  }

  // ===== CORE FEATURES =====
  function skipIntro(force = false) {
    if (!videoElement) return;

    const introEnabled = getEffectiveSkipIntro();
    if (!force) {
      if (state.hasSkippedIntro || !introEnabled) return;
    }

    const duration = videoElement.duration || Infinity;
    const currentTime = videoElement.currentTime;
    const learned = getEffectiveIntroSeconds();

    // Manual: jump to learned target, but never backward.
    // Auto: jump to learned target only if we're still before it.
    const skipTime = force
      ? Math.min(Math.max(learned, currentTime + 1), duration - 5)
      : Math.min(learned, duration - 5);

    if (skipTime <= 0) return;
    if (currentTime >= skipTime - 0.5) return;

    // Learn from a manual skip: where the user said the intro ends.
    if (force && settings.autoLearnIntro && currentShowId
        && currentTime > 5 && currentTime < duration * 0.5) {
      if (!settings.perShowSettings[currentShowId]) settings.perShowSettings[currentShowId] = {};
      settings.perShowSettings[currentShowId].introSkipSeconds = Math.round(currentTime);
    }

    state.hasSkippedIntro = true;
    videoElement.currentTime = skipTime;

    state.stats.introsSkipped++;
    state.stats.totalTimeSaved += Math.max(0, skipTime - currentTime);
    saveSettings();

    showNotification(`⏭ Skipped intro (${Math.round(skipTime)}s)`, 2000);
    console.log(`[StreamShade] Intro: ${currentTime.toFixed(1)}s → ${skipTime}s`);
  }

  function skipOutro() {
    // If user has set an outroStart, jump there first (manual button case).
    if (videoElement && settings.outroStart != null) {
      const duration = videoElement.duration || 0;
      const target = typeof settings.outroStart === 'number'
        ? settings.outroStart
        : parseTime(settings.outroStart, duration);

      if (Number.isFinite(target) && target > videoElement.currentTime + 0.5) {
        videoElement.currentTime = target;
        state.stats.outrosSkipped++;
        state.stats.totalTimeSaved += (target - (videoElement.currentTime || 0));
        saveSettings();
        showNotification('⏭ Skipped to outro', 1500);
        return;
      }
    }

    const nextBtn = document.querySelector('[data-next-episode], .next-episode, #next-episode, a.next-episode, .jw-next');
    
    if (nextBtn && nextBtn.href) {
      state.stats.outrosSkipped++;
      saveSettings();
      showNotification('⏭ Next episode...', 1500);
      window.location.href = nextBtn.href;
    } else if (videoElement && videoElement.duration) {
      videoElement.currentTime = Math.max(0, videoElement.duration - 1);
      state.stats.outrosSkipped++;
      saveSettings();
      showNotification('⏭ Jumped to end', 1500);
    }
  }

  async function enterFullscreen() {
    if (state.hasGoneFullscreen || state.isProcessing) return;
    state.isProcessing = true;

    try {
      const candidates = [
        videoContainer,
        videoElement,
        document.documentElement
      ].filter(Boolean);
      
      if (document.fullscreenElement) {
        state.hasGoneFullscreen = true;
        state.isProcessing = false;
        return;
      }

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
      state.isProcessing = false;
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
      
      showNotification('⏭ Skipping outro...', 1500);
      
      setTimeout(() => {
        skipOutro();
        state.isProcessing = false;
      }, 500);
    }
    
    if (currentTime < outroStartTime - SKIP_BUFFER) {
      state.hasSkippedOutro = false;
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
    
    if (!settings.perShowSettings[currentShowId]) {
      settings.perShowSettings[currentShowId] = {};
    }
    settings.perShowSettings[currentShowId].customSegments = settings.customSegments;
    
    saveSettings();
    showNotification(`✓ Added "${name}" (${duration}s)`, 2500);
  }

  // ===== PLAYBACK SPEED =====
  function setSpeed(speed) {
    if (!videoElement) return;
    videoElement.playbackRate = speed;
    settings.defaultSpeed = speed;
    saveSettings();
    
    if (!speedIndicatorEl) {
      speedIndicatorEl = document.createElement('div');
      speedIndicatorEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: #e50914;
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 999999;
        display: none;
      `;
      document.body.appendChild(speedIndicatorEl);
    }
    
    speedIndicatorEl.textContent = `${speed}x`;
    speedIndicatorEl.style.display = 'block';
    setTimeout(() => speedIndicatorEl.style.display = 'none', 2000);
  }

  // ===== VIDEO EVENT HANDLERS =====
  function onTimeUpdate() {
    if (!videoElement || state.isProcessing) return;

    const currentTime = videoElement.currentTime;

    if (getEffectiveSkipIntro() && !state.hasSkippedIntro && currentTime < getEffectiveIntroSeconds() && currentTime > 0.5) {
      skipIntro();
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
        !state.fullscreenAttempted
      ) {
        state.fullscreenAttempted = true;
        ensureFullscreenGestureRetryHook();
        enterFullscreen();
      }
    }
  }

  function onVideoPlay() {
    if (!settings.autoFullscreen || state.hasGoneFullscreen) return;

    // Arm fullscreen relative to when playback starts/resumes.
    state.fullscreenTargetTime = videoElement?.currentTime + (settings.fullscreenDelaySeconds || DEFAULT_FULLSCREEN_DELAY);
    state.fullscreenAttempted = false;
    ensureFullscreenGestureRetryHook();

    if (getEffectiveSkipIntro() && !state.hasSkippedIntro) {
      setTimeout(() => {
        if (!videoElement || state.hasSkippedIntro) return;
        // If playback started and we're still near the start, skip.
        if (videoElement.currentTime > 0.5 && videoElement.currentTime < getEffectiveIntroSeconds()) {
          skipIntro();
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
    if (state.fullscreenTimer) {
      clearTimeout(state.fullscreenTimer);
      state.fullscreenTimer = null;
    }
  }

  // ===== FLOATING CONTROLS =====
  function createFloatingControls() {
    if (controlsEl) return;
    
    controlsEl = document.createElement('div');
    controlsEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.9);
      backdrop-filter: blur(10px);
      padding: 8px 16px;
      border-radius: 30px;
      display: flex;
      gap: 8px;
      z-index: 999999;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    
    controlsEl.innerHTML = `
      <button style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;" onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('speed', {detail:0.5}))">0.5x</button>
      <button style="background:#e50914;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;" onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('speed', {detail:1}))">1x</button>
      <button style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;" onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('speed', {detail:1.5}))">1.5x</button>
      <button style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;" onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('speed', {detail:2}))">2x</button>
      <button style="background:#e50914;color:#fff;border:none;padding:6px 12px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;" onclick="this.closest('.ss-controls').dispatchEvent(new CustomEvent('skipIntro'))">Skip Intro</button>
    `;
    
    controlsEl.className = 'ss-controls';
    
    controlsEl.addEventListener('speed', (e) => setSpeed(e.detail));
    controlsEl.addEventListener('skipIntro', skipIntro);
    
    document.body.appendChild(controlsEl);
    
    // Show on video hover
    videoElement.addEventListener('mouseenter', () => {
      controlsEl.style.opacity = '1';
      controlsEl.style.pointerEvents = 'auto';
    });
    
    videoElement.addEventListener('mouseleave', () => {
      setTimeout(() => {
        controlsEl.style.opacity = '0';
        controlsEl.style.pointerEvents = 'none';
      }, 2000);
    });
  }

  // ===== KEYBOARD SHORTCUTS =====
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      switch(e.key) {
        case 'i':
        case 'I':
          if (e.shiftKey) {
            e.preventDefault();
            skipIntro();
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
  function startMonitoring() {
    const found = findVideoElement();
    if (!found) {
      setTimeout(startMonitoring, 500);
      return;
    }

    if (videoElement === found && videoElement?.dataset?.streamshadeBound === '1') {
      return;
    }

    videoElement = found;
    
    videoContainer = findVideoContainer(videoElement);
    resetState();

    try {
      videoElement.dataset.streamshadeBound = '1';
    } catch (_) {}
    
    // Remove old listeners
    videoElement.removeEventListener('timeupdate', onTimeUpdate);
    videoElement.removeEventListener('play', onVideoPlay);
    videoElement.removeEventListener('pause', onVideoPause);
    videoElement.removeEventListener('seeking', onVideoSeeking);
    videoElement.removeEventListener('ended', resetState);
    
    // Add listeners
    videoElement.addEventListener('timeupdate', onTimeUpdate);
    videoElement.addEventListener('play', onVideoPlay);
    videoElement.addEventListener('playing', onVideoPlay);
    videoElement.addEventListener('pause', onVideoPause);
    videoElement.addEventListener('seeking', onVideoSeeking);
    videoElement.addEventListener('ended', resetState);
    
    // Apply settings
    setSpeed(settings.defaultSpeed);
    ensureAudioForCurrentVideo();
    setupKeyboardShortcuts();
    createFloatingControls();

    // If we attached after playback already started, arm fullscreen now.
    if (!videoElement.paused) {
      onVideoPlay();
    }
    
    console.log('[StreamShade] Active | Intro:', settings.introSkipSeconds + 's | Fullscreen:', settings.fullscreenDelaySeconds + 's');
    showNotification('StreamShade ready', 2000);
  }

  // ===== BEDTIME MODE (top frame only) =====
  let bedtimeTimer = null;
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

  // ===== AUDIO ENHANCEMENTS (Web Audio API) =====
  // A MediaElementSource can only be created once per <video>. Once created, audio
  // is permanently routed through Web Audio for that element. We only wire it up
  // when the user explicitly enables enhancements; when disabled afterwards we
  // simply set the chain to bypass values rather than tearing it down.
  let audioCtx = null;
  let audioSource = null;
  let audioGain = null;
  let eqLow = null, eqMid = null, eqHigh = null;
  let audioComp = null;
  let audioPanner = null;
  let audioInitialized = false;
  let audioSourcedElement = null;

  const EQ_PRESETS = {
    flat:   { low:  0, mid:  0, high:  0 },
    voice:  { low: -2, mid:  6, high:  2 },
    bass:   { low:  8, mid:  0, high: -2 },
    cinema: { low:  4, mid: -2, high:  4 },
    music:  { low:  3, mid:  0, high:  3 }
  };

  function setupAudioGraph() {
    if (audioInitialized) return true;
    if (!videoElement || audioSourcedElement === videoElement) return false;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      audioCtx = new AC();
      audioSource = audioCtx.createMediaElementSource(videoElement);
      audioSourcedElement = videoElement;

      audioGain = audioCtx.createGain();

      eqLow = audioCtx.createBiquadFilter();
      eqLow.type = 'lowshelf';   eqLow.frequency.value = 200;
      eqMid = audioCtx.createBiquadFilter();
      eqMid.type = 'peaking';    eqMid.frequency.value = 1500; eqMid.Q.value = 1;
      eqHigh = audioCtx.createBiquadFilter();
      eqHigh.type = 'highshelf'; eqHigh.frequency.value = 4000;

      audioComp = audioCtx.createDynamicsCompressor();
      audioPanner = audioCtx.createStereoPanner();

      audioSource.connect(audioGain);
      audioGain.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(audioComp);
      audioComp.connect(audioPanner);
      audioPanner.connect(audioCtx.destination);

      audioInitialized = true;
      console.log('[StreamShade] Audio graph initialised');
      applyAudioSettings();
      return true;
    } catch (e) {
      console.warn('[StreamShade] Audio setup failed', e);
      audioInitialized = false;
      return false;
    }
  }

  function applyAudioSettings() {
    const on = settings.audioEnhancements === true;
    // volumeBoost = 0..4 (0% mute, 100% normal, 400% boost). Always honour
    // it via the native video.volume for 0..1, so users can mute / lower
    // volume without needing Enhancements turned on.
    const boost = Math.max(0, Math.min(4, settings.volumeBoost ?? 1));
    if (videoElement) {
      try { videoElement.volume = Math.min(1, boost); } catch (_) {}
    }

    if (!audioInitialized) return;
    // Above unity gain (>100%) requires Web Audio, so only apply when on.
    if (audioGain) audioGain.gain.value = on ? Math.max(1, boost) : 1;

    // EQ
    const eq = EQ_PRESETS[settings.eqPreset] || EQ_PRESETS.flat;
    if (eqLow)  eqLow.gain.value  = on ? eq.low  : 0;
    if (eqMid)  eqMid.gain.value  = on ? eq.mid  : 0;
    if (eqHigh) eqHigh.gain.value = on ? eq.high : 0;

    // Compressor: bypass-equivalent values when off.
    if (audioComp) {
      if (on && settings.compressor) {
        audioComp.threshold.value = -24;
        audioComp.knee.value      = 30;
        audioComp.ratio.value     = 12;
        audioComp.attack.value    = 0.003;
        audioComp.release.value   = 0.25;
      } else {
        audioComp.threshold.value = 0;
        audioComp.knee.value      = 0;
        audioComp.ratio.value     = 1;
        audioComp.attack.value    = 0;
        audioComp.release.value   = 0.25;
      }
    }

    // Balance
    if (audioPanner) {
      const bal = Math.max(-1, Math.min(1, settings.balance || 0));
      audioPanner.pan.value = on ? bal : 0;
    }
  }

  function ensureAudioForCurrentVideo() {
    // Called whenever a new video element binds or audio settings change.
    if (!settings.audioEnhancements) {
      // If already initialised on this element, just reapply (which will bypass).
      applyAudioSettings();
      return;
    }
    if (!audioInitialized) {
      const ok = setupAudioGraph();
      if (!ok) {
        console.warn('[StreamShade] Audio setup deferred (no video yet in this frame)');
        return;
      }
    } else {
      applyAudioSettings();
    }
    // AudioContext starts suspended due to autoplay policy. Try resume now,
    // and install a one-shot user-gesture listener as a backup so it kicks in
    // on the next click/keypress in the page.
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
      if (!ensureAudioForCurrentVideo._resumeHook) {
        ensureAudioForCurrentVideo._resumeHook = true;
        const resume = () => {
          if (audioCtx) audioCtx.resume().catch(() => {});
          document.removeEventListener('pointerdown', resume, true);
          document.removeEventListener('keydown', resume, true);
          ensureAudioForCurrentVideo._resumeHook = false;
        };
        document.addEventListener('pointerdown', resume, true);
        document.addEventListener('keydown', resume, true);
      }
    }
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
      try { ensureAudioForCurrentVideo(); } catch (_) {}
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

    // Start popup closer
    startPopupWatcher();

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
          duration: videoElement?.duration || 0
        });
        break;
        
      case 'updateSettings':
        Object.assign(settings, request.settings);
        saveSettings();
        startBedtimeWatcher();
        ensureAudioForCurrentVideo();
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
        }
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
