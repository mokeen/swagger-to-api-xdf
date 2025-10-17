import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

export class SwaggerFetcher {
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

					let data = '';
					res.on('data', chunk => data += chunk);
					res.on('end', () => {
						try {
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

				// 设置超时时间（缩短到3秒，因为要尝试多个URL）
				req.setTimeout(3000);
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

			// 清除哈希部分和可能的路由片段
			const cleanPath = url.pathname
				.replace(/\/swagger-ui\.html.*$/, '') // 移除swagger-ui.html及后续字符
				.replace(/\/$/, ''); // 移除末尾斜杠

			// 常见的 Swagger JSON 路径模式（按使用频率排序）
			const jsonPaths = [
				'/v2/api-docs',          // SpringBoot 2.x 标准路径
				'/v3/api-docs',          // SpringBoot 3.x (Springdoc)
				'/swagger/v2/api-docs',  // 自定义 context path
				'/api-docs',             // 简化路径
				'/swagger.json',         // 部分框架使用
				'/api/swagger.json'      // RESTful 风格
			];

			// 生成所有候选 URL
			return jsonPaths.map(jsonPath => `${url.origin}${cleanPath}${jsonPath}`);
		} catch {
			throw new Error('Invalid URL format');
		}
	}
}
