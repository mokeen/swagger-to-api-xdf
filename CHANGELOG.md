# 更新日志

此文件记录了"Va Swagger to API(vue)"扩展的所有重要更改。

## [3.2.1] - 2025-12-18

### 🧾 预览页体验优化（DTO 表格）

- **小屏自适应**：DTO/请求参数/响应结构表格在窄窗口下不再出位
- **无横向滚动条**：采用固定表格布局 + 强制断词换行，长字段名可自动换行显示

## [3.2.0] - 2025-12-18

### 🧠 IR / AST 生成链路稳定性（本次核心）

- **IR 稳定输出**：导出代码以 IR 为唯一权威数据源，确保 `apis.ts` / `types.ts` 生成结果可预测、便于重构与回归对比
- **与 $http.run 合同对齐**：`apis.ts` 统一输出 RESTful 风格路径（可能包含 `{param}`），并依赖 request 模板的 query-first + 404/405 fallback 策略兼容不同后端风格
- **读取现有 apis.ts**：读取既有代码时优先使用 TS AST 解析（失败回退正则），用于增量合并与保留历史方法信息

### 🧩 Swagger 导出交互优化（request 模板）

- **QuickPick 选择器**：导出时使用 QuickPick 替代弹窗按钮，选项更清晰
- **一次性说明区**：移除选项内重复说明文案，改为顶部分隔说明（更清爽）
- **取消也记住选择**：取消/关闭视为不导出 request，并缓存为 skip（可重置恢复弹窗）

### 🧱 request 模板能力增强

- **模板模块化**：request 模板独立到 `src/templates/requestTemplate.ts`，便于维护
- **可选导出**：支持在生成 `apis.ts/types.ts` 时选择是否同时生成 request 模板
- **复制 run 模型**：支持仅复制 `run` + 必要 helper 的最小片段，便于集成到自有封装

### 🧹 缓存重置入口

- **新增命令**：`重置 request 导出选择（重新弹窗）`
- **侧边栏入口**：Swagger Explorer 标题栏提供一键清缓存入口

### 🐛 Bug 修复（3.2.0）

- **request 入口一致性**：修复仅存在 `request/` 目录但无 `request/index.ts` 时，生成文件与 `apis.ts` 的 `import $http from '../request'` 不匹配的问题

## [3.1.0] - 2025-12-14

### 🧩 PreviewSwagger 预览页重构（零回归）

- **模板拆分**：将预览页从单文件内联模板重构为独立的 `EJS + CSS + JS` 资源文件，提升可读性与可维护性
- **CSP 合规**：外部资源引用保持 webview CSP 要求（nonce / 本地资源 URI）
- **交互一致性**：保持原有消息协议与核心交互行为一致（刷新、导出、筛选、全选/取消全选、DTO 展开等）

### 🏗️ 构建与发布链路优化

- **Webview 构建**：使用 `esbuild` 将 `webview-src/**/main.ts` 打包为 `resources/webview/**/**.js`（包含 sourcemap）
- **Extension Bundling**：使用 `esbuild` 将扩展入口打包为 `dist/extension.js`，并将 `vscode` 设为 external
- **预发布脚本**：`vscode:prepublish` 统一走 `compile:all`，确保发布包内始终包含最新 webview 产物与 extension bundle

### 📦 包体积与文件数优化

- **.vscodeignore**：补充更合理的忽略规则，显著减少 VSIX 文件数量与体积（不影响运行所需的 `dist/**` 与 `resources/**`）

## [3.0.0] - 2025-10-27

### 🎉 OpenAPI 3.x 支持重大更新

这是一个里程碑版本，全面支持 OpenAPI 3.x 规范，同时完全兼容 Swagger 2.0。

### ✨ OpenAPI 3.x 完整支持

- **智能规范适配器**：
  - 自动检测文档版本（Swagger 2.0 / OpenAPI 3.x）
  - 统一内部格式，对外透明
  - 将 OpenAPI 3.x 转换为 Swagger 2.0 兼容格式
  - 支持复杂的 OpenAPI 3.x 特性（`requestBody`、`components/schemas`、`servers` 等）

- **全面的类型转换**：
  - `requestBody` → `parameters[in=body]`
  - `components/schemas` → `definitions`
  - `responses.content.schema` → `responses.schema`
  - `$ref` 路径自动转换（`#/components/schemas/` → `#/definitions/`）
  - `anyOf`、`allOf`、`oneOf` 正确处理
  - 可空类型智能简化（`anyOf: [{$ref}, {type: null}]` → `$ref`）
  - 空 schema 对象正确忽略

- **智能 URL 探测机制**：
  - 支持 8 种常见 API 文档路径模式
  - FastAPI (`/openapi.json`)
  - Spring Boot 2.x (`/v2/api-docs`)
  - Spring Boot 3.x (`/v3/api-docs`)
  - 通用路径 (`/swagger.json`、`/api-docs` 等)
  - 自动循环尝试，任一成功即返回
  - 友好的错误信息（列出所有尝试的 URL）
  - 支持 HTTP 和 HTTPS 协议

- **Tags 规范化**：
  - OpenAPI 3.x 的 tag 自动添加 `Controller` 后缀
  - 与 Swagger 2.0 命名保持一致
  - 避免重复添加后缀
  - 从 paths 中收集实际使用的 tags
  - 为无 tag 的接口创建 `defaultController`

- **basePath 提取与编辑**：
  - 从 OpenAPI 3.x 的 `servers[0].url` 提取 basePath
  - 支持相对路径和绝对路径
  - 用户可在预览界面编辑 basePath
  - 编辑的值持久化到 `.contractrc`
  - 生成 API 时用户值优先

### 🚀 性能优化

- **避免重复规范化**：
  - 添加 `_normalized` 标记，避免重复处理
  - 规范化性能提升约 28%
  - 对大型文档（500+ 接口）提升 40%+
  - O(1) 时间复杂度的标记检查
  - 自动应用于所有调用场景

- **缓存破坏机制**：
  - 刷新文档时添加时间戳参数 `?_t=...`
  - 添加 HTTP 缓存控制头
  - 确保始终获取最新数据
  - 解决了接口参数更新不显示的问题

### 🎨 用户界面优化

- **文档信息展开/收起**：
  - 添加展开/收起按钮
  - 平滑动画效果（0.3秒过渡）
  - 图标旋转动画（展开 ▼ / 收起 ▶）
  - 收起时接口列表空间增加约 130px

- **响应式布局优化**：
  - 使用 Flexbox 自适应布局
  - 完美适配终端打开/关闭场景
  - 接口列表自动填充剩余空间
  - 避免固定高度计算导致的布局问题
  - 支持任意 webview 高度

- **Bootstrap 本地化**：
  - 将 Bootstrap 资源从 CDN 迁移到本地
  - 完全离线可用，不受网络影响
  - 加载速度提升（< 50ms vs 500-2000ms）
  - 避免 CDN 故障导致插件不可用
  - 版本锁定，确保行为一致性

### 🔧 其他改进

- **HTTP 方法大写**：
  - 生成的代码中 HTTP 方法统一为大写（`'GET'`、`'POST'` 等）
  - 符合 HTTP 规范和最佳实践

- **代码质量提升**：
  - 简化 SwaggerPreviewPanel 代码
  - 消除手动对象重构的冗余代码
  - 更清晰的注释和文档
  - 更好的错误处理

### 📝 文档更新

- 更新 README 说明 OpenAPI 3.x 支持
- 添加 OpenAPI 3.x 使用示例
- 更新兼容性说明

### 🐛 Bug 修复

- 修复刷新文档时可能获取缓存数据的问题
- 修复多预览窗口时已存在 API 标记不一致的问题
- 修复终端打开时 webview 布局异常的问题
- 修复 CDN 异常时插件不可用的问题

### ⚠️ 兼容性说明

- ✅ 完全向后兼容 Swagger 2.0
- ✅ 支持 OpenAPI 3.0.x 和 3.1.x
- ✅ 现有项目无需任何修改
- ✅ 生成的代码格式保持一致

---

## [2.0.0] - 2025-10-13

### 🎉 重大重构版本

这是一个完全重构的版本，全面优化了 API 生成逻辑，提升了代码质量、可维护性和生成代码的准确性。

### 🔥 核心重构

- **ApiGenerationService 完全重构**：
  - 消除所有硬编码值，提取为常量配置
  - 将复杂逻辑拆分为独立的工具方法
  - 优化类型池和 API 池的构建逻辑
  - 统一命名规范和转换策略

### ✨ 类型系统重大改进

- **完善泛型类型处理**：
  - 支持嵌套泛型类型（如 `Result<BasePageRespDTO<UserDTO>>`）
  - 自动识别泛型包装类型（`ReplyEntity`、`Result`、`PageResult` 等）
  - 对于无泛型参数的响应类型自动补充 `<void>`（如 `ReplyEntity<void>`）
  - 正确处理 `Map<K, V>` 类型的泛型参数（不对基础类型添加 `Types.` 前缀）

- **智能类型前缀处理**：
  - 所有自定义类型自动添加 `Types.` 前缀
  - 基础 TypeScript 类型（`string`、`number`、`boolean` 等）不添加前缀
  - `PlainObject` 和 `Map` 等自定义类型正确识别并添加前缀
  - 泛型参数内的类型递归处理，确保前缀正确

- **类型依赖自动收集**：
  - 自动识别并生成所有依赖的类型定义
  - 支持数组类型的依赖提取（如 `CommentDTO[]` 会自动生成 `CommentDTO`）
  - 完整的类型树构建，避免遗漏类型定义

### 🎯 参数处理优化

- **GET/DELETE 方法参数优化**：
  - 使用具体的参数名称而非通用的 `req`
  - 正确处理路径参数和查询参数
  - 路径参数正确包含在 payload 对象中
  - 支持数组类型参数的正确类型推导（如 `classUidList?: string[]`）

- **POST/PUT 方法参数优化**：
  - 非必需参数添加 `| undefined` 类型
  - 支持多个 body 参数的场景
  - 参数名称使用 Swagger 定义的实际名称

- **可选参数处理**：
  - 方法签名中正确使用 `?` 标记可选参数
  - 类型定义中正确处理可选属性

### 🏗️ Controller 命名标准化

- **统一命名规则**：
  - Controller 名称统一使用小驼峰格式（camelCase）
  - 保留 `Controller` 后缀（如 `assistantAgendaController`）
  - 已存在 API 的识别和合并逻辑统一命名标准
  - 避免命名不一致导致的 API 标记失效

- **类型定义命名**：
  - Controller 类型定义使用大驼峰格式（PascalCase）
  - 示例：`AssistantAgendaController`、`BiDockingController`

### 📦 动态导出生成

- **智能 index.ts 生成**：
  - 根据 Swagger 的 `description` 或 `title` 动态生成导出名称
  - 自动转换为大驼峰格式（PascalCase）
  - 支持多种命名格式输入（中划线、下划线、小驼峰、空格分隔等）
  - 生成两个导出：
    - `{DocName}Types`：类型命名空间导出
    - `{DocName}Services`：完整服务导出（默认导出）
  - 示例：`study-course` → `StudyCourseTypes` 和 `StudyCourseServices`

### 🔧 代码质量提升

- **消除冗余逻辑**：
  - 提取通用方法避免重复代码
  - 统一类型转换和命名规范处理
  - 优化数据结构和算法

- **增强错误处理**：
  - 完善边界情况处理
  - 改进错误提示和日志输出
  - 增强类型安全检查

- **提高可维护性**：
  - 添加详细的 JSDoc 注释
  - 方法职责单一，易于理解和测试
  - 常量集中管理，便于配置

### 🧪 测试和验证

- **完善测试覆盖**：
  - 添加类型生成测试
  - 添加 API 生成测试
  - 添加参数处理测试
  - 添加命名转换测试
  - 全量测试验证（基于 demo.json）

### 📝 Bug 修复

- **修复类型前缀问题**：修复嵌套泛型类型中缺少 `Types.` 前缀的问题
- **修复参数命名问题**：修复 GET/DELETE 方法参数名称不准确的问题
- **修复 Controller 命名问题**：修复 Controller 命名不一致导致的合并失败
- **修复类型缺失问题**：修复某些依赖类型未生成的问题（如 `CommentDTO`）
- **修复泛型参数问题**：修复 `Map<string, string>` 被错误处理为 `Map<Types.string, string>` 的问题
- **修复可选参数问题**：修复非必需参数缺少 `undefined` 类型的问题

### 🎨 用户体验改进

- **更清晰的代码输出**：生成的代码结构更清晰，易于阅读和维护
- **更准确的类型推导**：减少手动类型修正的需求
- **更智能的命名**：导出名称和文件夹名称与项目语义相关

### ⚠️ 破坏性变更

- **index.ts 导出结构变化**：
  - 旧版本：`export const Smart = APIs`
  - 新版本：`export const {DocName}Types = Types` 和 `export const {DocName}Services = { Types, ...APIs }`
  - 需要更新导入语句以适配新的导出格式

- **Controller 命名格式变化**：
  - 统一使用小驼峰格式，保留 Controller 后缀
  - 可能需要更新引用 Controller 的代码

## [1.0.2] - 2024-12-25

### 🔧 修复和优化

- **修复控制器重复生成问题**：优化控制器名称标准化机制，确保已存在的控制器与新选择的控制器正确合并
- **增强方法名唯一性**：采用路径哈希算法生成唯一方法名，格式为 `{cleanOperationId}_{pathHash}`，避免方法名冲突
- **完善 operationId 清理**：彻底处理 `UsingPOST_1` 等后缀，支持更复杂的命名场景
- **优化已存在API标记**：改为按需标记策略，只标记当前展开的控制器，提升性能
- **增强数据合并策略**：从增量更新改为"数据合并+全量重建"，提高稳定性和可维护性

### ✨ 新增功能

- **刷新时清除筛选**：刷新文档时自动清除所有控制器和API级别的筛选条件
- **完整泛型支持**：恢复并增强复杂泛型类型处理，支持 `Result<T>`、`PageResult<T>`、`BasePageRespDTO<T>` 等
- **智能控制器匹配**：优化已存在API的识别和标记逻辑，确保准确性

### 🎯 用户体验改进

- **Toast通知优化**：调整通知位置避免与文档头部重叠
- **导出成功反馈**：导出成功后自动取消API选择状态
- **筛选状态管理**：提供更直观的筛选清除功能

### 🏗️ 技术架构优化

- **方法名生成算法**：使用稳定的路径哈希确保相同输入产生相同输出
- **控制器名称标准化**：统一现有文件解析和新API生成的命名规则
- **错误处理增强**：完善各环节的错误处理和用户提示

## [1.0.0] - 2024-12-19

### 新增功能

- 🎉 Va Swagger to API 扩展首次发布
- ✨ 支持 Swagger/OpenAPI v2 文档解析
- 🔄 智能增量代码生成，支持智能合并
- 🎯 选择性 API 生成（可选择特定接口）
- 📁 有序的输出结构（index.ts、types.ts、apis.ts）
- 🏷️ 智能类型解析，支持泛型包装类型
- 🔍 高级用户界面功能：
  - 控制器级别和接口级别搜索
  - 批量选择/取消选择操作
  - 智能滚动和导航
  - 标签页切换时不刷新
- 🛡️ 类型安全的 TypeScript 代码生成
- 📦 支持复杂嵌套类型和数组
- 🎨 自动方法名清理和冲突解决
- 🔧 防止 ESLint 和 TypeScript 错误
- 💾 持久化配置管理
- 🌐 支持各种 Swagger JSON 端点

### 主要特性

- **智能类型系统**：自动识别 `Result<T>`、`PageResult<T>`、`ReplyEntity<T>`、`BasePageRespDTO<T>` 包装类型
- **增量更新**：添加新接口时不会丢失现有接口
- **灵活导入**：使用默认导入方式引入 HTTP 客户端（`import $http from '../request'`）
- **动态 basePath**：自动从 Swagger JSON 中提取和处理 basePath
- **清洁代码**：生成符合 ESLint 规范的代码，具有正确的 TypeScript 类型
- **Vue + Axios 优化**：专为使用 Axios 的 Vue.js 项目设计

### 技术细节

- 支持 Swagger v2 规范
- 生成 TypeScript 接口和 API 客户端
- 处理 GET 请求的展开参数
- 管理 POST/PUT/DELETE 请求的 DTO
- 自动处理路径参数和查询参数
- 全面的错误处理和验证

### 使用场景

- Vue 项目的 API 接口生成
- 基于 Swagger 文档的 TypeScript 类型定义
- 团队协作中的接口规范统一
- 减少手动编写接口代码的工作量

### 支持的功能

- ✅ Swagger v2 规范解析
- ✅ 按需选择接口生成
- ✅ 增量更新，保留现有代码
- ✅ 智能类型推导
- ✅ 控制器分组管理
- ✅ 搜索和筛选功能
- ✅ 批量操作支持
