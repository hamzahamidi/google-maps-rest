import { describe, expect, it } from 'vitest';
import { provideValidationFeedback, validateAddress } from '../src/addressvalidation/index.js';
import { bodyOf, headerOf, stubClient } from './helpers.js';

describe('address validation', () => {
  it('posts the address to the v1 verb path', async () => {
    const { client, calls } = stubClient({ body: { responseId: 'r1' } });
    await validateAddress(client, { address: { regionCode: 'US', addressLines: ['1600 Amphitheatre Pkwy'] } });

    expect(calls[0]!.url).toBe('https://addressvalidation.googleapis.com/v1:validateAddress');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(bodyOf(calls[0]!)).toEqual({ address: { regionCode: 'US', addressLines: ['1600 Amphitheatre Pkwy'] } });
  });

  it('carries the session fields that decide billing', async () => {
    const { client, calls } = stubClient({ body: {} });
    await validateAddress(client, {
      address: { regionCode: 'FR', addressLines: ['1 rue de Rivoli'] },
      previousResponseId: 'r1',
      sessionToken: 's1',
    });

    expect(bodyOf(calls[0]!)).toMatchObject({ previousResponseId: 'r1', sessionToken: 's1' });
  });

  it('sends no field mask, because this API has none', async () => {
    const { client, calls } = stubClient({ body: {} });
    await validateAddress(client, { address: { regionCode: 'US', addressLines: ['x'] } });

    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBeUndefined();
    expect(headerOf(calls[0]!, 'X-Goog-Api-Key')).toBe('test-key');
  });

  it('closes the session on its own verb path', async () => {
    const { client, calls } = stubClient({ body: {} });
    await provideValidationFeedback(client, { conclusion: 'VALIDATED_VERSION_USED', responseId: 'r1' });

    expect(calls[0]!.url).toBe('https://addressvalidation.googleapis.com/v1:provideValidationFeedback');
    expect(bodyOf(calls[0]!)).toEqual({ conclusion: 'VALIDATED_VERSION_USED', responseId: 'r1' });
  });
});
