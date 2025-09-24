import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function getWebviewContent(
	content: string,
	context: vscode.ExtensionContext
): string {
	const htmlPath = path.join(context.extensionPath, 'src', 'views', 'previewSwagger', 'template.html');
	let html = fs.readFileSync(htmlPath, 'utf-8');

	const { basicInfo, swaggerJson } = JSON.parse(content);

	return html
		.replace('{{basicInfo}}', JSON.stringify(basicInfo))
		.replace('{{swaggerJson}}', prepareSwaggerContent(JSON.stringify(swaggerJson)));
}

function prepareSwaggerContent(content: string): string {
	return content
		.replace(/\\/g, '\\\\')
		.replace(/`/g, '\\`')
		.replace(/\$/g, '\\$')
		.replace(/[\u0000-\u001F]/g, ''); // 移除控制字符
}
