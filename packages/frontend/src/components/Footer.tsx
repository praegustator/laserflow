import { useEffect, useState } from 'react';
import { getBackendUrl } from '../store/appSettingsStore';

const REPO_URL = 'https://github.com/praegustator/laserflow';

export default function Footer() {
  const frontendVersion = import.meta.env.VITE_APP_VERSION ?? '__dev__';
  const [backendVersion, setBackendVersion] = useState<string | null>(null);

  useEffect(() => {
    const backendUrl = getBackendUrl();
    fetch(`${backendUrl}/api/version`)
      .then((res) => res.json())
      .then((data: { version: string }) => setBackendVersion(data.version))
      .catch((err) => {
        console.error('Failed to fetch backend version:', err);
        setBackendVersion(null);
      });
  }, []);

  // Show unified version if both sides match, otherwise show both
  const versionLabel = backendVersion === null
    ? `frontend: ${frontendVersion}`
    : frontendVersion === backendVersion
      ? frontendVersion
      : `frontend: ${frontendVersion} | backend: ${backendVersion}`;

  return (
    <footer className="flex-shrink-0 h-7 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4 text-xs text-gray-500">
      <span className="font-mono">{versionLabel}</span>

      <div className="flex items-center gap-4">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-orange-400 transition-colors"
        >
          GitHub
        </a>
        <a
          href={`${REPO_URL}/issues`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-orange-400 transition-colors"
        >
          Issues
        </a>
        <a
          href={`${REPO_URL}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-orange-400 transition-colors"
        >
          Report Bug
        </a>
      </div>
    </footer>
  );
}
