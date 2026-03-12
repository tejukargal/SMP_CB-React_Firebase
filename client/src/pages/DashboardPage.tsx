import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useState } from 'react';
import { cn } from '@/utils/cn';

export function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* TopBar with mobile hamburger */}
        <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white">
          <button
            className="flex h-14 w-14 items-center justify-center lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex flex-1 items-center justify-between px-6">
            <TopBar />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
