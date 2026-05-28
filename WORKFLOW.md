---
# BangBangMang Workflow Configuration
# This file defines the agent execution policy and prompt template.

agent:
  default: opencode
  models:
    opencode: "opencode/deepseek-v4-flash-free"
  timeout_minutes: 25

concurrency:
  max_parallel: 3

retry:
  max_attempts: 3
  backoff_base: 300        # seconds
  backoff_multiplier: 2

reconcile:
  stuck_timeout: 1800      # seconds, reset running issues after this

hooks:
  before_run: []
  after_run: []
---

## Prompt Template

You are an AI agent working on task #{{issue.number}}: {{issue.title}}

### Task
{{issue.description}}

{{#if previous_error}}
### Previous Error (attempt {{attempt}})
```
{{previous_error}}
```
Please learn from this error and try a different approach.
{{/if}}

### Instructions
- Work in the repository checked out in the current directory
- Make your changes directly in the working tree
- The system will handle creating a Pull Request from your changes
