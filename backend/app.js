/**
 * 한줄 댓글 피드 - Frontend Logic & Supabase Integration (Direct Connection)
 */

// Supabase Configuration
// 연동할 Supabase Project URL과 Anon Key를 아래에 기재해 주세요.
// Vite 환경변수(.env) 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY로 기재하셔도 작동합니다.
const SUPABASE_CONFIG = {
  url: import.meta.env?.VITE_SUPABASE_URL || '실제_SUPABASE_URL_입력',
  anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || '실제_SUPABASE_ANON_KEY_입력'
};

let supabase = null;
let isSupabaseConnected = false;

document.addEventListener('DOMContentLoaded', async () => {
  // --- State ---
  let comments = [];
  let likedIds = JSON.parse(localStorage.getItem('comment_liked_ids')) || [];

  // --- DOM Elements ---
  const themeToggle = document.getElementById('theme-toggle');
  const commentCountEl = document.getElementById('comment-count');
  const commentForm = document.getElementById('comment-form');
  const authorInput = document.getElementById('comment-author');
  const contentInput = document.getElementById('comment-content');
  const charCountEl = document.getElementById('char-count');
  const commentList = document.getElementById('comment-list');
  const emptyState = document.getElementById('empty-state');

  // --- Initializer ---
  async function init() {
    loadTheme();
    
    // Connect Supabase directly
    initSupabase();

    if (isSupabaseConnected) {
      await loadSupabaseData();
      subscribeToComments();
    } else {
      console.warn("Supabase credentials not configured. Running in simulation mode (offline).");
      loadOfflineData();
    }

    renderComments();
    setupEventListeners();
  }

  // --- Supabase Connection ---
  function initSupabase() {
    const url = SUPABASE_CONFIG.url;
    const key = SUPABASE_CONFIG.anonKey;

    if (url && key && url !== '실제_SUPABASE_URL_입력' && key !== '실제_SUPABASE_ANON_KEY_입력') {
      try {
        if (window.supabase) {
          supabase = window.supabase.createClient(url, key);
          isSupabaseConnected = true;
          console.log("Successfully connected to Supabase.");
        } else {
          console.error("Supabase library not loaded from CDN.");
        }
      } catch (e) {
        console.error("Failed to connect to Supabase:", e);
      }
    }
  }

  async function loadSupabaseData() {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*');

      if (error) throw error;

      if (data) {
        const topLevelComments = [];
        const repliesMap = {};

        data.forEach(item => {
          if (item.parent_id) {
            if (!repliesMap[item.parent_id]) repliesMap[item.parent_id] = [];
            repliesMap[item.parent_id].push({
              id: item.id,
              author: item.author,
              content: item.content,
              timestamp: Number(item.timestamp)
            });
          } else {
            topLevelComments.push({
              id: item.id,
              author: item.author,
              content: item.content,
              timestamp: Number(item.timestamp),
              likes: item.likes || 0,
              replies: []
            });
          }
        });

        // Sort replies ascending (oldest first)
        Object.keys(repliesMap).forEach(parentId => {
          repliesMap[parentId].sort((a, b) => a.timestamp - b.timestamp);
        });

        // Match back to parents
        topLevelComments.forEach(c => {
          c.replies = repliesMap[c.id] || [];
        });

        // Sort top-level comments descending (newest first)
        topLevelComments.sort((a, b) => b.timestamp - a.timestamp);

        comments = topLevelComments;
      }
    } catch (err) {
      console.error("Error loading comments from Supabase:", err);
      showToast("데이터를 불러오지 못했습니다. SQL Editor에서 테이블 생성을 완료해 주세요.");
      isSupabaseConnected = false;
      loadOfflineData();
    }
  }

  function subscribeToComments() {
    if (!isSupabaseConnected) return;

    supabase
      .channel('public:comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, async (payload) => {
        console.log('Database change detected:', payload);
        await loadSupabaseData();
        renderComments();
      })
      .subscribe();
  }

  function loadOfflineData() {
    const offlineComments = localStorage.getItem('offline_comments');
    if (offlineComments) {
      comments = JSON.parse(offlineComments);
    } else {
      comments = [];
    }
  }

  // --- Theme Management ---
  function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // --- Theme Management ---
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  // --- Helper Functions ---
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAvatarLetter(name) {
    if (!name) return '익';
    return name.trim().charAt(0);
  }

  function timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (diff < 10000) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 30) return `${days}일 전`;
    
    const date = new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  }

  // --- Render logic ---
  function updateCount() {
    let totalCount = comments.length;
    comments.forEach(comment => {
      if (comment.replies) {
        totalCount += comment.replies.length;
      }
    });
    commentCountEl.textContent = totalCount;
  }

  function renderComments() {
    const existingCards = commentList.querySelectorAll('.comment-card');
    existingCards.forEach(card => card.remove());

    updateCount();

    if (comments.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    comments.forEach(comment => {
      const card = createCommentCardElement(comment);
      commentList.appendChild(card);
    });
  }

  function createCommentCardElement(comment) {
    const card = document.createElement('div');
    card.className = 'comment-card';
    card.dataset.id = comment.id;

    const isLiked = likedIds.includes(comment.id);
    const likedClass = isLiked ? 'liked' : '';
    const avatarLetter = escapeHTML(getAvatarLetter(comment.author));

    card.innerHTML = `
      <div class="comment-header">
        <div class="comment-meta">
          <div class="comment-avatar">${avatarLetter}</div>
          <div class="comment-info">
            <span class="comment-author-name">${escapeHTML(comment.author)}</span>
            <span class="comment-time" data-timestamp="${comment.timestamp}">${timeAgo(comment.timestamp)}</span>
          </div>
        </div>
      </div>
      <div class="comment-body">${escapeHTML(comment.content)}</div>
      <div class="comment-footer">
        <div class="footer-left">
          <button class="like-btn ${likedClass}" data-action="like" data-id="${comment.id}">
            <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            <span class="like-count">${comment.likes || 0}</span>
          </button>
          <button class="reply-toggle-btn" data-action="toggle-reply-box" data-id="${comment.id}">
            <i class="fa-regular fa-comment"></i> 답글
          </button>
        </div>
      </div>
      <!-- Replies Section Container -->
      <div class="replies-container" id="replies-container-${comment.id}"></div>
    `;

    const repliesContainer = card.querySelector(`#replies-container-${comment.id}`);
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach(reply => {
        const replyEl = createReplyCardElement(reply, comment.id);
        repliesContainer.appendChild(replyEl);
      });
    }

    return card;
  }

  function createReplyCardElement(reply, parentId) {
    const replyCard = document.createElement('div');
    replyCard.className = 'reply-card';
    replyCard.dataset.id = reply.id;
    replyCard.dataset.parentId = parentId;

    const avatarLetter = escapeHTML(getAvatarLetter(reply.author));

    replyCard.innerHTML = `
      <div class="comment-header">
        <div class="comment-meta">
          <div class="comment-avatar" style="width: 28px; height: 28px; font-size: 0.8rem; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%)">${avatarLetter}</div>
          <div class="comment-info">
            <span class="comment-author-name" style="font-size: 0.85rem;">${escapeHTML(reply.author)}</span>
            <span class="comment-time" data-timestamp="${reply.timestamp}">${timeAgo(reply.timestamp)}</span>
          </div>
        </div>
      </div>
      <div class="comment-body" style="font-size: 0.88rem; color: var(--text-main);">${escapeHTML(reply.content)}</div>
    `;

    return replyCard;
  }

  // --- DOM Manipulation Actions ---
  async function handleCommentSubmit(e) {
    e.preventDefault();
    const author = authorInput.value.trim();
    const content = contentInput.value.trim();

    if (!author || !content) return;

    const newComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      author: author,
      content: content,
      timestamp: Date.now(),
      likes: 0,
      replies: []
    };

    if (isSupabaseConnected) {
      const submitBtn = commentForm.querySelector('.submit-btn');
      submitBtn.setAttribute('disabled', 'true');
      try {
        const { error } = await supabase.from('comments').insert([
          {
            id: newComment.id,
            author: newComment.author,
            content: newComment.content,
            timestamp: newComment.timestamp,
            likes: 0,
            parent_id: null
          }
        ]);
        if (error) throw error;
        showToast('댓글을 등록했습니다!');
        
        authorInput.value = '';
        contentInput.value = '';
        charCountEl.textContent = '0';
        
        await loadSupabaseData();
        renderComments();
      } catch (err) {
        console.error(err);
        showToast(`댓글 등록 실패: ${err.message}`);
      } finally {
        submitBtn.removeAttribute('disabled');
      }
    } else {
      // Offline Simulation Mode
      comments.unshift(newComment);
      localStorage.setItem('offline_comments', JSON.stringify(comments));
      renderComments();

      authorInput.value = '';
      contentInput.value = '';
      charCountEl.textContent = '0';
      showToast('댓글을 등록했습니다! (로컬 저장)');
    }
  }

  // --- Likes Flow ---
  async function handleLike(btn, id) {
    let comment = comments.find(c => c.id === id);
    if (!comment) return;

    const likeCountSpan = btn.querySelector('.like-count');
    const heartIcon = btn.querySelector('i');
    
    const index = likedIds.indexOf(id);
    let newLikes = comment.likes || 0;

    if (index === -1) {
      likedIds.push(id);
      newLikes += 1;
      btn.classList.add('liked');
      heartIcon.className = 'fa-solid fa-heart';
    } else {
      likedIds.splice(index, 1);
      newLikes = Math.max(0, newLikes - 1);
      btn.classList.remove('liked');
      heartIcon.className = 'fa-regular fa-heart';
    }
    
    comment.likes = newLikes;
    likeCountSpan.textContent = newLikes;
    localStorage.setItem('comment_liked_ids', JSON.stringify(likedIds));

    if (isSupabaseConnected) {
      try {
        const { error } = await supabase
          .from('comments')
          .update({ likes: newLikes })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error(err);
      }
    } else {
      localStorage.setItem('offline_comments', JSON.stringify(comments));
    }
  }

  // --- Replies Flow ---
  function handleToggleReplyBox(btn, commentId) {
    const container = document.getElementById(`replies-container-${commentId}`);
    if (!container) return;

    const existingForm = container.querySelector('.reply-write-box');
    if (existingForm) {
      existingForm.remove();
      return;
    }

    const replyForm = document.createElement('div');
    replyForm.className = 'reply-write-box';
    replyForm.innerHTML = `
      <div style="margin-bottom: 0.5rem;">
        <input type="text" class="reply-author-input" placeholder="답글 닉네임" required style="width: 100%;" maxlength="15">
      </div>
      <textarea class="reply-content-input" placeholder="답글 내용을 적어주세요..." required maxlength="300"></textarea>
      <div class="reply-write-actions">
        <button class="btn btn-secondary cancel-reply-btn">취소</button>
        <button class="btn btn-primary submit-reply-btn">답글 등록</button>
      </div>
    `;

    const cancelBtn = replyForm.querySelector('.cancel-reply-btn');
    const submitBtn = replyForm.querySelector('.submit-reply-btn');
    const rAuthor = replyForm.querySelector('.reply-author-input');
    const rContent = replyForm.querySelector('.reply-content-input');

    cancelBtn.addEventListener('click', () => replyForm.remove());
    submitBtn.addEventListener('click', () => {
      const author = rAuthor.value.trim();
      const content = rContent.value.trim();

      if (!author || !content) {
        alert('모든 항목을 입력해주세요.');
        return;
      }

      submitReply(commentId, author, content);
      replyForm.remove();
    });

    container.insertBefore(replyForm, container.firstChild);
    rAuthor.focus();
  }

  async function submitReply(parentId, author, content) {
    const parentComment = comments.find(c => c.id === parentId);
    if (!parentComment) return;

    const newReply = {
      id: 'r_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      author: author,
      content: content,
      timestamp: Date.now()
    };

    if (isSupabaseConnected) {
      try {
        const { error } = await supabase.from('comments').insert([
          {
            id: newReply.id,
            author: newReply.author,
            content: newReply.content,
            timestamp: newReply.timestamp,
            likes: 0,
            parent_id: parentId
          }
        ]);
        if (error) throw error;
        showToast('답글을 등록했습니다!');
        
        await loadSupabaseData();
        renderComments();
      } catch (err) {
        console.error(err);
        showToast(`답글 등록 실패: ${err.message}`);
      }
    } else {
      if (!parentComment.replies) parentComment.replies = [];
      parentComment.replies.push(newReply);
      localStorage.setItem('offline_comments', JSON.stringify(comments));
      renderComments();
      showToast('답글을 등록했습니다! (로컬 저장)');
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);

    commentForm.addEventListener('submit', handleCommentSubmit);

    contentInput.addEventListener('input', () => {
      charCountEl.textContent = contentInput.value.length;
    });

    commentList.addEventListener('click', (e) => {
      const target = e.target;

      const likeBtn = target.closest('.like-btn');
      if (likeBtn && likeBtn.dataset.action === 'like') {
        const id = likeBtn.dataset.id;
        handleLike(likeBtn, id);
        return;
      }

      const replyToggleBtn = target.closest('.reply-toggle-btn');
      if (replyToggleBtn && replyToggleBtn.dataset.action === 'toggle-reply-box') {
        const id = replyToggleBtn.dataset.id;
        handleToggleReplyBox(replyToggleBtn, id);
        return;
      }
    });

    setInterval(() => {
      const timeElements = document.querySelectorAll('.comment-time');
      timeElements.forEach(el => {
        const timestamp = parseInt(el.getAttribute('data-timestamp'));
        if (timestamp) {
          el.textContent = timeAgo(timestamp);
        }
      });
    }, 60000);
  }

  // Simple Toast Popup Helper
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: var(--bg-card);
      border: 1px solid var(--color-primary);
      color: var(--text-main);
      padding: 10px 20px;
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      font-weight: 600;
      font-size: 0.88rem;
      z-index: 3000;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Run initial loading
  await init();
});
