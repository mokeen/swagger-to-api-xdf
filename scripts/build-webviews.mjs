import { build, context } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const webviews = [
	{
		name: 'addSwagger',
		entry: path.join(projectRoot, 'webview-src', 'addSwagger', 'main.ts'),
		outfile: path.join(projectRoot, 'resources', 'webview', 'addSwagger', 'addSwagger.js'),
	},
	{
		name: 'previewSwagger',
		entry: path.join(projectRoot, 'webview-src', 'previewSwagger', 'main.ts'),
		outfile: path.join(projectRoot, 'resources', 'webview', 'previewSwagger', 'previewSwagger.js'),
	},
];

async function buildAll({ watch }) {
	const buildOptions = {
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: ['es2020'],
		sourcemap: true,
		logLevel: 'info',
	};

	if (watch) {
		const ctxs = await Promise.all(
			webviews.map((w) =>
				context({
					...buildOptions,
					entryPoints: [w.entry],
					outfile: w.outfile,
				})
			)
		);
		await Promise.all(ctxs.map((ctx) => ctx.watch()));
		return;
	}

	for (const w of webviews) {
		await build({
			...buildOptions,
			entryPoints: [w.entry],
			outfile: w.outfile,
		});
	}
}

const watch = process.argv.includes('--watch');

buildAll({ watch }).catch((err) => {
	console.error(err);
	process.exit(1);
});
