document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  function sendToContent(message, callback) {
    chrome.runtime.sendMessage(
      { target: 'streamshade-background', action: 'forwardToVideoFrame', payload: message },
      (res) => {
        if (chrome.runtime.lastError) {
          callback && callback({ error: chrome.runtime.lastError.message });
        } else {
          callback && callback(res);
        }
      }
    );
  }

  const els = {
    skipIntroNowBtn: document.getElementById('skipIntroNowBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    skipOutroNowBtn: document.getElementById('skipOutroNowBtn'),
    nextEpisodeBtn: document.getElementById('nextEpisodeBtn'),
    introSeconds: document.getElementById('introSeconds'),
    fullscreenSeconds: document.getElementById('fullscreenSeconds'),
    outroTime: document.getElementById('outroTime'),
    setNowBtn: document.getElementById('setNowBtn'),
    autoDetectBtn: document.getElementById('autoDetectBtn'),
    outroBadge: document.getElementById('outroBadge'),
    skipIntro: document.getElementById('skipIntro'),
    autoFullscreen: document.getElementById('autoFullscreen'),
    autoSkip: document.getElementById('autoSkip'),
    autoCloseEnabled: document.getElementById('autoCloseEnabled'),
    continueWatchingEnabled: document.getElementById('continueWatchingEnabled'),
    showNotifications: document.getElementById('showNotifications'),
    autoClickSkipOverlays: document.getElementById('autoClickSkipOverlays'),
    fastStartup: document.getElementById('fastStartup'),
    autoDetectOutro: document.getElementById('autoDetectOutro'),
    autoLearnIntro: document.getElementById('autoLearnIntro'),
    audioFingerprintIntro: document.getElementById('audioFingerprintIntro'),
    universalAutoClick: document.getElementById('universalAutoClick'),
    popupAutoClick: document.getElementById('popupAutoClick'),
    introFingerprintStatus: document.getElementById('introFingerprintStatus'),
    clearIntroFingerprintBtn: document.getElementById('clearIntroFingerprintBtn'),
    showIdBadge: document.getElementById('showIdBadge'),
    episodeInfoRow: document.getElementById('episodeInfoRow'),
    episodeInfoNav: document.getElementById('episodeInfoNav'),
    episodeInfoTitle: document.getElementById('episodeInfoTitle'),
    episodeInfoSep: document.getElementById('episodeInfoSep'),
    episodeInfoSub: document.getElementById('episodeInfoSub'),
    prevEpisodeBtn: document.getElementById('prevEpisodeBtn'),
    nextEpisodeSmallBtn: document.getElementById('nextEpisodeSmallBtn'),
    showIntroStartSeconds: document.getElementById('showIntroStartSeconds'),
    showIntroSeconds: document.getElementById('showIntroSeconds'),
    showSpeed: document.getElementById('showSpeed'),
    clearShowIntroBtn: document.getElementById('clearShowIntroBtn'),
    bedtimeEnabled: document.getElementById('bedtimeEnabled'),
    bedtimeTime: document.getElementById('bedtimeTime'),
    bedtimeUrl: document.getElementById('bedtimeUrl'),
    segmentsList: document.getElementById('segmentsList'),
    clearSegmentsBtn: document.getElementById('clearSegmentsBtn'),
    speedBtns: document.querySelectorAll('.spd'),
    statusDot: document.getElementById('statusIndicator'),
    statusText: document.getElementById('statusText'),
    timeSaved: document.getElementById('timeSaved'),
    statTimeSaved: document.getElementById('statTimeSaved'),
    statIntros: document.getElementById('statIntros'),
    statOutros: document.getElementById('statOutros'),
    statSegments: document.getElementById('statSegments'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    resetBtn: document.getElementById('resetBtn')
  };

  const state = { isVideoActive: false };

  function init() {
    setupTabs();
    loadAll();
    setupListeners();
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.pane').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });
  }

  function loadAll() {
    sendToContent({ action: 'getSettings' }, (res) => {
      if (chrome.runtime.lastError || !res) {
        // Fall back to chrome.storage so settings UI still works on
        // pages where no video is playing (e.g. LookMovie homepage).
        chrome.storage.local.get('streamshade_settings', (data) => {
          const s = data.streamshade_settings || {};
          state.showId = null;
          state.showSettings = {};
          updateUI(s);
          updateShowUI();
          updateStatus('idle', 'No video on this page');
          disableActions();
        });
        return;
      }
      state.isVideoActive = res.duration > 0;
      state.showId = res.showId || null;
      state.showSettings = res.showSettings || {};
      state.episodeInfo = res.episodeInfo || null;
      updateUI(res.settings, res.playbackRate);
      updateShowUI();
      updateStatus(state.isVideoActive ? 'active' : 'idle', state.isVideoActive ? 'Video detected' : 'No video');
      if (state.isVideoActive) enableActions();
      loadStats();
    });
  }

  function updateShowUI() {
    if (state.showId) {
      els.showIdBadge.textContent = `#${state.showId}`;
      els.showIntroStartSeconds.disabled = false;
      els.showIntroSeconds.disabled = false;
      els.showSpeed.disabled = false;
      els.clearShowIntroBtn.disabled = false;
      const start = state.showSettings?.introStartSeconds;
      const end = state.showSettings?.introSkipSeconds;
      const speed = state.showSettings?.defaultSpeed;
      els.showIntroStartSeconds.value = (Number.isFinite(start) && start >= 0) ? start : '';
      els.showIntroSeconds.value = (Number.isFinite(end) && end > 0) ? end : '';
      els.showSpeed.value = (Number.isFinite(speed) && speed > 0) ? speed : '';

      const ep = state.episodeInfo;
      if (ep && ep.season && ep.episode) {
        els.episodeInfoRow.style.display = 'block';
        els.episodeInfoNav.style.display = 'flex';
        els.episodeInfoTitle.textContent = `S${ep.season}E${ep.episode}: ${ep.title || 'Episode ' + ep.episode}`;
        els.episodeInfoSub.textContent = ep.showTitle || '';
        els.episodeInfoSep.style.display = ep.showTitle ? 'inline' : 'none';
      } else {
        els.episodeInfoRow.style.display = 'none';
        els.episodeInfoNav.style.display = 'none';
      }

      if (els.introFingerprintStatus) {
        const fp = state.showSettings?.introFingerprint;
        els.introFingerprintStatus.textContent = fp && fp.samples && fp.samples.length
          ? `Signature saved (${fp.samples.length} samples)`
          : 'No signature saved for this show';
      }
    } else {
      els.showIdBadge.textContent = 'no show';
      els.showIntroStartSeconds.value = '';
      els.showIntroStartSeconds.disabled = true;
      els.showIntroSeconds.value = '';
      els.showIntroSeconds.disabled = true;
      els.showSpeed.value = '';
      els.showSpeed.disabled = true;
      els.clearShowIntroBtn.disabled = true;
      els.episodeInfoRow.style.display = 'none';
      els.episodeInfoNav.style.display = 'none';
      if (els.introFingerprintStatus) {
        els.introFingerprintStatus.textContent = 'No signature saved for this show';
      }
    }
  }

  function updateUI(s, playbackRate) {
    els.introSeconds.value = s.introSkipSeconds || 40;
    els.fullscreenSeconds.value = s.fullscreenDelaySeconds || 35;
    els.skipIntro.checked = s.skipIntro !== false;
    els.autoFullscreen.checked = s.autoFullscreen !== false;
    els.autoSkip.checked = s.autoSkipOutro !== false;
    els.autoCloseEnabled.checked = s.autoCloseEnabled !== false;
    els.continueWatchingEnabled.checked = s.continueWatchingEnabled !== false;
    els.showNotifications.checked = s.showNotifications !== false;
    els.autoClickSkipOverlays.checked = s.autoClickSkipOverlays !== false;
    els.fastStartup.checked = s.fastStartup !== false;
    els.autoDetectOutro.checked = s.autoDetectOutro !== false;
    els.autoLearnIntro.checked = s.autoLearnIntro !== false;
    els.audioFingerprintIntro.checked = s.audioFingerprintIntro === true;
    els.universalAutoClick.checked = s.universalAutoClick === true;
    els.popupAutoClick.checked = s.popupAutoClick === true;
    els.bedtimeEnabled.checked = s.bedtimeEnabled === true;
    els.bedtimeTime.value = s.bedtimeTime || '23:00';
    els.bedtimeUrl.value = s.bedtimeUrl || 'https://www.youtube.com/watch?v=HH0pojCvq44';

    if (s.outroStart) {
      els.outroTime.value = typeof s.outroStart === 'number' 
        ? `${Math.floor(s.outroStart/60)}:${Math.floor(s.outroStart%60).toString().padStart(2,'0')}`
        : s.outroStart;
      if (els.outroBadge) {
        els.outroBadge.textContent = 'Manual';
        els.outroBadge.classList.add('manual');
      }
    } else {
      if (els.outroBadge) {
        els.outroBadge.textContent = 'Auto';
        els.outroBadge.classList.remove('manual');
      }
    }
    
    const activeSpeed = playbackRate || s.defaultSpeed || 1;
    els.speedBtns.forEach(btn => btn.classList.toggle('active', parseFloat(btn.dataset.speed) === activeSpeed));
  }

  function updateStatus(type, text) {
    els.statusDot.className = 'dot ' + (type === 'active' ? 'active' : type === 'error' ? 'error' : '');
    els.statusText.textContent = text;
  }

  function disableActions() {
    [els.skipIntroNowBtn, els.fullscreenBtn, els.skipOutroNowBtn, els.nextEpisodeBtn].forEach(btn => btn.disabled = true);
  }

  function enableActions() {
    [els.skipIntroNowBtn, els.fullscreenBtn, els.skipOutroNowBtn, els.nextEpisodeBtn].forEach(btn => btn.disabled = false);
  }

  function loadStats() {
    sendToContent({ action: 'getStats' }, (res) => {
      if (!res?.stats) return;
      const mins = Math.floor(res.stats.totalTimeSaved / 60);
      els.timeSaved.textContent = `${mins}m saved`;
      els.statTimeSaved.textContent = mins;
      els.statIntros.textContent = res.stats.introsSkipped || 0;
      els.statOutros.textContent = res.stats.outrosSkipped || 0;
      els.statSegments.textContent = res.stats.segmentsSkipped || 0;
      renderSegments(res.segments || []);
    });
  }

  function renderSegments(segments) {
    if (!segments.length) {
      els.segmentsList.innerHTML = '<div class="empty">No segments yet.<br>Press <kbd style="display:inline;min-width:auto;padding:2px 5px;">⇧S</kbd> while watching to add one.</div>';
      return;
    }
    els.segmentsList.innerHTML = segments.map(seg => {
      const name = (seg?.name || 'Segment').toString();
      const start = Number(seg?.start || 0);
      const end = Number(seg?.end || 0);
      return `
        <div class="seg">
          <div class="seg-name">${escapeHtml(name)}</div>
          <div class="seg-time">${formatTime(start)} → ${formatTime(end)}</div>
        </div>
      `;
    }).join('');
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  }

  function save() {
    const settings = {
      introSkipSeconds: parseInt(els.introSeconds.value) || 40,
      fullscreenDelaySeconds: parseInt(els.fullscreenSeconds.value) || 35,
      outroStart: els.outroTime.value || null,
      skipIntro: els.skipIntro.checked,
      autoFullscreen: els.autoFullscreen.checked,
      autoSkipOutro: els.autoSkip.checked,
      autoCloseEnabled: els.autoCloseEnabled.checked,
      continueWatchingEnabled: els.continueWatchingEnabled.checked,
      showNotifications: els.showNotifications.checked,
      autoClickSkipOverlays: els.autoClickSkipOverlays.checked,
      fastStartup: els.fastStartup.checked,
      autoDetectOutro: els.autoDetectOutro.checked,
      autoLearnIntro: els.autoLearnIntro.checked,
      audioFingerprintIntro: els.audioFingerprintIntro.checked,
      universalAutoClick: els.universalAutoClick.checked,
      popupAutoClick: els.popupAutoClick.checked,
      bedtimeEnabled: els.bedtimeEnabled.checked,
      bedtimeTime: els.bedtimeTime.value || '23:00',
      bedtimeUrl: els.bedtimeUrl.value || 'https://www.youtube.com/watch?v=HH0pojCvq44',
    };
    sendToContent({ action: 'updateSettings', settings });
  }

  function saveShowIntro() {
    if (!state.showId) return;
    const raw = els.showIntroSeconds.value;
    const value = raw === '' ? null : (parseInt(raw, 10) || null);
    sendToContent({
      action: 'setPerShowSetting',
      key: 'introSkipSeconds',
      value
    }, (res) => {
      if (res?.success) {
        state.showSettings = res.showSettings || {};
      }
    });
  }

  function saveShowIntroStart() {
    if (!state.showId) return;
    const raw = els.showIntroStartSeconds.value;
    const value = raw === '' ? null : (Number.isNaN(parseInt(raw, 10)) ? null : parseInt(raw, 10));
    sendToContent({
      action: 'setPerShowSetting',
      key: 'introStartSeconds',
      value
    }, (res) => {
      if (res?.success) {
        state.showSettings = res.showSettings || {};
      }
    });
  }

  function saveShowSpeed() {
    if (!state.showId) return;
    const raw = els.showSpeed.value;
    const value = raw === '' ? null : (parseFloat(raw) || null);
    sendToContent({
      action: 'setPerShowSetting',
      key: 'defaultSpeed',
      value: value && value > 0 ? value : null
    }, (res) => {
      if (res?.success) {
        state.showSettings = res.showSettings || {};
      }
    });
  }

  function trigger(action, btn, text) {
    sendToContent({ action }, (res) => {
      if (res?.success) {
        flashBtn(btn, text);
        return;
      }

      if (res?.error) {
        updateStatus('error', res.error);
      }
    });
  }

  function flashBtn(btn, text) {
    const labelEl = btn.querySelector?.('.act-lbl');
    const origText = labelEl ? labelEl.textContent : btn.textContent;

    if (labelEl) {
      labelEl.textContent = text;
    } else {
      btn.textContent = text;
    }

    btn.classList.add('is-success');
    const prevBorder = btn.style.borderColor;
    const prevBg = btn.style.background;
    if (!labelEl) {
      btn.style.borderColor = 'rgba(52,199,89,0.45)';
      btn.style.background = 'rgba(52,199,89,0.16)';
    }

    setTimeout(() => {
      if (labelEl) {
        labelEl.textContent = origText;
      } else {
        btn.textContent = origText;
        btn.style.borderColor = prevBorder;
        btn.style.background = prevBg;
      }
      btn.classList.remove('is-success');
    }, 850);
  }

  function setupListeners() {
    [els.skipIntroNowBtn, els.fullscreenBtn, els.skipOutroNowBtn, els.nextEpisodeBtn].forEach(btn => {
      const action = btn.id === 'skipIntroNowBtn' ? 'skipIntroNow' : btn.id === 'fullscreenBtn' ? 'triggerFullscreen' : btn.id === 'nextEpisodeBtn' ? 'nextEpisode' : 'skipNow';
      const text = btn.id === 'fullscreenBtn' ? 'Activated!' : btn.id === 'nextEpisodeBtn' ? 'Next!' : 'Skipped!';
      btn.addEventListener('click', () => trigger(action, btn, text));
    });

    els.setNowBtn.addEventListener('click', () => {
      sendToContent({ action: 'setOutroNow' }, (res) => {
        if (res?.success) {
          els.outroTime.value = `${Math.floor(res.outroStart/60)}:${Math.floor(res.outroStart%60).toString().padStart(2,'0')}`;
          save();
          flashBtn(els.setNowBtn, 'Set!');
        }
      });
    });

    els.autoDetectBtn.addEventListener('click', () => {
      sendToContent({ action: 'getSettings' }, (res) => {
        if (res?.duration > 0) {
          const time = Math.max(res.duration * 0.95, res.duration - 60);
          els.outroTime.value = `${Math.floor(time/60)}:${Math.floor(time%60).toString().padStart(2,'0')}`;
          save();
          flashBtn(els.autoDetectBtn, 'Detected!');
        }
      });
    });

    els.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        sendToContent({ action: 'setSpeed', speed });
        els.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    els.prevEpisodeBtn.addEventListener('click', () => trigger('previousEpisode', els.prevEpisodeBtn, '✓'));
    els.nextEpisodeSmallBtn.addEventListener('click', () => trigger('nextEpisode', els.nextEpisodeSmallBtn, '✓'));

    els.clearSegmentsBtn.addEventListener('click', () => {
      sendToContent({ action: 'clearSegments' }, () => {
        els.segmentsList.innerHTML = '<div class="empty">Segments cleared</div>';
        loadStats();
      });
    });

    els.clearIntroFingerprintBtn.addEventListener('click', () => {
      sendToContent({ action: 'clearIntroFingerprint' }, () => {
        if (els.introFingerprintStatus) {
          els.introFingerprintStatus.textContent = 'No signature saved for this show';
        }
        flashBtn(els.clearIntroFingerprintBtn, 'Cleared!');
      });
    });

    const debouncedSave = debounce(save, 300);
    [els.introSeconds, els.fullscreenSeconds, els.outroTime, els.bedtimeTime, els.bedtimeUrl].forEach(el => el.addEventListener('input', debouncedSave));
    [els.skipIntro, els.autoFullscreen, els.autoSkip, els.autoCloseEnabled, els.continueWatchingEnabled, els.showNotifications, els.autoClickSkipOverlays, els.fastStartup, els.autoDetectOutro, els.autoLearnIntro, els.audioFingerprintIntro, els.universalAutoClick, els.popupAutoClick, els.bedtimeEnabled].forEach(el => el.addEventListener('change', save));

    const debouncedShowIntroSave = debounce(saveShowIntro, 300);
    const debouncedShowIntroStartSave = debounce(saveShowIntroStart, 300);
    const debouncedShowSpeedSave = debounce(saveShowSpeed, 300);
    els.showIntroSeconds.addEventListener('input', debouncedShowIntroSave);
    els.showIntroStartSeconds.addEventListener('input', debouncedShowIntroStartSave);
    els.showSpeed.addEventListener('input', debouncedShowSpeedSave);
    els.clearShowIntroBtn.addEventListener('click', () => {
      els.showIntroStartSeconds.value = '';
      els.showIntroSeconds.value = '';
      els.showSpeed.value = '';
      saveShowIntroStart();
      saveShowIntro();
      saveShowSpeed();
      flashBtn(els.clearShowIntroBtn, 'Reset!');
    });

    els.exportBtn.addEventListener('click', () => {
      sendToContent({ action: 'exportSettings' }, (res) => {
        if (res?.data) {
          const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `streamshade-backup-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
          flashBtn(els.exportBtn, 'Exported!');
        }
      });
    });

    els.importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            sendToContent({ action: 'importSettings', data }, (res) => {
              if (res?.success) {
                loadAll();
                flashBtn(els.importBtn, 'Imported!');
              }
            });
          } catch (err) { alert('Invalid backup file'); }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    els.resetBtn.addEventListener('click', () => {
      if (confirm('Reset all settings?')) {
        sendToContent({ action: 'reset' }, () => location.reload());
      }
    });
  }

  function debounce(fn, ms) {
    let timer;
    return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
  }

  function escapeHtml(str) {
    return str
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  init();
});
