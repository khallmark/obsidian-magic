<!-- Generated by SpecStory -->

# Fixing Import Issues in Code (2025-04-14 06:31:47)

_**User**_

Fix this mess dude. update the imports from @core . I really don't want to have `src` in all my imports either. Can you fix that too?

---

_**Assistant**_

Your Grace, I'll help fix these import issues and clean up the code. Let me first check what we're working with in the core package.

---

<details>
            <summary>Listed directory packages/core/src • **20** results</summary>
        
| Name |
|-------|
| 📄 `index.ts` |
| 📄 `ModelManager.test.ts` |
| 📄 `OpenAIClient.ts` |
| 📄 `Logger.test.ts` |
| 📁 `errors` |
| 📄 `config.ts` |
| 📄 `ModelManager.ts` |
| 📁 `markdown` |
| 📁 `models` |
| 📄 `Logger.ts` |
| 📁 `utils` |
| 📁 `tagging` |
| 📁 `types` |
| 📄 `OpenAIClient.test.ts` |
| 📄 `TaggingService.test.ts` |
| 📄 `TaggingService.ts` |
| 📄 `integration.test.ts` |
| 📁 `validators` |
| 📁 `openai` |
| 📁 `examples` |

</details>

---

Let me check the package.json to see how we can fix the exports:

---

Read file: packages/core/package.json

---

Now let me check the core package's index.ts to see what's exported:

---

Read file: packages/core/src/index.ts

---

I see the issues now. Let me fix the imports and exports in the core package first, then update the taxonomy command. I'll make these changes:

1. Update the package.json exports to support subpath exports
2. Fix the imports in the taxonomy command file

---

```diff
      ".": {
        "types": "./dist/index.d.ts",
-       "import": "./dist/index.mjs",
-       "require": "./dist/index.js"
+       "import": "./dist/index.js",
+       "require": "./dist/index.cjs"
      },
-     "./src/*": {
-       "types": "./dist/*.d.ts",
-       "import": "./dist/*.mjs",
-       "require": "./dist/*.js"
+     "./Logger": {
+       "types": "./dist/Logger.d.ts",
+       "import": "./dist/Logger.js",
+       "require": "./dist/Logger.cjs"
+     },
+     "./models/*": {
+       "types": "./dist/models/*.d.ts",
+       "import": "./dist/models/*.js",
+       "require": "./dist/models/*.cjs"
      }
    }
```

---

Now let me update the taxonomy command file to use the proper imports:

---

```diff
  import chalk from 'chalk';
  
- import { initializeCore } from '@obsidian-magic/core';
- import { Logger } from '@obsidian-magic/core/Logger';
- 
- import type { Taxonomy } from '@obsidian-magic/core';
+ import { initializeCore, Logger } from '@obsidian-magic/core';
+ import type { Taxonomy } from '@obsidian-magic/core/models/taxonomy';
  import type { CommandModule } from 'yargs';
  
```

---

I see we need to update the core package's index.ts to properly export the Logger. Let me fix that:

---

Cancelled

---



---

