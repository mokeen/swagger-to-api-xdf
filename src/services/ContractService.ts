import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContractConfig } from "../types/contract";
import { v1 as uuidv1 } from 'uuid';

export class ContractService {
	private static readonly CONFIG_FILE = ".contractrc";
	private static readonly warnedMissingUid = new Set<string>();

	static async getConfig(workspacePath: string): Promise<ContractConfig> {
		const configPath = path.join(workspacePath, this.CONFIG_FILE);
		if (!fs.existsSync(configPath)) {
			return {
				description: "此文件由va-swagger-to-api生成, 请勿改动或删除",
				dirByRoot: "/src",
				workDir: "services",
				contracts: [],
			};
		}
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ContractConfig;
		await this._warnIfMissingUid(workspacePath, config);
		return config;
	}

	static async ensureUidsOrThrow(workspacePath: string): Promise<void> {
		const config = await this.getConfig(workspacePath);
		const missing = (config.contracts || []).filter((c) => !c.uid);
		if (missing.length === 0) return;

		const choice = await vscode.window.showWarningMessage(
			`检测到项目 .contractrc 为旧版本（存在 ${missing.length} 条文档缺少 uid）。\n删除/更新 Base Path/预览等操作依赖 uid，建议先修复。`,
			{ modal: true },
			'修复（生成 uid）',
			'终止操作'
		);

		if (choice === '修复（生成 uid）') {
			await this._fixMissingUids(workspacePath, config);
			return;
		}
		throw new Error('操作已终止：.contractrc 缺少 uid，请先修复后再试');
	}

	static async fixMissingUids(workspacePath: string): Promise<boolean> {
		const configPath = path.join(workspacePath, this.CONFIG_FILE);
		if (!fs.existsSync(configPath)) {
			vscode.window.showWarningMessage('未找到 .contractrc，无法修复 uid');
			return false;
		}
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ContractConfig;
		const missing = (config.contracts || []).filter((c) => !c.uid);
		if (missing.length === 0) {
			vscode.window.showInformationMessage('✅ .contractrc 未发现缺少 uid 的文档');
			return false;
		}
		await this._fixMissingUids(workspacePath, config);
		return true;
	}

	private static async _warnIfMissingUid(workspacePath: string, config: ContractConfig): Promise<void> {
		const configPath = path.join(workspacePath, this.CONFIG_FILE);
		if (this.warnedMissingUid.has(configPath)) return;
		const missing = (config.contracts || []).filter((c) => !c.uid);
		if (missing.length === 0) return;
		this.warnedMissingUid.add(configPath);

		const choice = await vscode.window.showWarningMessage(
			`检测到项目 .contractrc 为旧版本（存在 ${missing.length} 条文档缺少 uid）。\n部分操作可能存在风险，建议先修复。`,
			'修复（生成 uid）',
			'忽略'
		);
		if (choice === '修复（生成 uid）') {
			await this._fixMissingUids(workspacePath, config);
		}
	}

	private static async _fixMissingUids(workspacePath: string, config: ContractConfig): Promise<void> {
		let changed = false;
		for (const c of config.contracts || []) {
			if (!c.uid) {
				c.uid = uuidv1();
				changed = true;
			}
		}
		if (!changed) return;
		await this.saveConfig(workspacePath, config);
		vscode.window.showInformationMessage('✅ 已为 .contractrc 中缺少 uid 的文档生成 uid（已写回配置文件）');
	}

	static async addContract(
		workspacePath: string,
		newContract: {
			name: string;
			url: string;
			desc: string;
			basePath?: string;
			uid: string;
		}
	): Promise<void> {
		const config = await this.getConfig(workspacePath);

		// 名称查重
		if (config.contracts.some(c => c.name === newContract.name)) {
			throw new Error(`已存在名为【${newContract.name}】的配置`);
		}

		// 新增URL查重
		if (config.contracts.some(c => c.url === newContract.url)) {
			throw new Error(`Swagger地址已存在:\n${newContract.url}`);
		}

		config.contracts.push(newContract);
		await this.saveConfig(workspacePath, config);
	}

	static async deleteContract(workspacePath: string, uid: string): Promise<void> {
		await this.ensureUidsOrThrow(workspacePath);
		if (!uid) {
			throw new Error('无法删除：目标文档缺少 uid（请先修复 .contractrc）');
		}
		const config = await this.getConfig(workspacePath);
		config.contracts = config.contracts.filter(c => c.uid !== uid);
		await this.saveConfig(workspacePath, config);
	}

	static async updateContractBasePath(
		workspacePath: string,
		uid: string,
		basePath: string
	): Promise<void> {
		await this.ensureUidsOrThrow(workspacePath);
		if (!uid) {
			throw new Error('无法更新 Base Path：目标文档缺少 uid（请先修复 .contractrc）');
		}
		const config = await this.getConfig(workspacePath);
		const contract = config.contracts.find(c => c.uid === uid);
		if (!contract) {
			throw new Error(`未找到 UID 为 ${uid} 的合约`);
		}
		contract.basePath = basePath;
		await this.saveConfig(workspacePath, config);
	}

	private static async saveConfig(
		workspacePath: string,
		config: ContractConfig
	): Promise<void> {
		const configPath = path.join(workspacePath, this.CONFIG_FILE);
		await fs.promises.writeFile(
			configPath,
			JSON.stringify(config, null, 2),
			"utf-8"
		);
	}
}
