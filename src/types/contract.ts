export interface ContractConfig {
	description: string;
	dirByRoot: string;
	workDir: string;
	contracts: ContractItem[];
}

export interface ContractItem {
	name: string;
	url: string;
	desc: string;
	basePath?: string;
	uid: string;
}
