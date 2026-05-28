'use client';

import Image from 'next/image';
import Link from 'next/link';
import '@/styles/Landing.css';

export default function PublicNav() {
  return (
    <header className="lp-nav">
      <Link href="/" className="lp-nav-mark" aria-label="Vexara home">
        <Image src="/vexara-logo.png" alt="" width={28} height={28} priority />
        <span>Vexara</span>
      </Link>
      <nav className="lp-nav-links" aria-label="Primary">
        <Link href="/codex">Codex</Link>
        <a href="https://discord.gg/D858rzCHP7" target="_blank" rel="noopener noreferrer">Discord</a>
        <Link href="/login" className="lp-nav-link-login">Login</Link>
        <Link href="/register" className="lp-nav-cta">Enlist</Link>
      </nav>
    </header>
  );
}
