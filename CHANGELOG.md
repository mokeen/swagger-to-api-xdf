# 更新日志

此文件记录了"Va Swagger to API(vue2)"扩展的所有重要更改。

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

- Vue 2 项目的 API 接口生成
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
