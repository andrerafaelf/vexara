'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { getAlphaSignupCount, requestAlphaAccess } from '../services/api';
import '../styles/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cpm': 'gmail.com',
  'gmail.ocm': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com', 'hotmail.cm': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmial.com': 'hotmail.com', 'yahoo.cm': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'yaho.com': 'yahoo.com', 'outlook.cm': 'outlook.com', 'outlook.con': 'outlook.com',
};

function getEmailError(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return 'Please enter a valid email address.';
  const atIdx = normalized.lastIndexOf('@');
  const domain = normalized.slice(atIdx + 1);
  const correction = DOMAIN_TYPOS[domain];
  if (correction) return `Did you mean ${normalized.slice(0, atIdx + 1)}${correction}?`;
  return null;
}

const SPAM_DOMAINS = new Set(['hotmail.com', 'hotmail.co.uk', 'outlook.com', 'outlook.co.uk', 'live.com', 'msn.com']);

function isSpamRiskDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return SPAM_DOMAINS.has(domain);
}

const ALPHA_FOUNDER_LIMIT = 150;

const AlphaSignupForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [signupCount, setSignupCount] = useState<number | null>(null);

  useEffect(() => {
    getAlphaSignupCount()
      .then(({ data }) => setSignupCount((data as { total: number }).total))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const normalized = email.trim().toLowerCase();
    const emailError = getEmailError(normalized);
    if (emailError) {
      setError(emailError);
      return;
    }

    setSubmitting(true);
    try {
      await requestAlphaAccess(normalized);
      setSuccess(true);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className={`auth-box ${showAbout ? 'auth-box-wide' : ''}`}>
        <Link href="/" className="auth-logo-link" aria-label="Vexara home">
          <Image
            src="/vexara-logo.png"
            alt="Vexara"
            width={96}
            height={96}
            className="auth-logo"
            priority
          />
        </Link>
        <h1>A persistent galaxy at war.</h1>
        <p className="tagline">
          Browser-based 4X strategy. Build a nexus, train twelve unit types,
          and conquer real players one Overseer at a time.
        </p>

        {signupCount !== null && signupCount < ALPHA_FOUNDER_LIMIT && (
          <div className="alpha-founder-slots">
            <span className="alpha-founder-slots-bar">
              <span
                className="alpha-founder-slots-fill"
                style={{ width: `${Math.min(100, (signupCount / ALPHA_FOUNDER_LIMIT) * 100)}%` }}
              />
            </span>
            <span className="alpha-founder-slots-label">
              <strong>{signupCount}</strong> of {ALPHA_FOUNDER_LIMIT} alpha slots claimed
              {ALPHA_FOUNDER_LIMIT - signupCount <= 20 && (
                <span className="alpha-founder-slots-urgent"> — {ALPHA_FOUNDER_LIMIT - signupCount} left</span>
              )}
            </span>
          </div>
        )}
        {signupCount !== null && signupCount >= ALPHA_FOUNDER_LIMIT && (
          <div className="alpha-founder-slots alpha-founder-slots-full">
            <span className="alpha-founder-slots-label">
              All {ALPHA_FOUNDER_LIMIT} alpha slots have been claimed.
            </span>
          </div>
        )}

        {success ? (
          <div className="auth-success" role="status">
            <p>
              You&apos;re on the list. We&apos;ll email <strong>{email.trim()}</strong> as soon as alpha
              access opens.
            </p>
            {isSpamRiskDomain(email) && (
              <p className="auth-success-note">
                Hotmail and Outlook sometimes filter automated emails — if you don&apos;t see it, check your <strong>Junk</strong> folder.
              </p>
            )}
            <Link href="/login" className="auth-link auth-link-block">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <figure className="hero-shot">
              <Image
                src="/vexara-overview.png"
                alt="Vexara nexus dashboard showing resources, buildings, and queues"
                width={1280}
                height={720}
                className="hero-shot-img"
                sizes="(max-width: 640px) 100vw, 600px"
                priority
              />
              <figcaption className="hero-shot-caption">Your nexus — economy, queues, and military in one view.</figcaption>
            </figure>

            <section className="core-systems" aria-label="Core systems">
              <h2 className="core-systems-title">What you actually do</h2>
              <ul className="core-systems-list">
                <li>
                  <SystemIcon name="economy" />
                  <div>
                    <strong>Run a three-resource economy</strong>
                    <p>Biomass, alloy, and ore tick 24/7. Storage and production scale per building level — Lv10 Biomass Farm yields ~10,500/hr.</p>
                  </div>
                </li>
                <li>
                  <SystemIcon name="army" />
                  <div>
                    <strong>Train twelve unit types</strong>
                    <p>From 53s Lancer Drones to 2h Annihilator Platforms. Each unit has attack, defense, speed, and carry — composition wins fights.</p>
                  </div>
                </li>
                <li>
                  <SystemIcon name="strike" />
                  <div>
                    <strong>Scout, raid, and intercept in real time</strong>
                    <p>Travel times are real. Send Recon Operatives to map a target, then commit a raid fleet — or catch one mid-flight.</p>
                  </div>
                </li>
                <li>
                  <SystemIcon name="conquest" />
                  <div>
                    <strong>Conquer with Overseers</strong>
                    <p>Train an Overseer (4h, max 3 per nexus). Each surviving strike drops enemy control by 50. Hit zero and the nexus is yours.</p>
                  </div>
                </li>
                <li>
                  <SystemIcon name="defense" />
                  <div>
                    <strong>Defend with units + Shield Grid</strong>
                    <p>Shield Grid adds +2% defense per level. Casualties are ratio-based with a random factor — there&apos;s no auto-win button.</p>
                  </div>
                </li>
              </ul>
            </section>

            <form onSubmit={handleSubmit} noValidate>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  type="email"
                  placeholder="you@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                  required
                  aria-invalid={Boolean(error)}
                />
              </label>

              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Request alpha access'}
              </button>
            </form>

            <button
              type="button"
              className="about-toggle"
              onClick={() => setShowAbout((v) => !v)}
              aria-expanded={showAbout}
              aria-controls="about-vexara"
            >
              <span>Deep dive: buildings, troops, conquest</span>
              <span className={`about-toggle-chevron ${showAbout ? 'is-open' : ''}`} aria-hidden="true">
                ▾
              </span>
            </button>

            {showAbout && (
              <section id="about-vexara" className="about-panel">
                <p className="about-lede">
                  A persistent galaxy. Real opponents. No pay-to-win. Just you, your nexus, and the
                  cold math of empire.
                </p>

                <div className="about-section">
                  <h3>The galaxy is shared</h3>
                  <p>
                    Every player drops into the same living galaxy. Coordinates are real. Travel times
                    are real. Your neighbors might be allies, rivals, or future tribute. Your call.
                  </p>
                </div>

                <div className="about-section">
                  <h3>Your nexus</h3>
                  <Image
                    src="/vexara-overview.png"
                    alt="Vexara nexus overview showing the dashboard, resources, and eight core buildings"
                    width={1280}
                    height={720}
                    className="about-shot"
                    sizes="(max-width: 640px) 100vw, 600px"
                  />
                  <p>
                    A nexus is your foothold. You start with one and can capture more. Eight core
                    buildings drive your economy and military:
                  </p>
                  <ul className="about-list">
                    <li>
                      <strong>Command Core</strong> — main progression gate, speeds up every upgrade (×0.95 per level)
                    </li>
                    <li>
                      <strong>Recruitment Core</strong> — trains troops, ×0.92 training time per level
                    </li>
                    <li>
                      <strong>Biomass Farm, Alloy Forge, Ore Extractor</strong> — the three resources
                      that run your war
                    </li>
                    <li>
                      <strong>Storage Vault, Life Support</strong> — caps your stockpile and population
                    </li>
                    <li>
                      <strong>Shield Grid</strong> — +2% defense per level when raiders come knocking
                    </li>
                  </ul>
                </div>

                <div className="about-section">
                  <h3>Twelve troops, twelve roles</h3>
                  <Image
                    src="/vexara-troops.png"
                    alt="Vexara troops screen listing offensive and defensive units"
                    width={1280}
                    height={720}
                    className="about-shot"
                    sizes="(max-width: 640px) 100vw, 600px"
                  />
                  <p>
                    From cheap Lancer Drones and Assault Troopers to elite Bulwark Guards, Skimmer Bikes,
                    Siege Mechs, and the brutal Annihilator Platform. Each unit has its own attack,
                    defense, speed, and carry capacity. Composition wins fights, not raw numbers.
                  </p>
                </div>

                <div className="about-section">
                  <h3>Scout, raid, conquer</h3>
                  <p>
                    Send <strong>Recon Operatives</strong> to scout an enemy nexus before you commit.
                    Launch <strong>raids</strong> to steal resources. When you&apos;re ready for the
                    endgame, train an <strong>Overseer</strong> and chip away at an enemy&apos;s
                    control. Drop it to zero and the nexus is yours.
                  </p>
                </div>

                <div className="about-section">
                  <h3>Always on, but not always grinding</h3>
                  <p>
                    Your economy ticks 24/7. Queue up builds and training before bed, plan your strikes
                    around real-world travel times, and check in from your phone. Vexara runs in the
                    browser and installs as a PWA.
                  </p>
                </div>
              </section>
            )}

            <section className="founder-perks" aria-label="Alpha founder benefits">
              <h3 className="founder-perks-title">Alpha founders also get</h3>
              <ul className="founder-perks-list">
                <li><SystemIcon name="badge" /><span><strong>Founder&apos;s badge</strong> — permanent, never re-issued.</span></li>
                <li><SystemIcon name="rank" /><span><strong>Leaderboard mark</strong> on all rankings.</span></li>
                <li><SystemIcon name="scroll" /><span><strong>Hall of fame</strong> entry with join date.</span></li>
                <li><SystemIcon name="pillar" /><span><strong>Naming rights</strong> if your faction wins.</span></li>
              </ul>
            </section>

            <section className="built-by" aria-label="About the developer">
              <h3 className="built-by-title">Built by one developer</h3>
              <p>
                Vexara is a solo project — no publisher, no investors, no roadmap dictated by quarterly
                targets. Just a strategy-game player building the kind of persistent MMO that
                doesn&apos;t sell wins.
              </p>
              <a
                /* TODO: replace with real Discord/community URL */
                href="#"
                className="built-by-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join the Discord →
              </a>
            </section>

            <p className="auth-secondary">
              Already have an account?{' '}
              <Link href="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

type SystemIconName = 'economy' | 'army' | 'strike' | 'conquest' | 'defense' | 'badge' | 'rank' | 'scroll' | 'pillar';

const SystemIcon: React.FC<{ name: SystemIconName }> = ({ name }) => {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'system-icon',
  };
  switch (name) {
    case 'economy':
      return (
        <svg {...common}>
          <path d="M3 20h18" />
          <path d="M6 20V10" /><path d="M12 20V4" /><path d="M18 20v-7" />
        </svg>
      );
    case 'army':
      return (
        <svg {...common}>
          <path d="M12 3l8 4-8 4-8-4 8-4z" />
          <path d="M4 11l8 4 8-4" /><path d="M4 15l8 4 8-4" />
        </svg>
      );
    case 'strike':
      return (
        <svg {...common}>
          <path d="M3 21L21 3" />
          <path d="M15 3h6v6" /><path d="M9 14l-3 3 3 3" />
        </svg>
      );
    case 'conquest':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" /><path d="M12 3a14 14 0 010 18" /><path d="M12 3a14 14 0 000 18" />
        </svg>
      );
    case 'defense':
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
        </svg>
      );
    case 'badge':
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="5" />
          <path d="M8 13l-2 8 6-3 6 3-2-8" />
        </svg>
      );
    case 'rank':
      return (
        <svg {...common}>
          <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z" />
        </svg>
      );
    case 'scroll':
      return (
        <svg {...common}>
          <path d="M6 3h11a2 2 0 012 2v3H8" />
          <path d="M4 8h4v11a2 2 0 002 2h9a2 2 0 002-2V8" />
        </svg>
      );
    case 'pillar':
      return (
        <svg {...common}>
          <path d="M3 8h18L12 3 3 8z" />
          <path d="M6 10v8M12 10v8M18 10v8" /><path d="M4 20h16" />
        </svg>
      );
  }
};

export default AlphaSignupForm;
