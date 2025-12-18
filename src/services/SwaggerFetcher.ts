import * as https from "https";
import * as http from "http";
import { URL } from "url";

export class SwaggerFetcher {
	private static decodeResponseBody(res: any, buf: Buffer): string {
		const contentType = String(res?.headers?.["content-type"] || "");
		const charsetMatch = contentType.match(/charset\s*=\s*([^;]+)/i);
		const charset = (charsetMatch?.[1] || "").trim().toLowerCase();

		const tryDecode = (encoding: string): string | null => {
			try {
				if (encoding === "utf-8" || encoding === "utf8") {
					return buf.toString("utf8");
				}
				const iconv = require("iconv-lite");
				return iconv.decode(buf, encoding);
			} catch {
				return null;
			}
		};

		if (charset) {
			const decoded = tryDecode(charset);
			if (decoded !== null) return decoded;
		}

		const utf8Decoded = tryDecode("utf8");
		if (utf8Decoded === null) {
			return buf.toString();
		}

		if (utf8Decoded.includes("\uFFFD")) {
			const gbkDecoded = tryDecode("gbk");
			if (gbkDecoded !== null && !gbkDecoded.includes("\uFFFD")) {
				return gbkDecoded;
			}
		}

		return utf8Decoded;
	}

	static async fetchSwaggerJson(swaggerUrl: string, bustCache: boolean = false): Promise<any> {
		// 获取所有可能的 API URL
		const candidateUrls = this.convertToApiUrls(swaggerUrl);
		const errors: string[] = [];

		// 依次尝试每个 URL
		for (let i = 0; i < candidateUrls.length; i++) {
			let jsonUrl = candidateUrls[i];

			// 添加时间戳参数破坏缓存（用于刷新场景）
			if (bustCache) {
				const separator = jsonUrl.includes('?') ? '&' : '?';
				jsonUrl = `${jsonUrl}${separator}_t=${Date.now()}`;
			}

			try {
				const result = await this.tryFetchUrl(jsonUrl, bustCache);
				return result; // 成功则直接返回
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				errors.push(`${jsonUrl}: ${errorMsg}`);
				// 继续尝试下一个 URL
			}
		}

		// 所有 URL 都失败
		throw new Error(
			`无法获取 Swagger JSON，已尝试以下路径：\n${errors.join('\n')}`
		);
	}

	/**
	 * 尝试从单个 URL 获取 JSON
	 */
	private static tryFetchUrl(jsonUrl: string, bustCache: boolean): Promise<any> {
		return new Promise((resolve, reject) => {
			try {
				const options = {
					headers: bustCache ? {
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						'Pragma': 'no-cache',
						'Expires': '0'
					} : {}
				};

				// 根据协议动态选择 http 或 https
				const urlObj = new URL(jsonUrl);
				const client = urlObj.protocol === 'https:' ? https : http;

				const req = client.get(jsonUrl, options, res => {
					// 处理HTTP错误状态码
					if (res.statusCode! < 200 || res.statusCode! > 299) {
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					const chunks: Buffer[] = [];
					res.on('data', (chunk) => {
						if (typeof chunk === 'string') {
							chunks.push(Buffer.from(chunk));
						} else {
							chunks.push(chunk);
						}
					});
					res.on('end', () => {
						try {
							const buf = Buffer.concat(chunks);
							const data = this.decodeResponseBody(res, buf);
							resolve(JSON.parse(data));
						} catch (err) {
							reject(new Error('Invalid JSON'));
						}
					});
				});

				// 确保所有错误都触发reject
				req.on('error', reject);
				req.on('timeout', () => {
					req.destroy();
					reject(new Error('Timeout'));
				});

				// 设置超时时间（增加到10秒，确保网络较慢时也能成功）
				req.setTimeout(10000);
			} catch (err) {
				reject(err);
			}
		});
	}

	/**
	 * 将 Swagger UI URL 转换为可能的 API JSON URL 列表
	 * @param uiUrl Swagger UI 的 URL
	 * @returns 按优先级排序的候选 URL 数组
	 */
	private static convertToApiUrls(uiUrl: string): string[] {
		try {
			const url = new URL(uiUrl);
			const candidates: string[] = [];

			// 1️⃣ 如果 URL 已经是 JSON 文件或 API 端点，优先尝试原始 URL
			const isJsonFile = url.pathname.endsWith('.json');
			const isApiEndpoint = /\/(v[0-9]\/)?api-docs$/.test(url.pathname); // /api-docs, /v2/api-docs, /v3/api-docs

			if (isJsonFile || isApiEndpoint) {
				candidates.push(uiUrl);
			}

			// 2️⃣ 清除哈希部分和文档页面路径，准备拼接候选路径
			let cleanPath = url.pathname
				.replace(/\/swagger-ui\.html.*$/, '') // 移除 swagger-ui.html 及后续字符 (Swagger 2.0)
				.replace(/\/docs\/?.*$/, '')          // 移除 /docs 或 /docs/ 及后续字符 (OpenAPI 3.x)
				.replace(/\/redoc\/?.*$/, '')         // 移除 /redoc 或 /redoc/ 及后续字符 (OpenAPI 3.x)
				.replace(/\/$/, '');                  // 移除末尾斜杠

			// 如果原始 URL 是 JSON 文件，移除文件名，只保留目录路径
			if (isJsonFile) {
				cleanPath = cleanPath.substring(0, cleanPath.lastIndexOf('/'));
			}

			// 如果是 API 端点，不需要继续生成其他候选（已经是正确的端点）
			if (isApiEndpoint) {
				return candidates;
			}

			// 3️⃣ 常见的 Swagger/OpenAPI JSON 路径模式（按使用频率排序）
			const jsonPaths = [
				'/openapi.json',         // OpenAPI 3.x 标准路径 (FastAPI, Python 等框架) - 最常见
				'/v2/api-docs',          // SpringBoot 2.x 标准路径 (Swagger 2.0)
				'/v3/api-docs',          // SpringBoot 3.x (Springdoc OpenAPI 3.x)
				'/swagger.json',         // Swagger 2.0 部分框架使用
				'/api-docs',             // 简化路径
				'/swagger/v2/api-docs',  // 自定义 context path
				'/api/swagger.json',     // RESTful 风格
				'/api/openapi.json'      // RESTful 风格 (OpenAPI 3.x)
			];

			// 4️⃣ 生成所有候选 URL（避免重复）
			const candidateSet = new Set(candidates); // 已包含原始 URL（如果是 .json）

			for (const jsonPath of jsonPaths) {
				const candidateUrl = `${url.origin}${cleanPath}${jsonPath}`;
				if (!candidateSet.has(candidateUrl)) {
					candidates.push(candidateUrl);
					candidateSet.add(candidateUrl);
				}
			}

			return candidates;
		} catch {
			throw new Error('Invalid URL format');
		}
	}
}
