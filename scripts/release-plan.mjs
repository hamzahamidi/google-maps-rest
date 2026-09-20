import { appendFile, readFile } from 'node:fs/promises';
import semanticRelease from 'semantic-release';

const config = JSON.parse(await readFile(new URL('../.releaserc.json', import.meta.url), 'utf8'));
const analysisPlugins = new Set(['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator']);
const plugins = config.plugins.filter((plugin) => analysisPlugins.has(Array.isArray(plugin) ? plugin[0] : plugin));

const result = await semanticRelease({ ...config, plugins, dryRun: true });
const version = result ? result.nextRelease.version : '';
const outputs = `release=${result ? 'true' : 'false'}\nversion=${version}\n`;

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, outputs);
}
process.stdout.write(outputs);
