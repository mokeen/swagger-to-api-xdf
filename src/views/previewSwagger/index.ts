import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';

export function getWebviewContent(
	content: string,
	context: vscode.ExtensionContext,
	webview: vscode.Webview
): string {
	const nonce = getNonce();
	const { basicInfo, swaggerJson } = JSON.parse(content);

	// 获取本地资源路径并转换为 webview URI
	const bootstrapCssUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.min.css'))
	);
	const bootstrapJsUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.bundle.min.js'))
	);
	const previewSwaggerCssUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'webview', 'previewSwagger', 'previewSwagger.css'))
	);
	const previewSwaggerJsUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'webview', 'previewSwagger', 'previewSwagger.js'))
	);

	const templatePath = path.join(context.extensionPath, 'resources', 'webview', 'previewSwagger', 'previewSwagger.ejs');
	const template = fs.readFileSync(templatePath, 'utf8');

	return ejs.render(template, {
		nonce,
		cspSource: webview.cspSource,
		bootstrapCssUri: bootstrapCssUri.toString(),
		bootstrapJsUri: bootstrapJsUri.toString(),
		previewSwaggerCssUri: previewSwaggerCssUri.toString(),
		previewSwaggerJsUri: previewSwaggerJsUri.toString(),
		previewData: escapeForSingleQuotedJsString(
			JSON.stringify({
				basicInfo,
				swaggerJson,
			})
		),
	});
}

function escapeForSingleQuotedJsString(content: string): string {
	return content
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\r?\n/g, '\\n')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
		.replace(/<\/(script)/gi, '<\\/$1');
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
