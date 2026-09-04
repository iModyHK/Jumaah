/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { hashPassword, sha256 } from './crypto.js';
import { paragraphHash, estimateSeconds, splitIntoParagraphs, toHijri, nextFriday } from '@jumaah/shared';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@jumaah.app';
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin12345!';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo12345!';
const DEMO_SLUG = 'demo';

// Fixed tokens so docs / e2e tests can reference them.
export const DEMO_DISPLAY_TOKEN_MAIN = 'demo-main-display-token-0001';
export const DEMO_DISPLAY_TOKEN_HALL = 'demo-hall-display-token-0002';
export const DEMO_SYNC_KEY = 'demo-sync-key-change-me';

const FIRST_KHUTBAH_AR = `الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين، نبينا محمد وعلى آله وصحبه أجمعين. أما بعد، فأوصيكم عباد الله ونفسي بتقوى الله عز وجل، فإنها وصية الله للأولين والآخرين.

قال تعالى: ﴿يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ حَقَّ تُقَاتِهِ وَلَا تَمُوتُنَّ إِلَّا وَأَنتُم مُّسْلِمُونَ﴾ [آل عمران: 102]

عباد الله، إن الشكر من أعظم العبادات التي أمر الله بها عباده، وهو قيد النعم، فما شُكرت نعمة إلا زادت، وما كُفرت نعمة إلا زالت. والشكر يكون بالقلب اعترافاً، وباللسان ذكراً، وبالجوارح عملاً.

قال رسول الله صلى الله عليه وسلم: «من لا يشكر الناس لا يشكر الله» رواه الترمذي.

فتأملوا يا عباد الله نعم الله عليكم في أبدانكم وأهليكم وأرزاقكم، واسألوا أنفسكم: هل أدّينا حق هذه النعم؟ وهل استعملناها فيما يرضي ربنا؟

أقول قولي هذا وأستغفر الله لي ولكم ولسائر المسلمين من كل ذنب، فاستغفروه إنه هو الغفور الرحيم.`;

const SECOND_KHUTBAH_AR = `الحمد لله على إحسانه، والشكر له على توفيقه وامتنانه، وأشهد أن لا إله إلا الله وحده لا شريك له، وأشهد أن محمداً عبده ورسوله، صلى الله عليه وعلى آله وصحبه وسلم تسليماً كثيراً.

أما بعد، عباد الله، اعلموا أن من أعظم أسباب دوام النعم شكرها بالعمل الصالح، وبذل المعروف، وصلة الأرحام، والإحسان إلى الفقراء والمساكين.

فاتقوا الله عباد الله، واعلموا أن الله أمركم بأمر بدأ فيه بنفسه، فقال: ﴿إِنَّ اللَّهَ وَمَلَائِكَتَهُ يُصَلُّونَ عَلَى النَّبِيِّ يَا أَيُّهَا الَّذِينَ آمَنُوا صَلُّوا عَلَيْهِ وَسَلِّمُوا تَسْلِيمًا﴾ [الأحزاب: 56]`;

const DUA_AR = `اللهم أعز الإسلام والمسلمين، وأذل الشرك والمشركين، ودمر أعداء الدين، واحمِ حوزة الدين يا رب العالمين.

اللهم اغفر للمسلمين والمسلمات، والمؤمنين والمؤمنات، الأحياء منهم والأموات، إنك سميع قريب مجيب الدعوات.

ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار. عباد الله، اذكروا الله يذكركم، واشكروه على نعمه يزدكم، ولذكر الله أكبر، والله يعلم ما تصنعون.`;

type Tr = Record<string, string[]>; // lang -> paragraph translations in order

const FIRST_TR: Tr = {
  en: [
    'All praise is due to Allah, Lord of the worlds, and peace and blessings be upon the noblest of the prophets and messengers, our Prophet Muhammad, and upon his family and all his companions. To proceed: I advise you, servants of Allah, and myself, to fear Allah the Almighty, for it is His counsel to the first and the last of creation.',
    'Allah the Exalted says: "O you who believe, fear Allah as He should be feared, and do not die except as Muslims." [Aal Imran: 102]',
    'Servants of Allah, gratitude is among the greatest acts of worship Allah commanded His servants. It is the tether of blessings: no blessing was ever thanked except that it grew, and none was ever denied except that it vanished. Gratitude is acknowledgement with the heart, remembrance with the tongue, and action with the limbs.',
    'The Messenger of Allah, peace and blessings be upon him, said: "Whoever does not thank people does not thank Allah." Narrated by At-Tirmidhi.',
    'So reflect, servants of Allah, on the blessings of Allah upon you in your bodies, your families, and your provision, and ask yourselves: have we fulfilled the right of these blessings? Have we used them in what pleases our Lord?',
    'I say these words of mine and I seek the forgiveness of Allah for myself, for you, and for all Muslims from every sin, so seek His forgiveness; indeed He is the Oft-Forgiving, the Most Merciful.',
  ],
  ur: [
    'تمام تعریفیں اللہ کے لیے ہیں جو تمام جہانوں کا رب ہے، اور درود و سلام ہو انبیاء اور رسولوں میں سب سے افضل، ہمارے نبی محمد ﷺ پر، اور ان کی آل اور تمام صحابہ پر۔ اما بعد: اللہ کے بندو! میں آپ کو اور اپنے آپ کو اللہ عز وجل کے تقویٰ کی وصیت کرتا ہوں، کیونکہ یہی اللہ کی وصیت ہے اولین و آخرین کے لیے۔',
    'اللہ تعالیٰ فرماتا ہے: "اے ایمان والو! اللہ سے ڈرو جیسا کہ اس سے ڈرنے کا حق ہے، اور تمہیں موت نہ آئے مگر اس حال میں کہ تم مسلمان ہو۔" [آل عمران: 102]',
    'اللہ کے بندو! شکر ان عظیم ترین عبادات میں سے ہے جن کا اللہ نے اپنے بندوں کو حکم دیا ہے، اور یہ نعمتوں کی حفاظت کا ذریعہ ہے۔ جس نعمت کا شکر ادا کیا گیا وہ بڑھ گئی، اور جس نعمت کی ناشکری کی گئی وہ ختم ہو گئی۔ شکر دل سے اعتراف، زبان سے ذکر اور اعضاء سے عمل کے ذریعے ہوتا ہے۔',
    'رسول اللہ ﷺ نے فرمایا: "جو لوگوں کا شکر ادا نہیں کرتا وہ اللہ کا شکر ادا نہیں کرتا۔" اسے ترمذی نے روایت کیا۔',
    'اللہ کے بندو! اپنے جسموں، اپنے اہل و عیال اور اپنے رزق میں اللہ کی نعمتوں پر غور کرو، اور اپنے آپ سے پوچھو: کیا ہم نے ان نعمتوں کا حق ادا کیا؟ کیا ہم نے انہیں اپنے رب کی رضا میں استعمال کیا؟',
    'میں اپنی یہ بات کہتا ہوں اور اپنے لیے، آپ کے لیے اور تمام مسلمانوں کے لیے ہر گناہ سے اللہ سے مغفرت مانگتا ہوں، پس اس سے مغفرت مانگو، بے شک وہ بخشنے والا مہربان ہے۔',
  ],
  bn: [
    'সমস্ত প্রশংসা আল্লাহর জন্য, যিনি জগৎসমূহের প্রতিপালক। শান্তি ও রহমত বর্ষিত হোক নবী ও রাসূলগণের শ্রেষ্ঠ আমাদের নবী মুহাম্মাদ (সা.)-এর উপর, তাঁর পরিবার ও সকল সাহাবীর উপর। অতঃপর: হে আল্লাহর বান্দাগণ! আমি আপনাদের ও নিজেকে মহান আল্লাহকে ভয় করার উপদেশ দিচ্ছি, কেননা এটিই পূর্ববর্তী ও পরবর্তীদের প্রতি আল্লাহর উপদেশ।',
    'আল্লাহ তাআলা বলেন: "হে ঈমানদারগণ! তোমরা আল্লাহকে যথাযথভাবে ভয় কর এবং মুসলিম না হয়ে মৃত্যুবরণ করো না।" [আলে ইমরান: ১০২]',
    'হে আল্লাহর বান্দাগণ! কৃতজ্ঞতা সেই মহান ইবাদতসমূহের অন্যতম যার নির্দেশ আল্লাহ তাঁর বান্দাদের দিয়েছেন। এটি নেয়ামতের রক্ষাকবচ: যে নেয়ামতের শোকর করা হয় তা বৃদ্ধি পায়, আর যে নেয়ামতের অকৃতজ্ঞতা করা হয় তা বিলুপ্ত হয়। কৃতজ্ঞতা হয় অন্তরে স্বীকৃতি, জিহ্বায় স্মরণ এবং অঙ্গ-প্রত্যঙ্গে আমলের মাধ্যমে।',
    'রাসূলুল্লাহ (সা.) বলেছেন: "যে মানুষের কৃতজ্ঞতা প্রকাশ করে না, সে আল্লাহর কৃতজ্ঞতা প্রকাশ করে না।" তিরমিযী বর্ণনা করেছেন।',
    'হে আল্লাহর বান্দাগণ! আপনাদের দেহ, পরিবার ও রিযিকে আল্লাহর নেয়ামতসমূহ নিয়ে চিন্তা করুন এবং নিজেদের জিজ্ঞাসা করুন: আমরা কি এই নেয়ামতের হক আদায় করেছি? আমরা কি তা আমাদের রবের সন্তুষ্টির কাজে ব্যবহার করেছি?',
    'আমি আমার এই কথা বলছি এবং আমার, আপনাদের ও সকল মুসলমানের জন্য প্রতিটি গুনাহ থেকে আল্লাহর কাছে ক্ষমা প্রার্থনা করছি। সুতরাং তাঁর কাছে ক্ষমা চান, নিশ্চয়ই তিনি ক্ষমাশীল, পরম দয়ালু।',
  ],
};

const SECOND_TR: Tr = {
  en: [
    'All praise is due to Allah for His beneficence, and thanks to Him for His guidance and favour. I bear witness that there is no god but Allah alone, without partner, and I bear witness that Muhammad is His servant and Messenger; may Allah send abundant peace and blessings upon him, his family and his companions.',
    'To proceed: servants of Allah, know that among the greatest means of preserving blessings is to be grateful for them through righteous deeds, generosity, maintaining family ties, and kindness to the poor and needy.',
    'So fear Allah, servants of Allah, and know that Allah has commanded you with a command He began with Himself, saying: "Indeed, Allah and His angels send blessings upon the Prophet. O you who believe, send blessings upon him and greet him with peace." [Al-Ahzab: 56]',
  ],
  ur: [
    'تمام تعریفیں اللہ کے لیے ہیں اس کے احسان پر، اور شکر ہے اس کی توفیق اور عطا پر۔ میں گواہی دیتا ہوں کہ اللہ کے سوا کوئی معبود نہیں، وہ اکیلا ہے، اس کا کوئی شریک نہیں، اور میں گواہی دیتا ہوں کہ محمد ﷺ اس کے بندے اور رسول ہیں، اللہ ان پر، ان کی آل اور صحابہ پر بہت زیادہ درود و سلام بھیجے۔',
    'اما بعد: اللہ کے بندو! جان لو کہ نعمتوں کے دوام کے عظیم ترین اسباب میں سے نیک عمل، بھلائی، صلہ رحمی اور فقراء و مساکین کے ساتھ احسان کے ذریعے ان کا شکر ادا کرنا ہے۔',
    'پس اللہ سے ڈرو اللہ کے بندو! اور جان لو کہ اللہ نے تمہیں ایک ایسا حکم دیا جس کی ابتدا اس نے خود اپنے آپ سے کی، فرمایا: "بے شک اللہ اور اس کے فرشتے نبی پر درود بھیجتے ہیں۔ اے ایمان والو! تم بھی ان پر درود اور خوب سلام بھیجو۔" [الاحزاب: 56]',
  ],
  bn: [
    'সমস্ত প্রশংসা আল্লাহর জন্য তাঁর অনুগ্রহের কারণে এবং কৃতজ্ঞতা তাঁর তাওফীক ও দানের জন্য। আমি সাক্ষ্য দিচ্ছি যে আল্লাহ ছাড়া কোনো ইলাহ নেই, তিনি এক, তাঁর কোনো শরীক নেই; এবং আমি সাক্ষ্য দিচ্ছি যে মুহাম্মাদ (সা.) তাঁর বান্দা ও রাসূল। আল্লাহ তাঁর উপর, তাঁর পরিবার ও সাহাবীদের উপর অগণিত শান্তি ও রহমত বর্ষণ করুন।',
    'অতঃপর: হে আল্লাহর বান্দাগণ! জেনে রাখুন, নেয়ামত স্থায়ী হওয়ার অন্যতম প্রধান উপায় হলো নেক আমল, দানশীলতা, আত্মীয়তার সম্পর্ক রক্ষা এবং দরিদ্র ও অভাবীদের প্রতি অনুগ্রহের মাধ্যমে কৃতজ্ঞতা প্রকাশ করা।',
    'সুতরাং আল্লাহকে ভয় করুন, হে আল্লাহর বান্দাগণ! এবং জেনে রাখুন, আল্লাহ আপনাদের এমন একটি বিষয়ের আদেশ দিয়েছেন যা তিনি নিজে থেকে শুরু করেছেন। তিনি বলেন: "নিশ্চয়ই আল্লাহ ও তাঁর ফেরেশতাগণ নবীর উপর দরূদ পাঠান। হে ঈমানদারগণ! তোমরাও তাঁর উপর দরূদ পাঠাও এবং যথাযথভাবে সালাম পেশ কর।" [আল-আহযাব: ৫৬]',
  ],
};

const DUA_TR: Tr = {
  en: [
    'O Allah, grant honour to Islam and the Muslims, humiliate polytheism and the polytheists, destroy the enemies of the religion, and protect the sanctity of the religion, O Lord of the worlds.',
    'O Allah, forgive the Muslim men and women, the believing men and women, the living among them and the dead; indeed You are All-Hearing, Near, and Answering of supplications.',
    'Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire. Servants of Allah, remember Allah and He will remember you; thank Him for His blessings and He will increase you. The remembrance of Allah is greater, and Allah knows what you do.',
  ],
  ur: [
    'اے اللہ! اسلام اور مسلمانوں کو عزت دے، شرک اور مشرکوں کو ذلیل کر، دین کے دشمنوں کو تباہ کر، اور دین کی حفاظت فرما اے رب العالمین۔',
    'اے اللہ! مسلمان مردوں اور عورتوں، مومن مردوں اور عورتوں کو بخش دے، ان میں سے زندہ اور فوت شدہ سب کو، بے شک تو سننے والا، قریب اور دعاؤں کو قبول کرنے والا ہے۔',
    'اے ہمارے رب! ہمیں دنیا میں بھلائی دے اور آخرت میں بھلائی دے اور ہمیں آگ کے عذاب سے بچا۔ اللہ کے بندو! اللہ کو یاد کرو وہ تمہیں یاد کرے گا، اس کی نعمتوں پر اس کا شکر کرو وہ تمہیں زیادہ دے گا، اور اللہ کا ذکر سب سے بڑا ہے، اور اللہ جانتا ہے جو تم کرتے ہو۔',
  ],
  bn: [
    'হে আল্লাহ! ইসলাম ও মুসলমানদের সম্মানিত করুন, শিরক ও মুশরিকদের লাঞ্ছিত করুন, দ্বীনের শত্রুদের ধ্বংস করুন এবং দ্বীনের সীমানা রক্ষা করুন, হে জগৎসমূহের প্রতিপালক।',
    'হে আল্লাহ! মুসলিম নর-নারী ও মুমিন নর-নারীদের ক্ষমা করুন, তাদের মধ্যে যারা জীবিত ও যারা মৃত। নিশ্চয়ই আপনি সর্বশ্রোতা, নিকটবর্তী ও দোয়া কবুলকারী।',
    'হে আমাদের রব! আমাদেরকে দুনিয়ায় কল্যাণ দিন এবং আখিরাতেও কল্যাণ দিন, আর আমাদেরকে জাহান্নামের শাস্তি থেকে রক্ষা করুন। হে আল্লাহর বান্দাগণ! আল্লাহকে স্মরণ করুন, তিনি আপনাদের স্মরণ করবেন; তাঁর নেয়ামতের শোকর করুন, তিনি আপনাদের বাড়িয়ে দেবেন। আল্লাহর স্মরণই সর্বশ্রেষ্ঠ, আর আপনারা যা করেন আল্লাহ তা জানেন।',
  ],
};

async function main() {
  console.log('Seeding…');

  // ---- Super admin (no tenant)
  const superAdmin = await prisma.user.upsert({
    where: { id: 'seed-super-admin' },
    update: {},
    create: {
      id: 'seed-super-admin',
      email: SUPER_ADMIN_EMAIL,
      name: 'Platform Admin',
      role: 'SUPER_ADMIN',
      passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD),
      locale: 'ar',
    },
  });

  // ---- Demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_SLUG },
    update: {},
    create: {
      id: 'seed-tenant-demo',
      name: 'المسجد التجريبي',
      slug: DEMO_SLUG,
      timezone: 'Asia/Riyadh',
      locale: 'ar',
      plan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      librarySharingAllowed: true,
      syncKeyHash: sha256(DEMO_SYNC_KEY),
      settings: {
        welcomeMessage: 'مرحباً بكم في المسجد التجريبي — تقبل الله طاعتكم',
        welcomeMessageEn: 'Welcome to the Demo Mosque',
        prayerTimes: { fajr: '04:35', dhuhr: '12:05', asr: '15:30', maghrib: '18:20', isha: '19:50', jumuah: '12:15' },
        wordsPerMinute: 110,
        defaultProviderChain: ['ANTHROPIC', 'GOOGLE', 'OLLAMA'],
        publicDisplayEnabled: true,
      },
      languages: {
        create: [
          { code: 'en', order: 0 },
          { code: 'ur', order: 1 },
          { code: 'bn', order: 2 },
          { code: 'tr', order: 3, enabled: false },
          { code: 'id', order: 4, enabled: false },
        ],
      },
    },
  });

  // ---- Users
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const users = [
    { id: 'seed-user-admin', email: 'admin@demo.mosque', name: 'أحمد المدير', role: 'MOSQUE_ADMIN' as const },
    { id: 'seed-user-translator', email: 'translator@demo.mosque', name: 'خالد المترجم', role: 'TRANSLATOR' as const },
    { id: 'seed-user-imam', email: 'imam@demo.mosque', name: 'الشيخ عبدالله', role: 'IMAM' as const },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { ...u, tenantId: tenant.id, passwordHash: demoHash, locale: 'ar' },
    });
  }

  // ---- Displays
  await prisma.display.upsert({
    where: { token: DEMO_DISPLAY_TOKEN_MAIN },
    update: {},
    create: {
      id: 'seed-display-main',
      tenantId: tenant.id,
      name: 'الشاشة الرئيسية',
      token: DEMO_DISPLAY_TOKEN_MAIN,
      languages: ['en', 'ur'],
      layout: 'split',
      fontScale: 1.2,
      theme: 'dark',
      location: 'القاعة الرئيسية',
    },
  });
  await prisma.display.upsert({
    where: { token: DEMO_DISPLAY_TOKEN_HALL },
    update: {},
    create: {
      id: 'seed-display-hall',
      tenantId: tenant.id,
      name: 'شاشة القاعة الخارجية',
      token: DEMO_DISPLAY_TOKEN_HALL,
      languages: ['en', 'ur', 'bn'],
      layout: 'grid',
      fontScale: 1,
      theme: 'green',
      location: 'القاعة الخارجية',
    },
  });

  // ---- Glossary
  const glossary = [
    { term: 'الله', lang: '*', mode: 'KEEP' as const, replacement: 'Allah', note: 'Never translate as "God" in English.' },
    { term: 'صلى الله عليه وسلم', lang: 'en', mode: 'REPLACE' as const, replacement: 'peace and blessings be upon him' },
    { term: 'صلى الله عليه وسلم', lang: 'ur', mode: 'REPLACE' as const, replacement: 'ﷺ' },
    { term: 'زكاة', lang: 'en', mode: 'REPLACE' as const, replacement: 'Zakah' },
    { term: 'الخطبة', lang: 'en', mode: 'REPLACE' as const, replacement: 'khutbah' },
    { term: 'تقوى', lang: 'en', mode: 'HINT' as const, replacement: 'taqwa (God-consciousness)', note: 'Prefer "fear of Allah" or "taqwa"' },
  ];
  for (const g of glossary) {
    await prisma.glossaryEntry.upsert({
      where: { tenantId_term_lang: { tenantId: tenant.id, term: g.term, lang: g.lang } },
      update: {},
      create: { tenantId: tenant.id, ...g },
    });
  }

  // ---- Providers (no keys; edge works offline with Ollama / LibreTranslate)
  const providers = [
    { id: 'seed-prov-manual', type: 'MANUAL' as const, name: 'إدخال يدوي', priority: 100 },
    { id: 'seed-prov-ollama', type: 'OLLAMA' as const, name: 'نموذج محلي (Ollama)', priority: 30, baseUrl: 'http://ollama:11434', model: 'qwen2.5:7b' },
    { id: 'seed-prov-libre', type: 'LIBRETRANSLATE' as const, name: 'LibreTranslate محلي', priority: 40, baseUrl: 'http://libretranslate:5000' },
    { id: 'seed-prov-anthropic', type: 'ANTHROPIC' as const, name: 'Anthropic Claude', priority: 10, model: 'claude-sonnet-5', enabled: false },
  ];
  for (const p of providers) {
    await prisma.providerConfig.upsert({ where: { id: p.id }, update: {}, create: { tenantId: tenant.id, ...p } });
  }

  // ---- Sample khutbah
  const existing = await prisma.khutbah.findFirst({ where: { id: 'seed-khutbah-1' } });
  if (!existing) {
    const friday = nextFriday();
    const khutbah = await prisma.khutbah.create({
      data: {
        id: 'seed-khutbah-1',
        tenantId: tenant.id,
        title: 'شكر النعم',
        gregorianDate: friday,
        hijriDate: toHijri(friday).formatted,
        imamName: 'الشيخ عبدالله',
        status: 'READY',
        targetLanguages: ['en', 'ur', 'bn'],
        createdById: 'seed-user-admin',
      },
    });

    const sections: Array<{ type: 'FIRST' | 'SECOND' | 'DUA'; text: string; tr: Tr }> = [
      { type: 'FIRST', text: FIRST_KHUTBAH_AR, tr: FIRST_TR },
      { type: 'SECOND', text: SECOND_KHUTBAH_AR, tr: SECOND_TR },
      { type: 'DUA', text: DUA_AR, tr: DUA_TR },
    ];

    let sectionOrder = 0;
    for (const s of sections) {
      const section = await prisma.khutbahSection.create({
        data: { khutbahId: khutbah.id, tenantId: tenant.id, type: s.type, order: sectionOrder++ },
      });
      const paragraphs = splitIntoParagraphs(s.text);
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const para = await prisma.paragraph.create({
          data: {
            sectionId: section.id,
            tenantId: tenant.id,
            order: i,
            kind: p.kind,
            reference: p.reference ?? null,
            textAr: p.text,
            hash: paragraphHash(p.text),
            estimatedSeconds: estimateSeconds(p.text),
          },
        });
        for (const [lang, texts] of Object.entries(s.tr)) {
          const text = texts[i];
          if (!text) continue;
          const t = await prisma.translation.create({
            data: {
              paragraphId: para.id,
              tenantId: tenant.id,
              lang,
              text,
              status: 'APPROVED',
              providerType: 'MANUAL',
              approvedById: 'seed-user-translator',
              reviewedById: 'seed-user-translator',
            },
          });
          await prisma.translationVersion.create({
            data: { translationId: t.id, tenantId: tenant.id, version: 1, text, status: 'APPROVED', providerType: 'MANUAL' },
          });
        }
      }
    }
    await prisma.khutbahVersion.create({
      data: {
        khutbahId: khutbah.id,
        tenantId: tenant.id,
        version: 1,
        changeNote: 'Initial seed',
        snapshot: { sections: sections.map((s) => ({ type: s.type, rawText: s.text })) },
      },
    });

    // A second, draft khutbah with no translations for testing the workflow
    const nextWeek = new Date(friday);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const draft = await prisma.khutbah.create({
      data: {
        id: 'seed-khutbah-2',
        tenantId: tenant.id,
        title: 'بر الوالدين',
        gregorianDate: nextWeek,
        hijriDate: toHijri(nextWeek).formatted,
        status: 'DRAFT',
        targetLanguages: ['en', 'ur'],
        createdById: 'seed-user-admin',
      },
    });
    const draftText = `الحمد لله الذي أمر بالإحسان إلى الوالدين، وجعل رضاه في رضاهما. أما بعد:

قال تعالى: ﴿وَقَضَىٰ رَبُّكَ أَلَّا تَعْبُدُوا إِلَّا إِيَّاهُ وَبِالْوَالِدَيْنِ إِحْسَانًا﴾ [الإسراء: 23]

عباد الله، إن بر الوالدين من أعظم القربات، وعقوقهما من أكبر الكبائر.`;
    const draftSection = await prisma.khutbahSection.create({
      data: { khutbahId: draft.id, tenantId: tenant.id, type: 'FIRST', order: 0 },
    });
    const dps = splitIntoParagraphs(draftText);
    for (let i = 0; i < dps.length; i++) {
      await prisma.paragraph.create({
        data: {
          sectionId: draftSection.id,
          tenantId: tenant.id,
          order: i,
          kind: dps[i].kind,
          reference: dps[i].reference ?? null,
          textAr: dps[i].text,
          hash: paragraphHash(dps[i].text),
          estimatedSeconds: estimateSeconds(dps[i].text),
        },
      });
    }
  }

  await prisma.syncState.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id, deviceId: 'seed-edge-device' },
  });

  await prisma.platformSetting.upsert({
    where: { key: 'edge.latestImageTag' },
    update: {},
    create: { key: 'edge.latestImageTag', value: { tag: process.env.IMAGE_TAG ?? '1.0.0' } },
  });

  console.log(`Seeded. Super admin: ${superAdmin.email} / ${SUPER_ADMIN_PASSWORD}`);
  console.log(`Demo tenant "${tenant.slug}": admin@demo.mosque, translator@demo.mosque, imam@demo.mosque / ${DEMO_PASSWORD}`);
  console.log(`Display tokens: ${DEMO_DISPLAY_TOKEN_MAIN}, ${DEMO_DISPLAY_TOKEN_HALL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
