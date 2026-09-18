export type DiscoveryNode = {
  type?: string;
  format?: string;
  enum?: string[];
  $ref?: string;
  properties?: Record<string, DiscoveryNode>;
  items?: DiscoveryNode;
  additionalProperties?: DiscoveryNode | boolean;
  [key: string]: unknown;
};

export type DiscoveryDocument = {
  name: string;
  version: string;
  revision?: string;
  rootUrl: string;
  methods?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  schemas?: Record<string, DiscoveryNode>;
};

export function walkMethods(document: DiscoveryDocument): Map<string, Record<string, unknown>>;
export function signature(node: DiscoveryNode): string;
export function fields(document: DiscoveryDocument, ref: string, prefix?: string, seen?: Set<string>): Map<string, string>;
export function diffDocuments(base: DiscoveryDocument, head: DiscoveryDocument): string[];
export function report(baseDir: string, headDir: string): { drift: boolean; text: string };
