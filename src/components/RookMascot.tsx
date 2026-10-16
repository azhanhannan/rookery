import type { ReactNode } from 'react';

/**
 * Rookie, the coach mascot: a small cartoon rook with a beak and a wing (a rook is also a crow). Original
 * inline art. Only speaks lines that are proven true (Review's rule-based captions); see MascotSays.
 */
export function RookMascot({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Rookie the rook" className="shrink-0">
      {/* body: a rook tower with three battlements */}
      <path d="M14 10h8v6h6v-6h8v6h6v-6h8v14l-4 4v20l6 6v6H12v-6l6-6V28l-4-4z" fill="#3d4a5c" stroke="#232b36" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 28h28" stroke="#232b36" strokeWidth="2" />
      <path d="M14 54h36" stroke="#232b36" strokeWidth="2" />
      {/* face */}
      <circle cx="26" cy="36" r="5" fill="#fff" />
      <circle cx="38" cy="36" r="5" fill="#fff" />
      <circle cx="27" cy="37" r="2.4" fill="#1b1f24" />
      <circle cx="39" cy="37" r="2.4" fill="#1b1f24" />
      <circle cx="27.8" cy="36" r="0.8" fill="#fff" />
      <circle cx="39.8" cy="36" r="0.8" fill="#fff" />
      {/* beak */}
      <path d="M29 42l3 5 3-5z" fill="#f2a93b" stroke="#b9771b" strokeWidth="1" strokeLinejoin="round" />
      {/* cheeks */}
      <circle cx="21" cy="43" r="2.2" fill="#e88a9a" opacity="0.7" />
      <circle cx="43" cy="43" r="2.2" fill="#e88a9a" opacity="0.7" />
      {/* a little wing waving */}
      <path d="M46 40c6-2 9-7 8-11-3 1-6 4-8 7z" fill="#56657a" stroke="#232b36" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Rookie with a speech bubble. */
export function MascotSays({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="flex items-end gap-2" data-testid="mascot">
      <RookMascot />
      <div className="relative flex-1 rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-sm" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}
