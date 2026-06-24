# Homework Integration

MyPage integrates with a separate local homework-fetching project. The homework project remains the source of truth for platform authentication, course fetching, assignment analysis, and its own notification workflows.

MyPage only does two things:

1. Reads the homework project's local state file for display.
2. Runs one silent refresh path when the user clicks refresh in the MyPage UI.

## Default Location

The Agent defaults to:

```txt
E:/作业获取项目
```

The expected state file is:

```txt
E:/作业获取项目/homework_db.json
```

Set `HOMEWORK_PROJECT_DIR` to use another location:

```powershell
$env:HOMEWORK_PROJECT_DIR="D:\path\to\homework-project"
```

## Display Contract

The homework widget calls:

```txt
GET /api/homework/due
```

The Agent reads `homework_db.json`, inspects `known_assignments`, filters out completed/submitted work, and returns unfinished assignments whose deadline is from now through the next 3 days.

The response window label is:

```txt
0-3d
```

## Refresh Contract

The homework widget calls:

```txt
POST /api/homework/refresh
```

The Agent runs the homework project's core fetch functions in a short Python subprocess with the working directory set to `HOMEWORK_PROJECT_DIR`.

The refresh must stay silent. It may update the homework state file, but it must not send or trigger:

- email notifications
- desktop notifications
- markdown exports
- webhook callbacks
- WeChat notifications
- PushPlus notifications
- any other external notification channel

The current integration achieves that by loading the homework project settings with notification channels disabled and by suppressing generated notification events.

## Completion Cleanup

During refresh, MyPage also asks the homework project's latest undone list which assignments are still active. If a known assignment disappears from the undone list before its deadline, MyPage marks it completed in the homework state so it stops appearing on the start page.

Expired assignments naturally disappear because the display window excludes deadlines earlier than the current time.

## Authentication Boundary

MyPage does not own the homework platform credentials.

The homework project may keep its own headers, cookies, or login helpers. Those files must stay in the homework project and must not be copied into this repository.

School notices are a separate integration. Do not use the homework project's `valid_headers.json` for `my.bupt.edu.cn` school notice authentication; those headers belong to the homework API.

## Failure Modes

If the homework state file is missing or cannot be parsed, the Agent returns a stale/error envelope and the frontend shows an unavailable state instead of crashing.

If silent refresh fails because credentials expired, the refresh path may invoke the homework project's header capture helper once, then retry. Any credentials produced by that helper remain in the homework project directory.

