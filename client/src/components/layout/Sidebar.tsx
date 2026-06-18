import type React from 'react';
import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';

interface TooltipState { label: string; y: number; x: number }

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/new-entry',
    label: 'New Entry',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    to: '/entries',
    label: 'Transactions',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/ledgers',
    label: 'Ledgers',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    to: '/bank-accounts',
    label: 'Bank Accounts',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    to: '/bank-statements',
    label: 'Bank Statements',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/fee-register',
    label: 'Fee Register',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    to: '/salary-register',
    label: 'Salary Register',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const FEATURES = [
  'Receipts & Payments',
  'By-Date View',
  'Ledger Accounts',
  'Fee Register',
  'Salary Register',
  'Bank Accounts',
  'Bank Statements',
  'PDF Export',
  'Excel Export',
  'Voucher Printing',
];

export function Sidebar() {
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const showTooltip = useCallback((label: string, e: React.MouseEvent) => {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2, x: rect.right + 10 });
  }, [collapsed]);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  const closeAbout = () => { setShowAbout(false); setShowTech(false); };

  const textStyle = (extraDelay = 0): React.CSSProperties => ({
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    maxWidth: collapsed ? 0 : '160px',
    opacity: collapsed ? 0 : 1,
    transition: collapsed
      ? `opacity 120ms ease ${extraDelay}ms, max-width 220ms cubic-bezier(0.4,0,0.2,1) ${extraDelay}ms`
      : `max-width 220ms cubic-bezier(0.4,0,0.2,1) ${extraDelay}ms, opacity 180ms ease ${extraDelay + 60}ms`,
  });

  const navItemStyle: React.CSSProperties = {
    paddingLeft: 12,
    paddingRight: collapsed ? 0 : 12,
    transition: 'padding-right 220ms cubic-bezier(0.4,0,0.2,1)',
  };

  return (
    <>
      <aside
        className="flex h-full shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden"
        style={{
          width: collapsed ? 64 : 208,
          transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Brand / Toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="group flex items-center gap-2.5 w-full cursor-pointer hover:bg-slate-50 transition-colors px-3 shrink-0 h-14 border-b border-slate-200"
        >
          <div className="relative w-8 h-8 shrink-0" style={{ perspective: '280px' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transformStyle: 'preserve-3d',
                transition: 'transform 380ms cubic-bezier(0.4, 0, 0.2, 1)',
                transform: collapsed && logoHovered ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              <div
                className="absolute inset-0 rounded-lg flex items-center justify-center shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                }}
              >
                <span className="text-white font-bold text-xs">SMP</span>
              </div>
              <div
                className="absolute inset-0 rounded-lg flex items-center justify-center shadow-sm"
                style={{
                  background: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </div>

          <div style={{
            overflow: 'hidden',
            opacity: collapsed ? 0 : 1,
            transition: collapsed ? 'opacity 120ms ease' : 'opacity 180ms ease 60ms',
          }}>
            <p style={{ whiteSpace: 'nowrap' }} className="text-sm font-semibold text-slate-800">SMP Cash Book</p>
          </div>

          <span
            className="flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 ml-auto"
            style={textStyle()}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </span>
        </button>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={navItemStyle}
              onMouseEnter={(e) => showTooltip(item.label, e)}
              onMouseLeave={hideTooltip}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-2.5 py-2 w-full rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                )
              }
            >
              {item.icon}
              <span style={textStyle()} className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 p-2 space-y-0.5">
          {/* About */}
          <button
            onClick={() => setShowAbout(true)}
            style={navItemStyle}
            onMouseEnter={(e) => showTooltip('About', e)}
            onMouseLeave={hideTooltip}
            className="group flex w-full items-center gap-2.5 py-2 rounded-md text-sm text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style={textStyle()} className="truncate">About</span>
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            style={navItemStyle}
            onMouseEnter={(e) => showTooltip('Logout', e)}
            onMouseLeave={hideTooltip}
            className="group flex w-full items-center gap-2.5 py-2 rounded-md text-sm text-slate-500 hover:bg-slate-50 hover:text-red-600 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span style={textStyle()}>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Collapsed tooltip bubble ── */}
      {collapsed && tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            animation: 'tooltip-pop 0.15s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{
            width: 0, height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '5px solid #1D4ED8',
          }} />
          <div style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.01em',
            padding: '5px 12px',
            borderRadius: '20px',
            boxShadow: '0 4px 14px rgba(29,78,216,0.30)',
            whiteSpace: 'nowrap',
          }}>
            {tooltip.label}
          </div>
        </div>,
        document.body
      )}

      {/* ── About modal ── */}
      {showAbout && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeAbout}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />

          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden flex flex-col"
            style={{ animation: 'modal-enter 0.25s ease-out', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <h3 className="text-sm font-bold text-white">About</h3>
              </div>
              <button
                onClick={closeAbout}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* App identity bar */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-sm">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0121 9.414V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 leading-tight">SMP Cash Book</p>
                <p className="text-[10px] text-slate-500 leading-tight">Sanjay Memorial Polytechnic, Sagar</p>
              </div>
            </div>

            {/* Body */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5"
              style={{ scrollbarWidth: 'none' }}
            >
              {/* Description */}
              <p className="text-[11px] text-slate-600 leading-relaxed">
                SMP Cash Book is a purpose-built web application used exclusively to record and manage cash book transactions of <span className="font-semibold text-slate-800">Sanjay Memorial Polytechnic, Sagar</span>. It provides a structured, real-time ledger for tracking receipts and payments across multiple financial years and cash book types.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-1.5">
                {FEATURES.map((f) => (
                  <span
                    key={f}
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                  >
                    {f}
                  </span>
                ))}
              </div>

              <div className="h-px bg-slate-100" />

              {/* Developer */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Developer</p>
                <div
                  className="flex items-center gap-2.5 cursor-default select-none"
                  onDoubleClick={() => setShowTech(v => !v)}
                  title="Double-click to reveal tech details"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-white">TR</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Thejaraj R</p>
                    <p className="text-[10px] text-slate-500">FDA · Sanjay Memorial Polytechnic, Sagar</p>
                  </div>
                </div>

                {showTech && (
                  <div
                    className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-1"
                    style={{ animation: 'content-enter 0.2s ease-out' }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Technology</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Built with <span className="font-semibold text-slate-700">React 19</span>, <span className="font-semibold text-slate-700">TypeScript</span>, and <span className="font-semibold text-slate-700">Tailwind CSS</span>, backed by <span className="font-semibold text-slate-700">Google Firebase</span> (Firestore &amp; Auth). Data is cloud-hosted with real-time sync across sessions.
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-slate-100" />

              {/* Exclusive use note */}
              <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
                This application is exclusively used for recording cash book transactions of Sanjay Memorial Polytechnic, Sagar. Unauthorised use is strictly prohibited.
              </p>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-5 py-3 flex justify-end bg-slate-50/60 shrink-0">
              <button
                onClick={closeAbout}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
