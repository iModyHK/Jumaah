import { freeCost } from '../cost.js';
import { ProviderError, type CostLine, type HealthResult, type TranslateRequest, type TranslateResult, type TranslationProvider } from '../types.js';

/**
 * Manual provider: never produces text automatically. It exists so the chain can end in "needs a human"
 * and so imports/uploads are attributed to a provider type. `translate` always throws MANUAL_REQUIRED.
 */
export class ManualProvider implements TranslationProvider {
  readonly type = 'MANUAL' as const;
  readonly name = 'Manual';
  readonly supportsBatch = true;
  readonly maxBatchItems = 1000;
  readonly requiresInternet = false;

  async translate(req: TranslateRequest): Promise<TranslateResult> {
    throw new ProviderError('MANUAL', 'MANUAL_REQUIRED', `${req.items.length} paragraph(s) require manual translation`);
  }

  estimateCost(): CostLine {
    return freeCost('MANUAL', 'Human translation');
  }

  async healthCheck(): Promise<HealthResult> {
    return { ok: true, message: 'Manual entry always available' };
  }
}
