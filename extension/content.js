// FakeNewsDecter Content Script

// Inject styling for highlights and badges directly into the page
const style = document.createElement('style');
style.textContent = `
  /* Highlighting styles */
  .vg-flagged-fake-border {
    position: relative;
    outline: 2px solid rgba(239, 68, 68, 0.7) !important;
    outline-offset: -2px;
    background-color: rgba(239, 68, 68, 0.05) !important;
    transition: all 0.3s ease;
  }
  
  .vg-flagged-deepfake-border {
    position: relative;
    outline: 2px solid rgba(139, 92, 246, 0.7) !important;
    outline-offset: -2px;
    background-color: rgba(139, 92, 246, 0.05) !important;
    transition: all 0.3s ease;
  }

  /* Badge styling */
  .vg-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin: 6px 0;
    max-width: fit-content;
    animation: vgFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    position: relative;
  }
  
  /* Browser Top-Right Floating Badge */
  .vg-floating-badge {
    position: fixed;
    top: 16px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    font-weight: 700;
    z-index: 2147483647; /* Maximum possible z-index to stay on top */
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: vgSlideInRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  
  .vg-badge-fake, .vg-floating-badge-fake {
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
    color: #ffffff;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  
  .vg-badge-deepfake, .vg-floating-badge-deepfake {
    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    color: #ffffff;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }
  
  .vg-badge-icon {
    font-size: 12px;
  }

  .vg-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #f3f4f6;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    width: 220px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.25);
    border: 1px solid #374151;
    pointer-events: none;
    font-weight: 400;
    z-index: 100000;
    line-height: 1.4;
    text-align: left;
  }

  .vg-badge:hover .vg-tooltip, .vg-floating-badge:hover .vg-tooltip {
    display: block;
  }

  @keyframes vgFadeIn {
    from { opacity: 0; transform: scale(0.9) translateY(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes vgSlideInRight {
    from { opacity: 0; transform: translateX(60px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;
document.documentElement.appendChild(style);

// Check configuration settings from storage
let settings = {
  realTimeScan: true,
  highlightBorder: true,
  insertBadge: true
};

function loadSettings() {
  chrome.storage.local.get('settings', (result) => {
    if (result.settings) {
      settings = result.settings;
    }
  });
}

// Initial settings load and listen to changes
loadSettings();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = changes.settings.newValue;
    // Re-trigger scan if enabled, or remove classes if disabled
    if (!settings.realTimeScan) {
      document.querySelectorAll('.vg-flagged-fake-border').forEach(el => el.classList.remove('vg-flagged-fake-border'));
      document.querySelectorAll('.vg-flagged-deepfake-border').forEach(el => el.classList.remove('vg-flagged-deepfake-border'));
      document.querySelectorAll('.vg-badge, .vg-floating-badge').forEach(el => el.remove());
      // Clear scanned markers so they can be rescanned if re-enabled
      document.querySelectorAll('[data-vg-status]').forEach(el => {
        el.removeAttribute('data-vg-status');
        el.removeAttribute('data-vg-content-key');
      });
    } else {
      triggerScan();
    }
  }
});

// Platform Detection and Selector Mapping
function getPlatform() {
  const host = window.location.hostname;
  const href = window.location.href;
  
  if (href.includes('mock-sites.html') || href.includes('mock-sites')) return 'simulator';
  if (host.includes('naver.com')) return 'naver';
  if (host.includes('youtube.com')) return 'youtube';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('dcinside.com')) return 'dcinside';
  return 'generic';
}

// Scrape and analyze a DOM element
async function analyzeElement(element, platformInfo, extractedData) {
  if (!settings.realTimeScan) return;
  
  const { text, imageUrls, videoUrls, badgeInsertSelector, isMain } = extractedData;
  
  if (!text && imageUrls.length === 0 && videoUrls.length === 0) {
    element.setAttribute('data-vg-status', 'empty');
    return;
  }

  // Create a unique key of the current content to handle element reuse (SPA recycling)
  const contentKey = JSON.stringify({ text: text.substring(0, 100), imageUrls, videoUrls });
  
  if (element.getAttribute('data-vg-content-key') === contentKey) {
    return; // Already analyzed this exact content, skip
  }
  
  // Clean up any old badges or highlight classes from previous content on this element
  element.classList.remove('vg-flagged-fake-border');
  element.classList.remove('vg-flagged-deepfake-border');
  const oldBadge = element.querySelector('.vg-badge');
  if (oldBadge) oldBadge.remove();
  
  element.setAttribute('data-vg-status', 'scanning');
  element.setAttribute('data-vg-content-key', contentKey);

  // Request background analysis
  chrome.runtime.sendMessage({
    action: 'analyze',
    text: text || '',
    imageUrls: imageUrls,
    videoUrls: videoUrls,
    title: text ? text.substring(0, 60).trim() : '미디어 콘텐츠',
    platform: platformInfo.name,
    isMain: isMain || false
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("FakeNewsDecter analysis service unreachable:", chrome.runtime.lastError.message);
      element.removeAttribute('data-vg-status');
      element.removeAttribute('data-vg-content-key');
      return;
    }
    
    if (response && response.success) {
      element.setAttribute('data-vg-status', 'scanned');
      applyAnalysisResult(element, response.result, badgeInsertSelector);
    } else {
      element.removeAttribute('data-vg-status');
      element.removeAttribute('data-vg-content-key');
    }
  });
}

// Apply visual feedback: Borders & Badges
function applyAnalysisResult(element, result, badgeInsertSelector) {
  const { factCheck, deepfake } = result;
  
  const isFake = factCheck && factCheck.isFake;
  const isDeepfake = deepfake && deepfake.isDeepfake;

  if (!isFake && !isDeepfake) return;

  const isBody = element.tagName.toLowerCase() === 'body';

  // 1. Highlight border if enabled (skip on body to prevent layout breaking)
  if (settings.highlightBorder && !isBody) {
    if (isFake) {
      element.classList.add('vg-flagged-fake-border');
    } else if (isDeepfake) {
      element.classList.add('vg-flagged-deepfake-border');
    }
  }

  // 2. Insert badge if enabled
  if (settings.insertBadge) {
    // Generate counter-evidence HTML if present
    let counterEvidenceHtml = '';
    if (isFake && factCheck.counterEvidence && factCheck.counterEvidence.length > 0) {
      counterEvidenceHtml = `
        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.25); font-size: 10px; line-height: 1.4;">
          <strong style="color: #34d399; display: block; margin-bottom: 3px;">대비 의견 / 신뢰 정보:</strong>
          ${factCheck.counterEvidence.map(ce => `
            <div style="margin-bottom: 4px;">
              <span style="color: #10b981; font-weight: 700; background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.3); padding: 1px 3px; border-radius: 3px; font-size: 9px; margin-right: 3px; display: inline-block;">${escapeHTML(ce.source)}</span>
              <span>${escapeHTML(ce.content)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (isBody) {
      // Floating badge in top right of browser window
      if (document.querySelector('.vg-floating-badge')) return; // Already exists

      const floatingBadge = document.createElement('div');
      floatingBadge.className = `vg-floating-badge ${isFake ? 'vg-floating-badge-fake' : 'vg-floating-badge-deepfake'}`;
      
      const icon = isFake ? '⚠️' : '🛡️';
      const label = isFake 
        ? `가짜뉴스 위험도 ${factCheck.score}%` 
        : `딥페이크 감지 ${deepfake.score}%`;
      const reason = isFake ? factCheck.reason : deepfake.reason;

      floatingBadge.innerHTML = `
        <span class="vg-badge-icon">${icon}</span>
        <span>${label}</span>
        <div class="vg-tooltip" style="right: 0; left: auto; transform: none; bottom: auto; top: calc(100% + 8px); width: 280px;">
          <strong>페이지 판별 사유:</strong><br>${reason}
          ${counterEvidenceHtml}
        </div>
      `;

      document.body.appendChild(floatingBadge);
    } else {
      // Inline badge next to content
      if (element.querySelector('.vg-badge')) return;

      let targetInsertContainer = element;
      if (badgeInsertSelector) {
        const selected = element.querySelector(badgeInsertSelector);
        if (selected) targetInsertContainer = selected;
      }

      const badge = document.createElement('div');
      badge.className = `vg-badge ${isFake ? 'vg-badge-fake' : 'vg-badge-deepfake'}`;
      
      const icon = isFake ? '⚠️' : '🛡️';
      const label = isFake 
        ? `가짜뉴스 위험도 ${factCheck.score}%` 
        : `딥페이크 감지 ${deepfake.score}%`;
      const reason = isFake ? factCheck.reason : deepfake.reason;

      badge.innerHTML = `
        <span class="vg-badge-icon">${icon}</span>
        <span>${label}</span>
        <div class="vg-tooltip" style="width: 260px;">
          <strong>위험 감지 사유:</strong><br>${reason}
          ${counterEvidenceHtml}
        </div>
      `;

      if (targetInsertContainer.firstChild) {
        targetInsertContainer.insertBefore(badge, targetInsertContainer.firstChild);
      } else {
        targetInsertContainer.appendChild(badge);
      }
    }
  }
}

// Simple HTML escaping helper for safety
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Define selectors and scraper functions for each platform
const PLATFORM_CONFIGS = {
  simulator: {
    name: 'Simulator',
    selector: '.sim-feed-item',
    extract: (el) => {
      const titleEl = el.querySelector('.sim-title');
      const textEl = el.querySelector('.sim-text');
      const text = `${titleEl ? titleEl.innerText : ''} ${textEl ? textEl.innerText : ''}`.trim();
      
      const images = Array.from(el.querySelectorAll('.sim-image, img')).map(img => img.src).filter(Boolean);
      const videos = Array.from(el.querySelectorAll('.sim-video, video')).map(vid => vid.src || vid.querySelector('source')?.src).filter(Boolean);
      
      const isMain = el.parentElement.firstElementChild === el;

      return {
        text,
        imageUrls: images,
        videoUrls: videos,
        badgeInsertSelector: '.sim-badge-container',
        isMain
      };
    }
  },
  
  naver: {
    name: 'Naver News',
    // Matches article details and articles in standard list pages
    selector: '#dic_area, #articleBodyContents, .sa_text, .news_tit',
    extract: (el) => {
      let text = el.innerText || '';
      let images = [];
      const isMain = el.id === 'dic_area' || el.id === 'articleBodyContents';
      
      if (isMain) {
        images = Array.from(el.querySelectorAll('img')).map(img => img.src || img.getAttribute('data-src')).filter(Boolean);
      } else {
        const link = el.tagName === 'A' ? el : el.querySelector('a');
        text = el.innerText || '';
        const parent = el.closest('li') || el.parentElement;
        if (parent) {
          images = Array.from(parent.querySelectorAll('img')).map(img => img.src).filter(Boolean);
        }
      }
      
      return {
        text,
        imageUrls: images,
        videoUrls: [],
        badgeInsertSelector: null,
        isMain
      };
    }
  },
  
  youtube: {
    name: 'YouTube',
    selector: 'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, #watch-header, #title.ytd-watch-metadata',
    extract: (el) => {
      const titleEl = el.querySelector('#video-title, #video-title-link, h1.ytd-watch-metadata');
      const text = titleEl ? titleEl.innerText.trim() : el.innerText.trim().split('\n')[0];
      
      const images = [];
      const imgEl = el.querySelector('yt-image img, #thumbnail img');
      if (imgEl && imgEl.src) {
        images.push(imgEl.src);
      }
      
      const videos = [];
      const linkEl = el.querySelector('a#thumbnail, a#video-title-link');
      if (linkEl && linkEl.href) {
        videos.push(linkEl.href);
      }

      const isMain = el.id === 'watch-header' || el.matches('#title.ytd-watch-metadata') || el.closest('#title.ytd-watch-metadata') !== null;
      
      return {
        text,
        imageUrls: images,
        videoUrls: videos,
        badgeInsertSelector: '#metadata-line, #title.ytd-watch-metadata',
        isMain
      };
    }
  },
  
  x: {
    name: 'X (Twitter)',
    selector: 'article[data-testid="tweet"]',
    extract: (el) => {
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const text = textEl ? textEl.innerText : '';
      
      const images = Array.from(el.querySelectorAll('[data-testid="tweetPhoto"] img')).map(img => img.src).filter(Boolean);
      const videos = Array.from(el.querySelectorAll('video')).map(v => v.src || v.querySelector('source')?.src).filter(Boolean);
      
      const isMain = window.location.pathname.includes('/status/') && el.parentElement?.firstElementChild === el;

      return {
        text,
        imageUrls: images,
        videoUrls: videos,
        badgeInsertSelector: '[data-testid="User-Name"]',
        isMain
      };
    }
  },
  
  facebook: {
    name: 'Facebook',
    selector: 'div[role="feed"] > div, div[role="article"], .fb-post-item',
    extract: (el) => {
      const textEl = el.querySelector('div[dir="auto"], [data-ad-preview="message"]');
      const text = textEl ? textEl.innerText : el.innerText.split('\n').slice(0, 3).join(' ');
      
      const images = Array.from(el.querySelectorAll('img')).map(img => img.src).filter(src => {
        return src && !src.includes('/emoji.php/') && !src.includes('/rsrc.php/');
      });
      
      const videos = Array.from(el.querySelectorAll('video')).map(v => v.src).filter(Boolean);
      
      const isMain = el.parentElement?.firstElementChild === el;

      return {
        text,
        imageUrls: images,
        videoUrls: videos,
        badgeInsertSelector: 'span[font-weight="bold"]',
        isMain
      };
    }
  },
  
  dcinside: {
    name: 'DC Inside',
    selector: '.view_content_wrap',
    extract: (el) => {
      const titleEl = document.querySelector('.title_subject');
      const bodyEl = el.querySelector('.write_div');
      const text = `${titleEl ? titleEl.innerText : ''} ${bodyEl ? bodyEl.innerText : ''}`.trim();
      
      const images = Array.from(bodyEl ? bodyEl.querySelectorAll('img') : el.querySelectorAll('img'))
        .map(img => img.src)
        .filter(Boolean);
        
      return {
        text: text.substring(0, 500),
        imageUrls: images,
        videoUrls: [],
        badgeInsertSelector: '.title_subject',
        isMain: true
      };
    }
  },
  
  generic: {
    name: 'Web Article',
    // Matches article layouts, and falls back to body for page-level scanning
    selector: 'article, .post, .article, body',
    extract: (el) => {
      const isBody = el.tagName.toLowerCase() === 'body';
      const hasArticleElement = document.querySelector('article, .post, .article') !== null;
      const isMain = isBody ? !hasArticleElement : el.matches('article');

      if (isBody) {
        // Page-level scanning
        const title = document.title || '';
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .filter(h => !h.closest('header, footer, nav, aside, .sidebar, .recommend, .related, .footer, .header, .reply, .comment'))
          .map(h => h.innerText)
          .join(' ');
        const text = `${title} ${headings}`.substring(0, 300).trim();
        
        // Grab first 3 images
        const images = Array.from(document.querySelectorAll('img'))
          .filter(img => !img.closest('header, footer, nav, aside, .sidebar, .recommend, .related, .footer, .header'))
          .map(img => img.src)
          .filter(src => src && !src.includes('avatar') && !src.includes('logo') && !src.includes('icon'))
          .slice(0, 3);
          
        return {
          text,
          imageUrls: images,
          videoUrls: [],
          badgeInsertSelector: null,
          isMain
        };
      } else {
        // Article container scanning
        const isRecommend = el.closest('aside, .sidebar, .recommend, .related, .reply, .comment') !== null;
        const finalIsMain = isMain && !isRecommend;

        const titleEl = el.querySelector('h1, h2, .entry-title, .title');
        const text = titleEl ? titleEl.innerText : el.innerText.substring(0, 150);
        const images = Array.from(el.querySelectorAll('img')).map(img => img.src).filter(Boolean).slice(0, 2);
        return {
          text,
          imageUrls: images,
          videoUrls: [],
          badgeInsertSelector: null,
          isMain: finalIsMain
        };
      }
    }
  }
};

// Periodic Scanning / Debouncing logic
let scanTimeout = null;
function triggerScan() {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => {
    const platform = getPlatform();
    const config = PLATFORM_CONFIGS[platform];
    if (!config) return;
    
    const elements = document.querySelectorAll(config.selector);
    elements.forEach(el => {
      // Skip hidden/invisible elements to prevent responsive duplication scans
      const isHidden = el.offsetWidth === 0 && el.offsetHeight === 0;
      if (isHidden) return;

      const extracted = config.extract(el);
      if (extracted && extracted.isMain) {
        analyzeElement(el, config, extracted);
      }
    });
  }, 250); // 250ms debounce
}

// Monitor URL changes (SPA support like clicking different videos on YouTube)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log("[FakeNewsDecter] SPA URL change detected, resetting scan states...");
    
    // Clear old visual feedback
    document.querySelectorAll('.vg-flagged-fake-border').forEach(el => el.classList.remove('vg-flagged-fake-border'));
    document.querySelectorAll('.vg-flagged-deepfake-border').forEach(el => el.classList.remove('vg-flagged-deepfake-border'));
    document.querySelectorAll('.vg-badge, .vg-floating-badge').forEach(el => el.remove());
    
    // Reset scanning attributes
    document.querySelectorAll('[data-vg-status]').forEach(el => {
      el.removeAttribute('data-vg-status');
      el.removeAttribute('data-vg-content-key');
    });
    
    triggerScan();
  }
}, 800);

// Observe DOM changes for dynamic SPAs (YouTube, X, Facebook, and simulation workbench)
const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (let mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) {
    triggerScan();
  }
});

// Start checking the page
function init() {
  triggerScan();
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Delay startup slightly to let initial DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
