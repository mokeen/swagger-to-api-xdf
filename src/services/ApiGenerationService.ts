import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContractService } from "./ContractService";

export class ApiGenerationService {
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

				// 直接使用控制器名称，不做转换
				let tagName = controllerName;

				// 提取方法信息
				const methods: any[] = [];
				const methodRegex = /async\s+(\w+)\s*\([^)]*\):[^{]*\{[\s\S]*?const\s+path\s*=\s*`([^`]+)`;[\s\S]*?\$http\.run[^(]*\(path,\s*'(\w+)'[\s\S]*?\},?\s*$/gm;
				let methodMatch;

				while ((methodMatch = methodRegex.exec(controllerContent)) !== null) {
					const methodName = methodMatch[1];
					const pathTemplate = methodMatch[2];
					const httpMethod = methodMatch[3];

					// 从路径模板中提取实际路径
					const apiPath = pathTemplate.replace('${basePath}', '');

				// 解析新格式的方法名：{baseName}_{httpMethod}_{pathHash}
				const originalOperationId = this.parseMethodNameToOperationId(methodName, apiPath, httpMethod);

					methods.push({
						operationId: originalOperationId,
						path: apiPath,
						method: httpMethod,
						summary: originalOperationId, // 使用解析后的operationId作为fallback
						// 注意：这里我们无法完全恢复原始的swagger数据，但足够用于排序和生成
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

		// 创建控制器名称标准化函数
		const normalizeControllerName = (name: string) => {
			const clean = (name || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
			return `${clean}Controller`;
		};

		// 首先添加所有已存在的API数据（使用标准化的控制器名）
		for (const [controller, apis] of Object.entries(existingApiData)) {
			const normalizedName = normalizeControllerName(controller);
			mergedData[normalizedName] = [...apis];
		}

		// 然后处理新选择的API，覆盖或添加（同样使用标准化的控制器名）
		for (const [controller, newApis] of Object.entries(selectedApis)) {
			const normalizedName = normalizeControllerName(controller);
			if (!mergedData[normalizedName]) {
				mergedData[normalizedName] = [];
			}

			const existingApis = mergedData[normalizedName];
			let updatedCount = 0;
			let addedCount = 0;

		// 对于每个新选择的API
		newApis.forEach(newApi => {
		// 创建一个清理后的API副本
		const cleanedApi = { ...newApi };
		if (cleanedApi.operationId) {
			// 更彻底的清理：移除 UsingPOST_数字 这样的后缀
			cleanedApi.operationId = cleanedApi.operationId
				.replace(/Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i, '') || cleanedApi.operationId;
		}

			// 查找是否在同一controller中已存在相同的API（基于path和method）
			const existingIndex = existingApis.findIndex(existing =>
				existing.path === cleanedApi.path && existing.method.toLowerCase() === cleanedApi.method.toLowerCase()
			);

			if (existingIndex >= 0) {
				// 覆盖已存在的API
				existingApis[existingIndex] = cleanedApi;
				updatedCount++;
			} else {
				// 添加新的API
				existingApis.push(cleanedApi);
				addedCount++;
			}
		});

			mergedData[normalizedName] = existingApis;
		}

		// 对合并后的数据进行排序
		return this.sortMergedApiData(mergedData);
	}

	/**
	 * 对合并后的API数据进行排序
	 */
	private static sortMergedApiData(apiData: { [controller: string]: any[] }): { [controller: string]: any[] } {
		const sortedData: { [controller: string]: any[] } = {};

		// 按控制器名称排序
		const sortedControllerNames = Object.keys(apiData).sort((a, b) => a.localeCompare(b, "zh-CN"));

		for (const controllerName of sortedControllerNames) {
			const apis = apiData[controllerName];

			// 对每个控制器内的API按照operationId或路径最后一段排序
			const sortedApis = apis.sort((a, b) => {
				const aId = a.operationId || a.summary || (a.path ? a.path.split('/').pop() : '');
				const bId = b.operationId || b.summary || (b.path ? b.path.split('/').pop() : '');
				return aId.localeCompare(bId, "zh-CN");
			});

			sortedData[controllerName] = sortedApis;
		}

		return sortedData;
	}

	public static async generateApiFiles(
		workspacePath: string,
		context: vscode.ExtensionContext,
		swaggerJson: any,
		selectedApis: { [controller: string]: any[] },
	): Promise<{ ok: boolean; message?: string }> {
		try {
			const docName = swaggerJson.info?.title;

			const config = await ContractService.getConfig(workspacePath);

			const workDir = path.join(
				workspacePath,
				config.dirByRoot,
				config.workDir
			);
			const docDir = path.join(workDir, docName);

			if (!fs.existsSync(docDir)) {
				fs.mkdirSync(docDir, { recursive: true });
			}

			// 1. 读取已存在的API数据
			const existingApiData = await this.getExistingApiData(workspacePath, docName);

			// 2. 合并已存在的数据和新选择的数据
			const mergedApiData = this.mergeApiData(existingApiData, selectedApis);

			// 3. 基于合并后的数据过滤 paths（包含所有需要生成的API）
			const picked = new Set<string>();
			Object.values(mergedApiData || {}).forEach(list => {
				(list || []).forEach((api: any) => {
					if (api?.path && api?.method) {
						picked.add(`${api.path}::${String(api.method).toLowerCase()}`);
					}
				});
			});

			const filteredPaths: Record<string, any> = {};
			if (swaggerJson?.paths) {
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

			// 4. 过滤 spec
			const spec: any = {
				...swaggerJson,
				paths: filteredPaths
			};

			// 5. 生成 types.ts（完整重建）
			const typesPath = path.join(docDir, "types.ts");
			const typesContent = ApiGenerationService.renderTypes(spec, mergedApiData);
			fs.writeFileSync(typesPath, typesContent, "utf-8");

			// 6. 生成 apis.ts（使用合并后的数据完整重建）
			const apisPath = path.join(docDir, "apis.ts");
			const apisContent = ApiGenerationService.renderApis(mergedApiData, spec);
			fs.writeFileSync(apisPath, apisContent, "utf-8");

			// 7. 写 index.ts（使用命名空间导出以支持更好的类型推导）
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

	private static paramInterfaceName(api: any): string {
		const operationId = api.operationId || "unknownOp";
		return `${operationId}Params`;
	}

	private static toMethodName(api: any, existingNames: Set<string> = new Set()): string {
		// 1. 获取清理后的基础名称
		let baseName = '';
		if (api.operationId) {
			// 移除 UsingPOST_数字 这样的后缀
			baseName = api.operationId.replace(/Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i, '') || api.operationId;
		} else {
			// 如果没有 operationId，根据路径和方法生成
			const pathParts = (api.path || '').split('/').filter(Boolean);
			const lastPart = pathParts[pathParts.length - 1] || 'unknown';
			const method = String(api.method || 'get').toLowerCase();
			baseName = `${method}${lastPart.charAt(0).toUpperCase()}${lastPart.slice(1)}`;
		}

		// 2. 生成路径的短哈希值（确保唯一性和可逆性）
		const pathHash = this.generatePathHash(api.path || '');

		// 3. 组合生成最终方法名：{baseName}_{pathHash}
		const methodName = `${baseName}_${pathHash}`;

		existingNames.add(methodName);
		return methodName;
	}

	/**
	 * 为路径生成短哈希值
	 * 使用简单的哈希算法确保相同路径得到相同哈希值
	 */
	private static generatePathHash(path: string): string {
		let hash = 0;
		for (let i = 0; i < path.length; i++) {
			const char = path.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // 转换为32位整数
		}
		// 转换为6位的16进制字符串
		return Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0');
	}

	/**
	 * 从生成的方法名解析出原始的operationId
	 * 方法名格式：{baseName}_{pathHash}
	 */
	private static parseMethodNameToOperationId(methodName: string, apiPath: string, httpMethod: string): string {
		// 计算当前路径的哈希值
		const expectedHash = this.generatePathHash(apiPath);
		const expectedSuffix = `_${expectedHash}`;

		// 如果方法名符合新格式，提取baseName
		if (methodName.endsWith(expectedSuffix)) {
			return methodName.substring(0, methodName.length - expectedSuffix.length);
		}

		// 如果不符合新格式，可能是旧格式，应用旧的清理逻辑
		return methodName.replace(/Using(POST|GET|PUT|DELETE|PATCH|HEAD|OPTIONS)(_\d+)?$/i, '') || methodName;
	}

	private static resolveRequestType(spec: any, api: any): string {
		if (!api?.parameters || !Array.isArray(api.parameters)) {
			return 'any';
		}

		const bodyParam = api.parameters.find((p: any) => p.in === 'body');
		if (!bodyParam?.schema) {
			return 'any';
		}

		return this.tsTypeFromSchema(bodyParam.schema);
	}

	private static resolveResponseTypeForTypes(spec: any, api: any): string {
		const op = spec?.paths?.[api.path]?.[String(api.method).toLowerCase()];
		if (!op) return 'any';
		const responses = op?.responses || {};
		const ok = responses['200'] || responses['201'] || responses['default'];
		const schema = ok?.schema;
		if (!schema) return 'void';
		if (schema.$ref) {
			const name = this.refName(schema.$ref) || '';
			const listInner = this.extractListInnerForTypes(name);
			// Result<...>
			if (/^Result/.test(name)) {
				if (listInner) return `Result<${listInner}[]>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					// 只有当内部类型确实是包装类型时才进行特殊处理
					// PageResultDTO<Inner> or PageResult<Inner>
					const prDtoInner = this.extractGenericInnerForTypes(innerName, 'PageResultDTO');
					if (prDtoInner) {
						return `Result<PageResult<${prDtoInner}[]>>`;
					}
					const prInner = this.extractGenericInnerForTypes(innerName, 'PageResult');
					if (prInner) {
						return `Result<PageResult<${prInner}>>`;
					}
					// 添加对 Page<T> 类型的处理
					const pageInner = this.extractGenericInnerForTypes(innerName, 'Page');
					if (pageInner) {
						return `Result<Page<${pageInner}>>`;
					}
					const basePageInner = this.extractGenericInnerForTypes(innerName, 'BasePageRespDTO');
					if (basePageInner) {
						return `Result<BasePageRespDTO<${basePageInner}>>`;
					}
					// Fallback to $ref type
					const t = this.tsTypeFromSchemaForTypes({ $ref: data.$ref });
					return `Result<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = this.tsTypeFromSchemaForTypes(itemSchema);
					return `Result<${itemTs}[]>`;
				}
				if (data?.type) {
					const t = this.mapPrimitiveType(data.type, data.format);
					return `Result<${t}>`;
				}
				return `Result<void>`;
			}
			// PageResultDTO<Inner>
			if (/^PageResultDTO/.test(name)) {
				const inner = this.extractGenericInnerForTypes(name, 'PageResultDTO');
				if (inner) {
					return `PageResult<${inner}[]>`;
				}
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				if (coll?.items?.$ref) {
					const innerType = this.tsTypeFromSchemaForTypes({ $ref: coll.items.$ref });
					return `PageResult<${innerType}[]>`;
				}
				return `PageResult<any[]>`;
			}
			// PageResult<Inner>
			if (/^PageResult/.test(name)) {
				const inner = this.extractGenericInnerForTypes(name, 'PageResult');
				if (inner) {
					return `PageResult<${inner}>`;
				}
				return `PageResult<any>`;
			}
			// BasePageRespDTO<Inner>
			if (/^BasePageRespDTO/.test(name)) {
				const inner = this.extractGenericInnerForTypes(name, 'BasePageRespDTO');
				if (inner) {
					return `BasePageRespDTO<${inner}>`;
				}
				return `BasePageRespDTO<any>`;
			}
			// ReplyEntity<...>
			if (/^ReplyEntity/.test(name)) {
				if (listInner) return `ReplyEntity<${listInner}[]>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					// 只有当内部类型确实是包装类型时才进行特殊处理
					const prDtoInner = this.extractGenericInnerForTypes(innerName, 'PageResultDTO');
					if (prDtoInner) {
						return `ReplyEntity<PageResult<${prDtoInner}[]>>`;
					}
					const prInner = this.extractGenericInnerForTypes(innerName, 'PageResult');
					if (prInner) {
						return `ReplyEntity<PageResult<${prInner}>>`;
					}
					// 添加对 Page<T> 类型的处理
					const pageInner = this.extractGenericInnerForTypes(innerName, 'Page');
					if (pageInner) {
						return `ReplyEntity<Page<${pageInner}>>`;
					}
					const basePageInner = this.extractGenericInnerForTypes(innerName, 'BasePageRespDTO');
					if (basePageInner) {
						return `ReplyEntity<BasePageRespDTO<${basePageInner}>>`;
					}
					// 对于其他类型（包括以List开头但不是List包装的类型），直接使用
					const t = this.tsTypeFromSchemaForTypes({ $ref: data.$ref });
					return `ReplyEntity<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = this.tsTypeFromSchemaForTypes(itemSchema);
					return `ReplyEntity<${itemTs}[]>`;
				}
				if (data?.type) {
					const t = this.mapPrimitiveType(data.type, data.format);
					return `ReplyEntity<${t}>`;
				}
				return `ReplyEntity<void>`;
			}
			// Page.*RespDTO 模式处理
			const pageRespMatch = name.match(/^Page(.+)RespDTO$/);
			if (pageRespMatch) {
				const innerType = this.normalizeInnerTypeForTypes(pageRespMatch[1]);
				return `PageResult<${innerType}[]>`;
			}
			// Fallback to direct type reference
			return this.tsTypeFromSchemaForTypes(schema);
		}
		if (schema.type === 'array') {
			const itemTs = this.tsTypeFromSchemaForTypes(schema.items || { type: 'any' });
			return `${itemTs}[]`;
		}
		if (schema.type) {
			return this.mapPrimitiveType(schema.type, schema.format);
		}
		return 'any';
	}

	private static resolveRequestTypeForTypes(spec: any, api: any): string {
		if (!api?.parameters || !Array.isArray(api.parameters)) {
			return 'any';
		}

		const bodyParam = api.parameters.find((p: any) => p.in === 'body');
		if (!bodyParam?.schema) {
			return 'any';
		}

		return this.tsTypeFromSchemaForTypes(bodyParam.schema);
	}

	private static tsTypeFromSchemaForTypes(sch: any, expandRef = false): string {
		if (!sch) return 'any';
		if (sch.$ref) {
			const name = this.refName(sch.$ref);
			if (!name) return 'any';
			const cleanName = this.cleanGenericSymbols(name);
			return cleanName; // 在 types.ts 内部，直接使用类型名，不加 Types. 前缀
		}
		if (sch.type === 'array') {
			const itemTs = this.tsTypeFromSchemaForTypes(sch.items || { type: 'any' }, expandRef);
			return `${itemTs}[]`;
		}
		// 处理枚举类型
		if (sch.enum && Array.isArray(sch.enum)) {
			const enumValues = sch.enum.map((value: any) => `"${value}"`).join(' | ');
			return enumValues;
		}
		if (sch.type) {
			return this.mapPrimitiveType(sch.type, sch.format);
		}
		return 'any';
	}

	private static resolveResponseType(spec: any, api: any): string {
		const op = spec?.paths?.[api.path]?.[String(api.method).toLowerCase()];
		if (!op) return 'any';
		const responses = op?.responses || {};
		const ok = responses['200'] || responses['201'] || responses['default'];
		const schema = ok?.schema;
		if (!schema) return 'void';
		if (schema.$ref) {
			const name = this.refName(schema.$ref) || '';
			const listInner = this.extractListInner(name);
			// Result<...>
			if (/^Result/.test(name)) {
				if (listInner) return `Types.Result<${listInner}[]>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					// 只有当内部类型确实是包装类型时才进行特殊处理
					// PageResultDTO<Inner> or PageResult<Inner>
					const prDtoInner = this.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) {
						const cleanInner = this.cleanGenericSymbols(prDtoInner);
						return `Types.Result<Types.PageResult<${cleanInner}[]>>`;
					}
					const prInner = this.extractGenericInner(innerName, 'PageResult');
					if (prInner) {
						const cleanInner = this.cleanGenericSymbols(prInner);
						return `Types.Result<Types.PageResult<${cleanInner}>>`;
					}
					// 添加对 Page<T> 类型的处理
					const pageInner = this.extractGenericInner(innerName, 'Page');
					if (pageInner) {
						const cleanInner = this.cleanGenericSymbols(pageInner);
						return `Types.Result<Types.Page<${cleanInner}>>`;
					}
					const basePageInner = this.extractGenericInner(innerName, 'BasePageRespDTO');
					if (basePageInner) {
						const cleanInner = this.cleanGenericSymbols(basePageInner);
						return `Types.Result<Types.BasePageRespDTO<${cleanInner}>>`;
					}
					// Fallback to $ref type
					const t = this.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.Result<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = this.tsTypeFromSchema(itemSchema);
					return `Types.Result<${itemTs}[]>`;
				}
				if (data?.type) {
					const t = this.mapPrimitiveType(data.type, data.format);
					return `Types.Result<${t}>`;
				}
				return `Types.Result<void>`;
			}
			// PageResultDTO<Inner>
			if (/^PageResultDTO/.test(name)) {
				const inner = this.extractGenericInner(name, 'PageResultDTO');
				if (inner) return `Types.PageResult<${inner}[]>`;
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = this.tsTypeFromSchema(items || { type: 'object' });
				// 确保数组类型格式正确
				const arrayType = itemTs.endsWith('[]') ? itemTs : `${itemTs}[]`;
				return `Types.PageResult<${arrayType}>`;
			}
			// PageResult<T>
			if (/^PageResult/.test(name)) {
				const inner = this.extractGenericInner(name, 'PageResult');
				if (inner) return `Types.PageResult<${inner}>`;
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = this.tsTypeFromSchema(items || { type: 'object' });
				// 确保数组类型格式正确
				const arrayType = itemTs.endsWith('[]') ? itemTs : `${itemTs}[]`;
				return `Types.PageResult<${arrayType}>`;
			}
			// Page.*RespDTO 模式
			if (/^Page.*RespDTO$/.test(name)) {
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = this.tsTypeFromSchema(items || { type: 'object' });
				// 确保数组类型格式正确
				const arrayType = itemTs.endsWith('[]') ? itemTs : `${itemTs}[]`;
				return `Types.PageResult<${arrayType}>`;
			}

			// BasePageRespDTO<T>
			if (/^BasePageRespDTO/.test(name)) {
				const inner = this.extractGenericInner(name, 'BasePageRespDTO');
				if (inner) return `Types.BasePageRespDTO<${inner}>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					// 对于其他类型（包括以List开头但不是List包装的类型），直接使用
					const t = this.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.BasePageRespDTO<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = this.tsTypeFromSchema(itemSchema);
					return `Types.BasePageRespDTO<${itemTs}>`;
				}
				if (data?.type) {
					if (data.type === 'object') return `Types.BasePageRespDTO<Types.PlainObject>`;
					const t = this.mapPrimitiveType(data.type, data.format);
					return `Types.BasePageRespDTO<${t}>`;
				}
				return `Types.BasePageRespDTO<void>`;
			}
			// ReplyEntity<...>
			if (/^ReplyEntity/.test(name)) {
				if (listInner) return `Types.ReplyEntity<${listInner}[]>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					// 只有当内部类型确实是包装类型时才进行特殊处理
					const prDtoInner = this.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) return `Types.ReplyEntity<Types.PageResult<${prDtoInner}[]>>`;
					const prInner = this.extractGenericInner(innerName, 'PageResult');
					if (prInner) return `Types.ReplyEntity<Types.PageResult<${prInner}>>`;
					// 添加对 Page<T> 类型的处理
					const pageInner = this.extractGenericInner(innerName, 'Page');
					if (pageInner) {
						const cleanInner = this.cleanGenericSymbols(pageInner);
						return `Types.ReplyEntity<Types.Page<${cleanInner}>>`;
					}
					const basePageInner = this.extractGenericInner(innerName, 'BasePageRespDTO');
					if (basePageInner) return `Types.ReplyEntity<Types.BasePageRespDTO<${basePageInner}>>`;
					const t = this.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.ReplyEntity<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = this.tsTypeFromSchema(itemSchema);
					return `Types.ReplyEntity<${itemTs}[]>`;
				}
				if (data?.type) {
					if (data.type === 'object') return `Types.ReplyEntity<Types.PlainObject>`;
					const t = this.mapPrimitiveType(data.type, data.format);
					return `Types.ReplyEntity<${t}>`;
				}
				return `Types.ReplyEntity<void>`;
			}
			return this.tsTypeFromSchema(schema);
		}
		return this.tsTypeFromSchema(schema);
	}

	private static refName(ref: string): string | null {
		if (!ref) return null;
		const m = ref.match(/#\/definitions\/(.+)$/);
		return m ? m[1] : null;
	}

	private static extractListInner(defName: string): string | null {
		// Generic forms: ReplyEntity«List<Foo»» / Result<List<Foo>> / PageResultDTO<List<Foo>> / PageResult<List<Foo>>
		let m = defName.match(/(?:Result|ReplyEntity|PageResult|PageResultDTO)[«<]List<([^»>]+)[»>]+/);
		if (m) return this.normalizeInnerType(m[1]);
		// Compact forms: ReplyEntityListFooDTO / ResultListBar
		m = defName.match(/^(?:Result|ReplyEntity)List([A-Za-z0-9_]+)$/);
		if (m) return this.normalizeInnerType(m[1]);
		return null;
	}

	private static extractListInnerForTypes(defName: string): string | null {
		// Generic forms: ReplyEntity«List<Foo»» / Result<List<Foo>> / PageResultDTO<List<Foo>> / PageResult<List<Foo>>
		let m = defName.match(/(?:Result|ReplyEntity|PageResult|PageResultDTO)[«<]List<([^»>]+)[»>]+/);
		if (m) return this.normalizeInnerTypeForTypes(m[1]);
		// Compact forms: ReplyEntityListFooDTO / ResultListBar
		m = defName.match(/^(?:Result|ReplyEntity)List([A-Za-z0-9_]+)$/);
		if (m) return this.normalizeInnerTypeForTypes(m[1]);
		return null;
	}

	private static extractInnerFromListName(name: string): string | null {
		// List<FooDTO> or ListFooDTO
		let m = name.match(/^List[«<]([^»>]+)[»>]+$/);
		if (m) return this.normalizeInnerType(m[1]);
		m = name.match(/^List([A-Za-z0-9_]+)$/);
		if (m) return this.normalizeInnerType(m[1]);
		// 处理 ListXXXRespDTO, ListXXXReqDTO 等模式
		m = name.match(/^List(.+(?:Resp|Req|DTO|VO))$/);
		if (m) return this.normalizeInnerType(m[1]);
		return null;
	}

	private static extractInnerFromListNameForTypes(name: string): string | null {
		// List<FooDTO> or ListFooDTO
		let m = name.match(/^List[«<]([^»>]+)[»>]+$/);
		if (m) return this.normalizeInnerTypeForTypes(m[1]);
		m = name.match(/^List([A-Za-z0-9_]+)$/);
		if (m) return this.normalizeInnerTypeForTypes(m[1]);
		// 处理 ListXXXRespDTO, ListXXXReqDTO 等模式
		m = name.match(/^List(.+(?:Resp|Req|DTO|VO))$/);
		if (m) return this.normalizeInnerTypeForTypes(m[1]);
		return null;
	}

	private static extractGenericInner(defName: string, wrapper: string): string | null {
		// Support Wrapper«Inner» or Wrapper<Inner>
		const re = new RegExp(`${wrapper}[«<]([^»>]+)[»>]+`);
		const m = defName.match(re);
		if (!m) return null;
		return this.normalizeInnerType(m[1]);
	}

	private static extractGenericInnerForTypes(defName: string, wrapper: string): string | null {
		// Support Wrapper«Inner» or Wrapper<Inner>
		const re = new RegExp(`${wrapper}[«<]([^»>]+)[»>]+`);
		const m = defName.match(re);
		if (!m) return null;
		return this.normalizeInnerTypeForTypes(m[1]);
	}

	private static normalizeInnerType(token: string): string {
		if (!token) return 'any';
		if (/^(string|number|integer|boolean)$/i.test(token)) return token.toLowerCase();
		if (/^(boolean)$/i.test(token)) return 'boolean';
		// 清理泛型符号
		const cleanToken = this.cleanGenericSymbols(token);
		return `Types.${cleanToken}`;
	}

	private static normalizeInnerTypeForTypes(token: string): string {
		if (!token) return 'any';
		if (/^(string|number|integer|boolean)$/i.test(token)) return token.toLowerCase();
		if (/^(boolean)$/i.test(token)) return 'boolean';
		// 清理泛型符号，但不添加 Types. 前缀
		return this.cleanGenericSymbols(token);
	}

	private static cleanGenericSymbols(typeName: string): string {
		if (!typeName) return typeName;
		// 将 Swagger 的 «» 符号转换为 TypeScript 的 <> 符号
		return typeName.replace(/«/g, '<').replace(/»/g, '>');
	}

	private static tsTypeFromSchema(sch: any, expandRef = false): string {
		if (!sch) return 'any';
		if (sch.$ref) {
			const name = this.refName(sch.$ref);
			if (!name) return 'any';
			const cleanName = this.cleanGenericSymbols(name);
			return expandRef ? cleanName : `Types.${cleanName}`;
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
			return this.mapPrimitiveType(sch.type, sch.format);
		}
		return 'any';
	}

	private static mapPrimitiveType(type?: string, format?: string): string {
		if (!type) return 'any';
		if (type === 'integer' || type === 'number') return 'number';
		if (type === 'long' || (type === 'integer' && format === 'int64')) return 'number';
		if (type === 'boolean') return 'boolean';
		if (type === 'string') return 'string';
		if (type === 'array') return 'any[]';
		if (type === 'object') return 'PlainObject';
		return 'any';
	}

	private static renderTypes(spec: any, selectedApis?: { [controller: string]: any[] }): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push('');
		lines.push(`import type { AxiosRequestConfig } from 'axios';`);
		lines.push('');

		// 通用泛型
		lines.push(`export interface Result<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		lines.push(`export interface PageResult<T> { pageNumber?: number; pageSize?: number; pageStart?: number; records?: T[]; totalCount?: number; }`);
		lines.push(`export interface Page<T> { current?: number; pages?: number; records?: T[]; size?: number; total?: number; }`);
		lines.push(`export interface BasePageRespDTO<T> { data?: T[]; totalCount?: number; }`);
		lines.push(`export interface ReplyEntity<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		lines.push(`export type BaseRequestDTO = { [key: string]: any }`);
		lines.push(`export type PlainObject = { [key: string]: any }`);
		lines.push('');

		// 收集被选中API使用的类型
		const usedTypes = new Set<string>();
		if (selectedApis) {
			const collectTypesFromSchema = (schema: any) => {
				if (schema?.$ref) {
					const typeName = schema.$ref.replace('#/definitions/', '');
					if (!usedTypes.has(typeName)) {
						usedTypes.add(typeName);
						// 递归收集依赖类型
						const typeDef = spec.definitions?.[typeName];
						if (typeDef) {
							if (typeDef.properties) {
								Object.values(typeDef.properties).forEach((prop: any) => collectTypesFromSchema(prop));
							}
							if (typeDef.allOf) {
								typeDef.allOf.forEach((item: any) => collectTypesFromSchema(item));
							}
							if (typeDef.items) {
								collectTypesFromSchema(typeDef.items);
							}
						}
					}
				}
				if (schema?.items) {
					collectTypesFromSchema(schema.items);
				}
				if (schema?.properties) {
					Object.values(schema.properties).forEach((prop: any) => collectTypesFromSchema(prop));
				}
			};

			// 从 spec.paths 收集类型（已经过滤的paths）
			if (spec.paths) {
				Object.values(spec.paths).forEach((pathMethods: any) => {
					Object.values(pathMethods).forEach((operation: any) => {
						// 收集请求参数类型
						if (operation.parameters) {
							operation.parameters.forEach((param: any) => {
								if (param.schema) collectTypesFromSchema(param.schema);
							});
						}
						// 收集响应类型
						if (operation.responses) {
							Object.values(operation.responses).forEach((resp: any) => {
								if (resp.schema) collectTypesFromSchema(resp.schema);
							});
						}
					});
				});
			}
		}

		for (const [name, def] of Object.entries<any>(spec.definitions || {})) {
			// 跳过包装定义：不输出到 types.ts，但保留在内存用于响应类型解析
			if (/^(Result|PageResult|Page|BasePageRespDTO|ReplyEntity|Page.*RespDTO|.*PageRespDTO)/.test(name)) continue;

			// 如果提供了selectedApis，只生成被使用的类型
			if (selectedApis && !usedTypes.has(name)) continue;

			const required = new Set<string>(def.required || []);
			const ifaceDesc = def.description || '';
			const cleanName = this.cleanGenericSymbols(name);

			if (def.type === 'object' || def.properties || def.allOf) {
				if (ifaceDesc) lines.push(`/** ${ifaceDesc} */`);
				lines.push(`export interface ${cleanName} {`);

				if (def.allOf) {
					// 简化 allOf: 合并 properties
					(def.allOf as any[]).forEach(p => {
						if (p.properties) {
							for (const [prop, sch] of Object.entries<any>(p.properties)) {
								const opt = required.has(prop) ? '' : '?';
								const note = sch.description ? ` // ${sch.description}` : '';
								lines.push(`  ${prop}${opt}: ${this.tsTypeFromSchema(sch, true)};${note}`);
							}
						}
					});
				}

				if (def.properties) {
					for (const [prop, sch] of Object.entries<any>(def.properties)) {
						const opt = required.has(prop) ? '' : '?';
						const note = sch.description ? ` // ${sch.description}` : '';
						lines.push(`  ${prop}${opt}: ${this.tsTypeFromSchema(sch, true)};${note}`);
					}
				}

				lines.push(`}`);
			} else if (def.type === 'array') {
				const itemTs = this.tsTypeFromSchema(def.items || { type: 'any' });
				lines.push(`export type ${cleanName} = ${itemTs}[];`);
			} else {
				const baseType = this.mapPrimitiveType(def.type, def.format);
				lines.push(`export type ${cleanName} = ${baseType};`);
			}
			lines.push('');
		}

		// 不再生成 GET 参数接口，参数直接内联在方法中

		// 添加 Controller 类型声明
		if (selectedApis && Object.keys(selectedApis).length > 0) {
			const sortedControllers = Object.keys(selectedApis).sort((a, b) =>
				a.localeCompare(b, "zh-CN")
			);

			for (const tag of sortedControllers) {
				const apis = selectedApis[tag];
				const clean = (tag || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
				const controllerConst = `${clean}Controller`;
				const controllerType = `${clean}ControllerType`;

				// 查找对应的tag描述
				// 需要将标准化的controller名称转换回原始的tag名称进行匹配
				let tagInfo = spec.tags?.find((t: any) => t.name === tag);

				// 如果直接匹配不到，尝试将controller名称转换为kebab-case格式匹配
				if (!tagInfo && spec.tags) {
					// 将 ApprovalOrderController 转换为 approval-order-controller
					const kebabCaseTag = tag
						.replace(/([A-Z])/g, (match, letter, index) => {
							return index === 0 ? letter.toLowerCase() : '-' + letter.toLowerCase();
						});

					tagInfo = spec.tags.find((t: any) => t.name === kebabCaseTag);
				}

				const tagDescription = tagInfo?.description;

				if (tagDescription) {
					lines.push(`/** ${tagDescription} */`);
				}
				lines.push(`export interface ${controllerType} {`);

				// 按照 operationId 排序
				const sortedApis = [...(apis || [])].sort((a, b) => {
					const aId = a.operationId || a.summary || (a.path ? a.path.split('/').pop() : '');
					const bId = b.operationId || b.summary || (b.path ? b.path.split('/').pop() : '');
					return aId.localeCompare(bId, "zh-CN");
				});

				// 用于跟踪已使用的方法名，确保唯一性
				const existingMethodNames = new Set<string>();

				sortedApis.forEach((api: any) => {
					const methodName = ApiGenerationService.toMethodName(api, existingMethodNames);
					const respType = ApiGenerationService.resolveResponseTypeForTypes(spec, api);

					// 检查是否有参数（query 或 path 参数）
					const params = api.parameters || [];
					const queryParams = params.filter((p: any) => p.in === 'query');
					const pathParams = params.filter((p: any) => p.in === 'path');
					const bodyParam = params.find((p: any) => p.in === 'body');
					const hasUrlParams = queryParams.length > 0 || pathParams.length > 0;

					// 使用接口的 summary 作为注释
					if (api.summary) {
						lines.push(`  /** ${api.summary} */`);
					}

					if (hasUrlParams) {
						// 有 URL 参数的方法（GET、DELETE 等）
						const allParams = [...pathParams, ...queryParams]; // path 参数在前，query 参数在后

						// 生成内联参数列表
						const paramList = allParams.map((p: any) => {
							const optional = (p.in === 'path' || p.required) ? '' : '?'; // path 参数必须，query 参数看 required
							// 优先使用 schema，如果没有则使用 type 和 format
							const paramType = p.schema ?
								this.tsTypeFromSchemaForTypes(p.schema, true) :
								this.mapPrimitiveType(p.type || 'string', p.format);
							return `${p.name}${optional}: ${paramType}`;
						});

						const argList = paramList.join(', ');
						const axiosParam = argList ? ', axiosConfig?: AxiosRequestConfig' : 'axiosConfig?: AxiosRequestConfig';
						lines.push(`  ${methodName}(${argList}${axiosParam}): Promise<${respType}>;`);
					} else if (bodyParam) {
						// 有 body 参数的方法（POST、PUT 等）
						const reqType = ApiGenerationService.resolveRequestTypeForTypes(spec, api);
						lines.push(`  ${methodName}(req: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}>;`);
					} else {
						// 没有参数的方法
						lines.push(`  ${methodName}(axiosConfig?: AxiosRequestConfig): Promise<${respType}>;`);
					}
				});

				lines.push(`}`);
				lines.push('');
			}
		}

		return lines.join('\n');
	}


	private static renderApis(selectedApis: { [controller: string]: any[] }, spec: any): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(``);
		lines.push(`import type { AxiosRequestConfig } from 'axios';`);
		lines.push(`import $http from '../request';`);
		lines.push(`import * as Types from './types';`);
		lines.push(``);

		// 设置 basePath
		const basePath = (spec?.basePath && spec.basePath !== '/') ? spec.basePath : '';
		lines.push(`const basePath = '${basePath}';`);
		lines.push('');

		// 用于跟踪已使用的方法名，确保唯一性
		const existingMethodNames = new Set<string>();

		// 按照预览页面的排序方式：按首字母排序 (支持中文)
		const sortedControllers = Object.keys(selectedApis).sort((a, b) =>
			a.localeCompare(b, "zh-CN")
		);

		for (const tag of sortedControllers) {
			const apis = selectedApis[tag];
			const clean = (tag || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
			const controllerConst = `${clean}Controller`;
			const controllerType = `${clean}ControllerType`;
			lines.push(`export const ${controllerConst}: Types.${controllerType} = {`);

			// 按照 operationId 排序
			const sortedApis = [...(apis || [])].sort((a, b) => {
				// 获取接口的operationId、summary或path最后一段作为排序依据
				const aId = a.operationId || a.summary || (a.path ? a.path.split('/').pop() : '');
				const bId = b.operationId || b.summary || (b.path ? b.path.split('/').pop() : '');
				return aId.localeCompare(bId, "zh-CN");
			});

			sortedApis.forEach((api: any) => {
				const methodName = ApiGenerationService.toMethodName(api, existingMethodNames);
				const method = String(api.method).toLowerCase();
				const respType = ApiGenerationService.resolveResponseType(spec, api);
				const pathExpr = '${basePath}' + String(api.path);

				// 检查是否有参数（query 或 path 参数）
				const params = api.parameters || [];
				const queryParams = params.filter((p: any) => p.in === 'query');
				const pathParams = params.filter((p: any) => p.in === 'path');
				const bodyParam = params.find((p: any) => p.in === 'body');
				const hasUrlParams = queryParams.length > 0 || pathParams.length > 0;

				if (hasUrlParams) {
					// 有 URL 参数的方法（GET、DELETE 等）
					const allParams = [...pathParams, ...queryParams]; // path 参数在前，query 参数在后

					// 生成内联参数列表
					const paramList = allParams.map((p: any) => {
						const optional = (p.in === 'path' || p.required) ? '' : '?'; // path 参数必须，query 参数看 required
						// 优先使用 schema，如果没有则使用 type 和 format
						const paramType = p.schema ?
							this.tsTypeFromSchema(p.schema, true) :
							this.mapPrimitiveType(p.type || 'string', p.format);
						return `${p.name}${optional}: ${paramType}`;
					});

					const argList = paramList.join(', ');
					const payloadObj = queryParams.length > 0 ?
						`{ ${queryParams.map((p: any) => p.name).join(', ')} }` :
						`{}`;

					lines.push(`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
					lines.push(`    const path = \`${pathExpr}\`;`);
					lines.push(`    const payload: Types.BaseRequestDTO = ${payloadObj};`);
					lines.push(`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`);
					lines.push(`    return ret;`);
					lines.push(`  },`);
				} else if (bodyParam) {
					// 有 body 参数的方法（POST、PUT 等）
					const reqType = ApiGenerationService.resolveRequestType(spec, api);
					lines.push(`  async ${methodName}(req: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
					lines.push(`    const path = \`${pathExpr}\`;`);
					lines.push(`    const payload: ${reqType} = req;`);
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
}
