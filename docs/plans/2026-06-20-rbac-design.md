# RBAC 权限模块设计文档

> 日期: 2026-06-20
> 状态: 设计已确认，待实现

## 边界决策

| 维度 | 决策 | 说明 |
|------|------|------|
| 权限粒度 | 页面 + 接口级 | 页面控制菜单/路由可见性，接口控制 API 访问 |
| 组织维度 | 无，纯平权 RBAC | 用户→角色→权限，无部门/租户隔离 |
| Super Admin | 种子数据角色，RBAC 体系内 | `isSystem` 标记保护，不改 Guard 逻辑 |
| Refresh Token | 双轨制：RT 落库 + rotation | AT 无状态 JWT 15min，RT httpOnly cookie 7d，支持泄露检测 |
| 审计日志 | 认证行为 + 权限变更 | 登录/登出/刷新/角色分配撤销/权限变更 |
| 角色层级 | 扁平多角色，无继承 | 用户可分配多个角色，权限取并集 |

---

## 1. 数据模型 (Prisma)

### 1.1 RBAC 核心

```
User ──┬── UserRole ──┬── Role ──┬── RolePermission ──┬── Permission
       │              │          │                     │
       └── 一个用户可分配多个角色
                      └── 一个角色可绑定多个权限
```

- **User**: `{ id, username, password(hashed), isActive, createdAt, updatedAt }`
- **Role**: `{ id, name(unique), displayName, description?, isSystem, createdAt }`
- **Permission**: `{ id, code(unique), resource, action, displayName, createdAt }`
  - `code` 格式: `resource:action`，如 `user:read`、`user:write`、`role:delete`
- **UserRole**: `{ userId, roleId }` — 复合主键，级联删除
- **RolePermission**: `{ roleId, permissionId }` — 复合主键，级联删除

### 1.2 Auth

- **RefreshToken**: `{ id, tokenHash(unique), userId, expiresAt, usedAt?, replacedById?, revokedAt?, createdAt }`
  - `usedAt` 非空表示已被使用（rotation），`revokedAt` 非空表示显式吊销
  - `replacedById` 指向替换它的新 RT，形成 rotation 链

### 1.3 审计

- **AuditLog**: `{ id, userId?, action, targetType?, targetId?, detail(JSON)?, ipAddress?, userAgent?, createdAt }`
  - `action` 枚举: `LOGIN_SUCCESS | LOGIN_FAILED | LOGOUT | TOKEN_REFRESH | TOKEN_REUSE_DETECTED | ROLE_ASSIGN | ROLE_REVOKE | PERMISSION_GRANT | PERMISSION_REVOKE | PASSWORD_CHANGE`
  - `detail` 存变更前后值（JSON 字符串），用于"谁在什么时候把谁的权限从 X 改成了 Y"

### 1.4 种子数据

迁移后自动执行:
1. 创建 `super_admin` 角色 (`isSystem = true`)
2. 创建所有 Permission 行
3. `super_admin` 绑定到每个 Permission
4. 创建初始管理员用户并分配 `super_admin` 角色

`isSystem` 标记在业务层阻止删除/修改，不改变 Guard 逻辑。

---

## 2. 认证流程

### 2.1 登录

```
POST /api/auth/login { username, password }
  → 验密码 (bcrypt)
  → 查 UserRole → Role → RolePermission → Permission 获取 permission codes (Set)
  → 生成 AT (JWT, 15min, payload: { sub: userId, username })
  → 生成 RT (crypto.randomBytes(64).hex, 7d)
  → RT SHA-256 hash 写入 RefreshToken 表
  → 写入 AuditLog (LOGIN_SUCCESS|LOGIN_FAILED)
  → 返回 body: { accessToken, permissions: [...], user }
    设置 cookie: refreshToken (httpOnly, secure, sameSite=strict, path=/api/auth)
```

### 2.2 Token 刷新

```
POST /api/auth/refresh (cookie 自动携带 refreshToken)
  → RT SHA-256 查 RefreshToken 表
  → 不存在 → 401
  → 已过期 → 401 + 清理
  → usedAt || revokedAt 非空 → ⚠️ TOKEN REUSE DETECTED
      → 吊销该用户所有 RT (revokedAt=now)
      → 写入 AuditLog → 401
  → 正常:
      → 旧 RT: usedAt=now, replacedById=newRt.id
      → 新 AT + 新 RT 写入
      → 写入 AuditLog (TOKEN_REFRESH)
      → 返回 { accessToken } + 设置新 cookie
```

### 2.3 登出

```
POST /api/auth/logout (需 AT)
  → RT SHA-256 查库，标记 revokedAt=now
  → 写入 AuditLog (LOGOUT)
  → 清除 cookie → 200
```

### 2.4 Token 存储策略

| Token | 存储位置 | 理由 |
|-------|---------|------|
| Access Token | 前端内存 (React Context) | 避免 XSS 窃取 |
| Refresh Token | httpOnly cookie | JS 不可读，防 XSS |

---

## 3. 后端权限守卫

### 3.1 装饰器

```typescript
@RequirePermissions('user:read')                     // 单个
@RequirePermissions('user:read', 'user:write')        // OR 关系
@UseGuards(JwtAuthGuard, PermissionsGuard)            // 组合使用
```

### 3.2 Guard 逻辑

```
AuthMiddleware (JWT 验证)
  → req.user = { sub: userId, username }
  → 失败 → 401

PermissionsGuard
  → 从 req.user.sub 取 userId
  → 查内存缓存 (60s TTL)
  → 未命中 → Prisma nested include 查询 UserRole → Role → RolePermission
  → 聚合为 Set<string> { "user:read", "user:write", ... }
  → 比对: 所需权限 ∩ 用户权限 ≠ ∅ → 放行
  → 无交集 → 403 { message: "Forbidden", required: "user:delete" }
```

### 3.3 缓存 & 失效

- 单次查询 ~5ms（有索引）
- 内存 Map 缓存 60s
- 权限变更时主动 `invalidate(userId)`：
  - 角色分配/撤销
  - 角色权限绑定/解绑

### 3.4 公开路由

不设 `@RequirePermissions` = 有合法 JWT 即可访问。没有装饰器的 Controller 默认为公开接口（仅需登录）。

---

## 4. 前端权限集成

### 4.1 权限状态

```typescript
// AuthContext
{
  user: { id, username } | null
  permissions: Set<string>
  hasPermission(code: string): boolean
  hasAnyPermission(...codes: string[]): boolean
}
```

### 4.2 路由守卫

- **Next.js middleware.ts**: 仅检查 refreshToken cookie 是否存在（快速判断登录态），不存在 → `/login`，存在 → 放行
- **页面级**: `Layout` 中调用 `hasPermission(routePermission)`，无权限 → 展示 `<Forbidden />` 页面
- 路由映射维护在 `constants/permissions.ts`:
  ```typescript
  { path: "/users",    permissions: ["user:read"] }
  { path: "/roles",    permissions: ["role:read"] }
  { path: "/dashboard", permissions: [] }  // 登录即可
  ```

### 4.3 按钮级控制

```tsx
// 使用 HeroUI 的 isDisabled 或条件渲染
{hasPermission("user:delete") && (
  <Button onPress={handleDelete}>删除</Button>
)}
```

### 4.4 侧边栏菜单

根据路由映射表 + `hasPermission()` 决定每项是否显示。无权限的菜单项直接不渲染。

---

## 5. 待实现阶段

| 阶段 | 内容 |
|------|------|
| Phase 1 | Prisma Schema + 迁移 + 种子数据 |
| Phase 2 | 认证模块 (login/refresh/logout) + JWT Guard |
| Phase 3 | 权限 Guard + 装饰器 + 缓存 |
| Phase 4 | 审计日志模块 (Prisma Middleware 或 Interceptor) |
| Phase 5 | 前端 AuthContext + 路由守卫 + 登录页 |
| Phase 6 | 前端权限指令 + 侧边栏集成 |
| Phase 7 | 角色/权限管理页面 (CRUD) |

---

## 6. 关键边界处理

- **并发刷新**: 数据库行锁防止同时刷新产生 race condition
- **Token 泄露**: RT rotation 链 + 旧 token 重用检测 → 全量吊销
- **密码修改后**: 吊销该用户所有 RT，强制所有端重登
- **用户被禁用**: `User.isActive = false` → 下次 AT 过期后无法刷新，15 分钟内自然退出
- **无权限提示**: 前端显示 `<Forbidden />` 页面，后端返回 403 + `required` 字段告知缺失的权限
