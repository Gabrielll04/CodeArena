# Plugin `react-native`

Questões de React Native com preview em moldura de celular. O código do aluno é transpilado (sucrase) e renderizado
com **react-native-web** dentro de um iframe isolado (`sandbox="allow-scripts"`, origem opaca).

- `pluginId`: `react-native`
- Editor: TypeScript/JSX (`App.tsx`)
- Código fonte: `plugins/react-native/src`

## Componentes suportados no preview

`View`, `Text`, `Button`, `TextInput`, `StyleSheet` (mínimo garantido) e também `Image`, `ScrollView`, `Pressable`,
`TouchableOpacity`, `Switch`, `FlatList`, `ActivityIndicator`, `SafeAreaView`, `Alert` (exibido como aviso no preview).

Módulos permitidos em `import`: `react` e `react-native`. Outros módulos geram o erro "Módulo indisponível".
Se o aluno esquecer de importar `View`, `Text` etc., o preview ainda funciona (os componentes estão no escopo),
mas a checklist pode exigir o import com `reactNativeImports`.

O componente exibido é o `export default` (ou um export nomeado `App`).

## Validadores (`pluginRule`)

Todos são **estáticos**: analisam a AST (Babel) do código, então ignoram comentários e aceitam aspas simples,
duplas, template strings e `{'texto'}`. Se o código tiver erro de sintaxe, o item fica pendente com a linha do erro.

| Validador | Parâmetros | Concluído quando |
| --- | --- | --- |
| `reactNativeCompiles` | `{}` | o código não tem erro de sintaxe |
| `reactNativeExportsDefaultComponent` | `{ "name"?: "App" }` | há `export default` de função/classe (com o nome, se informado) |
| `reactNativeHasComponent` | `{ "component": "Button", "min"?: 1 }` | existem pelo menos `min` elementos `<Button>` |
| `reactNativeHasComponentProp` | `{ "component": "Button", "prop": "title", "value"?: "Clique aqui" }` | algum `<Button>` tem a prop (com o valor, se informado) |
| `reactNativeHasText` | `{ "text": "Olá", "component"?: "Text", "exact"?: false, "caseSensitive"?: true }` | algum `<Text>` exibe o texto (espaços normalizados) |
| `reactNativeImports` | `{ "module"?: "react-native", "names": ["View"] }` | importa todos os nomes do módulo |
| `reactNativeUsesHook` | `{ "hook": "useState" }` | chama o hook (`useState(...)` ou `React.useState(...)`) |
| `reactNativeHasStyle` | `{ "property": "padding", "value"?: 16 }` | algum objeto (StyleSheet ou style inline) define a propriedade |

`value` compara literais (`"Clique aqui"`, `16`, `true`). Para expressões, informe o texto exato da expressão
(ex.: `"value": "styles.card"` para `style={styles.card}`); sem `value`, basta a prop existir.

## Como montar a checklist

1. Um item para a estrutura (componente exportado, componente usado).
2. Um item por requisito visível do enunciado (texto, título, placeholder, estilo).
3. Para estado, combine `reactNativeUsesHook` com um item que verifique o uso (`onPress`, setter).
4. **Sempre** inclua `reactNativeCompiles` quando os demais itens forem regex ou texto: sem ele, código com erro de sintaxe pode completar a checklist, ser aceito e travar o editor com um app quebrado (veja as imagens abaixo).

## Questões progressivas (exemplo)

1. **Texto** - `Text` com "Olá, CodeArena" dentro de `View` (`reactNativeHasComponent`, `reactNativeHasText`).
2. **Botão** - `Button` com `title="Clique aqui"` (`reactNativeHasComponentProp`).
3. **Entrada** - `TextInput` com `placeholder="Seu nome"` e import correto (`reactNativeImports`).
4. **Estado** - contador com `useState` e `Button` "Somar" com `onPress` (`reactNativeUsesHook`, `reactNativeHasComponentProp`, regex do setter).
5. **Estilo** - `StyleSheet.create` com `backgroundColor` e `padding` aplicados via `style` (`reactNativeHasStyle`).

Veja todas implementadas em `content/packs/react-native-fundamentos.json`.

```json
{
  "id": "botao-clique-aqui",
  "prompt": "Faça um app com um botão escrito \"Clique aqui\" em React Native.",
  "timeLimitSeconds": 180,
  "baseXP": 500,
  "speedBonusMax": 500,
  "solution": "export default function App() {\n  return <Button title=\"Clique aqui\" />;\n}",
  "checklist": [
    { "id": "componente-app", "label": "Criar o componente App", "rule": { "type": "pluginRule", "validator": "reactNativeExportsDefaultComponent", "params": { "name": "App" } } },
    { "id": "usar-button", "label": "Utilizar o componente Button", "rule": { "type": "pluginRule", "validator": "reactNativeHasComponent", "params": { "component": "Button" } } },
    { "id": "titulo", "label": "Definir title=\"Clique aqui\"", "rule": { "type": "pluginRule", "validator": "reactNativeHasComponentProp", "params": { "component": "Button", "prop": "title", "value": "Clique aqui" } } }
  ]
}
```

## Como fica na prática

Checklist parcial: ao escrever `export default function App()`, o primeiro item é marcado imediatamente.

![Checklist parcial no plugin react-native](../images/rn-01-checklist-parcial.png)

Erros de sintaxe aparecem no preview (com a linha) e não derrubam o app. Observe que os três itens de texto já estão
concluídos, mas o item `reactNativeCompiles` continua pendente: **sem um item de sintaxe, código quebrado que casa as
regex seria aceito e o editor travaria com um app que não renderiza**. Por isso o pack de exemplo inclui esse item.

![Erro de sintaxe no preview](../images/rn-02-erro-no-preview.png)

Checklist completa: o servidor valida de novo, concede o XP e o editor fica somente leitura. O preview continua interativo.

![Resposta aceita e preview](../images/rn-03-resposta-aceita.png)

Questões com estado (`useState`) funcionam no preview; os toques do aluno rodam o código dele.

![Contador com estado](../images/rn-04-contador-com-estado.png)

## Diferenças entre React Native e web (alerte nos enunciados quando relevante)

- Texto precisa estar dentro de `<Text>`; `<div>`, `<span>`, `<p>` não existem.
- `Button` não aceita filhos: o texto vai em `title`. Para botões customizados use `Pressable`/`TouchableOpacity`.
- Eventos: `onPress` (não `onClick`), `onChangeText` em `TextInput` (recebe a string, não um evento).
- Estilos são objetos JavaScript em camelCase (`backgroundColor`), números sem unidade (`padding: 16`), sem CSS em cascata.
- Layout usa flexbox com `flexDirection: 'column'` por padrão.
- O preview usa react-native-web: APIs nativas (câmera, sensores, `Linking`, navegação) não estão disponíveis.
