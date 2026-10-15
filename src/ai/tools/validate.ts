/**
 * Minimal JSON-Schema check for the tool schemas in ./definitions.ts (objects,
 * strings, integers, booleans, enums, arrays). With eager input streaming the API
 * no longer validates tool inputs, and the SDK's tolerant parser can return a
 * silently truncated object, so every input is checked here before a tool runs.
 */

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema> | unknown;
  required?: readonly string[] | null;
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  [key: string]: unknown;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

function check(value: unknown, schema: JsonSchema, path: string): string | null {
  if (schema.enum && !schema.enum.includes(value)) {
    return `${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`;
  }
  switch (schema.type) {
    case 'string':
      return typeof value === 'string' ? null : `${path} must be a string`;
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) ? null : `${path} must be an integer`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${path} must be a number`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path} must be true or false`;
    case 'array': {
      if (!Array.isArray(value)) return `${path} must be an array`;
      if (!schema.items) return null;
      for (let i = 0; i < value.length; i++) {
        const err = check(value[i], schema.items, `${path}[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return `${path} must be an object`;
      const obj = value as Record<string, unknown>;
      const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) return `${path === '' ? '' : `${path}.`}${key} is required`;
      }
      for (const [key, v] of Object.entries(obj)) {
        const prop = props[key];
        const childPath = path === '' ? key : `${path}.${key}`;
        if (!prop) {
          if (schema.additionalProperties === false) return `${childPath} is not allowed`;
          continue;
        }
        if (v === undefined) continue;
        const err = check(v, prop, childPath);
        if (err) return err;
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateInput(input: unknown, schema: JsonSchema): ValidationResult {
  const error = check(input, { ...schema, type: schema.type ?? 'object' }, '');
  return error ? { ok: false, error } : { ok: true };
}
