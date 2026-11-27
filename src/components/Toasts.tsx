import { useToasts, dismissToast } from '../lib/toast';

export function Toasts() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast-${toast.kind}`}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="toast-icon">{toast.icon ?? '✨'}</span>
          <span className="toast-copy">
            <b>{toast.title}</b>
            {toast.body ? <small>{toast.body}</small> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
