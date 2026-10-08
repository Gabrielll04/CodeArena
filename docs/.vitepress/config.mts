import { defineConfig } from 'vitepress';

const repo = 'https://github.com/Gabrielll04/kahoot-ti';

export default defineConfig({
  lang: 'pt-BR',
  title: 'CodeArena',
  description: 'Desafios de programação ao vivo, validados por checklist automática.',
  // GitHub Pages publica em /<repositório>/. Em desenvolvimento e em domínio próprio, use "/".
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  appearance: 'force-dark',
  srcExclude: ['**/README.md'],
  // Links para arquivos fora de docs/ (AGENTS.md, CONTRIBUTING.md...) apontam para o GitHub nas páginas.
  ignoreDeadLinks: [/^\.\.\/\.\.\//, /^\.\.\/[A-Z]+\.md$/, /localhost/],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${process.env.DOCS_BASE ?? '/'}favicon.svg` }],
    ['meta', { name: 'theme-color', content: '#0B0D18' }],
  ],
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'CodeArena',
    nav: [
      { text: 'Começar', link: '/guia/comecar' },
      { text: 'Professores', link: '/content/authoring-guide' },
      { text: 'Agentes de IA', link: '/agents/overview' },
      { text: 'Plugins', link: '/plugins/creating-a-plugin' },
      { text: 'Contribuir', link: '/contribuindo' },
    ],
    sidebar: [
      {
        text: 'Começar',
        items: [
          { text: 'Primeiros passos', link: '/guia/comecar' },
          { text: 'Arquitetura', link: '/architecture' },
        ],
      },
      {
        text: 'Para professores',
        items: [{ text: 'Guia de autoria e aula', link: '/content/authoring-guide' }],
      },
      {
        text: 'Para agentes de IA',
        items: [
          { text: 'Visão geral', link: '/agents/overview' },
          { text: 'Schema do question pack', link: '/agents/question-pack-schema' },
          { text: 'Regras de checklist', link: '/agents/checklist-rules' },
          { text: 'Questões de depuração', link: '/agents/debug-questions' },
          { text: 'Plugin react-native', link: '/agents/plugin-react-native' },
          { text: 'Plugin backend-http', link: '/agents/plugin-backend-http' },
          { text: 'Prompts prontos', link: '/agents/prompt-templates' },
        ],
      },
      {
        text: 'Plugins',
        items: [{ text: 'Criando um plugin', link: '/plugins/creating-a-plugin' }],
      },
      {
        text: 'Comunidade',
        items: [{ text: 'Contribuindo', link: '/contribuindo' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
          modal: {
            noResultsText: 'Nada encontrado para',
            resetButtonTitle: 'Limpar',
            footer: { selectText: 'abrir', navigateText: 'navegar', closeText: 'fechar' },
          },
        },
      },
    },
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Editar esta página no GitHub' },
    outline: { label: 'Nesta página', level: [2, 3] },
    docFooter: { prev: 'Anterior', next: 'Próxima' },
    darkModeSwitchLabel: 'Aparência',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Voltar ao topo',
    skipToContentLabel: 'Ir para o conteúdo',
    footer: { message: 'Licença MIT. Feito para professores e estudantes.', copyright: 'CodeArena' },
  },
});
