import { NavLink, Outlet } from 'react-router-dom';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import MachineStatus from './MachineStatus';
import Footer from './Footer';

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
      <PanelGroup orientation="horizontal" className="h-full">
        {/* Sidebar */}
        <Panel defaultSize="15%" minSize="10%" maxSize="25%" className="bg-gray-900 border-r border-gray-800 flex flex-col min-h-0">
          {/* Logo */}
          <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0">
            <span className="text-xl font-bold tracking-tight text-orange-400 whitespace-nowrap overflow-hidden">
              🔥 LaserFlow
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 overflow-y-auto">
            {navItems.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors overflow-hidden ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-400 border-r-2 border-orange-400'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                  }`
                }
              >
                <span className="text-base w-5 text-center flex-shrink-0">{icon}</span>
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </nav>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-orange-500/40 transition-colors cursor-col-resize flex-shrink-0" />

        {/* Main area */}
        <Panel className="flex flex-col min-w-0 min-h-0">
          {/* Header */}
          <header className="h-14 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
            <h1 className="text-sm font-semibold text-gray-300 uppercase tracking-widest">
              LaserFlow Controller
            </h1>
            <MachineStatus compact />
          </header>

          {/* Page */}
          <main className="flex-1 overflow-auto min-h-0">
            <Outlet />
          </main>

          {/* Footer */}
          <Footer />
        </Panel>
      </PanelGroup>
    </div>
  );
}
