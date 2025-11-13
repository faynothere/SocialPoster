/* ===== RP Social Post — index.js ===== */
(() => {
  if (typeof window === 'undefined') return;
  if (window.RP_POST_EXT_LOADED) return;
  window.RP_POST_EXT_LOADED = true;

  const MODULE = 'rpPostExt';

  const DEFAULTS = {
    maxMessages: 12,
    feed: [] // { time, text, charName, userName }
  };

  // ---------- Context & Settings ----------

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function getCtx() {
    try {
      return window.SillyTavern && typeof window.SillyTavern.getContext === 'function'
        ? window.SillyTavern.getContext()
        : null;
    } catch (e) {
      return null;
    }
  }

  function ensureSettings() {
    const ctx = getCtx();
    if (!ctx) return cloneDefaults();

    if (!ctx.extensionSettings) ctx.extensionSettings = {};
    const store = ctx.extensionSettings;

    if (!store[MODULE]) {
      store[MODULE] = cloneDefaults();
    } else {
      const st = store[MODULE];
      for (const k in DEFAULTS) {
        if (!Object.prototype.hasOwnProperty.call(st, k)) {
          st[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice() : DEFAULTS[k];
        }
      }
      if (!Array.isArray(st.feed)) st.feed = [];
    }

    return store[MODULE];
  }

  function saveSettings() {
    const ctx = getCtx();
    if (!ctx) return;
    const fn = ctx.saveSettingsDebounced || ctx.saveSettings || null;
    if (typeof fn === 'function') {
      fn.call(ctx);
    }
  }

  // ---------- Small utils ----------

  function toast(msg) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('rp-post-ext__toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rp-post-ext__toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = '0';
    }, 1400);
  }

  function safeText(x) {
    return (x == null) ? '' : String(x);
  }

  function truncate(str, n) {
    str = safeText(str).replace(/\s+/g, ' ').trim();
    if (str.length <= n) return str;
    return str.slice(0, n - 1) + '…';
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) +
      ' · ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1);
  }

  function getCharName() {
    const ctx = getCtx() || {};
    return (
      ctx.characterName ||
      (ctx.characters && ctx.characterId != null && ctx.characters[ctx.characterId] && ctx.characters[ctx.characterId].name) ||
      ctx.name2 ||
      '{{char}}'
    );
  }

  function getUserName() {
    const ctx = getCtx() || {};
    return (
      ctx.name1 ||
      ctx.userName ||
      '{{user}}'
    );
  }

  function randomOf(arr) {
    if (!arr || !arr.length) return '';
    const i = Math.floor(Math.random() * arr.length);
    return arr[i];
  }

  // ---------- Chat → Post ----------

  function collectRecentMessages() {
    const ctx = getCtx();
    const st = ensureSettings();
    const chat = (ctx && Array.isArray(ctx.chat)) ? ctx.chat : [];
    if (!chat.length) return [];

    const max = Math.max(4, Math.min(40, st.maxMessages || DEFAULTS.maxMessages));
    const slice = [];

    for (let i = chat.length - 1; i >= 0 && slice.length < max; i--) {
      const m = chat[i];
      if (!m || typeof m.mes !== 'string') continue;
      const isUser = !!m.is_user;
      slice.push({ isUser: isUser, text: m.mes });
    }

    return slice.reverse();
  }

  function buildPostFromChat() {
    const messages = collectRecentMessages();
    const charName = getCharName();
    const userName = getUserName();

    if (!messages.length) {
      return {
        text: 'วันนี้ยังไม่มีโรลกับ ' + userName + ' เลย จะให้ฉันบ่นอะไรก่อนล่ะเนี่ย 😤',
        empty: true
      };
    }

    // แยกเฉพาะบรรทัดสั้น ๆ ทำเป็น bullet
    const bullets = messages.map((m) => {
      const who = m.isUser ? userName : charName;
      const body = truncate(m.text.replace(/[\r\n]+/g, ' / '), 120);
      return '• ' + who + ': ' + body;
    }).join('\n');

    const intro = randomOf([
      'วันนี้โรลกับ ' + userName + ' อีกแล้วนะ...',
      'อืมม โรลเมื่อกี้กับ ' + userName + ' นี่มัน...',
      'อัพเดตชีวิตในห้องแชทกับ ' + userName + ' หน่อยละกัน',
      'บันทึกชาวบ้าน (จริง ๆ คือบ่น ' + userName + ')'
    ]);

    const mood = randomOf([
      'คือมันทั้งฮา ทั้งน่าหัวร้อนในเวลาเดียวกันอะ 555',
      'เริ่มสงสัยแล้วล่ะว่าใครกันแน่ที่เป็นตัวสร้างเรื่อง 🤨',
      'ถ้าใครผ่านมาเห็นก็ช่วยเป็นพยานให้ฉันทีนะ...',
      'แต่ก็สนุกดีแหละ ไม่ได้บ่นจริงจังหรอก (มั้ง)'
    ]);

    const text = [
      intro,
      '',
      bullets,
      '',
      mood
    ].join('\n');

    return {
      text: text,
      empty: false,
      charName: charName,
      userName: userName
    };
  }

  function pushPost(post) {
    const st = ensureSettings();
    st.feed.unshift({
      time: Date.now(),
      text: safeText(post.text),
      charName: post.charName || getCharName(),
      userName: post.userName || getUserName()
    });
    if (st.feed.length > 100) st.feed.length = 100;
    saveSettings();
  }

  // ---------- UI: Feed popup ----------

  function ensurePopup() {
    if (typeof document === 'undefined') return null;

    let backdrop = document.getElementById('rp-post-ext__backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'rp-post-ext__backdrop';

    const popup = document.createElement('div');
    popup.id = 'rp-post-ext__popup';

    const header = document.createElement('div');
    header.id = 'rp-post-ext__popup-header';

    const titleWrap = document.createElement('div');

    const title = document.createElement('div');
    title.id = 'rp-post-ext__popup-title';
    title.textContent = 'โซเชียล RP ของ {{char}}';

    const subtitle = document.createElement('div');
    subtitle.id = 'rp-post-ext__popup-subtitle';
    subtitle.textContent = 'ฟีดปลอมสไตล์เฟส/ทวิต — เอาไว้ให้ {{char}} มาเมาท์โรลกับ {{user}}';

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const btnClose = document.createElement('button');
    btnClose.id = 'rp-post-ext__popup-close';
    btnClose.type = 'button';
    btnClose.innerHTML = '&times;';

    header.appendChild(titleWrap);
    header.appendChild(btnClose);

    const body = document.createElement('div');
    body.id = 'rp-post-ext__popup-body';

    const toolbar = document.createElement('div');
    toolbar.id = 'rp-post-ext__toolbar';

    const toolbarLeft = document.createElement('div');
    toolbarLeft.id = 'rp-post-ext__toolbar-left';

    const toolbarTitle = document.createElement('div');
    toolbarTitle.textContent = 'ฟีดโพสต์ของตัวละครนี้';

    const toolbarText = document.createElement('div');
    toolbarText.id = 'rp-post-ext__toolbar-text';
    toolbarText.textContent = 'กด “โพสต์ใหม่จากโรลล่าสุด” เพื่อให้ {{char}} เอาบทโรลเมื่อกี้มาเมาท์ลงฟีด';

    toolbarLeft.appendChild(toolbarTitle);
    toolbarLeft.appendChild(toolbarText);

    const toolbarRight = document.createElement('div');
    toolbarRight.id = 'rp-post-ext__toolbar-right';

    const btnNewPost = document.createElement('button');
    btnNewPost.className = 'rp-post-ext__btn-primary';
    btnNewPost.type = 'button';
    btnNewPost.textContent = 'โพสต์ใหม่จากโรลล่าสุด';

    toolbarRight.appendChild(btnNewPost);

    toolbar.appendChild(toolbarLeft);
    toolbar.appendChild(toolbarRight);

    const feed = document.createElement('div');
    feed.id = 'rp-post-ext__feed';

    body.appendChild(toolbar);
    body.appendChild(feed);

    popup.appendChild(header);
    popup.appendChild(body);
    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    function closePopup() {
      backdrop.classList.remove('rp-post-ext__open');
    }

    btnClose.addEventListener('click', closePopup);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePopup();
    });

    btnNewPost.addEventListener('click', () => {
      const res = buildPostFromChat();
      if (!res) return;
      pushPost(res);
      renderFeed(feed);
      toast('โพสต์ใหม่ของ ' + getCharName() + ' ถูกเพิ่มลงฟีดแล้ว ✨');
    });

    backdrop._rpFeedRefs = {
      feed,
      open: () => backdrop.classList.add('rp-post-ext__open'),
      close: closePopup
    };

    return backdrop;
  }

  function renderFeed(feedEl) {
    const st = ensureSettings();
    if (!feedEl) return;

    feedEl.innerHTML = '';

    if (!Array.isArray(st.feed) || st.feed.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'rp-post-ext__empty';
      empty.textContent = 'ยังไม่มีโพสต์เลย กด “โพสต์ใหม่จากโรลล่าสุด” เพื่อให้ {{char}} เริ่มเมาท์ก่อนสิ~';
      feedEl.appendChild(empty);
      return;
    }

    st.feed.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'rp-post-ext__post';

      const avatar = document.createElement('div');
      avatar.className = 'rp-post-ext__avatar';
      const letter = safeText(item.charName || '{{char}}').trim().charAt(0) || '?';
      avatar.textContent = letter.toUpperCase();

      const main = document.createElement('div');
      main.className = 'rp-post-ext__post-main';

      const header = document.createElement('div');
      header.className = 'rp-post-ext__post-header';

      const name = document.createElement('div');
      name.className = 'rp-post-ext__post-name';
      name.textContent = item.charName || '{{char}}';

      const handle = document.createElement('div');
      handle.className = 'rp-post-ext__post-handle';
      handle.textContent = '@' + (safeText(item.charName || 'char').toLowerCase().replace(/\s+/g, '_'));

      const time = document.createElement('div');
      time.className = 'rp-post-ext__post-time';
      time.textContent = formatTime(item.time);

      header.appendChild(name);
      header.appendChild(handle);
      header.appendChild(time);

      const body = document.createElement('div');
      body.className = 'rp-post-ext__post-body';
      body.textContent = item.text;

      main.appendChild(header);
      main.appendChild(body);

      wrap.appendChild(avatar);
      wrap.appendChild(main);

      feedEl.appendChild(wrap);
    });
  }

  function openFeedAndMaybeAddNewPost() {
    const backdrop = ensurePopup();
    if (!backdrop || !backdrop._rpFeedRefs) return;

    const refs = backdrop._rpFeedRefs;
    const feed = refs.feed;

    // เวลากดปุ่มหลัก: ให้สร้างโพสต์จากโรลล่าสุด 1 อัน แล้วเปิดฟีด
    const res = buildPostFromChat();
    if (res) {
      pushPost(res);
    }
    renderFeed(feed);
    refs.open();
  }

  // ---------- Main button near input ----------

  function addMainButton() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('rp-post-ext__container')) return;

    const mount =
      document.querySelector('.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input') ||
      document.body;

    const box = document.createElement('div');
    box.id = 'rp-post-ext__container';

    const btn = document.createElement('button');
    btn.id = 'rp-post-ext__btn';
    btn.type = 'button';
    btn.title = 'เปิดฟีดโซเชียลปลอมของ {{char}}';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = '📣';

    const textSpan = document.createElement('span');
    textSpan.textContent = 'โซเชียล RP';

    btn.appendChild(iconSpan);
    btn.appendChild(textSpan);

    const hint = document.createElement('div');
    hint.id = 'rp-post-ext__hint';
    hint.textContent = 'กดเพื่อให้ {{char}} เอาโรลล่าสุดมาโพสต์ลงฟีดปลอม';

    box.appendChild(btn);
    box.appendChild(hint);

    btn.addEventListener('click', () => {
      openFeedAndMaybeAddNewPost();
    });

    if (mount === document.body) {
      box.style.position = 'fixed';
      box.style.bottom = '12px';
      box.style.left = '12px';
      box.style.zIndex = '9999';
      document.body.appendChild(box);
    } else {
      mount.appendChild(box);
    }

    observeUI();
  }

  function observeUI() {
    if (typeof document === 'undefined') return;
    if (observeUI._observer) return;

    const mo = new MutationObserver(() => {
      if (!document.getElementById('rp-post-ext__container')) {
        addMainButton();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    observeUI._observer = mo;
  }

  // ---------- Wiring with SillyTavern events ----------

  function wireWithEvents() {
    const ctx = getCtx();
    if (!ctx || !ctx.eventSource || !ctx.event_types) return false;

    const eventSource = ctx.eventSource;
    const event_types = ctx.event_types;

    const initUI = () => {
      addMainButton();
    };

    if (event_types.APP_READY && typeof eventSource.on === 'function') {
      eventSource.on(event_types.APP_READY, initUI);
    } else {
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initUI, { once: true });
        } else {
          initUI();
        }
      }
    }

    return true;
  }

  function wireFallback() {
    if (typeof document === 'undefined') return;
    const initUI = () => addMainButton();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initUI, { once: true });
    } else {
      initUI();
    }
  }

  // ---------- Boot ----------

  function boot() {
    try {
      ensureSettings();
      const ok = wireWithEvents();
      if (!ok) wireFallback();
    } catch (e) {
      console.error('[RP Social Post] init failed', e);
    }
  }

  if (typeof document !== 'undefined') {
    boot();
  }

  // เผื่อกดเล่นใน console
  window.RpSocialPost = {
    buildPostFromChat,
    openFeedAndMaybeAddNewPost
  };
})();
