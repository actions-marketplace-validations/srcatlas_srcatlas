### Architecture changes

0 modules, 0 routes, 0 cross-module edges, 3 new cycles

| | Added | Removed | Changed | Moved |
|---|---:|---:|---:|---:|
| Nodes | 0 | 0 | 0 | 0 |
| Edges | 5 | 0 | 0 | - |

New cycles:

- modules: `module:api/A`, `module:api/B`
- modules: `module:api/C`, `module:api/D`, `module:api/E`
- packages: `package:api`, `package:web`

```mermaid
flowchart LR
  n0["file:api/src/x.ts"]:::context
  n1["file:api/src/y.ts"]:::context
  n2["module:api/A"]:::context
  n3["module:api/B"]:::context
  n4["module:api/C"]:::context
  n5["module:api/D"]:::context
  n6["module:api/E"]:::context
  n7["package:api"]:::context
  n8["package:web"]:::context
  n1 -->|"imports"| n0
  n3 -->|"imports"| n2
  n5 -->|"imports"| n6
  n6 -->|"imports"| n4
  n7 -->|"depends_on"| n8
  classDef added fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3
  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f
  classDef moved fill:#e0e7ff,stroke:#4f46e5,color:#312e81
  classDef context fill:#f3f4f6,stroke:#9ca3af,color:#374151
```
