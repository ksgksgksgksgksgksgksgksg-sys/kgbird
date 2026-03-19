/* ═══════════════════════════════════════════════════════
   KGBIRD — Core JS
   Nav, scroll reveal, audio player, shared utilities
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initReveal();
  initPlayer();
});

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
    toggle.addEventListener('click', () => {
      links.classList.toggle('nav__links--open');
      const isOpen = links.classList.contains('nav__links--open');
      toggle.setAttribute('aria-expanded', isOpen);
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

/* ── Utilities ──────────────────────────────────────── */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
