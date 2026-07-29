"""Minimal Git plumbing wrapper with an explicit, default-deny transport policy.

Two properties are structural here rather than remembered by callers:

- **environment**: every invocation runs in an allowlisted environment built
  from scratch, so inherited ``GIT_CONFIG_COUNT``/``GIT_CONFIG_KEY_n``/
  ``GIT_CONFIG_VALUE_n``/``GIT_CONFIG_PARAMETERS``/``GIT_DIR``/... cannot
  steer the tool. Repository configuration that would execute a program or
  hide working-tree state is overridden on the command line, which outranks
  both repository and inherited configuration.
- **transport**: ``allow_transport`` defaults to ``False``, which sets
  ``GIT_NO_LAZY_FETCH=1`` and withholds every proxy/TLS/SSH passthrough
  variable. A partial-clone object read that would silently open the
  promisor transport therefore fails closed instead. Only the two acquisition
  paths that are online by definition (remote ``lock`` and remote
  ``materialize``) opt in.

The claim tested is about Git's own transport and configuration paths; it is
not a syscall-level network-isolation claim.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from semantic_references.errors import AcquisitionError

# Variables copied from the ambient environment for every invocation. Anything
# not listed here (notably every GIT_* configuration channel) is dropped.
_ENV_PASSTHROUGH = ("PATH", "TMPDIR", "HOME")

# Additionally copied only when transport is explicitly allowed.
_TRANSPORT_ENV_PASSTHROUGH = (
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NIX_SSL_CERT_FILE",
    "GIT_SSL_CAINFO",
    "CURL_CA_BUNDLE",
    "SSH_AUTH_SOCK",
    "http_proxy",
    "https_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "no_proxy",
    "NO_PROXY",
)

# Never prompt for credentials, never page, never read system/global config,
# and keep output locale-stable.
_FIXED_ENV = {
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_ASKPASS": "true",
    "SSH_ASKPASS": "true",
    "GIT_SSH_COMMAND": "ssh -oBatchMode=yes",
    "GIT_PAGER": "cat",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_ATTR_NOSYSTEM": "1",
    "LC_ALL": "C",
    "TZ": "UTC",
}

# Command-line configuration outranks repository and inherited configuration.
# Hooks, filesystem-monitor programs, credential helpers, and the shell-executing
# ``ext::`` transport are all disabled; background gc is disabled so a read
# command cannot mutate the repository it inspects.
_HARDENING_ARGS = [
    "--no-optional-locks",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "credential.helper=",
    "-c",
    "protocol.allow=never",
    "-c",
    "protocol.file.allow=always",
    "-c",
    "protocol.https.allow=always",
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "gc.auto=0",
    "-c",
    "maintenance.auto=false",
    "-c",
    "core.askPass=",
]

_LS_TREE_FIELD_COUNT = 4
_LS_FILES_RECORD_MIN_LENGTH = 3

# A license artifact is a regular committed blob; nothing else can stand in
# for one (symlink 120000, gitlink 160000, and tree 040000 are all rejected).
REGULAR_BLOB_MODES = frozenset({"100644", "100755"})
_ALLOWED_REMOTE_SCHEMES = frozenset({"file", "https"})


def require_allowed_location(location: str, *, allow_transport: bool) -> None:
    """Reject unknown helper protocols before Git can resolve an executable.

    Offline observations accept only local filesystem paths.  Online
    acquisition accepts the frozen built-in protocol set.  In particular
    ``helper::address`` and scp-like SSH spellings never reach Git.
    """
    if not location or location.startswith("-"):
        raise AcquisitionError(f"unsafe Git location {location!r}")
    if "::" in location:
        raise AcquisitionError(f"unapproved Git transport helper in location {location!r}")

    parsed = urlsplit(location)
    if parsed.scheme:
        if not allow_transport:
            raise AcquisitionError(
                f"offline Git observation refuses transport scheme {parsed.scheme!r}"
            )
        if parsed.scheme not in _ALLOWED_REMOTE_SCHEMES:
            raise AcquisitionError(f"unapproved Git transport scheme {parsed.scheme!r}")
        return

    # A colon before any slash is Git's scp-like SSH syntax.
    first_colon = location.find(":")
    first_slash = location.find("/")
    scp_like = first_colon > 0 and (first_slash == -1 or first_colon < first_slash)
    if scp_like:
        mode = "online" if allow_transport else "offline"
        raise AcquisitionError(f"{mode} Git observation refuses an SSH transport")

    # Everything else is a local path.  Git's command-line protocol policy
    # independently maps it to the explicitly enabled file transport.


def _env(*, allow_transport: bool) -> dict[str, str]:
    env: dict[str, str] = {}
    names = _ENV_PASSTHROUGH + (_TRANSPORT_ENV_PASSTHROUGH if allow_transport else ())
    for name in names:
        value = os.environ.get(name)
        if value is not None:
            env[name] = value
    env.update(_FIXED_ENV)
    if not allow_transport:
        # Blocks promisor/partial-clone lazy fetches, which are the one way an
        # ordinary object read can open a transport.
        env["GIT_NO_LAZY_FETCH"] = "1"
    return env


def run_git(
    args: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
    input_text: str | None = None,
    allow_transport: bool = False,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", *_HARDENING_ARGS, *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        env=_env(allow_transport=allow_transport),
        input=input_text,
        check=False,
    )
    if check and result.returncode != 0:
        raise AcquisitionError(
            f"git {' '.join(args)} failed (exit {result.returncode}): {result.stderr.strip()}"
        )
    return result


@dataclass(frozen=True, slots=True)
class TreeEntry:
    mode: str
    object_type: str
    oid: str
    size: int


@dataclass(frozen=True, slots=True)
class TreePathEntry:
    path: str
    mode: str
    object_type: str
    oid: str
    size: int


@dataclass(frozen=True, slots=True)
class RemoteRefs:
    """One ``git ls-remote`` observation.

    ``symrefs`` maps a queried name (e.g. ``HEAD``) to the concrete ref it
    points at; ``refs`` is the list of ``(object id, ref name)`` lines.
    """

    symrefs: tuple[tuple[str, str], ...]
    refs: tuple[tuple[str, str], ...]


def object_format(repo_dir: Path) -> str:
    result = run_git(["-C", str(repo_dir), "rev-parse", "--show-object-format"])
    value = result.stdout.strip()
    return value if value else "sha1"


def resolve_commit(repo_dir: Path, rev: str, *, allow_transport: bool = False) -> str:
    """Resolve ``rev`` (a ref name, ``HEAD``, or an object id) to a full commit id."""
    if rev.startswith("-"):
        raise AcquisitionError(f"refusing to resolve a ref that looks like an option: {rev!r}")
    result = run_git(
        ["-C", str(repo_dir), "rev-parse", "--verify", f"{rev}^{{commit}}"],
        allow_transport=allow_transport,
    )
    return result.stdout.strip()


def tree_of_commit(repo_dir: Path, commit: str, *, allow_transport: bool = False) -> str:
    result = run_git(
        ["-C", str(repo_dir), "rev-parse", "--verify", f"{commit}^{{tree}}"],
        allow_transport=allow_transport,
    )
    return result.stdout.strip()


def ls_tree_entry(
    repo_dir: Path, commit: str, path: str, *, allow_transport: bool = False
) -> TreeEntry | None:
    result = run_git(
        ["-C", str(repo_dir), "ls-tree", "-l", commit, "--", path],
        check=False,
        allow_transport=allow_transport,
    )
    if result.returncode != 0:
        raise AcquisitionError(f"git ls-tree failed for {path!r}: {result.stderr.strip()}")
    line = result.stdout.strip()
    if not line:
        return None
    # "<mode> <type> <oid> <size>\t<path>"
    meta, _, entry_path = line.partition("\t")
    if entry_path != path:
        return None
    fields = meta.split()
    if len(fields) != _LS_TREE_FIELD_COUNT:
        raise AcquisitionError(f"unexpected ls-tree output for {path!r}: {line!r}")
    mode, object_type, oid, size = fields
    # Non-blob entries (e.g. submodule gitlinks) report size as "-".
    parsed_size = int(size) if size != "-" else -1
    return TreeEntry(mode=mode, object_type=object_type, oid=oid, size=parsed_size)


def ls_tree_recursive(repo_dir: Path, commit: str) -> tuple[TreePathEntry, ...]:
    """List the complete committed tree using NUL-delimited path records."""
    result = subprocess.run(
        [
            "git",
            *_HARDENING_ARGS,
            "-C",
            str(repo_dir),
            "ls-tree",
            "-r",
            "-l",
            "-z",
            "--full-tree",
            commit,
        ],
        capture_output=True,
        env=_env(allow_transport=False),
        check=False,
    )
    if result.returncode != 0:
        raise AcquisitionError(f"git ls-tree -r failed: {result.stderr.decode().strip()}")
    entries: list[TreePathEntry] = []
    for record in result.stdout.split(b"\0"):
        if not record:
            continue
        meta, separator, raw_path = record.partition(b"\t")
        fields = meta.split()
        if not separator or len(fields) != _LS_TREE_FIELD_COUNT:
            raise AcquisitionError(f"unexpected recursive ls-tree record {record!r}")
        raw_mode, raw_type, raw_oid, raw_size = fields
        size = int(raw_size) if raw_size != b"-" else -1
        entries.append(
            TreePathEntry(
                path=os.fsdecode(raw_path),
                mode=raw_mode.decode("ascii"),
                object_type=raw_type.decode("ascii"),
                oid=raw_oid.decode("ascii"),
                size=size,
            )
        )
    return tuple(entries)


def blob_sha256(repo_dir: Path, oid: str, *, allow_transport: bool = False) -> str:
    result = subprocess.run(
        ["git", *_HARDENING_ARGS, "-C", str(repo_dir), "cat-file", "blob", oid],
        capture_output=True,
        env=_env(allow_transport=allow_transport),
        check=False,
    )
    if result.returncode != 0:
        raise AcquisitionError(f"git cat-file blob {oid} failed: {result.stderr.decode().strip()}")
    return hashlib.sha256(result.stdout).hexdigest()


def ls_remote_refs(location: str, pattern: str, *, allow_transport: bool = False) -> RemoteRefs:
    """Observe the refs a location advertises for ``pattern``.

    ``location`` may be a local path or a URL; for a local path this reads
    committed refs only and opens no transport, which is why the offline
    caller keeps ``allow_transport`` at its default. This is the single seam
    through which the tool learns what a selector concretely names.
    """
    require_allowed_location(location, allow_transport=allow_transport)
    if pattern.startswith("-"):
        raise AcquisitionError("refusing to resolve a ref that looks like an option")
    result = run_git(["ls-remote", "--symref", location, pattern], allow_transport=allow_transport)
    symrefs: list[tuple[str, str]] = []
    refs: list[tuple[str, str]] = []
    for line in result.stdout.splitlines():
        left, _, right = line.partition("\t")
        if not right:
            continue
        if left.startswith("ref: "):
            symrefs.append((right.strip(), left[len("ref: ") :].strip()))
        else:
            refs.append((left.strip(), right.strip()))
    return RemoteRefs(symrefs=tuple(symrefs), refs=tuple(refs))


def observe_concrete_ref(
    location: str, track: str, expected_commit: str, *, allow_transport: bool = False
) -> str:
    """Return the concrete ref ``track`` names, cross-checked twice.

    Fails closed rather than recording an unresolved selector: the selector
    must name exactly one concrete ref, that ref must resolve to
    ``expected_commit``, and a second, independent query of the concrete ref
    must agree. A selector that moved between the two observations, or that
    is ambiguous (a branch and a tag of the same name), is refused.
    """
    observed = ls_remote_refs(location, track, allow_transport=allow_transport)
    symref_targets = {target for queried, target in observed.symrefs if queried == track}
    candidates = symref_targets or {_undereference(ref) for _, ref in observed.refs}
    if not candidates:
        raise AcquisitionError(f"selector {track!r} does not name a concrete ref at {location!r}")
    if len(candidates) != 1:
        raise AcquisitionError(f"selector {track!r} is ambiguous: {sorted(candidates)}")
    concrete = next(iter(candidates))
    if not concrete.startswith("refs/"):
        raise AcquisitionError(
            f"selector {track!r} resolved to {concrete!r}, which is not a concrete ref"
        )

    confirmation = ls_remote_refs(location, concrete, allow_transport=allow_transport)
    matching = {oid for oid, ref in confirmation.refs if _undereference(ref) == concrete}
    if expected_commit not in matching:
        raise AcquisitionError(
            f"selector {track!r} -> {concrete!r} resolves to {sorted(matching)!r}, "
            f"not the observed commit {expected_commit}"
        )
    return concrete


def _undereference(ref: str) -> str:
    """Strip the ``^{}`` suffix ``ls-remote`` adds for a peeled annotated tag."""
    return ref[: -len("^{}")] if ref.endswith("^{}") else ref


def remote_url(repo_dir: Path, name: str = "origin") -> str | None:
    result = run_git(["-C", str(repo_dir), "remote", "get-url", name], check=False)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def object_exists(repo_dir: Path, oid: str) -> bool:
    result = run_git(["-C", str(repo_dir), "cat-file", "-e", f"{oid}^{{commit}}"], check=False)
    return result.returncode == 0


def is_detached_head(worktree: Path) -> bool:
    result = run_git(["-C", str(worktree), "symbolic-ref", "-q", "HEAD"], check=False)
    return result.returncode != 0


def head_commit(worktree: Path) -> str:
    result = run_git(["-C", str(worktree), "rev-parse", "--verify", "HEAD"])
    return result.stdout.strip()


def is_clean_worktree(worktree: Path) -> bool:
    """Report cleanliness with every suppression channel closed at the boundary.

    ``--untracked-files=all`` is passed explicitly because a repository or
    inherited ``status.showUntrackedFiles`` setting would otherwise hide
    working-tree dirt, and ``--no-optional-locks`` (applied to every
    invocation) keeps the read from rewriting ``.git/index``.
    """
    result = run_git(
        [
            "-C",
            str(worktree),
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--ignored=no",
        ]
    )
    return result.stdout.strip() == ""


def hidden_index_reasons(worktree: Path) -> tuple[str, ...]:
    """Return index/sparse mechanisms that can suppress ordinary dirt."""
    result = subprocess.run(
        [
            "git",
            *_HARDENING_ARGS,
            "-C",
            str(worktree),
            "ls-files",
            "-v",
            "-z",
        ],
        capture_output=True,
        env=_env(allow_transport=False),
        check=False,
    )
    if result.returncode != 0:
        raise AcquisitionError(f"git ls-files -v failed: {result.stderr.decode().strip()}")
    reasons: list[str] = []
    for record in result.stdout.split(b"\0"):
        if len(record) < _LS_FILES_RECORD_MIN_LENGTH or record[1:2] != b" ":
            continue
        marker = chr(record[0])
        path = os.fsdecode(record[2:])
        if marker.islower():
            reasons.append(f"tracked path {path!r} is hidden by assume-unchanged")
        if marker.upper() == "S":
            reasons.append(f"tracked path {path!r} is hidden by skip-worktree")

    sparse = run_git(
        ["-C", str(worktree), "config", "--bool", "core.sparseCheckout"],
        check=False,
    )
    if sparse.returncode == 0 and sparse.stdout.strip() == "true":
        reasons.append("checkout uses sparse-checkout and is not a complete locked tree")
    return tuple(reasons)


def worktree_blob_bytes(worktree: Path, path: str) -> bytes:
    """Read the ordinary checkout bytes for ``path``.

    Binding the working-tree bytes (not only the committed blob) is what
    catches tampering that Git has been told to ignore, e.g. a path marked
    ``assume-unchanged`` or ``skip-worktree``. Symlinks — including a
    symlinked parent directory that would escape the checkout — are refused.
    """
    full = worktree / path
    if full.is_symlink():
        raise AcquisitionError(f"license path {path!r} is a symlink in the checkout")
    try:
        resolved = full.resolve(strict=True)
    except OSError as exc:
        raise AcquisitionError(
            f"license path {path!r} is missing from the checkout: {exc}"
        ) from exc
    if not resolved.is_relative_to(worktree.resolve()):
        raise AcquisitionError(f"license path {path!r} escapes the checkout directory")
    if not resolved.is_file():
        raise AcquisitionError(f"license path {path!r} is not a regular file in the checkout")
    try:
        return full.read_bytes()
    except OSError as exc:
        raise AcquisitionError(f"license path {path!r} cannot be read: {exc}") from exc


def worktree_file_prefix(worktree: Path, path: str, length: int) -> bytes:
    """Read a bounded prefix of a regular checkout file without following it."""
    full = worktree / path
    if full.is_symlink():
        raise AcquisitionError(f"tracked path {path!r} is an unexpected symlink")
    try:
        resolved = full.resolve(strict=True)
    except OSError as exc:
        raise AcquisitionError(f"tracked path {path!r} is missing: {exc}") from exc
    if not resolved.is_relative_to(worktree.resolve()):
        raise AcquisitionError(f"tracked path {path!r} escapes the checkout directory")
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
    try:
        fd = os.open(full, flags)
    except OSError as exc:
        raise AcquisitionError(f"tracked path {path!r} cannot be opened no-follow: {exc}") from exc
    try:
        return os.read(fd, length)
    finally:
        os.close(fd)


_LFS_POINTER_PREFIX = b"version https://git-lfs.github.com/spec"


def looks_like_lfs_pointer(content: bytes) -> bool:
    return content.startswith(_LFS_POINTER_PREFIX)


# The branch a tool-owned object cache uses to name the commit it holds.
CACHE_BRANCH = "custody"


def init_repo(path: Path, *, object_format: str = "sha1") -> None:
    if object_format not in {"sha1", "sha256"}:
        raise AcquisitionError(f"unsupported Git object format {object_format!r}")
    path.mkdir(parents=True, exist_ok=True)
    run_git(["init", "-q", "-b", CACHE_BRANCH, f"--object-format={object_format}", str(path)])


def set_branch(repo_dir: Path, branch: str, commit: str) -> None:
    _reject_option_like(branch, commit)
    run_git(["-C", str(repo_dir), "update-ref", f"refs/heads/{branch}", commit])


def set_ref(repo_dir: Path, ref: str, commit: str) -> None:
    _reject_option_like(ref, commit)
    run_git(["-C", str(repo_dir), "check-ref-format", ref])
    run_git(["-C", str(repo_dir), "update-ref", ref, commit])


def prepare_replay_refs(repo_dir: Path, resolved_ref: str, commit: str) -> None:
    """Retain only refs that name the complete selected replay closure."""
    set_branch(repo_dir, CACHE_BRANCH, commit)
    set_ref(repo_dir, resolved_ref, commit)
    retained = {f"refs/heads/{CACHE_BRANCH}", resolved_ref}
    refs = run_git(["-C", str(repo_dir), "for-each-ref", "--format=%(refname)"])
    for ref in refs.stdout.splitlines():
        if ref not in retained:
            run_git(["-C", str(repo_dir), "update-ref", "-d", ref])
    head_ref = (
        resolved_ref if resolved_ref.startswith("refs/heads/") else f"refs/heads/{CACHE_BRANCH}"
    )
    run_git(["-C", str(repo_dir), "symbolic-ref", "HEAD", head_ref])


def _reject_option_like(*values: str) -> None:
    for value in values:
        if value.startswith("-"):
            raise AcquisitionError(f"refusing a value that looks like a CLI option: {value!r}")


def fetch_shallow_blobless(repo_dir: Path, url: str, ref: str) -> str:
    """Fetch ``ref`` from ``url`` shallowly, without blobs or tags. Returns FETCH_HEAD."""
    _reject_option_like(url, ref)
    require_allowed_location(url, allow_transport=True)
    run_git(
        ["-C", str(repo_dir), "fetch", "--depth=1", "--filter=blob:none", "--no-tags", url, ref],
        allow_transport=True,
    )
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", "FETCH_HEAD"])
    return result.stdout.strip()


def clone_remote_blobless(repo_dir: Path, url: str) -> None:
    """Create a shallow bare partial clone while negotiating its object format.

    ``git clone`` learns SHA-1 versus SHA-256 from the origin before creating
    the repository; initializing first would irreversibly choose SHA-1.
    """
    require_allowed_location(url, allow_transport=True)
    run_git(
        [
            "clone",
            "--bare",
            "--quiet",
            "--depth=1",
            "--filter=blob:none",
            "--no-tags",
            "--single-branch",
            url,
            str(repo_dir),
        ],
        allow_transport=True,
    )


def hydrate_replay_objects(repo_dir: Path, commit: str) -> None:
    """Fetch every object needed to replay ``commit``, then prove completeness.

    The initial clone/fetch remains blobless to preserve the acquisition
    boundary.  This explicit hydration is the cache-construction step: it
    reads every object reachable within the selected superproject while the
    declared origin is available.  Gitlinks remain external by definition and
    are surfaced later as unverifiable content.
    """
    _reject_option_like(commit)
    objects = run_git(
        ["-C", str(repo_dir), "rev-list", "--objects", commit],
        allow_transport=True,
    )
    object_ids = [line.split(maxsplit=1)[0] for line in objects.stdout.splitlines() if line]
    if not object_ids:
        raise AcquisitionError(f"commit {commit} produced no replay object closure")
    checked = run_git(
        ["-C", str(repo_dir), "cat-file", "--batch-check"],
        input_text="\n".join(object_ids) + "\n",
        allow_transport=True,
    )
    if any(line.endswith(" missing") for line in checked.stdout.splitlines()):
        raise AcquisitionError(f"commit {commit} has missing objects after replay-cache hydration")

    missing = run_git(
        ["-C", str(repo_dir), "rev-list", "--objects", "--missing=print", commit],
        allow_transport=False,
    )
    missing_lines = [line for line in missing.stdout.splitlines() if line.startswith("?")]
    if missing_lines:
        raise AcquisitionError(
            f"commit {commit} replay cache is incomplete: {len(missing_lines)} object(s) missing"
        )


def is_shallow_repository(repo_dir: Path) -> bool:
    result = run_git(["-C", str(repo_dir), "rev-parse", "--is-shallow-repository"])
    return result.stdout.strip() == "true"


def fetch_blobless_history(repo_dir: Path, url: str, ref: str) -> str:
    """Broader (deepened, but still blob-filtered) history fetch.

    The deepening is explicit: an earlier shallow attempt leaves the
    repository shallow, and a plain fetch would not widen it — the older
    commit would then only appear through a silent promisor fetch. This path
    is reached only behind ``--allow-history-fallback``, so it widens the
    history openly instead.
    """
    _reject_option_like(url, ref)
    require_allowed_location(url, allow_transport=True)
    deepen = ["--unshallow"] if is_shallow_repository(repo_dir) else []
    run_git(
        ["-C", str(repo_dir), "fetch", *deepen, "--filter=blob:none", "--no-tags", url, ref],
        allow_transport=True,
    )
    result = run_git(["-C", str(repo_dir), "rev-parse", "--verify", "FETCH_HEAD"])
    return result.stdout.strip()


def checkout_detached(repo_dir: Path, commit: str, *, allow_transport: bool = False) -> None:
    _reject_option_like(commit)
    run_git(
        ["-C", str(repo_dir), "checkout", "--detach", "--quiet", commit],
        allow_transport=allow_transport,
    )


def clone_local(source_git_dir: Path, dest: Path, *, allow_transport: bool = False) -> None:
    """Clone from a local Git directory only (no network transport).

    ``allow_transport`` stays ``False`` for offline materialization, so a
    source repository that is itself a partial clone cannot satisfy the clone
    by lazily fetching the missing objects from its promisor remote.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_git(
        ["clone", "--quiet", "--no-checkout", "--no-hardlinks", str(source_git_dir), str(dest)],
        allow_transport=allow_transport,
    )
