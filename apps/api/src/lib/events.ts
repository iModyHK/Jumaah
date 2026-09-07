import type { AppContext } from './context.js';

/** Hand a domain event to the extensions (webhooks, network publishing, …). Never throws, never awaited. */
export function emitEvent(ctx: AppContext, tenantId: string, event: string, data: Record<string, unknown>): void {
  try {
    ctx.hooks.onEvent?.(ctx, tenantId, event, data);
  } catch (err) {
    ctx.log.warn({ err, event }, 'event hook failed');
  }
}
