import { useEffect, useState } from 'react';
import { useMachineStore } from '../store/machineStore';
import { useAppSettings, isMixedContent } from '../store/appSettingsStore';

/**
 * Full-screen overlay shown when the frontend cannot reach the backend server.
 * Lets the user correct the backend URL so the auto-reconnect picks it up.
 * A 1-second grace period prevents a flash on initial load.
 */
export default function BackendOverlay() {
  const backendConnected = useMachineStore((s) => s.backendConnected);
  const backendUrl = useAppSettings((s) => s.backendUrl);
  const setBackendUrl = useAppSettings((s) => s.setBackendUrl);
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [visible, setVisible] = useState(false);

  // Show overlay 1 s after first disconnect to avoid a flash on startup
  useEffect(() => {
    if (backendConnected) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [backendConnected]);

  // Keep input in sync when the stored URL changes externally
  useEffect(() => {
    setUrlInput(backendUrl);
  }, [backendUrl]);

  if (!visible) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim().replace(/\/$/, '');
    if (trimmed) setBackendUrl(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔌</div>
          <h2 className="text-xl font-bold text-gray-100">Backend Unreachable</h2>
          <p className="text-sm text-gray-400 mt-2">
            LaserFlow cannot connect to the backend server. Make sure the server
            is running and the address below is correct.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase block mb-1">
              Backend URL
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://localhost:3001"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Mixed-content warning */}
          {isMixedContent(urlInput) && (
            <div className="rounded-md bg-amber-900/30 border border-amber-700/50 p-3 text-xs text-amber-300 space-y-1">
              <p className="font-semibold">⚠️ Mixed content – browser will block this connection</p>
              <p>
                This app is on <strong>HTTPS</strong> but your backend URL is plain <strong>HTTP</strong>.
                Browsers block <code>ws://</code> and <code>http://</code> connections from HTTPS pages.
              </p>
              <p className="font-medium mt-1">Fix options:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-400/90">
                <li>Add an HTTPS reverse proxy (nginx) and use an <code>https://</code> URL</li>
                <li>Use a secure tunnel (<code>cloudflared</code> / <code>ngrok</code>) and paste the tunnel URL</li>
                <li>Run the frontend locally over HTTP (<code>npm run dev</code>)</li>
              </ul>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-sm transition-colors"
          >
            Save &amp; Reconnect
          </button>
        </form>

        <p className="text-xs text-gray-600 text-center mt-4">
          Retrying automatically every 3 seconds…
        </p>
      </div>
    </div>
  );
}
