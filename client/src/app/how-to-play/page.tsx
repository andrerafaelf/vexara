import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import '@/styles/GuidePages.css';

const TITLE = 'How to Play Vexara - Browser MMO RTS Beginner Guide';
const DESCRIPTION =
  'New to Vexara? Learn how to build your nexus, train troops, raid enemies, run espionage, and conquer territory in this free browser MMO RTS. No download required.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'how to play browser rts',
    'browser strategy game guide',
    'Vexara guide',
    'Vexara beginners guide',
    'mmo rts tutorial',
    'how to play Vexara',
    'browser mmo rts tutorial',
  ],
  alternates: { canonical: '/how-to-play' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://vexara.world/how-to-play',
    siteName: 'Vexara',
    locale: 'en_US',
    type: 'article',
  },
  robots: { index: true, follow: true },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I start playing Vexara?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Register at vexara.world/register - free, no download required. You start with one nexus, a stockpile of resources, and a short quest line that walks you through building your Command Core, training your first troops, and launching your first raid.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is a nexus in Vexara?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A nexus is your base of operations. It generates resources, trains troops, houses your garrison, and can be upgraded through 10 core buildings. You can capture additional nexuses from neutral or enemy players.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does combat work in Vexara?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Vexara uses a rock-paper-scissors class system: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Sending the right composition matters more than raw numbers. Travel times are real - strikes take minutes to hours depending on distance.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do you conquer a nexus in Vexara?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Train an Overseer unit (requires Command Core and Recruitment Core level 14). Each successful strike that includes a surviving Overseer reduces the target\'s control by 34. Control starts at 100 - reach 0 and the nexus is yours. It takes a minimum of three strikes.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are factions in Vexara?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Factions are player-created groups of up to 10 members. Factions can declare wars, sign treaties, and coordinate attacks. Joining a faction gives you allies, shared chat, and faction-wide diplomatic standing.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Vexara pay-to-win?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Vexara has no premium currency, no paid boosts, and no power purchases. Supporter tiers exist as voluntary thank-yous and grant cosmetic perks only.',
      },
    },
  ],
};

const STEPS = [
  {
    num: '01',
    title: 'Build your economy first',
    body: 'Three resources drive everything: Biomass, Alloy, and Ore. Your first moves should be levelling your Biomass Farm, Alloy Forge, and Ore Extractor - production scales 1.35× per level, so early investment compounds fast. Also build your Storage Vault early to avoid capping out and wasting ticks.',
  },
  {
    num: '02',
    title: 'Unlock troops through your Command Core',
    body: 'The Command Core is your progression gate. Level it to 2 to unlock the Recruitment Core, which lets you train troops. Higher Command Core levels unlock buildings like the Shield Grid, Armory, and Stealth Array. Rush it alongside your economy buildings - most unlock chains run through it.',
  },
  {
    num: '03',
    title: 'Train troops with composition in mind',
    body: 'Vexara uses a class triangle: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Your early roster (Assault Troopers, Lancer Drones, Breaker Units) covers all three classes. Don\'t spam one type - a mixed force handles unknown defenders and won\'t be hard-countered.',
  },
  {
    num: '04',
    title: 'Scout before you strike',
    body: 'Train a Recon Operative and send it to scout targets before committing a raid. Scouts reveal troops, resources, buildings, and active queues. Better option: use the Espionage tab to embed the operative as a permanent asset - you\'ll get live intel on demand until the spy is detected.',
  },
  {
    num: '05',
    title: 'Raid neutrals for early resources',
    body: 'Neutral nexuses on the galaxy map are unowned and generate resources passively. Raiding them is low-risk and high-reward in the early game. Your carry capacity determines how much loot comes home - Assault Troopers and Breaker Units carry well. Any army with 8,000+ carry takes 100% of lootable resources.',
  },
  {
    num: '06',
    title: 'Defend with Shield Grid and garrison',
    body: 'Each level of Shield Grid adds +2% to your entire garrison\'s effective defence power - multiplicative with every troop\'s defence stat. Keep Recon Operatives stationed at home to block enemy sabotage missions. A Military Outpost nexus doubles your Shield Grid efficiency.',
  },
  {
    num: '07',
    title: 'Join or create a faction',
    body: 'Factions are groups of up to 10 players that share a chat, coordinate attacks, and enter diplomatic relationships. Joining a faction early gives you allies who can station troops at your nexus as reinforcements, share intel, and back you in wars against larger coalitions.',
  },
  {
    num: '08',
    title: 'Conquer with Overseers',
    body: 'To take a nexus permanently you need an Overseer - a slow, expensive command unit (4h training, max 3 per nexus). Each successful strike with a surviving Overseer drops enemy control by 34. Control starts at 100, so three clean hits conquer any nexus. The Overseer is consumed on the final strike.',
  },
];

export default function HowToPlayPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <PublicNav />

      <main className="gp-root">
        <header className="gp-header">
          <div className="gp-header-label">// FIELD MANUAL</div>
          <h1 className="gp-title">How to Play Vexara</h1>
          <p className="gp-subtitle">
            A free browser MMO RTS. No download. Build a nexus, train armies,
            conquer territory, and fight real players in a persistent galaxy that
            never resets.
          </p>
          <Link href="/register" className="gp-hero-cta">Play free in your browser</Link>
        </header>

        <section className="gp-section">
          <h2 className="gp-section-title">The core loop</h2>
          <p className="gp-prose">
            Vexara is a real-time strategy game that runs in your browser 24/7.
            You start with one nexus - a base that generates three resources
            (Biomass, Alloy, Ore) and trains troops. You use those resources to
            build, expand, raid, and eventually conquer other nexuses from neutral
            spawns or rival players. The galaxy is persistent: nothing resets,
            progress carries forward, and every action you take has real
            consequences.
          </p>
        </section>

        <section className="gp-section">
          <h2 className="gp-section-title">Step-by-step: your first session</h2>
          <div className="gp-steps">
            {STEPS.map((step) => (
              <div key={step.num} className="gp-step">
                <div className="gp-step-num">{step.num}</div>
                <div className="gp-step-body">
                  <h3 className="gp-step-title">{step.title}</h3>
                  <p className="gp-step-text">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="gp-section">
          <h2 className="gp-section-title">Frequently asked questions</h2>
          <div className="gp-faq">
            {faqSchema.mainEntity.map((item, i) => (
              <details key={i} className="gp-faq-item">
                <summary className="gp-faq-q">{item.name}</summary>
                <p className="gp-faq-a">{item.acceptedAnswer.text}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="gp-cta-block">
          <p className="gp-cta-text">Ready to enlist? The galaxy is live right now.</p>
          <Link href="/register" className="gp-cta-btn">Play free - no download required</Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
