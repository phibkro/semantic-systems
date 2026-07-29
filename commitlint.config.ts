export default {
  extends: ["@commitlint/config-conventional"],
  // The upstream preset ignores merge, revert, and version messages by
  // default. Design spec 0005 requires every commit and PR title to conform,
  // so the adapted materialization intentionally disables those exemptions.
  defaultIgnores: false,
  rules: {
    // GitHub's squash commit copies the feature report into the commit body.
    // The title carries Conventional Commit identity; prose wrapping is not a
    // semantic property and cannot be checked on the eventual squash body
    // before merge.
    "body-max-line-length": [0],
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
