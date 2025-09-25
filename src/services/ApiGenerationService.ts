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

			// 提取控制器和对应的方法
			const controllerRegex = /export const (\w+Controller) = \{([\s\S]*?)\n\};\s*$/gm;
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

			// 5. 解析 get 参数（到interface）
			const getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }> = {};
			Object.entries(filteredPaths).forEach(([pathStr, methods]) => {
				Object.entries<any>(methods).forEach(([method, operation]) => {
					if (method.toLowerCase() === 'get') {
						const iface = ApiGenerationService.paramInterfaceName({ path: pathStr, method, ...operation });
						const fields: { name: string; type: string; required: boolean; desc?: string }[] = [];

						// Query 参数
						const queryParams = (operation.parameters || []).filter((p: any) => p.in === 'query');
						queryParams.forEach((p: any) => {
							const tsType = this.mapPrimitiveType(p.type || p.schema?.type || 'any', p.format);
							fields.push({
								name: p.name,
								type: tsType,
								required: p.required || false,
								desc: p.description
							});
						});

						// Path 参数
						const pathParams = (operation.parameters || []).filter((p: any) => p.in === 'path');
						pathParams.forEach((p: any) => {
							const tsType = this.mapPrimitiveType(p.type || p.schema?.type || 'any', p.format);
							fields.push({
								name: p.name,
								type: tsType,
								required: true, // path 参数都是必须的
								desc: p.description
							});
						});

						getParamInterfaces[iface] = {
							fields,
							desc: operation.summary || operation.description
						};
					}
				});
			});

			// 6. 生成 types.ts（完整重建）
			const typesPath = path.join(docDir, "types.ts");
			const typesContent = ApiGenerationService.renderTypes(spec, getParamInterfaces);
			fs.writeFileSync(typesPath, typesContent, "utf-8");

			// 7. 生成 apis.ts（使用合并后的数据完整重建）
			const apisPath = path.join(docDir, "apis.ts");
			const apisContent = ApiGenerationService.renderApis(mergedApiData, spec, getParamInterfaces);
			fs.writeFileSync(apisPath, apisContent, "utf-8");

			// 8. 写 index.ts
			const indexPath = path.join(docDir, "index.ts");
			fs.writeFileSync(indexPath, `export * from './types';\nexport * from './apis';\n`, "utf-8");

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
					const listFromInner = this.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.Result<${listFromInner}[]>`;
					// PageResultDTO<Inner> or PageResult<Inner>
					const prDtoInner = this.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) return `Types.Result<Types.PageResult<${prDtoInner}[]>>`;
					const prInner = this.extractGenericInner(innerName, 'PageResult');
					if (prInner) return `Types.Result<Types.PageResult<${prInner}>>`;
					const basePageInner = this.extractGenericInner(innerName, 'BasePageRespDTO');
					if (basePageInner) return `Types.Result<Types.BasePageRespDTO<${basePageInner}>>`;
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
				return `Types.PageResult<${itemTs}>`;
			}
			// PageResult<T>
			if (/^PageResult/.test(name)) {
				const inner = this.extractGenericInner(name, 'PageResult');
				if (inner) return `Types.PageResult<${inner}>`;
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = this.tsTypeFromSchema(items || { type: 'object' });
				return `Types.PageResult<${itemTs}>`;
			}

			// BasePageRespDTO<T>
			if (/^BasePageRespDTO/.test(name)) {
				const inner = this.extractGenericInner(name, 'BasePageRespDTO');
				if (inner) return `Types.BasePageRespDTO<${inner}>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = this.refName(data.$ref) || '';
					const listFromInner = this.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.BasePageRespDTO<${listFromInner}>`;
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
					const listFromInner = this.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.ReplyEntity<${listFromInner}[]>`;
					const prDtoInner = this.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) return `Types.ReplyEntity<Types.PageResult<${prDtoInner}[]>>`;
					const prInner = this.extractGenericInner(innerName, 'PageResult');
					if (prInner) return `Types.ReplyEntity<Types.PageResult<${prInner}>>`;
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

	private static extractInnerFromListName(name: string): string | null {
		// List<FooDTO> or ListFooDTO
		let m = name.match(/^List[«<]([^»>]+)[»>]+$/);
		if (m) return this.normalizeInnerType(m[1]);
		m = name.match(/^List([A-Za-z0-9_]+)$/);
		if (m) return this.normalizeInnerType(m[1]);
		return null;
	}

	private static extractGenericInner(defName: string, wrapper: string): string | null {
		// Support Wrapper«Inner» or Wrapper<Inner>
		const re = new RegExp(`${wrapper}[«<]([^»>]+)[»>]+`);
		const m = defName.match(re);
		if (!m) return null;
		return this.normalizeInnerType(m[1]);
	}

	private static normalizeInnerType(token: string): string {
		if (!token) return 'any';
		if (/^(string|number|integer|boolean)$/i.test(token)) return token.toLowerCase();
		if (/^(boolean)$/i.test(token)) return 'boolean';
		return `Types.${token}`;
	}

	private static tsTypeFromSchema(sch: any, expandRef = false): string {
		if (!sch) return 'any';
		if (sch.$ref) {
			const name = this.refName(sch.$ref);
			if (!name) return 'any';
			return expandRef ? name : `Types.${name}`;
		}
		if (sch.type === 'array') {
			const itemTs = this.tsTypeFromSchema(sch.items || { type: 'any' }, expandRef);
			return `${itemTs}[]`;
		}
		if (sch.type) {
			return this.mapPrimitiveType(sch.type, sch.format);
		}
		return 'any';
	}

	private static mapPrimitiveType(type?: string, format?: string): string {
		if (!type) return 'any';
		if (type === 'integer' || type === 'number') return 'number';
		if (type === 'boolean') return 'boolean';
		if (type === 'string') return 'string';
		if (type === 'array') return 'any[]';
		if (type === 'object') return '{ [key: string]: any }';
		return 'any';
	}

	private static renderTypes(spec: any, getParamInterfaces: Record<string, any>): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(`// @ts-nocheck`);
		lines.push(`// This file is auto-generated by va-swagger-to-api plugin`);
		lines.push('');

		// 通用泛型
		lines.push(`export interface Result<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		lines.push(`export interface PageResult<T> { total?: number; pageNo?: number; pageNum?: number; pageSize?: number; list?: T[]; records?: T[]; rows?: T[]; data?: T[]; }`);
		lines.push(`export interface BasePageRespDTO<T> { data?: T[]; totalCount?: number; }`);
		lines.push(`export interface ReplyEntity<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		lines.push(`export type BaseRequestDTO = { [key: string]: any }`);
		lines.push(`export type PlainObject = { [key: string]: any }`);
		lines.push('');

		for (const [name, def] of Object.entries<any>(spec.definitions || {})) {
			// 跳过包装定义：不输出到 types.ts，但保留在内存用于响应类型解析
			if (/^(Result|PageResult|BasePageRespDTO|ReplyEntity)/.test(name)) continue;

			const required = new Set<string>(def.required || []);
			const ifaceDesc = def.description || '';

			if (def.type === 'object' || def.properties || def.allOf) {
				if (ifaceDesc) lines.push(`/** ${ifaceDesc} */`);
				lines.push(`export interface ${name} {`);

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
				lines.push(`export type ${name} = ${itemTs}[];`);
			} else {
				const baseType = this.mapPrimitiveType(def.type, def.format);
				lines.push(`export type ${name} = ${baseType};`);
			}
			lines.push('');
		}

		// 添加 GET 参数接口
		Object.entries(getParamInterfaces).forEach(([ifaceName, meta]) => {
			lines.push(`export interface ${ifaceName} {`);
			meta.fields.forEach((field: any) => {
				const optional = field.required ? '' : '?';
				const comment = field.desc ? ` // ${field.desc}` : '';
				lines.push(`  ${field.name}${optional}: ${field.type};${comment}`);
			});
			lines.push(`}`);
			lines.push('');
		});

		return lines.join('\n');
	}


	private static renderApis(selectedApis: { [controller: string]: any[] }, spec: any, getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }>): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(`// @ts-nocheck`);
		lines.push(`// This file is auto-generated by va-swagger-to-api plugin`);
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
			lines.push(`export const ${controllerConst} = {`);

			// 按照 operationId 排序
			const sortedApis = [...(apis || [])].sort((a, b) => {
				// 获取接口的operationId、summary或path最后一段作为排序依据
				const aId = a.operationId || a.summary || (a.path ? a.path.split('/').pop() : '');
				const bId = b.operationId || b.summary || (b.path ? b.path.split('/').pop() : '');
				return aId.localeCompare(bId, "zh-CN");
			});

			sortedApis.forEach((api: any) => {
				const methodName = ApiGenerationService.toMethodName(api, existingMethodNames);
				const isGet = String(api.method).toLowerCase() === 'get';
				const respType = ApiGenerationService.resolveResponseType(spec, api);
				const method = String(api.method).toLowerCase();

				const pathExpr = '${basePath}' + String(api.path);

				if (isGet) {
					const iface = ApiGenerationService.paramInterfaceName(api);
					const paramsMeta = getParamInterfaces[iface];
					const argList = paramsMeta ? paramsMeta.fields.map(f => `${f.name}: ${f.type}`).join(', ') : '';
					const payloadObj = paramsMeta ? `{ ${paramsMeta.fields.map(f => f.name).join(', ')} }` : `{}`;
					lines.push(`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
					lines.push(`    const path = \`${pathExpr}\`;`);
					lines.push(`    const payload: Types.BaseRequestDTO = ${payloadObj};`);
					lines.push(`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`);
					lines.push(`    return ret;`);
					lines.push(`  },`);
				} else {
					const reqType = ApiGenerationService.resolveRequestType(spec, api);
					lines.push(`  async ${methodName}(req: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`);
					lines.push(`    const path = \`${pathExpr}\`;`);
					lines.push(`    const payload: ${reqType} = req;`);
					lines.push(`    const ret = await $http.run<${reqType}, ${respType}>(path, '${method}', payload, axiosConfig);`);
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
