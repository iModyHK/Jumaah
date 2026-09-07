import { ROOMS } from '@jumaah/core';
import type { AppContext } from './context.js';
import type { ViewerCounts } from './extensions.js';

/** Screens and phones connected to a mosque right now, across every API instance (the Redis adapter shares rooms). */
export async function viewerCounts(ctx: AppContext, tenantId: string): Promise<ViewerCounts> {
  try {
    const sockets = await ctx.io.in(ROOMS.displays(tenantId)).fetchSockets();
    let displays = 0;
    const phones = new Set<string>();
    let phoneSockets = 0;
    for (const s of sockets) {
      if (s.data.role === 'DISPLAY') displays += 1;
      else if (s.data.role === 'PUBLIC') {
        phoneSockets += 1;
        if (s.data.deviceId) phones.add(s.data.deviceId);
      }
    }
    return { displays, phones: phoneSockets, phoneDevices: [...phones] };
  } catch (err) {
    ctx.log.warn({ err, tenantId }, 'counting viewers failed');
    return { displays: 0, phones: 0, phoneDevices: [] };
  }
}

/** Screens + phones connected right now (what the imam and admin see as "active displays"). */
export async function viewerTotal(ctx: AppContext, tenantId: string): Promise<number> {
  const c = await viewerCounts(ctx, tenantId);
  return c.displays + c.phones;
}
