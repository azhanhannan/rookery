import { useCallback } from 'react';
import { formatSan } from '../game/notation';
import { usePlaySettings } from '../settings/playSettings';

/** SAN in the symbols chosen in Settings → Play (letters or figurines), for move lists. */
export function useSan(): (san: string) => string {
  const { pieceSymbols } = usePlaySettings();
  return useCallback((san: string) => formatSan(san, pieceSymbols), [pieceSymbols]);
}
