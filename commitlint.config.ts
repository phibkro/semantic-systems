export default {
  extends: ["@commitlint/config-conventional"],
  // The upstream preset ignores merge, revert, and version messages by
  // default. Design spec 0005 requires every commit and PR title to conform,
  // so the adapted materialization intentionally disables those exemptions.
  defaultIgnores: false,
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
        "research",
        "design",
        "governance",
        "plans",
      ],
    ],
  },
};
