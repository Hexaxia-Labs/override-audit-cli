import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const latestVersion = 'v1.18.1';

const config: Config = {
  title: 'CVE Lite CLI',
  tagline: 'Scan. Understand. Fix.',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://owasp.org',
  baseUrl: '/cve-lite-cli/',
  organizationName: 'OWASP',
  projectName: 'cve-lite-cli',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/OWASP/cve-lite-cli/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: 'docs',
        searchBarShortcut: true,
        searchBarShortcutKeymap: 'mod+k',
        searchBarPosition: 'right',
      },
    ],
  ],

  themeConfig: {
    image: 'img/logos-combined.svg',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    metadata: [
      {
        name: 'description',
        content:
          'Free JS/TS dependency vulnerability scanner. Scan npm, pnpm, Yarn, and Bun lockfiles locally, get parent-aware remediation guidance, and run offline.',
      },
      {
        name: 'keywords',
        content:
          'JavaScript vulnerability scanner, TypeScript CVE scanner, npm audit alternative, dependency vulnerability scanner, lockfile scanner, OWASP, CVE scanner',
      },
    ],
    navbar: {
      logo: {
        alt: 'CVE Lite CLI',
        src: 'img/logo-with-title-removebg-preview.png',
      },
      items: [
        {
          to: '/docs',
          position: 'left',
          label: 'Docs',
          activeBaseRegex: '^/docs/?$',
        },
        {
          to: '/docs/getting-started',
          label: 'Getting Started',
          position: 'left',
          activeBaseRegex: '^/docs/getting-started/?$',
        },
        {
          to: '/docs/remediation-strategy',
          label: 'Remediation',
          position: 'left',
          activeBaseRegex: '^/docs/remediation-strategy/?$',
        },
        {
          to: '/docs/comparison',
          label: 'Compare',
          position: 'left',
          activeBaseRegex: '^/docs/comparison/?$',
        },
        {
          href: 'https://owasp.org/cve-lite-cli',
          html: '<span class="navbar-owasp-badge"><img src="/cve-lite-cli/img/OWASP_Logo_Black_TM.png" alt="" class="navbar-owasp-mark" /><span>An OWASP Foundation Project</span></span>',
          'aria-label': 'CVE Lite CLI is an OWASP Foundation Project',
          className: 'navbar-owasp-link',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/cve-lite-cli',
          html: `<span class="navbar-npm-wordmark" aria-hidden="true"><span>npm</span><strong>${latestVersion}</strong></span>`,
          'aria-label': `View CVE Lite CLI ${latestVersion} on npm`,
          className: 'navbar-icon-link',
          position: 'right',
        },
        {
          href: 'https://github.com/OWASP/cve-lite-cli',
          html: '<span class="navbar-github-badge"><img src="/cve-lite-cli/img/github-mark.svg" alt="" class="navbar-icon navbar-icon-github" /><span>GitHub</span></span>',
          'aria-label': 'View CVE Lite CLI on GitHub',
          className: 'navbar-github-link',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Guides',
          items: [
            {
              label: 'Remediation strategy',
              to: '/docs/remediation-strategy',
            },
            {
              label: 'HTML reports',
              to: '/docs/html-report',
            },
            {
              label: 'Offline advisory DB',
              to: '/docs/offline-advisory-db',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/OWASP/cve-lite-cli',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/cve-lite-cli',
            },
            {
              label: 'GitHub Action',
              href: 'https://github.com/marketplace/actions/cve-lite-cli',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Open an issue',
              href: 'https://github.com/OWASP/cve-lite-cli/issues',
            },
            {
              label: 'Contributing',
              href: 'https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/CONTRIBUTING.md',
            },
            {
              label: 'Security',
              href: 'https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/SECURITY.md',
            },
            {
              label: 'Press',
              to: '/docs/press',
            },
          ],
        },
      ],
      copyright: `CVE Lite CLI is MIT licensed, built in public, and maintained as an OWASP Foundation Project by Sonu Kapoor.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
