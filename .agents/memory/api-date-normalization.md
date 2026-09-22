---
name: API date normalization
description: Generated web API types may describe dates as Date objects even though JSON responses arrive as ISO strings.
---

Normalize date-like API values at the UI boundary before formatting or using date-only operations.

**Why:** The generated client types are based on OpenAPI coercion, but the fetch layer does not revive JSON date strings into JavaScript `Date` instances. Treating the declared type as runtime behavior can produce invalid dates in rendered tables.

**How to apply:** Use one shared formatter/input normalizer for values returned by API hooks, and preserve calendar dates in local time when displaying or editing them.