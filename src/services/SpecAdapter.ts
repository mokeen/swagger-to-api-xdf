/**
 * OpenAPI/Swagger 规范适配器
 * 将 OpenAPI 3.x 和 Swagger 2.0 统一为一致的内部格式
 */

export interface NormalizedSpec {
	_normalized: true; // 标记已规范化，避免重复处理
	version: '2.0' | '3.x';
	info: any;
	basePath?: string;
	paths: any;
	definitions: any; // 统一的类型定义
	tags: any[]; // 统一的 tags（包含从 paths 收集的）
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
	 *
	 * 性能优化：如果数据已经规范化（带有 _normalized 标记），直接返回，避免重复处理
	 */
	static normalize(spec: any): NormalizedSpec {
		// 快速检查：如果已经规范化，直接返回
		if (spec._normalized === true) {
			return spec as NormalizedSpec;
		}

		const version = this.detectVersion(spec);

		if (version === '2.0') {
			return this.normalizeSwagger2(spec);
		} else if (version === '3.x') {
			return this.normalizeOpenAPI3(spec);
		}

		throw new Error('不支持的规范版本');
	}

	/**
	 * Swagger 2.0 规范化（保持原样，只处理 tags）
	 */
	private static normalizeSwagger2(spec: any): NormalizedSpec {
		return {
			_normalized: true, // 标记已规范化
			version: '2.0',
			info: spec.info || {},
			basePath: spec.basePath || '',
			paths: spec.paths || {},  // Swagger 2.0 保持原样
			definitions: spec.definitions || {},  // Swagger 2.0 保持原样
			tags: this.normalizeTags(spec),
		};
	}

	/**
	 * OpenAPI 3.x 规范化（转换为 Swagger 2.0 类似的结构）
	 */
	private static normalizeOpenAPI3(spec: any): NormalizedSpec {
		const normalized: NormalizedSpec = {
			_normalized: true, // 标记已规范化
			version: '3.x',
			info: spec.info || {},
			basePath: this.extractBasePath(spec),
			paths: {},
			definitions: {},
			tags: [],
		};

		// 转换 components.schemas 为 definitions（递归转换所有 $ref）
		if (spec.components && spec.components.schemas) {
			normalized.definitions = this.normalizeDefinitions(spec.components.schemas);
		}

		// 转换 paths
		normalized.paths = this.normalizePaths(spec.paths || {});

		// 规范化 tags
		normalized.tags = this.normalizeTags(spec);

		// 同步修改 paths 中 operation 的 tags（添加 Controller 后缀）
		this.normalizeOperationTags(normalized.paths);

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
	 * 规范化 definitions（递归转换所有 $ref 引用）- 仅用于 OpenAPI 3.x
	 */
	private static normalizeDefinitions(schemas: any): any {
		const normalized: any = {};

		for (const [name, schema] of Object.entries<any>(schemas)) {
			normalized[name] = this.normalizeSchema(schema);
		}

		return normalized;
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
			// 删除 requestBody 字段，避免重复处理
			delete normalized.requestBody;
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
					// 忽略空对象 schema（OpenAPI 3.x 中空对象表示无类型定义）
					const isEmptySchema = Object.keys(content.schema).length === 0;
					if (!isEmptySchema) {
						const normalizedSchema = this.normalizeSchema(content.schema);
						normalized[code].schema = normalizedSchema;
					}
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

		// 如果有 $ref，优先处理并直接返回（$ref 不应该和其他字段混合）
		if (schema.$ref) {
			// 转换 OpenAPI 3.x 的 $ref 路径
			if (schema.$ref.includes('#/components/schemas/')) {
				return {
					$ref: schema.$ref.replace('#/components/schemas/', '#/definitions/')
				};
			}
			// Swagger 2.0 的 $ref 直接返回
			return { $ref: schema.$ref };
		}

		const normalized: any = { ...schema };

		// 处理 anyOf（可空类型）
		// 例如：anyOf: [{ $ref: "..." }, { type: "null" }] -> 直接返回规范化的 $ref
		if (schema.anyOf && Array.isArray(schema.anyOf)) {
			const nonNullTypes = schema.anyOf.filter((s: any) => s.type !== 'null');
			if (nonNullTypes.length === 1) {
				// 单一非空类型，递归规范化并返回
				return this.normalizeSchema(nonNullTypes[0]);
			} else if (nonNullTypes.length > 1) {
				// 多个非空类型，保留 anyOf
				normalized.anyOf = nonNullTypes.map((s: any) => this.normalizeSchema(s));
				delete normalized.type;  // 删除 type 字段（anyOf 不应该有 type）
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

		// 处理 additionalProperties
		if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
			normalized.additionalProperties = this.normalizeSchema(schema.additionalProperties);
		}

		// 处理 allOf
		if (schema.allOf && Array.isArray(schema.allOf)) {
			normalized.allOf = schema.allOf.map((s: any) => this.normalizeSchema(s));
		}

		// 处理 oneOf
		if (schema.oneOf && Array.isArray(schema.oneOf)) {
			normalized.oneOf = schema.oneOf.map((s: any) => this.normalizeSchema(s));
		}

		return normalized;
	}

	/**
	 * 规范化 tags（统一处理 Swagger 2.0 和 OpenAPI 3.x 的 tags）
	 *
	 * 规则：
	 * 1. 优先使用顶层 tags 定义
	 * 2. 从 paths 中收集实际使用的 tags
	 * 3. 为没有 tag 的 path 创建 default tag
	 * 4. tag 的 description 默认使用 name
	 * 5. OpenAPI 3.x 的 tag name 统一添加 Controller 后缀（避免重复添加）
	 */
	private static normalizeTags(spec: any): any[] {
		const tagMap = new Map<string, any>();
		const DEFAULT_TAG = 'default';
		const version = this.detectVersion(spec);
		const isOpenAPI3 = version === '3.x';

		// 辅助函数：为 OpenAPI 3.x 的 tag 添加 Controller 后缀（避免重复）
		const normalizeTagName = (tagName: string): string => {
			if (!isOpenAPI3) {
				// Swagger 2.0 保持原样
				return tagName;
			}
			// OpenAPI 3.x：添加 Controller 后缀（避免重复）
			if (tagName.endsWith('Controller') || tagName.endsWith('controller')) {
				return tagName;
			}
			return tagName + 'Controller';
		};

		// 1️⃣ 处理顶层 tags 定义
		if (spec.tags && Array.isArray(spec.tags)) {
			spec.tags.forEach((tag: any) => {
				if (tag.name) {
					const normalizedName = normalizeTagName(tag.name);
					tagMap.set(normalizedName, {
						name: normalizedName,
						description: tag.description || normalizedName
					});
				}
			});
		}

		// 2️⃣ 从 paths 中收集实际使用的 tags
		if (spec.paths) {
			Object.values<any>(spec.paths).forEach((pathItem: any) => {
				if (pathItem && typeof pathItem === 'object') {
					['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].forEach((method: string) => {
						const operation = pathItem[method];
						if (operation) {
							if (operation.tags && Array.isArray(operation.tags)) {
								// 有 tags：添加到 tagMap
								operation.tags.forEach((tagName: string) => {
									const normalizedName = normalizeTagName(tagName);
									if (!tagMap.has(normalizedName)) {
										tagMap.set(normalizedName, {
											name: normalizedName,
											description: normalizedName
										});
									}
								});
							} else {
								// 没有 tags：归属于 default
								const normalizedDefault = normalizeTagName(DEFAULT_TAG);
								if (!tagMap.has(normalizedDefault)) {
									tagMap.set(normalizedDefault, {
										name: normalizedDefault,
										description: normalizedDefault
									});
								}
							}
						}
					});
				}
			});
		}

		// 3️⃣ 确保至少有一个 default tag（如果没有任何 tags）
		if (tagMap.size === 0) {
			const normalizedDefault = normalizeTagName(DEFAULT_TAG);
			tagMap.set(normalizedDefault, {
				name: normalizedDefault,
				description: normalizedDefault
			});
		}

		// 4️⃣ 转换为数组并返回
		return Array.from(tagMap.values());
	}

	/**
	 * 为 paths 中 operation 的 tags 添加 Controller 后缀（仅 OpenAPI 3.x）
	 * 确保 paths 中的 tags 与规范化后的 tags 列表一致
	 */
	private static normalizeOperationTags(paths: any): void {
		if (!paths) return;

		Object.values<any>(paths).forEach((pathItem: any) => {
			if (pathItem && typeof pathItem === 'object') {
				['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].forEach((method: string) => {
					const operation = pathItem[method];
					if (operation) {
						if (operation.tags && Array.isArray(operation.tags) && operation.tags.length > 0) {
							// 已有 tags：为每个 tag 添加 Controller 后缀（避免重复）
							operation.tags = operation.tags.map((tag: string) => {
								if (tag.endsWith('Controller') || tag.endsWith('controller')) {
									return tag;
								}
								return tag + 'Controller';
							});
						} else {
							// 没有 tags 或 tags 为空：分配到 defaultController
							operation.tags = ['defaultController'];
						}
					}
				});
			}
		});
	}

	/**
	 * 从规范化的 paths 中收集所有 tags（工具方法，用于外部调用）
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
