export const addSwaggerTemplate = `<!DOCTYPE html>
<html>

<head>
	<title>Add Swagger Document</title>
	<!-- Bootstrap CSS (本地资源) -->
	<link href="{{bootstrapCssUri}}" rel="stylesheet" />
	<link rel="stylesheet" href="{{bootstrapIconsUri}}">
	<style>
		body {
			padding: 20px;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
		}

		.form-container {
			max-width: 600px;
			margin: 0 auto;
		}

		.form-label {
			font-weight: 500;
		}

		.btn-submit {
			width: 100%;
			margin-top: 20px;
		}
	</style>
</head>

<body>
	<div class="form-container">
		<h2 class="text-center mb-4">添加Swagger文档</h2>
		<h6 class="text-center mb-4">向当前项目中新增一个swagger服务文档并同步至项目 <strong>.contractrc</strong> 文件</h4>
			<form id="swaggerForm">
				<div class="mb-3">
					<label for="swaggerUrl" class="form-label">Swagger URL</label>
					<input type="url" class="form-control" id="swaggerUrl" placeholder="https://example.com/swagger"
						required />
					<div class="invalid-feedback">请输入有效的URL地址</div>
				</div>

				<div class="mb-3">
					<label for="swaggerName" class="form-label">文档名称</label>
					<input type="text" class="form-control" id="swaggerName" placeholder="My API" required />
					<div class="invalid-feedback">请输入文档名称</div>
				</div>

				<div class="mb-3">
					<label for="basePath" class="form-label">Base Path (可选)</label>
					<input type="text" class="form-control" id="basePath" placeholder="/api/v1" />
					<div class="form-text">此路径将添加到所有接口前缀，测试链接后自动填充</div>
				</div>

				<div class="mb-3">
					<label for="swaggerDesc" class="form-label">文档描述 (可选)</label>
					<textarea class="form-control" id="swaggerDesc" rows="2" placeholder="请输入描述信息..."></textarea>
				</div>

				<div class="d-flex gap-2 mt-4">
					<button type="button" id="testUrlBtn" class="btn btn-outline-primary flex-grow-1">
						<i class="bi bi-link-45deg"></i> 测试链接
					</button>

					<button type="submit" class="btn btn-primary flex-grow-1">
						添加文档
					</button>
				</div>
			</form>
	</div>

	<!-- Bootstrap JS (本地资源) -->
	<script src="{{bootstrapJsUri}}"></script>
	<script>
		const vscode = acquireVsCodeApi();

		// 应用状态管理
		const appState = {
			isSubmitting: false,
			isTesting: false,
			lastTestedUrl: null,
			testResult: null
		};

		// DOM元素缓存
		const elements = {};

		// 定时器管理
		const activeTimers = [];
		function addTimer(timerId) {
			activeTimers.push(timerId);
			return timerId;
		}
		function clearAllTimers() {
			activeTimers.forEach(timer => clearTimeout(timer));
			activeTimers.length = 0;
		}

		// 初始化
		document.addEventListener('DOMContentLoaded', function() {
			initializeElements();
			bindEvents();
			setupFormValidation();
		});

		// 页面卸载时清理所有定时器
		window.addEventListener('beforeunload', clearAllTimers);
		window.addEventListener('unload', clearAllTimers);

		function initializeElements() {
			elements.form = document.getElementById("swaggerForm");
			elements.urlInput = document.getElementById("swaggerUrl");
			elements.nameInput = document.getElementById("swaggerName");
			elements.basePathInput = document.getElementById("basePath");
			elements.descInput = document.getElementById("swaggerDesc");
			elements.testBtn = document.getElementById("testUrlBtn");
			elements.submitBtn = elements.form.querySelector('button[type="submit"]');
		}

		function bindEvents() {
			// 表单提交处理
			elements.form.addEventListener("submit", handleFormSubmit, false);

			// 测试按钮处理
			elements.testBtn.addEventListener("click", handleTestUrl);

			// URL输入变化时重置测试状态
			elements.urlInput.addEventListener("input", handleUrlChange);

			// 实时验证
			elements.urlInput.addEventListener("blur", validateUrl);
			elements.nameInput.addEventListener("blur", validateName);
		}

		function handleFormSubmit(event) {
			event.preventDefault();
			event.stopPropagation();

			if (appState.isSubmitting) return;

			const form = event.currentTarget;

			// 表单验证
			if (!form.checkValidity()) {
				form.classList.add("was-validated");
				return;
			}

			// 检查URL是否与上次测试的一致
			const currentUrl = elements.urlInput.value.trim();
			if (currentUrl !== appState.lastTestedUrl) {
				showFieldError(elements.urlInput, '请先测试链接是否可访问');
				vscode.postMessage({
					command: 'showAlert',
					text: '⚠️ 请先点击"测试链接"按钮验证URL可访问性',
					type: 'warning'
				});
				return;
			}

			// 检查测试结果
			if (!appState.testResult || !appState.testResult.available) {
				showFieldError(elements.urlInput, '链接测试未通过，请修改后重新测试');
				vscode.postMessage({
					command: 'showAlert',
					text: '❌ 链接测试未通过，无法添加文档',
					type: 'warning'
				});
				return;
			}

			// 提交数据
			submitForm();
		}

		function setupFormValidation() {
			// 自定义验证消息
			elements.urlInput.addEventListener('invalid', function() {
				if (this.validity.valueMissing) {
					this.setCustomValidity('请输入Swagger URL');
				} else if (this.validity.typeMismatch) {
					this.setCustomValidity('请输入有效的URL格式');
				} else {
					this.setCustomValidity('');
				}
			});

			elements.nameInput.addEventListener('invalid', function() {
				if (this.validity.valueMissing) {
					this.setCustomValidity('请输入文档名称');
				} else {
					this.setCustomValidity('');
				}
			});
		}

		function submitForm() {
			appState.isSubmitting = true;
			updateSubmitButton(true);

			const formData = {
				command: "addSwagger",
				url: elements.urlInput.value.trim(),
				name: elements.nameInput.value.trim(),
				basePath: elements.basePathInput.value.trim() || "",
				desc: elements.descInput.value.trim() || "",
			};

			vscode.postMessage(formData);
		}

		function handleTestUrl() {
			if (appState.isTesting) return;

			const url = elements.urlInput.value.trim();

			// 基础验证
			if (!url) {
				showFieldError(elements.urlInput, '请输入Swagger URL');
				return;
			}

			if (!isValidSwaggerUrl(url)) {
				showFieldError(elements.urlInput, 'URL格式不正确，请输入有效的Swagger文档URL');
				return;
			}

			// 开始测试
			appState.isTesting = true;
			appState.lastTestedUrl = url;
			updateTestButton('testing');

			vscode.postMessage({
				command: 'testSwaggerUrl',
				url: url
			});
		}

		function handleUrlChange() {
			// URL改变时重置测试状态
			const currentUrl = elements.urlInput.value.trim();
			if (currentUrl !== appState.lastTestedUrl) {
				appState.testResult = null;
				updateTestButton('default');
			}

			// 清除自定义验证消息
			elements.urlInput.setCustomValidity('');
		}

		function validateUrl() {
			const url = elements.urlInput.value.trim();
			if (url && !isValidSwaggerUrl(url)) {
				showFieldError(elements.urlInput, 'URL格式不正确，应包含swagger或.json路径');
				return false;
			}
			clearFieldError(elements.urlInput);
			return true;
		}

		function validateName() {
			const name = elements.nameInput.value.trim();
			if (!name) {
				showFieldError(elements.nameInput, '请输入文档名称');
				return false;
			}
			clearFieldError(elements.nameInput);
			return true;
		}

		function isValidSwaggerUrl(url) {
			try {
				const urlObj = new URL(url);
				const validProtocol = ['http:', 'https:'].includes(urlObj.protocol);

				// 支持 Swagger 2.0 和 OpenAPI 3.x 的常见路径
				// - Swagger 2.0: /swagger-ui.html, /swagger/..., /v2/api-docs
				// - OpenAPI 3.x: /docs, /redoc, /openapi.json, /v3/api-docs
				// - 通用: /api-docs, /api/...
				const validPath = /(\\/swagger|\\/docs|\\/redoc|\\/api-docs|\\/v[0-9]\\/api-docs|\\.json$|\\/api\\/)/i.test(urlObj.pathname);

				// hostname 验证：不为空且不以空格开头（支持 localhost 等本地地址）
				const validHostname = urlObj.hostname.trim().length > 0 && !urlObj.hostname.startsWith(' ');

				return validProtocol && validHostname && validPath;
			} catch {
				return false;
			}
		}

		// UI更新函数
		function updateTestButton(state) {
			const icon = '<i class="bi bi-link-45deg"></i>';

			switch (state) {
				case 'testing':
					elements.testBtn.disabled = true;
					elements.testBtn.className = 'btn btn-outline-secondary flex-grow-1';
					elements.testBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>测试中...';
					break;
				case 'success':
					elements.testBtn.disabled = false;
					elements.testBtn.className = 'btn btn-outline-success flex-grow-1';
					elements.testBtn.innerHTML = \`<i class="bi bi-check-circle me-1"></i>测试通过\`;
					break;
				case 'failed':
					elements.testBtn.disabled = false;
					elements.testBtn.className = 'btn btn-outline-danger flex-grow-1';
					elements.testBtn.innerHTML = \`<i class="bi bi-x-circle me-1"></i>测试失败\`;
					break;
				case 'default':
				default:
					elements.testBtn.disabled = false;
					elements.testBtn.className = 'btn btn-outline-primary flex-grow-1';
					elements.testBtn.innerHTML = \`\${icon} 测试链接\`;
					break;
			}
		}

		function updateSubmitButton(loading) {
			if (loading) {
				elements.submitBtn.disabled = true;
				elements.submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>添加中...';
			} else {
				elements.submitBtn.disabled = false;
				elements.submitBtn.innerHTML = '添加文档';
			}
		}

		function showFieldError(field, message) {
			field.setCustomValidity(message);
			field.classList.add('is-invalid');

			// 显示错误消息
			let feedback = field.parentNode.querySelector('.invalid-feedback');
			if (!feedback) {
				feedback = document.createElement('div');
				feedback.className = 'invalid-feedback';
				field.parentNode.appendChild(feedback);
			}
			feedback.textContent = message;
		}

		function clearFieldError(field) {
			field.setCustomValidity('');
			field.classList.remove('is-invalid');

			const feedback = field.parentNode.querySelector('.invalid-feedback');
			if (feedback) {
				feedback.remove();
			}
		}

		// 消息处理
		window.addEventListener('message', event => {
			const { command, data } = event.data;

			switch (command) {
				case 'testUrlResult':
					handleTestResult(event.data);
					break;
				case 'addSwaggerResult':
					handleAddResult(event.data);
					break;
			}
		});

		function handleTestResult(result) {
			appState.isTesting = false;
			appState.testResult = result;

			if (result.available) {
				updateTestButton('success');
				clearFieldError(elements.urlInput);

				// 自动填充表单字段（仅当用户未填写时）
				if (result.info) {
					// 自动填充名称（如果为空）
					if (!elements.nameInput.value.trim() && result.info.title) {
						elements.nameInput.value = result.info.title;
						elements.nameInput.classList.add('is-valid');
					}

					// 自动填充 basePath（如果为空）
					if (!elements.basePathInput.value.trim() && result.info.basePath) {
						elements.basePathInput.value = result.info.basePath;
					}

					// 自动填充描述（如果为空）
					if (!elements.descInput.value.trim() && result.info.description) {
						elements.descInput.value = result.info.description;
					}
				}

				// 3秒后恢复默认状态
				addTimer(setTimeout(() => {
					if (appState.testResult === result) {
						updateTestButton('default');
					}
				}, 3000));

				vscode.postMessage({
					command: 'showAlert',
					text: '✅ Swagger文档可正常访问，已自动填充文档信息',
					type: 'info'
				});
			} else {
				updateTestButton('failed');
				showFieldError(elements.urlInput, result.error || '无法访问此URL');

				// 3秒后恢复默认状态
				addTimer(setTimeout(() => {
					if (appState.testResult === result) {
						updateTestButton('default');
					}
				}, 3000));

				vscode.postMessage({
					command: 'showAlert',
					text: '❌ 无法访问此Swagger URL',
					type: 'warning'
				});
			}
		}

		function handleAddResult(result) {
			appState.isSubmitting = false;
			updateSubmitButton(false);

			if (result.error) {
				// 显示错误，但不关闭面板，让用户可以修改后重试
				console.error('Add swagger failed:', result.error);
			}
			// 成功的情况由后端处理（关闭面板）
		}
	</script>
</body>

</html>`;
