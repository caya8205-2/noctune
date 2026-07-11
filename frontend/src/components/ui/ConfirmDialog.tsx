import { Loader2, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { noctuneSize } from '../../theme';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** Small label above the title (e.g. "Local library") */
  eyebrow?: string;
  /** Optional detail card (title + subtitle) */
  detail?: { title: string; subtitle?: string } | null;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for confirm button (default true) */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * In-app confirmation modal matching existing surface-panel styling.
 * Prefer this over window.confirm for destructive actions.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  eyebrow = 'Confirm',
  detail,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
        aria-label="Cancel"
      />
      <div className="modal-panel">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="section-label text-accent">{eyebrow}</p>
            <h2 id="confirm-dialog-title" className="mt-2 text-xl font-semibold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !loading && onCancel()}
            disabled={loading}
            className="btn-ghost p-2"
            title="Close"
          >
            <X size={noctuneSize.actionIconMd} />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-soft">{description}</p>

        {detail && (
          <div className="mt-4 rounded-lg border border-base-600/60 bg-base-950/70 px-3 py-2">
            <p className="truncate text-sm font-medium text-white">{detail.title}</p>
            {detail.subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted">{detail.subtitle}</p>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn-ghost border border-base-600/40 px-4 py-2 text-xs disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm();
            }}
            disabled={loading}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40',
              destructive ? 'btn-danger border' : 'btn-accent'
            )}
          >
            {loading ? (
              <Loader2 size={noctuneSize.actionIcon} className="animate-spin" />
            ) : (
              <Trash2 size={noctuneSize.actionIcon} />
            )}
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
