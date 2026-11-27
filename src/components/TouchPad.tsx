import type { ReactNode } from 'react';

export type PadButton = { key: string; label: string; aria: string; className?: string };

type Props = {
  buttons: PadButton[];
  onDown: (key: string) => void;
  onUp: (key: string) => void;
  className?: string;
  label: string;
  children?: ReactNode;
};

/**
 * Shared on-screen controls for games that need a d-pad or fire button.
 * Pointer events (not clicks) so holding a direction keeps working, and
 * the context menu is suppressed so a long press does not interrupt play.
 */
export function TouchPad({ buttons, onDown, onUp, className = '', label }: Props) {
  return (
    <div className={`touch-pad ${className}`} role="group" aria-label={label}>
      {buttons.map((button) => (
        <button
          key={`${button.key}-${button.className ?? ''}`}
          type="button"
          className={`touch-btn ${button.className ?? ''}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onDown(button.key);
          }}
          onPointerUp={() => onUp(button.key)}
          onPointerCancel={() => onUp(button.key)}
          onPointerLeave={() => onUp(button.key)}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={button.aria}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
