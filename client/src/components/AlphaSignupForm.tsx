'use client';

import Image from 'next/image';
import Link from 'next/link';
import React, { useState } from 'react';
import { requestAlphaAccess } from '../services/api';
import '../styles/Auth.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AlphaSignupForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('Please enter a valid email address.');
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
        <h1>Join the alpha</h1>
        <p className="tagline">Be among the first commanders.</p>

        {success ? (
          <div className="auth-success" role="status">
            <p>
              You&apos;re on the list. We&apos;ll email <strong>{email.trim()}</strong> as soon as alpha
              access opens.
            </p>
            <Link href="/login" className="auth-link auth-link-block">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="auth-description">
              Vexara is a browser-based sci-fi strategy game. Build your nexus, train an army, and
              conquer the galaxy with players around the world.
            </p>

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
                {submitting ? 'Submitting…' : 'Request access'}
              </button>
            </form>

            <button
              type="button"
              className="about-toggle"
              onClick={() => setShowAbout((v) => !v)}
              aria-expanded={showAbout}
              aria-controls="about-vexara"
            >
              <span>What is Vexara?</span>
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
                      <strong>Command Core</strong> - main progression gate, speeds up every upgrade
                    </li>
                    <li>
                      <strong>Recruitment Core</strong> - trains troops, faster at higher levels
                    </li>
                    <li>
                      <strong>Biomass Farm, Alloy Forge, Ore Extractor</strong> - the three resources
                      that run your war
                    </li>
                    <li>
                      <strong>Storage Vault, Life Support</strong> - caps your stockpile and population
                    </li>
                    <li>
                      <strong>Shield Grid</strong> - +2% defense per level when raiders come knocking
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

                <p className="about-cta">
                  Sounds like your kind of game? Drop your email above. Invites go out in waves.
                </p>
              </section>
            )}

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

export default AlphaSignupForm;
