import { NavLink, Outlet } from 'react-router-dom';
import MachineStatus from './MachineStatus';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '⌂', end: true },
  { to: '/console', label: 'Console', icon: '⌨' },
  { to: '/editor', label: 'Editor', icon: '✏' },
  { to: '/gcode-preview', label: 'G-code Preview', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-800">
          <span className="text-xl font-bold tracking-tight text-orange-400">
            🔥 LaserFlow
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-500/10 text-orange-400 border-r-2 border-orange-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Version */}
        <div className="px-5 py-3 text-xs text-gray-600 border-t border-gray-800">
          v1.0.0
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
          <h1 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
            LaserFlow Controller
          </h1>
          <MachineStatus compact />
        </header>

        {/* Page */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
