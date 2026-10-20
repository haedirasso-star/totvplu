# موقع توتيفي — totv.app

الموقع يُبنى وينشر تلقائياً من GitHub Actions. لا تحتاج تعديل أي شيء غير الجدول التالي.

```
├── site.config.json   ← الروابط (واتساب، تلجرام، الدفع) والأسعار
├── pages/             ← نصوص الصفحات: الرئيسية، التحميل، الشرح، الأسئلة، الدعم
├── content/faq.json   ← الأسئلة الشائعة (true = تظهر في الرئيسية)
├── assets/            ← التصميم (site.css) والسكربت (site.js)
├── public/            ← الأيقونات، CNAME، app-ads.txt — تُنسخ كما هي
├── scripts/build.mjs  ← البنّاء: صفحات المباريات وخريطة الموقع وملف التطبيق
└── .github/workflows/deploy.yml ← النشر التلقائي كل ساعتين
```

## رفع نسخة جديدة من التطبيق
1. Releases → Edit على الإصدار (أو إصدار جديد).
2. ارفع `totvplus.apk` (الهاتف) و `totvplus-tv.apk` (الشاشات) بهذه الأسماء بالضبط.
3. Actions → «نشر الموقع» → Run workflow.

## المباريات
تُقرأ من المتغيّر `FEED_URL` في Settings → Secrets and variables → Actions → Variables، وتتحدّث كل ساعتين.
