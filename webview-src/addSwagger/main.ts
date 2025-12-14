declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

type AlertType = 'info' | 'warning' | 'error';

type WebviewIncomingMessage =
	| {
			command: 'testUrlResult';
			available: boolean;
			url: string;
			error?: string;
			info?: {
				title?: string;
				description?: string;
				version?: string;
				basePath?: string;
			};
	  }
	| {
			command: 'addSwaggerResult';
			loading?: boolean;
			error?: string;
	  };

const vscode = acquireVsCodeApi();

type Elements = {
	form: HTMLFormElement;
	urlInput: HTMLInputElement;
	nameInput: HTMLInputElement;
	basePathInput: HTMLInputElement;
	descInput: HTMLTextAreaElement;
	testBtn: HTMLButtonElement;
	submitBtn: HTMLButtonElement;
};

type AppState = {
	isSubmitting: boolean;
	isTesting: boolean;
	lastTestedUrl: string | null;
	testResult: { available: boolean; error?: string; info?: any } | null;
};

const appState: AppState = {
	isSubmitting: false,
	isTesting: false,
	lastTestedUrl: null,
	testResult: null,
};

const activeTimers: number[] = [];

function addTimer(timerId: number): number {
	activeTimers.push(timerId);
	return timerId;
}

function clearAllTimers(): void {
	activeTimers.forEach((timer) => clearTimeout(timer));
	activeTimers.length = 0;
}

function isAutoFilled(field: HTMLInputElement | HTMLTextAreaElement): boolean {
	return field.dataset.autofilled === 'true';
}

function markAutoFilled(field: HTMLInputElement | HTMLTextAreaElement): void {
	field.dataset.autofilled = 'true';
}

function clearAutoFilledMark(field: HTMLInputElement | HTMLTextAreaElement): void {
	delete field.dataset.autofilled;
}

function clearIfAutoFilled(field: HTMLInputElement | HTMLTextAreaElement): void {
	if (!isAutoFilled(field)) return;
	field.value = '';
	clearAutoFilledMark(field);
	field.classList.remove('is-valid');
}

function getElements(): Elements {
	const form = document.getElementById('swaggerForm') as HTMLFormElement | null;
	const urlInput = document.getElementById('swaggerUrl') as HTMLInputElement | null;
	const nameInput = document.getElementById('swaggerName') as HTMLInputElement | null;
	const basePathInput = document.getElementById('basePath') as HTMLInputElement | null;
	const descInput = document.getElementById('swaggerDesc') as HTMLTextAreaElement | null;
	const testBtn = document.getElementById('testUrlBtn') as HTMLButtonElement | null;

	if (!form || !urlInput || !nameInput || !basePathInput || !descInput || !testBtn) {
		throw new Error('AddSwagger webview DOM not ready');
	}

	const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
	if (!submitBtn) {
		throw new Error('Submit button not found');
	}

	return {
		form,
		urlInput,
		nameInput,
		basePathInput,
		descInput,
		testBtn,
		submitBtn,
	};
}

function isValidSwaggerUrl(url: string): boolean {
	try {
		const urlObj = new URL(url);
		const validProtocol = ['http:', 'https:'].includes(urlObj.protocol);
		const validPath = /(\/swagger.*|\/docs.*|\.json)$/i.test(urlObj.pathname);

		return validProtocol && urlObj.hostname.length > 0 && validPath;
	} catch {
		return false;
	}
}

function updateTestButton(elements: Elements, state: 'default' | 'testing' | 'success' | 'failed'): void {
	switch (state) {
		case 'testing':
			elements.testBtn.disabled = true;
			elements.testBtn.className = 'btn btn-outline-secondary flex-grow-1';
			elements.testBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>测试中...';
			break;
		case 'success':
			elements.testBtn.disabled = false;
			elements.testBtn.className = 'btn btn-outline-success flex-grow-1';
			elements.testBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>测试通过';
			break;
		case 'failed':
			elements.testBtn.disabled = false;
			elements.testBtn.className = 'btn btn-outline-danger flex-grow-1';
			elements.testBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i>测试失败';
			break;
		case 'default':
		default:
			elements.testBtn.disabled = false;
			elements.testBtn.className = 'btn btn-outline-primary flex-grow-1';
			elements.testBtn.innerHTML = '<i class="bi bi-link-45deg"></i> 测试链接';
			break;
	}
}

function updateSubmitButton(elements: Elements, loading: boolean): void {
	if (loading) {
		elements.submitBtn.disabled = true;
		elements.submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>添加中...';
	} else {
		elements.submitBtn.disabled = false;
		elements.submitBtn.innerHTML = '添加文档';
	}
}

function showFieldError(field: HTMLInputElement | HTMLTextAreaElement, message: string): void {
	field.setCustomValidity(message);
	field.classList.add('is-invalid');

	const container = field.closest('.mb-3') ?? field.parentElement;
	let feedback = container?.querySelector('.invalid-feedback') as HTMLDivElement | null;
	if (!feedback && container) {
		feedback = document.createElement('div');
		feedback.className = 'invalid-feedback';
		container.appendChild(feedback);
	}
	if (feedback) {
		feedback.textContent = message;
	}
}

function clearFieldError(field: HTMLInputElement | HTMLTextAreaElement): void {
	field.setCustomValidity('');
	field.classList.remove('is-invalid');
	const container = field.closest('.mb-3') ?? field.parentElement;
	const feedback = container?.querySelector('.invalid-feedback') as HTMLDivElement | null;
	if (feedback) {
		feedback.textContent = '';
	}
}

function clearFieldValue(elements: Elements, field: HTMLInputElement | HTMLTextAreaElement): void {
	field.value = '';
	clearFieldError(field);
	clearAutoFilledMark(field);
	field.classList.remove('is-valid');

	if (field === elements.urlInput) {
		appState.lastTestedUrl = null;
		appState.testResult = null;
		updateTestButton(elements, 'default');
		clearFieldValue(elements, elements.nameInput);
		clearFieldValue(elements, elements.basePathInput);
		clearFieldValue(elements, elements.descInput);
		elements.form.classList.remove('was-validated');
	}
}

function validateUrl(elements: Elements): boolean {
	const url = elements.urlInput.value.trim();
	if (url && !isValidSwaggerUrl(url)) {
		showFieldError(elements.urlInput, 'URL格式不正确，应包含swagger或.json路径');
		return false;
	}
	clearFieldError(elements.urlInput);
	return true;
}

function validateName(elements: Elements): boolean {
	const name = elements.nameInput.value.trim();
	if (!name) {
		showFieldError(elements.nameInput, '请输入文档名称');
		return false;
	}
	clearFieldError(elements.nameInput);
	return true;
}

function showAlert(text: string, type: AlertType = 'info'): void {
	vscode.postMessage({
		command: 'showAlert',
		text,
		type,
	});
}

function truncateForNotification(text: string, maxLength: number): string {
	const value = text.trim();
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}...`;
}

function handleFormSubmit(elements: Elements, event: Event): void {
	event.preventDefault();
	event.stopPropagation();

	if (appState.isSubmitting) return;

	if (!elements.form.checkValidity()) {
		elements.form.classList.add('was-validated');
		return;
	}

	const currentUrl = elements.urlInput.value.trim();
	if (currentUrl !== appState.lastTestedUrl) {
		showFieldError(elements.urlInput, '请先测试链接是否可访问');
		showAlert('⚠️ 请先点击"测试链接"按钮验证URL可访问性', 'warning');
		return;
	}

	if (!appState.testResult || !appState.testResult.available) {
		showFieldError(elements.urlInput, '链接测试未通过，请修改后重新测试');
		showAlert('❌ 链接测试未通过，无法添加文档', 'warning');
		return;
	}

	appState.isSubmitting = true;
	updateSubmitButton(elements, true);

	vscode.postMessage({
		command: 'addSwagger',
		url: elements.urlInput.value.trim(),
		name: elements.nameInput.value.trim(),
		basePath: elements.basePathInput.value.trim() || '',
		desc: elements.descInput.value.trim() || '',
	});
}

function handleTestUrl(elements: Elements): void {
	if (appState.isTesting) return;

	const url = elements.urlInput.value.trim();
	if (!url) {
		showFieldError(elements.urlInput, '请输入Swagger URL');
		return;
	}

	if (!isValidSwaggerUrl(url)) {
		showFieldError(elements.urlInput, 'URL格式不正确，请输入有效的Swagger文档URL');
		return;
	}

	appState.isTesting = true;
	appState.lastTestedUrl = url;
	updateTestButton(elements, 'testing');

	vscode.postMessage({
		command: 'testSwaggerUrl',
		url,
	});
}

function handleUrlChange(elements: Elements): void {
	const currentUrl = elements.urlInput.value.trim();
	if (currentUrl !== appState.lastTestedUrl) {
		appState.testResult = null;
		updateTestButton(elements, 'default');
		clearIfAutoFilled(elements.nameInput);
		clearIfAutoFilled(elements.basePathInput);
		clearIfAutoFilled(elements.descInput);
	}
	elements.urlInput.setCustomValidity('');
}

function handleTestResult(elements: Elements, result: Extract<WebviewIncomingMessage, { command: 'testUrlResult' }>): void {
	appState.isTesting = false;
	appState.testResult = { available: result.available, error: result.error, info: result.info };

	if (result.available) {
		updateTestButton(elements, 'success');
		clearFieldError(elements.urlInput);

		if (result.info) {
			if ((isAutoFilled(elements.nameInput) || !elements.nameInput.value.trim()) && result.info.title) {
				elements.nameInput.value = result.info.title;
				elements.nameInput.classList.add('is-valid');
				markAutoFilled(elements.nameInput);
			}

			if ((isAutoFilled(elements.basePathInput) || !elements.basePathInput.value.trim()) && result.info.basePath) {
				elements.basePathInput.value = result.info.basePath;
				markAutoFilled(elements.basePathInput);
			}

			if ((isAutoFilled(elements.descInput) || !elements.descInput.value.trim()) && result.info.description) {
				elements.descInput.value = result.info.description;
				markAutoFilled(elements.descInput);
			}
		}

		addTimer(
			window.setTimeout(() => {
				if (appState.testResult?.available === true) {
					updateTestButton(elements, 'default');
				}
			}, 3000)
		);

		showAlert('✅ Swagger文档可正常访问，已自动填充文档信息', 'info');
	} else {
		updateTestButton(elements, 'failed');
		showFieldError(elements.urlInput, '无法访问此 Swagger URL（请查看 VS Code 通知了解详情）');

		const detail = truncateForNotification(result.error || 'URL测试失败', 600);
		showAlert(`Swagger URL 测试失败：${detail}`, 'warning');

		addTimer(
			window.setTimeout(() => {
				if (appState.testResult?.available === false) {
					updateTestButton(elements, 'default');
				}
			}, 3000)
		);

		// 失败详情已通过 showAlert 发送到 VS Code
	}
}

function handleAddResult(elements: Elements, result: Extract<WebviewIncomingMessage, { command: 'addSwaggerResult' }>): void {
	const loading = Boolean(result.loading);
	if (loading) return;

	appState.isSubmitting = false;
	updateSubmitButton(elements, false);
}

function setupFormValidation(elements: Elements): void {
	elements.urlInput.addEventListener('invalid', function () {
		if (this.validity.valueMissing) {
			this.setCustomValidity('请输入Swagger URL');
		} else if (this.validity.typeMismatch) {
			this.setCustomValidity('请输入有效的URL格式');
		} else {
			this.setCustomValidity('');
		}
	});

	elements.nameInput.addEventListener('invalid', function () {
		if (this.validity.valueMissing) {
			this.setCustomValidity('请输入文档名称');
		} else {
			this.setCustomValidity('');
		}
	});
}

function bindEvents(elements: Elements): void {
	elements.form.addEventListener('submit', (e) => handleFormSubmit(elements, e));
	elements.testBtn.addEventListener('click', () => handleTestUrl(elements));
	elements.urlInput.addEventListener('input', () => handleUrlChange(elements));
	elements.nameInput.addEventListener('input', () => clearAutoFilledMark(elements.nameInput));
	elements.basePathInput.addEventListener('input', () => clearAutoFilledMark(elements.basePathInput));
	elements.descInput.addEventListener('input', () => clearAutoFilledMark(elements.descInput));
	elements.urlInput.addEventListener('blur', () => validateUrl(elements));
	elements.nameInput.addEventListener('blur', () => validateName(elements));

	elements.form.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		const button = target.closest('button[data-clear-target]') as HTMLButtonElement | null;
		if (!button) return;

		event.preventDefault();
		const inputId = button.getAttribute('data-clear-target');
		if (!inputId) return;

		const field = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement | null;
		if (!field) return;
		clearFieldValue(elements, field);
	});
}

function bindMessageHandler(elements: Elements): void {
	window.addEventListener('message', (event: MessageEvent<WebviewIncomingMessage>) => {
		const message = event.data;
		switch (message.command) {
			case 'testUrlResult':
				handleTestResult(elements, message);
				break;
			case 'addSwaggerResult':
				handleAddResult(elements, message);
				break;
		}
	});
}

function main(): void {
	const elements = getElements();
	bindEvents(elements);
	setupFormValidation(elements);
	bindMessageHandler(elements);

	window.addEventListener('beforeunload', clearAllTimers);
	window.addEventListener('unload', clearAllTimers);
}

document.addEventListener('DOMContentLoaded', main);
