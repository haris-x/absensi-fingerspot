'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';

export default function MainLayoutWrapper({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar Navigation */}
      {/* On desktop: show sidebar as fixed left. On mobile: hide or show as drawer overlay */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 transform lg:transform-none lg:opacity-100 transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Main Header */}
        <header className="h-16 border-b border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl border border-slate-200"
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] sm:text-xs font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">Database MYSQL: Aktif (Port 3309)</span>
              <span className="sm:hidden">MySQL Aktif</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-500 font-medium">
            <span className="hidden md:inline">Waktu Server: {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span className="md:hidden">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
