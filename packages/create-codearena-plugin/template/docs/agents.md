# Plugin {{id}}: guia para agentes de IA

Use este arquivo junto com as regras gerais do CodeArena (`docs/agents/` no repositório principal) para gerar question
packs deste plugin. Todo pack usa `"pluginId": "{{id}}"`.

## O que o aluno escreve

Descreva o tipo de resposta (linguagem, arquivo, o que o editor espera).

## Validadores

| Validador | Parâmetros | Concluído quando |
| --- | --- | --- |
| `hasLineStartingWith` | `{ "prefix": string, "count"?: number }` | existem pelo menos `count` linhas começando com `prefix` |

Exemplo de item:

```json
{ "id": "linha-resultado", "label": "Escrever a linha do resultado", "rule": { "type": "pluginRule", "validator": "hasLineStartingWith", "params": { "prefix": "R = " } } }
```

## Limites

- Liste aqui o que os validadores não conseguem verificar, para o agente não criar itens impossíveis.

## Verificação

```bash
pnpm validate:packs caminho/do/pack.json   # na instalação do CodeArena com este plugin ativo
```
