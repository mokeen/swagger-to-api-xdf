import * as vscode from 'vscode';
import * as path from 'path';
import { addSwaggerTemplate } from './template';

export function getWebviewContent(
  context: vscode.ExtensionContext,
  webview: vscode.Webview
): string {
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

  return addSwaggerTemplate
    .replace('{{bootstrapCssUri}}', bootstrapCssUri.toString())
    .replace('{{bootstrapJsUri}}', bootstrapJsUri.toString())
    .replace('{{bootstrapIconsUri}}', bootstrapIconsUri.toString());
}
