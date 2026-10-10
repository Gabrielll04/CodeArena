/**
 * Protocolo do modo isolado, sem dependências de ambiente (roda no Node e no navegador).
 *
 * O plugin isolado roda em outro contexto (processo Node restrito no servidor, iframe sem origem no navegador).
 * Lá, `createPluginHandler` responde às chamadas; aqui, `createPluginProxy` monta um QuizPlugin comum que
 * encaminha cada chamada. O app usa o proxy como usaria o plugin, sem nunca executar o código dele.
 */

export const ISOLATION_CHANNEL = 'codearena-plugin';

/** Metadados serializáveis do plugin (funções e schemas ficam de fora). */
export function describePlugin(plugin) {
  return {
    id: plugin.id,
    displayName: plugin.displayName,
    description: plugin.description,
    version: plugin.version,
    editorLanguage: plugin.editorLanguage,
    editorFileName: plugin.editorFileName,
    validators: Object.fromEntries(
      Object.entries(plugin.validators ?? {}).map(([name, v]) => [
        name,
        { description: v.description, mode: v.mode, exampleParams: v.exampleParams },
      ]),
    ),
    hasSession: typeof plugin.createSession === 'function',
    hasSubmissionCheck: typeof plugin.validateSubmission === 'function',
    authoring: plugin.authoring
      ? { defaultStarterCode: plugin.authoring.defaultStarterCode, docsPath: plugin.authoring.docsPath }
      : undefined,
  };
}

function formatIssues(error) {
  return (error?.issues ?? []).map((i) => `${(i.path ?? []).join('.') || '(raiz)'}: ${i.message}`).join('; ');
}

/** Responde às chamadas do app dentro do contexto isolado. */
export function createPluginHandler(plugin) {
  const sessions = new Map();
  let nextSession = 1;

  return async function handle(method, params = {}) {
    switch (method) {
      case 'describe':
        return describePlugin(plugin);
      case 'createSession': {
        const id = nextSession++;
        sessions.set(id, await plugin.createSession({ ...params, modes: new Set(params.modes ?? []) }));
        return id;
      }
      case 'disposeSession': {
        const session = sessions.get(params.sessionId);
        sessions.delete(params.sessionId);
        if (session !== undefined) await plugin.disposeSession?.(session);
        return null;
      }
      case 'validate': {
        const validator = plugin.validators?.[params.validator];
        if (!validator) throw new Error(`Validador "${params.validator}" não existe no plugin`);
        let value = params.params;
        if (validator.params) {
          const parsed = validator.params.safeParse(value);
          if (!parsed.success) throw new Error(`Parâmetros inválidos: ${formatIssues(parsed.error)}`);
          value = parsed.data;
        }
        const session = params.sessionId === undefined ? undefined : sessions.get(params.sessionId);
        const outcome = await validator.validate({ code: params.code, question: params.question, item: params.item, params: value, session });
        return typeof outcome === 'boolean' ? { passed: outcome } : { passed: Boolean(outcome?.passed), message: outcome?.message };
      }
      case 'validateSubmission':
        return plugin.validateSubmission ? plugin.validateSubmission(params.code, params.question) : { valid: true };
      default:
        throw new Error(`Chamada desconhecida: ${method}`);
    }
  };
}

/**
 * Monta um QuizPlugin que encaminha tudo para o contexto isolado.
 * `call(method, params)` envia a chamada e devolve a resposta (ou rejeita com a mensagem de erro).
 *
 * Limitações: `getStarterCode` devolve o `starterCode` da questão (não há chamada síncrona entre contextos)
 * e as ajudas de regex do plugin não aparecem no editor manual.
 */
export function createPluginProxy(description, call) {
  const validators = Object.fromEntries(
    Object.entries(description.validators).map(([name, meta]) => [
      name,
      {
        description: meta.description,
        mode: meta.mode,
        exampleParams: meta.exampleParams,
        // Os parâmetros são conferidos do lado isolado, com o schema do próprio plugin.
        validate: ({ code, question, item, params, session }) =>
          call('validate', { validator: name, code, question, item, params, sessionId: session?.id }),
      },
    ]),
  );
  return {
    id: description.id,
    displayName: description.displayName,
    description: description.description,
    version: description.version,
    editorLanguage: description.editorLanguage,
    editorFileName: description.editorFileName,
    isolated: true,
    getStarterCode: (question) => question.starterCode,
    validators,
    ...(description.hasSession && {
      createSession: async ({ code, question, modes }) => ({ id: await call('createSession', { code, question, modes: [...modes] }) }),
      disposeSession: (session) => call('disposeSession', { sessionId: session.id }),
    }),
    ...(description.hasSubmissionCheck && {
      validateSubmission: (code, question) => call('validateSubmission', { code, question }),
    }),
    authoring: description.authoring,
  };
}
