import { build, context } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const entry = path.join(projectRoot, 'src', 'extension.ts');
const outfile = path.join(projectRoot, 'dist', 'extension.js');

async function ensureOutDir() {
	await fs.mkdir(path.dirname(outfile), { recursive: true });
}

async function buildOnce() {
	await ensureOutDir();
	await build({
		entryPoints: [entry],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: ['node16'],
		sourcemap: true,
		external: ['vscode'],
		logLevel: 'info',
	});
}

async function watch() {
	await ensureOutDir();
	const ctx = await context({
		entryPoints: [entry],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: ['node16'],
		sourcemap: true,
		external: ['vscode'],
		logLevel: 'info',
	});
	await ctx.watch();
}

const isWatch = process.argv.includes('--watch');

if (isWatch) {
	watch().catch((err) => {
		console.error(err);
		process.exit(1);
	});
} else {
	buildOnce().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
