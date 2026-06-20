# RBAC 权限模块实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 happy-chat 中后台构建完整的 RBAC 权限系统（认证 + 授权 + 审计）

**Architecture:** NestJS 后端使用 JWT 双轨制认证 + CanActivate Guard 实现接口级权限控制，Next.js 16 前端使用 React Context + middleware 实现路由级守卫和按钮级权限隐藏。Prisma ORM 管理所有 RBAC 数据模型（User/Role/Permission/RefreshToken/AuditLog）。

**Tech Stack:** NestJS 11, Prisma, PostgreSQL, Passport-JWT, bcrypt, Next.js 16, Tailwind CSS 4, HeroUI

---

## Pre-requisites: 安装新依赖

这些依赖将在各 Task 中按需安装，此处汇总一次。

```bash
# services/chat — 后端
cd services/chat
bun add @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs cookie-parser
bun add prisma @prisma/client
bun add -D @types/passport-jwt @types/bcryptjs @types/cookie-parser

# services/chat — Prisma 初始化
cd services/chat && bunx prisma init

# clients/chat-web — 前端 (HeroUI)
cd clients/chat-web
bun add @heroui/react framer-motion
```

---

### Task 1: Prisma Schema 定义

**Files:**
- Create: `services/chat/prisma/schema.prisma`
- Modify: `services/chat/.env` (添加 DATABASE_URL)

**Step 1: 编写 Prisma Schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  username  String   @unique
  password  String   // bcrypt hashed
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userRoles     UserRole[]
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  displayName String
  description String?
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())

  userRoles       UserRole[]
  rolePermissions RolePermission[]
}

model Permission {
  id          String   @id @default(uuid())
  code        String   @unique
  resource    String
  action      String
  displayName String
  createdAt   DateTime @default(now())

  rolePermissions RolePermission[]
}

model UserRole {
  userId    String
  roleId    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
  @@index([userId])
  @@index([roleId])
}

model RolePermission {
  roleId       String
  permissionId String
  createdAt    DateTime @default(now())

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId])
}

model RefreshToken {
  id           String    @id @default(uuid())
  tokenHash    String    @unique
  userId       String
  expiresAt    DateTime
  usedAt       DateTime?
  replacedById String?
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?
  action     String
  targetType String?
  targetId   String?
  detail     String?  // JSON
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

**Step 2: 配置 DATABASE_URL**

在 `services/chat/.env` 中添加：
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/happy_chat?schema=public"
```

**Step 3: 运行数据库迁移**

```bash
cd services/chat && bunx prisma migrate dev --name init_rbac
```
Expected: 迁移成功，数据库创建所有 7 张表。

**Step 4: Commit**

```bash
git add services/chat/prisma/schema.prisma services/chat/.env services/chat/prisma/migrations
git commit -m "feat: add Prisma schema with RBAC, auth, and audit tables"
```

---

### Task 2: 种子数据脚本

**Files:**
- Create: `services/chat/prisma/seed.ts`
- Modify: `services/chat/package.json` (添加 prisma.seed)

**Step 1: 定义权限清单**

先在 `services/chat/prisma/seed.ts` 中定义所有权限位：

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // 用户管理
  { code: 'user:read',   resource: 'user', action: 'read',   displayName: '查看用户' },
  { code: 'user:write',  resource: 'user', action: 'write',  displayName: '创建/编辑用户' },
  { code: 'user:delete', resource: 'user', action: 'delete', displayName: '删除用户' },
  // 角色管理
  { code: 'role:read',   resource: 'role', action: 'read',   displayName: '查看角色' },
  { code: 'role:write',  resource: 'role', action: 'write',  displayName: '创建/编辑角色' },
  { code: 'role:delete', resource: 'role', action: 'delete', displayName: '删除角色' },
  // 权限管理
  { code: 'permission:read', resource: 'permission', action: 'read', displayName: '查看权限' },
  // 审计日志
  { code: 'audit:read', resource: 'audit', action: 'read', displayName: '查看审计日志' },
];

async function main() {
  // 1. 创建所有权限
  const permissions: Record<string, string> = {}; // code → id
  for (const perm of PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
    permissions[created.code] = created.id;
  }

  // 2. 创建 super_admin 角色
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: {},
    create: {
      name: 'super_admin',
      displayName: '超级管理员',
      description: '系统内置超级管理员，拥有所有权限',
      isSystem: true,
    },
  });

  // 3. super_admin 绑定所有权限
  for (const permId of Object.values(permissions)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permId } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permId },
    });
  }

  // 4. 创建初始 admin 用户 (密码: admin123)
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: passwordHash },
  });

  // 5. 分配 super_admin 角色
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: superAdminRole.id },
  });

  console.log('Seed completed: super_admin role, permissions, and admin user created');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**Step 2: 在 package.json 中配置 seed 路径**

在 `services/chat/package.json` 中添加：
```json
"prisma": {
  "seed": "bun prisma/seed.ts"
}
```

**Step 3: 运行种子脚本验证**

```bash
cd services/chat && bunx prisma db seed
```
Expected: `Seed completed` 输出，数据库中 User/Role/Permission 关联正确。

**Step 4: Commit**

```bash
git add services/chat/prisma/seed.ts services/chat/package.json
git commit -m "feat: add seed script with super_admin role and admin user"
```

---

### Task 3: PrismaService + 注入到 NestJS

**Files:**
- Create: `services/chat/src/prisma/prisma.service.ts`
- Create: `services/chat/src/prisma/prisma.module.ts`
- Modify: `services/chat/src/app.module.ts`

**Step 1: 创建 PrismaService**

```typescript
// services/chat/src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**Step 2: 创建 PrismaModule (Global)**

```typescript
// services/chat/src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

**Step 3: 把 PrismaModule 导入 AppModule**

在 `services/chat/src/app.module.ts` 的 `imports` 中添加 `PrismaModule`。

**Step 4: 验证 NestJS 能正常启动**

```bash
cd services/chat && bun run dev
```
Expected: `Chat service running on http://localhost:4001`，无 Prisma 连接错误。

**Step 5: Commit**

```bash
git add services/chat/src/prisma services/chat/src/app.module.ts
git commit -m "feat: add PrismaService as global NestJS module"
```

---

### Task 4: Auth DTOs

**Files:**
- Create: `services/chat/src/auth/dto/login.dto.ts`
- Create: `services/chat/src/auth/dto/auth-response.dto.ts`

**Step 1: Login DTO**

```typescript
// services/chat/src/auth/dto/login.dto.ts
import { IsString, MinLength } from 'class-validator';
// 注: 需要先安装 class-validator 和 class-transformer
// bun add class-validator class-transformer

export class LoginDto {
  @IsString()
  @MinLength(2)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

**Step 2: Auth Response DTO**

```typescript
// services/chat/src/auth/dto/auth-response.dto.ts
export interface AuthResponse {
  accessToken: string;
  permissions: string[];
  user: {
    id: string;
    username: string;
  };
}
```

---

### Task 5: AuthService (login / refresh / logout)

**Files:**
- Create: `services/chat/src/auth/auth.service.ts`
- Write tests first: `services/chat/src/auth/auth.service.spec.ts`

**Step 1: 安装缺失依赖**

```bash
cd services/chat && bun add @nestjs/jwt bcryptjs
cd services/chat && bun add -D @types/bcryptjs
```

**Step 2: 编写 AuthService Spec (TDD — 先写测试)**

```typescript
// services/chat/src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('should return accessToken and permissions on valid credentials', async () => { /* ... */ });
    it('should throw UnauthorizedException on wrong password', async () => { /* ... */ });
    it('should throw UnauthorizedException when user is inactive', async () => { /* ... */ });
  });

  describe('refresh', () => {
    it('should return new accessToken on valid refresh token', async () => { /* ... */ });
    it('should revoke all user tokens on reused token (leak detection)', async () => { /* ... */ });
    it('should throw on expired refresh token', async () => { /* ... */ });
  });

  describe('logout', () => {
    it('should revoke the refresh token', async () => { /* ... */ });
  });
});
```

测试预期行为：登录成功返回 AT + permissions，错误密码抛 401，token 重用检测触发全量吊销。

**Step 3: 实现 AuthService**

```typescript
// services/chat/src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse } from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string, ua?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      await this.audit.log({ userId: null, action: 'LOGIN_FAILED', detail: JSON.stringify({ username: dto.username }), ipAddress: ip, userAgent: ua });
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const permissions = await this.getUserPermissions(user.id);
    const accessToken = this.jwt.sign({ sub: user.id, username: user.username });
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) },
    });

    await this.audit.log({ userId: user.id, action: 'LOGIN_SUCCESS', ipAddress: ip, userAgent: ua });

    return { accessToken, permissions, user: { id: user.id, username: user.username } };
  }

  async refresh(rawToken: string): Promise<{ accessToken: string }> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }
    if (stored.usedAt || stored.revokedAt) {
      // Token reuse detected — possible leak
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ userId: stored.userId, action: 'TOKEN_REUSE_DETECTED' });
      throw new UnauthorizedException('Token reuse detected, please re-login');
    }

    const newRt = this.generateRefreshToken();
    const newHash = this.hashToken(newRt);
    const newRecord = await this.prisma.refreshToken.create({
      data: { tokenHash: newHash, userId: stored.userId, expiresAt: new Date(Date.now() + 7 * 24 * 3600_000) },
    });

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { usedAt: new Date(), replacedById: newRecord.id },
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    const accessToken = this.jwt.sign({ sub: user!.id, username: user!.username });

    await this.audit.log({ userId: stored.userId, action: 'TOKEN_REFRESH' });
    return { accessToken };
  }

  async logout(rawToken: string, userId: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ userId, action: 'LOGOUT' });
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    const codes = new Set<string>();
    for (const ur of roles) {
      for (const rp of ur.role.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }
    return [...codes];
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
```

**Step 4: 运行测试验证**

```bash
cd services/chat && bun run test -- --testPathPattern=auth.service
```
Expected: 全部 pass

**Step 5: Commit**

```bash
git add services/chat/src/auth
git commit -m "feat: add AuthService with login/refresh/logout and token reuse detection"
```

---

### Task 6: JWT Strategy + Auth Guard

**Files:**
- Create: `services/chat/src/auth/strategies/jwt.strategy.ts`
- Create: `services/chat/src/auth/guards/jwt-auth.guard.ts`
- Create: `services/chat/src/auth/guards/optional-auth.guard.ts`

**Step 1: JWT Strategy**

```typescript
// services/chat/src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-me',
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, username: payload.username };
  }
}
```

**Step 2: JWT Auth Guard**

```typescript
// services/chat/src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**Step 3: JWT 模块配置**

在 `auth.module.ts` 中配置 `JwtModule.register({ secret, signOptions: { expiresIn: '15m' } })`。

**Step 4: Commit**

```bash
git add services/chat/src/auth
git commit -m "feat: add JWT strategy and auth guard"
```

---

### Task 7: Auth Controller

**Files:**
- Create: `services/chat/src/auth/auth.controller.ts`
- Create: `services/chat/src/auth/auth.controller.spec.ts`

**Step 1: Auth Controller**

```typescript
// services/chat/src/auth/auth.controller.ts
import { Controller, Post, Body, Req, UseGuards, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, req.ip, req.headers['user-agent']);
    res.cookie('refreshToken', result.accessToken, COOKIE_OPTIONS); // FIX: 应该是 refreshToken
    return { accessToken: result.accessToken, permissions: result.permissions, user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refreshToken;
    if (!token) throw new UnauthorizedException('No refresh token');
    const result = await this.auth.refresh(token);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refreshToken;
    if (token) await this.auth.logout(token, req.user.userId);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return { ok: true };
  }
}
```

> ⚠️ Login 返回的 cookie 应为 RT 而非 AT（上面代码需修正）

**Step 2: 修复 AuthService.login 返回 refreshToken**

`AuthService.login` 需要额外返回 `refreshToken` 字段（未哈希的原始值），Controller 将其 set 到 cookie。

**Step 3: 运行测试验证**

```bash
cd services/chat && bun run test -- --testPathPattern=auth.controller
```

---

### Task 8: Auth Module 组装 + main.ts 配置

**Files:**
- Modify: `services/chat/src/auth/auth.module.ts`
- Modify: `services/chat/src/main.ts`
- Modify: `services/chat/src/app.module.ts`

**Step 1: 组装 AuthModule**

```typescript
// services/chat/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

**Step 2: 在 main.ts 中启用 cookie-parser**

```typescript
// services/chat/src/main.ts 增加
import * as cookieParser from 'cookie-parser';
// ...
app.use(cookieParser());
```

**Step 3: 在 AppModule 中导入 AuthModule**

**Step 4: 手动验证登录流程**

```bash
# 终端测试 login
curl -X POST http://localhost:4001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt
```
Expected: `{ "accessToken": "...", "permissions": ["user:read", ...], "user": {...} }`

**Step 5: 验证 refresh**

```bash
curl -X POST http://localhost:4001/api/auth/refresh -b cookies.txt
```
Expected: `{ "accessToken": "..." }`

**Step 6: Commit**

```bash
git add services/chat/src/auth services/chat/src/main.ts services/chat/src/app.module.ts
git commit -m "feat: wire up AuthModule with login/refresh/logout endpoints"
```

---

### Task 9: Permission 装饰器 + Guard + 缓存

**Files:**
- Create: `services/chat/src/rbac/decorators/permissions.decorator.ts`
- Create: `services/chat/src/rbac/guards/permissions.guard.ts`
- Create: `services/chat/src/rbac/cache/permissions.cache.ts`
- Create: `services/chat/src/rbac/rbac.module.ts`

**Step 1: 装饰器**

```typescript
// services/chat/src/rbac/decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
```

**Step 2: 权限缓存**

```typescript
// services/chat/src/rbac/cache/permissions.cache.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class PermissionsCache {
  private store = new Map<string, { codes: Set<string>; expiresAt: number }>();
  private readonly TTL = 60_000; // 60s

  get(userId: string): Set<string> | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(userId); return null; }
    return entry.codes;
  }

  set(userId: string, codes: Set<string>): void {
    this.store.set(userId, { codes, expiresAt: Date.now() + this.TTL });
  }

  invalidate(userId: string): void {
    this.store.delete(userId);
  }

  invalidateAll(): void {
    this.store.clear();
  }
}
```

**Step 3: PermissionsGuard**

```typescript
// services/chat/src/rbac/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsCache } from '../cache/permissions.cache';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: PermissionsCache,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true; // 无需权限 = 公开路由

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    if (!userId) return false;

    let codes = this.cache.get(userId);
    if (!codes) {
      const list = await this.auth.getUserPermissions(userId);
      codes = new Set(list);
      this.cache.set(userId, codes);
    }

    const hasPermission = required.some((code) => codes!.has(code));
    if (!hasPermission) {
      throw new ForbiddenException({ message: 'Forbidden', required: required.join(' | ') });
    }
    return true;
  }
}
```

**Step 4: 组装 RbacModule**

```typescript
// services/chat/src/rbac/rbac.module.ts
import { Module, Global } from '@nestjs/common';
import { PermissionsCache } from './cache/permissions.cache';

@Global()
@Module({
  providers: [PermissionsCache],
  exports: [PermissionsCache],
})
export class RbacModule {}
```

**Step 5: 编写测试**

在 `services/chat/src/rbac/guards/permissions.guard.spec.ts` 中测试：
- 无装饰器 → 放行
- 有装饰器 + 用户没有所需权限 → ForbiddenException
- 有装饰器 + 用户有权限 → 放行
- 缓存命中 → 不查库

**Step 6: 在 AppModule 导入 RbacModule**

**Step 7: 在 AppController 上验证**

给 `GET /hello` 加上 `@RequirePermissions('user:read')` 并测试。

**Step 8: Commit**

```bash
git add services/chat/src/rbac services/chat/src/app.module.ts
git commit -m "feat: add PermissionsGuard with cache and @RequirePermissions decorator"
```

---

### Task 10: 审计日志模块

**Files:**
- Create: `services/chat/src/audit/audit.service.ts`
- Create: `services/chat/src/audit/audit.module.ts`

**Step 1: AuditService**

```typescript
// services/chat/src/audit/audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    await this.prisma.auditLog.create({ data: entry });
  }

  async query(params: { action?: string; userId?: string; from?: Date; to?: Date; skip?: number; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.action && { action: params.action }),
        ...(params.userId && { userId: params.userId }),
        ...(params.from || params.to ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: params.skip || 0,
      take: params.take || 50,
    });
  }
}
```

**Step 2: AuditModule**

```typescript
// services/chat/src/audit/audit.module.ts
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

**Step 3: 在 AppModule 导入 AuditModule**

**Step 4: Commit**

```bash
git add services/chat/src/audit services/chat/src/app.module.ts
git commit -m "feat: add AuditService for authentication and permission change logging"
```

---

### Task 11: 后端 RBAC 管理 API

**Files:**
- Create: `services/chat/src/user/user.module.ts`
- Create: `services/chat/src/user/user.controller.ts`
- Create: `services/chat/src/user/user.service.ts`
- Create: `services/chat/src/role/role.module.ts`
- Create: `services/chat/src/role/role.controller.ts`
- Create: `services/chat/src/role/role.service.ts`

**Step 1: UserController 关键端点**

```typescript
// GET /api/users        — @RequirePermissions('user:read')
// POST /api/users       — @RequirePermissions('user:write')
// PATCH /api/users/:id/roles  — @RequirePermissions('user:write')
//   body: { roleIds: string[] }
//   调用 auth.getUserPermissions() 的缓存 invalidate
```

**Step 2: RoleController 关键端点**

```typescript
// GET /api/roles             — @RequirePermissions('role:read')
// POST /api/roles            — @RequirePermissions('role:write')
//   body: { name, displayName, permissionIds }
// DELETE /api/roles/:id      — @RequirePermissions('role:delete')
//   禁止删除 isSystem=true 的角色
// PATCH /api/roles/:id/permissions — @RequirePermissions('role:write')
//   变更后调用 permissionsCache.invalidateAll()（因为不知道哪些用户受影响了）
```

**Step 3: 权限列表端点**

```typescript
// GET /api/permissions — @RequirePermissions('permission:read')
//   返回所有 Permission（只读，无需写端点，由种子数据管理）
```

**Step 4: 审计日志端点**

```typescript
// GET /api/audit-logs — @RequirePermissions('audit:read')
//   query params: action?, userId?, from?, to?, page?, pageSize?
```

**Step 5: Commit**

```bash
git add services/chat/src/user services/chat/src/role
git commit -m "feat: add user/role management APIs with permission guards"
```

---

### Task 12: 前端 AuthContext + 登录页

**Files:**
- Create: `clients/chat-web/src/contexts/auth-context.tsx`
- Create: `clients/chat-web/src/app/login/page.tsx`
- Create: `clients/chat-web/src/lib/api.ts` (API client with auto-refresh)

**Step 1: AuthContext**

```typescript
// clients/chat-web/src/contexts/auth-context.tsx
'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthState {
  user: { id: string; username: string } | null;
  permissions: Set<string>;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (...codes: string[]) => boolean;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set<string>());
  const [isLoading, setIsLoading] = useState(true);

  // 应用启动时尝试 refresh
  useEffect(() => {
    fetch('/api/auth/refresh', { method: 'POST' })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // AT 存内存 (state)
          setAccessToken(data.accessToken);
          // 需要再调 /api/auth/me 拿 user + permissions
          // 或 login/refresh 统一返回这些
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // ... login, logout, hasPermission, hasAnyPermission 实现
}

export const useAuth = () => useContext(AuthContext);
```

**Step 2: API Client（带自动 refresh）**

```typescript
// clients/chat-web/src/lib/api.ts
let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) { accessToken = token; }

async function refreshAccessToken(): Promise<string | null> {
  // 防止并发 refresh
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (!res.ok) return null;
      const data = await res.json();
      accessToken = data.accessToken;
      return data.accessToken;
    } catch { return null; }
    finally { refreshPromise = null; }
  })();
  return refreshPromise;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res = await fetch(url, { ...options, headers });
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    }
  }
  return res;
}
```

**Step 3: 登录页 (HeroUI)**

```tsx
// clients/chat-web/src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { Input, Button, Card, CardBody, CardHeader } from '@heroui/react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      router.push('/');
    } catch {
      setError('用户名或密码错误');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-96">
        <CardHeader>登录</CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="用户名" value={username} onValueChange={setUsername} />
            <Input label="密码" type="password" value={password} onValueChange={setPassword} />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button type="submit" isLoading={loading} className="w-full">登录</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
```

**Step 4: 修改 AuthProvider 使 login 返回 RT → httpOnly cookie**

login 调用 POST `/api/auth/login` → 后端 set cookie，前端只存 AT + user + permissions 到 state。

---

### Task 13: Next.js Middleware + 路由守卫

**Files:**
- Create: `clients/chat-web/src/middleware.ts`
- Create: `clients/chat-web/src/app/forbidden/page.tsx`
- Create: `clients/chat-web/src/constants/permissions.ts`

**Step 1: middleware.ts（仅检查登录态）**

```typescript
// clients/chat-web/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/refresh'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasCookie = request.cookies.has('refreshToken');
  if (!hasCookie) return NextResponse.redirect(new URL('/login', request.url));

  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
```

**Step 2: 权限映射表**

```typescript
// clients/chat-web/src/constants/permissions.ts
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/':          [],
  '/dashboard': [],
  '/users':     ['user:read'],
  '/roles':     ['role:read'],
  '/audit-logs': ['audit:read'],
};
```

**Step 3: 受保护 Layout 组件**

在 `app/layout.tsx` 或一个 `ProtectedLayout` 组件中，用 `useAuth().hasAnyPermission(...ROUTE_PERMISSIONS[pathname])` 做判断，无权限渲染 `<Forbidden />`。

**Step 4: Forbidden 页面**

```tsx
// clients/chat-web/src/app/forbidden/page.tsx
export default function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">403 — 权限不足</h1>
      <p className="text-gray-500 mt-2">你没有访问此页面的权限</p>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add clients/chat-web/src/middleware.ts clients/chat-web/src/constants clients/chat-web/src/app/forbidden clients/chat-web/src/app/login clients/chat-web/src/contexts clients/chat-web/src/lib
git commit -m "feat: add frontend auth context, login page, middleware, and route guards"
```

---

### Task 14: 侧边栏菜单权限控制 + 按钮级权限

**Files:**
- Create: `clients/chat-web/src/components/sidebar.tsx`
- Create: `clients/chat-web/src/components/permission-guard.tsx`
- Modify: `clients/chat-web/src/app/layout.tsx`

**Step 1: 菜单配置（带权限过滤）**

```typescript
// clients/chat-web/src/constants/menu.ts
export const MENU_ITEMS = [
  { label: '仪表盘',    href: '/dashboard',   permissions: [] },
  { label: '用户管理',  href: '/users',       permissions: ['user:read'] },
  { label: '角色管理',  href: '/roles',       permissions: ['role:read'] },
  { label: '审计日志',  href: '/audit-logs',  permissions: ['audit:read'] },
];
```

**Step 2: Sidebar 组件 (HeroUI)**

使用 `useAuth().hasAnyPermission(...item.permissions)` 过滤可见菜单项，用 HeroUI 的 `Navbar`/`Listbox` 渲染。

**Step 3: PermissionGuard 组件**

```tsx
// clients/chat-web/src/components/permission-guard.tsx
'use client';
import { useAuth } from '@/contexts/auth-context';

export function PermissionGuard({ permissions, children, fallback = null }: {
  permissions: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasAnyPermission } = useAuth();
  if (permissions.length === 0 || hasAnyPermission(...permissions)) return <>{children}</>;
  return <>{fallback}</>;
}
```

**Step 4: Commit**

```bash
git add clients/chat-web/src/components clients/chat-web/src/constants/menu.ts clients/chat-web/src/app/layout.tsx
git commit -m "feat: add sidebar with permission filtering and PermissionGuard component"
```

---

### Task 15: 角色/用户管理页面 (CRUD)

**Files:**
- Create: `clients/chat-web/src/app/users/page.tsx`
- Create: `clients/chat-web/src/app/roles/page.tsx`
- Create: `clients/chat-web/src/app/audit-logs/page.tsx`

**Step 1: 用户管理页**

HeroUI `Table` 组件 + `Modal` 做增删改。关键操作：
- 列表展示：username, isActive, roles
- 分配角色：Modal 中多选 Role
- 禁用/启用用户

**Step 2: 角色管理页**

HeroUI `Table` 组件 + `Modal`：
- 列表展示：name, displayName, 权限数量
- 新建/编辑角色 + 绑定权限（多选 Permission 列表）
- 删除角色时前端禁用 `isSystem` 的行（后端也会拒绝）

**Step 3: 审计日志页**

只读 Table，支持按 action、userId、时间范围过滤。

**Step 4: Commit**

```bash
git add clients/chat-web/src/app/users clients/chat-web/src/app/roles clients/chat-web/src/app/audit-logs
git commit -m "feat: add user, role management and audit log pages"
```

---

### Task 16: 集成测试 + 端到端验证

**Steps:**

1. 启动 PostgreSQL、后端、前端
2. 用 admin/admin123 登录
3. 验证菜单项全部可见（super_admin 有所有权限）
4. 创建新角色 `viewer`（仅分配 `user:read`）
5. 创建新用户 `viewer1` 分配 `viewer` 角色
6. 用 `viewer1` 登录，验证仅能看到"用户管理"菜单
7. 尝试直接访问 `/roles` → 应看到 403
8. 验证 token refresh 正常（等 15 分钟或缩短 JWT 过期时间测试）
9. 验证 logout 后 cookie 被清除

```bash
# 运行所有测试
cd services/chat && bun run test
cd clients/chat-web && bun run typecheck
```

**Commit:**

```bash
git commit -m "test: add integration verification for RBAC module"
```

---

## 依赖清单

```bash
# 后端 services/chat
bun add @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs cookie-parser class-validator class-transformer
bun add prisma @prisma/client
bun add -D @types/passport-jwt @types/bcryptjs @types/cookie-parser

# 前端 clients/chat-web
bun add @heroui/react framer-motion
```

## 环境变量

```env
# services/chat/.env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/happy_chat?schema=public"
JWT_SECRET="change-me-in-production"
```
