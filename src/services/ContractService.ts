import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContractConfig } from "../types/contract";

export class ContractService {
	private static readonly CONFIG_FILE = ".contractrc";

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
		return JSON.parse(fs.readFileSync(configPath, "utf-8")) as ContractConfig;
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
		const config = await this.getConfig(workspacePath);
		config.contracts = config.contracts.filter(c => c.uid !== uid);
		await this.saveConfig(workspacePath, config);
	}

	static async updateContractBasePath(
		workspacePath: string,
		uid: string,
		basePath: string
	): Promise<void> {
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
