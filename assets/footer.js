/* التذييل المشترك — يُحقن في كل الصفحات من مكان واحد */
(function () {
  const L = TOTV.links;
  const social = [
    ['telegram',  'fab fa-telegram-plane', 'قناة تلجرام'],
    ['facebook',  'fab fa-facebook-f',     'فيسبوك'],
    ['instagram', 'fab fa-instagram',      'إنستغرام'],
    ['tiktok',    'fab fa-tiktok',         'تيك توك'],
    ['youtube',   'fab fa-youtube',        'يوتيوب'],
  ].filter(([k]) => L[k]);

  const socialHtml = social.map(([k, ic, label]) =>
    `<a href="${L[k]}" target="_blank" rel="noopener" aria-label="${label}"
        style="width:38px;height:38px;border-radius:10px;border:1px solid var(--line);
               background:var(--surface);display:flex;align-items:center;justify-content:center;
               color:var(--text-2);font-size:15px;transition:.2s"
        onmouseover="this.style.color='var(--gold)';this.style.borderColor='var(--gold-dim)'"
        onmouseout="this.style.color='var(--text-2)';this.style.borderColor='var(--line)'"
        ><i class="${ic}"></i></a>`).join('');

  document.getElementById('footer').outerHTML = `
  <footer class="foot">
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <div class="brand" style="margin-bottom:14px">
            <img src="Icon-192.png" alt="توتيفي TOTV+" style="width:40px;height:40px;border-radius:10px">
            <div>
              <div class="brand-name">TOTV<span>+</span></div>
              <div class="brand-tag">توتيفي</div>
            </div>
          </div>
          <p style="color:var(--text-2);font-size:14.5px;max-width:38ch;margin-bottom:18px">
            أفلام ومسلسلات ومباريات مباشرة على هاتفك وشاشتك. تفعيل بكود واحد، ودعم يردّ في دقائق.
          </p>
          <div style="display:flex;gap:9px;flex-wrap:wrap">${socialHtml}</div>
        </div>

        <div>
          <h4>الموقع</h4>
          <div class="foot-links">
            <a href="./">الرئيسية</a>
            <a href="download.html">تحميل التطبيق</a>
            <a href="guide.html">طريقة التثبيت</a>
            <a href="faq.html">أسئلة شائعة</a>
            <a href="support.html">الدعم والقنوات</a>
          </div>
        </div>

        <div>
          <h4>تواصل</h4>
          <div class="foot-links">
            <a href="${L.whatsapp}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب الدعم</a>
            ${L.telegram ? `<a href="${L.telegram}" target="_blank" rel="noopener"><i class="fab fa-telegram-plane"></i> قناة تلجرام</a>` : ''}
            <a href="${L.email}"><i class="fas fa-envelope"></i> البريد الإلكتروني</a>
            <a href="${L.ios}" target="_blank" rel="noopener"><i class="fab fa-apple"></i> مستخدمو آيفون</a>
          </div>
        </div>
      </div>

      <div class="foot-bottom">
        <span>© ${new Date().getFullYear()} توتيفي TOTV+ — جميع الحقوق محفوظة</span>
        <span class="mono">totv.app</span>
      </div>
    </div>
  </footer>`;
})();
