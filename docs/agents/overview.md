# Visão geral para agentes

Este documento explica o que é uma questão do CodeArena e como ela é avaliada, para que você gere conteúdo correto.

## O que o aluno vê

```
+-------------------+-----------------------------+--------------------+
| Enunciado         |                             | Painel do plugin   |
|                   |  Editor de código (Monaco)  | (preview de        |
| Checklist         |                             |  celular ou        |
|  (o) Item 1       |                             |  cliente HTTP)     |
|  ( ) Item 2       |                             |                    |
|  ( ) Item 3       |                             |                    |
+-------------------+-----------------------------+--------------------+
```

- O aluno só responde escrevendo código.
- A checklist é recalculada a cada alteração (com debounce): itens de texto em ~120 ms; itens que executam código em ~700 ms.
- Quando **todos os itens obrigatórios** ficam concluídos, a resposta é enviada automaticamente.
- O servidor reavalia a mesma checklist com o mesmo motor. Só então a resposta vale XP.

## Ciclo de vida de uma questão

1. O professor inicia a questão. O servidor envia a questão (sem a `solution`) e o horário de início.
2. Há uma contagem regressiva curta (3 s por padrão) para que todos comecem juntos.
3. O tempo conta no servidor (`timeLimitSeconds`).
4. Cada resposta correta recebe `xp = baseXP + round(speedBonusMax * tempoRestante / tempoTotal)`.
5. A questão termina quando todos os alunos conectados acertam, quando o tempo acaba ou quando o professor encerra.
6. O placar é exibido e a `solution` é revelada.

## Como uma regra é avaliada

| Tipo | Avalia | Exemplo de uso |
| --- | --- | --- |
| `contains` | O código contém um texto exato | `"value": "useState("` |
| `notContains` | O código **não** contém um texto | proibir `alert(` |
| `regex` | O código casa com uma expressão regular | `export\\s+default\\s+function\\s+App\\s*\\(` |
| `pluginRule` | Validador específico do plugin (AST, execução, HTTP) | `reactNativeHasComponentProp`, `httpRequest` |

Prefira `pluginRule` quando existir um validador adequado: ele entende a estrutura do código (ignora comentários,
aceita aspas simples e duplas, executa o servidor de verdade) e gera menos falsos positivos que regex.

## O que torna uma questão boa

- Enunciado curto (1 a 3 frases) com o resultado esperado explícito: nomes, textos, rotas, status.
- Cada item da checklist corresponde a um passo que o aluno consegue reconhecer no próprio código.
- Entre 2 e 5 itens. Mais que isso cansa; menos que 2 raramente orienta.
- Dificuldade progressiva dentro do pack.
- Tempo realista: 120 a 180 s para um passo simples, 240 a 420 s para lógica com estado ou várias rotas.
- Se uma resposta "decorada" passaria (ex.: retornar sempre `{ "id": "42" }`), adicione um segundo caso de teste.

## Plugins disponíveis

| `pluginId` | Para quê | Guia |
| --- | --- | --- |
| `react-native` | Componentes, props, estado e estilos com preview em celular | `plugin-react-native.md` |
| `backend-http` | Servidores Express/Fastify validados por requisições HTTP | `plugin-backend-http.md` |
