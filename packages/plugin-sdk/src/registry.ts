import { SLUG_PATTERN } from '@codearena/schemas';
import type { QuizPlugin } from './types';

export class PluginNotFoundError extends Error {
  constructor(public readonly pluginId: string) {
    super(`O plugin "${pluginId}" não está instalado. Registre-o no app ou corrija o pluginId do pack.`);
    this.name = 'PluginNotFoundError';
  }
}

export class PluginDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginDefinitionError';
  }
}

const VALIDATOR_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Valida a forma do plugin e devolve o mesmo objeto, preservando os tipos. */
export function definePlugin<P extends QuizPlugin<any>>(plugin: P): P {
  if (!SLUG_PATTERN.test(plugin.id)) {
    throw new PluginDefinitionError(`id de plugin inválido: "${plugin.id}". Use letras minúsculas, números e "-".`);
  }
  if (!plugin.displayName?.trim()) throw new PluginDefinitionError(`O plugin "${plugin.id}" precisa de displayName.`);
  if (typeof plugin.getStarterCode !== 'function') {
    throw new PluginDefinitionError(`O plugin "${plugin.id}" precisa implementar getStarterCode().`);
  }
  for (const [name, validator] of Object.entries(plugin.validators ?? {})) {
    if (!VALIDATOR_NAME.test(name)) {
      throw new PluginDefinitionError(`Nome de validador inválido em "${plugin.id}": "${name}". Use camelCase.`);
    }
    if (validator.mode !== 'static' && validator.mode !== 'dynamic') {
      throw new PluginDefinitionError(`O validador "${name}" de "${plugin.id}" precisa de mode "static" ou "dynamic".`);
    }
  }
  return plugin;
}

export class PluginRegistry<P extends QuizPlugin<any> = QuizPlugin<any>> {
  private readonly plugins = new Map<string, P>();

  constructor(plugins: P[] = []) {
    plugins.forEach((plugin) => this.register(plugin));
  }

  register(plugin: P): this {
    definePlugin(plugin);
    if (this.plugins.has(plugin.id)) {
      throw new PluginDefinitionError(`Já existe um plugin registrado com id "${plugin.id}".`);
    }
    this.plugins.set(plugin.id, plugin);
    return this;
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): P | undefined {
    return this.plugins.get(id);
  }

  /** Igual a `get`, mas lança `PluginNotFoundError` com mensagem clara. */
  require(id: string): P {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new PluginNotFoundError(id);
    return plugin;
  }

  list(): P[] {
    return [...this.plugins.values()];
  }
}
