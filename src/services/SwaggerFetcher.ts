import * as vscode from "vscode";
import * as https from "https";
import { URL } from "url";

export class SwaggerFetcher {
	static async fetchSwaggerJson(swaggerUrl: string): Promise<any> {
		return new Promise((resolve, reject) => {
			try {
				const jsonUrl = this.convertToApiUrl(swaggerUrl);
				const req = https.get(jsonUrl, res => {
					// 处理HTTP错误状态码
					if (res.statusCode! < 200 || res.statusCode! > 299) {
						return reject(new Error(`HTTP Error: ${res.statusCode}`));
					}

					let data = '';
					res.on('data', chunk => data += chunk);
					res.on('end', () => {
						try {
							resolve(JSON.parse(data));
						} catch (err) {
							reject(new Error('Invalid JSON response'));
						}
					});
				});

				// 确保所有错误都触发reject
				req.on('error', reject);
				req.on('timeout', () => {
					req.destroy();
					reject(new Error('Request timeout'));
				});

				// 设置超时时间
				req.setTimeout(5000);
			} catch (err) {
				reject(err); // 同步错误捕获
			}
		});
	}

	private static convertToApiUrl(uiUrl: string): string {
		try {
			const url = new URL(uiUrl);

			// 清除哈希部分和可能的路由片段
			const cleanPath = url.pathname
				.replace(/\/swagger-ui\.html.*$/, '') // 移除swagger-ui.html及后续字符
				.replace(/\/$/, ''); // 移除末尾斜杠

			// 处理常见Swagger JSON路径模式
			const jsonPaths = [
				'/v2/api-docs',          // 标准路径
				'/swagger/v2/api-docs',  // 常见变体
				'/api-docs'              // 简化路径
			];

			// 尝试首个可用的路径
			return `${url.origin}${cleanPath}${jsonPaths[0]}`;
		} catch {
			throw new Error('Invalid URL format');
		}
	}
}
