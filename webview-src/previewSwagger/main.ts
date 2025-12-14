export {};

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
declare const bootstrap: any;

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

type SwaggerTag = {
	name: string;
	description?: string;
};

type SwaggerDefinitions = Record<string, SwaggerModel>;

type SwaggerSpec = {
	tags?: SwaggerTag[];
	paths?: Record<string, SwaggerPathItem>;
	definitions?: SwaggerDefinitions;
};

type SwaggerPathItem = Record<string, SwaggerOperation>;

type SwaggerOperation = {
	tags?: string[];
	operationId?: string;
	summary?: string;
	parameters?: SwaggerParameter[];
	responses?: Record<string, SwaggerResponse>;
	[key: string]: any;
};

type SwaggerParameter = {
	in?: string;
	name?: string;
	required?: boolean;
	description?: string;
	schema?: SwaggerSchema;
	[key: string]: any;
};

type SwaggerResponse = {
	description?: string;
	schema?: SwaggerSchema;
	[key: string]: any;
};

type SwaggerSchema = {
	$ref?: string;
	type?: string;
	description?: string;
	items?: SwaggerSchema;
	properties?: Record<string, SwaggerSchema>;
	required?: string[];
	format?: string;
	enum?: string[];
	[key: string]: any;
};

type SwaggerModel = {
	description?: string;
	properties?: Record<string, SwaggerSchema>;
	required?: string[];
	[key: string]: any;
};

type ApiItem = SwaggerOperation & {
	path: string;
	method: HttpMethod;
	operationId: string;
};

type SelectedApis = Record<string, ApiItem[]>;

type ExistingApi = {
	path: string;
	method: string;
};

type ExistingApiData = Record<string, ExistingApi[]>;

type PreviewData = {
	basicInfo: any;
	swaggerJson: SwaggerSpec;
};

type VscodePostMessage =
	| { command: 'refreshSwaggerDoc' }
	| { command: 'exportSwaggerDoc'; content: SelectedApis }
	| { command: 'updateBasePath'; basePath: string }
	| { command: 'getExistingApis' };

type WebviewIncomingMessage =
	| { command: 'existingApisResponse'; existingApiData?: ExistingApiData }
	| { command: 'updateSwaggerContent'; content: string }
	| { command: 'refreshSwaggerDocFailed' }
	| { command: 'exportApiSuccess' }
	| { command: 'exportApiFailed' };

declare global {
	interface Window {
		__SWAGGER_PREVIEW_DATA__?: PreviewData;
		globalTimers: Array<ReturnType<typeof setTimeout>>;
	}
}

const vscode = acquireVsCodeApi();

function postToVscode(message: VscodePostMessage): void {
	vscode.postMessage(message);
}

// 全局定时器管理
window.globalTimers = [];
function addGlobalTimer(timerId: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
	window.globalTimers.push(timerId);
	return timerId;
}
function clearAllGlobalTimers(): void {
	window.globalTimers.forEach((timer) => clearTimeout(timer));
	window.globalTimers = [];
}
// 页面卸载时清理所有定时器
window.addEventListener('beforeunload', clearAllGlobalTimers);
window.addEventListener('unload', clearAllGlobalTimers);

// 安全转义HTML特殊字符
function escapeHtml(unsafe: unknown): string {
	if (!unsafe) return '';
	return unsafe.toString()
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function getEl<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error(`Missing element #${id}`);
	}
	return el as T;
}

function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
	const el = root.querySelector(selector);
	if (!el) {
		throw new Error(`Missing element ${selector}`);
	}
	return el as T;
}

function normalizeControllerName(name: string): string {
	const clean = (name || '')
		.replace(/Controller$/i, '')
		.replace(/[^a-zA-Z0-9_]/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((s) => s[0].toUpperCase() + s.slice(1))
		.join('');
	return clean + 'Controller';
}

const basicContainerCard = getEl<HTMLDivElement>('basic-info-card');
const basicContainer = queryRequired<HTMLDivElement>(basicContainerCard, '.container-fluid');
const interfaceContainerCard = getEl<HTMLDivElement>('interface-card');
const interfaceContainer = queryRequired<HTMLDivElement>(interfaceContainerCard, '.container-fluid');
const toastLive = getEl<HTMLDivElement>('liveToast');
const toastBody = queryRequired<HTMLDivElement>(toastLive, '.toast-body');

const toast = new bootstrap.Toast(toastLive);

function showToast(message: string): void {
	toastBody.innerHTML = message;
	toast.show();
}

const refreshBtn = getEl<HTMLButtonElement>('refresh-btn');
const exportBtn = getEl<HTMLButtonElement>('export-btn');

let basicContent: any = null;
let swaggerJsonData: SwaggerSpec | null = null;
let selectedApis: SelectedApis = {};
let existingApiData: ExistingApiData = {};

// 更新已选接口数量显示
function updateSelectedCount(): void {
	const selectedCountElement = document.getElementById('selected-count');
	if (!selectedCountElement) return;

	let totalCount = 0;
	Object.values(selectedApis).forEach(apis => {
		if (Array.isArray(apis)) {
			totalCount += apis.length;
		}
	});

	selectedCountElement.textContent = '已选 ' + totalCount + ' 个';

	// 根据数量调整样式
	if (totalCount > 0) {
		selectedCountElement.className = 'badge bg-success text-white';
	} else {
		selectedCountElement.className = 'badge bg-secondary text-white';
	}
}

// 将目标吸顶到容器顶部（仅当需要滚动时），可滚动容器为 interface-card
function scrollToTopInContainer(container: HTMLElement, target: HTMLElement, margin = 6): void {
	if (!container || !target) return;
	const containerRect = container.getBoundingClientRect();
	const targetRect = target.getBoundingClientRect();
	// 目标相对容器内容区域的绝对 top 值
	const desiredTop = targetRect.top - containerRect.top + container.scrollTop - margin;
	// 只有当目标不在顶部附近且容器可滚动时才滚动
	if (Math.abs(container.scrollTop - desiredTop) > 2 && container.scrollHeight > container.clientHeight) {
		container.scrollTo({ top: desiredTop, behavior: 'smooth' });
	}
}

// 清除所有筛选内容的函数
function clearAllFilters(): void {
	// 清除Controller级别的筛选
	const cSearchInput = document.querySelector<HTMLInputElement>('#controller-toolbar .controller-search-input');
	if (cSearchInput) {
		cSearchInput.value = '';
		// 显示所有Controller
		document.querySelectorAll<HTMLElement>('#controllerAccordion .accordion-item').forEach((item) => {
			item.style.display = '';
		});
	}

	// 清除所有API级别的筛选
	document.querySelectorAll<HTMLInputElement>('.api-search-input').forEach((input) => {
		input.value = '';
		// 显示对应Controller下的所有API
		const accordionBody = input.closest('.accordion-body');
		if (accordionBody) {
			accordionBody.querySelectorAll<HTMLElement>('.list-group-item').forEach((item) => {
				item.style.display = '';
			});
		}
	});
}

refreshBtn.addEventListener('click', handleRefreshDoc);

exportBtn.addEventListener('click', handleExportDoc);

// 文档信息展开/收起功能
const toggleInfoBtn = getEl<HTMLButtonElement>('toggle-info-btn');
const basicInfoCard = getEl<HTMLDivElement>('basic-info-card');

toggleInfoBtn.addEventListener('click', function () {
	basicInfoCard.classList.toggle('collapsed');
});

async function handleRefreshDoc(this: HTMLButtonElement): Promise<void> {
	const btn = this;
	btn.disabled = true;
	exportBtn.disabled = true;
	btn.classList.add('loading');
	btn.innerHTML = `
		<span class="spinner-border spinner-border-sm" role="status"></span>
		刷新中...
	`;

	// 清除所有筛选内容
	clearAllFilters();

	postToVscode({ command: 'refreshSwaggerDoc' });

	// 刷新按钮状态将通过全局消息监听器处理
}

function handleExportDoc(this: HTMLButtonElement): void {
	// 检查是否选中了接口
	const hasSelectedApis = Object.keys(selectedApis).some(controller =>
		selectedApis[controller] && selectedApis[controller].length > 0
	);

	if (!hasSelectedApis) {
		showToast('请先选择要导出的接口！');
		return;
	}

	const btn = this;
	btn.disabled = true;
	refreshBtn.disabled = true;
	btn.classList.add('loading');
	btn.innerHTML = `
		<span class="spinner-border spinner-border-sm" role="status"></span>
		导出中...
	`;

	postToVscode({ command: 'exportSwaggerDoc', content: selectedApis });

	// 导出按钮状态将通过全局消息监听器处理
}

function resetButtonState(btn: HTMLButtonElement, type: 'refresh' | 'export'): void {
	btn.disabled = false;
	btn.classList.remove('loading');
	switch (type) {
		case 'refresh':
			exportBtn.disabled = false;
			btn.innerHTML = `
				<svg t="1754470396208" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6944" width="18" height="18"><path d="M887.456 443.744l102.4 136.512h-76.064c-32.48 192.544-200 339.2-401.792 339.2a407.104 407.104 0 0 1-342.56-186.752 32 32 0 0 1 53.76-34.688A343.104 343.104 0 0 0 512 855.456c166.304 0 305.024-118.208 336.672-275.2h-63.616l102.4-136.512zM512 104.544c145.664 0 278.016 77.12 350.848 200.16a32 32 0 0 1-55.04 32.608A343.232 343.232 0 0 0 512 168.544c-178.176 0-324.64 135.648-341.76 309.312h68.704l-102.4 136.544-102.4-136.544H105.92C123.296 268.8 298.464 104.544 512 104.544z" fill="#515151" p-id="6945"></path></svg>
				刷新文档
			`;
			break
		case 'export':
			refreshBtn.disabled = false;
			btn.innerHTML = `
				<svg t="1754470912280" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8706" width="18" height="18"><path d="M909.5 671.4h-625c-17.7 0-32-14.3-32-32s14.3-32 32-32h625c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8707" fill="#515151"></path><path d="M904.8 662.7c-8.2 0-16.4-3.1-22.6-9.4l-225-225c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l225 225c12.5 12.5 12.5 32.8 0 45.3-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8708" fill="#515151"></path><path d="M679.5 905.2c-8.2 0-16.4-3.1-22.6-9.4-12.5-12.5-12.5-32.8 0-45.3l225-225c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-225 225c-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8709" fill="#515151"></path><path d="M448.2 958.3H229.7c-89.3 0-162-72.7-162-162V228.2c0-89.3 72.7-162 162-162h568.1c89.3 0 162 72.7 162 162v208.1c0 17.7-14.3 32-32 32s-32-14.3-32-32V228.2c0-54-44-98-98-98H229.7c-54 0-98 44-98 98v568.1c0 54 44 98 98 98h218.5c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8710" fill="#515151"></path></svg>
				导出接口
			`;
			break
	}
}

function initSwaggerPreview(useExistingData = false): void {
	basicContainer.innerHTML = '';
	interfaceContainer.innerHTML = '';
	selectedApis = {};
	existingApiData = {};
	updateSelectedCount();

	try {
		// 只在首次加载时从模板变量解析，刷新时使用已更新的全局变量
		if (!useExistingData) {
			basicContent = window.__SWAGGER_PREVIEW_DATA__?.basicInfo;
			swaggerJsonData = window.__SWAGGER_PREVIEW_DATA__?.swaggerJson ?? null;
		}
		const spec = swaggerJsonData;
		if (!spec) {
			throw new Error('swaggerJson is empty');
		}
		// 1. 渲染基础信息
		renderBasicInfo(basicContent);

		// 2. 请求已存在的API列表
		postToVscode({ command: 'getExistingApis' });

		// 3. 渲染Controller列表（直接使用规范化的 tags）
		const tags = spec.tags || [];
		if (tags && tags.length) {
			renderControllerList(tags);
		} else {
			interfaceContainer.innerHTML = `
				<div class="alert alert-info">
					未找到Controller定义
				</div>
			`;
		}
	} catch (err: any) {
		console.error("初始化失败:", err);
		basicContainer.innerHTML = `
			<div class="alert alert-danger">
				数据解析失败: ${escapeHtml(err?.message)}
			</div>
		`;
		interfaceContainerCard.style.display = "none";
	}
}

function renderBasicInfo(content: any): void {
	// 格式化渲染
	basicContainer.innerHTML = `
		<div class="row mb-2">
			<div class="col-md-2 fw-bold">文档名称：</div>
			<div class="col-md-10">${content.name || "无"}</div>
		</div>
		<div class="row mb-2">
			<div class="col-md-2 fw-bold">访问地址：</div>
			<div class="col-md-10">
				<a href="${content.url}" target="_blank">${content.url}</a>
			</div>
		</div>
		<div class="row mb-2">
			<div class="col-md-2 fw-bold">Base Path：</div>
			<div class="col-md-10">
				<div id="basePath-display" class="d-flex align-items-center gap-2">
					<span id="basePath-value" class="text-primary">${content.basePath || '/'}</span>
					<button id="basePath-edit-btn" class="btn btn-sm btn-outline-primary" style="padding: 0.1rem 0.5rem; font-size: 0.85rem;">
						<i class="bi bi-pencil"></i> 编辑
					</button>
				</div>
				<div id="basePath-edit" class="d-none">
					<div class="d-flex align-items-center gap-2">
						<input type="text" id="basePath-input" class="form-control form-control-sm" value="${content.basePath || '/'}" placeholder="/api/v1" style="max-width: 300px;" />
						<button id="basePath-confirm-btn" class="btn btn-sm btn-success">
							<i class="bi bi-check-lg"></i> 确认
						</button>
						<button id="basePath-cancel-btn" class="btn btn-sm btn-secondary">
							<i class="bi bi-x-lg"></i> 取消
						</button>
					</div>
					<div class="form-text">此路径将添加到所有接口前缀</div>
				</div>
			</div>
		</div>
		<div class="row">
			<div class="col-md-2 fw-bold">文档描述：</div>
			<div class="col-md-10 text-muted">${content.desc || "暂无描述"}</div>
		</div>
	`;

	// 绑定 basePath 编辑事件
	setupBasePathEdit(content);
}

function setupBasePathEdit(content: any): void {
	const basePathEditBtn = getEl<HTMLButtonElement>('basePath-edit-btn');
	const basePathConfirmBtn = getEl<HTMLButtonElement>('basePath-confirm-btn');
	const basePathCancelBtn = getEl<HTMLButtonElement>('basePath-cancel-btn');
	const basePathInput = getEl<HTMLInputElement>('basePath-input');
	const basePathDisplay = getEl<HTMLDivElement>('basePath-display');
	const basePathEdit = getEl<HTMLDivElement>('basePath-edit');
	const basePathValue = getEl<HTMLSpanElement>('basePath-value');

	let originalValue = content.basePath || '/';

	basePathEditBtn.addEventListener('click', () => {
		originalValue = content.basePath || '/';
		basePathInput.value = originalValue;
		basePathDisplay.classList.add('d-none');
		basePathEdit.classList.remove('d-none');
		basePathInput.focus();
	});

	basePathConfirmBtn.addEventListener('click', () => {
		const newPath = basePathInput.value.trim() || '/';
		if (newPath !== originalValue) {
			// 更新显示
			content.basePath = newPath;
			basePathValue.textContent = newPath;

			// 发送更新消息到后端
			postToVscode({ command: 'updateBasePath', basePath: newPath });
		}
		basePathDisplay.classList.remove('d-none');
		basePathEdit.classList.add('d-none');
	});

	basePathCancelBtn.addEventListener('click', () => {
		// 恢复原值
		basePathInput.value = originalValue;
		basePathDisplay.classList.remove('d-none');
		basePathEdit.classList.add('d-none');
	});
}

function renderControllerList(tags: any[]): void {
	// 1. 按首字母排序 (支持中文)
	const sortedTags = [...tags].sort((a, b) =>
		a.name.localeCompare(b.name, "zh-CN")
	);

	// 2. 生成Accordion结构
	interfaceContainer.innerHTML = `
		<div class="accordion" id="controllerAccordion">
			${sortedTags
				.map(
					(tag, index) => `
						<div class="accordion-item" data-controller-name="${escapeHtml(tag.name)}" data-controller-desc="${escapeHtml(tag.description || '')}">
							<h2 class="accordion-header">
								<button class="accordion-button ${index > 0 ? "collapsed" : ""}"
										type="button"
										data-bs-toggle="collapse"
										data-bs-target="#collapse${index}"
										aria-expanded="${index === 0}">
									<strong>${escapeHtml(tag.name)}</strong>
									${
										tag.description
											? `<span class="text-muted ms-2">${escapeHtml(
													tag.description
												)}</span>`
											: ""
									}
								</button>
							</h2>
							<div id="collapse${index}"
								class="accordion-collapse collapse"
								data-bs-parent="#controllerAccordion">
								<div class="accordion-body" data-tag="${escapeHtml(tag.name)}">
									<!-- 接口列表将在这里动态加载 -->
									<div class="text-center py-3">
										<div class="spinner-border text-primary" role="status">
											<span class="visually-hidden">加载中...</span>
										</div>
									</div>
								</div>
							</div>
						</div>
				`
				)
				.join("")}
		</div>
	`;

	// 3. 控制器级别筛选（使用顶部工具栏输入框，不随列表滚动）
	const cSearchInput = document.querySelector<HTMLInputElement>('#controller-toolbar .controller-search-input');
	const cSearchClear = document.querySelector<HTMLButtonElement>('#controller-toolbar .controller-search-clear');
	function applyControllerFilter(q: string): void {
		const kw = (q || '').trim().toLowerCase();
		interfaceContainer.querySelectorAll<HTMLElement>('#controllerAccordion .accordion-item').forEach((item) => {
			const name = (item.getAttribute('data-controller-name') || '').toLowerCase();
			const desc = (item.getAttribute('data-controller-desc') || '').toLowerCase();
			item.style.display = kw === '' || name.includes(kw) || desc.includes(kw) ? '' : 'none';
		});
	}
	if (cSearchInput && cSearchClear) {
		cSearchInput.addEventListener('input', () => applyControllerFilter(cSearchInput.value));
		cSearchClear.addEventListener('click', () => {
			cSearchInput.value = '';
			applyControllerFilter('');
		});
	}

	// 4. 添加展开事件监听
	document.querySelectorAll<HTMLButtonElement>(".accordion-button").forEach((btn) => {
		btn.addEventListener("click", function (this: HTMLButtonElement, e: Event) {
			e.stopPropagation(); // 阻止事件冒泡
			const accordionItem = this.closest<HTMLElement>('.accordion-item');
			if (!accordionItem) return;
			const accordionBody = accordionItem.querySelector<HTMLElement>('.accordion-body');
			const collapseEl = accordionItem.querySelector<HTMLElement>('.accordion-collapse');
			if (!accordionBody || !collapseEl) return;
			const tagName = accordionBody.dataset.tag as string;

			// 仅在首次展开时加载
			if (!accordionBody.querySelector('.list-group')) {
				loadTagApis(tagName);
			} else if (existingApiData && Object.keys(existingApiData).length > 0) {
				const normalizedTagName = normalizeControllerName(tagName);
				Object.entries(existingApiData).forEach(([controllerName, apis]) => {
					if (normalizedTagName === controllerName) {
						markApiItemsInController(accordionBody, apis);
					}
				});
			}

			// 等待折叠面板完成展开后再对齐，避免高度变化导致偏差
			const onShown = () => {
				scrollToTopInContainer(interfaceContainerCard, accordionItem);
				collapseEl.removeEventListener('shown.bs.collapse', onShown);
			};
			collapseEl.addEventListener('shown.bs.collapse', onShown);
		});
	});

	// 5. 主动触发第一个按钮的点击事件
	addGlobalTimer(setTimeout(() => {
		const firstButton = document.querySelector('#controllerAccordion .accordion-button');
		if (firstButton) {
			firstButton.dispatchEvent(new MouseEvent('click', {
				bubbles: true,
				cancelable: true
			}));
		}
	}, 50));
}

function loadTagApis(tagName: string): void {

	const accordionBody = document.querySelector<HTMLElement>(`.accordion-body[data-tag="${escapeHtml(tagName)}"]`);
	if (!accordionBody) {
		console.error('未找到对应的accordion-body');
		return;
	}
	const accordionBodyEl: HTMLElement = accordionBody;

	if (!swaggerJsonData || !swaggerJsonData.paths) {
		accordionBody.innerHTML = '<div class="alert alert-warning">无接口定义</div>';
		return;
	}
	const paths: Record<string, SwaggerPathItem> = swaggerJsonData.paths;
	const definitions: SwaggerDefinitions = swaggerJsonData.definitions || {};

	// 过滤出包含当前tag的path
	const apiList: ApiItem[] = Object.entries(paths)
		.flatMap(([path, methods]) =>
			Object.entries(methods)
				.filter(([_, methodObj]) => {
					const op = methodObj as SwaggerOperation;
					// 如果是 default tag，匹配没有 tags 的接口
					if (tagName === 'default') {
						return !op.tags || op.tags.length === 0;
					}
					// 其他 tag，正常匹配
					return !!op.tags && op.tags.includes(tagName);
				})
				.map(([method, methodObj]) => {
					const op = methodObj as SwaggerOperation;
					return {
						path,
						method: String(method).toLowerCase() as HttpMethod,
						operationId: op.operationId
							? `op-${escapeHtml(op.operationId)}`
							: `api-${escapeHtml(tagName)}-${String(method).toLowerCase()}-${Date.now().toString(36)}`,
						...op
					} as ApiItem;
				})
		)
		// 按照 operationId 排序，如果没有 operationId 则按照 summary 排序
		.sort((a, b) => {
			const aId = String(a.operationId || a.summary || a.path.split('/').pop() || '');
			const bId = String(b.operationId || b.summary || b.path.split('/').pop() || '');
			return aId.localeCompare(bId, "zh-CN");
		});

	if (apiList.length === 0) {
		accordionBody.innerHTML = '<div class="alert alert-info">该Controller下无接口</div>';
		return;
	}

	// 渲染API列表
	accordionBodyEl.innerHTML = `
		<div class="d-flex justify-content-end align-items-center mb-2 gap-2">
			<div class="input-group input-group-sm">
				<input type="text" class="form-control api-search-input" placeholder="搜索接口路径或名称..." />
				<button class="btn btn-outline-secondary api-search-clear" type="button" title="清除">
					&times;
				</button>
			</div>
			<div class="btn-group btn-group-sm" role="group">
				<button type="button" class="btn btn-outline-primary select-all-btn">全部选中</button>
				<button type="button" class="btn btn-outline-secondary deselect-all-btn">取消全选</button>
			</div>
		</div>
		<div class="list-group list-group-flush">
			${apiList.map(api => `
				<div class="list-group-item border-0 px-0 py-2" data-path="${escapeHtml(api.path)}" data-name="${escapeHtml(api.summary || '')}">
					<div class="api-collapse-header d-flex justify-content-between align-items-stretch">
						<a href="#${api.operationId}"
							class="api-item-link text-decoration-none text-reset"
							data-bs-toggle="collapse"
							aria-expanded="false"
						>
							<span class="badge ${
								api.method === 'get' ? 'bg-primary' :
								api.method === 'post' ? 'bg-success' :
								api.method === 'put' ? 'bg-warning text-dark' :
								api.method === 'delete' ? 'bg-danger' : 'bg-secondary'
							} me-2">
								${api.method.toUpperCase()}
							</span>
							<div>
								<div class="fw-bold api-path">${escapeHtml(api.path)}</div>
								<small class="text-muted">${api.summary ? escapeHtml(api.summary) : '无描述'}</small>
							</div>
						</a>
						<div class="copy-api-path" data-path="${api.path}">
							<svg t="1754554762483" class="icon" viewBox="0 0 1025 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14492" width="20" height="20"><path d="M688.7 1023.3H142.2c-76.2 0-138.1-62-138.1-138.1V338.7c0-76.2 62-138.1 138.1-138.1h546.5c76.2 0 138.1 62 138.1 138.1v546.5c0 76.1-62 138.1-138.1 138.1zM142.2 276.6c-34.3 0-62.1 27.9-62.1 62.1v546.5c0 34.3 27.9 62.1 62.1 62.1h546.5c34.3 0 62.1-27.9 62.1-62.1V338.7c0-34.3-27.9-62.1-62.1-62.1H142.2z" fill="#515151" p-id="14493"></path><path d="M987.8 447.8c-21 0-38-17-38-38V141.7c0-34.3-27.9-62.1-62.1-62.1H614.1c-21 0-38-17-38-38s17-38 38-38h273.6c76.2 0 138.1 62 138.1 138.1v268.1c0 21-17 38-38 38z" fill="#515151" p-id="14494"></path></svg>
						</div>
						<div class="form-check">
							<input type="checkbox" class="form-check-input">
						</div>
					</div>
					<div class="collapse mt-2" id="${api.operationId}">
						<div class="card card-body bg-light">
							<div class="placeholder-content"
								data-api-id="${api.operationId}"
							>
								${api.operationId ? '' : '<div class="alert alert-warning mb-0">此接口缺少operationId</div>'}
							</div>
						</div>
					</div>
				</div>
			`).join('')}
		</div>
	`;

	// API的点击事件
	accordionBodyEl.querySelectorAll<HTMLAnchorElement>('.api-item-link').forEach((link) => {
		link.addEventListener('click', function (this: HTMLAnchorElement, e: Event) {
			const apiId = this.getAttribute('href')?.substring(1) || '';
			const detailPanel = document.querySelector<HTMLElement>(`[data-api-id="${apiId}"]`);
			if (!detailPanel) return;

			// 通过data属性获取原始数据
			const apiData = apiList.find((api) => api.operationId === apiId);

			if (apiData) {
				// 1. 渲染请求参数
				let parametersHtml = '';
				if (apiData.parameters && apiData.parameters.length) {
					parametersHtml = `
						<div class="mb-4">
							<h6 class="border-bottom pb-2">📤 请求参数</h6>
							${renderParameters(apiData.parameters, definitions)}
						</div>
					`;
				}

				// 2. 渲染响应参数
				let responsesHtml = '';
				if (apiData.responses) {
					responsesHtml = `
						<div class="mt-4">
							<h6 class="border-bottom pb-2">📥 响应结构</h6>
							${renderResponses(apiData.responses, definitions)}
						</div>
					`;
				}

				detailPanel.innerHTML = parametersHtml + responsesHtml;
			}
		});
	});

	// DTO的点击事件
	accordionBodyEl.addEventListener('click', function (e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target) return;

		// 处理 DTO 引用点击（叠加模式）
		if (target.matches('.dto-ref')) {
			e.preventDefault();
			const refKey = target.dataset.ref || '';
			const modelDef = target.closest<HTMLElement>('.model-definition');
			const container = modelDef?.querySelector<HTMLElement>('.dto-ref-container');
			if (!container) return;

			// 检查是否已存在完全相同的 DTO 内容
			const newContent = renderModel(refKey, definitions);
			if (isSameDtoContent(refKey, newContent, container)) {
				target.classList.remove('active');
				return;
			}

			// 检查是否已存在当前 DTO（无论内容是否一致）
			const existingDetails = container.querySelector<HTMLElement>(`.dto-ref-details[data-ref="${refKey}"]`);
			if (existingDetails) {
				existingDetails.remove();
				target.classList.remove('active');
				return;
			}

			// 渲染新的 DTO
			const details = document.createElement('div');
			details.className = 'dto-ref-details';
			details.dataset.ref = refKey;
			details.innerHTML = newContent;

			container.appendChild(details);
			target.classList.add('active');
		}

		// 处理请求参数的 DTO 点击
		if (target.matches('.request-dto-toggle')) {
			e.preventDefault();
			const refKey = target.dataset.ref || '';
			const table = target.closest<HTMLElement>('.request-parameters-table');
			const container = table?.nextElementSibling as HTMLElement | null;
			if (!container) return;

			const existingDetails = container.querySelector<HTMLElement>(`.request-dto-details[data-ref="${refKey}"]`);
			if (existingDetails) {
				existingDetails.remove();
				target.classList.remove('active');
				return;
			}

			const allDetails = container.querySelectorAll<HTMLElement>('.request-dto-details');
			allDetails.forEach((detail) => detail.remove());

			const details = document.createElement('div');
			details.className = 'request-dto-details';
			details.dataset.ref = refKey;
			details.innerHTML = renderModel(refKey, definitions);

			container.appendChild(details);
			target.classList.add('active');
		}

		// 处理响应结构的 DTO 点击
		if (target.matches('.dto-toggle')) {
			e.preventDefault();
			const toggle = target;
			const container = toggle.closest<HTMLElement>('.dto-container');
			const details = toggle.nextElementSibling as HTMLElement | null;
			if (!container || !details) return;

			if (details && (details as any).classList.contains('dto-details')) {
				const dynamicDetails = container.querySelectorAll<HTMLElement>('.dto-details[data-ref]');
				dynamicDetails.forEach((detail) => detail.remove());

				details.style.display = details.style.display === 'none' ? 'block' : 'none';
				toggle.classList.toggle('active');
			}
		}
	});

	// 复制API路径
	accordionBodyEl.querySelectorAll<HTMLElement>('.copy-api-path').forEach((item) => {
		item.addEventListener('click', function (this: HTMLElement) {
			const path = this.getAttribute('data-path') || '';
			try {
				navigator.clipboard.writeText(path);
				showToast('API路径已复制！');
			} catch (error) {
				showToast('API路径复制失败');
			}
		});
	});

	// 选择API
	accordionBodyEl.querySelectorAll<HTMLInputElement>('.form-check-input').forEach((item) => {
		item.addEventListener('change', function (this: HTMLInputElement) {
			const listItem = this.closest<HTMLElement>('.list-group-item');
			if (!listItem) return;
			const apiItemLink = listItem.querySelector<HTMLElement>('.api-item-link');
			if (!apiItemLink) return;
			const apiPath = (apiItemLink.querySelector<HTMLElement>('.api-path')?.textContent || '').trim();
			const methodBadge = apiItemLink.querySelector<HTMLElement>('.badge');
			const method = methodBadge ? (methodBadge.textContent || '').trim().toLowerCase() : '';
			const controller = tagName;
			const apiData = apiList.find((api) => api.path === apiPath && api.method === (method as HttpMethod));

			if (this.checked) {
				listItem.classList.add('selected-api');
				if (!selectedApis[controller]) {
					selectedApis[controller] = [];
				}
				// 避免重复添加
				if (!selectedApis[controller].some((api) => api.path === apiPath && api.method === (method as HttpMethod))) {
					if (apiData) selectedApis[controller].push({ ...apiData });
				}
			} else {
				listItem.classList.remove('selected-api');
				if (selectedApis[controller]) {
					selectedApis[controller] = selectedApis[controller].filter(
						(api) => !(api.path === apiPath && api.method === (method as HttpMethod))
					);
					// 如果该 controller 下已无 API，移除该 controller
					if (selectedApis[controller].length === 0) {
						delete selectedApis[controller];
					}
				}
			}
			// 更新已选接口数量显示
			updateSelectedCount();
		});
	});

	// 全选/取消全选
	const selectAllBtn = accordionBodyEl.querySelector<HTMLButtonElement>('.select-all-btn');
	const deselectAllBtn = accordionBodyEl.querySelector<HTMLButtonElement>('.deselect-all-btn');
	if (selectAllBtn) {
		selectAllBtn.addEventListener('click', () => {
			const checkboxes = accordionBodyEl.querySelectorAll<HTMLInputElement>('.form-check-input');
			checkboxes.forEach((cb) => {
				if (!cb.checked) {
					cb.checked = true;
					cb.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});
		});
	}
	if (deselectAllBtn) {
		deselectAllBtn.addEventListener('click', () => {
			const checkboxes = accordionBody.querySelectorAll<HTMLInputElement>('.form-check-input');
			checkboxes.forEach((cb) => {
				if (cb.checked) {
					cb.checked = false;
					cb.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});
		});
	}

	// 搜索过滤（按接口路径或名称）
	const searchInput = accordionBodyEl.querySelector<HTMLInputElement>('.api-search-input');
	const searchClear = accordionBodyEl.querySelector<HTMLButtonElement>('.api-search-clear');
	function applyFilter(q: string) {
		const kw = (q || '').trim().toLowerCase();
		accordionBodyEl.querySelectorAll<HTMLElement>('.list-group-item').forEach((li) => {
			const path = (li.dataset.path || '').toLowerCase();
			const name = (li.dataset.name || '').toLowerCase();
			li.style.display = kw === '' || path.includes(kw) || name.includes(kw) ? '' : 'none';
		});
	}
	if (searchInput) {
		searchInput.addEventListener('input', () => applyFilter(searchInput.value));
	}
	if (searchClear) {
		searchClear.addEventListener('click', () => {
			if (searchInput) searchInput.value = '';
			applyFilter('');
		});
	}

	// 标识当前控制器中的已存在API
	if (existingApiData && Object.keys(existingApiData).length > 0) {
		const normalizedTagName = normalizeControllerName(tagName);
		Object.entries(existingApiData).forEach(([controllerName, apis]) => {
			if (normalizedTagName === controllerName) {
				markApiItemsInController(accordionBodyEl, apis);
			}
		});
	}
}

function isSameDtoContent(refKey: string, newContent: string, container: Element): boolean {
	const existingDetails = container.querySelector(`.dto-ref-details[data-ref="${refKey}"]`);
	if (!existingDetails) return false;
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = newContent;
	return existingDetails.innerHTML === tempDiv.innerHTML;
}

function renderParameters(parameters: SwaggerParameter[], definitions: SwaggerDefinitions): string {
	return `
		<table class="table table-sm table-bordered text-center request-parameters-table">
			<thead class="table-light">
				<tr>
					<th width="15%">参数位置</th>
					<th width="20%">参数名</th>
					<th width="15%">类型</th>
					<th width="10%">必需</th>
					<th>描述</th>
				</tr>
			</thead>
			<tbody>
				${parameters
					.map(
						(param: SwaggerParameter) => `
							<tr>
								<td>${param.in || '-'}</td>
								<td><code>${escapeHtml(param.name || '')}</code></td>
								<td>${resolveType(param.schema ?? param, definitions, true)}</td>
								<td>${param.required ? '✓' : ''}</td>
								<td>${param.description || '-'}</td>
							</tr>
						`
					)
					.join('')}
			</tbody>
		</table>
		<div class="request-dto-container mt-3"></div>
	`;
}

function renderResponses(responses: Record<string, SwaggerResponse>, definitions: SwaggerDefinitions): string {
	return Object.entries(responses)
		.map(
			([statusCode, response]: [string, SwaggerResponse]) => `
				<div class="mb-3">
					<div class="d-flex align-items-center mb-2">
						<span class="badge ${String(statusCode).startsWith('2') ? 'bg-success' : 'bg-warning'} me-2">
							HTTP ${statusCode}
						</span>
						<small class="text-muted">${response.description || '无描述'}</small>
					</div>
					${response.schema ? renderSchema(response.schema, definitions) : '<p>无数据定义</p>'}
				</div>
			`
		)
		.join('');
}

function renderSchema(schema: SwaggerSchema, definitions: SwaggerDefinitions): string {
	if (!schema) {
		return '<span class="text-muted">any</span>';
	}

	if (schema.$ref) {
		const refKey = schema.$ref.replace('#/definitions/', '');
		return `
			<div class="dto-container">
				<code class="dto-toggle text-primary" style="cursor:pointer;">${escapeHtml(refKey)}</code>
				<div class="dto-details" style="display:none">
					${renderModel(refKey, definitions)}
				</div>
			</div>
		`;
	}

	if (schema.type === 'array' && schema.items) {
		if (schema.items.$ref) {
			const refKey = schema.items.$ref.replace('#/definitions/', '');
			return `
				<div class="dto-container">
					<code class="dto-toggle text-primary" style="cursor:pointer;">
						Array&lt;${escapeHtml(refKey)}&gt;
					</code>
					<div class="dto-details" style="display:none">
						${renderModel(refKey, definitions)}
					</div>
				</div>
			`;
		}
		return `<span class="text-muted">Array&lt;${escapeHtml(schema.items.type || 'any')}&gt;</span>`;
	}

	if (schema.type === 'object') {
		if (schema.properties) {
			return `<span class="text-muted">object {${Object.keys(schema.properties).length} properties}</span>`;
		}
		return `<span class="text-muted">object</span>`;
	}

	return `
		<div class="ms-2">
			<span class="text-muted">${escapeHtml(schema.type || 'any')}</span>
			${schema.description ? `<div class="text-muted">${escapeHtml(schema.description)}</div>` : ''}
		</div>
	`;
}

function renderModel(modelName: string, definitions: SwaggerDefinitions): string {
	const model: SwaggerModel | undefined = definitions?.[modelName];
	if (!model) return '<div class="alert alert-warning">未找到定义</div>';

	return `
		<div class="model-definition mt-2 bg-light rounded">
			<div class="model-header mb-2">
				<strong>${escapeHtml(modelName)}</strong>
				${model.description ? `<div class="text-muted">${escapeHtml(model.description)}</div>` : ''}
			</div>
			<table class="model-properties table table-sm">
				${model.properties
					? Object.entries(model.properties as Record<string, SwaggerSchema>)
						.map(([name, prop]) => `
							<tr>
								<td width="25%" class="font-monospace">
									${escapeHtml(name)}
									${model.required && model.required.includes(name) ? '<span class="text-danger ms-1">*</span>' : ''}
								</td>
								<td width="35%">
									${renderType(prop, definitions)}
								</td>
								<td>
									${prop.description || '-'}
									${prop.format ? `<span class="text-muted">(Format: ${escapeHtml(prop.format)})</span>` : ''}
								</td>
							</tr>
						`)
						.join('')
					: '<tr><td colspan="3">无属性定义</td></tr>'}
			</table>
			<div class="dto-ref-container mt-2"></div>
		</div>
	`;
}

function renderType(prop: SwaggerSchema, definitions: SwaggerDefinitions, level = 0): string {
	if (prop?.$ref) {
		const refKey = prop.$ref.replace('#/definitions/', '');
		return `
			<span class="dto-ref" data-ref="${escapeHtml(refKey)}">
				${escapeHtml(refKey)}
				<span class="badge bg-secondary ms-1">ref</span>
			</span>
		`;
	}

	if (prop?.type === 'array') {
		return `
			<div class="array-type">
				Array&lt;
				<span class="array-items">${renderType(prop.items || { type: 'any' }, definitions, level + 1)}</span>
				&gt;
			</div>
		`;
	}

	if (prop?.type === 'object' && prop.properties) {
		return `
			<div class="object-type">
				{${Object.keys(prop.properties).length} fields}
				<button class="btn btn-sm btn-outline-secondary ms-1 toggle-details" data-level="${level}">▶</button>
				<div class="object-details" style="display:none;margin-left:${level * 15}px">
					${renderProperties(prop.properties, definitions, prop.required, level + 1)}
				</div>
			</div>
		`;
	}

	let display = prop?.type || 'any';
	if (prop?.format) display += ` <small class="text-muted">(${escapeHtml(prop.format)})</small>`;
	if (prop?.enum) display += ` <span class="badge bg-info">enum</span>`;
	return display;
}

function renderProperties(
	properties: Record<string, SwaggerSchema>,
	definitions: SwaggerDefinitions,
	required: string[] | undefined,
	level = 0
): string {
	if (!properties) return '';
	const req = Array.isArray(required) ? required : [];
	return `
		<table class="table table-sm mb-0">
			<tbody>
				${Object.entries(properties)
					.map(([name, prop]) => {
						const requiredMark = req.includes(name) ? '<span class="text-danger ms-1">*</span>' : '';
						return `
							<tr>
								<td width="25%" class="font-monospace">${escapeHtml(name)}${requiredMark}</td>
								<td width="35%">${renderType(prop, definitions, level)}</td>
								<td>${prop && prop.description ? escapeHtml(prop.description) : '-'}</td>
							</tr>
						`;
					})
					.join('')}
			</tbody>
		</table>
	`;
}

function resolveType(input: SwaggerSchema | SwaggerParameter, definitions: SwaggerDefinitions, isRequest = false): string {
	const actualSchema: SwaggerSchema =
		(typeof input === 'object' && input !== null && 'schema' in input && (input as SwaggerParameter).schema)
			? ((input as SwaggerParameter).schema as SwaggerSchema)
			: (input as SwaggerSchema);
	if (actualSchema?.$ref) {
		const refKey = actualSchema.$ref.replace('#/definitions/', '');
		return `
			<code class="${isRequest ? 'request-dto-toggle' : 'dto-toggle'} text-primary" data-ref="${escapeHtml(refKey)}">
				${escapeHtml(refKey)}
			</code>
		`;
	}

	if (actualSchema?.type === 'array' && actualSchema.items) {
		if (actualSchema.items.$ref) {
			const refKey = actualSchema.items.$ref.replace('#/definitions/', '');
			return `
				<code class="${isRequest ? 'request-dto-toggle' : 'dto-toggle'} text-primary" data-ref="${escapeHtml(refKey)}">
					${escapeHtml(refKey)}[]
				</code>
			`;
		}
		return `<span class="text-muted">Array&lt;${escapeHtml(actualSchema.items.type || 'any')}&gt;</span>`;
	}

	return actualSchema?.type || (actualSchema?.enum ? `enum: ${actualSchema.enum.join('|')}` : 'any');
}

// 监听来自扩展的消息
window.addEventListener('message', (event: MessageEvent<any>) => {
	const message = event.data as WebviewIncomingMessage;
	switch (message.command) {
		case 'existingApisResponse':
			existingApiData = message.existingApiData || {};
			markExistingApis();
			break;
		case 'updateSwaggerContent':
			try {
				const updatedData = JSON.parse(message.content) as PreviewData;
				basicContent = updatedData.basicInfo;
				swaggerJsonData = updatedData.swaggerJson;
				initSwaggerPreview(true);
				postToVscode({ command: 'getExistingApis' });
				showToast('文档更新成功！');
			} catch {
				showToast('文档更新失败：数据格式错误');
			}
			resetButtonState(refreshBtn, 'refresh');
			break;
		case 'refreshSwaggerDocFailed':
			showToast('文档更新失败！');
			resetButtonState(refreshBtn, 'refresh');
			break;
		case 'exportApiSuccess':
			// 清空选中状态
			selectedApis = {};
			// 取消所有勾选框的选中状态
			document.querySelectorAll<HTMLInputElement>('.form-check-input:checked').forEach((checkbox) => {
				checkbox.checked = false;
				const listItem = checkbox.closest<HTMLElement>('.list-group-item');
				if (listItem) {
					listItem.classList.remove('selected-api');
				}
			});
			// 更新已选接口数量显示
			updateSelectedCount();
			// 重新请求已存在的API列表
			postToVscode({ command: 'getExistingApis' });
			showToast('API导出成功！');
			resetButtonState(exportBtn, 'export');
			break;
		case 'exportApiFailed':
			showToast('API导出失败！');
			resetButtonState(exportBtn, 'export');
			break;
	}
});

// 标识已存在的API（只处理展开的控制器）
function markExistingApis(): void {
	if (!existingApiData || Object.keys(existingApiData).length === 0) {
		return;
	}

	const expandedAccordions = document.querySelectorAll<HTMLElement>('.accordion-collapse.show .accordion-body[data-tag]');
	expandedAccordions.forEach((accordionBody) => {
		const tagName = accordionBody.getAttribute('data-tag') || '';
		const normalizedTagName = normalizeControllerName(tagName);
		Object.entries(existingApiData).forEach(([controllerName, apis]) => {
			if (normalizedTagName === controllerName) {
				markApiItemsInController(accordionBody, apis);
			}
		});
	});
}

// 标记指定控制器中的API项
function markApiItemsInController(accordionBody: Element, apis: ExistingApi[]): void {
	const apiItems = accordionBody.querySelectorAll<HTMLElement>('.list-group-item');
	apiItems.forEach((item) => item.classList.remove('existing-api'));

	apis.forEach((existingApi) => {
		apiItems.forEach((item) => {
			const pathElement = item.querySelector<HTMLElement>('.api-path');
			const methodElement = item.querySelector<HTMLElement>('.badge');
			if (!pathElement || !methodElement) return;

			const apiPath = (pathElement.textContent || '').trim();
			const apiMethod = (methodElement.textContent || '').trim().toLowerCase();
			if (apiPath === existingApi.path && apiMethod === String(existingApi.method).toLowerCase()) {
				item.classList.add('existing-api');
			}
		});
	});
}

// 全局全选和取消全选功能
function setupGlobalSelectButtons(): void {
	const globalSelectAllBtn = document.querySelector<HTMLButtonElement>('.global-select-all-btn');
	const globalDeselectAllBtn = document.querySelector<HTMLButtonElement>('.global-deselect-all-btn');

	let activeTimers: Array<ReturnType<typeof setTimeout>> = [];
	let isProcessing = false;

	function clearActiveTimers(): void {
		activeTimers.forEach((timer) => clearTimeout(timer));
		activeTimers = [];
	}

	function addTimer(timer: ReturnType<typeof setTimeout>): void {
		activeTimers.push(timer);
		addGlobalTimer(timer);
	}

	if (globalSelectAllBtn) {
		globalSelectAllBtn.addEventListener('click', () => {
			if (isProcessing) return;
			isProcessing = true;
			clearActiveTimers();

			const originalText = globalSelectAllBtn.textContent || '';
			globalSelectAllBtn.disabled = true;
			globalSelectAllBtn.textContent = '处理中...';

			expandAllControllers()
				.then(() => selectAllVisibleApis())
				.then(() => collapseAllExceptLast())
				.finally(() => {
					globalSelectAllBtn.disabled = false;
					globalSelectAllBtn.textContent = originalText;
					isProcessing = false;
				});
		});
	}

	function expandAllControllers(): Promise<void> {
		return new Promise<void>((resolve) => {
			const unopenedButtons = document.querySelectorAll<HTMLButtonElement>('.accordion-button[aria-expanded="false"]');
			if (unopenedButtons.length === 0) {
				resolve();
				return;
			}

			let expandedCount = 0;
			const fallbackTimer = setTimeout(() => {
				resolve();
			}, 3000);
			addTimer(fallbackTimer);

			unopenedButtons.forEach((button) => {
				const targetId = button.getAttribute('data-bs-target') || '';
				const targetElement = targetId ? document.querySelector<HTMLElement>(targetId) : null;
				if (targetElement) {
					const handleShown = () => {
						expandedCount++;
						targetElement.removeEventListener('shown.bs.collapse', handleShown);
						if (expandedCount === unopenedButtons.length) {
							clearTimeout(fallbackTimer);
							resolve();
						}
					};
					targetElement.addEventListener('shown.bs.collapse', handleShown);
				}
				button.click();
			});
		});
	}

	function selectAllVisibleApis(): Promise<void> {
		return new Promise<void>((resolve) => {
			const allCheckboxes = document.querySelectorAll<HTMLInputElement>('.accordion-body .list-group-item:not([style*="display: none"]) .form-check-input');
			allCheckboxes.forEach((checkbox) => {
				if (!checkbox.checked) {
					checkbox.checked = true;
					checkbox.dispatchEvent(new Event('change', { bubbles: true }));
				}
			});
			resolve();
		});
	}

	function collapseAllExceptLast(): Promise<void> {
		return new Promise<void>((resolve) => {
			const allButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.accordion-button'));
			const allCollapses = Array.from(document.querySelectorAll<HTMLElement>('.accordion-collapse'));

			if (allButtons.length === 0) {
				resolve();
				return;
			}

			const lastButton = allButtons[allButtons.length - 1];
			const lastTargetId = lastButton ? lastButton.getAttribute('data-bs-target') : null;
			const lastCollapse = lastTargetId ? document.querySelector<HTMLElement>(lastTargetId) : null;

			allButtons.forEach((button) => {
				button.setAttribute('aria-expanded', 'false');
				button.classList.add('collapsed');
			});
			allCollapses.forEach((collapse) => {
				collapse.classList.remove('show');
			});

			if (lastButton && lastCollapse) {
				lastButton.setAttribute('aria-expanded', 'true');
				lastButton.classList.remove('collapsed');
				lastCollapse.classList.add('show');

				const accordionBody = lastCollapse.querySelector<HTMLElement>('.accordion-body[data-tag]');
				if (accordionBody && existingApiData) {
					const tagName = accordionBody.getAttribute('data-tag');
					if (tagName) {
						const markingTimer = setTimeout(() => {
							const normalizedTagName = normalizeControllerName(tagName);
							Object.entries(existingApiData).forEach(([controllerName, apis]) => {
								if (normalizedTagName === controllerName) {
									markApiItemsInController(accordionBody, apis);
								}
							});
						}, 100);
						addTimer(markingTimer);
					}
				}
			}

			resolve();
		});
	}

	if (globalDeselectAllBtn) {
		globalDeselectAllBtn.addEventListener('click', () => {
			const checkedCheckboxes = document.querySelectorAll<HTMLInputElement>('.accordion-body .form-check-input:checked');
			checkedCheckboxes.forEach((checkbox) => {
				checkbox.checked = false;
				checkbox.dispatchEvent(new Event('change', { bubbles: true }));
			});
		});
	}
}

initSwaggerPreview();
setupGlobalSelectButtons();
