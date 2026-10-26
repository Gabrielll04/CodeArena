# Projetos guiados (`"kind": "guided"`)

Um projeto guiado pede algo maior ("Crie uma tela de perfil") e leva o aluno passo a passo. Cada item da checklist é um
passo, na ordem do array, e o `hint` do item é a instrução do passo. O aluno vê o passo atual em destaque, com a
instrução, e os próximos esmaecidos. A questão pode mostrar uma imagem do resultado esperado (`goalImage`).

Funciona em salas de competição e em atividades avaliativas, com qualquer plugin: o motor da checklist é o mesmo.

## Regras

1. Use `"kind": "guided"` e entre 3 e 8 passos obrigatórios.
2. Todo passo obrigatório tem `hint`: uma instrução curta do que fazer agora ("Importe View e Text de react-native").
3. O `label` é o resultado verificável do passo, no imperativo ("Importar View e Text"); o `hint` explica como chegar lá.
4. A ordem importa: cada passo depende só dos anteriores. Evite passos que o aluno só consegue cumprir juntos.
5. As regras seguem `checklist-rules.md`: cada passo é verificável por máquina e o `starterCode` não completa a checklist.
6. `goalImage` é opcional: um link `https://` de uma imagem do resultado final. Não invente links; omita o campo se não
   houver imagem real.
7. `weight` é opcional (padrão 1, de 0.1 a 10): use valores maiores nos passos que mais importam para a nota das
   atividades avaliativas.

## Exemplo

```json
{
  "id": "tela-de-perfil",
  "kind": "guided",
  "title": "Tela de perfil",
  "prompt": "Crie uma tela de perfil com o nome \"Ana Souza\" e um botão \"Seguir\".",
  "timeLimitSeconds": 600,
  "baseXP": 500,
  "speedBonusMax": 300,
  "starterCode": "",
  "solution": "import { View, Text, Button } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Text>Ana Souza</Text>\n      <Button title=\"Seguir\" />\n    </View>\n  );\n}\n",
  "checklist": [
    { "id": "importar", "label": "Importar View, Text e Button", "hint": "Na primeira linha, importe View, Text e Button de react-native.", "rule": { "type": "regex", "pattern": "import\\s*\\{[^}]*\\bButton\\b[^}]*\\}\\s*from\\s*['\"]react-native['\"]" } },
    { "id": "app", "label": "Criar o componente App", "hint": "Escreva export default function App() e devolva uma View.", "rule": { "type": "regex", "pattern": "export\\s+default\\s+function\\s+App\\s*\\(" } },
    { "id": "nome", "label": "Mostrar o nome \"Ana Souza\"", "hint": "Dentro da View, coloque um Text com o nome.", "rule": { "type": "regex", "pattern": "<Text[^>]*>\\s*Ana Souza\\s*</Text>" }, "weight": 2 },
    { "id": "botao", "label": "Criar o botão \"Seguir\"", "hint": "Abaixo do nome, adicione um Button com title=\"Seguir\".", "rule": { "type": "regex", "pattern": "<Button[^>]*title\\s*=\\s*[{]?\\s*['\"]Seguir['\"]" }, "weight": 2 }
  ]
}
```

`pnpm validate:packs` avisa quando falta `hint` em algum passo ou quando há menos de 3 passos.
