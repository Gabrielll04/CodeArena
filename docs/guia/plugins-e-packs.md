# Plugins e packs: como funciona

O CodeArena separa duas coisas:

- **Plugin**: o código que ensina o CodeArena uma disciplina nova (validadores da checklist, preview, ferramentas).
  É um pacote npm, criado por quem programa.
- **Pack**: as questões de uma aula. É um arquivo JSON, criado por professores (no editor, importando JSON ou com IA).
  Todo pack aponta para um plugin pelo `pluginId`.

Um pack nunca contém código, e um plugin nunca vem junto com um pack. Para usar um pack, o plugin dele precisa estar
**instalado no servidor do CodeArena que você usa**.

## O caminho completo

```text
 autor do plugin          quem administra o servidor          professor                   outro professor
 ---------------          --------------------------          ---------                   ---------------
 cria o plugin     --->   instala o pacote           --->     cria o pack          --->   importa o JSON
 publica no npm           ativa em codearena.config.json      (editor, JSON ou IA)        (o servidor dele também
                          roda pnpm build                     exporta o JSON              precisa do plugin)
```

| Quem | Faz o quê | Precisa saber programar? |
| --- | --- | --- |
| Autor do plugin | Cria e publica o pacote ([Criando um plugin](../plugins/creating-a-plugin.md)) | Sim |
| Quem administra o servidor | Instala e ativa plugins (três comandos, abaixo) | Só usar o terminal |
| Professor | Cria, importa e compartilha packs; dá a aula | Não |

Muitas vezes a mesma pessoa faz os dois últimos papéis: o professor que roda o CodeArena no próprio computador.

## 1. Instalar o plugin (no servidor)

Cada servidor do CodeArena tem a sua lista de plugins ativos no arquivo `codearena.config.json`, na raiz do projeto.
Instalar um plugin no computador de um professor não o instala no servidor da escola, e vice-versa.

Para ativar um plugin, na pasta do CodeArena:

```bash
pnpm add -w codearena-plugin-eletrica
```

Acrescente o nome do pacote em `codearena.config.json`:

```json
{
  "plugins": ["@codearena/plugin-react-native", "@codearena/plugin-backend-http", "codearena-plugin-eletrica"]
}
```

Depois, gere o app de novo e reinicie o servidor:

```bash
pnpm build
pnpm start
```

Para conferir, abra **Biblioteca > Novo pack**: o plugin aparece na lista "Plugin". Se algo der errado (pacote não
encontrado, versão incompatível com este CodeArena), a mensagem aparece no terminal do servidor e os outros plugins
continuam funcionando.

Para **desativar**, tire o nome da lista e rode `pnpm build` de novo. Os packs desse plugin continuam salvos; só ficam
marcados como "Plugin não instalado" até ele voltar.

::: warning Instale só plugins em que você confia
Um plugin é código que roda no servidor e na página do app, como qualquer pacote npm. Prefira os oficiais e os que
você consegue revisar.
:::

## 2. Criar o pack

Com o plugin instalado, crie as questões como em qualquer outro pack ([Guia de autoria](../content/authoring-guide.md)):

- **Editor manual**: em Biblioteca > Novo pack, escolha o plugin. Os validadores dele aparecem em "Validador do plugin",
  já com parâmetros de exemplo.
- **Importar JSON**: o JSON precisa ter `"pluginId"` igual ao id do plugin (ex.: `"eletrica"`).
- **Com IA**: use como contexto as regras gerais de [docs/agents](../agents/overview.md) e o guia do plugin, que vem
  dentro do pacote (`docs/agents.md`). Depois valide:

  ```bash
  pnpm validate:packs meu-pack.json
  ```

## 3. Compartilhar o pack

Exporte o pack pelo ícone de download na Biblioteca e envie o JSON. Junto com o arquivo, informe **qual plugin ele
usa** (nome do pacote npm e versão). Quem recebe:

1. confere se o servidor dele tem esse plugin (se não tiver, faz o passo 1);
2. importa o JSON em Biblioteca > Importar JSON.

Se o plugin não estiver instalado, nada quebra: a importação avisa `plugin "eletrica" não está instalado neste app`,
a Biblioteca mostra "Plugin não instalado" no pack e o servidor não deixa abrir sala com ele.

## Estado atual

O modelo acima é o definido pela [decisão 0001](../decisoes/0001-plugins-como-pacotes.md). A migração está em
andamento ([etapas](../architecture.md#etapas-da-migracao)):

| Funciona hoje | Ainda não |
| --- | --- |
| Ativar e desativar plugins em `codearena.config.json` | Plugins de terceiros publicados no npm: o SDK (`@codearena/plugin-sdk`) ainda não foi publicado (etapa 2) |
| Plugins oficiais `react-native` e `backend-http` (Express) | Packs de exemplo vindos de dentro do plugin (etapa 3); hoje ficam em `content/packs/` |
| Plugins novos dentro deste repositório, em `plugins/` | Comando único para instalar (`pnpm codearena plugins add`) |
| Aviso de "Plugin não instalado" na Biblioteca, na importação e na sala | Catálogo de plugins e packs da comunidade |
| | O pack declarar a versão mínima do plugin (`pack.requires`); por enquanto, informe a versão junto do arquivo |

## Perguntas frequentes

**Uso o CodeArena da escola. Posso instalar um plugin?**
Não pelo navegador. Peça a quem administra o servidor; são os três comandos do passo 1.

**Os alunos precisam instalar alguma coisa?**
Não. Eles só abrem o endereço da sala. O navegador baixa o plugin sozinho quando a questão começa.

**Um plugin instalado deixa o app mais pesado para todo mundo?**
Não. A parte do plugin que roda no navegador só é baixada quando alguém abre uma questão dele. Plugins que não estão
em `codearena.config.json` nem entram no app.

**Posso misturar plugins num mesmo pack?**
Sim. Cada questão pode declarar o próprio `pluginId`; o servidor precisa ter todos os plugins usados.
