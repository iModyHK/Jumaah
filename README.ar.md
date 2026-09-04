# جُمعة — ترجمة خطبة الجمعة لحظياً

[🇬🇧 English version](README.md)

> **للمساجد:** موقع [www.jumaah.net](https://www.jumaah.net) يشرح ما يفعله «جمعة» مع تجربة حية، وكيف تحصلون عليه مجاناً. هذا الملف موجّه لمن يثبّت المنصة أو يطوّرها. للأسئلة: نموذج التواصل في الموقع. للأخطاء: [افتحوا مشكلة على GitHub](https://github.com/iModyHK/Jumaah/issues).

منصة متعددة المستأجرين (Multi-tenant) تعرض خطبة الجمعة مترجمة، فقرةً فقرة، على شاشات المسجد بينما يقرأها الإمام بالعربية. كل مسجد يشغّل **سيرفراً محلياً (Edge)** عبر Docker يعمل بالكامل بدون إنترنت أثناء الخطبة، مع مزامنة اختيارية لسيرفر **سحابي مركزي** (إدارة المساجد، مكتبة الخطب المشتركة، مفاتيح الترجمة المركزية، النسخ الاحتياطي).

```
┌──────────────────────── شبكة المسجد (Edge) ────────────────────────┐        ┌────────── السحابة ──────────┐
│  تابلت الإمام ──► /imam/  ─┐                                         │        │  /admin/ (مدير المنصة)     │
│                            ├─ Socket.IO ─► API (Fastify) ─► Postgres │◄─مزامنة─►│  API · Postgres · Redis     │
│  الشاشات ─────► /display/ ┘               │      └─► Redis          │        │  المكتبة · المفاتيح         │
│  الجوالات (QR) ► /display/m/<slug>        └─► sync-worker ──────────┘        └─────────────────────────────┘
│  الإدارة ─────► /admin/                     Ollama / LibreTranslate (اختياري، ترجمة محلية)
└─────────────────────────────────────────────────────────────────────┘
```

## المزايا

- **إدارة الخطب**: الخطبة الأولى/الثانية/الدعاء، تاريخ هجري وميلادي، محرر عربي RTL بتقسيم تلقائي للفقرات (سطر فارغ) ودمج/تقسيم يدوي، استيراد DOCX/TXT/PDF، إصدارات كاملة مع استعادة، نسخ خطبة سابقة، مكتبة مشتركة بين المساجد (بموافقة مدير المنصة)، تمييز الآيات والأحاديث تلقائياً (لا تُترجم آلياً).
- **محرك الترجمة**: واجهة موحدة `TranslationProvider` مع Manual وAnthropic Claude وOpenAI وGoogle وDeepL وLibreTranslate وOllama (محلي)، قاموس مصطلحات لكل مسجد (إبقاء/استبدال/تلميح)، سلسلة fallback قابلة للترتيب، كاش للفقرات المتطابقة، تقدير التكلفة قبل التنفيذ، ترجمة دفعة واحدة مع تقدّم مباشر، سير عمل: آلي ← مراجعة ← اعتماد (لا يُعرض على الشاشات إلا المعتمد).
- **واجهة المنبر (PWA)**: خط عربي كبير قابل للتعديل، وضع داكن، الفقرة الحالية/التالية/السابقة، أزرار كبيرة (التالي/السابق/إيقاف/ارتجال/الانتقال بين الأقسام)، سحب ولوحة مفاتيح، مؤقتات وتقدّم، منع النوم، طابور أوامر أثناء الانقطاع مع إعادة اتصال تلقائي، انتقال تلقائي اختياري، جلسة إمام واحدة نشطة لكل مسجد مع إمكانية الاستلام.
- **الشاشات (PWA)**: رابط بـ token لكل شاشة بدون تسجيل دخول، 1–4 لغات بتخطيط مفرد/مقسوم/شبكة، خطوط واتجاه لكل لغة (أردو نستعليق، بنغالي، أمهري، صيني…)، الفقرة السابقة باهتة، شاشة انتظار (اسم المسجد، مواقيت الصلاة، رسالة ترحيب، رمز QR يفتح الترجمة نفسها على جوال المصلي)، وضع kiosk وملء الشاشة، رسالة «الإمام يتحدث» أثناء الارتجال.
- **البث اللحظي**: Socket.IO عبر الشبكة المحلية (< 200 مللي ثانية)، الحالة المرجعية على الخادم، الشاشات المتصلة متأخراً تستلم الفقرة الحالية فوراً، أرقام تسلسل، heartbeat وإعادة اتصال.
- **تعدد المستأجرين والاستضافة الهجينة**: `tenantId` على كل جدول + سياسات RLS في PostgreSQL، Docker Compose للـ edge والسحابة، مزامنة ثنائية الاتجاه بنمط Outbox مع حل تعارض بأحدث تعديل (والاحتفاظ بالنسخ الخاسرة)، الـ edge يحوّل الترجمة للسحابة عند توفر الإنترنت ويستخدم النماذج المحلية عند انقطاعه، تحديث الـ edge عبر image tag من السحابة.
- **الأمان والتشغيل**: دخول بالبريد وكلمة المرور مع دعوات، JWT مع refresh tokens دوّارة، rate limiting عبر Redis، مفاتيح API مشفرة AES-256-GCM، سجل تدقيق قبل/بعد، نسخ احتياطي واستعادة من الواجهة، إدارة ثنائية اللغة (عربي RTL / إنجليزي).

## هيكل المستودع

```
apps/
  api/            خادم Fastify REST + Socket.IO (+ منفّذ مهام الترجمة)
  admin/          لوحة الإدارة React (عربي/إنجليزي)
  imam/           تطبيق المنبر PWA
  display/        الشاشات + صفحة الجوال العامة PWA
  sync-worker/    عامل المزامنة edge ↔ cloud
packages/
  shared/         الأنواع، مخططات zod، تقسيم الفقرات، أحداث Socket، نصوص i18n
  translation-providers/  الواجهة الموحدة، الموفّرون، القاموس، الكاش، التكلفة، السلسلة
  db/             مخطط Prisma، الـ migrations (مع RLS)، الـ seed، التشفير، تطبيق المزامنة
  ui/             مشترك React: i18n، عميل API، عميل Socket، hooks، الخطوط، الثيم
tests/e2e/        Playwright (رفع ← ترجمة ← اعتماد ← بث ← عرض)
infra/            إعداد Caddy، Dockerfile للواجهات، سكربتات التثبيت/التحديث
docker-compose.edge.yml · docker-compose.cloud.yml · .env.example · DECISIONS.md
```

## التشغيل السريع (تطوير)

المتطلبات: Node 20+، pnpm 9، Docker.

```bash
pnpm install
cp .env.example .env
docker run -d --name jumaah-dev-pg -e POSTGRES_USER=jumaah -e POSTGRES_PASSWORD=jumaah_dev_password -e POSTGRES_DB=jumaah -p 5432:5432 postgres:16-alpine
docker run -d --name jumaah-dev-redis -p 6379:6379 redis:7-alpine
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev        # api :4000 · admin :5173 · imam :5174 · display :5175
```

الحسابات التجريبية (غيّرها في الإنتاج):

| الدور | البريد | كلمة المرور |
| --- | --- | --- |
| مدير المنصة | `admin@jumaah.app` | `Admin12345!` |
| مدير المسجد التجريبي | `admin@demo.mosque` | `Demo12345!` |
| مترجم | `translator@demo.mosque` | `Demo12345!` |
| الإمام | `imam@demo.mosque` | `Demo12345!` |

شاشات تجريبية: `http://localhost:5175/display/demo-main-display-token-0001` (إنجليزي + أردو) و`…/display/demo-hall-display-token-0002` (إنجليزي + أردو + بنغالي، شبكة). صفحة الجوال: `http://localhost:5175/display/m/demo`.

### الاختبارات

```bash
pnpm test        # اختبارات الوحدات + اختبارات تكامل الـ API (تحتاج Postgres/Redis)
pnpm test:e2e    # Playwright: يشغّل الـ API والواجهات الثلاث وينفّذ سيناريو الخطبة كاملاً (أولاً: pnpm --filter @jumaah/e2e install-browsers)
pnpm typecheck && pnpm build
```

## النشر على سيرفر المسجد (Edge)

أي جهاز صغير x86/ARM على شبكة المسجد (4 GB RAM كافية، وأكثر إن شغّلت Ollama).

```bash
curl -fsSL https://raw.githubusercontent.com/iModyHK/Jumaah/main/infra/scripts/edge-install.sh | bash
```

السكربت يثبّت Docker، يستنسخ المستودع في `/opt/jumaah`، يكتب `.env` بأسرار عشوائية، يشغّل `docker-compose.edge.yml` ويزرع أول مدير (تُطبع بياناته في النهاية). يدوياً:

```bash
cp .env.example .env    # عيّن JWT_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD, PUBLIC_BASE_URL=http://<lan-ip>:8080
SEED_ON_START=1 docker compose -f docker-compose.edge.yml up -d --build
```

- الإدارة: `http://<lan-ip>:8080/admin/` · المنبر: `/imam/` · الشاشات: `/display/<token>`.
- ترجمة محلية بدون إنترنت: `docker compose -f docker-compose.edge.yml --profile local-ai up -d` ثم `docker compose -f docker-compose.edge.yml exec ollama ollama pull qwen2.5:7b`، وأضف الموفّر من الإدارة ← مصادر الترجمة (Ollama، `http://ollama:11434`).
- الربط بالسحابة: مدير المنصة ينشئ المسجد في إدارة السحابة (يظهر **مفتاح المزامنة** مرة واحدة)؛ على الـ edge عيّن `CLOUD_API_URL` و`EDGE_TENANT_SLUG` و`EDGE_SYNC_KEY` في `.env` وأعد التشغيل. عامل المزامنة يجلب بيانات المسجد كاملة إن كانت القاعدة فارغة، ثم يزامن كل `SYNC_INTERVAL_SECONDS` (أو بزر «مزامنة الآن»).
- التحديث: `./infra/scripts/edge-update.sh` يسحب الإصدار المعلن من السحابة (`edge.latestImageTag`، يُحرَّر من صفحة المنصة لدى مدير المنصة) ويعيد التشغيل.
- النسخ الاحتياطي: الإدارة ← النسخ الاحتياطي (ملف JSON.gz لكل مسجد: تنزيل/استعادة/رفع). الأحجام: `pgdata`, `redisdata`, `backups`.

## نشر السحابة

```bash
cp .env.example .env    # DEPLOYMENT_MODE=cloud، أسرار قوية، SITE_ADDRESS=jumaah.example.com، ANTHROPIC_API_KEY=… (مفاتيح مركزية)
SEED_ON_START=1 docker compose -f docker-compose.cloud.yml up -d --build
```

Caddy يحصل على شهادة TLS تلقائياً لـ `SITE_ADDRESS`. مفاتيح الموفّرين في `.env` تتحول إلى موفّرين عامّين عند أول تشغيل (وتُدار من الإدارة ← مصادر الترجمة ← قسم المنصة). نسخة `pg_dump` يومية في خدمة `db-backup`.

## إعداد الشاشات

1. الإدارة ← الشاشات ← إضافة: الاسم، اللغات (1–4)، التخطيط (مفرد/مقسوم/شبكة)، حجم الخط، الثيم، الفقرة السابقة، شريط العربية، QR.
2. افتح رابط الشاشة على جهاز العرض (أي متصفح Chromium/Firefox/تلفاز ذكي؛ Raspberry Pi بوضع kiosk ممتاز). لمسة واحدة تفعّل ملء الشاشة؛ الصفحة تمنع النوم وتعيد الاتصال تلقائياً.
3. أعد توليد الرمز من الإدارة إذا تسرّب الرابط. تغيير التخطيط/اللغات ينعكس على الشاشة فوراً.
4. شاشة الانتظار تعرض QR لـ `/display/m/<slug>`؛ المصلّي يختار لغته على جواله. يمكن التعطيل عبر `publicDisplayEnabled=false` في الإعدادات.

مثال kiosk (Raspberry Pi OS): `chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble http://<lan-ip>:8080/display/<token>`.

## إضافة موفّر ترجمة جديد

1. أضف النوع إلى `PROVIDER_TYPES` في `packages/shared/src/constants.ts` وإلى enum `ProviderType` في `packages/db/prisma/schema.prisma` (`pnpm db:migrate:dev --name add_provider`).
2. نفّذ `TranslationProvider` في `packages/translation-providers/src/providers/<name>.ts` (انظر `google.ts` لمحرك MT مع حماية المصطلحات، أو `anthropic.ts` لنموذج لغوي يستخدم `buildSystemPrompt`). ارمِ `ProviderError` بالرمز الصحيح (`AUTH`, `RATE_LIMITED` قابل لإعادة المحاولة، `UNSUPPORTED_LANG`…) كي تتصرف سلسلة الـ fallback بشكل صحيح.
3. سجّله في `packages/translation-providers/src/registry.ts` (`factories` + `PROVIDER_META`) وأضف اختباراً بـ `fetch` وهمي في `chain.test.ts`.
4. أضف الاسم المعروض في `providers.types.*` داخل `packages/shared/src/i18n/{ar,en}.json`. لوحة الإدارة تلتقطه تلقائياً.

## المتغيرات البيئية

كلها موثّقة في [`.env.example`](.env.example). القرارات التصميمية في [`DECISIONS.md`](DECISIONS.md).

## الرخصة

MIT
