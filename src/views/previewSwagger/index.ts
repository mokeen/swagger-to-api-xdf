import * as vscode from 'vscode';
import { previewSwaggerTemplate } from './template';

export function getWebviewContent(
	content: string,
	context: vscode.ExtensionContext
): string {
	const { basicInfo, swaggerJson } = JSON.parse(content);

	return previewSwaggerTemplate
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
