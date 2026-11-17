import { useId, type ReactNode } from 'react';

// Filled versions of the tab bar's icons (lucide's House, Dumbbell, ChartLine, NotebookText, same shapes and 24-unit
// box), shown on the current tab only, like YouTube's bar: outlines elsewhere, a solid icon where you are. Coloured by
// CSS (`.tab.active svg`: the accent's #lt-ink gradient on both fill and stroke). Each tab draws both, and CSS shows
// the filled one on `.tab.active`, since a swipe marks the tab by its class without a re-render (useTabSwipe's markTab).

/** A mask id safe inside url(#…): React's ids contain characters that can break it. */
const useMaskId = () => `t${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

type Props = { size?: number; className?: string };

function Icon({ size = 24, className, children }: Props & { children: ReactNode }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** The house, solid, with its door cut out. */
export function HouseFill({ size, className }: Props) {
  const mask = useMaskId();
  return (
    <Icon size={size} className={className}>
      <mask id={mask}>
        <rect width="24" height="24" fill="#fff" />
        <rect x="9.4" y="13.2" width="5.2" height="10" rx="1.2" fill="#000" />
      </mask>
      <path className="fill" mask={`url(#${mask})`} d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

/** The dumbbell with solid plates. */
export function DumbbellFill({ size, className }: Props) {
  return (
    <Icon size={size} className={className}>
      <path className="fill" d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
      <path d="m2.5 21.5 1.4-1.4" />
      <path d="m20.1 3.9 1.4-1.4" />
      <path className="fill" d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
      <path d="m9.6 14.4 4.8-4.8" />
    </Icon>
  );
}

/** The chart, its line filled in below as an area. */
export function ChartLineFill({ size, className }: Props) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path className="fill" d="M7 13l3-3 4 4 5-5v7a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

/** The notebook, solid, its lines of text cut out. */
export function NotebookTextFill({ size, className }: Props) {
  const mask = useMaskId();
  return (
    <Icon size={size} className={className}>
      <mask id={mask}>
        <rect width="24" height="24" fill="#fff" />
        <path d="M9.5 8h5M9.5 12H16M9.5 16H14" stroke="#000" />
      </mask>
      <rect className="fill" mask={`url(#${mask})`} width="16" height="20" x="4" y="2" rx="2" />
      <path d="M2 6h4M2 10h4M2 14h4M2 18h4" />
    </Icon>
  );
}
