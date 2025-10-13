/**
 * 测试 APIs 生成功能
 * 生成 demo-apis.ts 文件用于验证
 */

import * as fs from 'fs';
import * as path from 'path';

// 读取 demo.json
const demoJsonPath = path.join(__dirname, '../../src/test/demo.json');
console.log('📁 正在读取 demo.json...');

let swaggerJson: any;
try {
	const content = fs.readFileSync(demoJsonPath, 'utf-8');
	swaggerJson = JSON.parse(content);
	console.log('✅ demo.json 读取成功');
	console.log(`   - Paths 数量: ${Object.keys(swaggerJson.paths || {}).length}`);
} catch (error) {
	console.error('❌ 读取 demo.json 失败:', error);
	process.exit(1);
}

// 通过类型断言访问私有方法
const ApiService = require('../../out/services/ApiGenerationService').ApiGenerationService as any;

console.log('\n' + '='.repeat(80));
console.log('测试 APIs 生成');
console.log('='.repeat(80) + '\n');

// 构建 mergedApiData（全量生成所有 API）
const mergedApiData: Record<string, any[]> = {};

// 选择所有 API
const paths = swaggerJson.paths || {};
const pathKeys = Object.keys(paths); // 全量生成

console.log(`📝 全量生成所有 API...`);
console.log(`   - 总路径数: ${pathKeys.length}`);

pathKeys.forEach((pathKey) => {
	const methods = paths[pathKey];
	Object.keys(methods).forEach((method) => {
		const operation = methods[method];
		if (!operation || typeof operation !== 'object') return;

		const tags = operation.tags || ['DefaultController'];
		const tag = tags[0];
		const controllerName = tag.replace(/[^a-zA-Z0-9]/g, '') + 'Controller';

		if (!mergedApiData[controllerName]) {
			mergedApiData[controllerName] = [];
		}

		mergedApiData[controllerName].push({
			operationId: operation.operationId || '',
			path: pathKey,
			method: method.toUpperCase(),
			summary: operation.summary || '',
			parameters: operation.parameters || [],
			tags: tags
		});
	});
});

console.log(`✅ 构建完成: ${Object.keys(mergedApiData).length} 个 Controller`);

// 显示 Controller 统计
Object.keys(mergedApiData).forEach((controllerName) => {
	console.log(`   - ${controllerName}: ${mergedApiData[controllerName].length} 个接口`);
});

// 生成 Types 文件内容
console.log('\n📦 生成 Types 文件内容...');
const typesContent = ApiService.renderTypes(swaggerJson, mergedApiData);
const typesOutputPath = path.join(__dirname, '../../out/test/demo-types.ts');
fs.writeFileSync(typesOutputPath, typesContent, 'utf-8');
const typesStats = fs.statSync(typesOutputPath);
console.log(`✅ Types 文件已生成: ${typesOutputPath}`);
console.log(`   - 文件大小: ${(typesStats.size / 1024).toFixed(2)} KB`);
console.log(`   - 行数: ${typesContent.split('\n').length}`);

// 生成 APIs 文件内容
console.log('\n📦 生成 APIs 文件内容...');
const apisContent = ApiService.renderApis(mergedApiData, swaggerJson);

// 写入文件
const outputPath = path.join(__dirname, '../../out/test/demo-apis.ts');
fs.writeFileSync(outputPath, apisContent, 'utf-8');

const stats = fs.statSync(outputPath);
const fileSizeKB = (stats.size / 1024).toFixed(2);
const lineCount = apisContent.split('\n').length;

console.log(`✅ APIs 文件已生成: ${outputPath}`);
console.log(`   - 文件大小: ${fileSizeKB} KB`);
console.log(`   - 行数: ${lineCount}`);

// 验证文件结构
const hasImport = apisContent.includes('import type { AxiosRequestConfig }');
const hasHttpImport = apisContent.includes("import $http from '../request'");
const hasTypesImport = apisContent.includes("import * as Types from './types'");
const hasBasePath = apisContent.includes('const basePath');
const hasExport = apisContent.includes('export const');
const hasAsync = apisContent.includes('async ');
const hasPromise = apisContent.includes('Promise<');

console.log('\n📊 文件结构检查:');
console.log(`   ✓ AxiosRequestConfig 导入: ${hasImport ? '是' : '否'}`);
console.log(`   ✓ $http 导入: ${hasHttpImport ? '是' : '否'}`);
console.log(`   ✓ Types 导入: ${hasTypesImport ? '是' : '否'}`);
console.log(`   ✓ basePath 定义: ${hasBasePath ? '是' : '否'}`);
console.log(`   ✓ export const 导出: ${hasExport ? '是' : '否'}`);
console.log(`   ✓ async 方法: ${hasAsync ? '是' : '否'}`);
console.log(`   ✓ Promise 返回类型: ${hasPromise ? '是' : '否'}`);

// 统计生成的内容
const controllerExports = (apisContent.match(/export const \w+:/g) || []).length;
const asyncMethods = (apisContent.match(/async \w+\(/g) || []).length;
const typesPrefix = (apisContent.match(/Types\.\w+/g) || []).length;

console.log('\n📈 内容统计:');
console.log(`   - Controller 导出数: ${controllerExports}`);
console.log(`   - async 方法数: ${asyncMethods}`);
console.log(`   - Types. 前缀使用次数: ${typesPrefix}`);

// 检查 ReplyEntity<void> 修复
console.log('\n🔍 检查 ReplyEntity<void> 修复:');
console.log('─'.repeat(80));

// 查找所有返回 ReplyEntity 的方法
const replyEntityRegex = /Promise<Types\.ReplyEntity([^>]*)>/g;
let match;
let totalReplyEntity = 0;
let replyEntityWithVoid = 0;
let replyEntityWithoutGeneric = 0;

while ((match = replyEntityRegex.exec(apisContent)) !== null) {
	totalReplyEntity++;
	const genericPart = match[1];

	if (genericPart === '') {
		// 没有泛型参数
		replyEntityWithoutGeneric++;
	} else if (genericPart === '<void>') {
		// 有 <void> 泛型参数
		replyEntityWithVoid++;
	}
}

console.log(`   总 ReplyEntity 返回类型: ${totalReplyEntity}`);
console.log(`   - 带 <void>: ${replyEntityWithVoid}`);
console.log(`   - 带其他泛型参数: ${totalReplyEntity - replyEntityWithVoid - replyEntityWithoutGeneric}`);
console.log(`   - 不带泛型参数（错误）: ${replyEntityWithoutGeneric}`);

if (replyEntityWithoutGeneric > 0) {
	console.log(`\n   ❌ 发现 ${replyEntityWithoutGeneric} 个 ReplyEntity 缺少泛型参数！`);

	// 显示具体的问题方法
	const problemRegex = /async (\w+)\([^)]+\): Promise<Types\.ReplyEntity>/g;
	let problemMatch;
	let count = 0;
	console.log('\n   问题方法示例:');
	while ((problemMatch = problemRegex.exec(apisContent)) !== null && count < 5) {
		console.log(`      - ${problemMatch[1]}(): Promise<Types.ReplyEntity>`);
		count++;
	}
	if (replyEntityWithoutGeneric > count) {
		console.log(`      ... 等 ${replyEntityWithoutGeneric} 个方法`);
	}
} else {
	console.log(`\n   ✅ 所有 ReplyEntity 都正确添加了泛型参数！`);
}

console.log('─'.repeat(80));

// 显示前几行内容
console.log('\n📄 文件开头内容预览:');
console.log('─'.repeat(80));
const lines = apisContent.split('\n');
lines.slice(0, 30).forEach((line: string, i: number) => {
	console.log(`${String(i + 1).padStart(3, ' ')} | ${line}`);
});
console.log('─'.repeat(80));

console.log('\n🎉 测试完成！');

// 如果有错误，退出码为 1
if (replyEntityWithoutGeneric > 0) {
	console.log('\n❌ 测试失败: 存在缺少泛型参数的 ReplyEntity');
	process.exit(1);
} else {
	console.log('\n✅ 测试通过: ReplyEntity<void> 修复验证成功');
}

