import type { RatingCategory } from '../api/types';

export const CATEGORY_ORDER: RatingCategory[] = ['bullet', 'blitz', 'rapid', 'classical'];

export const CATEGORY_NAMES: Record<RatingCategory, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};
