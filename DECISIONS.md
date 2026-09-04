# DECISIONS — قرارات التصميم والتنفيذ

> كل قرار اتُّخذ دون سؤال المستخدم موثّق هنا مع السبب والبدائل.
> Every decision taken without asking is recorded here with rationale and alternatives.

## 1. Stack

| المجال | القرار | السبب |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | أسرع تثبيت، عزل الحزم، `workspace:*` بدون نشر. |
| API | Fastify 5 + Socket.IO 4 | Fastify أسرع من Express مع دعم TypeScript ممتاز؛ Socket.IO يوفّر إعادة اتصال/غرف/adapter Redis جاهزة (زمن استجابة LAN < 200ms بسهولة). |
| ORM | Prisma 6 | مخطط واضح، migrations مضمّنة، تولّد أنواع كاملة. Drizzle بديل جيد لكن Prisma أسهل للمساهمين. |
| DB / Cache | PostgreSQL 16 + Redis 7 | RLS في Postgres؛ Redis للحالة اللحظية + pub/sub + rate limit. |
| Frontends | React 19 + Vite 6 + Tailwind 4 | PWA سهلة عبر `vite-plugin-pwa`؛ Tailwind 4 بلا ملف إعداد. |
| i18n | i18next + ملفات JSON مشتركة في `packages/shared/src/i18n` | مصدر واحد للنصوص لكل التطبيقات (ar أساسي RTL / en). |
| Fonts | حزم `@fontsource/*` مضمّنة في البناء | لا CDN أبداً: الشاشات تعمل بدون إنترنت. |
| Password hashing | `scrypt` من `node:crypto` | بدون تبعيات native (argon2/bcrypt تحتاج build على Alpine/ARM). |
| Secrets at rest | AES-256-GCM بمفتاح مشتق من `ENCRYPTION_KEY` | مفاتيح API لا تُرجع أبداً (فقط hint `sk-a…1234`). |
| JWT | `jose` HS256، access 15m + refresh 30d مخزّن hashed وقابل للإبطال | بسيط وآمن؛ الشاشات لا تستخدم JWT بل token خاص بكل شاشة. |
| Reverse proxy | Caddy | إعداد سطرين، HTTPS تلقائي في السحابة، HTTP عادي على LAN. |

## 2. Multi-tenancy

- كل جدول يحمل `tenantId` مع فهارس مركبة. كل استعلام في الـ API يُقيَّد بـ `request.tenantId` (يُشتق من الـ JWT، أو من header `x-tenant-id` للـ Super Admin).
- **RLS**: migration `20260904103400_rls` تفعّل سياسات على كل الجداول وتنشئ دور `jumaah_app` يقرأ `current_setting('app.tenant_id')`. التطبيق يتصل حالياً بدور المالك (يتجاوز RLS) لأن Prisma لا يدعم `SET LOCAL` لكل استعلام دون transaction؛ الـ helper `withTenant()` في `@jumaah/db` يوفّر ذلك عند الحاجة. RLS إذاً طبقة دفاع ثانية وليست الوحيدة — موثّق في README.
- الـ Super Admin بلا `tenantId`؛ عند "فتح مسجد" يُرسل `x-tenant-id`. "الدخول كمدير" يصدر token بدور `MOSQUE_ADMIN` لساعة مع claim `imp` ويُسجَّل في audit.

## 3. الخطبة والفقرات

- التقسيم التلقائي: سطر فارغ = فقرة جديدة؛ الأسطر المفردة داخل الفقرة تُدمج بمسافة.
- كشف الآيات: أقواس `﴿ ﴾` أو `{ }` أو "قال تعالى"؛ كشف الأحاديث: "قال رسول الله"، "رواه …"، "متفق عليه". يمكن تغيير النوع يدوياً.
- الآيات/الأحاديث **لا تُترجم آلياً** افتراضياً (`includeSpecialBlocks=false`) وتحتاج ترجمة معنى يدوية معتمدة.
- **Hash** للفقرة (FNV-1a على النص بدون تشكيل) يسمح عند استبدال نص القسم بالحفاظ على ترجمات الفقرات التي لم تتغير.
- تعديل نص فقرة يعيد ترجماتها إلى `PENDING` (مع الاحتفاظ بالنسخ في `TranslationVersion`).
- **Versioning**: كل تغيير نصي يُنشئ `KhutbahVersion` بلقطة كاملة (نص + ترجمات)؛ الاستعادة تعيد بناء الفقرات.
- المدة المقدرة للفقرة: 110 كلمة/دقيقة (قابل للتعديل لكل مسجد) بحد أدنى 8 ثوانٍ.
- التاريخ الهجري: `Intl` بتقويم أم القرى بدون مكتبات.

## 4. محرك الترجمة

- واجهة موحدة `TranslationProvider` في `packages/translation-providers` + `registerProvider()` لإضافة موفّر دون لمس الـ API.
- Anthropic عبر SDK الرسمي مع structured outputs (`output_config.format` + zod) لضمان JSON صالح، النموذج الافتراضي `claude-opus-5` و`effort: medium`، وprompt caching على system prompt.
- OpenAI/Google/DeepL/LibreTranslate/Ollama عبر `fetch` مباشرة (لا SDKs إضافية).
- **Glossary**: لموفّري LLM يُمرَّر كتعليمات؛ لموفّري MT (Google/DeepL/Libre) تُستبدل المصطلحات بعناصر `[[n]]` قبل الإرسال وتُستعاد بعده (مع تسامح مع تشويه الأقواس).
- **Fallback chain**: ترتيب صريح من إعدادات المسجد، وإلا حسب `priority`. عند فشل موفّر تُمرَّر الفقرات المتبقية للتالي. `MANUAL` لا يدخل السلسلة الآلية.
- **Edge ↔ Cloud**: موفّر افتراضي `CLOUD` على الـ edge يرسل الفقرات لـ `/api/sync/translate` في السحابة (مفاتيح مركزية)، ويُتخطّى مع كل موفّر يحتاج إنترنت عندما يكون الـ edge offline (فحص كل 30 ثانية).
- **Cache**: مفتاح = hash(النص بدون تشكيل) + اللغة + نوع الموفّر + بصمة القاموس. مشترك بين المساجد إذا لم يُطبَّق قاموس.
- **التكلفة**: تقدير بالرموز (عربي ≈ 2.7 حرف/رمز) للـ LLM أو بالحروف للـ MT، بأسعار في `cost.ts` قابلة للتحديث.
- المهام تعمل داخل عملية الـ API (in-process job runner) مع تقدّم عبر Socket (`job:progress`) — لا حاجة لطابور خارجي على سيرفر مسجد واحد.

## 5. البث اللحظي

- حالة الجلسة في Redis (`session:{tenantId}`) مع write-through إلى جدول `LiveSession` للنجاة من إعادة التشغيل.
- `seq` أحادي التزايد؛ العملاء يتجاهلون التحديثات الأقدم.
- جلسة إمام واحدة نشطة: بدء جلسة ثانية يعطي 409 إلا مع `force` (استلام) أو إذا كان الجهاز نفسه أو مضى > 30 ثانية بلا heartbeat.
- الشاشات المتصلة متأخراً تستلم `session:state` + `session:khutbah` فور الاتصال. أي تعديل على الخطبة الحالية يعيد بث الحمولة كاملة (بسيط ومقاوم للأخطاء؛ الحجم صغير).
- بعد `end` تبقى حالة ENDED 8 ثوانٍ ثم WAITING تلقائياً.
- Auto-advance ينفَّذ على الخادم (مؤقّت لكل مسجد) كي تتفق كل الشاشات.
- Socket.IO Redis adapter مفعّل حتى في الـ edge (يسمح بأكثر من نسخة API في السحابة دون تغيير كود).

## 6. المزامنة الهجينة

- **Outbox pattern**: كل تعديل محلي على الكيانات المزامَنة يُسجَّل في `Outbox` (الصف كاملاً). العامل `sync-worker` يدفع الدُفعات إلى `/api/sync/push` ويسحب من `/api/sync/pull` بمؤشّر زمني.
- **التعارض**: Last-Write-Wins على `updatedAt`؛ النسخة الخاسرة تُحفظ (`TranslationVersion` أو `KhutbahVersion` "conflict copy").
- منع الصدى: التطبيق عند الاستقبال يكتب مباشرة في الجداول (لا outbox)، ومعرّفات المدخلات تُسجَّل في `SyncApplied` (idempotent).
- **Bootstrap**: edge جديد بلا بيانات يطلب `/api/sync/bootstrap` (لقطة كاملة) ويطبّقها.
- **التحديث**: السحابة تنشر `edge.latestImageTag`؛ الـ edge يعرضه في لوحة الإدارة وسكربت `infra/scripts/edge-update.sh` يسحب الصورة ويعيد التشغيل.

## 7. النسخ الاحتياطي

- النسخة = JSON مضغوط (gzip) لكل جداول المسجد، قابلة للاستعادة عبر Prisma فقط (لا حاجة لـ `pg_dump` داخل صورة الـ API؛ تعمل على أي معمارية). في السحابة يوجد إضافةً `db-backup` بـ `pg_dump` يومي لكامل القاعدة.
- الاستعادة تستبدل محتوى المسجد بالكامل وتدمج المستخدمين بالبريد (تحافظ على كلمات المرور الحالية).

## 8. الشاشات والجوال

- كل شاشة لها token عشوائي (URL) بدون تسجيل دخول؛ إعادة توليد التوكن يقطع الاتصال فوراً.
- الصفحة العامة `/display/m/<slug>` تعمل بدون token (إذا `publicDisplayEnabled`) ويصل إليها المصلّون عبر QR على شاشة الانتظار.
- الخطوط: Naskh للعربية، Nastaliq للأردو، Noto Sans Bengali/Ethiopic/SC/Devanagari/Tamil/Malayalam… مع line-height خاص لكل نص.

## 9. الأمان

- Rate limiting عبر Redis (10/دقيقة للمصادقة، 300/دقيقة عام)، Helmet، CORS مضبوط، تجديد التوكن أحادي الاستخدام.
- Audit log لكل تعديل على النصوص/الترجمات/الإعدادات/المستخدمين/الموفّرين مع before/after.
- مفاتيح المزامنة تُخزَّن hashed (SHA-256) ويمكن تدويرها من لوحة Super Admin.

## 10. ما لم يُنفَّذ عمداً / حدود معروفة

- إرسال البريد للدعوات غير مضمّن (لا SMTP مفترض): الدعوة تُنشئ رابطاً يُرسل يدوياً.
- RLS غير مُفعَّل بالقوة على دور التطبيق (انظر §2).
- الترجمة الآلية داخل الخطبة الحية غير مدعومة (التصميم يفترض ترجمة واعتماداً مسبقين؛ الارتجال يعرض "الإمام يتحدث").
