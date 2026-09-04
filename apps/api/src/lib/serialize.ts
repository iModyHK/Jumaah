import type {
  Display,
  GlossaryEntry,
  Khutbah,
  KhutbahSection,
  Paragraph,
  ProviderConfig,
  Tenant,
  TenantLanguage,
  Translation,
  TranslationJob,
  User,
} from '@jumaah/db';
import type {
  DisplayDto,
  GlossaryDto,
  KhutbahDto,
  KhutbahStats,
  ParagraphDto,
  ProviderConfigDto,
  SectionDto,
  TenantDto,
  TranslationDto,
  TranslationJobDto,
  UserDto,
} from '@jumaah/shared';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function tenantDto(t: Tenant & { languages?: TenantLanguage[]; _count?: TenantDto['_count'] }): TenantDto {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    timezone: t.timezone,
    locale: t.locale as 'ar' | 'en',
    plan: t.plan,
    subscriptionStatus: t.subscriptionStatus,
    subscriptionEndsAt: iso(t.subscriptionEndsAt),
    librarySharingAllowed: t.librarySharingAllowed,
    settings: (t.settings as Record<string, unknown>) ?? {},
    languages: (t.languages ?? []).filter((l) => l.enabled).sort((a, b) => a.order - b.order).map((l) => l.code),
    createdAt: t.createdAt.toISOString(),
    _count: t._count,
  };
}

export function userDto(u: User): UserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    tenantId: u.tenantId,
    isActive: u.isActive,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt.toISOString(),
  };
}

export function translationDto(t: Translation): TranslationDto {
  return {
    id: t.id,
    paragraphId: t.paragraphId,
    lang: t.lang,
    text: t.text,
    status: t.status,
    providerType: t.providerType,
    version: t.version,
    reviewedById: t.reviewedById,
    approvedById: t.approvedById,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function paragraphDto(p: Paragraph & { translations?: Translation[] }): ParagraphDto {
  return {
    id: p.id,
    sectionId: p.sectionId,
    order: p.order,
    kind: p.kind,
    reference: p.reference,
    textAr: p.textAr,
    hash: p.hash,
    estimatedSeconds: p.estimatedSeconds,
    translations: (p.translations ?? []).map(translationDto),
  };
}

export function sectionDto(s: KhutbahSection & { paragraphs?: (Paragraph & { translations?: Translation[] })[] }): SectionDto {
  return {
    id: s.id,
    type: s.type,
    order: s.order,
    paragraphs: (s.paragraphs ?? []).sort((a, b) => a.order - b.order).map(paragraphDto),
  };
}

export type KhutbahWithTree = Khutbah & {
  sections?: (KhutbahSection & { paragraphs?: (Paragraph & { translations?: Translation[] })[] })[];
};

export function khutbahStats(k: KhutbahWithTree): KhutbahStats {
  const perLanguage: KhutbahStats['perLanguage'] = {};
  let paragraphs = 0;
  let estimatedSeconds = 0;
  for (const lang of k.targetLanguages) perLanguage[lang] = { approved: 0, reviewed: 0, machine: 0, pending: 0, rejected: 0 };
  for (const s of k.sections ?? []) {
    for (const p of s.paragraphs ?? []) {
      paragraphs += 1;
      estimatedSeconds += p.estimatedSeconds;
      for (const lang of k.targetLanguages) {
        const t = (p.translations ?? []).find((x) => x.lang === lang);
        const bucket = perLanguage[lang];
        if (!t || t.status === 'PENDING') bucket.pending += 1;
        else if (t.status === 'APPROVED') bucket.approved += 1;
        else if (t.status === 'REVIEWED') bucket.reviewed += 1;
        else if (t.status === 'MACHINE') bucket.machine += 1;
        else if (t.status === 'REJECTED') bucket.rejected += 1;
      }
    }
  }
  return { paragraphs, perLanguage, estimatedSeconds };
}

export function khutbahDto(k: KhutbahWithTree, withTree = false): KhutbahDto {
  return {
    id: k.id,
    tenantId: k.tenantId,
    title: k.title,
    hijriDate: k.hijriDate,
    gregorianDate: k.gregorianDate.toISOString().slice(0, 10),
    imamName: k.imamName,
    status: k.status,
    targetLanguages: k.targetLanguages,
    version: k.version,
    notes: k.notes,
    copiedFromId: k.copiedFromId,
    libraryId: k.libraryId,
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
    sections: withTree ? (k.sections ?? []).sort((a, b) => a.order - b.order).map(sectionDto) : undefined,
    stats: k.sections ? khutbahStats(k) : undefined,
  };
}

export function glossaryDto(g: GlossaryEntry): GlossaryDto {
  return { id: g.id, term: g.term, lang: g.lang, replacement: g.replacement, mode: g.mode, note: g.note };
}

export function providerDto(p: ProviderConfig): ProviderConfigDto {
  return {
    id: p.id,
    tenantId: p.tenantId,
    type: p.type,
    name: p.name,
    hasApiKey: !!p.apiKeyEncrypted,
    apiKeyHint: p.apiKeyHint,
    baseUrl: p.baseUrl,
    model: p.model,
    priority: p.priority,
    enabled: p.enabled,
    options: (p.options as Record<string, unknown>) ?? {},
    isGlobal: p.tenantId === null,
    lastTestedAt: iso(p.lastTestedAt),
    lastTestOk: p.lastTestOk,
  };
}

export function displayDto(d: Display): DisplayDto {
  return {
    id: d.id,
    name: d.name,
    token: d.token,
    languages: d.languages,
    layout: d.layout as DisplayDto['layout'],
    fontScale: d.fontScale,
    theme: d.theme,
    showPrevious: d.showPrevious,
    showArabic: d.showArabic,
    showQr: d.showQr,
    logoUrl: d.logoUrl,
    location: d.location,
    lastSeenAt: iso(d.lastSeenAt),
    createdAt: d.createdAt.toISOString(),
  };
}

export function jobDto(j: TranslationJob): TranslationJobDto {
  return {
    id: j.id,
    khutbahId: j.khutbahId,
    status: j.status,
    total: j.total,
    done: j.done,
    failed: j.failed,
    cached: j.cached,
    languages: j.languages,
    providerChain: j.providerChain as TranslationJobDto['providerChain'],
    error: j.error,
    startedAt: iso(j.startedAt),
    finishedAt: iso(j.finishedAt),
    createdAt: j.createdAt.toISOString(),
  };
}
