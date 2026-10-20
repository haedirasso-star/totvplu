// ════════════════════════════════════════════════════════════════
//  توتيفي TOTV+ — بناء الموقع
//  يقرأ صفحات المصدر (pages/*.html) ويركّب عليها الترويسة
//  والتذييل، ثم يولّد صفحات المباريات وخريطة الموقع، وينسخ ملف
//  التطبيق من آخر إصدار ليُحمَّل من نطاق الموقع نفسه.
//  التشغيل: node scripts/build.mjs        المخرجات: _site/
//  بلا مكتبات خارجية — Node 20+
// ════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const CACHE = path.join(ROOT, '.cache');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const FAQ = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/faq.json'), 'utf8'));
const SITE = cfg.site.replace(/\/+$/, '');
const TZ = cfg.matches?.timezone || 'Asia/Baghdad';
const NOW = Math.floor(Date.now() / 1000);
const L = cfg.links;
const log = (...a) => console.log('•', ...a);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const write = (rel, data) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const waLink = L.whatsapp || '#';
const mailto = L.email ? `mailto:${L.email}` : '';

async function get(url, opt = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 60000) });
      if (r.ok) return r;
      if (r.status === 404) return null;
    } catch (e) { if (i === tries - 1) log('تعذّر:', url.split('?')[0], e.message); }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
// 1) ملف التطبيق من آخر إصدار
// ════════════════════════════════════════════════════════════════
const REL = {};
async function release() {
  const repo = process.env.GITHUB_REPOSITORY;
  const tok = process.env.GITHUB_TOKEN;
  if (process.env.MOCK_REL) {               // للتجربة المحلية فقط
    write('dl/totvplus-test.apk', Buffer.alloc(6 * 1048576, 7));
    REL.android = { href: '/dl/totvplus-test.apk', size: 6 * 1048576, ver: '2.8', name: 'TOTVplus.apk', date: NOW };
    REL.tv = { ...REL.android, shared: true };
    return;
  }
  if (!repo) { log('لا يوجد مستودع (تشغيل محلي) — بلا ملف تطبيق'); return; }
  const h = { Accept: 'application/vnd.github+json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
  const r = await get(`https://api.github.com/repos/${repo}/releases/latest`, { headers: h });
  if (!r) { log('⚠️ لا يوجد إصدار منشور'); return; }
  const rel = await r.json();
  const ver = String(rel.tag_name || '').replace(/^v/i, '');
  const date = Math.floor(new Date(rel.published_at || Date.now()) / 1000);
  for (const kind of ['android', 'tv']) {
    const want = cfg.files?.[kind];
    const a = (rel.assets || []).find(x => x.name === want);
    if (!a) continue;
    const base = want.replace(/\.apk$/i, '');
    const file = `${base}-${(rel.tag_name || 'latest').replace(/[^\w.-]/g, '')}.apk`;
    const cached = path.join(CACHE, 'dl', `${a.id}-${a.size}.apk`);
    if (!fs.existsSync(cached)) {
      log('تنزيل', a.name, (a.size / 1048576).toFixed(1), 'MB');
      const d = await get(a.browser_download_url, { timeout: 600000 });
      if (!d) { log('⚠️ فشل تنزيل', a.name); continue; }
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, Buffer.from(await d.arrayBuffer()));
    }
    fs.mkdirSync(path.join(OUT, 'dl'), { recursive: true });
    fs.copyFileSync(cached, path.join(OUT, 'dl', file));
    REL[kind] = { href: `/dl/${file}`, size: a.size, ver, date,
                  name: kind === 'tv' ? 'TOTV-Smart.apk' : 'TOTVplus.apk' };
  }
  if (!REL.tv && REL.android) REL.tv = { ...REL.android, shared: true };
  // تنظيف الكاش القديم
  const keep = new Set(Object.values(REL).map(x => x.href));
  log('الإصدار', rel.tag_name, Object.keys(REL).join('+'), keep.size, 'ملف');
}

// ════════════════════════════════════════════════════════════════
// 2) المباريات
// ════════════════════════════════════════════════════════════════
const ARCH_P = path.join(CACHE, 'archive.json');
let FEED = null, ARCH = {};
const PROMOS = [];
try { ARCH = JSON.parse(fs.readFileSync(ARCH_P, 'utf8')); } catch (_) {}

async function feed() {
  const url = process.env.FEED_URL || cfg.feed;
  if (!url) { log('لا يوجد FEED_URL — بلا مباريات جديدة'); return; }
  const r = await get(url);
  if (!r) return;
  FEED = await r.json();
  const base = url.replace(/[^/]*$/, '');
  const chMap = FEED.channels || {};
  for (const m of FEED.matches || []) {
    const lg = FEED.leagues?.[m.lg] || {};
    ARCH[m.id] = {
      id: m.id, ts: m.ts, st: m.st, rd: m.rd || '', venue: m.venue || '', imp: !!m.imp,
      gh: m.gh ?? null, ga: m.ga ?? null,
      lg: m.lg, lgAr: lg.ar || '', lgOrder: lg.order ?? 99, lgLogo: lg.logo ? await img(base, lg.logo) : '',
      h: { n: m.h.n, ar: m.h.ar || m.h.n, logo: m.h.logo ? await img(base, m.h.logo) : '' },
      a: { n: m.a.n, ar: m.a.ar || m.a.n, logo: m.a.logo ? await img(base, m.a.logo) : '' },
      ch: (m.ch && m.ch.length ? m.ch : chMap[m.lg] || chMap.default || []).slice(0, 6),
      poster: m.poster ? await img(base, m.poster) : (ARCH[m.id]?.poster || ''),
      seen: NOW,
    };
  }
  // الإعلانات الرياضية (نفس صور قسم الرياضة في التطبيق)
  for (const p of FEED.promos || []) {
    if (!p.img) continue;
    if (p.until && p.until < NOW) continue;
    const src = await img(base, p.img);
    if (src) PROMOS.push({ src, title: p.title || '', fx: p.fx || 0, ts: p.ts || 0 });
  }
  log('المباريات من الخلاصة:', (FEED.matches || []).length, '— الإعلانات:', PROMOS.length);
}

// نسخ الشعارات والبوسترات إلى الموقع نفسه (مع كاش بين التشغيلات)
const imgDone = new Map();
async function img(base, rel) {
  if (imgDone.has(rel)) return imgDone.get(rel);
  const local = path.join(CACHE, 'img', rel);
  let ok = fs.existsSync(local);
  if (!ok) {
    const r = await get(base + rel, { timeout: 20000 }, 2);
    if (r) { fs.mkdirSync(path.dirname(local), { recursive: true }); fs.writeFileSync(local, Buffer.from(await r.arrayBuffer())); ok = true; }
  }
  const out = ok ? '/img/' + rel : '';
  imgDone.set(rel, out);
  return out;
}

// ── أدوات التاريخ ──
const dayKey = (ts, tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000));
const LOC = 'ar-u-nu-latn';
const fDate = (ts, tz = TZ) => new Intl.DateTimeFormat(LOC, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts * 1000));
const fDateY = ts => new Intl.DateTimeFormat(LOC, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts * 1000));
const fClockParts = (ts, tz = TZ) => {
  const p = new Intl.DateTimeFormat(LOC, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ts * 1000));
  return { hm: p.filter(x => x.type !== 'dayPeriod').map(x => x.value).join('').trim(), ap: p.find(x => x.type === 'dayPeriod')?.value || '' };
};
const fClock = (ts, tz) => { const c = fClockParts(ts, tz); return `${c.hm} ${c.ap}`.trim(); };
const isoAt = (ts, tz = TZ) => {
  const d = new Date(ts * 1000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((asUTC - d.getTime()) / 60000);
  const sg = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sg}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};
const TODAY = dayKey(NOW);
const TOMORROW = dayKey(NOW + 86400);
const YESTERDAY = dayKey(NOW - 86400);
const relDay = ts => { const k = dayKey(ts); return k === TODAY ? 'اليوم' : k === TOMORROW ? 'غداً' : k === YESTERDAY ? 'أمس' : ''; };

const DONE = ['FT', 'AET', 'PEN'];
const OFF = { PST: 'مؤجّلة', CANC: 'ملغاة', ABD: 'متوقفة', SUSP: 'معلّقة', AWD: 'قرار إداري', WO: 'انسحاب' };
const LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];
const finished = m => DONE.includes(m.st) || (!OFF[m.st] && NOW > m.ts + 3 * 3600);
const hasScore = m => m.gh != null && m.ga != null;

function roundAr(rd) {
  if (!rd) return '';
  let m;
  if ((m = rd.match(/^Regular Season\s*-\s*(\d+)/i))) return `الجولة ${m[1]}`;
  if ((m = rd.match(/^League Stage\s*-\s*(\d+)/i))) return `مرحلة الدوري، الجولة ${m[1]}`;
  if ((m = rd.match(/^Group\s+([A-Z])\s*-\s*(\d+)/i))) return `المجموعة ${m[1]}، الجولة ${m[2]}`;
  if ((m = rd.match(/^Group Stage\s*-\s*(\d+)/i))) return `دور المجموعات، الجولة ${m[1]}`;
  const map = { 'round of 32': 'دور الـ32', 'round of 16': 'دور الـ16', '8th finals': 'دور الـ16', 'quarter-finals': 'ربع النهائي',
    'semi-finals': 'نصف النهائي', 'final': 'النهائي', '3rd place final': 'مباراة المركز الثالث', 'knockout round play-offs': 'الملحق' };
  return map[rd.toLowerCase()] || '';
}
const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mUrl = m => `/m/${m.id}-${slug(m.h.n)}-vs-${slug(m.a.n)}.html`;
const weight = m => (m.imp ? 0 : 1000) + (m.lgOrder ?? 99) * 10;

function teamImg(t, cls = '') {
  return t.logo ? `<img src="${t.logo}" alt="" width="24" height="24" loading="lazy" decoding="async"${cls}>` : '<span class="ph"></span>';
}
function statusTag(m) {
  if (OFF[m.st]) return `<span class="tag off">${OFF[m.st]}</span>`;
  if (finished(m)) return `<span class="tag ft">انتهت</span>`;
  if (LIVE.includes(m.st)) return `<span class="tag live" data-st="${m.st}" data-ts="${m.ts}">مباشر</span>`;
  return `<span class="tag" data-st="${m.st}" data-ts="${m.ts}">${m.st === 'TBD' ? 'الموعد يُحدَّد' : 'لم تبدأ'}</span>`;
}

function ticket(m) {
  const score = finished(m) && hasScore(m);
  const c = fClockParts(m.ts);
  const left = score
    ? `<span class="mt-score">${m.gh} - ${m.ga}</span><span class="mt-ampm">النتيجة</span>`
    : `<span class="mt-clock">${c.hm}</span><span class="mt-ampm">${c.ap}</span>`;
  return `<a class="mt" href="${mUrl(m)}">
  <div class="mt-time"${score ? '' : ` data-ts="${m.ts}" data-f="clock"`}>${left}</div>
  <div class="mt-body">
    <div class="mt-team">${teamImg(m.h)}<span class="nm">${esc(m.h.ar)}</span></div>
    <div class="mt-team">${teamImg(m.a)}<span class="nm">${esc(m.a.ar)}</span></div>
  </div>
  <div class="mt-meta"><span class="lg">${esc(m.lgAr)}</span>${statusTag(m)}</div>
</a>`;
}

function bigCard(m, { link = true, cd = true } = {}) {
  const score = finished(m) && hasScore(m);
  const tag = link ? 'a' : 'div';
  const t = (x) => x.logo ? `<img src="${x.logo}" alt="${esc(x.ar)}" width="64" height="64">` : '<span class="ph"></span>';
  return `<${tag} class="big"${link ? ` href="${mUrl(m)}"` : ''}>
  <div class="big-top"><span>${esc(m.lgAr)}${roundAr(m.rd) ? '، ' + roundAr(m.rd) : ''}</span>${statusTag(m)}</div>
  <div class="big-mid">
    <div>${t(m.h)}<div class="nm">${esc(m.h.ar)}</div></div>
    <div class="big-vs">${score ? `<span dir="ltr">${m.gh} - ${m.ga}</span><small>النتيجة النهائية</small>`
      : `<span data-ts="${m.ts}" data-f="clock">${fClock(m.ts)}</span><small data-ts="${m.ts}" data-f="date">${fDate(m.ts)}</small>`}</div>
    <div>${t(m.a)}<div class="nm">${esc(m.a.ar)}</div></div>
  </div>
  ${!score && cd && m.ts > NOW && !OFF[m.st] ? `<div class="big-bot"><div class="cd" data-cd="${m.ts}"></div></div>` : ''}
</${tag}>`;
}

// ════════════════════════════════════════════════════════════════
// 3) أجزاء مشتركة
// ════════════════════════════════════════════════════════════════
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="i-android" viewBox="0 0 24 24"><path d="M4.5 10.5h15v8a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path fill-rule="evenodd" d="M4.5 9.5a7.5 6.5 0 0 1 15 0zm4.25-2.75a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6.5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/><path d="M7.2 2.4l1.6 2.6M16.8 2.4l-1.6 2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></symbol>
<symbol id="i-tv" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></g></symbol>
<symbol id="i-apple" viewBox="0 0 24 24"><path d="M16.4 12.6c0-2.4 2-3.5 2.1-3.6a4.5 4.5 0 0 0-3.5-1.9c-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8A4.7 4.7 0 0 0 4.2 9.6c-1.7 2.9-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.1-1.2 2.9-2.4a10 10 0 0 0 1.3-2.7 4.2 4.2 0 0 1-2.6-4zM14 5.4A4.2 4.2 0 0 0 15 2.3a4.3 4.3 0 0 0-2.8 1.4 4 4 0 0 0-1 3 3.5 3.5 0 0 0 2.8-1.3z"/></symbol>
<symbol id="i-wa" viewBox="0 0 24 24"><path d="M3.2 20.8l1.3-4.4A8.8 8.8 0 1 1 8 19.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.1 7.9c.3-.4.8-.4 1 0l.8 1.8c.1.3 0 .6-.2.8l-.5.5a5.6 5.6 0 0 0 2.7 2.7l.5-.5c.2-.2.5-.3.8-.2l1.8.8c.4.2.4.7 0 1-.9.8-2.1 1-3.4.4a8.7 8.7 0 0 1-4.2-4.2c-.6-1.2-.4-2.4.5-3.1z"/></symbol>
<symbol id="i-tg" viewBox="0 0 24 24"><path d="M21.2 3.6L2.9 10.8c-.9.4-.9 1.6.1 1.9l4.6 1.5 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.5 4.7 3.5c.7.5 1.6.1 1.8-.7l3-15.4c.2-1-.8-1.8-1.9-1.4zM9.6 14l8.2-7.3-6.7 8.6-.4 3.1z"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></g></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-spin" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
<symbol id="i-card" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h4"/></g></symbol>
</svg>`;

const NAV = [
  ['/', 'الرئيسية'], ['/matches.html', 'المباريات'], ['/download.html', 'التحميل'],
  ['/guide.html', 'طريقة التثبيت'], ['/faq.html', 'الأسئلة'], ['/support.html', 'الدعم'],
];

function header(here) {
  const links = NAV.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="توتيفي — الرئيسية"><img src="/Icon-192.png" alt="" width="34" height="34">توتيفي <b><bdi>TOTV+</bdi></b></a>
  <nav class="nav" aria-label="القائمة">${links}</nav>
  <a class="btn btn-gold cta-s" href="/download.html">حمّل التطبيق</a>
  <button class="burger" id="burger" aria-label="فتح القائمة"><svg class="ic"><use href="#i-menu"/></svg></button>
</div></header>
<div class="sheet" id="sheet"><nav aria-label="القائمة">
  <button class="x" id="sheetX" aria-label="إغلاق"><svg class="ic"><use href="#i-x"/></svg></button>${links}
</nav></div>`;
}

function footer() {
  const soc = [['telegram', 'قناة تلجرام'], ['facebook', 'فيسبوك'], ['instagram', 'إنستغرام'], ['tiktok', 'تيك توك'], ['youtube', 'يوتيوب']]
    .filter(([k]) => L[k]).map(([k, t]) => `<a href="${L[k]}" target="_blank" rel="noopener">${t}</a>`).join('');
  return `<footer class="foot"><div class="wrap">
  <div class="foot-g">
    <div>
      <a class="brand" href="/"><img src="/Icon-192.png" alt="" width="34" height="34">توتيفي <b><bdi>TOTV+</bdi></b></a>
      <p style="max-width:40ch">أفلام ومسلسلات ومباريات على هاتفك وشاشتك. تفعيل بكود واحد، ودعم يردّ خلال دقائق.</p>
    </div>
    <div><h4>الموقع</h4><nav>${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav></div>
    <div><h4>تواصل</h4><nav>
      <a href="${waLink}" target="_blank" rel="noopener">واتساب الدعم</a>
      ${mailto ? `<a href="${mailto}">البريد الإلكتروني</a>` : ''}${soc}
    </nav></div>
  </div>
  <div class="foot-b"><span>© ${new Date().getFullYear()} توتيفي <bdi>TOTV+</bdi></span><span>totv.app هو الموقع الرسمي الوحيد لتحميل التطبيق</span></div>
</div></footer>
<a class="fab-wa" href="${waLink}" target="_blank" rel="noopener" aria-label="تواصل معنا عبر واتساب"><svg class="ic"><use href="#i-wa"/></svg></a>`;
}

function layout(meta, body) {
  const url = SITE + (meta.path === '/' ? '/' : meta.path);
  const ld = (meta.ld || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');
  const ga = cfg.analytics ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.analytics}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${cfg.analytics}');</script>` : '';
  const cfgJs = { whatsapp: L.whatsapp, telegram: L.telegram, ios: cfg.ios || {}, plans: cfg.plans.map(p => p.name) };
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${meta.noindex ? 'noindex' : 'index, follow, max-image-preview:large'}">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="${meta.ogType || 'website'}">
<meta property="og:site_name" content="توتيفي TOTV+">
<meta property="og:locale" content="ar_IQ">
<meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">
<meta property="og:description" content="${esc(meta.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${meta.image ? SITE + meta.image : SITE + '/Icon-512.png'}">
<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">
<link rel="icon" type="image/png" sizes="32x32" href="/Icon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/Icon-16.png">
<link rel="apple-touch-icon" href="/Icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@500;600;700&display=swap">
<link rel="stylesheet" href="/assets/site.css?v=${BUILD}">
${ga}
${ld}
</head>
<body>
${SPRITE}
${header(meta.nav || meta.path)}
<main>
${body}
</main>
${footer()}
<script>window.TOTV_REL=${JSON.stringify(REL)};window.TOTV_CFG=${JSON.stringify(cfgJs)};</script>
<script src="/assets/site.js?v=${BUILD}" defer></script>
</body>
</html>
`;
}
const BUILD = NOW.toString(36);

// ── عناصر قابلة للإدراج في الصفحات ──
function dlWidget(kind) {
  const r = REL[kind || 'android'];
  const k = kind || 'android';
  const sz = r?.size ? `${(r.size / 1048576).toFixed(1)} ميغابايت` : 'ملف APK';
  return `<div class="dl" data-dl${kind ? ` data-kind="${kind}"` : ''}>
  <p class="dl-who" data-who></p>
  <a class="tkt" href="${r ? r.href : waLink}"${r ? ' download' : ''}>
    <span class="tkt-fill"></span>
    <span class="tkt-stub"><svg class="ic"><use href="#i-${k === 'tv' ? 'tv' : 'android'}"/></svg></span>
    <span class="tkt-body"><span class="tkt-t">${k === 'tv' ? 'تحميل نسخة الشاشات' : 'تحميل التطبيق لأندرويد'}</span>
    <span class="tkt-s">${r?.ver ? `الإصدار ${esc(r.ver)} — ` : ''}${sz}</span></span>
  </a>
  ${kind ? '' : `<p class="dl-alt"><a href="#" data-switch="tv">تحميل نسخة الشاشات</a><a href="#" data-switch="android" hidden>تحميل نسخة الهاتف</a><a href="/guide.html">طريقة التثبيت</a></p>`}
  <div class="after" data-after aria-live="polite"></div>
</div>`;
}

function plansHtml() {
  return `<div class="plans">${cfg.plans.map(p => `<div class="plan${p.popular ? ' pop' : ''}">
  <div class="plan-n"><span>${esc(p.name)}</span>${p.popular ? '<span class="pop-b">الأكثر طلباً</span>' : ''}</div>
  <div class="plan-p">${esc(p.price)}<small>${esc(cfg.currency || '')}</small></div>
  <div class="mute">${esc(p.per)}</div>
  <div class="plan-s">${esc(p.save)}</div>
  <a class="btn ${p.popular ? 'btn-gold' : 'btn-line'}" href="/download.html">حمّل التطبيق واشترك</a>
</div>`).join('')}</div>`;
}

function faqHtml(which) {
  const groups = which === 'top'
    ? [{ group: '', items: FAQ.flatMap(g => g.items.filter(i => i[2])) }]
    : FAQ;
  return groups.map(g => `<div class="faq-g">${g.group ? `<h2>${esc(g.group)}</h2>` : ''}<div class="faq">${g.items.map(([q, a]) =>
    `<details><summary>${esc(q)}</summary><div class="a">${esc(a)}</div></details>`).join('')}</div></div>`).join('');
}
const faqLd = which => ({ '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: (which === 'top' ? FAQ.flatMap(g => g.items.filter(i => i[2])) : FAQ.flatMap(g => g.items))
    .map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

let REEL = '';
let REEL_ITEMS = [];
async function reel() {
  if (!cfg.tmdb) return;
  const r = await get(`https://api.themoviedb.org/3/trending/all/week?api_key=${cfg.tmdb}&language=ar`, { timeout: 15000 }, 2);
  if (!r) return;
  const d = await r.json();
  const items = (d.results || []).filter(x => x.poster_path).slice(0, 18);
  REEL_ITEMS = items;
  REEL = items.map(x => `<img src="https://image.tmdb.org/t/p/w342${x.poster_path}" alt="${esc(x.title || x.name || '')}" width="168" height="252" loading="lazy" decoding="async">`).join('');
}

function promoHtml() {
  if (!PROMOS.length) return '';
  const list = PROMOS.slice().sort((a, b) => (a.ts || 9e9) - (b.ts || 9e9)).slice(0, 8);
  const href = p => ARCH[p.fx] ? mUrl(ARCH[p.fx]) : '/download.html';
  return `<div class="promo" data-promo>
  <div class="promo-track">${list.map((p, i) => `<a class="promo-s${i ? '' : ' on'}" href="${href(p)}" aria-label="${esc(p.title || 'إعلان مباراة')}">
    <img src="${p.src}" alt="${esc(p.title || '')}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></a>`).join('')}</div>
  ${list.length > 1 ? `<div class="promo-dots">${list.map((_, i) => `<button type="button" aria-label="إعلان ${i + 1}"${i ? '' : ' aria-current="true"'}><i></i></button>`).join('')}</div>` : ''}
</div>`;
}
function wallHtml() {
  if (!REEL_ITEMS.length) return '';
  const imgs = REEL_ITEMS.map(x => `<img src="https://image.tmdb.org/t/p/w185${x.poster_path}" alt="" width="120" height="180" decoding="async">`);
  const row = (k) => { const r = imgs.slice(k).concat(imgs.slice(0, k)).join(''); return `<div class="wall-row"><div class="wall-t">${r}${r}</div></div>`; };
  return `<div class="wall" aria-hidden="true">${row(0)}${row(6)}${row(12)}</div>`;
}

// ════════════════════════════════════════════════════════════════
// 4) التشغيل
// ════════════════════════════════════════════════════════════════
await Promise.all([release(), feed(), reel()]);

// تقليم الأرشيف
const keepS = (cfg.matches?.keepDays || 30) * 86400;
for (const [id, m] of Object.entries(ARCH)) if (m.ts < NOW - keepS || NOW - (m.seen || 0) > 10 * 86400 && m.ts > NOW) delete ARCH[id];
fs.writeFileSync(ARCH_P, JSON.stringify(ARCH));
const ALL = Object.values(ARCH).sort((a, b) => a.ts - b.ts);
// انسخ الصور المستخدمة فقط
for (const p of [...ALL.flatMap(m => [m.h.logo, m.a.logo, m.lgLogo, m.poster]), ...PROMOS.map(x => x.src)]) {
  if (!p) continue;
  const src = path.join(CACHE, p.replace(/^\/img\//, 'img/'));
  if (fs.existsSync(src) && !fs.existsSync(path.join(OUT, p))) { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.copyFileSync(src, path.join(OUT, p)); }
}

const upcoming = ALL.filter(m => !finished(m) && !OFF[m.st]);
const pickNext = () => {
  const soon = upcoming.filter(m => m.ts < NOW + 2 * 86400);
  return (soon.length ? soon : upcoming).slice().sort((a, b) => weight(a) - weight(b) || a.ts - b.ts)[0];
};
function todayBlock() {
  let day = TODAY, list = ALL.filter(m => dayKey(m.ts) === TODAY);
  if (!list.filter(m => !finished(m)).length) { const t = ALL.filter(m => dayKey(m.ts) === TOMORROW); if (t.length) { day = TOMORROW; list = t; } }
  if (!list.length) return { title: 'جدول المباريات', html: '<p class="mute">لا توجد مباريات مجدولة في الوقت الحالي. الجدول يتحدّث تلقائياً كل ساعتين.</p>' };
  list = list.slice().sort((a, b) => weight(a) - weight(b) || a.ts - b.ts).slice(0, 6).sort((a, b) => a.ts - b.ts);
  return { title: day === TODAY ? 'مباريات اليوم' : 'مباريات الغد', html: `<div class="m-grid">${list.map(ticket).join('')}</div>` };
}

// ── الصفحات الثابتة ──
const sitemap = [];
const PAGES = path.join(ROOT, 'pages');
const pages = fs.readdirSync(PAGES).filter(f => f.endsWith('.html'));
for (const f of pages) {
  let src = fs.readFileSync(path.join(PAGES, f), 'utf8');
  const mm = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!mm) { log('تخطّي (بلا meta):', f); continue; }
  const meta = JSON.parse(mm[1]);
  src = src.slice(mm[0].length);
  meta.path = f === 'index.html' ? '/' : '/' + f;
  meta.ld = meta.ld || [];
  if (meta.faq) meta.ld.push(faqLd(meta.faq));
  if (f === 'index.html') meta.ld.push({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'توتيفي TOTV+',
    applicationCategory: 'EntertainmentApplication', operatingSystem: 'Android, Android TV', url: SITE + '/',
    ...(REL.android ? { softwareVersion: REL.android.ver, fileSize: `${(REL.android.size / 1048576).toFixed(1)}MB`, downloadUrl: SITE + '/download.html' } : {}),
    offers: { '@type': 'Offer', price: '5000', priceCurrency: 'IQD' } });
  const nx = pickNext(), td = todayBlock();
  const rv = (k) => REL[k];
  const vars = {
    dl: () => dlWidget(), 'dl:android': () => dlWidget('android'), 'dl:tv': () => dlWidget('tv'),
    plans: plansHtml, 'faq:top': () => faqHtml('top'), 'faq:all': () => faqHtml('all'),
    next: () => nx ? bigCard(nx) : `<div class="big" style="padding:28px"><h3 style="margin-bottom:8px">جدول المباريات يتحدّث تلقائياً</h3><p class="mute">مواعيد اليوم والأسبوع بتوقيتك، وتنبيه عند صافرة البداية داخل التطبيق.</p></div>`,
    'next:cap': () => nx ? (relDay(nx.ts) ? `المباراة الأبرز ${relDay(nx.ts)}` : 'المباراة الأبرز القادمة') : '',
    'today:title': () => td.title, today: () => td.html,
    reel: () => REEL ? `<div class="marq"><div class="marq-t">${REEL}${REEL.replace(/<img /g, '<img aria-hidden="true" ')}</div></div>` : '', 'reel:hide': () => REEL ? '' : ' hidden',
    promos: promoHtml, 'promos:hide': () => PROMOS.length ? '' : ' hidden', wall: wallHtml,
    'ios:app': () => cfg.ios?.app || '#', 'ios:name': () => esc(cfg.ios?.appName || ''), 'ios:code': () => esc(cfg.ios?.code || ''),
    'ios:plans': () => cfg.plans.map(p => `<a class="btn ${p.popular ? 'btn-gold' : 'btn-line'}" target="_blank" rel="noopener" href="${waLink}?text=${encodeURIComponent(`مرحباً، أريد اشتراك آيفون (${cfg.ios?.appName || ''}) — باقة ${p.name}`)}"><svg class="ic"><use href="#i-wa"/></svg>${esc(p.name)} — ${esc(p.price)}</a>`).join(''),
    whatsapp: () => waLink, telegram: () => L.telegram || '', email: () => L.email || '', mailto: () => mailto,
    'tv:href': () => rv('tv')?.href || '/download.html',
    'rel:ver': () => esc(rv('android')?.ver || '—'),
    'rel:size': () => rv('android') ? (rv('android').size / 1048576).toFixed(1) + ' ميغابايت' : '—',
    'rel:tvsize': () => rv('tv') ? (rv('tv').size / 1048576).toFixed(1) + ' ميغابايت' : '—',
    'rel:date': () => rv('android') ? fDateY(rv('android').date) : '—',
    'rel:tvnote': () => rv('tv')?.shared ? 'نفس ملف الهاتف (يعمل على الشاشات)' : 'نسخة مخصّصة للريموت',
    'if:telegram': () => L.telegram ? '' : ' hidden',
    'if:email': () => L.email ? '' : ' hidden',
  };
  src = src.replace(/\{\{([\w:]+)\}\}/g, (all, k) => vars[k] ? vars[k]() : (log('⚠️ متغيّر غير معروف', k, 'في', f), ''));
  write(f, layout(meta, src));
  if (!meta.noindex) sitemap.push({ loc: meta.path, pri: meta.path === '/' ? '1.0' : '0.8', freq: meta.freq || 'weekly' });
}

// ── صفحة المباريات ──
{
  const days = [...new Set(ALL.filter(m => m.ts >= NOW - 2 * 86400).map(m => dayKey(m.ts)))].filter(d => d >= YESTERDAY).sort();
  const dayName = d => { const any = ALL.find(m => dayKey(m.ts) === d); return fDate(any.ts); };
  const label = d => d === TODAY ? 'اليوم' : d === TOMORROW ? 'غداً' : d === YESTERDAY ? 'أمس' : dayName(d).split('،')[0];
  const nav = days.map(d => `<a href="#d-${d}"${d === TODAY ? ' class="today"' : ''}>${label(d)}</a>`).join('');
  const blocks = days.map(d => {
    const list = ALL.filter(m => dayKey(m.ts) === d);
    const byLg = new Map();
    for (const m of list.sort((a, b) => (a.lgOrder - b.lgOrder) || a.ts - b.ts)) { if (!byLg.has(m.lg)) byLg.set(m.lg, []); byLg.get(m.lg).push(m); }
    return `<section class="day" id="d-${d}">
  <div class="day-h"><h2>${d === TODAY ? 'مباريات اليوم' : d === TOMORROW ? 'مباريات الغد' : d === YESTERDAY ? 'نتائج مباريات الأمس' : 'مباريات ' + dayName(d).split('،')[0]}</h2><span class="mute">${dayName(d)}</span></div>
  ${[...byLg.values()].map(ms => `<div class="lg-h">${ms[0].lgLogo ? `<img src="${ms[0].lgLogo}" alt="" width="22" height="22" loading="lazy">` : ''}${esc(ms[0].lgAr)}</div>
  <div class="m-grid">${ms.map(ticket).join('')}</div>`).join('')}
</section>`;
  }).join('');
  const todayN = ALL.filter(m => dayKey(m.ts) === TODAY).length;
  const body = `<section class="page-h"><div class="wrap">
  <h1>مباريات اليوم ومواعيدها</h1>
  <p class="lead">جدول مباريات اليوم والأسبوع في أبرز الدوريات والبطولات، مع القنوات الناقلة ونتائج الأمس. الأوقات تظهر بتوقيت جهازك تلقائياً.</p>
  <p class="tzline">آخر تحديث: ${fDate(NOW)} الساعة ${fClock(NOW)} بتوقيت بغداد</p>
</div></section>
<section class="body"><div class="wrap">
  ${PROMOS.length ? `<div style="margin-bottom:34px">${promoHtml()}</div>` : ''}
  ${days.length ? `<nav class="daynav" aria-label="الأيام">${nav}</nav>${blocks}` : '<p class="mute">لا توجد مباريات مجدولة حالياً. الجدول يتحدّث تلقائياً كل ساعتين.</p>'}
  <div class="panel" style="margin-top:48px"><h2>تابع المباريات من هاتفك</h2><p class="mute" style="margin-bottom:18px">تطبيق توتيفي ينبّهك عند صافرة البداية ويعرض الجدول بتوقيتك.</p>${dlWidget()}</div>
</div></section>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'مباريات اليوم',
    itemListElement: ALL.filter(m => dayKey(m.ts) === TODAY).map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + mUrl(m), name: `${m.h.ar} و${m.a.ar}` })) }];
  write('matches.html', layout({ title: `مباريات اليوم ${fDate(NOW)} ومواعيدها والقنوات الناقلة | توتيفي`,
    desc: `جدول مباريات اليوم${todayN ? ` (${todayN} مباراة)` : ''} ومواعيدها بتوقيتك والقنوات الناقلة ونتائج مباريات الأمس في الدوري الإنجليزي والإسباني ودوري أبطال أوروبا وغيرها.`,
    path: '/matches.html', ld }, body));
  sitemap.push({ loc: '/matches.html', pri: '0.9', freq: 'hourly', mod: NOW });
}

// ── صفحة لكل مباراة ──
const CITIES = [['Asia/Baghdad', 'العراق'], ['Asia/Riyadh', 'السعودية'], ['Asia/Dubai', 'الإمارات'], ['Africa/Cairo', 'مصر'],
  ['Asia/Amman', 'الأردن'], ['Africa/Algiers', 'الجزائر'], ['Africa/Tunis', 'تونس'], ['Africa/Casablanca', 'المغرب']];
for (const m of ALL) {
  const done = finished(m), score = done && hasScore(m), rd = roundAr(m.rd), rel = relDay(m.ts);
  const H = m.h.ar, A = m.a.ar, LG = m.lgAr;
  // جدول التوقيت مع دمج الدول المتشابهة
  const rows = new Map();
  for (const [tz, n] of CITIES) { const k = fClock(m.ts, tz) + '|' + dayKey(m.ts, tz); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(n); }
  const times = [...rows].map(([k, ns]) => `<tr><td>${ns.join(' و')}</td><td>${k.split('|')[0]}</td></tr>`).join('');
  const sameDay = ALL.filter(x => x.id !== m.id && dayKey(x.ts) === dayKey(m.ts)).sort((a, b) => weight(a) - weight(b)).slice(0, 6).sort((a, b) => a.ts - b.ts);
  const when = `${fDateY(m.ts)}`;
  let story;
  if (OFF[m.st]) story = `مباراة ${H} و${A} ${rd ? 'في ' + rd + ' من ' : 'ضمن '}${LG} ${OFF[m.st]} حالياً، وكان موعدها ${when}. سنحدّث هذه الصفحة فور الإعلان عن موعد جديد.`;
  else if (score) {
    const res = m.gh === m.ga ? `بالتعادل ${m.gh}-${m.ga}` : `بفوز ${m.gh > m.ga ? H : A} بنتيجة ${Math.max(m.gh, m.ga)}-${Math.min(m.gh, m.ga)}`;
    story = `انتهت مباراة ${H} و${A} ${rd ? 'في ' + rd + ' من ' : 'ضمن '}${LG} ${res}، وأُقيمت ${when}${m.venue ? ' على ملعب ' + m.venue : ''}.`;
  } else {
    story = `يلتقي ${H} مع ${A} ${rd ? 'في ' + rd + ' من ' : 'ضمن '}${LG}${m.venue ? ' على ملعب ' + m.venue : ''}، ${rel === 'اليوم' ? 'اليوم ' : rel === 'غداً' ? 'غداً ' : ''}${when}. تنطلق المباراة الساعة ${fClock(m.ts, 'Asia/Baghdad')} بتوقيت بغداد ومكة المكرمة، والساعة ${fClock(m.ts, 'Africa/Cairo')} بتوقيت القاهرة.`;
  }
  const chs = m.ch.length ? `<h2 style="font-size:1.25rem;margin:30px 0 12px">القنوات الناقلة</h2><div class="chs">${m.ch.map(c => `<span>${esc(c)}</span>`).join('')}</div><p class="mute" style="font-size:.9rem;margin-top:10px">حسب جدول البث المعلن للبطولة، وقد يتغيّر.</p>` : '';
  const title = score ? `نتيجة مباراة ${H} و${A} ${m.gh}-${m.ga} | ${LG}`
    : `موعد مباراة ${H} و${A}${rel && rel !== 'أمس' ? ' ' + rel : ''} والقنوات الناقلة | ${LG}`;
  const desc = score ? `نتيجة مباراة ${H} ضد ${A} في ${LG} ${rd ? '(' + rd + ') ' : ''}${when}.`
    : `موعد مباراة ${H} ضد ${A} في ${LG} ${when} الساعة ${fClock(m.ts)} بتوقيت بغداد و${fClock(m.ts, 'Africa/Cairo')} بتوقيت القاهرة، والقنوات الناقلة.`;
  const event = { '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${H} ضد ${A}`, alternateName: `${m.h.n} vs ${m.a.n}`,
    description: desc, sport: 'Soccer', startDate: isoAt(m.ts), endDate: isoAt(m.ts + 2 * 3600),
    eventStatus: 'https://schema.org/' + (m.st === 'PST' ? 'EventPostponed' : m.st === 'CANC' ? 'EventCancelled' : 'EventScheduled'),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: m.venue || LG, address: m.venue || LG },
    homeTeam: { '@type': 'SportsTeam', name: H, alternateName: m.h.n, ...(m.h.logo ? { logo: SITE + m.h.logo } : {}) },
    awayTeam: { '@type': 'SportsTeam', name: A, alternateName: m.a.n, ...(m.a.logo ? { logo: SITE + m.a.logo } : {}) },
    competitor: [{ '@type': 'SportsTeam', name: H }, { '@type': 'SportsTeam', name: A }],
    organizer: { '@type': 'Organization', name: LG },
    image: [m.poster ? SITE + m.poster : (m.h.logo ? SITE + m.h.logo : SITE + '/Icon-512.png')],
    url: SITE + mUrl(m) };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'المباريات', item: SITE + '/matches.html' },
    { '@type': 'ListItem', position: 3, name: `${H} و${A}`, item: SITE + mUrl(m) }] };
  const body = `<section class="page-h"><div class="wrap">
  <nav class="crumbs" aria-label="المسار"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><a href="/matches.html">المباريات</a><span aria-hidden="true">/</span><span>${esc(H)} و${esc(A)}</span></nav>
  <h1>${score ? 'نتيجة' : 'موعد'} مباراة ${esc(H)} و${esc(A)}</h1>
  <p class="lead">${esc(LG)}${rd ? '، ' + rd : ''}</p>
</div></section>
<section class="body"><div class="wrap two">
  <div>
    <div class="mh">${bigCard(m, { link: false })}</div>
    <div class="prose" style="margin-top:28px"><p>${esc(story)}</p></div>
    ${chs}
    ${sameDay.length ? `<h2 style="font-size:1.25rem;margin:36px 0 14px">مباريات أخرى في اليوم نفسه</h2><div class="m-list">${sameDay.map(ticket).join('')}</div>` : ''}
  </div>
  <aside>
    <div class="panel"><h3>موعد المباراة حسب الدولة</h3><table class="times"><tbody>${times}</tbody></table>
      <p class="mute" style="font-size:.88rem;margin-top:10px">${fDateY(m.ts)}</p></div>
    <div class="panel"><h3>تابعها على توتيفي</h3><p class="mute" style="margin-bottom:16px">يصلك تنبيه عند صافرة البداية، والجدول كاملاً بتوقيتك.</p>${dlWidget()}</div>
  </aside>
</div></section>`;
  write(mUrl(m).slice(1), layout({ title, desc, path: mUrl(m), nav: '/matches.html', ogType: 'article', image: m.poster || '', ld: [event, crumbs] }, body));
  sitemap.push({ loc: mUrl(m), pri: m.ts > NOW - 86400 ? '0.8' : '0.5', freq: done ? 'monthly' : 'hourly', mod: Math.min(NOW, m.seen || NOW) });
}
log('صفحات المباريات:', ALL.length);

// ── رابط الشاشات المختصر totv.app/tv ──
{
  const r = REL.tv;
  write('tv/index.html', layout({ title: 'تحميل توتيفي لشاشات السمارت', desc: 'رابط مختصر لتحميل نسخة توتيفي للشاشات وأجهزة Android TV.', path: '/tv/', nav: '/download.html', noindex: true },
    `<section class="page-h"><div class="wrap" style="max-width:640px">
  <h1>نسخة الشاشات</h1>
  <p class="lead" style="margin-bottom:26px">${r ? 'يبدأ التنزيل تلقائياً خلال ثوانٍ. إن لم يبدأ، اضغط الزر.' : 'الملف غير متاح حالياً، راسل الدعم.'}</p>
  ${dlWidget('tv')}
</div></section>${r ? `<script>setTimeout(function(){location.href=${JSON.stringify(r.href)}},1800)</script>` : ''}`));
}

// ── 404 ──
write('404.html', layout({ title: 'الصفحة غير موجودة | توتيفي', desc: 'الصفحة المطلوبة غير موجودة.', path: '/404.html', noindex: true },
  `<section class="page-h"><div class="wrap"><h1>هذه الصفحة غير موجودة</h1><p class="lead" style="margin-bottom:26px">ربما نُقلت أو انتهى موعد المباراة. جرّب جدول اليوم أو حمّل التطبيق.</p>
  <div class="dl-row"><a class="btn btn-gold" href="/matches.html">مباريات اليوم</a><a class="btn btn-line" href="/download.html">تحميل التطبيق</a></div></div></section>`));

// ── الملفات الثابتة ──
// كل ما في public/ يُنسخ كما هو إلى جذر الموقع (أيقونات، CNAME، app-ads.txt، ملفات تحقق Google...)
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
write('.nojekyll', '');
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /dl/\nSitemap: ${SITE}/sitemap.xml\n`);
const iso = t => new Date((t || NOW) * 1000).toISOString();
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map(u =>
  `<url><loc>${SITE}${u.loc}</loc><lastmod>${iso(u.mod)}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`);
log('تم البناء:', sitemap.length, 'رابطاً في خريطة الموقع');
