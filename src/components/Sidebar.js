'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Users, 
  Settings, 
  Fingerprint,
  FileSpreadsheet,
  CalendarDays,
  ClipboardCheck,
  X
} from 'lucide-react';

export default function Sidebar({ onClose }) {
  const pathname = usePathname();

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Log Absensi', path: '/logs', icon: ClipboardList },
    { name: 'Rekap Absensi', path: '/recap', icon: FileSpreadsheet },
    { name: 'Hari Libur', path: '/holidays', icon: CalendarDays },
    { name: 'Izin Karyawan', path: '/leaves', icon: ClipboardCheck },
    { name: 'Data Karyawan', path: '/employees', icon: Users },
    { name: 'Pengaturan Alat', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-full flex flex-col">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 rounded-xl text-white">
            <Fingerprint size={20} />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 tracking-tight text-lg leading-none">Fingerspot Link</h1>
            <span className="text-[10px] font-medium text-slate-400">Monitoring Absensi</span>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="lg:hidden p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={() => {
                if (onClose) onClose();
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-500'} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/30">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-100/80">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
            CV
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-800 leading-none">CV Alief Jaya</p>
            <span className="text-[9px] text-slate-400">Owner Account</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
