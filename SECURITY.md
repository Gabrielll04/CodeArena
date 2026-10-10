# Política de segurança

O CodeArena executa código escrito por alunos (no navegador e em um processo isolado no servidor) e concede pontuação
em tempo real. Levamos a sério falhas nessas duas áreas.

## Relatando uma vulnerabilidade

**Não abra uma issue pública.** Use o relato privado do GitHub: aba **Security** > **Report a vulnerability** neste
repositório. Descreva o que acontece, como reproduzir (um pack e o código do aluno, se for o caso) e o impacto.

Respondemos em até 7 dias e mantemos você informado até a correção. Pedimos que aguarde a correção antes de divulgar.

## O que consideramos vulnerabilidade

- Escapar do isolamento do runner de `backend-http` (ler arquivos, abrir processos, variáveis de ambiente do servidor, rede).
- Escapar do iframe `sandbox` do preview do `react-native` (acessar `localStorage`, cookies ou DOM do app).
- Alterar a pontuação, o tempo ou a validação de outro jogador (ou a própria) sem completar a checklist.
- Assumir o controle de uma sala sem o `hostToken`, ou ver o código de outros alunos.
- Execução de script (XSS) a partir de enunciados, nomes ou packs importados.
- Negação de serviço do servidor por uma única conexão ou um único envio.

## Limitações conhecidas (não são vulnerabilidades novas)

- O modelo de permissões do Node, usado no runner, **não bloqueia rede de saída**. Em ambientes públicos, rode o servidor
  (ou só o runner) em contêiner sem rede. Detalhes em [`docs/architecture.md`](docs/architecture.md).
- Sem autenticação de professor no MVP: quem tem o `hostToken` da sala a controla.

## Versões suportadas

O projeto está em desenvolvimento ativo; correções de segurança entram na branch principal.

## Plugins de terceiros

Plugins rodam como código confiável, a menos que a instalação os ative no **modo isolado**
(`"isolated": true` em `codearena.config.json`, ou `pnpm codearena plugins add <pacote> --isolated`). No modo isolado,
o plugin roda num processo Node restrito no servidor e num iframe sem origem no navegador. Detalhes e limitações em
`docs/architecture.md` (seção "Segurança dos plugins"). Falhas nesse isolamento são vulnerabilidades: reporte como abaixo.

## Escrevendo plugins que executam código

Se o seu plugin executa código de alunos: use Web Worker no navegador e processo/contêiner isolado no servidor, com limites
de tempo e memória, sem acesso a arquivos ou variáveis de ambiente, e falhe de forma explícita quando o ambiente não existir
(nunca aprove por padrão).
