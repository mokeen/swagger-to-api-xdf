/**
 * OpenAPI/Swagger 规范适配器
 * 将 OpenAPI 3.x 和 Swagger 2.0 统一为一致的内部格式
 */

export interface NormalizedSpec {
	version: '2.0' | '3.x';
	info: any;
	basePath?: string;
	paths: any;
	definitions: any; // 统一的类型定义
}

export class SpecAdapter {
	/**
	 * 检测规范版本
	 */
	static detectVersion(spec: any): '2.0' | '3.x' | 'unknown' {
		if (spec.swagger && spec.swagger.startsWith('2.')) {
			return '2.0';
		}
		if (spec.openapi && spec.openapi.startsWith('3.')) {
			return '3.x';
		}
		return 'unknown';
	}

	/**
	 * 规范化 spec，统一转换为内部格式
	 */
	static normalize(spec: any): NormalizedSpec {
		const version = this.detectVersion(spec);

		if (version === '2.0') {
			return this.normalizeSwagger2(spec);
		} else if (version === '3.x') {
			return this.normalizeOpenAPI3(spec);
		}

		throw new Error('不支持的规范版本');
	}

	/**
	 * Swagger 2.0 规范化（直接返回，不需要转换）
	 */
	private static normalizeSwagger2(spec: any): NormalizedSpec {
		return {
			version: '2.0',
			info: spec.info || {},
			basePath: spec.basePath || '',
			paths: spec.paths || {},
			definitions: spec.definitions || {},
		};
	}

	/**
	 * OpenAPI 3.x 规范化（转换为 Swagger 2.0 类似的结构）
	 */
	private static normalizeOpenAPI3(spec: any): NormalizedSpec {
		const normalized: NormalizedSpec = {
			version: '3.x',
			info: spec.info || {},
			basePath: this.extractBasePath(spec),
			paths: {},
			definitions: {},
		};

		// 转换 components.schemas 为 definitions
		if (spec.components && spec.components.schemas) {
			normalized.definitions = spec.components.schemas;
		}

		// 转换 paths
		normalized.paths = this.normalizePaths(spec.paths || {});

		return normalized;
	}

	/**
	 * 从 OpenAPI 3.x 的 servers 中提取 basePath
	 */
	private static extractBasePath(spec: any): string {
		if (spec.servers && spec.servers.length > 0) {
			const url = spec.servers[0].url;
			try {
				const urlObj = new URL(url);
				return urlObj.pathname;
			} catch {
				// 如果是相对路径，直接返回
				return url;
			}
		}
		return '';
	}

	/**
	 * 规范化 paths（将 OpenAPI 3.x 的 path 转换为 Swagger 2.0 格式）
	 */
	private static normalizePaths(paths: any): any {
		const normalized: any = {};

		for (const [path, pathItem] of Object.entries<any>(paths)) {
			normalized[path] = {};

			for (const [method, operation] of Object.entries<any>(pathItem)) {
				if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method.toLowerCase())) {
					normalized[path][method] = this.normalizeOperation(operation);
				}
			}
		}

		return normalized;
	}

	/**
	 * 规范化 operation（将 OpenAPI 3.x 的 operation 转换为 Swagger 2.0 格式）
	 */
	private static normalizeOperation(operation: any): any {
		const normalized: any = {
			...operation,
			parameters: operation.parameters || [],
		};

		// 转换 requestBody 为 parameters（body 参数）
		if (operation.requestBody) {
			const bodyParam = this.requestBodyToParameter(operation.requestBody);
			if (bodyParam) {
				normalized.parameters.push(bodyParam);
			}
		}

		// 转换 responses
		normalized.responses = this.normalizeResponses(operation.responses || {});

		return normalized;
	}

	/**
	 * 将 OpenAPI 3.x 的 requestBody 转换为 Swagger 2.0 的 body parameter
	 */
	private static requestBodyToParameter(requestBody: any): any | null {
		// 优先使用 application/json
		const content = requestBody.content || {};
		const jsonContent = content['application/json'] || content['*/*'] || Object.values(content)[0];

		if (!jsonContent || !jsonContent.schema) {
			return null;
		}

		return {
			in: 'body',
			name: 'body',
			required: requestBody.required || false,
			schema: this.normalizeSchema(jsonContent.schema),
		};
	}

	/**
	 * 规范化 responses（将 OpenAPI 3.x 的 responses 转换为 Swagger 2.0 格式）
	 */
	private static normalizeResponses(responses: any): any {
		const normalized: any = {};

		for (const [code, response] of Object.entries<any>(responses)) {
			normalized[code] = {
				description: response.description || '',
			};

			// 提取 schema
			if (response.content) {
				const content = response.content['application/json'] || response.content['*/*'] || Object.values(response.content)[0];
				if (content && content.schema) {
					normalized[code].schema = this.normalizeSchema(content.schema);
				}
			}
		}

		return normalized;
	}

	/**
	 * 规范化 schema（处理 OpenAPI 3.x 的特殊语法）
	 */
	private static normalizeSchema(schema: any): any {
		if (!schema) {
			return schema;
		}

		const normalized: any = { ...schema };

		// 处理 anyOf（可空类型）
		// 例如：anyOf: [{ type: "string" }, { type: "null" }] -> type: "string"
		if (schema.anyOf && Array.isArray(schema.anyOf)) {
			const nonNullTypes = schema.anyOf.filter((s: any) => s.type !== 'null');
			if (nonNullTypes.length === 1) {
				// 单一非空类型，直接使用
				Object.assign(normalized, nonNullTypes[0]);
				delete normalized.anyOf;
			} else if (nonNullTypes.length > 1) {
				// 多个非空类型，保留 anyOf
				normalized.anyOf = nonNullTypes.map((s: any) => this.normalizeSchema(s));
			}
		}

		// 处理数组项
		if (schema.items) {
			normalized.items = this.normalizeSchema(schema.items);
		}

		// 处理属性
		if (schema.properties) {
			normalized.properties = {};
			for (const [key, value] of Object.entries(schema.properties)) {
				normalized.properties[key] = this.normalizeSchema(value);
			}
		}

		// 转换 $ref（OpenAPI 3.x: #/components/schemas/X -> Swagger 2.0: #/definitions/X）
		if (schema.$ref && schema.$ref.includes('#/components/schemas/')) {
			normalized.$ref = schema.$ref.replace('#/components/schemas/', '#/definitions/');
		}

		return normalized;
	}

	/**
	 * 从规范化的 paths 中收集所有 tags
	 */
	static collectTags(paths: any): Set<string> {
		const tags = new Set<string>();

		for (const pathItem of Object.values<any>(paths)) {
			for (const operation of Object.values<any>(pathItem)) {
				if (operation.tags && Array.isArray(operation.tags)) {
					operation.tags.forEach((tag: string) => tags.add(tag));
				}
			}
		}

		return tags;
	}
}
