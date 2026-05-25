document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const els = {
    skipIntroNowBtn: document.getElementById('skipIntroNowBtn'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    skipOutroNowBtn: document.getElementById('skipOutroNowBtn'),
    introSeconds: document.getElementById('introSeconds'),
    fullscreenSeconds: document.getElementById('fullscreenSeconds'),
    outroTime: document.getElementById('outroTime'),
    setNowBtn: document.getElementById('setNowBtn'),
    autoDetectBtn: document.getElementById('autoDetectBtn'),
    skipIntro: document.getElementById('skipIntro'),
    autoFullscreen: document.getElementById('autoFullscreen'),
    autoSkip: document.getElementById('autoSkip'),
    autoCloseEnabled: document.getElementById('autoCloseEnabled'),
    continueWatchingEnabled: document.getElementById('continueWatchingEnabled'),
    showNotifications: document.getElementById('showNotifications'),
    fastStartup: document.getElementById('fastStartup'),
    autoDetectOutro: document.getElementById('autoDetectOutro'),
    autoLearnIntro: document.getElementById('autoLearnIntro'),
    showIdBadge: document.getElementById('showIdBadge'),
    showIntroSeconds: document.getElementById('showIntroSeconds'),
    clearShowIntroBtn: document.getElementById('clearShowIntroBtn'),
    bedtimeEnabled: document.getElementById('bedtimeEnabled'),
    bedtimeTime: document.getElementById('bedtimeTime'),
    bedtimeUrl: document.getElementById('bedtimeUrl'),
    audioEnhancements: document.getElementById('audioEnhancements'),
    volumeBoost: document.getElementById('volumeBoost'),
    volumeBoostValue: document.getElementById('volumeBoostValue'),
    balance: document.getElementById('balance'),
    balanceValue: document.getElementById('balanceValue'),
    compressor: document.getElementById('compressor'),
    eqBtns: document.querySelectorAll('.eq-btn'),
    segmentsList: document.getElementById('segmentsList'),
    clearSegmentsBtn: document.getElementById('clearSegmentsBtn'),
    speedBtns: document.querySelectorAll('.speed-btn:not(.eq-btn)'),
    statusIndicator: document.getElementById('statusIndicator'),
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
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });
  }

  function loadAll() {
    chrome.tabs.sendMessage(tab.id, { action: 'getSettings' }, (res) => {
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
      updateUI(res.settings);
      updateShowUI();
      updateStatus(state.isVideoActive ? 'active' : 'idle', state.isVideoActive ? 'Video detected' : 'No video');
      loadStats();
    });
  }

  function updateShowUI() {
    if (state.showId) {
      els.showIdBadge.textContent = `#${state.showId}`;
      els.showIntroSeconds.disabled = false;
      els.clearShowIntroBtn.disabled = false;
      const v = state.showSettings?.introSkipSeconds;
      els.showIntroSeconds.value = (Number.isFinite(v) && v > 0) ? v : '';
    } else {
      els.showIdBadge.textContent = 'no show';
      els.showIntroSeconds.value = '';
      els.showIntroSeconds.disabled = true;
      els.clearShowIntroBtn.disabled = true;
    }
  }

  function updateUI(s) {
    els.introSeconds.value = s.introSkipSeconds || 40;
    els.fullscreenSeconds.value = s.fullscreenDelaySeconds || 35;
    els.skipIntro.checked = s.skipIntro !== false;
    els.autoFullscreen.checked = s.autoFullscreen !== false;
    els.autoSkip.checked = s.autoSkipOutro !== false;
    els.autoCloseEnabled.checked = s.autoCloseEnabled !== false;
    els.continueWatchingEnabled.checked = s.continueWatchingEnabled !== false;
    els.showNotifications.checked = s.showNotifications !== false;
    els.fastStartup.checked = s.fastStartup !== false;
    els.autoDetectOutro.checked = s.autoDetectOutro !== false;
    els.autoLearnIntro.checked = s.autoLearnIntro !== false;
    els.bedtimeEnabled.checked = s.bedtimeEnabled === true;
    els.bedtimeTime.value = s.bedtimeTime || '23:00';
    els.bedtimeUrl.value = s.bedtimeUrl || 'https://www.youtube.com/watch?v=HH0pojCvq44';

    els.audioEnhancements.checked = s.audioEnhancements === true;
    const boost = Math.round((s.volumeBoost || 1) * 100);
    els.volumeBoost.value = boost;
    els.volumeBoostValue.textContent = boost + '%';
    const bal = Math.round((s.balance || 0) * 100);
    els.balance.value = bal;
    els.balanceValue.textContent = bal === 0 ? 'center' : (bal < 0 ? `L ${-bal}` : `R ${bal}`);
    els.compressor.checked = s.compressor === true;
    const activeEq = s.eqPreset || 'flat';
    els.eqBtns.forEach(b => b.classList.toggle('active', b.dataset.eq === activeEq));
    
    if (s.outroStart) {
      els.outroTime.value = typeof s.outroStart === 'number' 
        ? `${Math.floor(s.outroStart/60)}:${(s.outroStart%60).toString().padStart(2,'0')}`
        : s.outroStart;
    }
    
    const activeSpeed = s.defaultSpeed || 1;
    els.speedBtns.forEach(btn => btn.classList.toggle('active', parseFloat(btn.dataset.speed) === activeSpeed));
  }

  function updateStatus(type, text) {
    els.statusIndicator.className = 'status-indicator ' + (type === 'active' ? 'active' : type === 'error' ? 'error' : '');
    els.statusText.textContent = text;
  }

  function disableActions() {
    [els.skipIntroNowBtn, els.fullscreenBtn, els.skipOutroNowBtn].forEach(btn => btn.disabled = true);
  }

  function loadStats() {
    chrome.tabs.sendMessage(tab.id, { action: 'getStats' }, (res) => {
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
      els.segmentsList.innerHTML = '<div class="empty-state">No custom segments. Press Shift+S while watching to add one.</div>';
      return;
    }
    els.segmentsList.innerHTML = segments.map(seg => {
      const name = (seg?.name || 'Segment').toString();
      const start = Number(seg?.start || 0);
      const end = Number(seg?.end || 0);
      return `
        <div class="segment-item">
          <div class="segment-name">${escapeHtml(name)}</div>
          <div class="segment-time">${formatTime(start)} → ${formatTime(end)}</div>
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
      fastStartup: els.fastStartup.checked,
      autoDetectOutro: els.autoDetectOutro.checked,
      autoLearnIntro: els.autoLearnIntro.checked,
      bedtimeEnabled: els.bedtimeEnabled.checked,
      bedtimeTime: els.bedtimeTime.value || '23:00',
      bedtimeUrl: els.bedtimeUrl.value || 'https://www.youtube.com/watch?v=HH0pojCvq44',
      audioEnhancements: els.audioEnhancements.checked,
      volumeBoost: (parseInt(els.volumeBoost.value, 10) || 100) / 100,
      balance: (parseInt(els.balance.value, 10) || 0) / 100,
      compressor: els.compressor.checked,
      eqPreset: (Array.from(els.eqBtns).find(b => b.classList.contains('active'))?.dataset.eq) || 'flat'
    };
    chrome.tabs.sendMessage(tab.id, { action: 'updateSettings', settings });
  }

  function saveShowIntro() {
    if (!state.showId) return;
    const raw = els.showIntroSeconds.value;
    const value = raw === '' ? null : (parseInt(raw, 10) || null);
    chrome.tabs.sendMessage(tab.id, {
      action: 'setPerShowSetting',
      key: 'introSkipSeconds',
      value
    }, (res) => {
      if (res?.success) {
        state.showSettings = res.showSettings || {};
      }
    });
  }

  function trigger(action, btn, text) {
    chrome.tabs.sendMessage(tab.id, { action }, (res) => {
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
    const labelEl = btn.querySelector?.('.btn-label');
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
      btn.style.borderColor = 'rgba(22, 163, 74, 0.55)';
      btn.style.background = 'rgba(22, 163, 74, 0.22)';
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
    [els.skipIntroNowBtn, els.fullscreenBtn, els.skipOutroNowBtn].forEach(btn => {
      const action = btn.id === 'skipIntroNowBtn' ? 'skipIntroNow' : btn.id === 'fullscreenBtn' ? 'triggerFullscreen' : 'skipNow';
      const text = btn.id === 'fullscreenBtn' ? 'Activated!' : 'Skipped!';
      btn.addEventListener('click', () => trigger(action, btn, text));
    });

    els.setNowBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'setOutroNow' }, (res) => {
        if (res?.success) {
          els.outroTime.value = `${Math.floor(res.outroStart/60)}:${(res.outroStart%60).toString().padStart(2,'0')}`;
          save();
          flashBtn(els.setNowBtn, 'Set!');
        }
      });
    });

    els.autoDetectBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'getSettings' }, (res) => {
        if (res?.duration > 0) {
          const time = Math.max(res.duration * 0.95, res.duration - 60);
          els.outroTime.value = `${Math.floor(time/60)}:${(time%60).toString().padStart(2,'0')}`;
          save();
          flashBtn(els.autoDetectBtn, 'Detected!');
        }
      });
    });

    els.speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        chrome.tabs.sendMessage(tab.id, { action: 'setSpeed', speed });
        els.speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    els.clearSegmentsBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'clearSegments' }, () => {
        els.segmentsList.innerHTML = '<div class="empty-state">Segments cleared</div>';
        loadStats();
      });
    });

    const debouncedSave = debounce(save, 300);
    [els.introSeconds, els.fullscreenSeconds, els.outroTime, els.bedtimeTime, els.bedtimeUrl].forEach(el => el.addEventListener('input', debouncedSave));
    [els.skipIntro, els.autoFullscreen, els.autoSkip, els.autoCloseEnabled, els.continueWatchingEnabled, els.showNotifications, els.fastStartup, els.autoDetectOutro, els.autoLearnIntro, els.bedtimeEnabled, els.audioEnhancements, els.compressor].forEach(el => el.addEventListener('change', save));

    // Audio: live-update labels and save on input (faster than debounce for sliders).
    const liveSave = debounce(save, 80);
    els.volumeBoost.addEventListener('input', () => {
      els.volumeBoostValue.textContent = els.volumeBoost.value + '%';
      liveSave();
    });
    els.balance.addEventListener('input', () => {
      const v = parseInt(els.balance.value, 10);
      els.balanceValue.textContent = v === 0 ? 'center' : (v < 0 ? `L ${-v}` : `R ${v}`);
      liveSave();
    });
    els.eqBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        els.eqBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        save();
      });
    });

    const debouncedShowIntroSave = debounce(saveShowIntro, 300);
    els.showIntroSeconds.addEventListener('input', debouncedShowIntroSave);
    els.clearShowIntroBtn.addEventListener('click', () => {
      els.showIntroSeconds.value = '';
      saveShowIntro();
      flashBtn(els.clearShowIntroBtn, 'Reset!');
    });

    els.exportBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'exportSettings' }, (res) => {
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
            chrome.tabs.sendMessage(tab.id, { action: 'importSettings', data }, (res) => {
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
        chrome.tabs.sendMessage(tab.id, { action: 'reset' }, () => location.reload());
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
