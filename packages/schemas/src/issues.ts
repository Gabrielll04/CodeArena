import type { ZodError, ZodIssue } from 'zod';

export interface ValidationIssue {
  /** Caminho legível, ex.: `questions[0].checklist[2].rule.pattern`. */
  path: string;
  message: string;
}

export function formatPath(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    return acc ? `${acc}.${segment}` : segment;
  }, '');
}

function issueMessage(issue: ZodIssue): string {
  if (issue.code === 'invalid_union_discriminator') {
    return `tipo de regra desconhecido. Use um de: ${issue.options.map(String).join(', ')}`;
  }
  if (issue.code === 'unrecognized_keys') {
    return `campos não reconhecidos: ${issue.keys.join(', ')}`;
  }
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return 'campo obrigatório ausente';
  }
  return issue.message;
}

export function formatZodError(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: formatPath(issue.path) || '(raiz)', message: issueMessage(issue) }));
}
