import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export const khutbahKey = (id: string) => ['khutbah', id] as const;

/** Invalidate the editor query (and lists) after a mutation. */
export function useInvalidateKhutbah(id: string): () => Promise<void> {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: khutbahKey(id) }), qc.invalidateQueries({ queryKey: ['khutbahs'] })]);
  }, [qc, id]);
}

/** Split a text file into blank-line separated blocks (one per paragraph). */
export function splitBlocks(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}
