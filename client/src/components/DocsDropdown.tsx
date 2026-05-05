'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type DocsMobileLinksProps = {
  onNavigate?: () => void;
};

export function DocsDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const docsActive = pathname === '/troops' || pathname === '/buildings';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <div className={`docs-menu ${open ? 'open' : ''}`} ref={menuRef}>
      <button
        className={`nav-btn docs-toggle ${docsActive ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        📚 Docs
      </button>
      <div className="docs-dropdown" role="menu" aria-label="Documentation Links">
        <button
          className={`docs-dropdown-item ${pathname === '/troops' ? 'active' : ''}`}
          onClick={() => go('/troops')}
          role="menuitem"
        >
          🪖 Troops
        </button>
        <button
          className={`docs-dropdown-item ${pathname === '/buildings' ? 'active' : ''}`}
          onClick={() => go('/buildings')}
          role="menuitem"
        >
          🏗️ Buildings
        </button>
      </div>
    </div>
  );
}

export function DocsMobileLinks({ onNavigate }: DocsMobileLinksProps) {
  const router = useRouter();
  const pathname = usePathname();

  const go = (path: string) => {
    onNavigate?.();
    router.push(path);
  };

  return (
    <div className="mobile-docs-links">
      <h4>Docs</h4>
      <button className={`nav-btn ${pathname === '/troops' ? 'active' : ''}`} onClick={() => go('/troops')}>
        🪖 Troops
      </button>
      <button className={`nav-btn ${pathname === '/buildings' ? 'active' : ''}`} onClick={() => go('/buildings')}>
        🏗️ Buildings
      </button>
    </div>
  );
}
