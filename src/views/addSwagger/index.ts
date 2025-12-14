import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as ejs from 'ejs';

export function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
	const nonce = getNonce();

  // 获取本地资源路径并转换为 webview URI
  const bootstrapCssUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.min.css'))
  );
  const bootstrapJsUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap', 'bootstrap.bundle.min.js'))
  );
  const bootstrapIconsUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'resources', 'bootstrap-icons', 'bootstrap-icons.css'))
  );

	const addSwaggerCssUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'webview', 'addSwagger', 'addSwagger.css'))
	);
	const addSwaggerJsUri = webview.asWebviewUri(
		vscode.Uri.file(path.join(context.extensionPath, 'resources', 'webview', 'addSwagger', 'addSwagger.js'))
	);

	const templatePath = path.join(context.extensionPath, 'resources', 'webview', 'addSwagger', 'addSwagger.ejs');
	const template = fs.readFileSync(templatePath, 'utf8');

	return ejs.render(template, {
		nonce,
		cspSource: webview.cspSource,
		bootstrapCssUri: bootstrapCssUri.toString(),
		bootstrapJsUri: bootstrapJsUri.toString(),
		bootstrapIconsUri: bootstrapIconsUri.toString(),
		addSwaggerCssUri: addSwaggerCssUri.toString(),
		addSwaggerJsUri: addSwaggerJsUri.toString(),
	});
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
