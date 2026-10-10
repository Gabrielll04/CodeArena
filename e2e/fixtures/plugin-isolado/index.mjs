/** Plugin de teste sem dependências, para o modo isolado (servidor em processo restrito, navegador em iframe). */
const palavra = {
  safeParse: (value) =>
    typeof value?.palavra === 'string'
      ? { success: true, data: value }
      : { success: false, error: { issues: [{ path: ['palavra'], message: 'obrigatório' }] } },
};

export default {
  id: 'isolado-teste',
  displayName: 'Plugin isolado (teste)',
  description: 'Valida palavras no texto; roda isolado.',
  version: '1.0.0',
  editorLanguage: 'plaintext',
  getStarterCode: (question) => question.starterCode,
  validators: {
    temPalavra: {
      description: 'O texto contém a palavra indicada.',
      mode: 'static',
      params: palavra,
      exampleParams: { palavra: 'ohm' },
      validate: ({ code, params }) => code.toLowerCase().includes(params.palavra.toLowerCase()),
    },
  },
};
