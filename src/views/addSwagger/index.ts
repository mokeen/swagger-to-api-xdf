import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWebviewContent(context: vscode.ExtensionContext): string {
  const htmlPath = path.join(context.extensionPath, 'src', 'views', 'addSwagger', 'template.html');
  return fs.readFileSync(htmlPath, 'utf-8');
}