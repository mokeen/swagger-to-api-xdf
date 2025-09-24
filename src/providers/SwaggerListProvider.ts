import * as vscode from "vscode";
import { ContractService } from "../services/ContractService";
import { ContractItem } from "types/contract";
import * as path from "path";

export class SwaggerListProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<vscode.TreeItem[]> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

		// 无工作区提示
		if (!workspacePath) {
			return [this.createWarningItem()];
		}

		try {
			const config = await ContractService.getConfig(workspacePath);

			// 无文档时的提示
			if (config.contracts.length === 0) {
				return [this.createEmptyStateItem()];
			}

			return config.contracts.map(contract =>
				this.createContractItem(contract)
			);
		} catch (err) {
			return [this.createErrorItem(err instanceof Error ? err : new Error(String(err)))];
		}
	}

	private createContractItem(contract: ContractItem): vscode.TreeItem {
		const item = new vscode.TreeItem(contract.name);
		item.tooltip = new vscode.MarkdownString([
			`**URL**: ${contract.url}`,
			`**描述**: ${contract.desc || '无'}`
		].join('\n\n'));

		item.id = contract.uid;

		// 设置正确的上下文值和删除命令
		item.contextValue = 'swaggerDoc';

		// 使用相对路径加载图标 (假设图标放在resources目录)
		item.iconPath = new vscode.ThemeIcon("repo");

		return item;
	}

	// 保留警告项创建方法
	private createWarningItem(): vscode.TreeItem {
		const item = new vscode.TreeItem("⚠️ 提示: 请在项目内使用");
		item.tooltip = new vscode.MarkdownString(
			[
				"**需要项目工作区才能使用完整功能**",
				"",
				"1. 通过 `文件 > 打开文件夹` 打开项目",
				"2. 插件将自动同步项目中 `.contractrc` 配置文件",
				"3. 添加的Swagger文档会同步到侧边栏和项目 `.contractrc` 文件",
			].join("\n")
		);

		// 保持视觉一致性
		return item;
	}

	private createEmptyStateItem(): vscode.TreeItem {
		const item = new vscode.TreeItem('暂无Swagger文档', vscode.TreeItemCollapsibleState.None);

		// 使用tooltip实现多行显示
		item.tooltip = new vscode.MarkdownString([
			'**当前没有配置任何Swagger文档**',
			'',
			'▸ 点击顶部➕按钮添加文档',
			'',
			'▸ 或直接点击提示添加文档'
		].join('\n'));

		item.iconPath = new vscode.ThemeIcon('info');
		item.command = {
			command: 'swagger-to-api.openAddSwagger',
			title: '添加文档'
		};
		return item;
	}

	private createErrorItem(err: Error): vscode.TreeItem {
		const item = new vscode.TreeItem("配置读取失败");
		item.tooltip = err.message;
		item.iconPath = new vscode.ThemeIcon("error");
		return item;
	}
}
