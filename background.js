chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target !== 'streamshade-background') {
    return false;
  }

  if (request.action === 'forwardToVideoFrame') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ error: 'No active tab' });
        return;
      }

      chrome.webNavigation.getAllFrames({ tabId: tab.id }, (frames) => {
        if (!frames || frames.length === 0) {
          sendResponse({ error: 'No frames found' });
          return;
        }

        const message = { ...request.payload, fromBackground: true };
        const responses = [];
        let pending = frames.length;

        const isVideoQuery = ['getSettings', 'getStats', 'getVideoState'].includes(message.action);
        const isVideoAction = ['skipIntroNow', 'triggerFullscreen', 'skipNow', 'nextEpisode', 'previousEpisode', 'setOutroNow', 'setSpeed', 'addSegment', 'clearSegments', 'setPerShowSetting', 'updateSettings'].includes(message.action);

        frames.forEach((frame) => {
          chrome.tabs.sendMessage(tab.id, message, { frameId: frame.frameId }, (res) => {
            if (chrome.runtime.lastError) {
              // Frame didn't respond or isn't running our script; ignore.
            } else if (res) {
              responses.push(res);
            }
            pending--;
            if (pending === 0) {
              let best = null;
              if (isVideoQuery) {
                best = responses.find((r) => r.duration > 0 && r.showId) ||
                  responses.find((r) => r.duration > 0) ||
                  responses[0];
              } else if (isVideoAction) {
                best = responses.find((r) => r.success === true) ||
                  responses.find((r) => r.error) ||
                  responses[0];
              } else {
                best = responses.find((r) => r.success === true) || responses[0];
              }
              sendResponse(best || { error: 'No video detected' });
            }
          });
        });
      });
    });

    return true;
  }

  return false;
});
