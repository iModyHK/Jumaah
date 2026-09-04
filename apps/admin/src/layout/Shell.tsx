import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SocketProvider } from '../lib/socket';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Sidebar + top bar. `dir` on <html> mirrors the flex layout, so the sidebar sits on the right in RTL. */
export function Shell() {
  const [open, setOpen] = useState(false);
  return (
    <SocketProvider>
      <div className="flex h-full min-h-screen">
        <aside className="hidden w-60 shrink-0 border-e lg:block" style={{ borderColor: 'var(--j-border)', background: 'var(--j-bg-soft)' }}>
          <Sidebar />
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="relative h-full w-64" style={{ background: 'var(--j-bg-soft)' }}>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}
