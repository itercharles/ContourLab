---
name: cr-status
description: List all Change Requests with their current lifecycle states
---

# CR Status

Show all open Change Requests and their current states.

Run:
```
medharness --dhf DHF item list --type CR
```

Then for each CR that is `design` or `develop`, also show:
```
medharness --dhf DHF item get <CR_ID>
```

Summarize the results as a table with columns: **CR ID**, **Title**, **State**, **Author**. Flag any CRs that appear stalled (in `design` or `develop` state without a recent transition).

Also show the allowed next transitions for any in-progress CRs:
```
medharness --dhf DHF item transition <CR_ID>      # no target state: lists the moves available
```
