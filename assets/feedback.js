/**
 * Inline feedback — režim připomínek pro statický web BX EXPO.
 * Nastavte WEBHOOK_URL na URL z Google Apps Script (Web app).
 */
(function () {
  'use strict';

  // ↓↓↓ Doplňte URL z Google Apps Script po nasazení ↓↓↓
  const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxeJIgWokAT6sH-ZT7IasOpKF3Pg3yiW7xrtxyfFuYMdLOJmma4C511HrUaM9njzklH/exec';

  const COMMENTABLE_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, div, li, td, th, span, blockquote, figcaption';
  const IGNORE_SELECTOR = [
    '.site-header',
    '.feedback-popup',
    '.feedback-toast',
    '.feedback-mode-toggle',
    '.mobile-nav-toggle',
    '.logo-picker-menu',
    '.nav-dropdown-menu',
    'script',
    'style',
    'noscript',
    'svg',
    'input',
    'textarea',
    'select',
    'button',
    'a',
  ].join(', ');

  let modeActive = false;
  let popup = null;
  let toast = null;
  let currentContext = null;

  function init() {
    ensureToggle();
    ensureToast();
    bindToggle();
    bindDocumentClick();
    bindEscape();
  }

  function ensureToggle() {
    if (document.querySelector('.feedback-mode-toggle')) return;

    const nav = document.querySelector('.nav-desktop');
    const headerInner = document.querySelector('.header-inner');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feedback-mode-toggle';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML =
      '<span class="feedback-mode-toggle-dot" aria-hidden="true"></span>Režim připomínek';

    if (nav) {
      nav.after(btn);
    } else if (headerInner) {
      headerInner.appendChild(btn);
    }
  }

  function ensureToast() {
    if (toast) return;
    toast = document.createElement('div');
    toast.className = 'feedback-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  function bindToggle() {
    document.addEventListener('click', (e) => {
      const toggle = e.target.closest('.feedback-mode-toggle');
      if (!toggle) return;
      e.preventDefault();
      e.stopPropagation();
      setMode(!modeActive);
    });
  }

  function setMode(active) {
    modeActive = active;
    document.body.classList.toggle('feedback-mode-active', active);
    const toggle = document.querySelector('.feedback-mode-toggle');
    if (toggle) {
      toggle.classList.toggle('is-active', active);
      toggle.setAttribute('aria-pressed', String(active));
    }
    if (!active) closePopup();
  }

  function bindDocumentClick() {
    document.addEventListener(
      'click',
      (e) => {
        if (!modeActive) return;

        const eventTarget = e.target instanceof Element ? e.target : e.target.parentElement;
        if (!eventTarget) return;

        if (eventTarget.closest('.feedback-mode-toggle')) return;
        if (eventTarget.closest('.feedback-popup')) return;

        e.preventDefault();
        e.stopPropagation();

        const target = findCommentableTarget(eventTarget);
        if (!target) return;

        clearHoverHighlight();
        openPopup(e.clientX, e.clientY, target);
      },
      true
    );
  }

  function bindEscape() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopup();
    });
  }

  function findCommentableTarget(node) {
    let el = node instanceof Element ? node : node.parentElement;
    while (el && el !== document.body) {
      if (el.matches(IGNORE_SELECTOR)) return null;
      if (el.matches(COMMENTABLE_SELECTOR)) {
        const snippet = getTextSnippet(el, 2);
        if (snippet.length >= 2 || el.id) return el;
      }
      if (el.tagName === 'DIV' && el.children.length > 4) {
        el = el.parentElement;
        continue;
      }
      el = el.parentElement;
    }
    return null;
  }

  function getTextSnippet(el, maxLen) {
    maxLen = maxLen || 60;
    let out = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const part = node.textContent.replace(/\s+/g, ' ').trim();
      if (!part) continue;
      out = out ? out + ' ' + part : part;
      if (out.length >= maxLen) break;
    }
    out = out.trim();
    if (!out) return '';
    return out.length > maxLen ? out.slice(0, maxLen) + '…' : out;
  }

  function getElementContext(el) {
    const parts = [];

    const activePage = document.querySelector('.page-view.active');
    if (activePage && activePage.id) {
      parts.push('stránka:' + activePage.id.replace(/^page-/, ''));
    }

    if (el.id) {
      parts.push('#' + el.id);
    }

    const tag = el.tagName.toLowerCase();
    const snippet = getTextSnippet(el, 60);
    if (snippet) {
      parts.push(tag + ':"' + snippet + '"');
    } else {
      parts.push(tag);
    }

    return parts.join(' | ');
  }

  function sendPayload(payload) {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    if (navigator.sendBeacon && navigator.sendBeacon(WEBHOOK_URL, blob)) {
      return;
    }
    fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
    }).catch(function (err) {
      console.error('Feedback submit failed:', err);
    });
  }

  function openPopup(x, y, targetEl) {
    closePopup();
    currentContext = getElementContext(targetEl);

    popup = document.createElement('div');
    popup.className = 'feedback-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Přidat připomínku');
    popup.innerHTML = `
      <div class="feedback-popup-context">Kontext: <strong></strong></div>
      <div class="feedback-field">
        <label for="feedback-name">Jméno</label>
        <input type="text" id="feedback-name" name="name" autocomplete="name" placeholder="Vaše jméno">
      </div>
      <div class="feedback-field">
        <label for="feedback-comment">Komentář</label>
        <textarea id="feedback-comment" name="comment" placeholder="Vaše připomínka…" required></textarea>
      </div>
      <div class="feedback-actions">
        <button type="button" class="feedback-btn feedback-btn-cancel">Zrušit</button>
        <button type="button" class="feedback-btn feedback-btn-submit">Odeslat</button>
      </div>
    `;

    popup.querySelector('.feedback-popup-context strong').textContent = currentContext;
    document.body.appendChild(popup);

    positionPopup(popup, x, y);

    const nameInput = popup.querySelector('#feedback-name');
    const commentInput = popup.querySelector('#feedback-comment');
    const savedName = localStorage.getItem('bx-feedback-name');
    if (savedName) nameInput.value = savedName;

    popup.querySelector('.feedback-btn-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      closePopup();
    });

    popup.querySelector('.feedback-btn-submit').addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      submitFeedback(nameInput.value.trim(), commentInput.value.trim());
    });

    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitFeedback(nameInput.value.trim(), commentInput.value.trim());
      }
    });

    popup.addEventListener('click', (e) => e.stopPropagation());
    commentInput.focus();
  }

  function positionPopup(el, x, y) {
    const margin = 12;
    const rect = { width: 300, height: 260 };
    let left = x + margin;
    let top = y + margin;

    if (left + rect.width > window.innerWidth - margin) {
      left = x - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = y - rect.height - margin;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function closePopup() {
    if (popup) {
      popup.remove();
      popup = null;
    }
    currentContext = null;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2200);
  }

  function submitFeedback(name, comment) {
    if (!comment) {
      popup?.querySelector('#feedback-comment')?.focus();
      return;
    }

    if (WEBHOOK_URL.includes('VAS_DEPLOY_ID')) {
      alert('Nastavte WEBHOOK_URL v souboru assets/feedback.js na URL vaší Google Web app.');
      return;
    }

    const payload = {
      name: name || 'Anonym',
      context: currentContext || '',
      comment: comment,
      pageUrl: location.href,
    };

    if (name) localStorage.setItem('bx-feedback-name', name);

    closePopup();
    showToast('Odesláno');

    setTimeout(function () {
      sendPayload(payload);
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
