import type { Db } from '@jumaah/db';
import type { LiveKhutbah, LiveParagraph, TenantPublicInfo } from '@jumaah/shared';

/** Build the payload displays/imam receive: full khutbah tree with translation statuses. */
export async function buildLiveKhutbah(db: Db, tenantId: string, khutbahId: string): Promise<LiveKhutbah | null> {
  const k = await db.khutbah.findFirst({
    where: { id: khutbahId, tenantId, deletedAt: null },
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: { paragraphs: { orderBy: { order: 'asc' }, include: { translations: true } } },
      },
    },
  });
  if (!k) return null;
  const paragraphs: LiveParagraph[] = [];
  for (const s of k.sections) {
    for (const p of s.paragraphs) {
      const translations: LiveParagraph['translations'] = {};
      for (const t of p.translations) {
        if (!k.targetLanguages.includes(t.lang)) continue;
        // This payload reaches every screen and the unauthenticated phone page. Only approved text may leave the
        // server; drafts and reviewed-but-unapproved text stay in the admin API. The status is kept so clients can
        // show "translation pending" without ever seeing the draft.
        translations[t.lang] = { text: t.status === 'APPROVED' ? t.text : '', status: t.status };
      }
      paragraphs.push({
        id: p.id,
        sectionType: s.type,
        order: p.order,
        kind: p.kind,
        reference: p.reference,
        textAr: p.textAr,
        estimatedSeconds: p.estimatedSeconds,
        translations,
      });
    }
  }
  return {
    id: k.id,
    title: k.title,
    hijriDate: k.hijriDate,
    gregorianDate: k.gregorianDate.toISOString().slice(0, 10),
    imamName: k.imamName,
    targetLanguages: k.targetLanguages,
    sections: k.sections.map((s) => ({
      type: s.type,
      paragraphCount: s.paragraphs.length,
      firstParagraphId: s.paragraphs[0]?.id ?? null,
    })),
    paragraphs,
    version: k.version,
  };
}

export async function buildTenantPublicInfo(db: Db, tenantId: string): Promise<TenantPublicInfo | null> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, include: { languages: true } });
  if (!t) return null;
  const s = (t.settings as Record<string, unknown>) ?? {};
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    locale: t.locale as 'ar' | 'en',
    timezone: t.timezone,
    logoUrl: (s.logoUrl as string) ?? null,
    welcomeMessage: (s.welcomeMessage as string) ?? null,
    welcomeMessageEn: (s.welcomeMessageEn as string) ?? null,
    prayerTimes: (s.prayerTimes as Record<string, string>) ?? null,
    languages: t.languages.filter((l) => l.enabled).sort((a, b) => a.order - b.order).map((l) => l.code),
  };
}
