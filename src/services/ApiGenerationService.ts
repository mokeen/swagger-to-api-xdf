import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContractService } from "./ContractService";

/**
 * 类型定义数据结构
 */
interface TypeDefinition {
	key: string;              // 类型的唯一标识（基础类型名）
	originalName: string;     // 原始类型名（来自swagger）
	isGeneric: boolean;       // 是否是泛型类型
	genericParams: string[];  // 泛型参数列表
	properties: any;          // 属性定义
	description: string;      // 类型描述
	definition: any;          // 原始definition对象
}

/**
 * 接口定义数据结构
 */
interface ApiDefinition {
	path: string;             // 接口路径
	method: string;           // HTTP方法
	operationId: string;      // 操作ID
	summary: string;          // 接口描述
	inputTypes: Set<string>;  // 入参依赖的类型集合
	outputTypes: Set<string>; // 出参依赖的类型集合
	allTypes: Set<string>;    // 所有依赖的类型集合（入参+出参）
	parameters: any[];        // 参数列表（来自swagger）
	responseSchema: string;   // 响应类型（去除#/definitions/）
	tags: string[];           // 标签（用于分组到controller）
}

export class ApiGenerationService {
	// ============================================================================
	// 常量定义
	// ============================================================================

	/** Swagger $ref 前缀 */
	private static readonly SWAGGER_REF_PREFIX = '#/definitions/';

	/** 排序语言代码 */
	private static readonly LOCALE = 'zh-CN';

	/** Controller 后缀 */
	private static readonly CONTROLLER_SUFFIX = 'Controller';

	/** HTTP 方法后缀正则 */
	private static readonly HTTP_METHOD_SUFFIX_REGEX = /Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i;

	/** 成功的 HTTP 状态码 */
	private static readonly HTTP_SUCCESS_CODES = ['200', '201', 'default'];

	/** 基本 TypeScript 类型集合 */
	private static readonly BASIC_TS_TYPES = new Set(['number', 'string', 'boolean', 'void', 'any', 'any[]']);

	// ============================================================================
	// 工具方法
	// ============================================================================

	/**
	 * 从 $ref 中提取类型名称
	 * 例如：#/definitions/UserDTO -> UserDTO
	 */
	private static extractTypeNameFromRef(ref: string): string {
		if (!ref) return '';
		return ref.replace(this.SWAGGER_REF_PREFIX, '');
	}

	/**
	 * 获取成功的响应对象
	 */
	private static getSuccessResponse(responses: any): any {
		if (!responses) return null;
		for (const code of this.HTTP_SUCCESS_CODES) {
			if (responses[code]) {
				return responses[code];
			}
		}
		return null;
	}

	// ============================================================================
	// 主要方法
	// ============================================================================

	/**
	 * 从现有的 apis.ts 文件中提取完整的API数据结构
	 */
	public static async getExistingApiData(workspacePath: string, docName: string): Promise<{ [controller: string]: any[] }> {
		const servicesDir = path.join(workspacePath, 'src', 'services', docName);
		const apisFilePath = path.join(servicesDir, 'apis.ts');

		if (!fs.existsSync(apisFilePath)) {
			return {};
		}

		try {
			const apisContent = fs.readFileSync(apisFilePath, 'utf-8');
			const existingApiData: { [controller: string]: any[] } = {};

			// 提取控制器和对应的方法（支持类型注解）
			const controllerRegex = /export const (\w+Controller)(?::\s*Types\.\w+)?\s*=\s*\{([\s\S]*?)\n\};\s*$/gm;
			let controllerMatch;

			while ((controllerMatch = controllerRegex.exec(apisContent)) !== null) {
				const controllerName = controllerMatch[1];
				const controllerContent = controllerMatch[2];
				const tagName = controllerName;
				const methods: any[] = [];

				// 提取方法信息
				const methodRegex = /async\s+(\w+)\s*\([^)]*\):[^{]*\{[\s\S]*?const\s+path\s*=\s*`([^`]+)`;[\s\S]*?\$http\.run[^(]*\(path,\s*'(\w+)'[\s\S]*?\},?\s*$/gm;
				let methodMatch;

				while ((methodMatch = methodRegex.exec(controllerContent)) !== null) {
					const methodName = methodMatch[1];
					const pathTemplate = methodMatch[2];
					const httpMethod = methodMatch[3];
					const apiPath = pathTemplate.replace('${basePath}', '');
					const originalOperationId = this.parseMethodNameToOperationId(methodName, apiPath, httpMethod);

					methods.push({
						operationId: originalOperationId,
						path: apiPath,
						method: httpMethod,
						summary: originalOperationId,
					});
				}

				if (methods.length > 0) {
					existingApiData[tagName] = methods;
				}
			}

			return existingApiData;
		} catch (error) {
			console.error('Error reading existing API data:', error);
			return {};
		}
	}

	/**
	 * 合并已存在的API数据和新选择的API数据
	 * 数据按controller分组，避免不同controller中相同接口的混淆
	 * 新选择的API会覆盖同一controller中已存在的同名API
	 */
	public static mergeApiData(existingApiData: { [controller: string]: any[] }, selectedApis: { [controller: string]: any[] }): { [controller: string]: any[] } {
		const mergedData: { [controller: string]: any[] } = {};

		// 首先添加所有已存在的API数据
		for (const [controller, apis] of Object.entries(existingApiData)) {
			const normalizedName = this.normalizeControllerName(controller);
			mergedData[normalizedName] = [...apis];
		}

		// 然后处理新选择的API，覆盖或添加
		for (const [controller, newApis] of Object.entries(selectedApis)) {
			const normalizedName = this.normalizeControllerName(controller);
			if (!mergedData[normalizedName]) {
				mergedData[normalizedName] = [];
			}

			const existingApis = mergedData[normalizedName];

			newApis.forEach(newApi => {
				const cleanedApi = { ...newApi };
				if (cleanedApi.operationId) {
					// 移除 UsingPOST_数字 这样的后缀
					cleanedApi.operationId = cleanedApi.operationId
						.replace(this.HTTP_METHOD_SUFFIX_REGEX, '') || cleanedApi.operationId;
				}

				// 查找是否在同一controller中已存在相同的API（基于path和method）
				const existingIndex = existingApis.findIndex(existing =>
					existing.path === cleanedApi.path && existing.method.toLowerCase() === cleanedApi.method.toLowerCase()
				);

				if (existingIndex >= 0) {
					existingApis[existingIndex] = cleanedApi;
				} else {
					existingApis.push(cleanedApi);
				}
			});

			mergedData[normalizedName] = existingApis;
		}

		return this.sortMergedApiData(mergedData);
	}

	/**
	 * 标准化 Controller 名称（用于 mergedApiData 的 key）
	 * 例如：assistant-agenda-controller -> AssistantagendacontrollerController
	 */
	private static normalizeControllerName(name: string): string {
		const clean = (name || '')
			.replace(new RegExp(this.CONTROLLER_SUFFIX + '$', 'i'), '')
			.replace(/[^a-zA-Z0-9_]/g, ' ')
			.split(/\s+/)
			.filter(Boolean)
			.map(s => s[0].toUpperCase() + s.slice(1))
			.join('');
		return `${clean}${this.CONTROLLER_SUFFIX}`;
	}

	/**
	 * 将字符串转换为小驼峰格式（用于 API 文件中的常量名）
	 * 例如：BiDockingController -> biDockingController
	 *      assistant-agenda-controller -> assistantAgendaController
	 *      class-controller -> classController
	 */
	private static toCamelCase(str: string): string {
		// 按分隔符或大写字母拆分
		const words = str
			.replace(/([A-Z])/g, ' $1') // 在大写字母前加空格
			.replace(/[-_\s]+/g, ' ') // 统一分隔符为空格
			.trim()
			.split(/\s+/)
			.filter(Boolean);

		if (words.length === 0) return 'controller';

		// 第一个单词小写，其余首字母大写
		return words[0].toLowerCase() +
			words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
	}

	/**
	 * 对合并后的API数据进行排序
	 */
	private static sortMergedApiData(apiData: { [controller: string]: any[] }): { [controller: string]: any[] } {
		const sortedData: { [controller: string]: any[] } = {};
		const sortedControllerNames = Object.keys(apiData).sort((a, b) => a.localeCompare(b, this.LOCALE));

		for (const controllerName of sortedControllerNames) {
			const apis = apiData[controllerName];
			sortedData[controllerName] = this.sortApis(apis);
		}

		return sortedData;
	}

	/**
	 * 对 API 列表进行排序（按 operationId/summary/path）
	 */
	private static sortApis(apis: any[]): any[] {
		return [...apis].sort((a, b) => {
				const aId = a.operationId || a.summary || (a.path ? a.path.split('/').pop() : '');
				const bId = b.operationId || b.summary || (b.path ? b.path.split('/').pop() : '');
			return aId.localeCompare(bId, this.LOCALE);
		});
	}

	/**
	 * 从 API 定义中分类参数
	 */
	private static classifyParameters(parameters: any[]): {
		bodyParam: any | undefined;
		bodyParams: any[];
		queryParams: any[];
		pathParams: any[];
	} {
		const bodyParamsArr = parameters.filter((p: any) => p.in === 'body');
		return {
			bodyParam: bodyParamsArr.length === 1 ? bodyParamsArr[0] : undefined,
			bodyParams: bodyParamsArr,
			queryParams: parameters.filter((p: any) => p.in === 'query'),
			pathParams: parameters.filter((p: any) => p.in === 'path')
		};
	}

	/**
	 * 生成API文件主入口
	 */
	public static async generateApiFiles(
		workspacePath: string,
		context: vscode.ExtensionContext,
		swaggerJson: any,
		selectedApis: { [controller: string]: any[] },
	): Promise<{ ok: boolean; message?: string }> {
		try {
			const docName = swaggerJson.info ? swaggerJson.info.title : undefined;
			const config = await ContractService.getConfig(workspacePath);
			const workDir = path.join(workspacePath, config.dirByRoot, config.workDir);
			const docDir = path.join(workDir, docName);

			if (!fs.existsSync(docDir)) {
				fs.mkdirSync(docDir, { recursive: true });
			}

			// 读取已存在的API数据
			const existingApiData = await this.getExistingApiData(workspacePath, docName);

			// 合并已存在的数据和新选择的数据
			const mergedApiData = this.mergeApiData(existingApiData, selectedApis);

			// 基于合并后的数据过滤paths
			const picked = new Set<string>();
			Object.values(mergedApiData || {}).forEach(list => {
				(list || []).forEach((api: any) => {
				if (api && api.path && api.method) {
						picked.add(`${api.path}::${String(api.method).toLowerCase()}`);
					}
				});
			});

			const filteredPaths: Record<string, any> = {};
		if (swaggerJson && swaggerJson.paths) {
				for (const [p, methods] of Object.entries<any>(swaggerJson.paths)) {
					const keptMethods: Record<string, any> = {};
					for (const [m, op] of Object.entries<any>(methods)) {
						if (picked.has(`${p}::${m.toLowerCase()}`)) {
							keptMethods[m] = op;
						}
					}
					if (Object.keys(keptMethods).length > 0) {
						filteredPaths[p] = keptMethods;
					}
				}
			}

			if (Object.keys(filteredPaths).length === 0) {
				vscode.window.showWarningMessage("未选择任何接口，已取消生成。");
				return { ok: false, message: "未选择任何接口" };
			}

			// 构建过滤后的Swagger规范
			const spec: any = {
				...swaggerJson,
				paths: filteredPaths
			};

			// 生成types.ts
			const typesPath = path.join(docDir, "types.ts");
			const typesContent = this.renderTypes(spec, mergedApiData);
			fs.writeFileSync(typesPath, typesContent, "utf-8");

			// 生成apis.ts
			const apisPath = path.join(docDir, "apis.ts");
			const apisContent = this.renderApis(mergedApiData, spec);
			fs.writeFileSync(apisPath, apisContent, "utf-8");

			// 生成index.ts
			const indexPath = path.join(docDir, "index.ts");
			const indexContent = `/* eslint-disable */\nimport * as Types from './types';\nimport * as APIs from './apis';\nexport { Types };\nexport const Smart = APIs;\nexport default { Types,\n ...APIs\n};`;
			fs.writeFileSync(indexPath, indexContent, "utf-8");

			vscode.window.showInformationMessage(`接口文件已生成到 ${docDir}`);
			return { ok: true };
		} catch (error) {
			console.error("生成接口文件失败：", error);
			vscode.window.showErrorMessage(`生成失败: ${error instanceof Error ? error.message : String(error)}`);
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * 生成方法名，格式：{baseName}_{pathHash}
	 */
	private static toMethodName(api: any, existingNames: Set<string> = new Set()): string {
		let baseName = '';
		if (api.operationId) {
			baseName = api.operationId.replace(/Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i, '') || api.operationId;
		} else {
			const pathParts = (api.path || '').split('/').filter(Boolean);
			const lastPart = pathParts[pathParts.length - 1] || 'unknown';
			const method = String(api.method || 'get').toLowerCase();
			baseName = `${method}${lastPart.charAt(0).toUpperCase()}${lastPart.slice(1)}`;
		}

		const pathHash = this.generatePathHash(api.path || '');
		const methodName = `${baseName}_${pathHash}`;
		existingNames.add(methodName);
		return methodName;
	}

	/**
	 * 为路径生成短哈希值
	 */
	private static generatePathHash(path: string): string {
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0');
	}

	/**
	 * 从生成的方法名解析出原始的operationId
	 */
	private static parseMethodNameToOperationId(methodName: string, apiPath: string, httpMethod: string): string {
		const expectedHash = this.generatePathHash(apiPath);
		const expectedSuffix = `_${expectedHash}`;

		if (methodName.endsWith(expectedSuffix)) {
			return methodName.substring(0, methodName.length - expectedSuffix.length);
		}

		return methodName.replace(/Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i, '') || methodName;
	}

	/**
	 * 生成types.ts内容
	 */
	private static renderTypes(spec: any, mergedApiData: any): string {
		const lines: string[] = [];
		lines.push('/* eslint-disable */');
		lines.push('');
		lines.push('import { AxiosRequestConfig } from \'axios\';');
		lines.push('');
		lines.push('export type PlainObject = { [key: string]: any };');
		lines.push('export type Map<T0 extends string | number | symbol, T1> = Record<T0, T1>;');
		lines.push('export type BaseRequestDTO = { [key: string]: any };');
		lines.push('');

		if (!spec.definitions) {
			return lines.join('\n');
		}

		// 清洗和统计types数据池
		const typesPool = this.buildTypesPool(spec.definitions);

		// 构建接口池，收集所有选中接口的类型依赖
		const apiPool = this.buildApiPool(spec.paths, mergedApiData);

		// 收集所有需要生成的类型
		const requiredTypes = this.collectRequiredTypes(apiPool, typesPool);

		// 生成类型定义
		lines.push(...this.generateTypeDefinitions(requiredTypes, typesPool));

	// 生成 Controller 类型定义
	lines.push('// ============================================================================');
	lines.push('// Controller 类型定义');
	lines.push('// ============================================================================');
	lines.push('');
	lines.push(...this.generateControllerTypes(apiPool, mergedApiData, spec, typesPool));

		return lines.join('\n');
	}

	/**
	 * 收集所有需要生成的类型
	 * 1. 类型池中的所有泛型类型（一次性全部生成）
	 * 2. 接口依赖的具体类型（非泛型）- 递归收集
	 */
	private static collectRequiredTypes(apiPool: Map<string, ApiDefinition>, typesPool: Map<string, TypeDefinition>): Set<string> {
		const requiredTypes = new Set<string>();

		// 1. 先添加所有泛型类型
		typesPool.forEach((typeDef, key) => {
			if (typeDef.isGeneric) {
				requiredTypes.add(key);
			}
		});

		// 2. 递归收集接口依赖的具体类型
		const processedTypes = new Set<string>();
		const typesToProcess: string[] = [];

		// 先收集接口直接依赖的类型
		apiPool.forEach(apiDef => {
			apiDef.allTypes.forEach(typeName => {
				if (!processedTypes.has(typeName)) {
					typesToProcess.push(typeName);
					processedTypes.add(typeName);
				}
			});
		});

		// 递归收集类型的依赖
		while (typesToProcess.length > 0) {
			const currentType = typesToProcess.shift()!;
			const typeDef = typesPool.get(currentType);

			if (!typeDef || typeDef.isGeneric) {
				continue;
			}

			// 添加到需要生成的类型集合
			requiredTypes.add(currentType);

			// 检查这个类型的属性，收集其引用的类型
			const props = typeDef.properties || {};
			for (const [propName, propDef] of Object.entries<any>(props)) {
				const referencedTypes = this.extractReferencedTypes(propDef);
				referencedTypes.forEach(refType => {
					if (!processedTypes.has(refType)) {
						typesToProcess.push(refType);
						processedTypes.add(refType);
					}
				});
			}
		}

		return requiredTypes;
	}

	/**
	 * 从属性定义中提取引用的类型
	 */
	private static extractReferencedTypes(propDef: any): string[] {
		const types: string[] = [];

		// 处理直接引用
		if (propDef.$ref) {
			types.push(...this.extractTypesFromRef(propDef.$ref));
		}

		// 处理数组项引用
		if (propDef.type === 'array' && propDef.items && propDef.items.$ref) {
			types.push(...this.extractTypesFromRef(propDef.items.$ref));
		}

		return types;
	}

	/**
	 * 从泛型参数中提取类型（过滤基本类型）
	 */
	private static extractGenericParamTypes(genericParam: string): string[] {
		return this.parseGenericContent(genericParam, true);
	}

	/**
	 * 生成类型定义代码
	 */
	private static generateTypeDefinitions(requiredTypes: Set<string>, typesPool: Map<string, TypeDefinition>): string[] {
		const lines: string[] = [];

		// 分离泛型类型和具体类型
		const genericTypes: TypeDefinition[] = [];
		const concreteTypes: TypeDefinition[] = [];

		requiredTypes.forEach(typeName => {
			const typeDef = typesPool.get(typeName);
			if (!typeDef) {
				return;
			}

			if (typeDef.isGeneric) {
				genericTypes.push(typeDef);
			} else {
				concreteTypes.push(typeDef);
			}
		});

		// 1. 先生成泛型接口（放在顶部）
		lines.push('// ============================================================================');
		lines.push('// 泛型接口定义');
		lines.push('// ============================================================================');
		lines.push('');

		genericTypes.sort((a, b) => a.key.localeCompare(b.key, 'zh-CN'));
		for (const typeDef of genericTypes) {
			lines.push(...this.generateGenericInterface(typeDef));
			lines.push('');
		}

		// 2. 再生成具体类型接口
		lines.push('// ============================================================================');
		lines.push('// 具体类型定义');
		lines.push('// ============================================================================');
		lines.push('');

		concreteTypes.sort((a, b) => a.key.localeCompare(b.key, 'zh-CN'));
		for (const typeDef of concreteTypes) {
			lines.push(...this.generateConcreteInterface(typeDef));
			lines.push('');
		}

		return lines;
	}

	/**
	 * 生成泛型接口定义
	 */
	private static generateGenericInterface(typeDef: TypeDefinition): string[] {
		const lines: string[] = [];

		// 添加描述注释
		if (typeDef.description) {
			lines.push(`/** ${typeDef.description} */`);
		}

		// 生成接口声明
		lines.push(`export interface ${typeDef.key}<T> {`);

		// 生成属性
		const props = typeDef.properties || {};
		for (const [propName, propDef] of Object.entries<any>(props)) {
			const propLines = this.generateProperty(propName, propDef, true);
			lines.push(...propLines);
		}

		lines.push('}');

		return lines;
	}

	/**
	 * 生成具体接口定义
	 */
	private static generateConcreteInterface(typeDef: TypeDefinition): string[] {
		const lines: string[] = [];

		// 添加描述注释
		if (typeDef.description) {
			lines.push(`/** ${typeDef.description} */`);
		}

		// 生成接口声明
		lines.push(`export interface ${typeDef.key} {`);

		// 生成属性
		const props = typeDef.properties || {};
		for (const [propName, propDef] of Object.entries<any>(props)) {
			const propLines = this.generateProperty(propName, propDef, false);
			lines.push(...propLines);
		}

		lines.push('}');

		return lines;
	}

	/**
	 * 生成属性定义
	 */
	private static generateProperty(propName: string, propDef: any, isInGeneric: boolean): string[] {
		const lines: string[] = [];

		// 属性描述
		if (propDef.description) {
			lines.push(`  /** ${propDef.description} */`);
		}

		// 属性类型
		const propType = this.resolvePropertyType(propDef, isInGeneric);

		// 属性声明（目前简化处理，所有属性都是可选的）
		lines.push(`  ${propName}?: ${propType};`);

		return lines;
	}

	/**
	 * 解析属性类型
	 */
	private static resolvePropertyType(propDef: any, isInGeneric: boolean): string {
		// 泛型接口中的引用类型，返回 T
		if (isInGeneric && propDef.$ref) {
			return 'T';
		}

		// 泛型接口中的数组类型，返回 Array<T>
		if (isInGeneric && propDef.type === 'array') {
			return 'Array<T>';
		}

		// 引用类型
		if (propDef.$ref) {
			const typeName = this.extractTypeNameFromRef(propDef.$ref);
			return this.convertSwaggerTypeToTS(typeName);
		}

		// 数组类型
		if (propDef.type === 'array' && propDef.items) {
			if (propDef.items.$ref) {
				const itemType = this.extractTypeNameFromRef(propDef.items.$ref);
				const tsType = this.convertSwaggerTypeToTS(itemType);
				return `${tsType}[]`;
			}
			// 基本类型数组
			const itemType = this.mapSwaggerTypeToTS(propDef.items.type);
			return `${itemType}[]`;
		}

		// 基本类型
		if (propDef.type) {
			return this.mapSwaggerTypeToTS(propDef.type);
		}

		return 'any';
	}

	/**
	 * 将 Swagger 类型名转换为 TypeScript 类型
	 * 处理泛型：Result«String» -> Result<string>
	 */
	private static convertSwaggerTypeToTS(swaggerType: string): string {
		if (!swaggerType.includes('«')) {
			return swaggerType;
		}

		// 提取基础类型
		const baseType = this.extractTypeKey(swaggerType);

	// 提取泛型参数
	const matchResult = swaggerType.match(/«(.+)»$/);
	const genericContent = matchResult ? matchResult[1] : null;
	if (!genericContent) {
		return baseType;
	}

		// 转换泛型参数
		const tsGenericParam = this.convertGenericParamToTS(genericContent);

		return `${baseType}<${tsGenericParam}>`;
	}

	/**
	 * 转换泛型参数为 TypeScript 格式
	 */
	private static convertGenericParamToTS(genericParam: string): string {
	// 处理 List
	if (genericParam.startsWith('List«')) {
		const matchResult = genericParam.match(/List«(.+)»$/);
		const innerContent = matchResult ? matchResult[1] : null;
		if (innerContent) {
			return `${this.convertGenericParamToTS(innerContent)}[]`;
		}
	}

		// 处理嵌套泛型
		if (genericParam.includes('«')) {
			return this.convertSwaggerTypeToTS(genericParam);
		}

		// 处理多个泛型参数（用逗号分隔，如 Map«string,string»）
		if (genericParam.includes(',')) {
			const parts = this.splitGenericParams(genericParam);
			const convertedParts = parts.map(part => this.mapSwaggerTypeToTS(part.trim()));
			return convertedParts.join(', ');
		}

		// 基本类型映射
		return this.mapSwaggerTypeToTS(genericParam);
	}

	/**
	 * 映射 Swagger 基本类型到 TypeScript 类型
	 */
	private static mapSwaggerTypeToTS(swaggerType: string): string {
		const typeMap: Record<string, string> = {
			'integer': 'number',
			'int': 'number',
			'long': 'number',
			'float': 'number',
			'double': 'number',
			'number': 'number',
			'string': 'string',
			'boolean': 'boolean',
			'Boolean': 'boolean',
			'String': 'string',
			'Integer': 'number',
			'Long': 'number',
			'Void': 'void',
			'object': 'PlainObject',
			'array': 'any[]',
		};

		return typeMap[swaggerType] || swaggerType;
	}

	/**
	 * 构建类型数据池
	 * 清洗definitions，生成标准化的类型定义数据结构
	 */
	private static buildTypesPool(definitions: any): Map<string, TypeDefinition> {
		const pool = new Map<string, TypeDefinition>();

		if (!definitions) {
			return pool;
		}

	for (const [originalName, def] of Object.entries<any>(definitions)) {
		// 1. 提取类型的 key（处理泛型）
		const key = this.extractTypeKey(originalName);

		// 跳过 Map 类型（已在顶部定义为 type）
		if (key === 'Map') {
			continue;
		}

		// 2. 判断是否是泛型类型
		const isGeneric = originalName.includes('«');

		// 3. 如果这个 key 已经存在
		if (pool.has(key)) {
			const existing = pool.get(key)!;
			// 如果已存在的是非泛型，而当前是泛型，则覆盖（优先保留泛型定义）
			if (!existing.isGeneric && isGeneric) {
				// 继续处理，覆盖非泛型版本
			} else {
				// 其他情况跳过（避免重复）
				continue;
			}
		}

			// 4. 提取泛型参数列表
			const genericParams = isGeneric ? this.extractGenericParams(originalName) : [];

			// 5. 构建 TypeDefinition
			const typeDef: TypeDefinition = {
				key,
				originalName,
				isGeneric,
				genericParams,
				properties: def.properties || {},
				description: def.description || '',
				definition: def
			};

			pool.set(key, typeDef);
		}

		return pool;
	}

	/**
	 * 提取类型的 key
	 * - 直接字面量：保持原样
	 * - 带尖角号：移除最后的»，替换«为_，取第一个片段
	 */
	private static extractTypeKey(originalName: string): string {
		if (!originalName.includes('«')) {
			return originalName;
		}

		// 移除最后的 »，替换 « 为 _，然后 split 取第一个
		const cleaned = originalName.replace(/»$/, '').replace(/«/g, '_');
		return cleaned.split('_')[0];
	}

	/**
	 * 提取泛型参数列表
	 * 从 ReplyEntity«PageResultDto«StudentCourseDTO»» 中提取泛型参数
	 */
	private static extractGenericParams(originalName: string): string[] {
		// 提取最外层尖角号内的内容
		const match = originalName.match(/«(.+)»$/);
		if (!match) {
			return [];
		}

		const innerContent = match[1];

		// 处理嵌套泛型，返回完整的泛型参数表达式
		return [innerContent];
	}

	/**
	 * 构建接口池
	 * 收集所有选中接口的类型依赖
	 */
	private static buildApiPool(paths: any, mergedApiData: any): Map<string, ApiDefinition> {
		const pool = new Map<string, ApiDefinition>();

		if (!paths) {
			return pool;
		}

		// 遍历所有路径
		for (const [pathUrl, methods] of Object.entries<any>(paths)) {
			// 遍历该路径下的所有 HTTP 方法
			for (const [method, operation] of Object.entries<any>(methods)) {
				const apiKey = `${pathUrl}::${method.toLowerCase()}`;

				// 收集入参类型
				const inputTypes = new Set<string>();
				if (operation.parameters && Array.isArray(operation.parameters)) {
					operation.parameters.forEach((param: any) => {
						if (param.schema) {
							// 处理 $ref 引用
							if (param.schema.$ref) {
								const types = this.extractTypesFromRef(param.schema.$ref);
								types.forEach(t => inputTypes.add(t));
							}
							// 处理数组类型（如 type: 'array', items: { $ref: '...' }）
							else if (param.schema.type === 'array' && param.schema.items) {
								if (param.schema.items.$ref) {
									const types = this.extractTypesFromRef(param.schema.items.$ref);
									types.forEach(t => inputTypes.add(t));
								}
							}
						}
					});
				}

				// 收集出参类型
				const outputTypes = new Set<string>();
				let responseSchema = '';
				if (operation.responses) {
					// 获取成功的响应
					const successResponse = this.getSuccessResponse(operation.responses);
					if (successResponse && successResponse.schema) {
						if (successResponse.schema.$ref) {
							responseSchema = this.extractTypeNameFromRef(successResponse.schema.$ref);
							const types = this.extractTypesFromRef(successResponse.schema.$ref);
							types.forEach(t => outputTypes.add(t));
						}
					}
				}

				// 合并所有类型
				const allTypes = new Set<string>([...inputTypes, ...outputTypes]);

				// 构建 ApiDefinition
				const apiDef: ApiDefinition = {
					path: pathUrl,
					method: method.toLowerCase(),
					operationId: operation.operationId || '',
					summary: operation.summary || operation.description || '',
					inputTypes,
					outputTypes,
					allTypes,
					parameters: operation.parameters || [],
					responseSchema,
					tags: operation.tags || []
				};

				pool.set(apiKey, apiDef);
			}
		}

		return pool;
	}

	/**
	 * 从 $ref 中提取类型依赖
	 * 处理规则：
	 * 1. 去掉 #/definitions/ 前缀
	 * 2. 对于泛型类型，去除尖角号、split 处理，提取所有依赖的基础类型
	 * 3. 递归处理嵌套泛型
	 */
	private static extractTypesFromRef(ref: string): string[] {
		const types: string[] = [];

		// 去掉 #/definitions/ 前缀
		const typeName = this.extractTypeNameFromRef(ref);

		if (!typeName) {
			return types;
		}

		// 如果不包含泛型符号，直接返回
		if (!typeName.includes('«')) {
			types.push(typeName);
			return types;
		}

		// 提取基础类型（尖角号前的部分）
		const baseType = this.extractTypeKey(typeName);
		types.push(baseType);

	// 提取泛型参数中的类型
	const matchResult = typeName.match(/«(.+)»$/);
	const genericContent = matchResult ? matchResult[1] : null;
	if (genericContent) {
		// 递归处理泛型参数
		const innerTypes = this.parseGenericContent(genericContent);
		types.push(...innerTypes);
	}

		return types;
	}

	/**
	 * 解析泛型内容，提取所有类型
	 * 例如：PageResultDto«StudentCourseDTO» -> [PageResultDto, StudentCourseDTO]
	 * 例如：List«AssistantInfoResp» -> [AssistantInfoResp] (List 不是类型定义)
	 * @param content 泛型内容
	 * @param filterBasicTypes 是否过滤基本类型（如 string、integer 等）
	 */
	private static parseGenericContent(content: string, filterBasicTypes: boolean = false): string[] {
		const types: string[] = [];

		// 如果是 List，特殊处理
		if (content.startsWith('List«')) {
			const matchResult = content.match(/List«(.+)»$/);
			const innerContent = matchResult ? matchResult[1] : null;
			if (innerContent) {
				return this.parseGenericContent(innerContent, filterBasicTypes);
			}
			return types;
		}

		// 如果包含嵌套泛型
		if (content.includes('«')) {
			// 提取基础类型
			const baseType = this.extractTypeKey(content);
			types.push(baseType);

			// 递归提取内层类型
			const matchResult = content.match(/«(.+)»$/);
			const innerContent = matchResult ? matchResult[1] : null;
			if (innerContent) {
				types.push(...this.parseGenericContent(innerContent, filterBasicTypes));
			}
		} else {
			// 没有嵌套，直接添加
			if (filterBasicTypes) {
				// 过滤基本类型
				const basicTypes = ['string', 'String', 'integer', 'Integer', 'boolean', 'Boolean', 'number', 'long', 'Long'];
				if (!basicTypes.includes(content)) {
					types.push(content);
				}
			} else {
				types.push(content);
			}
		}

		return types;
	}

	/**
	 * 将字符串转换为大驼峰格式（PascalCase）
	 * 例如：intend-lesson-controller -> IntendLessonController
	 *      smart_timetable_controller -> SmartTimetableController
	 */
	private static toPascalCase(str: string): string {
		return str
			// 按 - 或 _ 或空格分割
			.split(/[-_\s]+/)
			// 每个单词首字母大写
			.map(word => {
				if (!word) return '';
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			// 连接
			.join('');
	}

	/**
	 * 生成 Controller 类型定义
	 */
	private static generateControllerTypes(apiPool: Map<string, ApiDefinition>, mergedApiData: any, spec: any, typesPool: Map<string, TypeDefinition>): string[] {
		const lines: string[] = [];

		// 从类型池中提取所有泛型类型名称
		const genericTypeNames = new Set<string>();
		typesPool.forEach((typeDef) => {
			if (typeDef.isGeneric) {
				genericTypeNames.add(typeDef.key);
			}
		});

	// 构建 tags 的 description 映射
	// 注意：需要对 tag.name 做和 mergedApiData key 相同的转换
	const tagDescriptions = new Map<string, string>();
	if (spec.tags && Array.isArray(spec.tags)) {
		for (const tag of spec.tags) {
			if (tag.name && tag.description) {
				// 使用原始名称作为 key
				tagDescriptions.set(tag.name, tag.description);
			}
		}
	}

		// 按 controller 分组（使用 mergedApiData）
		const sortedControllers = Object.keys(mergedApiData).sort((a, b) => a.localeCompare(b, 'zh-CN'));

	for (const controllerName of sortedControllers) {
		const apis = mergedApiData[controllerName];
		if (!apis || apis.length === 0) {
			continue;
		}

		// 从第一个 API 获取原始 tag 名称
		let originalTag = controllerName;
		if (apis.length > 0 && apis[0].path) {
			const apiKey = `${apis[0].path}::${apis[0].method.toLowerCase()}`;
			const apiDef = apiPool.get(apiKey);
			if (apiDef && apiDef.tags && apiDef.tags.length > 0) {
				originalTag = apiDef.tags[0];
			}
		}

		// 转换为大驼峰命名
		const pascalCaseName = this.toPascalCase(originalTag);

		// 获取 controller 的描述（使用原始 tag 名称查找）
		const description = tagDescriptions.get(originalTag) || originalTag;

		// 生成 Controller 接口
		lines.push(`/** ${description} */`);
		lines.push(`export interface ${pascalCaseName} {`);

			// 按 operationId 排序
			const sortedApis = this.sortApis(apis);

			for (const api of sortedApis) {
				const apiKey = `${api.path}::${api.method.toLowerCase()}`;
				const apiDef = apiPool.get(apiKey);

				if (!apiDef) {
					continue;
				}

			// 生成方法签名
			const methodName = this.toMethodName(api);
			const methodLines = this.generateControllerMethod(methodName, apiDef, genericTypeNames);
			lines.push(...methodLines);
		}

		lines.push('}');
		lines.push('');
	}

	return lines;
}

/**
 * 生成 Controller 方法类型定义
 */
private static generateControllerMethod(methodName: string, apiDef: ApiDefinition, genericTypeNames: Set<string>): string[] {
	const lines: string[] = [];

	// 添加方法描述
	if (apiDef.summary) {
		lines.push(`  /** ${apiDef.summary} */`);
	}

	// 生成参数列表
	const params = this.generateMethodParameters(apiDef);

	// 生成返回类型
	const returnType = this.generateReturnType(apiDef, genericTypeNames);

		// 生成方法签名
		lines.push(`  ${methodName}(${params}): ${returnType};`);

		return lines;
	}

	/**
	 * 生成方法参数列表
	 */
	private static generateMethodParameters(apiDef: ApiDefinition): string {
		const params: string[] = [];
		const { bodyParam, bodyParams, queryParams, pathParams } = this.classifyParameters(apiDef.parameters || []);

		// 处理多个 body 参数的情况
		if (bodyParams.length > 1) {
			bodyParams.forEach((param: any) => {
				const paramName = param.name || 'input';
				const optional = param.required === false ? '?' : '';
				const tsType = param.schema ?
					(param.schema.$ref
						? this.convertSwaggerTypeToTS(this.extractTypeNameFromRef(param.schema.$ref))
						: param.schema.type === 'array'
							? `${param.schema.items && param.schema.items.$ref
								? this.convertSwaggerTypeToTS(this.extractTypeNameFromRef(param.schema.items.$ref))
								: this.mapSwaggerTypeToTS((param.schema.items && param.schema.items.type) || 'any')}[]`
							: this.mapSwaggerTypeToTS(param.schema.type || 'any'))
					: this.mapSwaggerTypeToTS(param.type || 'any');
				params.push(`${paramName}${optional}: ${tsType}`);
			});
		} else if (bodyParam && bodyParam.schema) {
			// 单个 Body 参数
			const paramName = bodyParam.name || 'input';
			const optional = bodyParam.required === false ? '?' : '';

			if (bodyParam.schema.$ref) {
				const typeName = this.extractTypeNameFromRef(bodyParam.schema.$ref);
				const tsType = this.convertSwaggerTypeToTS(typeName);
				params.push(`${paramName}${optional}: ${tsType}`);
			} else if (bodyParam.schema.type === 'array') {
				// 处理数组类型的body参数
				const itemType = bodyParam.schema.items && bodyParam.schema.items.$ref
					? this.convertSwaggerTypeToTS(this.extractTypeNameFromRef(bodyParam.schema.items.$ref))
					: this.mapSwaggerTypeToTS((bodyParam.schema.items && bodyParam.schema.items.type) || 'any');
				params.push(`${paramName}${optional}: ${itemType}[]`);
			} else {
				// 其他类型
				const tsType = this.mapSwaggerTypeToTS(bodyParam.schema.type || 'any');
				params.push(`${paramName}${optional}: ${tsType}`);
			}
		}

	// Query 和 Path 参数
	[...pathParams, ...queryParams].forEach((param: any) => {
		const paramName = param.name;
		const required = param.required ? '' : '?';

		let paramType: string;
		if (param.schema) {
			// 如果有 schema，使用 schema 推导类型
			paramType = param.schema.$ref
				? this.convertSwaggerTypeToTS(this.extractTypeNameFromRef(param.schema.$ref))
				: param.schema.type === 'array'
					? `${param.schema.items && param.schema.items.$ref
						? this.convertSwaggerTypeToTS(this.extractTypeNameFromRef(param.schema.items.$ref))
						: this.mapSwaggerTypeToTS((param.schema.items && param.schema.items.type) || 'any')}[]`
					: this.mapSwaggerTypeToTS(param.schema.type || 'any');
		} else if (param.type === 'array' && param.items) {
			// 如果是 array 类型，检查 items
			const itemType = param.items.type ?
				this.mapSwaggerTypeToTS(param.items.type) :
				'any';
			paramType = `${itemType}[]`;
		} else {
			// 其他基本类型
			paramType = this.mapSwaggerTypeToTS(param.type || 'any');
		}

		params.push(`${paramName}${required}: ${paramType}`);
	});

		// 添加 axiosConfig 可选参数
		params.push('axiosConfig?: AxiosRequestConfig');

		return params.join(', ');
	}

	/**
	 * 生成返回类型
	 */
	private static generateReturnType(apiDef: ApiDefinition, genericTypeNames: Set<string>): string {
		if (!apiDef.responseSchema) {
			return 'Promise<any>';
		}

		let tsType = this.convertSwaggerTypeToTS(apiDef.responseSchema);

		// 处理泛型包装类型：如果没有泛型参数，添加 <void>
		tsType = this.ensureGenericTypes(tsType, genericTypeNames);

		return `Promise<${tsType}>`;
	}

	/**
	 * 确保泛型包装类型有泛型参数
	 * 如果没有，则添加 <void>
	 */
	private static ensureGenericTypes(typeName: string, genericTypeNames: Set<string>): string {
		// 如果类型名没有 < 符号，说明没有泛型参数
		if (!typeName.includes('<')) {
			// 检查是否是泛型包装类型
			if (genericTypeNames.has(typeName)) {
				return `${typeName}<void>`;
			}
		}

		return typeName;
	}

	/**
	 * 确保泛型包装类型有泛型参数（用于 apis.ts，类型名带 Types. 前缀）
	 * 如果没有，则添加 <void>
	 */
	private static ensureGenericTypesForApis(typeName: string, genericTypeNames: Set<string>): string {
		// 如果类型名没有 < 符号，说明没有泛型参数
		if (!typeName.includes('<')) {
			// 检查是否以 Types. 开头
			if (typeName.startsWith('Types.')) {
				const bareTypeName = typeName.substring(6); // 去掉 'Types.' 前缀
				// 检查是否是泛型包装类型
				if (genericTypeNames.has(bareTypeName)) {
					return `Types.${bareTypeName}<void>`;
				}
			}
		}

		return typeName;
	}

	/**
	 * 生成apis.ts内容
	 */
	private static renderApis(mergedApiData: any, spec: any): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(``);
		lines.push(`import type { AxiosRequestConfig } from 'axios';`);
		lines.push(`import $http from '../request';`);
		lines.push(`import * as Types from './types';`);
		lines.push(``);

		// 设置 basePath
		const basePath = (spec && spec.basePath && spec.basePath !== '/') ? spec.basePath : '';
		lines.push(`const basePath = '${basePath}';`);
		lines.push('');

		// 构建泛型类型名称集合（用于确保泛型类型有泛型参数）
		const genericTypeNames = new Set<string>();
		if (spec && spec.definitions) {
			const typesPool = this.buildTypesPool(spec.definitions);
			typesPool.forEach((typeDef: any, name: string) => {
				if (typeDef.isGeneric) {
					// 使用 Map 的 key 作为类型名，而不是 typeDef.name
					genericTypeNames.add(name);
				}
			});
		}

		// 用于跟踪已使用的方法名，确保唯一性
		const existingMethodNames = new Set<string>();

		// 按照控制器名称排序 (支持中文)
		const sortedControllers = Object.keys(mergedApiData).sort((a, b) =>
			a.localeCompare(b, this.LOCALE)
		);

		for (const controllerName of sortedControllers) {
			const apis = mergedApiData[controllerName];

			// 从第一个 API 获取原始 tag 名称
			const originalTag = apis.length > 0 && apis[0].tags && apis[0].tags.length > 0
				? apis[0].tags[0]
				: controllerName;

			// 生成 Controller 常量名（小驼峰，去掉 Controller 后缀）
			const controllerConst = this.toCamelCase(originalTag);

			// 生成 Controller 类型名（大驼峰，用于 Types.XXX）
			const controllerType = this.toPascalCase(originalTag);

			lines.push(`export const ${controllerConst}: Types.${controllerType} = {`);

			// 按照 operationId 排序
			const sortedApis = this.sortApis(apis);

		sortedApis.forEach((api: any) => {
			const methodName = this.toMethodName(api, existingMethodNames);
			const method = String(api.method).toLowerCase();
			let respType = this.resolveResponseType(spec, api);
			// 确保泛型类型有泛型参数
			respType = this.ensureGenericTypesForApis(respType, genericTypeNames);
			const pathExpr = '${basePath}' + String(api.path);

			// 分类参数
			const { bodyParam, bodyParams, queryParams, pathParams } = this.classifyParameters(api.parameters || []);
			const hasUrlParams = queryParams.length > 0 || pathParams.length > 0;
			const hasMultiBodyParams = bodyParams.length > 1;

			if (hasMultiBodyParams) {
				// 有多个 body 参数的方法（通常是不规范的 Swagger 定义）
				// 将所有 body 参数作为方法参数，并组合到 payload 对象中
				const paramList = bodyParams.map((p: any) => {
					const optional = p.required === false ? '?' : '';
					const paramType = p.schema ?
						this.tsTypeFromSchema(p.schema, true) :
						this.mapPrimitiveTypeForApis(p.type || 'string', p.format);
					return `${p.name}${optional}: ${paramType}`;
				});

				const argList = paramList.join(', ');
				const payloadObj = `{ ${bodyParams.map((p: any) => p.name).join(', ')} }`;

				lines.push(`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
				lines.push(`    const path = \`${pathExpr}\`;`);
				lines.push(`    const payload: Types.BaseRequestDTO = ${payloadObj};`);
				lines.push(`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`);
				lines.push(`    return ret;`);
				lines.push(`  },`);
		} else if (hasUrlParams) {
			// 有 URL 参数的方法（GET、DELETE 等）
			const allParams = [...pathParams, ...queryParams]; // path 参数在前，query 参数在后

		// 生成内联参数列表
		const paramList = allParams.map((p: any) => {
			const optional = (p.in === 'path' || p.required) ? '' : '?'; // path 参数必须，query 参数看 required
			let paramType: string;

			if (p.schema) {
				// 如果有 schema，使用 schema 推导类型
				paramType = this.tsTypeFromSchema(p.schema, true);
			} else if (p.type === 'array' && p.items) {
				// 如果是 array 类型，检查 items
				const itemType = p.items.type ?
					this.mapPrimitiveTypeForApis(p.items.type, p.items.format) :
					'any';
				paramType = `${itemType}[]`;
			} else {
				// 其他基本类型
				paramType = this.mapPrimitiveTypeForApis(p.type || 'string', p.format);
			}

			return `${p.name}${optional}: ${paramType}`;
		});

			const argList = paramList.join(', ');
			// payload 应该包含所有参数（path 参数 + query 参数）
			const payloadObj = allParams.length > 0 ?
				`{ ${allParams.map((p: any) => p.name).join(', ')} }` :
				`{}`;

			lines.push(`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
			lines.push(`    const path = \`${pathExpr}\`;`);
			lines.push(`    const payload: Types.BaseRequestDTO = ${payloadObj};`);
				lines.push(`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`);
				lines.push(`    return ret;`);
				lines.push(`  },`);
			} else if (bodyParam) {
				// 有 body 参数的方法（POST、PUT 等）
				const reqType = this.resolveRequestType(spec, api);
				const paramName = bodyParam.name || 'req';
				const optional = bodyParam.required === false ? '?' : '';
				const payloadType = optional ? `${reqType} | undefined` : reqType;
				lines.push(`  async ${methodName}(${paramName}${optional}: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
				lines.push(`    const path = \`${pathExpr}\`;`);
				lines.push(`    const payload: ${payloadType} = ${paramName};`);
				lines.push(`    const ret = await $http.run<${reqType}, ${respType}>(path, '${method}', payload, axiosConfig);`);
				lines.push(`    return ret;`);
				lines.push(`  },`);
				} else {
					// 没有参数的方法
					lines.push(`  async ${methodName}(axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
					lines.push(`    const path = \`${pathExpr}\`;`);
					lines.push(`    const payload: Types.BaseRequestDTO = {};`);
					lines.push(`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`);
					lines.push(`    return ret;`);
					lines.push(`  },`);
				}
			});

			lines.push('};');
			lines.push('');
		}

		return lines.join('\n');
	}

	/**
	 * 从 schema 生成 TypeScript 类型（用于 apis.ts，带 Types. 前缀）
	 */
	private static tsTypeFromSchema(sch: any, expandRef = false): string {
		if (!sch) return 'any';

		if (sch.$ref) {
			const match = sch.$ref.match(/#\/definitions\/(.+)$/);
			const name = match ? match[1] : null;
			if (!name) return 'any';
			// convertSwaggerTypeToTSForApis 已经会添加 Types. 前缀
			const cleanName = this.convertSwaggerTypeToTSForApis(name);
			return expandRef ? cleanName.replace(/^Types\./, '') : cleanName;
		}

		if (sch.type === 'array') {
			const itemTs = this.tsTypeFromSchema(sch.items || { type: 'any' }, expandRef);
			return `${itemTs}[]`;
		}

		// 处理枚举类型
		if (sch.enum && Array.isArray(sch.enum)) {
			const enumValues = sch.enum.map((value: any) => `"${value}"`).join(' | ');
			return enumValues;
		}

		if (sch.type) {
			return this.mapPrimitiveTypeForApis(sch.type, sch.format);
		}

		return 'any';
	}

	/**
	 * 将 Swagger 类型名转换为 TypeScript 类型（用于 APIs，所有类型都加 Types. 前缀）
	 * 处理泛型：Result«String» -> Types.Result<string>
	 *          PageResult«UserDTO» -> Types.PageResult<Types.UserDTO>
	 */
	private static convertSwaggerTypeToTSForApis(swaggerType: string): string {
		// 如果不包含泛型符号，判断是否需要加 Types. 前缀
		if (!swaggerType.includes('«')) {
			const mappedType = this.mapSwaggerTypeToTS(swaggerType);
			// 只有基本的 TypeScript 内置类型不加 Types. 前缀
			if (this.isBasicTSType(mappedType)) {
				return mappedType;
			}
			// 自定义类型加 Types. 前缀（包括 PlainObject）
			return `Types.${mappedType}`;
		}

		// 提取基础类型（泛型包装）
		const baseType = this.extractTypeKey(swaggerType);

		// 提取泛型参数
		const matchResult = swaggerType.match(/«(.+)»$/);
		const genericContent = matchResult ? matchResult[1] : null;
		if (!genericContent) {
			return `Types.${baseType}`;
		}

		// 转换泛型参数（递归处理嵌套泛型）
		const tsGenericParam = this.convertGenericParamToTSForApis(genericContent);

		// 泛型包装类型加 Types. 前缀
		return `Types.${baseType}<${tsGenericParam}>`;
	}

	/**
	 * 转换泛型参数为 TypeScript 格式（用于 APIs）
	 */
	private static convertGenericParamToTSForApis(genericParam: string): string {
		// 处理 List«XXX» -> XXX[]
		if (genericParam.startsWith('List«')) {
			const matchResult = genericParam.match(/List«(.+)»$/);
			const innerContent = matchResult ? matchResult[1] : null;
			if (innerContent) {
				return `${this.convertGenericParamToTSForApis(innerContent)}[]`;
			}
		}

		// 处理嵌套泛型（如 BasePageResDTO«UserDTO»）
		if (genericParam.includes('«')) {
			return this.convertSwaggerTypeToTSForApis(genericParam);
		}

		// 处理多个泛型参数（用逗号分隔，如 Map«string,string»）
		// 需要小心处理嵌套的情况，比如 Map«string,List«UserDTO»»
		if (genericParam.includes(',')) {
			const parts = this.splitGenericParams(genericParam);
			const convertedParts = parts.map(part => {
				const trimmedPart = part.trim();
				const mappedType = this.mapSwaggerTypeToTS(trimmedPart);
				// 只有基本的 TypeScript 内置类型不加 Types. 前缀
				if (this.isBasicTSType(mappedType)) {
					return mappedType;
				}
				// 自定义类型加 Types. 前缀
				return `Types.${mappedType}`;
			});
			return convertedParts.join(', ');
		}

		// 基本类型映射
		const mappedType = this.mapSwaggerTypeToTS(genericParam);
		// 只有基本的 TypeScript 内置类型不加 Types. 前缀
		if (this.isBasicTSType(mappedType)) {
			return mappedType;
		}
		// 自定义类型加 Types. 前缀（包括 PlainObject）
		return `Types.${mappedType}`;
	}

	/**
	 * 分割泛型参数（考虑嵌套的情况）
	 * 例如：splitGenericParams("string,List«UserDTO»") -> ["string", "List«UserDTO»"]
	 */
	private static splitGenericParams(params: string): string[] {
		const result: string[] = [];
		let current = '';
		let depth = 0;

		for (let i = 0; i < params.length; i++) {
			const char = params[i];
			if (char === '«') {
				depth++;
				current += char;
			} else if (char === '»') {
				depth--;
				current += char;
			} else if (char === ',' && depth === 0) {
				// 只在顶层逗号处分割
				result.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}

		if (current.trim()) {
			result.push(current.trim());
		}

		return result;
	}

	/**
	 * 判断是否是 TypeScript 基本类型（不需要 Types. 前缀）
	 */
	private static isBasicTSType(type: string): boolean {
		return this.BASIC_TS_TYPES.has(type);
	}

	/**
	 * 映射基本类型（用于 apis.ts）
	 */
	private static mapPrimitiveTypeForApis(type?: string, format?: string): string {
		if (!type) return 'any';
		if (type === 'integer' || type === 'number') return 'number';
		if (type === 'long' || (type === 'integer' && format === 'int64')) return 'number';
		if (type === 'boolean') return 'boolean';
		if (type === 'string') return 'string';
		if (type === 'array') return 'any[]';
		if (type === 'object') return 'Types.PlainObject';
		return 'any';
	}

	/**
	 * 解析请求类型（入参）
	 */
	private static resolveRequestType(spec: any, api: any): string {
		if (!api || !api.parameters || !Array.isArray(api.parameters)) {
			return 'any';
		}

		const bodyParam = api.parameters.find((p: any) => p.in === 'body');
		if (!bodyParam || !bodyParam.schema) {
			return 'any';
		}

		return this.tsTypeFromSchema(bodyParam.schema);
	}

	/**
	 * 解析响应类型（出参）
	 */
	private static resolveResponseType(spec: any, api: any): string {
		const op = spec && spec.paths && spec.paths[api.path]
			? spec.paths[api.path][String(api.method).toLowerCase()]
			: null;

		if (!op) return 'any';

		const responses = op.responses || {};
		const ok = this.getSuccessResponse(responses);
		const schema = ok && ok.schema ? ok.schema : null;

		if (!schema) return 'void';

		return this.tsTypeFromSchema(schema);
	}
}
