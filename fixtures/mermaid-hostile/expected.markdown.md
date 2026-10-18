### Architecture changes

0 modules, 0 routes, +1 cross-module edge, 1 new cycle

| | Added | Removed | Changed | Moved |
|---|---:|---:|---:|---:|
| Nodes | 2 | 0 | 0 | 0 |
| Edges | 1 | 0 | 0 | - |

New cross-module edges:

- ```provider:api/E`v``il``` injects `` `Plain` ``

New cycles:

- modules: `module:api/B`, ``module:api/`A``

```mermaid
flowchart LR
  n0["Plain"]:::added
  n1["Evil #96;#96;#96; @org/team"]:::added
  n1 -->|"injects"| n0
  classDef added fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3
  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f
  classDef moved fill:#e0e7ff,stroke:#4f46e5,color:#312e81
  classDef context fill:#f3f4f6,stroke:#9ca3af,color:#374151
```
