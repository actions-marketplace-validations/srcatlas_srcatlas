### Architecture changes

0 modules, 0 routes, +1 cross-module edge, 0 new cycles

| | Added | Removed | Changed | Moved |
|---|---:|---:|---:|---:|
| Nodes | 0 | 0 | 0 | 0 |
| Edges | 2 | 0 | 1 | - |

New cross-module edges:

- `provider:api/PC` injects `provider:api/PB`

```mermaid
flowchart LR
  n0["provider:api/PA"]:::context
  n1["provider:api/PB"]:::context
  n2["provider:api/PC"]:::context
  n3["provider:api/PD"]:::context
  n0 ==>|"injects"| n1
  n2 -->|"injects"| n1
  n3 -->|"injects"| n1
  classDef added fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3
  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f
  classDef moved fill:#e0e7ff,stroke:#4f46e5,color:#312e81
  classDef context fill:#f3f4f6,stroke:#9ca3af,color:#374151
```
