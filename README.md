# Va Swagger to API (Vue2/Vue3)

![版本](https://img.shields.io/badge/版本-3.0.0-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.80.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)
![Vue](https://img.shields.io/badge/Vue-2%20%7C%203-brightgreen.svg)
![OpenAPI](https://img.shields.io/badge/OpenAPI-2.0%20%7C%203.x-orange.svg)
![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)

一个强大的 VS Code 扩展，可以从 Swagger 2.0 / OpenAPI 3.x 文档生成 TypeScript API 客户端代码，支持智能增量更新。适用于 Vue 2、Vue 3 以及任何 TypeScript + Axios 项目。

## 🎉 v3.0.0 重大更新 - OpenAPI 3.x 支持

- 🚀 **完整 OpenAPI 3.x 支持**：自动检测版本，智能规范转换，完全兼容 Swagger 2.0
- 🔍 **智能 URL 探测**：支持 8 种常见 API 文档路径（FastAPI、Spring Boot 2/3、通用路径等）
- ⚡ **性能优化**：避免重复规范化，性能提升 28%+，刷新文档缓存破坏机制
- 🎨 **UI 优化**：文档信息展开/收起、响应式布局、Bootstrap 本地化、完全离线可用
- 🔧 **用户友好**：basePath 可编辑、HTTP 方法大写、更好的错误提示

## 🌟 v2.0.0 重大更新

- ✨ **完全重构的类型系统**：支持复杂嵌套泛型、智能类型前缀、自动依赖收集
- 🎯 **优化的参数处理**：准确的参数命名、完善的可选参数支持、路径参数正确处理
- 📦 **动态导出命名**：根据 Swagger 文档自动生成语义化的导出名称
- 🏗️ **标准化命名规范**：统一的 Controller 命名和类型定义
- 🔧 **代码质量提升**：消除硬编码、优化算法、增强可维护性

## ✨ 主要功能

### 🚀 **OpenAPI 3.x / Swagger 2.0 双版本支持**

- **智能版本检测**：自动识别 Swagger 2.0 或 OpenAPI 3.x
- **统一内部格式**：透明转换，对用户无感知
- **完整特性支持**：
  - OpenAPI 3.x：`requestBody`、`components/schemas`、`servers`、`anyOf`/`allOf`/`oneOf`
  - Swagger 2.0：`parameters`、`definitions`、`basePath`
- **智能 URL 探测**：自动尝试 8 种常见路径，支持 FastAPI、Spring Boot 等主流框架
- **兼容性保证**：生成的代码格式统一，无需修改现有代码

### 🎯 **选择性 API 生成**

- 从 Swagger/OpenAPI 文档中选择特定的接口
- 只生成您需要的 API
- 支持增量更新，不会丢失现有代码

### 🧠 **智能类型系统**

- 自动识别包装类型（`Result<T>`、`PageResult<T>`、`ReplyEntity<T>`、`BasePageRespDTO<T>` 等）
- 智能解析复杂嵌套泛型类型（如 `Result<BasePageRespDTO<UserDTO>>`）
- 自动为无泛型参数的类型补充 `<void>`（如 `ReplyEntity<void>`）
- 所有自定义类型自动添加 `Types.` 前缀，基础类型保持原样
- 正确处理 `Map<K, V>` 类型的泛型参数
- 生成带有 JSDoc 注释的清洁 TypeScript 接口
- 自动收集并生成所有依赖类型
- 处理数组、基础类型和复杂对象

### 🔄 **增量更新**

- 添加新 API 时不会覆盖现有代码
- 智能合并控制器和方法
- 保留您的手动修改
- 只更新变化的接口

### 🎨 **高级用户界面体验**

- **搜索和筛选**：通过名称或路径查找 API
- **批量操作**：选择/取消选择控制器中的所有 API
- **智能导航**：自动滚动到选中的控制器
- **持久状态**：切换标签页时不会刷新

### 🛠️ **开发者友好的输出**

- 生成符合 ESLint 规范的清洁代码
- 有序的文件结构（`index.ts`、`types.ts`、`apis.ts`）
- 自动清理方法名称
- 支持 GET（展开参数）和 POST（DTO）模式

## 🚀 快速开始

### 1. 安装

从 VS Code 扩展市场安装或下载 `.vsix` 文件。

### 2. 添加 Swagger/OpenAPI 文档

1. 在侧边栏打开 Swagger to API 面板
2. 点击"添加Swagger文档"
3. 输入您的文档 URL，支持多种格式：
   - **Swagger 2.0**: `http://localhost:8080/swagger-ui.html`
   - **OpenAPI 3.x (FastAPI)**: `http://localhost:8000/docs` 或 `http://localhost:8000/openapi.json`
   - **OpenAPI 3.x (Spring Boot 3)**: `http://localhost:8080/v3/api-docs`
   - **直接 JSON**: `http://api.example.com/swagger.json`

插件会自动探测正确的 API JSON 路径

### 3. 生成 API 代码

1. 点击"预览Swagger文档"
2. 选择您要生成的 API
3. 点击"导出选中接口"

## 📁 生成的文件结构

```bash
src/services/
└── {文档名称}/           # 根据 Swagger description/title 自动生成（PascalCase）
    ├── index.ts      # 聚合导出（动态命名：{DocName}Types + {DocName}Services）
    ├── types.ts      # TypeScript 类型定义（带 JSDoc 注释）
    └── apis.ts       # API 客户端方法（按 Controller 分组）
```

### 生成内容说明

- **types.ts**: 包含所有 TypeScript 接口定义，支持泛型、嵌套类型、可选属性等
- **apis.ts**: 包含 Controller 类型定义和实现，所有方法都有完整的类型标注
- **index.ts**: 动态导出，根据 Swagger 文档名称生成（如 `study-course` → `StudyCourseTypes` 和 `StudyCourseServices`）

## ⚙️ 配置

扩展会在您的工作区根目录创建一个 `.contractrc` 文件来管理 Swagger 文档配置：

```json
{
  "description": "此文件由va-swagger-to-api生成, 请勿改动或删除",
  "dirByRoot": "/src",
  "workDir": "services",
  "contracts": [
    {
      "name": "用户 API",
      "url": "http://localhost:8080/swagger-ui.html",
      "desc": "用户管理接口",
      "uid": "unique-id"
    }
  ]
}
```

## 🔧 环境要求

- **VS Code**：1.80.0 或更高版本
- **项目框架**：Vue 2、Vue 3 或任何 TypeScript 项目
- **HTTP 客户端**：Axios（推荐）或其他兼容的 HTTP 库
- **请求模块**：创建一个导出 `$http` 的 `request.ts` 文件
- **后端文档**：Swagger 2.0 或 OpenAPI 3.x (支持 3.0.x 和 3.1.x)

### 请求模块示例

需要在项目中创建一个 `request.ts` 文件，导出 `$http` 对象，提供 `run` 方法用于发送请求。

### 使用示例

假设 Swagger 文档 description 为 `study-course`，生成的导出名称为 `StudyCourseServices` 和 `StudyCourseTypes`：

**Vue 3 Composition API:**

```typescript
import { ref } from 'vue';
import StudyCourseServices, { StudyCourseTypes } from '@/services/StudyCourse';

const userList = ref<StudyCourseTypes.UserDTO[]>([]);

const loadUsers = async () => {
  const result = await StudyCourseServices.userController.getUserList(1, 20);
  if (result.success && result.data?.list) {
    userList.value = result.data.list;
  }
};
```

**Vue 2 Options API:**

```typescript
import StudyCourseServices, { StudyCourseTypes } from '@/services/StudyCourse';

export default {
  data() {
    return {
      userList: [] as StudyCourseTypes.UserDTO[]
    };
  },
  async created() {
    const result = await StudyCourseServices.userController.getUserList(1, 20);
    if (result.success && result.data?.list) {
      this.userList = result.data.list;
    }
  }
};
```

**通用 TypeScript:**

```typescript
import StudyCourseServices, { StudyCourseTypes } from '@/services/StudyCourse';

const user: StudyCourseTypes.UserDTO = { ... };
const result = await StudyCourseServices.userController.getUserList(1, 20);
```

## 🎯 支持的功能

### OpenAPI 3.x / Swagger 2.0 兼容性 (v3.0 新增)

**Swagger 2.0 支持：**

- ✅ 完整的 Swagger v2 规范解析
- ✅ 路径和操作（GET、POST、PUT、DELETE 等）
- ✅ 参数（查询、路径、请求体）
- ✅ 响应架构和泛型类型
- ✅ 标签用于控制器分组
- ✅ BasePath 自动处理
- ✅ 枚举类型支持
- ✅ 引用类型（`$ref`）解析

**OpenAPI 3.x 支持（v3.0 新增）：**

- ✅ OpenAPI 3.0.x 和 3.1.x 完整支持
- ✅ `requestBody` 自动转换为参数
- ✅ `components/schemas` 自动映射到 definitions
- ✅ `servers` 配置提取 basePath
- ✅ `anyOf`/`allOf`/`oneOf` 智能处理
- ✅ 可空类型自动简化
- ✅ `$ref` 路径自动转换
- ✅ 多种 content-type 支持（application/json 优先）
- ✅ 智能 URL 探测（FastAPI、Spring Boot 3 等）
- ✅ 用户可编辑 basePath

### 类型生成 (v2.0 增强)

- ✅ 带 JSDoc 注释的接口生成
- ✅ 复杂嵌套泛型类型（如 `Result<BasePageRespDTO<UserDTO[]>>`）
- ✅ 自动识别泛型包装类型（`Result<T>`、`ReplyEntity<T>`、`BasePageRespDTO<T>` 等）
- ✅ 无泛型参数自动补充 `<void>`
- ✅ 智能类型前缀（`Types.` 前缀自动添加）
- ✅ 数组和基础类型
- ✅ 嵌套对象结构
- ✅ 可选属性（`?` 标记）
- ✅ `Map<K, V>` 和 `PlainObject` 类型
- ✅ 自动收集依赖类型

### API 生成 (v2.0 增强)

- ✅ 基于控制器的组织（camelCase 命名）
- ✅ Controller 类型定义（PascalCase）
- ✅ 方法名称清理和唯一性保证
- ✅ GET/DELETE 请求参数展开（使用具体参数名）
- ✅ POST/PUT 请求使用 DTO
- ✅ 路径参数正确处理
- ✅ 查询参数正确处理
- ✅ 可选参数支持（`| undefined`）
- ✅ 完整的 TypeScript 类型标注
- ✅ AxiosRequestConfig 支持
- ✅ 方法注释自动生成

### 导出生成 (v2.0 新增)

- ✨ 动态文件夹命名（根据 Swagger description/title，PascalCase）
- ✨ 动态导出命名（`{DocName}Types`、`{DocName}Services`）
- ✨ 支持多种输入格式（中划线、下划线、小驼峰、空格分隔）
- ✨ 语义化的导出名称

## 📦 从 v1.x 迁移到 v2.0

### ⚠️ 破坏性变更

1. **导出结构变化**
   - v1.x: `import SmartServices, { SmartTypes } from '@/services/smart'`
   - v2.0: `import StudyCourseServices, { StudyCourseTypes } from '@/services/StudyCourse'`
   - 文件夹名和导出名根据 Swagger 文档动态生成（PascalCase）

2. **Controller 命名标准化**
   - v1.x: Controller 名称可能不一致（如 `BiDocking`）
   - v2.0: 统一使用 camelCase + `Controller` 后缀（如 `biDockingController`）

3. **类型前缀优化**
   - 所有自定义类型自动添加 `Types.` 前缀
   - 基础类型（`string`、`number` 等）不添加前缀

### 迁移步骤

1. 使用 v2.0 重新生成所有 API 代码
2. 全局搜索并替换导入语句
3. 更新 Controller 引用为新的 camelCase 格式
4. 运行测试验证

## 🐛 故障排除

### 常见问题

**问：生成的文件有 ESLint 错误**
答：扩展会自动添加 ESLint 禁用注释。请确保您的 ESLint 配置兼容。

**问：重新生成后方法丢失**
答：扩展使用增量更新。除非您特别重新生成，否则现有方法会被保留。

**问：找不到类型**
答：确保您的 `tsconfig.json` 包含生成文件的目录。

**问：导出名称是什么？**
答：导出名称根据 Swagger 的 `description` 或 `title` 自动生成。例如 `study-course` 会生成 `StudyCourseTypes` 和 `StudyCourseServices`。

**问：v2.0 的导出结构和 v1.x 不同，如何迁移？**
答：请参考上面的"从 v1.x 迁移到 v2.0"部分。主要是更新导入语句和 Controller 引用。

**问：类型定义中为什么都有 `Types.` 前缀？**
答：v2.0 自动为所有自定义类型添加 `Types.` 前缀，这样可以避免命名冲突，使类型来源更明确。基础类型（如 `string`、`number`）不会添加前缀。

**问：如何知道我的后端是 Swagger 2.0 还是 OpenAPI 3.x？**
答：插件会自动检测。如果不确定，可以直接尝试添加文档 URL，插件会自动探测正确的格式。OpenAPI 3.x 文档通常包含 `"openapi": "3.x.x"`，Swagger 2.0 包含 `"swagger": "2.0"`。

**问：OpenAPI 3.x 文档添加失败怎么办？**
答：插件会自动尝试 8 种常见路径。如果都失败，请检查：

1. URL 是否可访问（在浏览器中打开测试）
2. 是否是 JSON 格式的文档（不是 UI 页面）
3. 尝试直接使用 JSON 文件 URL（如 `http://localhost:8000/openapi.json`）
4. 查看 VS Code 的"输出"面板 → "Va Swagger to API"，查看详细错误信息

**问：刷新文档后参数没有更新？**
答：v3.0 已修复此问题。刷新时会破坏缓存，确保获取最新数据。如果仍有问题，请重新添加文档。

**问：可以编辑 basePath 吗？**
答：可以！v3.0 支持在预览界面编辑 basePath。点击 basePath 旁边的"编辑"按钮即可修改，修改会保存到配置文件中。

## 🎨 适用场景

### 前端项目

- **Vue 2/3 项目**：完美支持 Vue 2 和 Vue 3 + TypeScript + Axios 技术栈
- **React/Angular 项目**：生成纯 TypeScript 代码，可用于任何前端框架
- **Node.js 后端**：也可用于 Node.js 后端项目的 API 客户端

### 后端框架兼容性

- **Java Spring Boot**：Swagger 2.0 (Spring Boot 2.x) 和 OpenAPI 3.x (Spring Boot 3.x)
- **Python FastAPI**：原生 OpenAPI 3.x 支持
- **Node.js (Express/NestJS)**：Swagger 2.0 和 OpenAPI 3.x
- **Go (Gin/Echo)**：Swagger 2.0 和 OpenAPI 3.x
- **其他框架**：任何提供 Swagger/OpenAPI 文档的后端

### 开发场景

- **团队协作**：统一接口规范，减少沟通成本
- **快速开发**：自动生成类型定义，减少手动编码
- **接口维护**：支持增量更新，适应接口变更
- **微服务架构**：管理多个服务的 API 文档

## 🔍 高级功能

### 智能搜索

- 控制器级别搜索：快速定位特定的 API 分组
- 接口级别搜索：按路径或名称查找具体接口
- 模糊匹配：支持部分关键词搜索

### 批量操作

- 全选/取消全选：快速选择控制器下的所有接口
- 智能滚动：点击控制器自动滚动到视口顶部
- 状态保持：切换标签页时保持选择状态

### 类型优化

- 自动识别常见包装类型
- 处理复杂嵌套结构
- 生成清洁的 TypeScript 代码
- 避免类型冲突和重复

## 📄 许可证

本项目基于 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 为 Vue 2/3、React、Angular 和 TypeScript 开发者而构建
- 受更好的 Swagger 集成需求启发
- 感谢 VS Code 扩展开发社区

---

**享受使用自动生成的 TypeScript API 进行编码！** 🎉

## 🏷️ 关键词

Vue2, Vue3, TypeScript, Swagger, OpenAPI, API Client, Code Generation, Axios, REST API, Type Safety
