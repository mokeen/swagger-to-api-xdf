import * as vscode from 'vscode';
import { getWebviewContent } from '../views/previewSwagger';
import { SwaggerFetcher } from '../services/SwaggerFetcher';
import { ApiGenerationService } from '../services/ApiGenerationService';

export class SwaggerPreviewPanel {
	private static readonly viewType = 'swaggerPreview';
	// A set to hold all panel instances
	public static readonly panels = new Set<SwaggerPreviewPanel>();

	private readonly _panel: vscode.WebviewPanel;
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _context: vscode.ExtensionContext;
	public docId: string;

	public static show(context: vscode.ExtensionContext, content: string) {
		const { basicInfo } = JSON.parse(content);
		const { uid, name } = basicInfo;

		// 如果已经存在该文档的预览，则直接显示
		for (const panel of SwaggerPreviewPanel.panels) {
			if (panel.docId === uid) {
				panel._panel.reveal(vscode.ViewColumn.Beside);
				return;
			}
		}

		const panel = vscode.window.createWebviewPanel(
			SwaggerPreviewPanel.viewType,
			name || 'Swagger文档预览',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true }
		);

		new SwaggerPreviewPanel(panel, context, content);
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, content: string) {
		this._panel = panel;
		this._context = context;
		SwaggerPreviewPanel.panels.add(this); // Add to the set

		const { basicInfo, swaggerJson } = JSON.parse(content);
		this.docId = basicInfo.uid;

		this._panel.webview.html = getWebviewContent(content, context);

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// 接收来自webview的消息
		this._panel.webview.onDidReceiveMessage(async message => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			switch (message.command) {
				case 'getExistingApis':
					if (workspaceFolders && workspaceFolders.length > 0) {
						const workspacePath = workspaceFolders[0].uri.fsPath;
						const docName = swaggerJson.info?.title || basicInfo.name || 'default';
						try {
							const existingApiData = await ApiGenerationService.getExistingApiData(workspacePath, docName);
							this._panel.webview.postMessage({
								command: 'existingApisResponse',
								existingApiData: existingApiData
							});
						} catch (error) {
							this._panel.webview.postMessage({
								command: 'existingApisResponse',
								existingApiData: {}
							});
						}
					} else {
						this._panel.webview.postMessage({
							command: 'existingApisResponse',
							existingApiData: {}
						});
					}
					break;
				case 'refreshSwaggerDoc':
					vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: `正在刷新${basicInfo.name}文档...`,
						cancellable: false
					}, async () => {
						try {
							const updatedContent = await SwaggerFetcher.fetchSwaggerJson(basicInfo.url);
							// 发送更新后的内容到webview
							this._panel.webview.postMessage({
								command: 'updateSwaggerContent',
								content: updatedContent
							});
						} catch (error) {
							vscode.window.showErrorMessage(`更新失败: ${error instanceof Error ? error.message : String(error)}`);
							this._panel.webview.postMessage({
								command: 'refreshSwaggerDocFailed',
							});
						}
					});
					break;
				case 'exportSwaggerDoc':
					if (workspaceFolders && workspaceFolders.length > 0) {
						const workspacePath = workspaceFolders[0].uri.fsPath;
						const selectedApis = message.content;

						const res = await ApiGenerationService.generateApiFiles(workspacePath, this._context, swaggerJson, selectedApis);
						if (res && res.ok) {
							this._panel.webview.postMessage({ command: 'exportApiSuccess' });
						} else {
							this._panel.webview.postMessage({ command: 'exportApiFailed', message: res?.message });
						}
					} else {
						vscode.window.showErrorMessage('No workspace folder found.');
					}
					break;
			}
		}, null, this._disposables);
	}

	public dispose() {
		SwaggerPreviewPanel.panels.delete(this); // Remove from the set
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
