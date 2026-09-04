// Sample khutbah used by every interactive demo. One paragraph per entry, translations per language.
// The third entry is a Qur'anic verse: the demo shows a published translation (Saheeh International for English)
// exactly as the product would after a reviewer enters it, and never a machine translation.
export const DEMO_LANGS = [
  { code: "en", label: "English", dir: "ltr", font: "latin" },
  { code: "ur", label: "اردو", dir: "rtl", font: "urdu" },
  { code: "bn", label: "বাংলা", dir: "ltr", font: "bengali" },
  { code: "so", label: "Soomaali", dir: "ltr", font: "latin" },
];

export const DEMO_PARAGRAPHS = [
  {
    kind: "TEXT",
    ar: "الحمد لله رب العالمين، والصلاة والسلام على أشرف الأنبياء والمرسلين. أما بعد، فيا عباد الله، اتقوا الله حق تقاته.",
    en: "All praise is due to Allah, Lord of the worlds, and peace and blessings be upon the noblest of prophets and messengers. O servants of Allah, be mindful of Allah as He deserves.",
    ur: "تمام تعریفیں اللہ کے لیے ہیں جو تمام جہانوں کا رب ہے، اور درود و سلام ہو انبیاء اور رسولوں میں سب سے افضل پر۔ اے اللہ کے بندو! اللہ سے ایسے ڈرو جیسے ڈرنے کا حق ہے۔",
    bn: "সমস্ত প্রশংসা আল্লাহর, যিনি জগৎসমূহের প্রতিপালক, আর শান্তি ও রহমত বর্ষিত হোক সর্বশ্রেষ্ঠ নবী ও রাসূলের উপর। হে আল্লাহর বান্দারা, আল্লাহকে যথাযথভাবে ভয় করো।",
    so: "Mahad oo dhan Ilaahay baa iska leh, Rabbiga aduunyada, nabadgelyo iyo naxariisna ha ahaato Nabiga iyo Rasuullada ugu sharafta badan. Addoomaha Ilaahayow, Ilaahay ka cabsada sida ay tahay in laga cabsado.",
  },
  {
    kind: "TEXT",
    ar: "إن من نعم الله علينا أن جمعنا في هذا اليوم المبارك، يوم الجمعة، خير يوم طلعت عليه الشمس.",
    en: "Among Allah's blessings upon us is that He has gathered us on this blessed day, Friday, the best day on which the sun has ever risen.",
    ur: "اللہ کی نعمتوں میں سے ہے کہ اس نے ہمیں اس مبارک دن، جمعہ کے دن، جمع کیا، جو بہترین دن ہے جس پر سورج طلوع ہوا۔",
    bn: "আল্লাহর নিয়ামতসমূহের একটি হলো, তিনি আমাদেরকে এই বরকতময় দিনে, জুমুআর দিনে একত্রিত করেছেন, যে দিনটি সূর্য উদিত হওয়া দিনগুলোর মধ্যে সর্বোত্তম।",
    so: "Waxaa ka mid ah nimcooyinka Ilaahay inuu nagu soo kulmiyey maalintan barakaysan, maalinta Jimcaha, oo ah maalinta ugu wanaagsan ee qorraxdu soo baxday.",
  },
  {
    kind: "QURAN",
    reference: "Al-Jumu'ah 62:9",
    referenceAr: "الجمعة: ٩",
    ar: "﴿يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا نُودِيَ لِلصَّلَاةِ مِن يَوْمِ الْجُمُعَةِ فَاسْعَوْا إِلَىٰ ذِكْرِ اللَّهِ وَذَرُوا الْبَيْعَ﴾",
    en: "O you who have believed, when [the adhan] is called for the prayer on the day of Jumu'ah, then proceed to the remembrance of Allah and leave trade.",
    enSource: "Saheeh International",
    ur: "اے ایمان والو! جب جمعہ کے دن نماز کے لیے اذان دی جائے تو اللہ کے ذکر کی طرف دوڑو اور خرید و فروخت چھوڑ دو۔",
    bn: "হে মুমিনগণ, জুমুআর দিনে যখন সালাতের জন্য আহ্বান করা হয়, তখন তোমরা আল্লাহর স্মরণের দিকে ধাবিত হও এবং ক্রয়-বিক্রয় ত্যাগ করো।",
    so: "Kuwa xaqa rumeeyow, marka salaadda loogu yeero maalinta Jimcaha, u dhaqaaqa xuska Ilaahay oo ka taga ganacsiga.",
  },
  {
    kind: "TEXT",
    ar: "فاحرصوا رحمكم الله على التبكير إلى الجمعة، والإنصات للخطبة، وتعليم أبنائكم حب هذا اليوم.",
    en: "So be keen, may Allah have mercy on you, to come early to Friday prayer, to listen attentively to the khutbah, and to teach your children to love this day.",
    ur: "پس اللہ تم پر رحم کرے، جمعہ کے لیے جلدی آنے، خطبہ خاموشی سے سننے، اور اپنے بچوں کو اس دن سے محبت سکھانے کا اہتمام کرو۔",
    bn: "তাই, আল্লাহ তোমাদের প্রতি রহম করুন, জুমুআয় আগে আসতে, মনোযোগ দিয়ে খুতবা শুনতে এবং সন্তানদের এই দিনকে ভালোবাসতে শেখাতে যত্নবান হও।",
    so: "Ilaahay ha idiin naxariistee, ku dadaala inaad goor hore Jimcaha timaaddaan, khudbadda si feejignaan ah u dhegeysataan, oo carruurtiinna bartaan jacaylka maalintan.",
  },
];
