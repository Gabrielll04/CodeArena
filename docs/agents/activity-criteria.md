# Critérios de avaliação para atividades (MSEP)

Na sala **Atividade**, o aluno resolve sem checklist automática e o professor avalia depois, à mão ou com uma IA. A
checklist da questão vira a lista de **critérios de avaliação** da Metodologia SENAI de Educação Profissional (MSEP):

- item obrigatório = **critério crítico** (o aluno precisa atender);
- item com `"optional": true` = **critério desejável** (aumenta a nota);
- `capability` = o que o critério avalia: `capacidade-tecnica`, `capacidade-socioemocional` ou `conhecimento`, com o
  nome (`name`).

Nota de 0 a 100: todos os críticos atendidos dão de 50 a 100, conforme os desejáveis; faltou algum crítico, no máximo 50.

## Regras

1. Cada critério descreve um resultado **observável no código** ("Validar o e-mail antes de salvar"), nunca uma opinião
   ("Código bem feito"). As regras 3 a 6 do `AGENTS.md` continuam valendo.
2. Entre 2 e 4 críticos e de 1 a 4 desejáveis por questão. Críticos são o mínimo para a questão estar resolvida.
3. Use `capability` em todo critério. O `name` é curto e reaproveitável entre questões ("Utilizar componentes de
   interface", "Tratar erros de entrada").
4. Prefira regras verificáveis (`pluginRule`, `regex`, `contains`): na atividade elas viram uma sugestão automática para
   quem avalia, e a mesma questão funciona em salas de competição.
5. Use `{ "type": "manual" }` só quando o código não basta para verificar (ex.: nomes descritivos, organização em
   funções). Um critério manual nunca é marcado sozinho e não conta para a aceitação automática nas competições; uma
   questão só com críticos manuais funciona apenas em atividades (o validador avisa).
6. O enunciado diz o que construir, não como. Não descreva os critérios passo a passo no enunciado: o aluno já os vê.
7. `hint` é opcional e aparece para o aluno junto do critério.

## Exemplo

```json
{
  "id": "cadastro-contato",
  "title": "Cadastro de contato",
  "prompt": "Crie uma tela com um campo para o nome do contato e um botão \"Salvar\" que mostra o nome salvo abaixo do botão.",
  "timeLimitSeconds": 900,
  "baseXP": 500,
  "speedBonusMax": 300,
  "solution": "import { useState } from 'react';\nimport { View, Text, TextInput, Button } from 'react-native';\n\nexport default function App() {\n  const [nome, setNome] = useState('');\n  const [salvo, setSalvo] = useState('');\n\n  return (\n    <View>\n      <TextInput placeholder=\"Nome\" value={nome} onChangeText={setNome} />\n      <Button title=\"Salvar\" onPress={() => setSalvo(nome)} />\n      <Text>{salvo}</Text>\n    </View>\n  );\n}\n",
  "checklist": [
    {
      "id": "campo-nome",
      "label": "Criar o campo de texto para o nome",
      "rule": { "type": "pluginRule", "validator": "reactNativeHasComponent", "params": { "component": "TextInput" } },
      "capability": { "type": "capacidade-tecnica", "name": "Utilizar componentes de interface" }
    },
    {
      "id": "estado",
      "label": "Guardar o nome digitado em um estado",
      "rule": { "type": "pluginRule", "validator": "reactNativeUsesHook", "params": { "hook": "useState" } },
      "capability": { "type": "conhecimento", "name": "Estado de componentes" }
    },
    {
      "id": "botao-salvar",
      "label": "Criar o botão \"Salvar\"",
      "rule": { "type": "pluginRule", "validator": "reactNativeHasComponentProp", "params": { "component": "Button", "prop": "title", "value": "Salvar" } },
      "capability": { "type": "capacidade-tecnica", "name": "Utilizar componentes de interface" }
    },
    {
      "id": "nomes-descritivos",
      "label": "Usar nomes descritivos para variáveis e funções",
      "rule": { "type": "manual" },
      "optional": true,
      "capability": { "type": "capacidade-socioemocional", "name": "Organização" }
    },
    {
      "id": "placeholder",
      "label": "Mostrar uma dica dentro do campo",
      "rule": { "type": "pluginRule", "validator": "reactNativeHasComponentProp", "params": { "component": "TextInput", "prop": "placeholder" } },
      "optional": true,
      "capability": { "type": "capacidade-tecnica", "name": "Utilizar componentes de interface" }
    }
  ]
}
```

Rode `pnpm validate:packs` antes de entregar: a solução precisa atender a todos os críticos verificáveis.
