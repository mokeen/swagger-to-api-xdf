# Va Swagger to API (Vue2)

![版本](https://img.shields.io/badge/版本-1.0.0-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.80.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)
![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)

一个强大的 VS Code 扩展，可以从 Swagger/OpenAPI v2 文档生成 TypeScript API 客户端代码，支持智能增量更新。专为 Vue 2 项目优化。

## ✨ 主要功能

### 🎯 **选择性 API 生成**

- 从 Swagger 文档中选择特定的接口
- 只生成您需要的 API
- 支持增量更新，不会丢失现有代码

### 🧠 **智能类型系统**

- 自动识别包装类型（`Result<T>`、`PageResult<T>`、`ReplyEntity<T>`）
- 智能解析嵌套泛型类型
- 生成带有 JSDoc 注释的清洁 TypeScript 接口
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

### 2. 添加 Swagger 文档

1. 在侧边栏打开 Swagger to API 面板
2. 点击"添加Swagger文档"
3. 输入您的 Swagger UI URL（例如：`http://localhost:8080/swagger-ui.html`）

### 3. 生成 API 代码

1. 点击"预览Swagger文档"
2. 选择您要生成的 API
3. 点击"导出选中接口"

## 📁 生成的文件结构

```bash
src/services/
└── {文档名称}/
    ├── index.ts      # 聚合导出
    ├── types.ts      # TypeScript 接口
    └── apis.ts       # API 客户端方法
```

### 输出示例

types.ts

```typescript
export interface Result<T> {
  code?: string;
  data?: T;
  message?: string;
  success?: boolean;
}

export interface UserCreateReqDTO {
  name: string;        // 用户名称
  email?: string;      // 邮箱地址
  age?: number;        // 年龄
}
```

apis.ts

```typescript
import $http from '../request';
import * as Types from './types';

const basePath = '/api/v1';

export const UserController = {
  async createUser(req: Types.UserCreateReqDTO): Promise<Types.Result<boolean>> {
    const path = `${basePath}/user/create`;
    const ret = await $http.run(path, 'POST', req);
    return ret;
  },

  async getUserList(pageNo: number, pageSize: number): Promise<Types.Result<Types.PageResult<Types.UserDTO[]>>> {
    const path = `${basePath}/user/list`;
    const payload = { pageNo, pageSize };
    const ret = await $http.run(path, 'GET', payload);
    return ret;
  }
};
```

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
- **项目设置**：使用 Axios 的 TypeScript 项目
- **请求模块**：创建一个导出 `$http` 的 `request.ts` 文件

### 请求模块示例

```typescript
// src/services/request.ts
import axios, { AxiosRequestConfig } from 'axios';

const http = axios.create({
  baseURL: process.env.VUE_APP_API_BASE_URL,
  timeout: 10000,
});

export default {
  run<T, R>(path: string, method: string, data?: T, config?: AxiosRequestConfig): Promise<R> {
    return http.request({
      url: path,
      method: method.toLowerCase() as any,
      data: method === 'GET' ? undefined : data,
      params: method === 'GET' ? data : undefined,
      ...config,
    });
  }
};
```

### 业务使用

```typescript
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import * as Smart from '@/services/smart'
@Component({
  name: 'MessageCenter'
})
export default class MessageCenter extends Vue {
  private async created() {
    console.log(Smart, 'Smart')

    // 测试类型定义是否可用
    const testData: Smart.Result<string> = {
      code: '200',
      message: 'success',
      success: true,
      data: 'test'
    }
    console.log(testData)

    const payload = {。。。}

    const { data } = await Smart.SmartTimetableController.addTeacherAndRelationCourse(payload)

    console.log(data)
  }
}
</script>
```

## 🎯 支持的功能

### Swagger v2 兼容性

- ✅ 定义解析
- ✅ 路径和操作
- ✅ 参数（查询、路径、请求体）
- ✅ 响应架构
- ✅ 标签用于控制器分组
- ✅ BasePath 处理

### 类型生成

- ✅ 带 JSDoc 的接口生成
- ✅ 泛型包装类型
- ✅ 数组和基础类型
- ✅ 嵌套对象结构
- ✅ 可选属性

### API 生成

- ✅ 基于控制器的组织
- ✅ 方法名称清理
- ✅ GET 请求参数展开
- ✅ POST/PUT 请求使用 DTO
- ✅ TypeScript 返回类型

## 🐛 故障排除

### 常见问题

**问：生成的文件有 ESLint 错误**
答：扩展会自动添加 ESLint 禁用注释。请确保您的 ESLint 配置兼容。

**问：重新生成后方法丢失**
答：扩展使用增量更新。除非您特别重新生成，否则现有方法会被保留。

**问：找不到类型**
答：确保您的 `tsconfig.json` 包含生成文件的目录。

## 🎨 使用场景

- **Vue 2 项目**：专为 Vue 2 + TypeScript + Axios 技术栈优化
- **团队协作**：统一接口规范，减少沟通成本
- **快速开发**：自动生成类型定义，减少手动编码
- **接口维护**：支持增量更新，适应接口变更

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

- 为 Vue.js 和 TypeScript 开发者而构建
- 受更好的 Swagger 集成需求启发
- 感谢 VS Code 扩展开发社区

---

**享受使用自动生成的 TypeScript API 进行编码！** 🎉
