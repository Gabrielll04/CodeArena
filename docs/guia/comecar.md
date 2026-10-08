# Primeiros passos

Em menos de cinco minutos você tem uma sala funcionando na sua máquina.

## Requisitos

- **Node.js 22.13+**
- **pnpm 10** (`corepack enable`)

## Rodando

```bash
git clone https://github.com/Gabrielll04/CodeArena.git
cd CodeArena
pnpm install

# desenvolvimento: API em :3001 e interface em :5173
pnpm dev

# produção: build do frontend e servidor único em :3000
pnpm build
pnpm start
```

Alunos na mesma rede entram pelo endereço exibido no log do servidor (ex.: `http://192.168.0.10:3000`).

## Sua primeira aula

1. Abra `/teacher` e clique em **Abrir sala** em um dos packs de exemplo.
2. Projete o código de 6 dígitos que aparece no lobby.
3. Os alunos acessam `/join`, digitam o código, escolhem nome e avatar.
4. Clique em **Iniciar questão**. A contagem regressiva começa para todos ao mesmo tempo.
5. Acompanhe os itens da checklist ao vivo, encerre a questão e veja o placar.
6. Ao final, **Encerrar sessão** gera o relatório com a revisão da turma.

![Lobby do professor](../images/07-lobby-professor.png)

## Próximos passos

- Crie ou importe suas questões: [Guia de autoria e aula](../content/authoring-guide.md).
- Gere packs com IA: [Prompts prontos](../agents/prompt-templates.md).
- Crie um plugin para a sua disciplina: [Criando um plugin](../plugins/creating-a-plugin.md).
- Entenda o sistema: [Arquitetura](../architecture.md).
