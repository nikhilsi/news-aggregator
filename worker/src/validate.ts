// Query validation with FastAPI's 422 bodies, for the cases the apps and the
// inventory recorded (inventory 1.4). Clients never send bad values; this keeps
// the contract identical for anyone who does.

export interface FieldError {
  type: string;
  loc: [string, string];
  msg: string;
  input: string | null;
  ctx?: Record<string, number>;
}

const INT_RE = /^\s*[+-]?\d+\s*$/;
const TRUE = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

export function intParam(
  errors: FieldError[],
  name: string,
  raw: string | null,
  def: number,
  bounds: { ge?: number; le?: number },
): number {
  if (raw === null) return def;
  if (!INT_RE.test(raw)) {
    errors.push({
      type: 'int_parsing',
      loc: ['query', name],
      msg: 'Input should be a valid integer, unable to parse string as an integer',
      input: raw,
    });
    return def;
  }
  const n = Number(raw.trim());
  if (bounds.ge !== undefined && n < bounds.ge) {
    errors.push({
      type: 'greater_than_equal',
      loc: ['query', name],
      msg: `Input should be greater than or equal to ${bounds.ge}`,
      input: raw,
      ctx: { ge: bounds.ge },
    });
  } else if (bounds.le !== undefined && n > bounds.le) {
    errors.push({
      type: 'less_than_equal',
      loc: ['query', name],
      msg: `Input should be less than or equal to ${bounds.le}`,
      input: raw,
      ctx: { le: bounds.le },
    });
  }
  return n;
}

export function boolParam(errors: FieldError[], name: string, raw: string | null): boolean {
  if (raw === null) return false;
  const v = raw.trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  errors.push({
    type: 'bool_parsing',
    loc: ['query', name],
    msg: 'Input should be a valid boolean, unable to interpret input',
    input: raw,
  });
  return false;
}

export function missing(name: string): FieldError {
  return { type: 'missing', loc: ['query', name], msg: 'Field required', input: null };
}
