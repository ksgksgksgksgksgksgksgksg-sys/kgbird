/* ═══════════════════════════════════════════════════════
   KGBIRD — Core JS
   Nav, scroll reveal, audio player, shared utilities
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initReveal();
  initPlayer();
  initFeaturedSingles();
  scalePunctuation();
});

/* ── Punctuation fix (Urbanist has tiny punctuation) ── */
function scalePunctuation() {
  const map = {
    ',': 'punct', ';': 'punct', ':': 'punct', "'": 'punct', '"': 'punct',
    '.': 'punct-dot', '!': 'punct-dot', '?': 'punct-dot',
    '·': 'punct-bullet', '•': 'punct-bullet', '—': 'punct', '–': 'punct'
  };
  const re = /([,;:.!?'"·•—–])/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (!re.test(node.nodeValue)) return;
    const parent = node.parentElement;
    if (!parent) return;
    if (parent.closest('script, style, textarea, input, code, pre')) return;
    if (parent.classList.contains('punct') || parent.classList.contains('punct-dot') || parent.classList.contains('punct-bullet')) return;
    // Skip flex/grid containers — inserting spans breaks their layout
    const parentDisplay = getComputedStyle(parent).display;
    if (parentDisplay.includes('flex') || parentDisplay.includes('grid')) return;
    const frag = document.createDocumentFragment();
    node.nodeValue.split(re).forEach(part => {
      if (map[part]) {
        const span = document.createElement('span');
        span.className = map[part];
        span.textContent = part;
        frag.appendChild(span);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
}

/* ── Navigation ─────────────────────────────────────── */
function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--scrolled', y > 60);
    lastScroll = y;
  }, { passive: true });

  // Mobile toggle
  const toggle = nav.querySelector('.nav__toggle');
  const links = nav.querySelector('.nav__links');
  if (toggle && links) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      links.classList.toggle('nav__links--open');
      const isOpen = links.classList.contains('nav__links--open');
      toggle.setAttribute('aria-expanded', isOpen);
    });
    // Close nav when tapping outside (touchstart for iOS, click for desktop)
    ['touchstart', 'click'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        if (links.classList.contains('nav__links--open') && !nav.contains(e.target)) {
          links.classList.remove('nav__links--open');
          toggle.setAttribute('aria-expanded', false);
        }
      }, { passive: true });
    });
  }
}

/* ── Scroll Reveal ──────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal, .manifesto__text, .manifesto__rule');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => observer.observe(el));
}

/* ── Audio Player ───────────────────────────────────── */
const AudioEngine = (() => {
  let audio = null;
  let currentTrack = null;
  let playerEl = null;
  let progressInterval = null;

  function init() {
    playerEl = document.querySelector('.player');
    if (!playerEl) return;

    audio = new Audio();
    audio.volume = 0.7;
    window._kgAudio = audio; // Expose for lyric sync

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoaded);

    // Progress bar seek
    const bar = playerEl.querySelector('.player__bar');
    if (bar) {
      bar.addEventListener('click', (e) => {
        if (!audio.duration) return;
        const rect = bar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * audio.duration;
      });
    }

    // Play/pause button
    const playBtn = playerEl.querySelector('.player__btn--play');
    if (playBtn) {
      playBtn.addEventListener('click', togglePlay);
    }
  }

  function play(src, trackName, albumName) {
    if (currentTrack === src && !audio.paused) {
      audio.pause();
      updatePlayButton(false);
      return;
    }

    if (currentTrack !== src) {
      audio.src = src;
      currentTrack = src;
    }

    audio.play().catch(() => {});
    updatePlayButton(true);
    playerEl.classList.add('player--active');

    // Update info
    const nameEl = playerEl.querySelector('.player__track-name');
    const albumEl = playerEl.querySelector('.player__album-name');
    if (nameEl) nameEl.textContent = trackName;
    if (albumEl) albumEl.textContent = albumName;

    // Update active track styling
    document.querySelectorAll('.track').forEach(t => t.classList.remove('track--playing'));
    const activeTrack = document.querySelector(`[data-src="${src}"]`);
    if (activeTrack) activeTrack.classList.add('track--playing');

    // Log play
    if (typeof KG_ANALYTICS !== 'undefined') {
      KG_ANALYTICS.trackPlay(trackName, albumName, 0);
    }
  }

  function togglePlay() {
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      updatePlayButton(true);
    } else {
      audio.pause();
      updatePlayButton(false);
    }
  }

  function updateProgress() {
    if (!audio || !audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    const fill = playerEl.querySelector('.player__bar-fill');
    if (fill) fill.style.width = pct + '%';

    const currEl = playerEl.querySelector('.player__time--current');
    const durEl = playerEl.querySelector('.player__time--duration');
    if (currEl) currEl.textContent = formatTime(audio.currentTime);
    if (durEl) durEl.textContent = formatTime(audio.duration);
  }

  function onLoaded() {
    const durEl = playerEl.querySelector('.player__time--duration');
    if (durEl) durEl.textContent = formatTime(audio.duration);
  }

  function onEnded() {
    updatePlayButton(false);
    // Try next track
    const tracks = document.querySelectorAll('.track[data-src]');
    let foundCurrent = false;
    for (const t of tracks) {
      if (foundCurrent) {
        const src = t.dataset.src;
        const name = t.querySelector('.track__title')?.textContent || '';
        const album = t.closest('.album')?.querySelector('.album__title')?.textContent || '';
        play(src, name, album);
        return;
      }
      if (t.dataset.src === currentTrack) foundCurrent = true;
    }
  }

  function updatePlayButton(isPlaying) {
    const btn = playerEl?.querySelector('.player__btn--play');
    if (!btn) return;
    btn.innerHTML = isPlaying
      ? '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
  }

  function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  return { init, play, togglePlay };
})();

function initPlayer() {
  AudioEngine.init();

  // Bind track clicks
  document.querySelectorAll('.track[data-src]').forEach(track => {
    track.addEventListener('click', (e) => {
      if (e.target.closest('.track__lyrics-toggle')) return;
      const src = track.dataset.src;
      const name = track.querySelector('.track__title')?.textContent || '';
      const album = track.closest('.album')?.querySelector('.album__title')?.textContent || '';
      AudioEngine.play(src, name, album);
    });
  });
}

/* ── Lyrics Overlay ─────────────────────────────────── */
function showLyrics(title, text) {
  const overlay = document.querySelector('.lyrics-overlay');
  if (!overlay) return;

  overlay.querySelector('.lyrics-overlay__title').textContent = title;
  overlay.querySelector('.lyrics-overlay__text').textContent = text;
  overlay.classList.add('lyrics-overlay--active');
  document.body.style.overflow = 'hidden';
}

function closeLyrics() {
  const overlay = document.querySelector('.lyrics-overlay');
  if (!overlay) return;
  overlay.classList.remove('lyrics-overlay--active');
  document.body.style.overflow = '';
}

/* ── Page Transitions ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#') || href.startsWith('tel:')) return;
    if (link.target === '_blank') return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('page-exit');
      setTimeout(() => {
        window.location.href = href;
      }, 280);
    });
  });
});

/* ── Keyboard Shortcuts (Music Player) ──────────────── */
document.addEventListener('keydown', (e) => {
  // Don't trigger when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  switch(e.code) {
    case 'Space':
      e.preventDefault();
      AudioEngine.togglePlay();
      break;
    case 'KeyM':
      if (window._kgAudio) {
        window._kgAudio.muted = !window._kgAudio.muted;
      }
      break;
    case 'ArrowRight':
      if (window._kgAudio && window._kgAudio.duration) {
        window._kgAudio.currentTime = Math.min(window._kgAudio.duration, window._kgAudio.currentTime + 5);
      }
      break;
    case 'ArrowLeft':
      if (window._kgAudio) {
        window._kgAudio.currentTime = Math.max(0, window._kgAudio.currentTime - 5);
      }
      break;
    case 'ArrowUp':
      if (window._kgAudio) {
        window._kgAudio.volume = Math.min(1, window._kgAudio.volume + 0.1);
      }
      break;
    case 'ArrowDown':
      if (window._kgAudio) {
        window._kgAudio.volume = Math.max(0, window._kgAudio.volume - 0.1);
      }
      break;
  }
});

/* ── Lazy Loading Images ───────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img[src]').forEach(img => {
    if (!img.loading) img.loading = 'lazy';
  });
});

/* ── Back to Top ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.innerHTML = '&uarr;';
  btn.setAttribute('aria-label', 'back to top');
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
    btn.classList.toggle('back-to-top--visible', window.scrollY > window.innerHeight);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ── Custom Scrollbar ──────────────────────────────── */
/* Native scrollbar is hidden via CSS. This builds a real DOM element      */
/* so hover/active states work via real mouse events (not pseudo-elements  */
/* which Chrome 128+ broke for ::-webkit-scrollbar-thumb).                 */
document.addEventListener('DOMContentLoaded', () => {
  // Build elements
  const track = document.createElement('div');
  track.className = 'kg-scrollbar';
  const thumb = document.createElement('div');
  thumb.className = 'kg-scrollbar__thumb';
  track.appendChild(thumb);
  document.body.appendChild(track);

  let hideTimer = null;
  let isDragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;

  function scrollInfo() {
    const docH = document.documentElement.scrollHeight;
    const viewH = window.innerHeight;
    const scrollY = window.scrollY;
    const scrollable = docH - viewH;
    return { docH, viewH, scrollY, scrollable };
  }

  function updateThumb() {
    const { docH, viewH, scrollY, scrollable } = scrollInfo();
    if (scrollable <= 0) {
      track.classList.remove('kg-scrollbar--visible');
      return;
    }
    // Thumb height proportional to viewport/document ratio
    const ratio = viewH / docH;
    const thumbH = Math.max(30, ratio * viewH);
    const maxTop = viewH - thumbH;
    const top = (scrollY / scrollable) * maxTop;
    thumb.style.height = thumbH + 'px';
    thumb.style.top = top + 'px';
  }

  let scrollTimer = null;

  function showScrollbar() {
    track.classList.add('kg-scrollbar--visible');
    thumb.classList.add('kg-scrollbar__thumb--scrolling');
    clearTimeout(hideTimer);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      thumb.classList.remove('kg-scrollbar__thumb--scrolling');
    }, 150);
    hideTimer = setTimeout(() => {
      if (!isDragging) track.classList.remove('kg-scrollbar--visible');
    }, 1200);
  }

  // Show on scroll
  window.addEventListener('scroll', () => {
    updateThumb();
    showScrollbar();
  }, { passive: true });

  // Show on resize
  window.addEventListener('resize', () => {
    updateThumb();
  }, { passive: true });

  // Hover: keep visible + apply hover color (class-based for Firefox compat)
  thumb.addEventListener('mouseenter', () => {
    thumb.classList.add('kg-scrollbar__thumb--hover');
    clearTimeout(hideTimer);
    track.classList.add('kg-scrollbar--visible');
  });
  thumb.addEventListener('mouseleave', () => {
    if (!isDragging) {
      thumb.classList.remove('kg-scrollbar__thumb--hover');
      hideTimer = setTimeout(() => {
        track.classList.remove('kg-scrollbar--visible');
      }, 800);
    }
  });

  // Drag to scroll
  thumb.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    dragStartY = e.clientY;
    dragStartScroll = window.scrollY;
    thumb.classList.add('kg-scrollbar__thumb--active');
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const { viewH, scrollable } = scrollInfo();
    const thumbH = parseFloat(thumb.style.height) || 30;
    const maxTop = viewH - thumbH;
    const deltaY = e.clientY - dragStartY;
    const scrollDelta = (deltaY / maxTop) * scrollable;
    window.scrollTo(0, dragStartScroll + scrollDelta);
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    thumb.classList.remove('kg-scrollbar__thumb--active');
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    // Check if mouse is still over thumb
    if (!thumb.matches(':hover')) {
      thumb.classList.remove('kg-scrollbar__thumb--hover');
      hideTimer = setTimeout(() => {
        track.classList.remove('kg-scrollbar--visible');
      }, 800);
    }
  });

  // Click on track to jump
  track.addEventListener('click', (e) => {
    if (e.target === thumb) return;
    const { viewH, scrollable } = scrollInfo();
    const pct = e.clientY / viewH;
    window.scrollTo({ top: pct * scrollable, behavior: 'smooth' });
  });

  // Initial position
  updateThumb();
  // Flash briefly on page load so user knows scrollbar exists
  if (scrollInfo().scrollable > 0) {
    track.classList.add('kg-scrollbar--visible');
    hideTimer = setTimeout(() => {
      track.classList.remove('kg-scrollbar--visible');
    }, 1500);
  }
});

/* ── Featured Singles Player ────────────────────────── */
function initFeaturedSingles() {
  const avatars = document.querySelectorAll('.album-av[data-track]');
  if (!avatars.length) return;

  const drift = document.getElementById('mood-drift');
  let fsAudio = null;
  let fsPlaying = null;
  let fsRaf = null;

  const CIRCUMFERENCE = 289; // 2 * PI * 46

  const MOODS = {
    ace:      'radial-gradient(ellipse at 50% 60%, rgba(180,130,160,0.025), transparent 65%)',
    ledger:   'radial-gradient(ellipse at 50% 60%, rgba(100,140,110,0.025), transparent 65%)',
    access:   'radial-gradient(ellipse at 50% 60%, rgba(160,130,100,0.025), transparent 65%)',
    receipts: 'radial-gradient(ellipse at 50% 60%, rgba(140,150,160,0.025), transparent 65%)',
    elite:    'radial-gradient(ellipse at 50% 60%, rgba(130,110,160,0.025), transparent 65%)'
  };

  function resetAll() {
    avatars.forEach(av => {
      av.classList.remove('album-av--playing');
      const fill = av.querySelector('.album-av__fill');
      if (fill) {
        fill.style.transition = 'stroke-dashoffset 0.6s ease';
        fill.style.strokeDashoffset = CIRCUMFERENCE;
      }
    });
  }

  function updateRing() {
    if (!fsAudio || !fsPlaying || fsAudio.paused) return;
    const fill = fsPlaying.querySelector('.album-av__fill');
    if (fill && fsAudio.duration) {
      const pct = fsAudio.currentTime / fsAudio.duration;
      const offset = CIRCUMFERENCE * (1 - pct);
      fill.style.transition = 'none';
      fill.style.strokeDashoffset = offset;
    }
    fsRaf = requestAnimationFrame(updateRing);
  }

  function stopPlayback() {
    if (fsRaf) cancelAnimationFrame(fsRaf);
    if (fsAudio) {
      fsAudio.pause();
      fsAudio.currentTime = 0;
    }
    resetAll();
    fsPlaying = null;
    // Fade out drift
    if (drift) drift.classList.remove('active');
  }

  function playTrack(av) {
    const track = av.dataset.track;
    const src = 'audio/' + track + '.mp3';

    // Same track — toggle off
    if (fsPlaying === av && fsAudio && !fsAudio.paused) {
      stopPlayback();
      return;
    }

    // Stop any current
    stopPlayback();

    // Create or reuse audio
    if (!fsAudio) {
      fsAudio = new Audio();
      fsAudio.volume = 0.7;
      fsAudio.addEventListener('ended', () => {
        stopPlayback();
      });
    }

    fsAudio.src = src;
    fsPlaying = av;
    av.classList.add('album-av--playing');

    fsAudio.play().catch(() => {});
    fsRaf = requestAnimationFrame(updateRing);

    // Color drift
    if (drift && MOODS[track]) {
      drift.style.background = MOODS[track];
      drift.classList.add('active');
    }
  }

  avatars.forEach(av => {
    av.addEventListener('click', () => playTrack(av));
  });
}

/* ── Utilities ──────────────────────────────────────── */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
