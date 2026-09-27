import { z, type ZodTypeAny } from "zod";

interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

export function jsonSchemaToZod(schema: unknown): ZodTypeAny {
  if (!schema || typeof schema !== "object") return z.object({}).passthrough();
  const record = schema as JsonSchema;
  if (Array.isArray(record.enum) && record.enum.every((value) => typeof value === "string")) {
    const values = record.enum as string[];
    const first = values[0];
    if (first) return z.enum([first, ...values.slice(1)] as [string, ...string[]]);
  }

  const type = Array.isArray(record.type) ? record.type[0] : record.type;
  if (type === "string") return z.string();
  if (type === "integer" || type === "number") return z.number();
  if (type === "boolean") return z.boolean();
  if (type === "array") return z.array(jsonSchemaToZod(record.items ?? {}));
  if (type === "object" || record.properties) {
    const shape: Record<string, ZodTypeAny> = {};
    const required = new Set(record.required ?? []);
    for (const [key, value] of Object.entries(record.properties ?? {})) {
      let field = jsonSchemaToZod(value);
      if (typeof value.description === "string" && value.description) {
        field = field.describe(value.description);
      }
      if (!required.has(key)) field = field.optional();
      shape[key] = field;
    }
    return z.object(shape);
  }
  return z.unknown();
}
