# TypeScript 类型约束

## 跨包 Zod Schema

`@langchain/openai` 的 `withStructuredOutput()` 接受 `SerializableSchema<T>`，而 `@autix/contracts` 导出的 Zod schema 类型可能不兼容。使用时必须断言：

```ts
import type { SerializableSchema } from '@langchain/core/utils/types';

this.model.withStructuredOutput(
  SomeSchema as unknown as SerializableSchema<SomeType>,
);
```

## Controller 返回值

Controller 中所有 async 方法必须标注显式返回类型，禁止隐式 `Promise<any>`：

```ts
@Post('/some/path')
async handler(@Body() body: { input: string }): Promise<SomeResult> {
  return this.service.doSomething(body.input);
}
```

## ESLint require-await

回调函数中无 `await` 时，不要加 `async`：

```ts
// ✗ 错误
async ({ input }: { input: string }) => { return ... }

// ✓ 正确
({ input }: { input: string }) => { return ... }
```

## 共享包构建

`packages/contracts/tsconfig.json` 必须包含 `"declaration": true`，否则 `dist/index.d.ts` 不会生成，消费方 TypeScript 报错找不到类型。

## 工作区依赖

新引入的第三方库（如 `zod`）必须在消费方 `package.json` 中声明，不能只依赖间接传递。`bun install` 后检查 `node_modules` 确认安装。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **happy-chat** (244 symbols, 531 relationships, 12 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/happy-chat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/happy-chat/clusters` | All functional areas |
| `gitnexus://repo/happy-chat/processes` | All execution flows |
| `gitnexus://repo/happy-chat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
