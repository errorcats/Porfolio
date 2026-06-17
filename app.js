const AppCore = (() => {
  const MIN_SHOW = 40;
  const TABLET_BP = 900;
  const PHONE_BP = 600;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function windows() {
    return document.querySelectorAll('[data-window-id]');
  }

  function windowById(id) {
    return document.querySelector(`[data-window-id="${id}"]`);
  }

  function windowId(target) {
    const win = typeof target === 'string' ? windowById(target) : target;
    return win ? win.dataset.windowId : null;
  }

  function viewportWidth() {
    return window.visualViewport ? window.visualViewport.width : window.innerWidth;
  }

  function viewportHeight() {
    return window.visualViewport ? window.visualViewport.height : window.innerHeight;
  }

  function taskbarHeight(fallback) {
    const taskbar = document.getElementById('taskbar');
    return taskbar ? taskbar.offsetHeight : fallback;
  }

  function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  function isTablet() {
    return viewportWidth() <= TABLET_BP;
  }

  function isPhone() {
    return viewportWidth() <= PHONE_BP;
  }

  function clampWindow(win, x, y, fallbackTaskbarHeight) {
    const vw = viewportWidth();
    const vh = viewportHeight();
    const tbH = taskbarHeight(fallbackTaskbarHeight);
    const width = win.offsetWidth;

    return {
      x: Math.max(-(width - MIN_SHOW), Math.min(vw - MIN_SHOW, x)),
      y: Math.max(0, Math.min(vh - tbH - MIN_SHOW, y)),
    };
  }

  function clampWindowInside(win, x, y, fallbackTaskbarHeight, padding = 4) {
    const vw = viewportWidth();
    const vh = viewportHeight();
    const tbH = taskbarHeight(fallbackTaskbarHeight);
    const maxX = Math.max(padding, vw - win.offsetWidth - padding);
    const maxY = Math.max(padding, vh - tbH - win.offsetHeight - padding);

    return {
      x: Math.max(padding, Math.min(maxX, x)),
      y: Math.max(padding, Math.min(maxY, y)),
    };
  }

  function snapWindow(win) {
    win.classList.remove('is-snapping');
    void win.offsetWidth;
    win.classList.add('is-snapping');
    win.addEventListener('animationend', () => win.classList.remove('is-snapping'), { once: true });
  }

  function setAbsolute(win, left, top) {
    win.style.position = 'absolute';
    win.style.margin = '0';
    if (typeof left === 'number') win.style.left = left + 'px';
    if (typeof top === 'number') win.style.top = top + 'px';
  }

  function parsePosition(win) {
    const rect = win.getBoundingClientRect();
    return {
      x: parseInt(win.style.left, 10) || rect.left,
      y: parseInt(win.style.top, 10) || rect.top,
    };
  }

  function windowMeta(id) {
    const win = windowById(id);
    if (!win) return { title: id, iconSrc: null, iconAlt: '' };
    const titleBarText = win.querySelector('.title-bar-text');
    const img = titleBarText ? titleBarText.querySelector('img') : null;
    return {
      title: (titleBarText ? titleBarText.textContent : id).trim(),
      iconSrc: img ? img.src : null,
      iconAlt: img ? img.alt : '',
    };
  }

  function appendIcon(parent, src, alt, fallbackClass) {
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      img.draggable = false;
      parent.appendChild(img);
      return img;
    }

    const fallback = document.createElement('span');
    fallback.className = fallbackClass;
    fallback.textContent = '🗔';
    parent.appendChild(fallback);
    return fallback;
  }

  function debounce(fn, delay) {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  return {
    ready,
    windows,
    windowById,
    windowId,
    viewportWidth,
    viewportHeight,
    taskbarHeight,
    isTouchDevice,
    isTablet,
    isPhone,
    clampWindow,
    clampWindowInside,
    snapWindow,
    setAbsolute,
    parsePosition,
    windowMeta,
    appendIcon,
    debounce,
  };
})();

const WindowState = (() => {
  const KEY = 'win98_positions';

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }

  function save(data) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
  }

  function savePosition(id, x, y) {
    const data = load();
    data[id] = { x, y };
    save(data);
  }

  function getPosition(id) {
    const saved = load()[id];
    return saved && typeof saved.x === 'number' ? saved : null;
  }

  return { savePosition, getPosition };
})();

window.WindowState = WindowState;

const WindowSizer = (() => {
  const TASKBAR_H = 44;
  const stored = new WeakMap();

  function padding() {
    return AppCore.isPhone() ? 4 : 8;
  }

  function bounds() {
    const pad = padding();
    const taskbar = AppCore.taskbarHeight(TASKBAR_H);
    return {
      left: pad,
      top: pad,
      width: Math.max(160, AppCore.viewportWidth() - pad * 2),
      height: Math.max(120, AppCore.viewportHeight() - taskbar - pad * 2),
    };
  }

  function controlButton(win) {
    return win.querySelector(
      '.title-bar-controls button[aria-label="Maximize"], .title-bar-controls button[aria-label="Restore"]'
    );
  }

  function setButtonState(win, maximized) {
    const button = controlButton(win);
    if (button) button.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  }

  function capture(win) {
    const rect = win.getBoundingClientRect();
    return {
      position: win.style.position,
      margin: win.style.margin,
      left: win.style.left || rect.left + 'px',
      top: win.style.top || rect.top + 'px',
      width: win.style.width || rect.width + 'px',
      height: win.style.height || rect.height + 'px',
      maxWidth: win.style.maxWidth,
      maxHeight: win.style.maxHeight,
      transform: win.style.transform,
    };
  }

  function applyMaximized(win) {
    const box = bounds();
    AppCore.setAbsolute(win, box.left, box.top);
    win.style.transform = 'none';
    win.style.width = box.width + 'px';
    win.style.height = box.height + 'px';
    win.style.maxWidth = 'none';
    win.style.maxHeight = 'none';
  }

  function maximize(win) {
    if (!win || isMaximized(win)) return;
    stored.set(win, capture(win));
    win.classList.add('is-maximized');
    applyMaximized(win);
    setButtonState(win, true);
  }

  function restore(win) {
    if (!win || !isMaximized(win)) return;

    const prev = stored.get(win);
    if (prev) {
      win.style.position = prev.position;
      win.style.margin = prev.margin;
      win.style.left = prev.left;
      win.style.top = prev.top;
      win.style.width = prev.width;
      win.style.height = prev.height;
      win.style.maxWidth = prev.maxWidth;
      win.style.maxHeight = prev.maxHeight;
      win.style.transform = prev.transform;
      stored.delete(win);
    } else {
      win.style.maxWidth = '';
      win.style.maxHeight = '';
      win.style.transform = '';
    }

    win.classList.remove('is-maximized');
    setButtonState(win, false);
  }

  function toggle(win) {
    if (isMaximized(win)) {
      restore(win);
    } else {
      maximize(win);
    }
  }

  function isMaximized(win) {
    return !!win && win.classList.contains('is-maximized');
  }

  function refresh() {
    document.querySelectorAll('.window.is-maximized').forEach(applyMaximized);
  }

  const onResize = AppCore.debounce(refresh, 80);
  window.addEventListener('resize', onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
  }

  return { applyMaximized, isMaximized, maximize, restore, toggle };
})();

window.WindowSizer = WindowSizer;

const WindowManager = (() => {
  const status = {};
  let topZ = 100;
  let activeId = null;

  function emit(name, id) {
    document.dispatchEvent(new CustomEvent('wm:' + name, { detail: { id } }));
  }

  function el(target) {
    return typeof target === 'string' ? AppCore.windowById(target) : target;
  }

  function currentStatus(id) {
    return status[id] || 'closed';
  }

  function bringToFront(win) {
    topZ += 1;
    win.style.zIndex = topZ;
    activeId = win.dataset.windowId;

    AppCore.windows().forEach(item => {
      item.classList.toggle('is-inactive', item !== win);
    });

    emit('focus', activeId);
  }

  function animateOpen(win) {
    win.classList.remove('is-closing', 'is-snapping', 'is-opening');
    void win.offsetWidth;
    win.classList.add('is-opening');
    win.addEventListener('animationend', () => win.classList.remove('is-opening'), { once: true });
  }

  function animateClose(win, callback) {
    win.classList.remove('is-opening', 'is-snapping');
    void win.offsetWidth;
    win.classList.add('is-closing');
    win.addEventListener('animationend', () => {
      win.classList.remove('is-closing');
      if (callback) callback();
    }, { once: true });
  }

  function applyPosition(win) {
    const id = win.dataset.windowId;
    const pos = WindowState.getPosition(id);
    AppCore.setAbsolute(win);

    if (pos) {
      win.style.left = pos.x + 'px';
      win.style.top = pos.y + 'px';
      return;
    }

    const index = Array.from(AppCore.windows()).indexOf(win);
    win.style.left = 80 + index * 30 + 'px';
    win.style.top = 60 + index * 30 + 'px';
  }

  function openWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    const state = currentStatus(id);

    if (state !== 'closed') {
      if (state === 'minimized') {
        restoreWindow(win);
      } else {
        focusWindow(win);
      }
      return;
    }

    applyPosition(win);
    status[id] = 'opened';
    win.style.display = '';
    animateOpen(win);
    bringToFront(win);
    emit('opened', id);
  }

  function minimizeWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    if (currentStatus(id) !== 'opened') return;

    status[id] = 'minimized';
    if (activeId === id) activeId = null;

    animateClose(win, () => {
      win.style.display = 'none';
    });
    emit('minimized', id);
  }

  function restoreWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    if (currentStatus(id) !== 'minimized') return;

    status[id] = 'opened';
    win.style.display = '';
    animateOpen(win);
    bringToFront(win);
    emit('restored', id);
  }

  function closeWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    const state = currentStatus(id);
    if (state === 'closed') return;

    if (WindowSizer.isMaximized(win)) WindowSizer.restore(win);

    status[id] = 'closed';
    if (activeId === id) activeId = null;

    if (state === 'minimized') {
      win.style.display = 'none';
      emit('closed', id);
      return;
    }

    animateClose(win, () => {
      win.style.display = 'none';
    });
    emit('closed', id);
  }

  function focusWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    if (currentStatus(id) !== 'opened') return;
    bringToFront(win);
  }

  function taskbarClick(id) {
    const state = currentStatus(id);
    if (state === 'closed') return;
    if (state === 'minimized') {
      restoreWindow(id);
      return;
    }
    if (activeId === id) {
      minimizeWindow(id);
      return;
    }
    focusWindow(id);
  }

  function maximizeWindow(target) {
    const win = el(target);
    if (!win) return;

    const id = AppCore.windowId(win);
    if (currentStatus(id) !== 'opened') return;
    WindowSizer.toggle(win);
    bringToFront(win);
  }

  function getStatus(id) {
    return currentStatus(id);
  }

  function getActiveId() {
    return activeId;
  }

  function wireButtons(win) {
    const minBtn = win.querySelector('[aria-label="Minimize"]');
    if (minBtn) {
      minBtn.addEventListener('click', event => {
        event.stopPropagation();
        minimizeWindow(win);
      });
    }

    const maxBtn = win.querySelector('[aria-label="Maximize"], [aria-label="Restore"]');
    if (maxBtn) {
      const fresh = maxBtn.cloneNode(true);
      maxBtn.replaceWith(fresh);
      fresh.addEventListener('click', event => {
        event.stopPropagation();
        maximizeWindow(win);
      });
    }

    const closeBtn = win.querySelector('[aria-label="Close"]');
    if (closeBtn) {
      const fresh = closeBtn.cloneNode(true);
      closeBtn.replaceWith(fresh);
      fresh.addEventListener('click', event => {
        event.stopPropagation();
        closeWindow(win);
      });
    }

    win.addEventListener('mousedown', () => {
      if (currentStatus(win.dataset.windowId) === 'opened') focusWindow(win);
    });
  }

  function init() {
    AppCore.windows().forEach(win => {
      const id = win.dataset.windowId;
      status[id] = 'closed';
      win.style.display = 'none';
      wireButtons(win);
    });
  }

  AppCore.ready(init);

  return {
    openWindow,
    minimizeWindow,
    restoreWindow,
    closeWindow,
    focusWindow,
    maximizeWindow,
    taskbarClick,
    getStatus,
    getActiveId,
  };
})();

window.WindowManager = WindowManager;

(() => {
  const TASKBAR_H = 35;

  function initDrag(win) {
    const titleBar = win.querySelector('.title-bar');
    if (!titleBar) return;

    let active = false;
    let offsetX = 0;
    let offsetY = 0;
    let moved = false;

    function start(clientX, clientY) {
      if (WindowSizer.isMaximized(win)) return;
      active = true;
      moved = false;
      const rect = win.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      AppCore.setAbsolute(win);
      WindowManager.focusWindow(win);
    }

    titleBar.addEventListener('mousedown', event => {
      if (event.target.closest('.title-bar-controls')) return;
      if (WindowSizer.isMaximized(win)) return;
      event.preventDefault();
      const rect = win.getBoundingClientRect();
      win.style.left = rect.left + 'px';
      win.style.top = rect.top + 'px';
      start(event.clientX, event.clientY);
    });

    titleBar.addEventListener('touchstart', event => {
      if (event.target.closest('.title-bar-controls')) return;
      if (AppCore.isTouchDevice()) return;
      if (WindowSizer.isMaximized(win)) return;
      const touch = event.touches[0];
      const rect = win.getBoundingClientRect();
      win.style.left = rect.left + 'px';
      win.style.top = rect.top + 'px';
      start(touch.clientX, touch.clientY);
    }, { passive: true });

    titleBar.addEventListener('dblclick', event => {
      if (event.target.closest('.title-bar-controls')) return;
      WindowManager.maximizeWindow(win);
    });

    document.addEventListener('mousemove', event => {
      if (!active) return;
      const position = AppCore.clampWindow(win, event.clientX - offsetX, event.clientY - offsetY, TASKBAR_H);
      win.style.left = position.x + 'px';
      win.style.top = position.y + 'px';
      moved = true;
    });

    document.addEventListener('touchmove', event => {
      if (!active) return;
      const touch = event.touches[0];
      const position = AppCore.clampWindow(win, touch.clientX - offsetX, touch.clientY - offsetY, TASKBAR_H);
      win.style.left = position.x + 'px';
      win.style.top = position.y + 'px';
      moved = true;
    }, { passive: false });

    function end() {
      if (!active) return;
      active = false;
      if (!moved) return;

      WindowState.savePosition(
        win.dataset.windowId,
        parseInt(win.style.left, 10),
        parseInt(win.style.top, 10)
      );
      AppCore.snapWindow(win);
    }

    document.addEventListener('mouseup', end);
    document.addEventListener('touchend', end);
  }

  function init() {
    AppCore.windows().forEach(win => {
      initDrag(win);
      win.addEventListener('mousedown', () => {
        if (WindowManager.getStatus(win.dataset.windowId) === 'opened') {
          WindowManager.focusWindow(win);
        }
      });
    });
  }

  AppCore.ready(init);
})();

const TaskbarManager = (() => {
  const buttons = {};
  let container = null;

  function inject() {
    const clock = document.getElementById('clock');
    if (!clock) return null;

    const div = document.createElement('div');
    div.id = 'taskbar-buttons';
    clock.parentElement.insertBefore(div, clock);
    return div;
  }

  function createButton(id) {
    if (buttons[id]) return;

    const meta = AppCore.windowMeta(id);
    const button = document.createElement('button');
    button.className = 'taskbar-btn';
    button.dataset.winId = id;

    AppCore.appendIcon(button, meta.iconSrc, meta.iconAlt, 'btn-icon-fallback');

    const label = document.createElement('span');
    label.textContent = meta.title;
    button.appendChild(label);

    button.addEventListener('click', () => WindowManager.taskbarClick(id));
    container.appendChild(button);
    buttons[id] = button;
  }

  function removeButton(id) {
    const button = buttons[id];
    if (!button) return;
    button.remove();
    delete buttons[id];
  }

  function syncStyles() {
    const activeId = WindowManager.getActiveId();
    Object.entries(buttons).forEach(([id, button]) => {
      const state = WindowManager.getStatus(id);
      button.classList.toggle('is-active', id === activeId && state === 'opened');
      button.classList.toggle('is-minimized', state === 'minimized');
    });
  }

  function bindEvents() {
    document.addEventListener('wm:opened', event => {
      createButton(event.detail.id);
      syncStyles();
    });
    document.addEventListener('wm:closed', event => {
      removeButton(event.detail.id);
      syncStyles();
    });
    document.addEventListener('wm:minimized', syncStyles);
    document.addEventListener('wm:restored', syncStyles);
    document.addEventListener('wm:focus', syncStyles);
  }

  function init() {
    container = inject();
    if (!container) return;
    bindEvents();
  }

  AppCore.ready(init);

  return {};
})();

window.TaskbarManager = TaskbarManager;

const DesktopIcons = (() => {
  function definitions() {
    const result = [];
    AppCore.windows().forEach(win => {
      const id = win.dataset.windowId;
      const meta = AppCore.windowMeta(id);
      result.push({
        id,
        label: meta.title,
        iconSrc: meta.iconSrc,
        iconAlt: meta.iconAlt,
      });
    });
    return result;
  }

  function container() {
    const el = document.createElement('div');
    el.id = 'desktop-icons';
    document.body.appendChild(el);
    return el;
  }

  function iconElement(definition) {
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.iconId = definition.id;
    el.title = definition.label;

    AppCore.appendIcon(el, definition.iconSrc, definition.iconAlt, 'icon-fallback');

    const label = document.createElement('span');
    label.textContent = definition.label;
    el.appendChild(label);

    return el;
  }

  function select(id) {
    document.querySelectorAll('.desktop-icon').forEach(icon => {
      icon.classList.toggle('is-selected', icon.dataset.iconId === id);
    });
  }

  function deselect() {
    document.querySelectorAll('.desktop-icon').forEach(icon => {
      icon.classList.remove('is-selected');
    });
  }

  function activate(id) {
    const state = WindowManager.getStatus(id);
    if (state === 'closed') {
      WindowManager.openWindow(id);
    } else if (state === 'minimized') {
      WindowManager.restoreWindow(id);
    } else {
      WindowManager.focusWindow(id);
    }
  }

  function bind(icon, definition) {
    let timer = null;

    icon.addEventListener('click', event => {
      event.stopPropagation();
      select(definition.id);

      if (AppCore.isTouchDevice() || AppCore.isTablet()) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        activate(definition.id);
        return;
      }

      if (timer) {
        clearTimeout(timer);
        timer = null;
        activate(definition.id);
      } else {
        timer = setTimeout(() => {
          timer = null;
        }, 300);
      }
    });

    icon.addEventListener('dblclick', event => {
      event.stopPropagation();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      activate(definition.id);
    });
  }

  function init() {
    const wrap = container();
    definitions().forEach(definition => {
      const icon = iconElement(definition);
      bind(icon, definition);
      wrap.appendChild(icon);
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.desktop-icon')) deselect();
    });
  }

  AppCore.ready(init);

  return { activate };
})();

window.DesktopIcons = DesktopIcons;

(() => {
  const DRAG_THRESHOLD = 8;
  const TASKBAR_H = 44;
  if (!AppCore.isTouchDevice()) return;

  let dragging = false;
  let tracking = false;
  let activeWin = null;
  let touchId = null;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;

  function findTouch(event) {
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      if (event.changedTouches[i].identifier === touchId) return event.changedTouches[i];
    }
    for (let i = 0; i < event.touches.length; i += 1) {
      if (event.touches[i].identifier === touchId) return event.touches[i];
    }
    return null;
  }

  function centerWindow(win) {
    const vw = AppCore.viewportWidth();
    const vh = AppCore.viewportHeight();
    const tbH = AppCore.taskbarHeight(TASKBAR_H);
    const width = win.offsetWidth;
    const height = win.offsetHeight;
    win.style.left = Math.max(0, Math.round((vw - width) / 2)) + 'px';
    win.style.top = Math.max(0, Math.round((vh - tbH - height) / 2)) + 'px';
  }

  function clampOpen(win) {
    const x = parseInt(win.style.left, 10) || 0;
    const y = parseInt(win.style.top, 10) || 0;
    const position = AppCore.isTablet()
      ? AppCore.clampWindowInside(win, x, y, TASKBAR_H, AppCore.isPhone() ? 4 : 8)
      : AppCore.clampWindow(win, x, y, TASKBAR_H);
    win.style.left = position.x + 'px';
    win.style.top = position.y + 'px';
  }

  function repositionAll() {
    AppCore.windows().forEach(win => {
      if (win.style.display === 'none') return;
      clampOpen(win);
    });
  }

  const onResize = AppCore.debounce(repositionAll, 120);
  window.addEventListener('resize', onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
  }

  document.addEventListener('touchmove', event => {
    if (!tracking || !activeWin) return;
    if (WindowSizer.isMaximized(activeWin)) return;

    const touch = findTouch(event);
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!dragging) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < DRAG_THRESHOLD) return;
      dragging = true;
      WindowManager.focusWindow(activeWin);
    }

    event.preventDefault();

    const position = AppCore.isTablet()
      ? AppCore.clampWindowInside(
          activeWin,
          touch.clientX - offsetX,
          touch.clientY - offsetY,
          TASKBAR_H,
          AppCore.isPhone() ? 4 : 8
        )
      : AppCore.clampWindow(activeWin, touch.clientX - offsetX, touch.clientY - offsetY, TASKBAR_H);
    activeWin.style.left = position.x + 'px';
    activeWin.style.top = position.y + 'px';
  }, { passive: false });

  document.addEventListener('touchend', event => {
    if (!tracking) return;

    let found = false;
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      if (event.changedTouches[i].identifier === touchId) {
        found = true;
        break;
      }
    }
    if (!found) return;

    tracking = false;

    if (dragging && activeWin) {
      dragging = false;
      WindowState.savePosition(
        activeWin.dataset.windowId,
        parseInt(activeWin.style.left, 10),
        parseInt(activeWin.style.top, 10)
      );
      AppCore.snapWindow(activeWin);
    }

    activeWin = null;
    touchId = null;
  });

  document.addEventListener('touchcancel', () => {
    tracking = false;
    dragging = false;
    activeWin = null;
    touchId = null;
  });

  function patchTouchDrag(win) {
    const titleBar = win.querySelector('.title-bar');
    if (!titleBar) return;

    titleBar.addEventListener('touchstart', event => {
      if (event.target.closest('.title-bar-controls')) return;
      if (tracking) return;
      if (WindowSizer.isMaximized(win)) return;

      const touch = event.changedTouches[0];
      const position = AppCore.parsePosition(win);
      touchId = touch.identifier;
      tracking = true;
      dragging = false;
      activeWin = win;
      startX = touch.clientX;
      startY = touch.clientY;
      offsetX = touch.clientX - position.x;
      offsetY = touch.clientY - position.y;

      AppCore.setAbsolute(win, position.x, position.y);
    }, { passive: true });
  }

  function hookOpenForMobile() {
    document.addEventListener('wm:opened', event => {
      const win = AppCore.windowById(event.detail.id);
      if (!win || AppCore.viewportWidth() > 900) return;

      requestAnimationFrame(() => {
        const saved = WindowState.getPosition(event.detail.id);
        if (saved) {
          clampOpen(win);
        } else {
          centerWindow(win);
        }
      });
    });
  }

  function init() {
    AppCore.windows().forEach(patchTouchDrag);
    hookOpenForMobile();
  }

  AppCore.ready(init);
})();

(() => {
  function initTaskbarScroll() {
    const strip = document.getElementById('taskbar-buttons');
    if (!strip) return;

    let scrolling = false;
    let startX = 0;
    let scrollX = 0;
    const threshold = 6;

    strip.addEventListener('touchstart', event => {
      startX = event.touches[0].clientX;
      scrollX = strip.scrollLeft;
      scrolling = false;
    }, { passive: true });

    strip.addEventListener('touchmove', event => {
      const dx = event.touches[0].clientX - startX;
      if (!scrolling && Math.abs(dx) > threshold) scrolling = true;
      if (scrolling) strip.scrollLeft = scrollX - dx;
    }, { passive: true });

    strip.addEventListener('touchend', event => {
      if (!scrolling) return;
      event.stopPropagation();
      scrolling = false;
    });
  }

  function rememberBaseSize(win) {
    if (!win.dataset.baseWidth) win.dataset.baseWidth = win.style.width || '';
    if (!win.dataset.baseHeight) win.dataset.baseHeight = win.style.height || '';
  }

  function numericSize(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function restoreBaseSize(win) {
    if (WindowSizer.isMaximized(win)) return;
    if (win.dataset.baseWidth) win.style.width = win.dataset.baseWidth;
    if (win.dataset.baseHeight) win.style.height = win.dataset.baseHeight;
  }

  function fitWindowPosition(win, padding) {
    const current = AppCore.parsePosition(win);
    const position = AppCore.clampWindowInside(win, current.x, current.y, 44, padding);
    win.style.left = position.x + 'px';
    win.style.top = position.y + 'px';
  }

  function constrainWindow(win) {
    rememberBaseSize(win);
    document.documentElement.style.setProperty('--taskbar-h', AppCore.taskbarHeight(44) + 'px');

    if (WindowSizer.isMaximized(win)) {
      WindowSizer.applyMaximized(win);
      return;
    }

    if (!AppCore.isTablet()) {
      restoreBaseSize(win);
      return;
    }

    const padding = AppCore.isPhone() ? 4 : 8;
    const maxWidth = AppCore.viewportWidth() - padding * 2;
    const maxHeight = AppCore.viewportHeight() - AppCore.taskbarHeight(44) - padding * 2;
    const baseWidth = numericSize(win.dataset.baseWidth, win.offsetWidth);
    const baseHeight = numericSize(win.dataset.baseHeight, win.offsetHeight);
    const minWidth = Math.min(160, maxWidth);
    const minHeight = Math.min(120, maxHeight);

    win.style.width = Math.max(minWidth, Math.min(baseWidth, maxWidth)) + 'px';
    win.style.height = Math.max(minHeight, Math.min(baseHeight, maxHeight)) + 'px';
    fitWindowPosition(win, padding);
  }

  function constrainAll() {
    AppCore.windows().forEach(win => {
      rememberBaseSize(win);
      if (win.style.display === 'none') {
        if (!AppCore.isTablet()) restoreBaseSize(win);
        return;
      }
      constrainWindow(win);
    });
  }

  function hookOpen() {
    document.addEventListener('wm:opened', event => {
      if (!AppCore.isTablet()) return;
      const win = AppCore.windowById(event.detail.id);
      if (!win) return;
      requestAnimationFrame(() => constrainWindow(win));
    });
  }

  function setRealVh() {
    const height = AppCore.viewportHeight();
    const taskbarHeight = AppCore.taskbarHeight(44);
    document.documentElement.style.setProperty('--real-vh', height + 'px');
    document.documentElement.style.setProperty('--taskbar-h', taskbarHeight + 'px');
    document.body.style.height = height + 'px';
  }

  function updateTaskbarCompact() {
    const strip = document.getElementById('taskbar-buttons');
    if (!strip) return;

    const buttonCount = strip.querySelectorAll('.taskbar-btn').length;
    strip.classList.toggle('taskbar-compact', AppCore.viewportWidth() <= 380 && buttonCount > 2);
  }

  document.addEventListener('wm:opened', updateTaskbarCompact);
  document.addEventListener('wm:closed', updateTaskbarCompact);

  const onResize = AppCore.debounce(() => {
    setRealVh();
    constrainAll();
    updateTaskbarCompact();
  }, 100);

  window.addEventListener('resize', onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
  }

  function init() {
    setRealVh();
    AppCore.windows().forEach(rememberBaseSize);
    initTaskbarScroll();
    hookOpen();
    updateTaskbarCompact();
  }

  AppCore.ready(init);
})();

(() => {
  const clock = document.getElementById('clock');
  const params = new URLSearchParams(location.search);

  function updateClock() {
    if (!clock) return;
    const now = new Date();
    clock.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }

  function showModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
      if (WindowSizer.isMaximized(modal)) WindowSizer.restore(modal);
      modal.style.display = 'none';
    }
    try {
      history.replaceState({}, '', '/');
    } catch {}
  }

  function wireModalControls() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    const controls = modal.querySelector('.title-bar-controls');
    if (!controls) return;

    controls.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;

      const label = button.getAttribute('aria-label');
      event.stopPropagation();

      if (label === 'Close') {
        closeModal();
      } else if (label === 'Maximize' || label === 'Restore') {
        WindowSizer.toggle(modal);
      }
    });
  }

  window.closeModal = closeModal;
  wireModalControls();
  updateClock();
  setInterval(updateClock, 1000);

  if (params.get('error') === '404') {
    showModal();
  }
})();
