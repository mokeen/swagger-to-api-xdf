import * as vscode from 'vscode';
import * as path from 'path';
import { previewSwaggerTemplate } from './template';

export function getWebviewContent(
	content: string,
	context: vscode.ExtensionContext,
	webview: vscode.Webview
): string {
	const { basicInfo, swaggerJson } = JSON.parse(content);

	// 获取本地资源路径并转换为 webview URI
	const bootstrapCssUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.min.css'))
	);
	const bootstrapJsUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.bundle.min.js'))
	);

	return previewSwaggerTemplate
		.replace('{{bootstrapCssUri}}', bootstrapCssUri.toString())
		.replace('{{bootstrapJsUri}}', bootstrapJsUri.toString())
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
