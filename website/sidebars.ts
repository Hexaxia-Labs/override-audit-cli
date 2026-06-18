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
        'how-remediation-works',
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
        'ratcheting',
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
      link: { type: 'doc', id: 'case-studies/index' },
      items: [
        'case-studies/owasp-juice-shop',
        'case-studies/nestjs',
        'case-studies/analog',
        'case-studies/lint-staged',
        'case-studies/ghost',
        'case-studies/astro',
        'case-studies/turborepo',
        'case-studies/vscode',
        'case-studies/gatsby',
        'case-studies/vercel-ai-sdk',
        'case-studies/mastra',
        'case-studies/lit',
        'case-studies/langchainjs',
        'case-studies/openai-agents-js',
        'case-studies/n8n',
        'case-studies/camofox-browser',
        'case-studies/payload',
        'case-studies/presenton',
        'case-studies/storybook',
        'case-studies/strapi',
        'case-studies/twenty',
      ],
    },
  ],
};

export default sidebars;
