const REPO_URL = 'https://github.com/praegustator/laserflow';

export default function Footer() {
  const version = import.meta.env.VITE_APP_VERSION ?? '__dev__';

  return (
    <footer className="flex-shrink-0 h-7 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-4 text-xs text-gray-500">
      <span className="font-mono">{version}</span>

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
