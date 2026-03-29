import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import MachineStatus from './MachineStatus';
import Footer from './Footer';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faPenToSquare, faCode, faListCheck, faGear } from '@fortawesome/free-solid-svg-icons';
import { useJobStore } from '../store/jobStore';
import { useToastStore } from '../store/toastStore';
import { useMachineStore } from '../store/machineStore';

const navItems = [
  { to: '/', label: 'Projects', icon: faFolderOpen, end: true },
  { to: '/editor', label: 'Editor', icon: faPenToSquare },
  { to: '/gcode-preview', label: 'G-code', icon: faCode },
  { to: '/queue', label: 'Queue', icon: faListCheck },
  { to: '/settings', label: 'Settings', icon: faGear },
];

export default function Layout() {
  const emergencyStop = useJobStore((s) => s.emergencyStop);
  const addToast = useToastStore((s) => s.addToast);
  const connectionStatus = useMachineStore((s) => s.connectionStatus);
  const machineState = useMachineStore((s) => s.machineState);

  // Update browser tab title with IP/hostname and machine status
  useEffect(() => {
    const host = window.location.hostname;
    const state = connectionStatus === 'disconnected'
      ? 'Disconnected'
      : connectionStatus === 'connecting'
        ? 'Connecting…'
        : (machineState?.state ?? 'Unknown');
    document.title = `LaserFlow — ${host} [${state}]`;
  }, [connectionStatus, machineState?.state]);

  const handlePanic = async () => {
    try {
      await emergencyStop();
      addToast('error', '🛑 EMERGENCY STOP — All operations halted');
    } catch {
      addToast('error', 'Emergency stop failed — check connection');
    }
  };

  const machineConnected = connectionStatus === 'connected';

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header with navigation tabs (Prusa Slicer style) */}
      <header className="flex-shrink-0 h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-0">
        {/* Logo */}
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="LaserFlow" className="h-7 mr-4 -mt-2.5" />

        {/* Tab navigation */}
        <nav className="flex items-stretch h-full flex-1 gap-0.5">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? 'text-orange-400 border-orange-400 bg-orange-500/10'
                    : 'text-gray-400 border-transparent hover:text-gray-100 hover:bg-gray-800'
                }`
              }
            >
              <span className="text-sm"><FontAwesomeIcon icon={icon} /></span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Machine status (right side) */}
        <MachineStatus compact />

        {/* Panic / Emergency Stop button - only show when connected */}
        {machineConnected && (
          <button
            onClick={() => { void handlePanic(); }}
            className="px-3 py-1.5 ml-3 rounded-lg bg-red-700 hover:bg-red-600 active:bg-red-500 text-white text-xs font-bold uppercase tracking-wider transition-colors border border-red-500"
            title="Emergency Stop — stops all operations and turns off laser"
          >
            🛑 STOP
          </button>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto min-h-0 bg-gray-950">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
