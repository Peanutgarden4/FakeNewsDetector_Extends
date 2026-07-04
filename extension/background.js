// FakeNewsDecter Background Service Worker

const BACKEND_URL = 'http://localhost:3000/api/analyze';

// Default settings and statistics
const DEFAULT_SETTINGS = {
  realTimeScan: true,
  highlightBorder: true,
  insertBadge: true
};

const DEFAULT_STATS = {
  scanned: 0,
  fakeNewsCount: 0,
  deepfakeCount: 0
};

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings', 'stats', 'logs'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    if (!result.stats) {
      chrome.storage.local.set({ stats: DEFAULT_STATS });
    }
    if (!result.logs) {
      chrome.storage.local.set({ logs: [] });
    }
  });
});

// Listener for messages from Content Script and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyze') {
    handleAnalysis(request, sender)
      .then(response => sendResponse(response))
      .catch(error => {
        console.error("Analysis Error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for asynchronous sendResponse
  }
  
  if (request.action === 'updateStats') {
    updateStatsInStorage(request.type);
    sendResponse({ success: true });
    return true;
  }
});

// Simple in-memory cache to prevent duplicate rapid scans of the same content
const scanCache = new Map(); // key: url + "_" + title.substring(0, 30), value: { result, timestamp }

// Main analysis logic
async function handleAnalysis(request, sender) {
  const { text, imageUrls, videoUrls, title, platform, isMain } = request;
  
  // Check if real-time scanning is enabled
  const store = await chrome.storage.local.get('settings');
  const settings = store.settings || DEFAULT_SETTINGS;
  if (!settings.realTimeScan) {
    return { success: false, disabled: true };
  }

  const pageUrl = sender.tab ? sender.tab.url : 'Simulator';
  const cacheKey = `${pageUrl}_${(title || '').substring(0, 30)}`;
  const NOW = Date.now();

  // 1. Check in-memory cache
  const cached = scanCache.get(cacheKey);
  if (cached && (NOW - cached.timestamp < 15000)) { // 15 seconds TTL
    console.log(`[Cache Hit] Returning cached analysis for: ${cacheKey}`);
    return { success: true, result: cached.result };
  }

  // Increment scanned count
  await incrementStat('scanned');

  let result = null;
  try {
    // Attempt to contact mock API server
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, imageUrls, videoUrls })
    });
    
    if (response.ok) {
      result = await response.json();
      result.source = 'server';
    } else {
      throw new Error(`Server returned status: ${response.status}`);
    }
  } catch (err) {
    console.warn("API Server connection failed, falling back to local heuristic analysis:", err.message);
    result = performLocalAnalysis(text, imageUrls, videoUrls);
    result.source = 'local';
  }

  // If flagged as fake news or deepfake, update stats and log it
  let flagged = false;
  let logType = null;
  let maxScore = 0;
  let reason = '';

  if (result.factCheck && result.factCheck.isFake) {
    flagged = true;
    logType = 'fake';
    maxScore = result.factCheck.score;
    reason = result.factCheck.reason;
    await incrementStat('fakeNewsCount');
  }

  if (result.deepfake && result.deepfake.isDeepfake) {
    flagged = true;
    // If both are flagged, label as "both" or deepfake depending on higher score
    if (!logType || result.deepfake.score > maxScore) {
      logType = 'deepfake';
      maxScore = result.deepfake.score;
      reason = result.deepfake.reason;
    }
    await incrementStat('deepfakeCount');
  }

  // Cache the successful result
  scanCache.set(cacheKey, { result, timestamp: NOW });

  if (flagged) {
    // Check if we already logged this exact URL and reason recently to prevent duplicate log pollution
    const logsStore = await chrome.storage.local.get('logs');
    const currentLogs = logsStore.logs || [];
    const isDuplicateLog = currentLogs.some(log => 
      log.url === pageUrl && 
      log.title === (title || text.substring(0, 50) + '...') && 
      log.reason === reason && 
      (NOW - log.timestamp < 20000) // logged within last 20 seconds
    );

    if (!isDuplicateLog) {
      await addLogEntry({
        url: pageUrl,
        title: title || text.substring(0, 50) + '...',
        platform: platform || getPlatformName(pageUrl),
        type: logType,
        score: maxScore,
        reason: reason,
        isMain: isMain || false,
        counterEvidence: result.factCheck ? (result.factCheck.counterEvidence || []) : [],
        timestamp: NOW
      });
    } else {
      console.log(`[Deduplication] Blocked duplicate log entry for: ${pageUrl}`);
    }
  }

  return { success: true, result };
}

// Fallback logic when Server is down
function performLocalAnalysis(text, imageUrls = [], videoUrls = []) {
  const normalizedText = (text || '').toLowerCase();
  
  // Fake news keywords
  const fakeKeywords = [
    '외계인', 'ufo', '충격', '단독', '비밀공작', '음모론', '지구평평', '일루미나티', 
    '정부 음모', '비공개 합의', '숨겨진 진실', '백신 칩', '비밀 회동', '인간 복제',
    'aliens', 'conspiracy', 'shocking', 'breaking news exclusive', '매수', '중국',
    '탄압', '배후', '선동', '조작', '매국'
  ];
  
  // Deepfake keywords & indicator patterns (e.g. specific images / file names / video indicators)
  const deepfakeKeywords = ['딥페이크', 'deepfake', '합성', '얼굴 교체', 'ai 생성', '얼굴 합성', '가상 얼굴'];
  
  let fakeScore = 0;
  let fakeReason = '';
  let matchedFakeWords = [];
  
  fakeKeywords.forEach(kw => {
    if (normalizedText.includes(kw)) {
      matchedFakeWords.push(kw);
    }
  });

  if (matchedFakeWords.length > 0) {
    fakeScore = Math.min(40 + matchedFakeWords.length * 20, 98);
    fakeReason = `자극적/음모론적 키워드 감지: "${matchedFakeWords.slice(0, 3).join(', ')}" (로컬 Heuristic 분석)`;
  }

  // Check URL paths for simulated fake indicators
  const checkUrlForSimulatedDeepfake = (urls) => {
    for (let url of urls) {
      if (typeof url === 'string') {
        const u = url.toLowerCase();
        if (u.includes('deepfake') || u.includes('face_swap') || u.includes('synthetic') || u.includes('fake_face') || u.includes('fake_video')) {
          return { score: 95, reason: `딥페이크 시뮬레이터 패턴 감지: ${url.split('/').pop()}` };
        }
      }
    }
    return null;
  };

  let deepfakeResult = checkUrlForSimulatedDeepfake([...imageUrls, ...videoUrls]);
  let deepfakeScore = 0;
  let deepfakeReason = '';
  let matchedDeepfakeWords = [];

  deepfakeKeywords.forEach(kw => {
    if (normalizedText.includes(kw)) {
      matchedDeepfakeWords.push(kw);
    }
  });

  if (deepfakeResult) {
    deepfakeScore = deepfakeResult.score;
    deepfakeReason = deepfakeResult.reason;
  } else if (matchedDeepfakeWords.length > 0) {
    deepfakeScore = Math.min(50 + matchedDeepfakeWords.length * 20, 95);
    deepfakeReason = `딥페이크/합성 의심 키워드 감지: "${matchedDeepfakeWords.slice(0, 2).join(', ')}"`;
  }

  return {
    factCheck: {
      isFake: fakeScore >= 60,
      score: fakeScore,
      reason: fakeReason || '정상 콘텐츠로 보입니다.'
    },
    deepfake: {
      isDeepfake: deepfakeScore >= 60,
      score: deepfakeScore,
      reason: deepfakeReason || '정상 미디어로 보입니다.'
    }
  };
}

// Stats updates
async function incrementStat(key) {
  const store = await chrome.storage.local.get('stats');
  const stats = store.stats || { ...DEFAULT_STATS };
  stats[key] = (stats[key] || 0) + 1;
  await chrome.storage.local.set({ stats });
  // Notify popup to refresh stats if it's open
  chrome.runtime.sendMessage({ action: 'statsUpdated', stats }).catch(() => {});
}

async function addLogEntry(entry) {
  const store = await chrome.storage.local.get('logs');
  const logs = store.logs || [];
  // Keep last 50 logs
  logs.unshift(entry);
  if (logs.length > 50) {
    logs.pop();
  }
  await chrome.storage.local.set({ logs });
  // Notify popup to refresh logs
  chrome.runtime.sendMessage({ action: 'logsUpdated', logs }).catch(() => {});
}

function getPlatformName(url) {
  if (url.includes('naver.com')) return 'Naver News';
  if (url.includes('youtube.com')) return 'YouTube';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
  if (url.includes('facebook.com')) return 'Facebook';
  if (url.includes('mock-sites.html')) return 'Simulator';
  return 'Web Search';
}
