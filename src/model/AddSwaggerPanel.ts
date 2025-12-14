import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import { v1 as uuidv1 } from 'uuid'
import { getWebviewContent } from "../views/addSwagger";
import { ContractService } from "../services/ContractService";
import { SwaggerFetcher } from "../services/SwaggerFetcher";
import { SpecAdapter } from "../services/SpecAdapter";

interface AddSwaggerMessage {
	command: 'addSwagger';
	url: string;
	name: string;
	desc: string;
	basePath: string;
}

interface TestUrlMessage {
	command: 'testSwaggerUrl';
	url: string;
}

interface ShowAlertMessage {
	command: 'showAlert';
	text: string;
	type?: 'info' | 'warning' | 'error';
}

type WebviewMessage = AddSwaggerMessage | TestUrlMessage | ShowAlertMessage;

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

		// 统一的消息处理器
		this._panel.webview.onDidReceiveMessage(
			async (message: WebviewMessage) => {
				try {
					await this._handleMessage(message);
				} catch (error) {
					console.error('Error handling webview message:', error);
					this._sendMessage({
						command: 'showAlert',
						text: '操作失败，请重试',
						type: 'error'
					});
				}
			},
			undefined,
			context.subscriptions
		);

		// 面板销毁时清理
		this._panel.onDidDispose(() => {
			AddSwaggerPanel.currentPanel = undefined;
		});
	}

	private _getWebviewContent(): string {
		return getWebviewContent(this.context, this._panel.webview);
	}

	private async _handleMessage(message: WebviewMessage): Promise<void> {
		switch (message.command) {
			case "addSwagger":
				await this._handleAddSwagger(message);
				break;
			case "testSwaggerUrl":
				await this._handleTestUrl(message);
				break;
			case "showAlert":
				this._handleShowAlert(message);
				break;
			default:
				console.warn('Unknown message command:', (message as any).command);
		}
	}

	private async _handleAddSwagger(message: AddSwaggerMessage): Promise<void> {
		// 发送加载状态
		this._sendMessage({
			command: 'addSwaggerResult',
			loading: true
		});

		try {
			// 验证工作区
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				throw new Error("无法确定工作区路径");
			}

			// 验证输入
			this._validateSwaggerInput(message);

			// 🔒 后端验证：尝试获取 Swagger JSON，确保 URL 可访问
			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "正在验证 Swagger 文档可访问性...",
					cancellable: false
				}, async () => {
					await SwaggerFetcher.fetchSwaggerJson(message.url.trim());
				});
			} catch (fetchError) {
				throw new Error(
					`无法访问 Swagger 文档：${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
				);
			}

			// 添加合约
			await ContractService.addContract(workspacePath, {
				name: message.name.trim(),
				url: message.url.trim(),
				desc: message.desc?.trim() || "",
				basePath: message.basePath?.trim() || "",
				uid: uuidv1(),
			});

			// 成功反馈
			vscode.window.showInformationMessage(`✅ 成功添加Swagger文档: ${message.name}`);

			// 刷新列表并关闭面板
			await vscode.commands.executeCommand("swagger-to-api.refresh");
			this._panel.dispose();

		} catch (err) {
			const errorMsg = this._getErrorMessage(err);
			vscode.window.showErrorMessage(errorMsg);

			// 发送错误状态
			this._sendMessage({
				command: 'addSwaggerResult',
				loading: false,
				error: errorMsg
			});
		}
	}

	private async _handleTestUrl(message: TestUrlMessage): Promise<void> {
		try {
			// 使用 SwaggerFetcher 获取 Swagger JSON
			const swaggerJson = await SwaggerFetcher.fetchSwaggerJson(message.url);
			
			// 规范化 Swagger/OpenAPI 数据以提取 basePath
			const normalizedSpec = SpecAdapter.normalize(swaggerJson);
			
			// 提取 info 信息用于自动填充
			const info = swaggerJson?.info || {};
			
			this._sendMessage({
				command: "testUrlResult",
				available: true,
				url: message.url,
				info: {
					title: info.title || '',
					description: info.description || '',
					version: info.version || '',
					basePath: normalizedSpec.basePath || ''
				}
			});
		} catch (error) {
			console.error('Error testing URL:', error);
			const errorMsg = error instanceof Error ? error.message : 'URL测试失败';
			this._sendMessage({
				command: "testUrlResult",
				available: false,
				url: message.url,
				error: errorMsg
			});
		}
	}

	private _handleShowAlert(message: ShowAlertMessage): void {
		const { text, type = 'info' } = message;

		switch (type) {
			case 'error':
				vscode.window.showErrorMessage(text);
				break;
			case 'warning':
				vscode.window.showWarningMessage(text);
				break;
			case 'info':
			default:
				vscode.window.showInformationMessage(text);
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
			{
				enableScripts: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'resources'),
				],
				retainContextWhenHidden: true  // 保持webview状态，切换时不刷新
			}
		);

		AddSwaggerPanel.currentPanel = new AddSwaggerPanel(panel, context);
	}

	private _sendMessage(message: any): void {
		this._panel.webview.postMessage(message);
	}

	private _validateSwaggerInput(message: AddSwaggerMessage): void {
		if (!message.name?.trim()) {
			throw new Error("文档名称不能为空");
		}
		if (!message.url?.trim()) {
			throw new Error("Swagger URL不能为空");
		}

		// URL格式验证
		try {
			const urlObj = new URL(message.url.trim());
			const validProtocol = ['http:', 'https:'].includes(urlObj.protocol);
			if (!validProtocol) {
				throw new Error("URL协议必须是http或https");
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes('Invalid URL')) {
				throw new Error("请输入有效的URL格式");
			}
			throw error;
		}
	}

	private _getErrorMessage(err: unknown): string {
		if (err instanceof Error) {
			// 针对常见错误提供友好提示
			if (err.message.includes("已存在")) {
				return err.message;
			}
			if (err.message.includes("ENOTFOUND") || err.message.includes("ECONNREFUSED")) {
				return "无法连接到指定的URL，请检查网络连接和URL是否正确";
			}
			if (err.message.includes("timeout")) {
				return "连接超时，请检查网络连接或稍后重试";
			}
			return `添加失败: ${err.message}`;
		}
		return "添加失败: 未知错误";
	}

	// 移除旧的 _testUrlAvailability 方法，现在直接使用 SwaggerFetcher
}
