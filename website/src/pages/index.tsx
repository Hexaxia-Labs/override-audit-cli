import {useState, type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

function CommandCard({
  title,
  command,
}: {
  title: string;
  command: string;
}): ReactNode {
  return (
    <article className="cve-card">
      <h3>{title}</h3>
      <CodeBlock language="bash">{command}</CodeBlock>
    </article>
  );
}

function FeatureCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <article className="cve-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

const PRESS_OUTLETS: {label: string; href: string; src?: string; logoClass?: string; badge?: boolean}[] = [
  {
    label: 'CSO Online',
    href: 'https://www.csoonline.com/article/4176701/as-ai-speeds-coding-cve-lite-cli-keeps-security-deliberately-ai-free.html',
    src: 'img/press-cso.svg',
    logoClass: 'press-bar-logo--cso',
  },
  {
    label: 'DevOps.com',
    href: 'https://devops.com/owasp-adopts-cve-lite-cli-to-boost-dependency-scanning/',
  },
  {
    label: 'Help Net Security',
    href: 'https://www.helpnetsecurity.com/2026/05/20/cve-lite-cli-open-source-dependency-vulnerability-scanner/',
    src: 'img/press-helpnetsecurity.svg',
    logoClass: 'press-bar-logo--helpnet',
  },
  {
    label: 'Hexaxia Labs',
    href: 'https://labs.hexaxia.tech/blog/hexops-cve-lite-integration/',
    src: 'img/press/hexaxia-labs.webp',
    logoClass: 'press-bar-logo--hexaxia',
  },
  {
    label: 'Medium',
    href: 'https://medium.com/@techlatest.net/cve-lite-cli-the-dependency-scanner-that-actually-tells-you-what-to-run-not-just-whats-broken-f6b518199981',
    src: 'img/press/medium-wordmark.png',
    logoClass: 'press-bar-logo--medium',
    badge: true,
  },
  {
    label: 'Development Curated',
    href: 'https://developmentcurated.com/testing-and-security/review-of-cve-lite-cli/',
    src: 'img/press-developmentcurated.svg',
    logoClass: 'press-bar-logo--devcurated',
  },
];

function ScreenshotPreview(): ReactNode {
  const [activePreview, setActivePreview] = useState<'terminal' | 'report' | 'verbose'>('report');
  const previews = {
    terminal: {
      label: 'Terminal',
      image: 'img/default-output.png',
      alt: 'CVE Lite CLI terminal output',
    },
    report: {
      label: 'HTML Report',
      image: 'img/html-report-dashboard.png',
      alt: 'CVE Lite CLI HTML report dashboard',
    },
    verbose: {
      label: 'Verbose',
      image: 'img/verbose-output-1.png',
      alt: 'CVE Lite CLI verbose fix plan output',
    },
  };

  return (
    <div className="hero-art" aria-label="CVE Lite CLI output previews">
      <div className="preview-tabs" role="tablist" aria-label="Output preview options">
        {Object.entries(previews).map(([key, preview]) => (
          <button
            key={key}
            className={`preview-tab ${activePreview === key ? 'active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activePreview === key}
            onClick={() => setActivePreview(key as keyof typeof previews)}>
            {preview.label}
          </button>
        ))}
      </div>
      <div className="preview-panel active">
        <img src={previews[activePreview].image} alt={previews[activePreview].alt} />
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Free, local-first JS/TS vulnerability scanner"
      description="CVE Lite CLI scans JS/TS lockfiles locally, explains direct and transitive dependency risk, and provides parent-aware remediation guidance.">
      <main className="site-shell">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">
              JavaScript/TypeScript Dependency Scanner &mdash;{' '}
              <Link className="eyebrow-link" to="https://owasp.org/cve-lite-cli">
                An OWASP Foundation Project
              </Link>
            </p>
            <h1>Scan. Understand. Fix.</h1>
            <p className="hero-lede">
              Most security tools are built around pipelines, not developers. CVE
              Lite CLI scans your lockfile locally in seconds, explains the
              dependency path, and tells you what to update before you push.
            </p>
            <div className="cta-row">
              <Link className="cve-button cve-button-primary" to="https://github.com/OWASP/cve-lite-cli">
                View on GitHub
              </Link>
              <Link className="cve-button cve-button-ghost" to="https://www.npmjs.com/package/cve-lite-cli">
                View on npm
              </Link>
              <Link className="cve-button cve-button-ghost" to="https://github.com/marketplace/actions/cve-lite-cli">
                GitHub Action
              </Link>
            </div>
            <ul className="stats-list">
              <li>No account required</li>
              <li>npm, pnpm, Yarn, and Bun lockfile support</li>
              <li>Usage-aware reachability scanning</li>
              <li>Offline scans with local advisory DB</li>
              <li>Copy-and-run direct fix commands</li>
              <li>Parent-aware transitive guidance</li>
              <li>Conservative auto-remediation with --fix</li>
              <li>Built-in AI assistant skills</li>
            </ul>
            <div className="pillars">
              <div className="pillar">
                <span className="pillar-icon">Free</span>
                <strong>Free to use</strong>
                <span>No account, no subscription, no cloud required</span>
              </div>
              <div className="pillar">
                <span className="pillar-icon">Local</span>
                <strong>Runs locally</strong>
                <span>Nothing leaves your machine</span>
              </div>
              <div className="pillar">
                <span className="pillar-icon">Fast</span>
                <strong>Fast</strong>
                <span>Results in seconds, rescans near-instant</span>
              </div>
            </div>
          </div>
          <ScreenshotPreview />
        </section>

        <section className="press-bar">
          <p className="press-bar-label">Covered worldwide</p>
          <div className="press-bar-logos">
            {PRESS_OUTLETS.map((outlet) => (
              <Link
                key={outlet.href}
                to={outlet.href}
                aria-label={`${outlet.label} article`}
                className={outlet.src ? `press-bar-logo-link${outlet.badge ? ' press-bar-logo-link--badge' : ''}` : 'press-bar-text-link'}>
                {outlet.src ? (
                  <img src={outlet.src} alt={outlet.label} className={`press-bar-logo${outlet.logoClass ? ` ${outlet.logoClass}` : ''}`} loading="lazy" decoding="async" />
                ) : outlet.label}
              </Link>
            ))}
          </div>
          <Link to="/docs/press" className="press-bar-more">View all press coverage →</Link>
        </section>

        <section className="section-block">
          <div className="grid three quick-start-grid">
            <CommandCard
              title="Run locally before you push"
              command={`npm install -g cve-lite-cli\ncve-lite /path/to/project --verbose`}
            />
            <FeatureCard title="Local-first">
              Scans your lockfile on your machine. No hosted account or cloud
              dashboard required.
            </FeatureCard>
            <FeatureCard title="Actionable">
              Prioritizes copy-and-run commands instead of leaving you with raw
              CVE IDs.
            </FeatureCard>
            <FeatureCard title="Designed for fix loops">
              Run a scan, apply the suggested command, rescan immediately, and
              keep moving without waiting on CI.
            </FeatureCard>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Parent-aware remediation</p>
            <h2>Fix the package that controls the vulnerable dependency path.</h2>
            <p>
              Transitive CVEs are easy to mishandle. CVE Lite CLI avoids
              recommending direct installs for packages that are only present
              transitively and points at the parent package instead.
            </p>
          </div>
          <div className="spotlight-card">
            <div className="command-stack">
              <span className="compare-label muted-label">Avoid for transitive-only packages</span>
              <CodeBlock language="bash">npm install vulnerable-child@fixed</CodeBlock>
            </div>
            <div className="command-stack">
              <span className="compare-label">Prefer when the range allows it</span>
              <CodeBlock language="bash">npm update parent-package</CodeBlock>
            </div>
            <div className="command-stack">
              <span className="compare-label">Use when the range must change</span>
              <CodeBlock language="bash">npm install parent-package@target</CodeBlock>
            </div>
          </div>
          <div className="grid three">
            <FeatureCard title="Understands npm parent ranges">
              For npm lockfiles, the CLI checks whether a known non-vulnerable
              child can be resolved inside the current parent range first.
            </FeatureCard>
            <FeatureCard title="Works with workspace hoisting">
              Workspace-local package context is preserved so hoisted npm
              packages can still map back to their logical parent chain.
            </FeatureCard>
            <FeatureCard title="Explains the decision">
              <Link to="/docs/remediation-strategy">Read the remediation strategy</Link>{' '}
              to see when the CLI recommends direct upgrades, parent updates, or
              parent upgrades.
            </FeatureCard>
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <p className="eyebrow">Guides</p>
            <h2>Go deeper when you need the details.</h2>
            <p>
              Learn how CVE Lite CLI builds reports, handles restricted
              networks, compares with common scanners, and behaves across
              package-manager lockfiles.
            </p>
          </div>
          <div className="grid three">
            <FeatureCard title="HTML reports">
              Generate a self-contained dashboard with severity cards,
              searchable findings, and copy-ready fix commands.{' '}
              <Link to="/docs/html-report">Read the guide</Link>.
            </FeatureCard>
            <FeatureCard title="Offline advisory DB">
              Sync OSV data locally and scan restricted environments without
              runtime advisory API calls.{' '}
              <Link to="/docs/offline-advisory-db">Read the guide</Link>.
            </FeatureCard>
            <FeatureCard title="Tool comparison">
              See how CVE Lite CLI compares with Dependabot, npm audit,
              OSV-Scanner, Snyk, and Socket.{' '}
              <Link to="/docs/comparison">Compare tools</Link>.
            </FeatureCard>
          </div>
        </section>
      </main>
    </Layout>
  );
}
