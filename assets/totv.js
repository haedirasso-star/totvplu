/* ══════════════════════════════════════════════════════════════
   TOTV+ — السكربت المشترك
   ──────────────────────────────────────────────────────────────
   ★ كل الروابط في مكان واحد. عدّلها هنا فقط وستتحدّث في كل
     صفحات الموقع تلقائياً — لا تبحث عنها داخل الصفحات.
   ══════════════════════════════════════════════════════════════ */

const TOTV = {

  /* ── روابط التواصل والدعم ─────────────────────────────── */
  links: {
    whatsapp:  'https://wa.me/9647714415816',
    email:     'mailto:totv.Support@gmail.com',

    /* ★ ضع روابطك الحقيقية هنا. اترك '' لإخفاء الزر تلقائياً. */
    telegram:         'https://t.me/O_2828',   // قناة الأخبار والتحديثات
    telegramSupport:  '',                      // حساب الدعم المباشر
    facebook:         '',
    instagram:        '',
    tiktok:           '',
    youtube:          '',

    payment: 'https://payment-totv.vercel.app/',
    ios:     'https://apps.apple.com/co/app/smarters-player-lite/id1628995509',
  },

  /* ── ملفات التحميل (GitHub Releases) ──────────────────── */
  repo:        'haedirasso-star/totvplu',
  fileAndroid: 'totvplus.apk',
  fileTV:      'totvplus.apk',   // بدّلها إلى totvplus-tv.apk عند رفع نسخة الشاشات

  get urlAndroid() { return `https://github.com/${this.repo}/releases/latest/download/${this.fileAndroid}`; },
  get urlTV()      { return `https://github.com/${this.repo}/releases/latest/download/${this.fileTV}`; },

  /* ── الباقات ──────────────────────────────────────────── */
  plans: [
    { name: 'شهر',    price: '5,000',  per: 'شهر واحد',  save: '',              popular: false },
    { name: '3 أشهر', price: '13,000', per: 'ثلاثة أشهر', save: 'توفير 2,000',   popular: true  },
    { name: 'سنة',    price: '45,000', per: 'سنة كاملة',  save: 'توفير 15,000',  popular: false },
  ],

  /* ── مفتاح البوسترات (قراءة فقط، عام) ─────────────────── */
  tmdb: '5b166a24c91f59178e8ce30f1f3735c0',
};

/* ══════════════ القائمة الجانبية ══════════════ */
function initNav() {
  const sheet = document.getElementById('sheet');
  const open  = document.getElementById('burger');
  const close = document.getElementById('sheetX');
  if (!sheet || !open) return;

  const toggle = (on) => {
    sheet.classList.toggle('open', on);
    document.body.style.overflow = on ? 'hidden' : '';
  };
  open.addEventListener('click', () => toggle(true));
  close?.addEventListener('click', () => toggle(false));
  sheet.addEventListener('click', e => { if (e.target === sheet) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
}

/* ══════════════ كشف الجهاز ══════════════
   نوجّه الزائر إلى الملف الصحيح بدل أن نجعله يخمّن.        */
function detectDevice() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android.*(TV|BRAVIA|AFT|MiBOX|SHIELD)/i.test(ua)) return 'tv';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const DEVICE_LABEL = {
  ios:     'يبدو أنك تستخدم iPhone',
  tv:      'يبدو أنك تستخدم شاشة سمارت',
  android: 'يبدو أنك تستخدم هاتف أندرويد',
  other:   'اختر جهازك',
};

/* ══════════════ شريط البوسترات ══════════════ */
async function initReel(elId, count = 16) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/trending/all/week?api_key=${TOTV.tmdb}&language=ar`);
    const d = await r.json();
    const items = (d.results || []).filter(x => x.poster_path).slice(0, count);
    if (!items.length) { el.closest('.reel')?.remove(); return; }

    const html = items.map(m =>
      `<img src="https://image.tmdb.org/t/p/w342${m.poster_path}" alt="${
        (m.title || m.name || '').replace(/"/g, '')}" loading="lazy" decoding="async">`).join('');
    el.innerHTML = html + html;   // مضاعفة للدوران السلس
  } catch (_) {
    el.closest('.reel')?.remove();
  }
}

/* ══════════════ ظهور تدريجي عند التمرير ══════════════ */
function initRise() {
  const els = document.querySelectorAll('.rise');
  if (!els.length) return;

  const revealAll = () => els.forEach(e => e.classList.add('in'));

  // بلا IntersectionObserver أو مع تفضيل تقليل الحركة ⇒ أظهر كل شيء فوراً
  if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealAll(); return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: .05, rootMargin: '0px 0px -30px' });
  els.forEach(e => io.observe(e));

  // ★ شبكة أمان: مهما حدث، لا يبقى المحتوى مخفياً بعد ثانيتين
  setTimeout(revealAll, 2000);
}

/* ══════════════ الأزرار العائمة ══════════════ */
function initFloat() {
  const box = document.getElementById('float');
  if (!box) return;
  const L = TOTV.links;
  let h = `<a href="${L.whatsapp}" class="f-wa" target="_blank" rel="noopener"
             aria-label="تواصل عبر واتساب"><i class="fab fa-whatsapp"></i></a>`;
  if (L.telegram) h += `<a href="${L.telegram}" class="f-tg" target="_blank" rel="noopener"
             aria-label="قناة تلجرام"><i class="fab fa-telegram-plane"></i></a>`;
  box.innerHTML = h;
}

/* ══════════════ تعليم الصفحة الحالية ══════════════ */
function markActive() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .sheet-in a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href === here || (here === 'index.html' && href === './')) a.classList.add('on');
  });
}

/* ★ يُفعّل إخفاء عناصر الحركة — قبله كل شيء ظاهر بشكل طبيعي */
document.documentElement.classList.add('anim');

document.addEventListener('DOMContentLoaded', () => {
  initNav(); initRise(); initFloat(); markActive();
});

/* ضمان أخير عند اكتمال تحميل الصفحة */
window.addEventListener('load', () =>
  document.querySelectorAll('.rise').forEach(e => e.classList.add('in')));
