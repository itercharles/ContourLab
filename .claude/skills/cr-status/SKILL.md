---
name: cr-status
description: List all Change Requests with their current lifecycle states
---

# CR Status

Show all open Change Requests and their current states.

Run:
```
python -m medharness --dhf DHF dhf item list --type cr
```

Then for each CR that is `analyze` or `developing`, also show:
```
python -m medharness --dhf DHF dhf item get <CR_ID>
```

Summarize the results as a table with columns: **CR ID**, **Title**, **State**, **Author**. Flag any CRs that appear stalled (in `analyze` or `developing` state without a recent transition).

Also show the allowed next transitions for any in-progress CRs:
```
python -m medharness --dhf DHF dhf item transitions <CR_ID>
```
