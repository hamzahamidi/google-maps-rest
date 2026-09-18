import { describe, expect, it } from 'vitest';
import { diffDocuments, fields } from '../scripts/discovery-diff.mjs';

type Doc = Parameters<typeof diffDocuments>[0];

function doc(overrides: { schemas?: Record<string, unknown>; parameters?: Record<string, unknown>; response?: string }): Doc {
  return {
    name: 'synthetic',
    version: 'v1',
    revision: '1',
    rootUrl: 'https://synthetic.googleapis.com/',
    methods: {
      a: {
        id: 'synthetic.a',
        httpMethod: 'POST',
        path: 'v1/thing',
        parameters: overrides.parameters ?? {},
        request: { $ref: 'Req' },
        response: { $ref: overrides.response ?? 'Res' },
      },
    },
    schemas: {
      Req: { type: 'object', properties: { name: { type: 'string' }, inner: { $ref: 'Inner' } } },
      Inner: { type: 'object', properties: { count: { type: 'integer', format: 'int32' } } },
      Res: { type: 'object', properties: { total: { type: 'integer', format: 'int32' } } },
      ...overrides.schemas,
    },
  } as Doc;
}

describe('discovery-diff', () => {
  it('reports nothing for identical documents', () => {
    expect(diffDocuments(doc({}), doc({}))).toEqual([]);
  });

  it('reports a response field that changes representation', () => {
    const head = doc({ schemas: { Res: { type: 'object', properties: { total: { type: 'string', format: 'int64' } } } } });
    expect(diffDocuments(doc({}), head)).toEqual([
      '- changed response field of `synthetic.a` `total`: {"type":"integer","format":"int32"} -> {"type":"string","format":"int64"}',
    ]);
  });

  it('reports a removed response field and a changed response schema', () => {
    const head = doc({ response: 'Other', schemas: { Other: { type: 'object', properties: {} } } });
    expect(diffDocuments(doc({}), head)).toEqual([
      '- changed response schema of `synthetic.a`: Res -> Other',
      '- removed response field of `synthetic.a` `total`',
    ]);
  });

  it('walks inline nested objects, arrays and map values', () => {
    const base = doc({
      schemas: {
        Req: {
          type: 'object',
          properties: {
            box: { type: 'object', properties: { size: { type: 'number' } } },
            tags: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' } } } },
            labels: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      },
    });
    const flat = fields(base, 'Req');
    expect([...flat.keys()]).toEqual(['box', 'box.size', 'tags', 'tags[].key', 'labels']);
    const head = JSON.parse(JSON.stringify(base)) as Doc;
    const req = (head.schemas as Record<string, { properties: Record<string, { properties?: Record<string, unknown> }> }>).Req!;
    req.properties.box!.properties!.size = { type: 'string' };
    expect(diffDocuments(base, head)).toEqual([
      '- changed request field of `synthetic.a` `box.size`: {"type":"number"} -> {"type":"string"}',
    ]);
  });

  it('includes range, pattern and deprecation in a parameter signature', () => {
    const base = doc({ parameters: { days: { location: 'query', type: 'integer', minimum: '1', maximum: '10' } } });
    const head = doc({ parameters: { days: { location: 'query', type: 'integer', minimum: '1', maximum: '5', deprecated: true } } });
    expect(diffDocuments(base, head)).toEqual([
      '- changed parameter of `synthetic.a` `days`: {"type":"integer","minimum":"1","maximum":"10"} -> {"type":"integer","minimum":"1","maximum":"5","deprecated":true}',
    ]);
  });

  it('survives a recursive schema', () => {
    const base = doc({ schemas: { Req: { type: 'object', properties: { child: { $ref: 'Req' }, name: { type: 'string' } } } } });
    expect([...fields(base, 'Req').keys()]).toEqual(['child', 'name']);
  });
});
