export const previewSwaggerTemplate = `<!DOCTYPE html>
<html>
	<head>
		<title>Swagger文档预览</title>
		<link
			href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
			rel="stylesheet"
		/>
		<style>
			body {
				background-color: var(--vscode-editor-background);
				width: 100vw;
				height: 100vh;
				overflow: hidden;
			}

			.main-container {
				max-width: 100%;
				max-height: 100vh;
				overflow-y: hidden;
				margin: 0 auto;
				padding: 20px 0;
				box-sizing: border-box;
			}

			#basic-info-card {
				margin: 0 10px;
			}

			#basic-info-card .card-body {
				padding: 15px 0;
			}

			#interface-card {
				margin-top: 15px;
				height: calc(100vh - 272px);
				overflow-y: auto;
			}

			#controller-toolbar {
				margin: 10px 10px 0 10px;
			}

			#refresh-btn {
				padding: 0.25rem 0.5rem;
				font-size: 0.875rem;
				border: none;
				transition: all 0.2s;
				cursor: pointer;
			}

			#refresh-btn:disabled {
				opacity: 0.6;
				cursor: not-allowed;
			}

			#refresh-btn:hover {
				background-color: rgba(255,255,255,0.9) !important;
			}

			#refresh-btn svg {
				margin-right: 4px;
				transition: transform 0.3s;
			}

			#refresh-btn.loading svg {
				animation: spin 1s linear infinite;
			}

			#export-btn {
				padding: 0.25rem 0.5rem;
				font-size: 0.875rem;
				border: none;
				transition: all 0.2s;
				margin-left: 10px;
				cursor: pointer;
			}

			#export-btn:disabled {
				opacity: 0.6;
				cursor: not-allowed;
			}

			#export-btn:hover {
				background-color: rgba(255,255,255,0.9) !important;
			}

			#export-btn svg {
				margin-right: 4px;
				transition: transform 0.3s;
			}

			#export-btn.loading svg {
				animation: spin 1s linear infinite;
			}

			@keyframes spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}

			#interface-card .container-fluid {
				padding-right: 0;
			}

			.accordion-button {
				font-weight: 500;
			}

			.accordion-body {
				padding: 0.5rem 1.25rem;
			}

			.accordion-button:focus {
				box-shadow: none;
			}
			a:focus {
				outline: none;
			}
			.api-collapse-header {
				display: flex;
				align-items: stretch;
				min-height: 68px;
			}
			.list-group-item .api-item-link .badge {
				width: 60px;
				position: absolute;
				top: 0px;
				bottom: 0px;
				left: 0;
				display: flex;
				align-items: center;
				justify-content: center;
			}
			.list-group-item .api-item-link {
				background-color: #f0f8ff;
				padding: 10px 15px 10px 0;
				border-top-left-radius: 5px;
				border-bottom-left-radius: 5px;
				padding-left: 72px;
				position: relative;
				flex: 1;
				-webkit-user-drag: none;
				transition: all 0.3s ease-in-out;
			}
			.list-group-item .form-check {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 60px;
				background-color: #e6e6fa;
				border-top-right-radius: 5px;
				border-bottom-right-radius: 5px;
				margin-bottom: 0;
			}
			.list-group-item .copy-api-path {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 60px;
				background-color: #f2f2f5;
				cursor: pointer;
				transition: all 0.3s ease-in-out;
			}
			.list-group-item .copy-api-path:hover {
				background-color: #dfdff2;
				path {
					fill: #8a2be2;
				}
			}

			.list-group-item.selected-api .api-item-link {
				background-color: rgb(30 11 239 / 11%);
			}
			.list-group-item.existing-api {
				border-bottom: 3px solid #28a745;
			}
			.list-group-item.existing-api .api-item-link {
				position: relative;
			}
			.list-group-item.existing-api .api-item-link::after {
				content: "已存在";
				position: absolute;
				bottom: 5px;
				right: 5px;
				background-color: #28a745;
				color: white;
				font-size: 10px;
				padding: 2px 6px;
				border-radius: 10px;
			}
			.api-path {
				word-break: break-all;
			}
			code {
				background-color: #ebebeb;
				padding: 2px 5px;
			}
			code.text-primary {
				cursor: pointer;
				transition: all 0.3s ease-in-out;
			}
			code.text-primary:hover {
				background-color: #d0d0d0;
				color: #fff !important;
			}
			.dto-toggle,
			.request-dto-toggle {
				cursor: pointer;
				transition: all 0.3s ease;
			}
			.dto-toggle.active,
			.request-dto-toggle.active {
				background-color: var(--bs-primary);
				color: white !important;
			}
			.dto-ref {
				color: #0d6efd;
				cursor: pointer;
				text-decoration: underline dotted;
				padding: 2px 4px;
				border-radius: 3px;
			}
			.dto-ref:hover {
				background-color: #f0f7ff;
			}
			.array-type {
				display: inline-block;
				background-color: #f8f9fa;
				padding: 2px 6px;
				border-radius: 4px;
			}
			.object-type {
				display: inline-flex;
				align-items: center;
				background-color: #f8f9fa;
				padding: 2px 6px;
				border-radius: 4px;
			}
			.object-details {
				border-left: 2px solid #dee2e6;
				padding-left: 10px;
				margin-top: 5px;
			}
			.dto-container {
				position: relative;
			}
			.dto-details {
				border-left: 3px solid #dee2e6;
				padding-left: 10px;
				margin: 5px 0 10px 0;
			}
			.model-definition {
				font-size: 14px;
			}
			.model-properties tr {
				border-bottom: 1px solid #eee;
			}
			.model-properties td {
				padding: 4px 8px;
				vertical-align: top;
			}
			.form-check-input {
				cursor: pointer;
				width: 1.6em;
				height: 1.6em;
				margin-top: 0;
			}

			.form-check-input:checked {
				background-color: var(--bs-primary);
				border-color: var(--bs-primary);
			}

			.list-group-item:hover .form-check-input {
				border-color: var(--bs-primary);
			}

			.accordion-body .input-group {
				flex: 1;
			}

			.accordion-body .btn-group {
				width: 200px;
			}

			.accordion-body .input-group .form-control {
				border-color: #6c757d;
			}

			.accordion-body .input-group .form-control:focus {
				outline: none;
				box-shadow: none;
			}

			#controller-toolbar {
				margin-top: 20px;
			}

			#controller-toolbar .input-group {
				width: 100%;
			}

			#controller-toolbar .input-group .form-control {
				border-color: #6c757d;
			}

			#controller-toolbar .input-group .form-control:focus {
				outline: none;
				box-shadow: none;
			}
		</style>
	</head>

	<body>
		<div class="main-container">
			<!-- 基础信息卡片-->
			<div class="doc-card card" id="basic-info-card">
				<div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
					<h5 class="mb-0">文档信息</h5>
					<div class="right-operate-btn">
						<button id="refresh-btn" class="btn btn-sm btn-light">
							<svg t="1754470396208" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6944" width="18" height="18"><path d="M887.456 443.744l102.4 136.512h-76.064c-32.48 192.544-200 339.2-401.792 339.2a407.104 407.104 0 0 1-342.56-186.752 32 32 0 0 1 53.76-34.688A343.104 343.104 0 0 0 512 855.456c166.304 0 305.024-118.208 336.672-275.2h-63.616l102.4-136.512zM512 104.544c145.664 0 278.016 77.12 350.848 200.16a32 32 0 0 1-55.04 32.608A343.232 343.232 0 0 0 512 168.544c-178.176 0-324.64 135.648-341.76 309.312h68.704l-102.4 136.544-102.4-136.544H105.92C123.296 268.8 298.464 104.544 512 104.544z" fill="#515151" p-id="6945"></path></svg>
							刷新文档
						</button>
						<button id="export-btn" class="btn btn-sm btn-light">
							<svg t="1754470912280" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8706" width="18" height="18"><path d="M909.5 671.4h-625c-17.7 0-32-14.3-32-32s14.3-32 32-32h625c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8707" fill="#515151"></path><path d="M904.8 662.7c-8.2 0-16.4-3.1-22.6-9.4l-225-225c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l225 225c12.5 12.5 12.5 32.8 0 45.3-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8708" fill="#515151"></path><path d="M679.5 905.2c-8.2 0-16.4-3.1-22.6-9.4-12.5-12.5-12.5-32.8 0-45.3l225-225c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-225 225c-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8709" fill="#515151"></path><path d="M448.2 958.3H229.7c-89.3 0-162-72.7-162-162V228.2c0-89.3 72.7-162 162-162h568.1c89.3 0 162 72.7 162 162v208.1c0 17.7-14.3 32-32 32s-32-14.3-32-32V228.2c0-54-44-98-98-98H229.7c-54 0-98 44-98 98v568.1c0 54 44 98 98 98h218.5c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8710" fill="#515151"></path></svg>
							导出接口
						</button>
					</div>
				</div>
				<div class="card-body">
					<div class="container-fluid"></div>
				</div>
			</div>

			<!-- Controller 顶部工具栏（不随下方列表滚动） -->
			<div id="controller-toolbar">
				<div class="d-flex justify-content-end align-items-center gap-2">
					<div class="input-group input-group-sm">
						<input type="text" class="form-control controller-search-input" placeholder="筛选 Controller（名称或描述）..." />
						<button class="btn btn-outline-secondary controller-search-clear" type="button" title="清除">&times;</button>
					</div>
				</div>
			</div>

			<!-- 接口列表卡片 -->
			<div id="interface-card">
				<div class="container-fluid">
					<!-- Controller列表将在这里渲染 -->
				</div>
			</div>
		</div>

		<div class="toast-container position-fixed end-0 p-3">
			<div id="liveToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
				<div class="toast-header">
					<strong class="me-auto">提示</strong>
					<button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
				</div>
				<div class="toast-body"></div>
			</div>
		</div>


		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

		<script>
			const vscode = acquireVsCodeApi();

			// 安全转义HTML特殊字符
			function escapeHtml(unsafe) {
				if (!unsafe) return '';
				return unsafe.toString()
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#039;");
			}

			const basicContainerCard = document.getElementById("basic-info-card");
			const basicContainer = basicContainerCard.querySelector(".container-fluid");
			const interfaceContainerCard = document.getElementById("interface-card");
			const interfaceContainer = interfaceContainerCard.querySelector(".container-fluid");
			const toastLive = document.getElementById('liveToast');
			const toastBody = toastLive.querySelector('.toast-body');

			const toast = new bootstrap.Toast(toastLive);

			const refreshBtn = document.getElementById('refresh-btn');
			const exportBtn = document.getElementById('export-btn');

			let basicContent = null;
			let swaggerJsonData = null;
			let selectedApis = {};
			let existingApiData = {};

			// 将目标吸顶到容器顶部（仅当需要滚动时），可滚动容器为 interface-card
			function scrollToTopInContainer(container, target, margin = 6) {
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

			refreshBtn.addEventListener('click', handleRefreshDoc);

			exportBtn.addEventListener('click', handleExportDoc);

			async function handleRefreshDoc() {
				const btn = this;
				btn.disabled = true;
				exportBtn.disabled = true;
				btn.classList.add('loading');
				btn.innerHTML = \`
					<span class="spinner-border spinner-border-sm" role="status"></span>
					刷新中...
				\`;

				vscode.postMessage({
					command: 'refreshSwaggerDoc',
				});

				// 刷新按钮状态将通过全局消息监听器处理
			}

			function handleExportDoc() {
				// 检查是否选中了接口
				const hasSelectedApis = Object.keys(selectedApis).some(controller =>
					selectedApis[controller] && selectedApis[controller].length > 0
				);

				if (!hasSelectedApis) {
					toastBody.innerHTML = '请先选择要导出的接口！';
					toast.show();
					return;
				}

				const btn = this;
				btn.disabled = true;
				refreshBtn.disabled = true;
				btn.classList.add('loading');
				btn.innerHTML = \`
					<span class="spinner-border spinner-border-sm" role="status"></span>
        	导出中...
				\`;

				vscode.postMessage({
					command: 'exportSwaggerDoc',
					content: selectedApis
				});

				// 导出按钮状态将通过全局消息监听器处理
			}

			function resetButtonState(btn, type) {
				btn.disabled = false;
				btn.classList.remove('loading');
				switch (type) {
					case 'refresh':
						exportBtn.disabled = false;
						btn.innerHTML = \`
							<svg t="1754470396208" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6944" width="18" height="18"><path d="M887.456 443.744l102.4 136.512h-76.064c-32.48 192.544-200 339.2-401.792 339.2a407.104 407.104 0 0 1-342.56-186.752 32 32 0 0 1 53.76-34.688A343.104 343.104 0 0 0 512 855.456c166.304 0 305.024-118.208 336.672-275.2h-63.616l102.4-136.512zM512 104.544c145.664 0 278.016 77.12 350.848 200.16a32 32 0 0 1-55.04 32.608A343.232 343.232 0 0 0 512 168.544c-178.176 0-324.64 135.648-341.76 309.312h68.704l-102.4 136.544-102.4-136.544H105.92C123.296 268.8 298.464 104.544 512 104.544z" fill="#515151" p-id="6945"></path></svg>
							刷新文档
						\`;
						break
					case 'export':
						refreshBtn.disabled = false;
						btn.innerHTML = \`
							<svg t="1754470912280" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8706" width="18" height="18"><path d="M909.5 671.4h-625c-17.7 0-32-14.3-32-32s14.3-32 32-32h625c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8707" fill="#515151"></path><path d="M904.8 662.7c-8.2 0-16.4-3.1-22.6-9.4l-225-225c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l225 225c12.5 12.5 12.5 32.8 0 45.3-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8708" fill="#515151"></path><path d="M679.5 905.2c-8.2 0-16.4-3.1-22.6-9.4-12.5-12.5-12.5-32.8 0-45.3l225-225c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-225 225c-6.3 6.3-14.5 9.4-22.7 9.4z" p-id="8709" fill="#515151"></path><path d="M448.2 958.3H229.7c-89.3 0-162-72.7-162-162V228.2c0-89.3 72.7-162 162-162h568.1c89.3 0 162 72.7 162 162v208.1c0 17.7-14.3 32-32 32s-32-14.3-32-32V228.2c0-54-44-98-98-98H229.7c-54 0-98 44-98 98v568.1c0 54 44 98 98 98h218.5c17.7 0 32 14.3 32 32s-14.3 32-32 32z" p-id="8710" fill="#515151"></path></svg>
							导出接口
						\`;
						break
				}
			}

			function initSwaggerPreview() {
				basicContainer.innerHTML = '';
				interfaceContainer.innerHTML = '';
				selectedApis = {};
				existingApiData = {};

				try {
					basicContent = JSON.parse(\`{{basicInfo}}\`);
					swaggerJsonData = JSON.parse(\`{{swaggerJson}}\`);
					// 1. 渲染基础信息
					renderBasicInfo(basicContent);

					// 2. 请求已存在的API列表
					vscode.postMessage({
						command: 'getExistingApis'
					});

					// 3. 渲染Controller列表
					if (swaggerJsonData.tags && swaggerJsonData.tags.length) {
						renderControllerList(swaggerJsonData.tags);
					} else {
						interfaceContainer.innerHTML = \`
							<div class="alert alert-info">
								未找到Controller定义
							</div>
						\`;
					}
				} catch (err) {
					console.error("初始化失败:", err);
					basicContainer.innerHTML = \`
						<div class="alert alert-danger">
							数据解析失败: \${escapeHtml(err.message)}
						</div>
					\`;
					interfaceContainerCard.style.display = "none";
				}
			}

			function renderBasicInfo(content) {
				// 格式化渲染
				basicContainer.innerHTML = \`
					<div class="row mb-2">
						<div class="col-md-2 fw-bold">文档名称：</div>
						<div class="col-md-10">\${content.name || "无"}</div>
					</div>
					<div class="row mb-2">
						<div class="col-md-2 fw-bold">访问地址：</div>
						<div class="col-md-10">
							<a href="\${content.url}" target="_blank">\${content.url}</a>
						</div>
					</div>
					<div class="row">
						<div class="col-md-2 fw-bold">文档描述：</div>
						<div class="col-md-10 text-muted">\${content.desc || "暂无描述"}</div>
					</div>
				\`;
			}

			function renderControllerList(tags) {
				// 1. 按首字母排序 (支持中文)
				const sortedTags = [...tags].sort((a, b) =>
					a.name.localeCompare(b.name, "zh-CN")
				);

				// 2. 生成Accordion结构
				interfaceContainer.innerHTML = \`
					<div class="accordion" id="controllerAccordion">
						\${sortedTags
							.map(
								(tag, index) => \`
									<div class="accordion-item" data-controller-name="\${escapeHtml(tag.name)}" data-controller-desc="\${escapeHtml(tag.description || '')}">
										<h2 class="accordion-header">
											<button class="accordion-button \${index > 0 ? "collapsed" : ""}"
													type="button"
													data-bs-toggle="collapse"
													data-bs-target="#collapse\${index}"
													aria-expanded="\${index === 0}">
												<strong>\${escapeHtml(tag.name)}</strong>
												\${
													tag.description
														? \`<span class="text-muted ms-2">\${escapeHtml(
																tag.description
															)}</span>\`
														: ""
												}
											</button>
										</h2>
										<div id="collapse\${index}"
											class="accordion-collapse collapse"
											data-bs-parent="#controllerAccordion">
											<div class="accordion-body" data-tag="\${escapeHtml(tag.name)}">
												<!-- 接口列表将在这里动态加载 -->
												<div class="text-center py-3">
													<div class="spinner-border text-primary" role="status">
														<span class="visually-hidden">加载中...</span>
													</div>
												</div>
											</div>
										</div>
									</div>
							\`
							)
							.join("")}
					</div>
				\`;

				// 3. 控制器级别筛选（使用顶部工具栏输入框，不随列表滚动）
				const cSearchInput = document.querySelector('#controller-toolbar .controller-search-input');
				const cSearchClear = document.querySelector('#controller-toolbar .controller-search-clear');
				function applyControllerFilter(q) {
					const kw = (q || '').trim().toLowerCase();
					interfaceContainer.querySelectorAll('#controllerAccordion .accordion-item').forEach(item => {
						const name = (item.getAttribute('data-controller-name') || '').toLowerCase();
						const desc = (item.getAttribute('data-controller-desc') || '').toLowerCase();
						item.style.display = kw === '' || name.includes(kw) || desc.includes(kw) ? '' : 'none';
					});
				}
				cSearchInput.addEventListener('input', () => applyControllerFilter(cSearchInput.value));
				cSearchClear.addEventListener('click', () => {
					cSearchInput.value = '';
					applyControllerFilter('');
				});

				// 4. 添加展开事件监听
				document.querySelectorAll(".accordion-button").forEach((btn) => {
					btn.addEventListener("click", function (e) {
						e.stopPropagation(); // 阻止事件冒泡
						const accordionItem = this.closest('.accordion-item');
						const accordionBody = accordionItem.querySelector('.accordion-body');
						const collapseEl = accordionItem.querySelector('.accordion-collapse');
						const tagName = accordionBody.dataset.tag;

						// 仅在首次展开时加载
						if (!accordionBody.querySelector('.list-group')) {
							loadTagApis(tagName);
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
				const timer = setTimeout(() => {
					clearTimeout(timer);
					const firstButton = document.querySelector('#controllerAccordion .accordion-button');
					if (firstButton) {
						firstButton.dispatchEvent(new MouseEvent('click', {
							bubbles: true,
							cancelable: true
						}));
					}
				}, 50);
			}

			function loadTagApis(tagName) {

				const accordionBody = document.querySelector(\`.accordion-body[data-tag="\${escapeHtml(tagName)}"]\`);
				if (!accordionBody) {
					console.error('未找到对应的accordion-body');
					return;
				}

				if (!swaggerJsonData.paths) {
					accordionBody.innerHTML = '<div class="alert alert-warning">无接口定义</div>';
					return;
				}

				// 过滤出包含当前tag的path
				const apiList = Object.entries(swaggerJsonData.paths)
					.flatMap(([path, methods]) =>
						Object.entries(methods)
							.filter(([_, methodObj]) => methodObj.tags && methodObj.tags.includes(tagName))
							.map(([method, methodObj]) => ({
								path,
								method,
								operationId: methodObj.operationId
                  ? \`op-\${escapeHtml(methodObj.operationId)}\`
                  : \`api-\${escapeHtml(tagName)}-\${method}-\${Date.now().toString(36)}\`,
								...methodObj
							}))
					)
					// 按照 operationId 排序，如果没有 operationId 则按照 summary 排序
					.sort((a, b) => {
						const aId = a.operationId || a.summary || a.path.split('/').pop();
						const bId = b.operationId || b.summary || b.path.split('/').pop();
						return aId.localeCompare(bId, "zh-CN");
					});

				if (apiList.length === 0) {
					accordionBody.innerHTML = '<div class="alert alert-info">该Controller下无接口</div>';
					return;
				}

				// 渲染API列表
				accordionBody.innerHTML = \`
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
						\${apiList.map(api => \`
							<div class="list-group-item border-0 px-0 py-2" data-path="\${escapeHtml(api.path)}" data-name="\${escapeHtml(api.summary || '')}">
								<div class="api-collapse-header d-flex justify-content-between align-items-stretch">
									<a href="#\${api.operationId}"
										class="api-item-link text-decoration-none text-reset"
										data-bs-toggle="collapse"
										aria-expanded="false"
									>
										<span class="badge \${
											api.method === 'get' ? 'bg-primary' :
											api.method === 'post' ? 'bg-success' :
											api.method === 'put' ? 'bg-warning text-dark' :
											api.method === 'delete' ? 'bg-danger' : 'bg-secondary'
										} me-2">
											\${api.method.toUpperCase()}
										</span>
										<div>
											<div class="fw-bold api-path">\${escapeHtml(api.path)}</div>
											<small class="text-muted">\${api.summary ? escapeHtml(api.summary) : '无描述'}</small>
										</div>
									</a>
									<div class="copy-api-path" data-path="\${api.path}">
										<svg t="1754554762483" class="icon" viewBox="0 0 1025 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14492" width="20" height="20"><path d="M688.7 1023.3H142.2c-76.2 0-138.1-62-138.1-138.1V338.7c0-76.2 62-138.1 138.1-138.1h546.5c76.2 0 138.1 62 138.1 138.1v546.5c0 76.1-62 138.1-138.1 138.1zM142.2 276.6c-34.3 0-62.1 27.9-62.1 62.1v546.5c0 34.3 27.9 62.1 62.1 62.1h546.5c34.3 0 62.1-27.9 62.1-62.1V338.7c0-34.3-27.9-62.1-62.1-62.1H142.2z" fill="#515151" p-id="14493"></path><path d="M987.8 447.8c-21 0-38-17-38-38V141.7c0-34.3-27.9-62.1-62.1-62.1H614.1c-21 0-38-17-38-38s17-38 38-38h273.6c76.2 0 138.1 62 138.1 138.1v268.1c0 21-17 38-38 38z" fill="#515151" p-id="14494"></path></svg>
									</div>
									<div class="form-check">
										<input type="checkbox" class="form-check-input">
									</div>
								</div>
								<div class="collapse mt-2" id="\${api.operationId}">
									<div class="card card-body bg-light">
										<div class="placeholder-content"
											data-api-id="\${api.operationId}"
										>
											\${api.operationId ? '' : '<div class="alert alert-warning mb-0">此接口缺少operationId</div>'}
										</div>
									</div>
								</div>
							</div>
						\`).join('')}
					</div>
				\`;

				// API的点击事件
				accordionBody.querySelectorAll('.api-item-link').forEach(link => {
					link.addEventListener('click', function(e) {

						const apiId = this.getAttribute('href').substring(1);
						const detailPanel = document.querySelector(\`[data-api-id="\${apiId}"]\`);
						if (!detailPanel) return;

						// 通过data属性获取原始数据
						const apiData = apiList.find(api => api.operationId === apiId);

						if (apiData) {
							// 1. 渲染请求参数
							let parametersHtml = '';
							if (apiData.parameters && apiData.parameters.length) {
								parametersHtml = \`
									<div class="mb-4">
										<h6 class="border-bottom pb-2">📤 请求参数</h6>
										\${renderParameters(apiData.parameters, swaggerJsonData.definitions)}
									</div>
								\`;
							}

							// 2. 渲染响应参数
							let responsesHtml = '';
							if (apiData.responses) {
								responsesHtml = \`
									<div class="mt-4">
										<h6 class="border-bottom pb-2">📥 响应结构</h6>
										\${renderResponses(apiData.responses, swaggerJsonData.definitions)}
									</div>
								\`;
							}

							detailPanel.innerHTML = parametersHtml + responsesHtml;
						}
					});
				});

				// DTO的点击事件
				accordionBody.addEventListener('click', function(e) {
					// 处理 DTO 引用点击（叠加模式）
					if (e.target.classList.contains('dto-ref')) {
						e.preventDefault();
						const refKey = e.target.dataset.ref;
						const container = e.target.closest('.model-definition').querySelector('.dto-ref-container');

						// 检查是否已存在完全相同的 DTO 内容
						const newContent = renderModel(refKey, swaggerJsonData.definitions);
						if (isSameDtoContent(refKey, newContent, container)) {
							e.target.classList.remove('active');
							return;
						}

						// 检查是否已存在当前 DTO（无论内容是否一致）
						const existingDetails = container.querySelector(\`.dto-ref-details[data-ref="\${refKey}"]\`);
						if (existingDetails) {
							existingDetails.remove();
							e.target.classList.remove('active');
							return;
						}

						// 渲染新的 DTO
						const details = document.createElement('div');
						details.className = 'dto-ref-details';
						details.dataset.ref = refKey;
						details.innerHTML = newContent;

						container.appendChild(details);
						e.target.classList.add('active');
					}

					// 处理请求参数的 DTO 点击
					if (e.target.classList.contains('request-dto-toggle')) {
						e.preventDefault();
						const refKey = e.target.dataset.ref;
						const container = e.target.closest('.request-parameters-table').nextElementSibling;

						const existingDetails = container.querySelector(\`.request-dto-details[data-ref="\${refKey}"]\`);
						if (existingDetails) {
							existingDetails.remove();
							e.target.classList.remove('active');
							return;
						}

						const allDetails = container.querySelectorAll('.request-dto-details');
						allDetails.forEach(detail => detail.remove());

						const details = document.createElement('div');
						details.className = 'request-dto-details';
						details.dataset.ref = refKey;
						details.innerHTML = renderModel(refKey, swaggerJsonData.definitions);

						container.appendChild(details);
						e.target.classList.add('active');
					}

					// 处理响应结构的 DTO 点击
					if (e.target.classList.contains('dto-toggle')) {
						e.preventDefault();
						const toggle = e.target;
						const container = toggle.closest('.dto-container');
						const details = toggle.nextElementSibling;

						if (details && details.classList.contains('dto-details')) {
							const dynamicDetails = container.querySelectorAll('.dto-details[data-ref]');
							dynamicDetails.forEach(detail => detail.remove());

							details.style.display = details.style.display === 'none' ? 'block' : 'none';
							toggle.classList.toggle('active');
						}
					}
				});

				// 复制API路径
				accordionBody.querySelectorAll('.copy-api-path').forEach(item => {
					item.addEventListener('click', function(e) {
						const path = this.getAttribute('data-path');
						try {
							navigator.clipboard.writeText(path);
							toastBody.innerHTML = 'API路径已复制！';
							toast.show();
						} catch (error) {
							toastBody.innerHTML = 'API路径复制失败';
							toast.show();
						}
					});
				});

				// 选择API
				accordionBody.querySelectorAll('.form-check-input').forEach(item => {
					item.addEventListener('change', function(e) {
						const listItem = e.target.closest('.list-group-item');
						const apiItemLink = listItem.querySelector('.api-item-link');
						const apiPath = apiItemLink.querySelector('.api-path').textContent;
						const methodBadge = apiItemLink.querySelector('.badge');
						const method = methodBadge ? methodBadge.textContent.trim().toLowerCase() : '';
						const controller = tagName;
						const apiData = apiList.find(api => api.path === apiPath && api.method === method);

						if (e.target.checked) {
							listItem.classList.add('selected-api');
							if (!selectedApis[controller]) {
								selectedApis[controller] = [];
							}
							// 避免重复添加
							if (!selectedApis[controller].some(api => api.path === apiPath && api.method === method)) {
								selectedApis[controller].push({ ...apiData });
							}
						} else {
							listItem.classList.remove('selected-api');
							if (selectedApis[controller]) {
								selectedApis[controller] = selectedApis[controller].filter(api => !(api.path === apiPath && api.method === method));
								// 如果该 controller 下已无 API，移除该 controller
								if (selectedApis[controller].length === 0) {
									delete selectedApis[controller];
								}
							}
						}
					});
				});

				// 全选/取消全选
				const selectAllBtn = accordionBody.querySelector('.select-all-btn');
				const deselectAllBtn = accordionBody.querySelector('.deselect-all-btn');
				if (selectAllBtn) {
					selectAllBtn.addEventListener('click', () => {
						const checkboxes = accordionBody.querySelectorAll('.form-check-input');
						checkboxes.forEach(cb => {
							if (!cb.checked) {
								cb.checked = true;
								cb.dispatchEvent(new Event('change', { bubbles: true }));
							}
						});
					});
				}
				if (deselectAllBtn) {
					deselectAllBtn.addEventListener('click', () => {
						const checkboxes = accordionBody.querySelectorAll('.form-check-input');
						checkboxes.forEach(cb => {
							if (cb.checked) {
								cb.checked = false;
								cb.dispatchEvent(new Event('change', { bubbles: true }));
							}
						});
					});
				}

				// 搜索过滤（按接口路径或名称）
				const searchInput = accordionBody.querySelector('.api-search-input');
				const searchClear = accordionBody.querySelector('.api-search-clear');
				function applyFilter(q) {
					const kw = (q || '').trim().toLowerCase();
					accordionBody.querySelectorAll('.list-group-item').forEach(li => {
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
							searchInput.value = '';
							applyFilter('');
						});
					}

					// 标识当前控制器中的已存在API
					if (existingApiData && Object.keys(existingApiData).length > 0) {
						// 查找匹配的控制器数据并标记
						Object.entries(existingApiData).forEach(([controllerName, apis]) => {
							const isMatchingController = tagName === controllerName ||
								tagName === controllerName.replace(/([A-Z])/g, (match, letter, index) => {
									return index === 0 ? letter.toLowerCase() : '-' + letter.toLowerCase();
								}).replace(/Controller$/, '');

							if (isMatchingController) {
								markApiItemsInController(accordionBody, apis);
							}
						});
					}
				}

			function isSameDtoContent(refKey, newContent, container) {
				const existingDetails = container.querySelector(\`.dto-ref-details[data-ref="\${refKey}"]\`);
				if (!existingDetails) return false;

				// 创建临时元素比较内容
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = newContent;
				return existingDetails.innerHTML === tempDiv.innerHTML;
			}

			// 渲染参数表格
			function renderParameters(parameters, definitions) {
				return \`
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
							\${parameters.map(param => \`
								<tr>
									<td>\${param.in || '-'}</td>
									<td><code>\${param.name}</code></td>
									<td>\${resolveType(param.schema || param, definitions, true)}</td>
									<td>\${param.required ? '✓' : ''}</td>
									<td>\${param.description || '-'}</td>
								</tr>
							\`).join('')}
						</tbody>
					</table>
					<div class="request-dto-container mt-3"></div>
				\`;
			}

			// 渲染响应结构
			function renderResponses(responses, definitions) {
				return Object.entries(responses).map(([statusCode, response]) => \`
					<div class="mb-3">
						<div class="d-flex align-items-center mb-2">
							<span class="badge \${statusCode.startsWith('2') ? 'bg-success' : 'bg-warning'} me-2">
								HTTP \${statusCode}
							</span>
							<small class="text-muted">\${response.description || '无描述'}</small>
						</div>
						\${response.schema ? renderSchema(response.schema) : '<p>无数据定义</p>'}
					</div>
				\`).join('');
			}

			// 递归渲染Schema结构
			function renderSchema(schema) {
				if (schema.$ref) {
					const refKey = schema.$ref.replace('#/definitions/', '');
					return \`
						<div class="dto-container">
							<code class="dto-toggle text-primary">\${refKey}</code>
							<div class="dto-details" style="display:none">
								\${renderModel(refKey, swaggerJsonData.definitions)}
							</div>
						</div>
					\`;
				}
				return \`
					<div class="ms-2">
						<span class="text-muted">\${schema.type || 'any'}</span>
						\${schema.description ? \`<div class="text-muted">\${escapeHtml(schema.description)}</div>\` : ''}
					</div>
				\`;
			}

			function renderModel(modelName, definitions) {
				const model = definitions[modelName];
				if (!model) return '<div class="alert alert-warning">未找到定义</div>';

				return \`
					<div class="model-definition mt-2 bg-light rounded">
						<div class="model-header mb-2">
							<strong>\${modelName}</strong>
							\${model.description ? \`<div class="text-muted">\${model.description}</div>\` : ''}
						</div>
						<table class="model-properties table table-sm">
							\${model.properties ? Object.entries(model.properties).map(([name, prop]) => \`
								<tr>
									<td width="25%" class="font-monospace">
										\${name}
										\${model.required && model.required.includes(name) ? '<span class="text-danger ms-1">*</span>' : ''}
									</td>
									<td width="35%">
										\${renderType(prop, definitions)}
									</td>
									<td>
										\${prop.description || '-'}
										\${prop.format ? \`<span class="text-muted">(Format: \${prop.format})</span>\` : ''}
									</td>
								</tr>
							\`).join('') : '<tr><td colspan="3">无属性定义</td></tr>'}
						</table>
						<div class="dto-ref-container mt-2"></div>
					</div>
				\`;
			}

			function renderType(prop, definitions, level = 0) {
				// 处理引用类型
				if (prop.$ref) {
					const refKey = prop.$ref.replace('#/definitions/', '');
					return \`
						<span class="dto-ref" data-ref="\${refKey}">
							\${refKey}
							<span class="badge bg-secondary ms-1">ref</span>
						</span>
					\`;
				}

				// 处理数组类型
				if (prop.type === 'array') {
					return \`
						<div class="array-type">
							Array&lt;
							<span class="array-items">\${renderType(prop.items, definitions, level + 1)}</span>
							&gt;
						</div>
					\`;
				}

				// 处理对象类型
				if (prop.type === 'object' && prop.properties) {
					return \`
						<div class="object-type">
							{\${Object.keys(prop.properties).length} fields}
							<button class="btn btn-sm btn-outline-secondary ms-1 toggle-details"
								data-level="\${level}">▶</button>
							<div class="object-details" style="display:none;margin-left:\${level * 15}px">
								\${renderProperties(prop.properties, definitions, prop.required, level + 1)}
							</div>
						</div>
					\`;
				}

				// 基本类型处理
				let display = prop.type || 'any';
				if (prop.format) display += \` <small class="text-muted">(\${prop.format})</small>\`;
				if (prop.enum) display += \` <span class="badge bg-info">enum</span>\`;
				return display;
			}

			// 解析类型定义
			function resolveType(schema, definitions, isRequest = false) {
				if (schema.$ref) {
					const refKey = schema.$ref.replace('#/definitions/', '');
					return \`
						<code class="\${isRequest ? 'request-dto-toggle' : 'dto-toggle'} text-primary" data-ref="\${refKey}">
							\${refKey}
						</code>
					\`;
				}
				return schema.type || (schema.enum ? \`enum: \${schema.enum.join('|')}\` : 'any');
			}

			// 监听来自扩展的消息
			window.addEventListener('message', event => {
				const message = event.data;
				switch (message.command) {
					case 'existingApisResponse':
						existingApiData = message.existingApiData || {};
						markExistingApis();
						break;
					case 'updateSwaggerContent':
						swaggerJsonData = message.content;
						initSwaggerPreview();
						// 重新请求已存在的API列表
						vscode.postMessage({
							command: 'getExistingApis'
						});
						toastBody.innerHTML = '文档更新成功！';
						toast.show();
						resetButtonState(refreshBtn, 'refresh');
						break;
					case 'refreshSwaggerDocFailed':
						toastBody.innerHTML = '文档更新失败！';
						toast.show();
						resetButtonState(refreshBtn, 'refresh');
						break;
					case 'exportApiSuccess':
						// 清空选中状态
						selectedApis = {};
						// 取消所有勾选框的选中状态
						document.querySelectorAll('.form-check-input:checked').forEach(checkbox => {
							checkbox.checked = false;
							const listItem = checkbox.closest('.list-group-item');
							if (listItem) {
								listItem.classList.remove('selected-api');
							}
						});
						// 重新请求已存在的API列表
						vscode.postMessage({
							command: 'getExistingApis'
						});
						toastBody.innerHTML = 'API导出成功！';
						toast.show();
						resetButtonState(exportBtn, 'export');
						break;
					case 'exportApiFailed':
						toastBody.innerHTML = 'API导出失败！';
						toast.show();
						resetButtonState(exportBtn, 'export');
						break;
				}
			});

			// 标识已存在的API（只处理展开的控制器）
			function markExistingApis() {

				// 如果没有已存在的API数据，直接返回
				if (!existingApiData || Object.keys(existingApiData).length === 0) {
					return;
				}

				// 只处理当前展开的控制器
				const expandedAccordions = document.querySelectorAll('.accordion-collapse.show .accordion-body[data-tag]');

				expandedAccordions.forEach(accordionBody => {
					const tagName = accordionBody.getAttribute('data-tag');

					// 查找匹配的控制器数据
					Object.entries(existingApiData).forEach(([controllerName, apis]) => {
						// 匹配控制器名称
						const isMatchingController = tagName === controllerName ||
							tagName === controllerName.replace(/([A-Z])/g, (match, letter, index) => {
								return index === 0 ? letter.toLowerCase() : '-' + letter.toLowerCase();
							}).replace(/Controller$/, '');

						if (isMatchingController) {
							markApiItemsInController(accordionBody, apis);
						}
					});
				});
			}

			// 标记指定控制器中的API项
			function markApiItemsInController(accordionBody, apis) {
				// 清除该控制器下的现有标记
				const apiItems = accordionBody.querySelectorAll('.list-group-item');
				apiItems.forEach(item => {
					item.classList.remove('existing-api');
				});

				// 遍历该控制器下的所有API
				apis.forEach(existingApi => {

					apiItems.forEach(item => {
						const pathElement = item.querySelector('.api-path');
						const methodElement = item.querySelector('.badge');

						if (pathElement && methodElement) {
							const apiPath = pathElement.textContent.trim();
							const apiMethod = methodElement.textContent.trim().toLowerCase();

							// 检查路径和方法是否匹配
							if (apiPath === existingApi.path && apiMethod === existingApi.method.toLowerCase()) {
								item.classList.add('existing-api');
							}
						}
					});
				});
			}

			initSwaggerPreview();
		</script>
	</body>
</html>`;
