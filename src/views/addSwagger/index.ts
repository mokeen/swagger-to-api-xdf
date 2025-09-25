import * as vscode from 'vscode';
import { addSwaggerTemplate } from './template';

export function getWebviewContent(context: vscode.ExtensionContext): string {
  return addSwaggerTemplate;
}
