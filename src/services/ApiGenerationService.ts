import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ContractService } from "./ContractService";

export class ApiGenerationService {
	/**
	 * 获取已存在的API列表
	 */
	public static async getExistingApis(workspacePath: string, docName: string): Promise<Array<{path: string, method: string}>> {
		const servicesDir = path.join(workspacePath, 'src', 'services', docName);
		const apisFilePath = path.join(servicesDir, 'apis.ts');

		if (!fs.existsSync(apisFilePath)) {
			return [];
		}

		try {
			const apisContent = fs.readFileSync(apisFilePath, 'utf-8');
			const existingApis: Array<{path: string, method: string}> = [];

			// 分步骤匹配，更可靠
			// 1. 先匹配所有的 path 定义
			const pathRegex = /const\s+path\s*=\s*`([^`]+)`;/g;
			// 2. 匹配对应的 HTTP 方法
			const httpMethodRegex = /\$http\.run[^(]*\(path,\s*'(\w+)'/g;

			const paths = [];
			const methods = [];

			// 提取所有路径
			let pathMatch;
			while ((pathMatch = pathRegex.exec(apisContent)) !== null) {
				const pathTemplate = pathMatch[1];
				const apiPath = pathTemplate.replace('${basePath}', '');
				paths.push(apiPath);
			}

			// 提取所有HTTP方法
			let methodMatch;
			while ((methodMatch = httpMethodRegex.exec(apisContent)) !== null) {
				const httpMethod = methodMatch[1].toLowerCase();
				methods.push(httpMethod);
			}

			// 配对路径和方法（假设它们是按顺序出现的）
			for (let i = 0; i < Math.min(paths.length, methods.length); i++) {
				existingApis.push({
					path: paths[i],
					method: methods[i]
				});
			}

			return existingApis;
		} catch (error) {
			console.error('Error reading existing APIs:', error);
			return [];
		}
	}

	public static async generateApiFiles(
		workspacePath: string,
		context: vscode.ExtensionContext,
		swaggerJson: any,
		selectedApis: { [controller: string]: any[] },
	): Promise<{ ok: boolean; message?: string }> {
		try {
			const docName = swaggerJson.info?.title

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

			// 1) 基于勾选接口过滤 paths
			const picked = new Set<string>();
			Object.values(selectedApis || {}).forEach(list => {
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

			// 2) 组织 v2 结构副本
			const spec: any = {
				...swaggerJson,
				paths: JSON.parse(JSON.stringify(filteredPaths)),
				definitions: { ...(swaggerJson.definitions || {}) }
			};

			// 3) 提升内联 schema 并收集使用的 definitions
			const used = new Set<string>();
			const ensureName = (tag: string, api: any, suffix: 'Req' | 'Resp') => {
				const cleaned = (tag || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ')
					.split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
				const base = ApiGenerationService.toMethodName(api);
				return `${cleaned}_${base}_${suffix}`;
			};

			for (const [tag, apis] of Object.entries<any>(selectedApis || {})) {
				(apis || []).forEach((api: any) => {
					const op = spec.paths?.[api.path]?.[String(api.method).toLowerCase()];
					if (!op) return;
					// body
					const bodyParam = Array.isArray(op.parameters) ? op.parameters.find((p: any) => p && p.in === 'body') : undefined;
					if (bodyParam?.schema && !bodyParam.schema.$ref) {
						const nm = ensureName(tag, api, 'Req');
						spec.definitions[nm] = bodyParam.schema;
						bodyParam.schema = { $ref: `#/definitions/${nm}` };
						used.add(nm);
					} else if (bodyParam?.schema?.$ref) {
						const r = ApiGenerationService.refName(bodyParam.schema.$ref); if (r) used.add(r);
					}
					// response
					const responses = op.responses || {};
					const ok = responses['200'] || responses['201'] || responses['default'];
					const sch = ok?.schema;
					if (sch && !sch.$ref) {
						const nm = ensureName(tag, api, 'Resp');
						spec.definitions[nm] = sch;
						ok.schema = { $ref: `#/definitions/${nm}` };
						used.add(nm);
					} else if (sch?.$ref) {
						const r = ApiGenerationService.refName(sch.$ref); if (r) used.add(r);
					}
				});
			}

			// 4) 递归收集依赖
			const visit = (schema: any) => {
				if (!schema) return;
				if (schema.$ref) {
					const nm = ApiGenerationService.refName(schema.$ref);
					if (nm && !used.has(nm)) { used.add(nm); visit(spec.definitions[nm]); }
				}
				if (schema.items) visit(schema.items);
				if (schema.allOf) schema.allOf.forEach(visit);
				if (schema.oneOf) schema.oneOf.forEach(visit);
				if (schema.anyOf) schema.anyOf.forEach(visit);
				if (schema.properties) Object.values<any>(schema.properties).forEach(visit);
				if (schema.additionalProperties && typeof schema.additionalProperties === 'object') visit(schema.additionalProperties);
			};
			Array.from(used).forEach(nm => visit(spec.definitions[nm]));

			// 5) 裁剪 definitions（保留包装定义用于解析，但在 types.ts 渲染时跳过）
			const keptDefinitions: Record<string, any> = {};
			for (const [name, def] of Object.entries<any>(spec.definitions)) {
				if (used.has(name)) keptDefinitions[name] = def;
			}
			spec.definitions = keptDefinitions;

			// 5.1 收集 GET 参数接口
			const getParamInterfaces = ApiGenerationService.collectGetParamInterfaces(spec, selectedApis);

			// 6) 增量更新 types.ts
			const typesPath = path.join(docDir, "types.ts");
			const typesContent = ApiGenerationService.renderTypesIncremental(spec, getParamInterfaces, typesPath);
			fs.writeFileSync(typesPath, typesContent, "utf-8");

			// 7) 增量更新 apis.ts
			const apisPath = path.join(docDir, "apis.ts");
			const apisContent = ApiGenerationService.renderApisIncremental(selectedApis, spec, getParamInterfaces, apisPath);
			fs.writeFileSync(apisPath, apisContent, "utf-8");

			// 8) 写 index.ts
			const indexPath = path.join(docDir, "index.ts");
			fs.writeFileSync(indexPath, `export * from './types';\nexport * from './apis';\n`, "utf-8");

			vscode.window.showInformationMessage(`API已生成于: ${docDir}`);
			return { ok: true };
		} catch (error) {
			const msg = `Failed to generate API files: ${error instanceof Error ? error.message : String(error)}`;
			vscode.window.showErrorMessage(msg);
			return { ok: false, message: msg };
		}
	}

	private static toMethodName(api: any): string {
		if (api?.operationId) {
			let opId = String(api.operationId);
			// capture base and optional numeric suffix, remove Using<VERB>
			const m = opId.match(/^(.*)Using(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)(_(\d+))?$/i);
			let base = opId;
			let suffix = '';
			if (m) {
				base = m[1];
				suffix = m[4] ? m[4] : '';
			}
			// collapse non-alphanumeric to spaces, then camelCase
			const parts = base.replace(/[^a-zA-Z0-9]/g, ' ').split(/\s+/).filter(Boolean);
			if (parts.length === 0) return suffix ? `operation${suffix}` : 'operation';
			const camel = parts[0].charAt(0).toLowerCase() + parts[0].slice(1) + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
			return suffix ? `${camel}${suffix}` : camel;
		}
		const method = String(api?.method || 'get').toLowerCase();
		const parts = String(api?.path || '').replace(/\{.*?\}/g, '').split('/').filter(Boolean).map((s: string) => s.replace(/[^a-zA-Z0-9]/g, ''));
		const base = parts.length ? parts[parts.length - 1] : 'operation';
		return `${method}${base[0] ? base[0].toUpperCase() + base.slice(1) : ''}`;
	}

	private static paramInterfaceName(api: any): string {
		const base = ApiGenerationService.toMethodName(api);
		return `${base[0].toUpperCase()}${base.slice(1)}Params`;
	}

	private static refName(ref: string | undefined): string | undefined {
		if (!ref) return undefined;
		const m = ref.match(/#\/(?:components\/schemas|definitions)\/(.+)$/);
		return m ? m[1] : undefined;
	}

	private static tsTypeFromSchema(schema: any, inTypesFile = false): string {
		if (!schema) return 'any';
		if (schema.$ref) {
			const nm = ApiGenerationService.refName(schema.$ref);
			return inTypesFile ? `${nm}` : `Types.${nm}`;
		}
		if (schema.type === 'array') return `${ApiGenerationService.tsTypeFromSchema(schema.items, inTypesFile)}[]`;
		if (schema.type === 'integer' || schema.type === 'number') return 'number';
		if (schema.type === 'boolean') return 'boolean';
		if (schema.type === 'string') return 'string';
		if (schema.type === 'object') return inTypesFile ? 'PlainObject' : 'Types.PlainObject';
		return 'any';
	}

	private static renderTypes(spec: any, getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }>): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(`// @ts-nocheck`);
		lines.push(`// This file is auto-generated by va-swagger-to-api plugin\n`);
		// 通用泛型
		lines.push(`export interface Result<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		lines.push(`export interface PageResult<T> { total?: number; pageNo?: number; pageNum?: number; pageSize?: number; list?: T[]; records?: T[]; rows?: T[]; data?: T[]; }`);
		lines.push(`export interface BasePageRespDTO<T> { data?: T[]; totalCount?: number; }`);
		lines.push(`export interface ReplyEntity<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
		// BaseRequestDTO for GET payload
		lines.push(`export type BaseRequestDTO = { [key: string]: any }`);
		// Unified object instance for response payloads
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
								lines.push(`  ${prop}${opt}: ${ApiGenerationService.tsTypeFromSchema(sch, true)};${note}`);
							}
						}
					});
				}
				if (def.properties) {
					for (const [prop, sch] of Object.entries<any>(def.properties)) {
						const opt = required.has(prop) ? '' : '?';
						const note = sch.description ? ` // ${sch.description}` : '';
						lines.push(`  ${prop}${opt}: ${ApiGenerationService.tsTypeFromSchema(sch, true)};${note}`);
					}
				}
				lines.push('}');
				lines.push('');
			}
		}

		// 不再渲染 GET 参数接口到 types.ts，仍在 apis.ts 中通过 BaseRequestDTO 组装参数
		return lines.join('\n');
	}

	private static collectGetParamInterfaces(spec: any, selectedApis: { [controller: string]: any[] }): Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }> {
		const map: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }> = {};
		for (const apis of Object.values<any>(selectedApis || {})) {
			(apis || []).forEach((api: any) => {
				if (String(api.method).toLowerCase() !== 'get') return;
				const op = spec.paths?.[api.path]?.[String(api.method).toLowerCase()];
				if (!op) return;
				const params = Array.isArray(op.parameters) ? op.parameters : [];
				const qp = params.filter((p: any) => p && (p.in === 'query' || p.in === 'path'));
				if (qp.length === 0) return;
				const iface = ApiGenerationService.paramInterfaceName(api);
				if (!map[iface]) map[iface] = { fields: [], desc: op.summary || op.description };
				qp.forEach((p: any) => {
					const type = p.schema ? ApiGenerationService.tsTypeFromSchema(p.schema, true) : ApiGenerationService.mapPrimitiveType(p.type, p.format);
					map[iface].fields.push({ name: p.name || 'param', type, required: !!p.required, desc: p.description });
				});
			});
		}
		return map;
	}

	private static resolveRequestType(spec: any, api: any): string {
		const op = spec?.paths?.[api.path]?.[String(api.method).toLowerCase()];
		if (!op) return 'void';

		const params: any[] = Array.isArray(op.parameters) ? op.parameters : [];
		const queryPath = params.filter(p => p && (p.in === 'query' || p.in === 'path'));
		const hasQueryPath = queryPath.length > 0;

		if (String(api.method).toLowerCase() === 'get') {
			if (hasQueryPath) {
				return ApiGenerationService.paramInterfaceName(api);
			}
			return 'void';
		}

		// non-GET: prefer body when available; else use query/path object
		const bodyParam = params.find((p: any) => p && p.in === 'body');
		if (bodyParam?.schema) {
			return ApiGenerationService.tsTypeFromSchema(bodyParam.schema).replace(/^Types\./, 'Types.');
		}
		if (hasQueryPath) {
			return `{ ${queryPath.map(p => `${p.name || 'param'}${p.required ? '' : '?'}: ${p.schema ? ApiGenerationService.tsTypeFromSchema(p.schema) : ApiGenerationService.mapPrimitiveType(p.type, p.format)}`).join('; ')} }`;
		}
		return 'void';
	}

	private static normalizeInnerType(inner: string): string {
		const token = inner.trim();
		if (/^(string)$/i.test(token)) return 'string';
		if (/^(integer|number)$/i.test(token)) return 'number';
		if (/^(boolean)$/i.test(token)) return 'boolean';
		return `Types.${token}`;
	}

	private static extractListInner(defName: string): string | null {
		// Generic forms: ReplyEntity«List<Foo»» / Result<List<Foo>> / PageResultDTO<List<Foo>> / PageResult<List<Foo>>
		let m = defName.match(/(?:Result|ReplyEntity|PageResult|PageResultDTO)[«<]List<([^»>]+)[»>]+/);
		if (m) return ApiGenerationService.normalizeInnerType(m[1]);
		// Compact forms: ReplyEntityListFooDTO / ResultListBar
		m = defName.match(/^(?:Result|ReplyEntity)List([A-Za-z0-9_]+)$/);
		if (m) return ApiGenerationService.normalizeInnerType(m[1]);
		return null;
	}

	private static extractInnerFromListName(name: string): string | null {
		// List<FooDTO> or ListFooDTO
		let m = name.match(/^List[«<]([^»>]+)[»>]+$/);
		if (m) return ApiGenerationService.normalizeInnerType(m[1]);
		m = name.match(/^List([A-Za-z0-9_]+)$/);
		if (m) return ApiGenerationService.normalizeInnerType(m[1]);
		return null;
	}

	private static extractGenericInner(defName: string, wrapper: string): string | null {
		// Support Wrapper«Inner» or Wrapper<Inner>
		const re = new RegExp(`${wrapper}[«<]([^»>]+)[»>]+`);
		const m = defName.match(re);
		if (!m) return null;
		return ApiGenerationService.normalizeInnerType(m[1]);
	}

	private static resolveResponseType(spec: any, api: any): string {
		const op = spec?.paths?.[api.path]?.[String(api.method).toLowerCase()];
		if (!op) return 'any';
		const responses = op?.responses || {};
		const ok = responses['200'] || responses['201'] || responses['default'];
		const schema = ok?.schema;
		if (!schema) return 'void';
		if (schema.$ref) {
			const name = ApiGenerationService.refName(schema.$ref) || '';
			const listInner = ApiGenerationService.extractListInner(name);
			// Result<...>
			if (/^Result/.test(name)) {
				if (listInner) return `Types.Result<${listInner}[]>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = ApiGenerationService.refName(data.$ref) || '';
					const listFromInner = ApiGenerationService.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.Result<${listFromInner}[]>`;
					// PageResultDTO<Inner> or PageResult<Inner>
					const prDtoInner = ApiGenerationService.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) return `Types.Result<Types.PageResult<${prDtoInner}[]>>`;
					const prInner = ApiGenerationService.extractGenericInner(innerName, 'PageResult');
					if (prInner) return `Types.Result<Types.PageResult<${prInner}>>`;
					const basePageInner = ApiGenerationService.extractGenericInner(innerName, 'BasePageRespDTO');
					if (basePageInner) return `Types.Result<Types.BasePageRespDTO<${basePageInner}>>`;
					// Fallback to $ref type
					const t = ApiGenerationService.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.Result<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = ApiGenerationService.tsTypeFromSchema(itemSchema);
					return `Types.Result<${itemTs}[]>`;
				}
				if (data?.type) {
					const t = ApiGenerationService.mapPrimitiveType(data.type, data.format);
					return `Types.Result<${t}>`;
				}
				return `Types.Result<void>`;
			}
			// PageResultDTO<Inner>
			if (/^PageResultDTO/.test(name)) {
				const inner = ApiGenerationService.extractGenericInner(name, 'PageResultDTO');
				if (inner) return `Types.PageResult<${inner}[]>`;
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = ApiGenerationService.tsTypeFromSchema(items || { type: 'object' });
				return `Types.PageResult<${itemTs}>`;
			}
			// PageResult<T>
			if (/^PageResult/.test(name)) {
				const inner = ApiGenerationService.extractGenericInner(name, 'PageResult');
				if (inner) return `Types.PageResult<${inner}>`;
				const def = spec.definitions?.[name];
				const coll = def?.properties?.records || def?.properties?.list || def?.properties?.rows || def?.properties?.data;
				const items = coll?.items;
				const itemTs = ApiGenerationService.tsTypeFromSchema(items || { type: 'object' });
				return `Types.PageResult<${itemTs}>`;
			}

			// BasePageRespDTO<T>
			if (/^BasePageRespDTO/.test(name)) {
				const inner = ApiGenerationService.extractGenericInner(name, 'BasePageRespDTO');
				if (inner) return `Types.BasePageRespDTO<${inner}>`;
				const def = spec.definitions?.[name];
				const data = def?.properties?.data;
				if (data?.$ref) {
					const innerName = ApiGenerationService.refName(data.$ref) || '';
					const listFromInner = ApiGenerationService.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.BasePageRespDTO<${listFromInner}>`;
					const t = ApiGenerationService.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.BasePageRespDTO<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = ApiGenerationService.tsTypeFromSchema(itemSchema);
					return `Types.BasePageRespDTO<${itemTs}>`;
				}
				if (data?.type) {
					if (data.type === 'object') return `Types.BasePageRespDTO<Types.PlainObject>`;
					const t = ApiGenerationService.mapPrimitiveType(data.type, data.format);
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
					const innerName = ApiGenerationService.refName(data.$ref) || '';
					const listFromInner = ApiGenerationService.extractInnerFromListName(innerName);
					if (listFromInner) return `Types.ReplyEntity<${listFromInner}[]>`;
					const prDtoInner = ApiGenerationService.extractGenericInner(innerName, 'PageResultDTO');
					if (prDtoInner) return `Types.ReplyEntity<Types.PageResult<${prDtoInner}[]>>`;
					const prInner = ApiGenerationService.extractGenericInner(innerName, 'PageResult');
					if (prInner) return `Types.ReplyEntity<Types.PageResult<${prInner}>>`;
					const basePageInner = ApiGenerationService.extractGenericInner(innerName, 'BasePageRespDTO');
					if (basePageInner) return `Types.ReplyEntity<Types.BasePageRespDTO<${basePageInner}>>`;
					const t = ApiGenerationService.tsTypeFromSchema({ $ref: data.$ref });
					return `Types.ReplyEntity<${t}>`;
				}
				if (data?.type === 'array') {
					const itemSchema = data.items || { type: 'any' };
					const itemTs = ApiGenerationService.tsTypeFromSchema(itemSchema);
					return `Types.ReplyEntity<${itemTs}[]>`;
				}
				if (data?.type) {
					if (data.type === 'object') return `Types.ReplyEntity<Types.PlainObject>`;
					const t = ApiGenerationService.mapPrimitiveType(data.type, data.format);
					return `Types.ReplyEntity<${t}>`;
				}
				return `Types.ReplyEntity<void>`;
			}
			return ApiGenerationService.tsTypeFromSchema(schema);
		}
		return ApiGenerationService.tsTypeFromSchema(schema);
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

	private static renderApis(selectedApis: { [controller: string]: any[] }, spec: any, getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }>): string {
		const lines: string[] = [];
		lines.push(`/* eslint-disable */`);
		lines.push(`// @ts-nocheck`);
		lines.push(`// This file is auto-generated by va-swagger-to-api plugin`);
		lines.push(``);
		lines.push(`import type { AxiosRequestConfig } from 'axios';`);
		lines.push(`import $http from '../request';`);
		lines.push(`import * as Types from './types';`);
		lines.push('');

		// 从 swagger JSON 中获取 basePath
		const swaggerBasePath = spec.basePath || '/';
		const basePath = swaggerBasePath === '/' ? '' : swaggerBasePath;
		lines.push(`const basePath = '${basePath}';`);
		lines.push('');

		const controllerNames: string[] = [];
		for (const [tag, apis] of Object.entries<any>(selectedApis || {})) {
			const clean = (tag || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
			const controllerConst = `${clean}Controller`;
			controllerNames.push(controllerConst);
			lines.push(`export const ${controllerConst} = {`);
			(apis || []).forEach((api: any) => {
				const methodName = ApiGenerationService.toMethodName(api);
				const isGet = String(api.method).toLowerCase() === 'get';
				const respType = ApiGenerationService.resolveResponseType(spec, api);
				const method = String(api.method || 'get').toUpperCase();
				const pathExpr = '${basePath}' + String(api.path);

				if (isGet) {
					const iface = ApiGenerationService.paramInterfaceName(api);
					const paramsMeta = getParamInterfaces[iface];
					const argList = paramsMeta ? paramsMeta.fields.map(f => `${f.name}: ${f.type}`).join(', ') : '';
					const payloadObj = paramsMeta ? `{ ${paramsMeta.fields.map(f => f.name).join(', ')} }` : `{}`;
					lines.push(
						`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`,
						`    const path = \`${pathExpr}\`;`,
						`    const payload: Types.BaseRequestDTO = ${payloadObj};`,
						`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`,
						`    return ret;`,
						`  },`
					);
				} else {
					const reqType = ApiGenerationService.resolveRequestType(spec, api);
					lines.push(
						`  async ${methodName}(req: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`,
						`    const path = \`${pathExpr}\`;`,
						`    const payload: ${reqType} = req;`,
						`    const ret = await $http.run<${reqType}, ${respType}>(path, '${method}', payload, axiosConfig);`,
						`    return ret;`,
						`  },`
					);
				}
			});
			lines.push('};', '');
		}
		return lines.join('\n');
	}

	private static renderTypesIncremental(spec: any, getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }>, typesPath: string): string {
		// 读取现有文件内容
		let existingTypes = new Map<string, { content: string; startLine: number; endLine: number }>();
		let existingContent = "";
		if (fs.existsSync(typesPath)) {
			existingContent = fs.readFileSync(typesPath, "utf-8");
			const lines = existingContent.split('\n');

			// 解析现有的接口定义，记录位置和内容
			let currentType: string | null = null;
			let startLine = 0;
			let typeLines: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const interfaceMatch = line.match(/export\s+(?:interface|type)\s+(\w+)/);

				if (interfaceMatch) {
					// 保存前一个类型
					if (currentType && typeLines.length > 0) {
						existingTypes.set(currentType, {
							content: typeLines.join('\n'),
							startLine,
							endLine: i - 1
						});
					}

					// 开始新类型
					currentType = interfaceMatch[1];
					startLine = i;
					typeLines = [line];
				} else if (currentType && line.trim() === '}') {
					// 类型定义结束
					typeLines.push(line);
					existingTypes.set(currentType, {
						content: typeLines.join('\n'),
						startLine,
						endLine: i
					});
					currentType = null;
					typeLines = [];
				} else if (currentType) {
					typeLines.push(line);
				}
			}
		}

		const lines: string[] = [];

		// 如果文件不存在，添加头部注释和通用泛型
		if (!existingContent) {
			lines.push(`/* eslint-disable */`);
			lines.push(`// @ts-nocheck`);
			lines.push(`// This file is auto-generated by va-swagger-to-api plugin\n`);
			lines.push(`export interface Result<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
			lines.push(`export interface PageResult<T> { total?: number; pageNo?: number; pageNum?: number; pageSize?: number; list?: T[]; records?: T[]; rows?: T[]; data?: T[]; }`);
			lines.push(`export interface BasePageRespDTO<T> { data?: T[]; totalCount?: number; }`);
			lines.push(`export interface ReplyEntity<T> { code?: string; data?: T; message?: string; success?: boolean; }`);
			lines.push(`export type BaseRequestDTO = { [key: string]: any }`);
			lines.push(`export type PlainObject = { [key: string]: any }`);
			lines.push('');
		} else {
			// 保留现有内容，但移除旧的注释，重新添加规范的注释
			const contentWithoutComments = existingContent
				.replace(/\/\* eslint-disable \*\/\n/g, '')
				.replace(/\/\/ @ts-nocheck\n/g, '')
				.replace(/\/\/ This file is auto-generated by va-swagger-to-api plugin\n/g, '')
				.replace(/\/\/ Auto-generated by self generator\n/g, '')
				.replace(/^\n+/, ''); // 移除开头的空行

			// 添加规范的头部注释
			lines.push(`/* eslint-disable */`);
			lines.push(`// @ts-nocheck`);
			lines.push(`// This file is auto-generated by va-swagger-to-api plugin\n`);
			lines.push(contentWithoutComments);
		}

		// 添加或更新类型定义
		for (const [name, def] of Object.entries<any>(spec.definitions || {})) {
			// 跳过包装定义
			if (/^(Result|PageResult|BasePageRespDTO|ReplyEntity)/.test(name)) continue;

			const required = new Set<string>(def.required || []);
			const ifaceDesc = def.description || '';

			// 生成新的类型定义内容
			let newTypeContent = '';
			if (ifaceDesc) newTypeContent += `/** ${ifaceDesc} */\n`;
			newTypeContent += `export interface ${name} {\n`;

			if (def.allOf) {
				// 简化 allOf: 合并 properties
				(def.allOf as any[]).forEach(p => {
					if (p.properties) {
						for (const [prop, sch] of Object.entries<any>(p.properties)) {
							const opt = required.has(prop) ? '' : '?';
							const note = sch.description ? ` // ${sch.description}` : '';
							newTypeContent += `  ${prop}${opt}: ${ApiGenerationService.tsTypeFromSchema(sch, true)};${note}\n`;
						}
					}
				});
			}
			if (def.properties) {
				for (const [prop, sch] of Object.entries<any>(def.properties)) {
					const opt = required.has(prop) ? '' : '?';
					const note = sch.description ? ` // ${sch.description}` : '';
					newTypeContent += `  ${prop}${opt}: ${ApiGenerationService.tsTypeFromSchema(sch, true)};${note}\n`;
				}
			}
			newTypeContent += '}\n';

			// 检查是否需要更新现有类型
			const existingType = existingTypes.get(name);
			if (existingType && existingType.content !== newTypeContent) {
				// 类型已存在但内容不同，需要更新
				lines.push(newTypeContent);
			} else if (!existingType) {
				// 新类型，直接添加
				lines.push(newTypeContent);
			}
			// 如果类型已存在且内容相同，跳过
		}

		return lines.join('\n');
	}

	private static renderApisIncremental(selectedApis: { [controller: string]: any[] }, spec: any, getParamInterfaces: Record<string, { fields: { name: string; type: string; required: boolean; desc?: string }[]; desc?: string }>, apisPath: string): string {
		// 读取现有文件内容
		let existingControllers = new Map<string, { content: string; startLine: number; endLine: number; methods: Map<string, { content: string; startLine: number; endLine: number }> }>();
		let existingContent = "";
		if (fs.existsSync(apisPath)) {
			existingContent = fs.readFileSync(apisPath, "utf-8");
			const lines = existingContent.split('\n');

			// 解析现有的控制器和方法，记录位置和内容
			let currentController: string | null = null;
			let controllerMethods = new Map<string, { content: string; startLine: number; endLine: number }>();
			let currentMethod: string | null = null;
			let methodStart = 0;
			let methodLines: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const controllerMatch = line.match(/export const (\w+) = \{/);
				const methodMatch = line.match(/\s*async\s+(\w+)\s*\(/);
				const controllerEnd = line.match(/^\};?\s*$/) && currentController;

				if (controllerMatch) {
					const controllerName = controllerMatch[1];

					// 跳过serviceHandler
					if (controllerName === 'serviceHandler') {
						continue;
					}

					// 保存前一个方法到前一个控制器
					if (currentMethod && methodLines.length > 0 && currentController) {
						controllerMethods.set(currentMethod, {
							content: methodLines.join('\n'),
							startLine: methodStart,
							endLine: i - 1
						});
					}

					// 保存前一个控制器
					if (currentController) {
						existingControllers.set(currentController, {
							content: '',
							startLine: 0,
							endLine: 0,
							methods: new Map(controllerMethods) // 复制方法映射
						});
					}

					// 开始新控制器
					currentController = controllerName;
					controllerMethods = new Map(); // 重置方法映射
					currentMethod = null;
					methodLines = [];
				} else if (methodMatch && currentController) {
					// 保存前一个方法
					if (currentMethod && methodLines.length > 0) {
						controllerMethods.set(currentMethod, {
							content: methodLines.join('\n'),
							startLine: methodStart,
							endLine: i - 1
						});
					}

					// 开始新方法
					currentMethod = methodMatch[1];
					methodStart = i;
					methodLines = [line]; // 包含方法声明行
				} else if (line.trim() === '};' && currentController) {
					// 控制器结束，保存最后一个方法
					if (currentMethod && methodLines.length > 0) {
						controllerMethods.set(currentMethod, {
							content: methodLines.join('\n'),
							startLine: methodStart,
							endLine: i - 1
						});
					}

					// 保存当前控制器
					existingControllers.set(currentController, {
						content: '',
						startLine: 0,
						endLine: i,
						methods: new Map(controllerMethods)
					});

					// 重置状态
					currentController = null;
					controllerMethods = new Map();
					currentMethod = null;
					methodLines = [];
				} else if (currentController) {
					// 收集方法内容
					if (currentMethod) {
						methodLines.push(line);

						// 检查是否是方法结束（以 }, 结尾）
						if (line.trim() === '},') {
							// 方法结束，保存方法
							controllerMethods.set(currentMethod, {
								content: methodLines.join('\n'),
								startLine: methodStart,
								endLine: i
							});
							currentMethod = null;
							methodLines = [];
						}
					}
				}
			}

			// 处理文件结尾的最后一个控制器和方法
			if (currentMethod && methodLines.length > 0) {
				controllerMethods.set(currentMethod, {
					content: methodLines.join('\n'),
					startLine: methodStart,
					endLine: lines.length - 1
				});
			}
			if (currentController) {
				existingControllers.set(currentController, {
					content: '',
					startLine: 0,
					endLine: lines.length - 1,
					methods: new Map(controllerMethods)
				});
			}
		}

		const lines: string[] = [];

		// 如果文件不存在，添加导入语句
		if (!existingContent) {
			lines.push(`/* eslint-disable */`);
			lines.push(`// @ts-nocheck`);
			lines.push(`// This file is auto-generated by va-swagger-to-api plugin`);
			lines.push(``);
			lines.push(`import type { AxiosRequestConfig } from 'axios';`);
			lines.push(`import $http from '../request';`);
			lines.push(`import * as Types from './types';`);
			lines.push('');

			// 从 swagger JSON 中获取 basePath
			const swaggerBasePath = spec.basePath || '/';
			const basePath = swaggerBasePath === '/' ? '' : swaggerBasePath;
			lines.push(`const basePath = '${basePath}';`);
			lines.push('');
		} else {
			// 添加头部注释和导入语句
			lines.push(`/* eslint-disable */`);
			lines.push(`// @ts-nocheck`);
			lines.push(`// This file is auto-generated by va-swagger-to-api plugin`);
			lines.push(``);
			lines.push(`import type { AxiosRequestConfig } from 'axios';`);
			lines.push(`import $http from '../request';`);
			lines.push(`import * as Types from './types';`);
			lines.push('');

			// 从 swagger JSON 中获取 basePath
			const swaggerBasePath = spec.basePath || '/';
			const basePath = swaggerBasePath === '/' ? '' : swaggerBasePath;
			lines.push(`const basePath = '${basePath}';`);
			lines.push('');

			// 注意：不在这里添加现有内容，而是在后面按需合并控制器
		}

		const controllerNames: string[] = [];
		for (const [tag, apis] of Object.entries<any>(selectedApis || {})) {
			const clean = (tag || '').replace(/Controller$/i, '').replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(Boolean).map(s => s[0].toUpperCase() + s.slice(1)).join('');
			const controllerConst = `${clean}Controller`;
			controllerNames.push(controllerConst);

			const existingController = existingControllers.get(controllerConst);
			const existingMethods = existingController?.methods || new Map();

			// 生成新的控制器内容
			const newMethods: string[] = [];
			const updatedMethods: string[] = [];

			(apis || []).forEach((api: any) => {
				const methodName = ApiGenerationService.toMethodName(api);
				const isGet = String(api.method).toLowerCase() === 'get';
				const respType = ApiGenerationService.resolveResponseType(spec, api);
				const method = String(api.method || 'get').toUpperCase();
				const pathExpr = '${basePath}' + String(api.path);

				// 生成方法内容
				let methodContent = '';
				if (isGet) {
					const iface = ApiGenerationService.paramInterfaceName(api);
					const paramsMeta = getParamInterfaces[iface];
					const argList = paramsMeta ? paramsMeta.fields.map(f => `${f.name}: ${f.type}`).join(', ') : '';
					const payloadObj = paramsMeta ? `{ ${paramsMeta.fields.map(f => f.name).join(', ')} }` : `{}`;
					methodContent = [
						`  async ${methodName}(${argList}${argList ? ', ' : ''}axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`,
						`    const path = \`${pathExpr}\`;`,
						`    const payload: Types.BaseRequestDTO = ${payloadObj};`,
						`    const ret = await $http.run<Types.BaseRequestDTO, ${respType}>(path, '${method}', payload, axiosConfig);`,
						`    return ret;`,
						`  },`
					].join('\n');
				} else {
					const reqType = ApiGenerationService.resolveRequestType(spec, api);
					methodContent = [
						`  async ${methodName}(req: ${reqType}, axiosConfig?: AxiosRequestConfig): Promise<${respType}> {`,
						`    const path = \`${pathExpr}\`;`,
						`    const payload: ${reqType} = req;`,
						`    const ret = await $http.run<${reqType}, ${respType}>(path, '${method}', payload, axiosConfig);`,
						`    return ret;`,
						`  },`
					].join('\n');
				}

				// 检查方法是否需要更新
				const existingMethod = existingMethods.get(methodName);
				if (existingMethod && existingMethod.content !== methodContent) {
					// 方法已存在但内容不同，需要更新
					updatedMethods.push(`// 更新方法: ${methodName}`);
					updatedMethods.push(methodContent);
				} else if (!existingMethod) {
					// 新方法，直接添加
					newMethods.push(methodContent);
				}
				// 如果方法已存在且内容相同，跳过
			});

			// 生成或更新控制器内容
			if (existingController) {
				// 控制器已存在，需要合并方法
				const allMethods: string[] = [];
				const currentMethodNames = new Set<string>();

				// 首先添加所有当前勾选的方法（新的和更新的）
				if (updatedMethods.length > 0) {
					allMethods.push(`// 更新方法`);
					updatedMethods.forEach(method => {
						allMethods.push(method);
						// 提取方法名
						const match = method.match(/async\s+(\w+)\s*\(/);
						if (match) currentMethodNames.add(match[1]);
					});
				}

				if (newMethods.length > 0) {
					newMethods.forEach(method => {
						allMethods.push(method);
						// 提取方法名
						const match = method.match(/async\s+(\w+)\s*\(/);
						if (match) currentMethodNames.add(match[1]);
					});
				}

				// 然后添加所有现有的方法（除了已被更新的）
				for (const [methodName, methodInfo] of existingMethods) {
					if (!currentMethodNames.has(methodName)) {
						// 保留现有方法（没有被当前操作更新的）
						allMethods.push(methodInfo.content);
					}
				}

				// 重新生成整个控制器
				lines.push(`export const ${controllerConst} = {`);
				lines.push(...allMethods);
				lines.push('};');
				lines.push('');
			} else {
				// 创建新控制器
				if (newMethods.length > 0 || updatedMethods.length > 0) {
					lines.push(`export const ${controllerConst} = {`);
					lines.push(...newMethods);
					lines.push(...updatedMethods);
					lines.push('};');
					lines.push('');
				}
			}
		}

		// 添加所有未被处理的现有控制器
		for (const [controllerName, controllerInfo] of existingControllers) {
			if (!controllerNames.includes(controllerName)) {
				// 这个控制器没有被当前选择更新，保留它
				lines.push(`export const ${controllerName} = {`);
				for (const [methodName, methodInfo] of controllerInfo.methods) {
					lines.push(methodInfo.content);
				}
				lines.push('};');
				lines.push('');
				controllerNames.push(controllerName);
			}
		}

		return lines.join('\n');
	}
}
