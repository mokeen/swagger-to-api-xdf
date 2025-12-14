import * as vscode from "vscode";
import { AddSwaggerPanel } from "./model/AddSwaggerPanel";
import { SwaggerListProvider } from "./providers/SwaggerListProvider";
import { ContractService } from "./services/ContractService";
import { SwaggerPreviewPanel } from "./model/SwaggerPreviewPanel";
import { SwaggerFetcher } from './services/SwaggerFetcher';

export function activate(context: vscode.ExtensionContext) {
	// 必须在激活时创建provider实例
	const listProvider = new SwaggerListProvider();

	// 保留刷新命令注册(创建swagger完毕后刷新侧边栏)
	context.subscriptions.push(
		vscode.commands.registerCommand('swagger-to-api.refresh', () => {
			listProvider.refresh();
		})
	);

	// 注册TreeDataProvider侧边栏树形视图，渲染项目中添加的swagger文档
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			"swaggerExplorer", // 必须与package.json中的id一致
			listProvider
		)
	);

	// 注册刷新命令(手动刷新侧边栏)
	context.subscriptions.push(
		vscode.commands.registerCommand('swagger-to-api.refreshList', () => {
			// 添加工作区检查
			if (!vscode.workspace.workspaceFolders?.length) {
				vscode.window.showWarningMessage(
					'请先打开项目工作区（通过"文件 > 打开文件夹"）\n' +
					'本插件需要在项目内创建配置文件'
				);
				return;
			}
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "正在同步Swagger文档列表...",
				cancellable: false
			}, async () => {
				listProvider.refresh();
				await new Promise(resolve => setTimeout(resolve, 500)); // 让提示显示更明显
			});
		})
	);

	// 注册添加swagger文档命令
	context.subscriptions.push(
		vscode.commands.registerCommand("swagger-to-api.openAddSwagger", () => {
			// 保持原有检查逻辑
			if (!vscode.workspace.workspaceFolders?.length) {
				vscode.window.showWarningMessage(
					'请先打开项目工作区（通过"文件 > 打开文件夹"）\n' +
					'本插件需要在项目内创建配置文件'
				);
				return;
			}
			AddSwaggerPanel.createOrShow(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('swagger-to-api.deleteDoc', async (node: vscode.TreeItem) => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				vscode.window.showErrorMessage('未打开工作区');
				return;
			}
			try {
				await ContractService.ensureUidsOrThrow(workspacePath);
			} catch (e) {
				vscode.window.showWarningMessage(e instanceof Error ? e.message : String(e));
				return;
			}
			if (!node.id) {
				vscode.window.showWarningMessage('当前条目缺少 uid（旧版 .contractrc），请先修复后再删除');
				return;
			}
			const choice = await vscode.window.showWarningMessage(
				`确定要删除 "${node.label}" 吗？`,
				{ modal: true },
				'删除'
			);

			if (choice === '删除') {
				try {
					await ContractService.deleteContract(workspacePath, node.id as string);
					vscode.commands.executeCommand('swagger-to-api.refresh');
					vscode.window.showInformationMessage(`已删除: ${node.label}`);
				} catch (err) {
					vscode.window.showErrorMessage(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('swagger-to-api.previewDoc', async (item: vscode.TreeItem) => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) return;

			try {
				const config = await ContractService.getConfig(workspacePath);
				const doc = config.contracts.find(c => c.name === item.label);
				if (!doc) return;
				if (!doc.uid) {
					await ContractService.ensureUidsOrThrow(workspacePath);
					const fixedConfig = await ContractService.getConfig(workspacePath);
					const fixedDoc = fixedConfig.contracts.find(c => c.name === item.label);
					if (!fixedDoc?.uid) {
						vscode.window.showWarningMessage('该文档缺少 uid（旧版 .contractrc），请先修复后再预览');
						return;
					}
					(doc as any).uid = fixedDoc.uid;
				}

				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `正在获取 ${doc.name} 的Swagger文档...`
				}, async () => {
					try {
						const swaggerJson = await SwaggerFetcher.fetchSwaggerJson(doc.url);
						SwaggerPreviewPanel.show(context, JSON.stringify({
							basicInfo: doc,
							swaggerJson
						}, null, 2));
					} catch (err) {
						throw err;
					}
				});
			} catch (err) {
				vscode.window.showErrorMessage(`获取失败: ${err instanceof Error ? err.message : String(err)}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('swagger-to-api.fixLegacyUids', async () => {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspacePath) {
				vscode.window.showWarningMessage('未打开工作区');
				return;
			}
			try {
				const changed = await ContractService.fixMissingUids(workspacePath);
				if (changed) {
					vscode.commands.executeCommand('swagger-to-api.refresh');
				}
			} catch (err) {
				vscode.window.showErrorMessage(`修复失败: ${err instanceof Error ? err.message : String(err)}`);
			}
		})
	);
}

export function deactivate() { }
