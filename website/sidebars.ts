import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'index',
    {
      type: 'category',
      label: 'Get Running',
      collapsed: false,
      items: [
        'getting-started',
        'cli-reference',
        'reading-output',
      ],
    },
    {
      type: 'category',
      label: 'Fix Issues',
      collapsed: true,
      items: [
        'remediation-strategy',
        'fix-mode',
        'html-report',
      ],
    },
    {
      type: 'category',
      label: 'Integrate',
      collapsed: true,
      items: [
        'workflow-integration',
        'ai-assistant-integration',
        'sarif',
        'cyclonedx',
        'caching',
        'offline-advisory-db',
        'offline-vs-online-results',
        'corporate-proxy',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'parser-coverage',
        'how-it-works',
        'comparison',
        'troubleshooting',
        'security-assurance-case',
        'roadmap',
        'press',
      ],
    },
    {
      type: 'category',
      label: 'Case Studies',
      items: [
        'case-studies/owasp-juice-shop',
        'case-studies/nestjs',
        'case-studies/analog',
        'case-studies/lint-staged',
        'case-studies/ghost',
        'case-studies/astro',
        'case-studies/turborepo',
        'case-studies/vscode',
      ],
    },
  ],
};

export default sidebars;
