import { useToastStore, type ToastType } from '../store/toastStore';

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-800 border-green-600 text-green-100',
  error: 'bg-red-900 border-red-700 text-red-100',
  info: 'bg-gray-800 border-gray-600 text-gray-100',
};

const TYPE_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm animate-slide-in ${TYPE_STYLES[toast.type]}`}
        >
          <span className="flex-shrink-0 text-sm font-bold">{TYPE_ICONS[toast.type]}</span>
          <span className="flex-1 break-words">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 opacity-60 hover:opacity-100 text-xs ml-2"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
