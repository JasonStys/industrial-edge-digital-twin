# Complexity and bounded-resource analysis

Let:

- \(C\) be retained command results, capped at 256.
- \(P\) be gateway commands awaiting a response, capped at 64.
- \(S\) be connected SSE clients, capped at 32.
- \(L\) be input line bytes, capped at 512 in C++ and 65,536 for engine output.
- \(H\) be HMI trend samples, capped at 90.

| Operation                   | Time                  | Additional space           | Bound/reasoning                             |
| --------------------------- | --------------------- | -------------------------- | ------------------------------------------- |
| One process step            | O(1)                  | O(1)                       | Fixed number of mass/energy terms           |
| Controller update           | O(1)                  | O(1)                       | Fixed signals, alarms, and interlocks       |
| Engine command lookup       | Average O(1)          | O(C)                       | Hash map plus FIFO eviction                 |
| Command eviction            | Average O(1)          | O(1)                       | Deque front plus hash erase                 |
| Line parsing                | O(L)                  | O(L)                       | At most 512 bytes and 16 tokens             |
| JSON serialization          | O(1) for fixed schema | O(1) bounded buffer growth | Fixed field count                           |
| Gateway command correlation | Average O(1)          | O(P)                       | Map keyed by command ID                     |
| SSE broadcast               | O(S)                  | O(1) per event             | At most 32 clients; slow clients closed     |
| MQTT enqueue                | O(1)                  | O(1)                       | One pending snapshot replaces the prior one |
| HMI trend update            | O(H)                  | O(H)                       | Shift/map of at most 90 points              |

The plant loop performs no unbounded container growth. The gateway's long-lived collections all have
explicit caps or remove entries on close/response. HTTP body size and process-line size are separate
bounds because they cross separate trust boundaries.

## Data-structure choices

- `std::unordered_map` supports average O(1) duplicate-command lookup.
- `std::deque` provides O(1) front eviction in arrival order.
- `std::vector` holds the small parsed argument sequence contiguously.
- JavaScript `Map` correlates commands and `Set` manages listeners/clients with direct deletion.
- A single MQTT pending slot models current state, where newest data is more useful than a backlog.

Worst-case hash collisions can make map lookup O(C) or O(P), but both sets remain strictly bounded.
