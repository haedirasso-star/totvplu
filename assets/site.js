/* ════════════════════════════════════════════════════════════════
   توتيفي TOTV+ — سكربت الموقع
   ★ الروابط والباقات تُعدَّل من site.config.json (وليس من هنا).
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const REL = window.TOTV_REL || {};
  const CFG = window.TOTV_CFG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const track = (name, p) => { try { window.gtag && gtag('event', name, p || {}); } catch (_) {} };

  /* ── القائمة الجانبية ── */
  const sheet = $('#sheet');
  if (sheet) {
    const set = on => { sheet.classList.toggle('open', on); document.body.style.overflow = on ? 'hidden' : ''; };
    $('#burger')?.addEventListener('click', () => set(true));
    $('#sheetX')?.addEventListener('click', () => set(false));
    sheet.addEventListener('click', e => { if (e.target === sheet) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }

  /* ── الجهاز والمتصفح ── */
  const ua = navigator.userAgent || '';
  const device =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' :
    /Android.*(TV|BRAVIA|AFT|MiBOX|SHIELD|Smart|BOX)/i.test(ua) || /AFT[A-Z]/.test(ua) ? 'tv' :
    /Android/i.test(ua) ? 'android' : 'desktop';
  // متصفحات داخل التطبيقات (فيسبوك، إنستغرام، تيك توك، سناب) تمنع التنزيل غالباً
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|musical_ly|BytedanceWebview|TikTok|Snapchat|\bLine\//i.test(ua)
             || (/Android/.test(ua) && /; wv\)/.test(ua));
  // متصفحات لا تحفظ التنزيل من داخل الصفحة بشكل موثوق ⇒ تنزيل مباشر
  const directOnly = /UCBrowser|Opera Mini|OPiOS|MiuiBrowser|HeyTapBrowser/i.test(ua)
             || !('ReadableStream' in window) || !('download' in document.createElement('a'))
             || (navigator.deviceMemory && navigator.deviceMemory < 1);

  const cnt = (n, one, few) => n === 1 ? one : n === 2 ? (one === 'دقيقة' ? 'دقيقتان' : 'ثانيتان') : `${n} ${n <= 10 ? few : one}`;
  const MB = b => (b / 1048576).toLocaleString('en', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  /* ════════════════════════════════════════════════════════════
     تذكرة التحميل
     ════════════════════════════════════════════════════════════ */
  const LABEL = {
    android: { t: 'تحميل التطبيق لأندرويد', icon: 'i-android' },
    tv:      { t: 'تحميل نسخة الشاشات',     icon: 'i-tv' },
  };
  const WHO = {
    android: 'هاتفك أندرويد — هذه النسخة المناسبة لك.',
    tv: 'تبدو شاشة سمارت — هذه نسخة الريموت المناسبة لها.',
    desktop: 'التطبيق لهواتف أندرويد وشاشات السمارت. حمّله هنا وانقله، أو افتح الموقع من هاتفك.',
    ios: '',
  };

  function sub(r) {
    if (!r) return 'الملف غير متاح حالياً — راسل الدعم';
    return `${r.ver ? 'الإصدار ' + r.ver + ' — ' : ''}${r.size ? MB(r.size) + ' ميغابايت' : 'ملف APK'}`;
  }

  function mount(box) {
    const tkt = $('.tkt', box), t = $('.tkt-t', tkt), s = $('.tkt-s', tkt), use = $('.tkt-stub use', tkt);
    const after = $('[data-after]', box), who = $('[data-who]', box);
    let kind = box.dataset.kind || (device === 'tv' ? 'tv' : 'android');
    let blobUrl = null, ctl = null, state = 'idle';

    if (device === 'ios' && !box.dataset.kind) { iosView(box); return; }
    if (inApp && device !== 'desktop') inAppNotice(box);
    if (who && !box.dataset.kind) who.textContent = WHO[device] || '';

    const paint = () => {
      const r = REL[kind];
      t.textContent = LABEL[kind].t; s.textContent = sub(r);
      use.setAttribute('href', '#' + LABEL[kind].icon);
      tkt.href = r ? r.href : (CFG.whatsapp || '#');
      $$('[data-switch]', box).forEach(a => a.hidden = a.dataset.switch === kind);
    };
    paint();

    $$('[data-switch]', box).forEach(a => a.addEventListener('click', e => {
      e.preventDefault(); if (state === 'busy') return;
      kind = a.dataset.switch; reset(); paint();
    }));

    function reset() {
      state = 'idle'; tkt.classList.remove('busy', 'done'); tkt.style.setProperty('--p', 0);
      after.classList.remove('on'); if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    }

    function save(url) {
      const a = document.createElement('a');
      a.href = url; a.download = REL[kind]?.name || 'TOTVplus.apk';
      document.body.appendChild(a); a.click(); a.remove();
    }

    function showAfter(mode) {
      after.innerHTML = mode === 'direct'
        ? `<h3>بدأ التنزيل من المتصفح</h3>
           <ol><li>اسحب شريط الإشعارات للأسفل لترى تقدّم التنزيل.</li>
           <li>عند اكتماله اضغط على الملف ثم <b>تثبيت</b>.</li>
           <li>إن طلب الهاتف إذناً اضغط <b>الإعدادات</b> وفعّل <b>السماح من هذا المصدر</b>.</li></ol>
           <p class="dl-alt">لم يبدأ شيء؟ <a href="${REL[kind]?.href || '#'}" download>اضغط هنا للتنزيل مباشرة</a></p>`
        : `<h3>اكتمل التنزيل — بقيت خطوة التثبيت</h3>
           <ol><li>اضغط <b>فتح</b> في الشريط الذي ظهر أسفل الشاشة، أو افتح الملف من الإشعارات.</li>
           <li>اضغط <b>تثبيت</b>. إن طلب الهاتف إذناً اضغط <b>الإعدادات</b> وفعّل <b>السماح من هذا المصدر</b>.</li>
           <li>افتح التطبيق وسجّل الدخول بحساب Google ثم أدخل كود التفعيل.</li></ol>
           <p class="dl-alt">لا تجد الملف؟ <a href="#" data-again>احفظه مرة أخرى</a> أو افتح تطبيق <b>الملفات</b> ثم <b>التنزيلات</b>.</p>`;
      after.classList.add('on');
      $('[data-again]', after)?.addEventListener('click', e => { e.preventDefault(); blobUrl && save(blobUrl); });
    }

    function direct(reason) {
      const r = REL[kind]; if (!r) { location.href = CFG.whatsapp; return; }
      track('download_direct', { kind, reason });
      reset(); location.href = r.href; showAfter('direct');
    }

    tkt.addEventListener('click', async e => {
      const r = REL[kind];
      if (!r) return;                         // يفتح رابط الدعم كما هو
      e.preventDefault();
      if (state === 'busy') return;
      if (state === 'done' && blobUrl) { save(blobUrl); return; }
      track('download_start', { kind, device });
      if (directOnly || device === 'tv') return direct('browser');

      state = 'busy'; tkt.classList.add('busy'); after.classList.remove('on');
      use.setAttribute('href', '#i-spin'); use.parentElement.classList.add('spin');
      t.textContent = 'جارٍ التنزيل… 0%'; s.textContent = 'لا تغلق الصفحة حتى يكتمل';
      ctl = new AbortController();
      try {
        const res = await fetch(r.href, { signal: ctl.signal });
        if (!res.ok || !res.body) throw new Error('http ' + res.status);
        const total = +res.headers.get('content-length') || r.size || 0;
        const reader = res.body.getReader(); const parts = []; let got = 0, last = 0;
        const t0 = performance.now();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.length;
          const now = performance.now();
          if (now - last > 120) {
            last = now;
            const pct = total ? Math.min(99, Math.floor(got / total * 100)) : 0;
            const sp = got / Math.max(1, (now - t0) / 1000);
            const left = total && sp > 0 ? Math.ceil((total - got) / sp) : 0;
            tkt.style.setProperty('--p', pct);
            t.textContent = total ? `جارٍ التنزيل… ${pct}%` : 'جارٍ التنزيل…';
            s.textContent = `${MB(got)}${total ? ' من ' + MB(total) : ''} ميغابايت`
              + (left > 2 ? ` — باقٍ ${left < 60 ? cnt(left, 'ثانية', 'ثوانٍ') : cnt(Math.ceil(left / 60), 'دقيقة', 'دقائق')}` : '');
          }
        }
        if (total && got < total * .98) throw new Error('short');
        blobUrl = URL.createObjectURL(new Blob(parts, { type: 'application/vnd.android.package-archive' }));
        save(blobUrl);
        state = 'done'; tkt.classList.remove('busy'); tkt.classList.add('done'); tkt.style.setProperty('--p', 100);
        use.parentElement.classList.remove('spin'); use.setAttribute('href', '#i-check');
        t.textContent = 'تم التنزيل'; s.textContent = 'اضغط هنا إن أردت حفظه مرة أخرى';
        showAfter('blob'); track('download_done', { kind });
      } catch (err) {
        use.parentElement.classList.remove('spin');
        if (err.name === 'AbortError') { reset(); paint(); return; }
        direct('fetch_fail');
        use.setAttribute('href', '#' + LABEL[kind].icon); paint();
      }
    });
  }

  function iosView(box) {
    const I = CFG.ios || {};
    if (!I.app) { box.innerHTML = '<div class="notice"><p>نسخة الآيفون قيد التطوير.</p></div>'; return; }
    box.innerHTML = `<div class="notice">
      <p><b>على الآيفون تشاهد عبر تطبيق ${I.appName}.</b> ثبّته، ثم اكتب الكود <span class="code">${I.code}</span>
      واطلب بيانات اشتراكك من واتساب.</p>
      <div class="dl-row">
        <a class="btn btn-gold" href="${I.app}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-apple"/></svg>تحميل ${I.appName}</a>
        <a class="btn btn-line" href="/guide.html#ios">الشرح خطوة بخطوة</a>
      </div></div>`;
  }

  function inAppNotice(box) {
    const here = location.href.replace(/^https?:\/\//, '');
    const n = document.createElement('div');
    n.className = 'notice'; n.style.marginBottom = '14px';
    n.innerHTML = `<p><b>أنت تتصفّح من داخل تطبيق آخر</b>، وهذا يمنع التنزيل غالباً.
      افتح الصفحة في متصفّح Chrome ثم اضغط زر التحميل.</p>
      <div class="dl-row">
        <a class="btn btn-gold" href="intent://${here}#Intent;scheme=https;package=com.android.chrome;end">افتح في Chrome</a>
        <button class="btn btn-line" type="button" data-copy>انسخ الرابط</button>
      </div>`;
    box.prepend(n);
    $('[data-copy]', n).addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(location.href); ev.target.textContent = 'تم النسخ'; } catch (_) { prompt('انسخ الرابط:', location.href); }
    });
  }

  // زائر الآيفون: قسم الآيفون أولاً في صفحة التحميل
  const iosSec = $('#ios-sec');
  if (device === 'ios' && iosSec) { iosSec.parentElement.prepend(iosSec); iosSec.firstElementChild.style.marginTop = '0'; }

  $$('[data-dl]').forEach(mount);

  /* ════════════════════════════════════════════════════════════
     الأوقات بتوقيت الزائر + حالة المباراة + العدّاد
     ════════════════════════════════════════════════════════════ */
  const LOC = 'ar-u-nu-latn';
  const fmt = {
    clock: new Intl.DateTimeFormat(LOC, { hour: 'numeric', minute: '2-digit' }),
    date: new Intl.DateTimeFormat(LOC, { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  const nowS = () => Date.now() / 1000;
  $$('[data-ts]').forEach(el => {
    const ts = +el.dataset.ts, d = new Date(ts * 1000);
    const f = el.dataset.f;
    if (f === 'clock') {
      const parts = fmt.clock.formatToParts(d);
      const hm = parts.filter(p => p.type !== 'dayPeriod').map(p => p.value).join('').trim();
      const ap = parts.find(p => p.type === 'dayPeriod')?.value || '';
      const c = $('.mt-clock', el) || el; const a = $('.mt-ampm', el);
      if (a) { c.textContent = hm; a.textContent = ap; } else el.textContent = fmt.clock.format(d);
    } else if (f === 'date') el.textContent = fmt.date.format(d);
  });

  const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];
  $$('[data-st]').forEach(el => {
    const ts = +el.dataset.ts, st = el.dataset.st, n = nowS();
    if (['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(st)) return;
    if (LIVE.includes(st) || (n >= ts && n < ts + 115 * 60)) { el.className = 'tag live'; el.textContent = 'مباشر'; }
    else if (n >= ts + 115 * 60) { el.className = 'tag ft'; el.textContent = 'انتهت'; }
  });

  $$('[data-cd]').forEach(el => {
    const ts = +el.dataset.cd;
    const tick = () => {
      let s = Math.floor(ts - nowS());
      if (s <= 0) { el.innerHTML = '<span class="tag live">مباشر الآن</span>'; return; }
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
      const box = (v, l) => `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`;
      el.innerHTML = (d ? box(d, 'يوم') : '') + box(h, 'ساعة') + box(m, 'دقيقة') + box(s, 'ثانية');
      setTimeout(tick, 1000);
    };
    tick();
  });

  /* ── الإعلانات المتبدّلة ── */
  $$('[data-promo]').forEach(box => {
    const slides = $$('.promo-s', box), dots = $$('.promo-dots button', box);
    if (slides.length < 2) return;
    let i = 0, timer;
    const go = n => {
      slides[i].classList.remove('on'); dots[i]?.removeAttribute('aria-current');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('on');
      if (dots[i]) { dots[i].setAttribute('aria-current', 'true'); const b = dots[i].firstElementChild; b.style.animation = 'none'; b.offsetWidth; b.style.animation = ''; }
      clearTimeout(timer); timer = setTimeout(() => go(i + 1), 6000);
    };
    dots.forEach((d, n) => d.addEventListener('click', () => go(n)));
    let x0 = null;
    box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx > 0 ? 1 : -1)); x0 = null; });
    timer = setTimeout(() => go(1), 6000);
  });

  /* ── التبويبات (دليل التثبيت) ── */
  $$('[role="tablist"]').forEach(list => {
    const tabs = $$('[role="tab"]', list);
    const pick = tab => {
      tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls')).hidden = !on; });
      history.replaceState(null, '', '#' + tab.dataset.k);
    };
    tabs.forEach(t => t.addEventListener('click', () => pick(t)));
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;   // اتجاه عربي
      if (step) { const n = tabs[(i + step + tabs.length) % tabs.length]; n.focus(); pick(n); }
    });
    const want = location.hash.slice(1) || (device === 'tv' ? 'tv' : device === 'ios' ? 'ios' : '');
    const t0 = tabs.find(t => t.dataset.k === want); if (t0) pick(t0);
  });
})();
