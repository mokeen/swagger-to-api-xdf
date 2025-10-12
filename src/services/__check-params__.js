const fs = require('fs');
const path = require('path');

const demoJsonPath = path.join(__dirname, '../../src/services/demo.json');
const swaggerJson = JSON.parse(fs.readFileSync(demoJsonPath, 'utf-8'));

console.log('检查前10个POST方法的body参数名：\n');

let count = 0;
for (const [pathUrl, methods] of Object.entries(swaggerJson.paths)) {
	if (count >= 10) break;

	for (const [method, operation] of Object.entries(methods)) {
		if (count >= 10) break;
		if (method.toLowerCase() !== 'post') continue;

		const bodyParam = (operation.parameters || []).find(p => p.in === 'body');
		if (bodyParam) {
			console.log(`${count + 1}. ${operation.operationId || pathUrl}`);
			console.log(`   Path: ${pathUrl}`);
			console.log(`   Body参数名: "${bodyParam.name || '(空)'}"`);
			console.log(`   Required: ${bodyParam.required}`);
			console.log('');
			count++;
		}
	}
}

