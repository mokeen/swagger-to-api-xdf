import * as vscode from "vscode";
import * as https from "https";
import { v1 as uuidv1 } from 'uuid'
import { getWebviewContent } from "../views/addSwagger";
import { ContractService } from "../services/ContractService";

export class AddSwaggerPanel {
	private static readonly viewType = "addSwagger";
	private static currentPanel: AddSwaggerPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly context: vscode.ExtensionContext;

	private constructor(
		panel: vscode.WebviewPanel,
		context: vscode.ExtensionContext
	) {
		this._panel = panel;
		this.context = context;
		this._panel.title = "Add Swagger Document";
		this._panel.webview.html = this._getWebviewContent();

		// 处理新增的swagger信息，由webview传递信息回插件
		this._panel.webview.onDidReceiveMessage(
			(message) => this._handleMessage(message),
			undefined,
			context.subscriptions
		);
		this._panel.webview.onDidReceiveMessage(
			(message) => {
				if (message.command === "testSwaggerUrl") {
					this.testUrlAvailability(message.url).then((available) => {
						this._panel.webview.postMessage({
							command: "testUrlResult",
							available,
						});
					});
				} else {
					this._handleMessage(message);
				}
			},
			undefined,
			context.subscriptions
		);
		// 添加完成swagger文档后webview销毁
		this._panel.onDidDispose(() => (AddSwaggerPanel.currentPanel = undefined));
	}

	private _getWebviewContent(): string {
		return getWebviewContent(this.context);
	}

	private async _handleMessage(message: any) {
		switch (message.command) {
			case "addSwagger":
				try {
					const workspacePath =
						vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
					if (!workspacePath) {
						vscode.window.showErrorMessage("无法确定工作区路径");
						return;
					}

					await ContractService.addContract(workspacePath, {
						name: message.name,
						url: message.url,
						desc: message.desc || "",
						uid: uuidv1(),
					});

					vscode.commands.executeCommand("swagger-to-api.refresh");
					this._panel.dispose();
				} catch (err) {
					let errorMsg = "添加失败";
					if (err instanceof Error) {
						// 针对查重错误提供更友好的提示
						errorMsg = err.message.includes("已存在")
							? err.message
							: `添加失败: ${err.message}`;
					}
					vscode.window.showErrorMessage(errorMsg);
				}
				break;
			case "showAlert":
				vscode.window.showInformationMessage(message.text);
				break;
		}
	}

	/**
	 * 创建webview视图
	 */
	public static createOrShow(context: vscode.ExtensionContext) {
		if (AddSwaggerPanel.currentPanel) {
			AddSwaggerPanel.currentPanel._panel.reveal();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			AddSwaggerPanel.viewType,
			"Add Swagger Document",
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		AddSwaggerPanel.currentPanel = new AddSwaggerPanel(panel, context);
	}

	private testUrlAvailability(url: string): Promise<boolean> {
		return new Promise((resolve) => {
			const req = https.request(url, { method: "HEAD" }, (res) => {
				resolve(res.statusCode === 200);
			});
			req.on("error", () => resolve(false));
			req.end();
		});
	}
}
