import { useId } from 'react';

// Filled icons for the press-and-hold menu (ContextMenu), drawn in the manner of iOS's own menus (solid shapes,
// rounded, the gaps cut out). Our own drawings: Apple's SF Symbols may only be used in apps on Apple's platforms, and
// this menu is web code. 24-unit box, coloured by `currentColor`.

const SIZE = 26;

/** A mask id safe inside url(#…): React's ids contain characters that can break it. */
const useMaskId = () => `m${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** A box with an arrow rising out of it, the box cut away around the arrow's shaft. */
export function ShareFill() {
  const mask = useMaskId();
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <mask id={mask}>
        <rect width="24" height="24" fill="#fff" />
        <rect x="9.6" y="7" width="4.8" height="9.8" rx="2.4" fill="#000" />
      </mask>
      <rect x="3.8" y="9.4" width="16.4" height="12.7" rx="2.8" fill="currentColor" mask={`url(#${mask})`} />
      <path d="M12 15.2V3.4M8.2 7.1 12 3.3l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A bin with its lid and handle, two lines cut into the can. */
export function TrashFill() {
  const mask = useMaskId();
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <mask id={mask}>
        <rect width="24" height="24" fill="#fff" />
        <path d="M10 11.6v6.2M14 11.6v6.2" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
      </mask>
      <path d="M9.2 5.2V4.1c0-.8.6-1.4 1.4-1.4h2.8c.8 0 1.4.6 1.4 1.4v1.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.4" y="5" width="17.2" height="2.6" rx="1.3" fill="currentColor" />
      <path
        mask={`url(#${mask})`}
        fill="currentColor"
        d="M5.4 8.9h13.2l-.9 10.6a2.6 2.6 0 0 1-2.6 2.4H8.9a2.6 2.6 0 0 1-2.6-2.4L5.4 8.9Z"
      />
    </svg>
  );
}

/** A rounded square, open at its top right, with a pencil writing into it. */
export function EditFill() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12.4 4.2H7.2a3 3 0 0 0-3 3v9.6a3 3 0 0 0 3 3h9.6a3 3 0 0 0 3-3v-5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path fill="currentColor" d="M18.2 2.9a1.9 1.9 0 0 1 2.7 0l.2.2a1.9 1.9 0 0 1 0 2.7l-8.4 8.4-3.6 1 1-3.6 8.1-8.7Z" />
    </svg>
  );
}

/** A solid pencil, tip at the bottom left. */
export function RenameFill() {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M16.3 3.4a2.2 2.2 0 0 1 3.1 0l1.2 1.2a2.2 2.2 0 0 1 0 3.1L9.4 18.9 3.6 20.4l1.5-5.8L16.3 3.4Z" />
      <path d="M13 20.2h7.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
