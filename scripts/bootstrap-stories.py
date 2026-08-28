#!/usr/bin/env python3
"""
bootstrap-stories.py — create the iAI Story and Task issues on GitHub.

Companion to bootstrap-github.sh, which creates labels, milestones and epics.
This script creates the level 2 and level 3 of the hierarchy:

    Milestone  (bootstrap-github.sh)
      Story    (this script)  <- one per "### S{m}.{n}" in docs/milestones/M*.md
        Task   (this script)  <- one per row of that story's Indicative tasks table

Source of truth is docs/milestones/M*.md, parsed mechanically. Nothing is
invented: 36 stories and 142 tasks, matching PLAN.md's distribution table.

IDEMPOTENT. Issues are matched by exact title across open AND closed issues and
skipped if present. Sub-issue links are re-checked and only added when missing.
Nothing is ever deleted, renamed or closed.

DRY RUN IS THE DEFAULT. Pass --apply to actually mutate the repository.

Usage:
    scripts/bootstrap-stories.py                       # dry run
    scripts/bootstrap-stories.py --apply
    scripts/bootstrap-stories.py --apply --milestone 1  # just M1
    scripts/bootstrap-stories.py --apply --stories-only
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MDIR = os.path.join(ROOT, "docs", "milestones")

MILESTONE_TITLES = {
    1: "M1 — Kernel and foundation",
    2: "M2 — Universal lifecycle",
    3: "M3 — Roles and routing",
    4: "M4 — Development pack",
    5: "M5 — Health pack",
    6: "M6 — Trading pack",
    7: "M7 — Wealth and Knowledge",
    8: "M8 — Runtime and release",
}

# GitHub secondary rate limits punish burst issue creation. ~180 issues at this
# spacing is a few minutes and stays well clear of the limit.
CREATE_DELAY = 1.2

story_re = re.compile(r"^### (S(\d+)\.(\d+)) — (.+?)\s*$")
meta_re = re.compile(
    r"^\*\*Unit:\*\*\s*(.+?)\s*·\s*\*\*Size:\*\*\s*(\S+)\s*·\s*\*\*Labels:\*\*\s*(.+?)\s*$"
)
h2_re = re.compile(r"^## ")

C = {
    "reset": "\033[0m", "bold": "\033[1m", "dim": "\033[2m",
    "red": "\033[31m", "green": "\033[32m", "yellow": "\033[33m",
    "blue": "\033[34m", "cyan": "\033[36m",
}
if not sys.stderr.isatty():
    C = {k: "" for k in C}


def log(m):  print(f"{C['blue']}==>{C['reset']} {m}", file=sys.stderr)
def ok(m):   print(f"{C['green']}  ok{C['reset']} {m}", file=sys.stderr)
def skip(m): print(f"{C['dim']}skip{C['reset']} {m}", file=sys.stderr)
def warn(m): print(f"{C['yellow']}warn{C['reset']} {m}", file=sys.stderr)
def die(m):
    print(f"{C['red']}fatal{C['reset']} {m}", file=sys.stderr)
    sys.exit(1)


def sh(args, check=True, capture=True):
    r = subprocess.run(args, capture_output=capture, text=True)
    if check and r.returncode != 0:
        die(f"command failed: {' '.join(args)}\n{(r.stderr or '').strip()}")
    return (r.stdout or "").strip()


# --- parsing ----------------------------------------------------------------

def split_row(line):
    line = line.strip()
    if not line.startswith("|"):
        return None
    return [c.strip() for c in line.strip("|").split("|")]


def parse_milestone(n):
    path = os.path.join(MDIR, f"M{n}.md")
    if not os.path.isfile(path):
        die(f"missing {path}")
    lines = open(path, encoding="utf-8").read().split("\n")
    stories, cur = [], None
    for ln in lines:
        m = story_re.match(ln)
        if m:
            cur = {
                "sid": m.group(1), "milestone": int(m.group(2)),
                "idx": int(m.group(3)), "title": m.group(4),
                "labels": [], "size": None, "unit": None,
                "body_lines": [], "tasks": [], "_mode": "body",
            }
            stories.append(cur)
            continue
        if cur is None:
            continue
        if h2_re.match(ln):
            cur = None
            continue
        mm = meta_re.match(ln)
        if mm:
            cur["unit"], cur["size"] = mm.group(1), mm.group(2)
            cur["labels"] = re.findall(r"`([^`]+)`", mm.group(3))
            continue
        if ln.startswith("**Indicative tasks:**"):
            cur["_mode"] = "tasks"
            continue
        if cur["_mode"] == "tasks":
            cells = split_row(ln)
            if cells and len(cells) >= 3:
                if cells[0].lower() == "task" or set(cells[0]) <= set("- :"):
                    continue
                cur["tasks"].append(
                    {"title": cells[0], "target": cells[1], "notes": cells[2]}
                )
                continue
            if not ln.strip():
                continue
            cur["_mode"] = "body"
        if cur["_mode"] == "body":
            cur["body_lines"].append(ln)
    for s in stories:
        s.pop("_mode", None)
        b = s["body_lines"]
        while b and not b[0].strip():
            b.pop(0)
        while b and not b[-1].strip():
            b.pop()
        s["body"] = "\n".join(b)
        del s["body_lines"]
    return stories


def load_all(which=None):
    out = []
    for n in range(1, 9):
        if which and n != which:
            continue
        out.extend(parse_milestone(n))
    return out


# --- bodies -----------------------------------------------------------------

def story_body(s):
    return f"""## Story

**Milestone:** {MILESTONE_TITLES[s['milestone']]}
**Unit of work:** {s['unit']}
**Size:** {s['size']}
**Design:** `docs/milestones/M{s['milestone']}.md` — *{s['sid']}*

{s['body']}

---

### Next steps

```
/iai:story-design  <this issue>
/iai:story-test-plan <this issue>
/iai:task-create   <this issue>
```

The task list below is *indicative*, taken from `docs/milestones/M{s['milestone']}.md`.
The authoritative list is produced by `/iai:task-create` from the Build Targets
table in this Story's Design and may differ once the design is written.

<sub>Created by `scripts/bootstrap-stories.py` from `docs/milestones/M{s['milestone']}.md`.</sub>
"""


def task_body(s, t, tid, parent):
    """Body for a task issue.

    `/iai:task-verify` takes an ISSUE NUMBER, but the number does not exist
    until the issue has been created, so the Story-relative code ({tid}) is
    written here as a placeholder and repaired by `GH.ensure_verify_id` on the
    very next call. Re-running repairs any task still carrying the placeholder,
    which is how the 137 issues created before this was fixed get healed.
    """
    parent_ref = f"#{parent}" if parent else f"the {s['sid']} Story"
    return f"""## Task

Parent: {parent_ref}

| Field | Value |
|-------|-------|
| Story | {parent_ref} — {s['title']} |
| Build target | `{t['target']}` |
| Milestone | {MILESTONE_TITLES[s['milestone']]} |
| Design | `docs/milestones/M{s['milestone']}.md` — *{s['sid']}* |

### Scope

{t['title']}

### Notes

{t['notes']}

### Done when

The unit of work is implemented, its verification passes with evidence read from
disk, and `/iai:task-verify {tid}` has marked the draft PR ready and applied
`status:resolved`.

<sub>Created by `scripts/bootstrap-stories.py`.</sub>
"""


def task_labels(s):
    """Tasks inherit domain and classification; they never carry type:story or a rung.

    Per docs/design/03-workflow.md: exactly one rung:* per STORY, and tasks
    inherit the domain:* label only.
    """
    keep = [l for l in s["labels"] if l.startswith("domain:") or l == "class:private"]
    return ["type:task"] + keep + ["iai"]


# --- github -----------------------------------------------------------------

class GH:
    def __init__(self, repo, dry):
        self.repo, self.dry = repo, dry
        self.issues = {}
        self.created = self.skipped = self.failed = self.repaired = 0

    def refresh(self):
        out = sh(["gh", "issue", "list", "--repo", self.repo, "--state", "all",
                  "--limit", "1000", "--json", "number,title"])
        self.issues = {i["title"]: i["number"] for i in json.loads(out or "[]")}

    def milestone_map(self):
        out = sh(["gh", "api", "--paginate",
                  f"repos/{self.repo}/milestones?state=all&per_page=100"])
        return {m["title"]: m["number"] for m in json.loads(out or "[]")}

    def create_issue(self, title, body, labels, milestone):
        if title in self.issues:
            skip(f"issue exists: {title} (#{self.issues[title]})")
            self.skipped += 1
            return self.issues[title]
        args = ["gh", "issue", "create", "--repo", self.repo,
                "--title", title, "--body", body]
        for l in labels:
            args += ["--label", l]
        if milestone:
            args += ["--milestone", milestone]
        if self.dry:
            print(f"{C['cyan']}  would create{C['reset']} {title}  "
                  f"{C['dim']}[{', '.join(labels)}]{C['reset']}", file=sys.stderr)
            self.created += 1
            return None
        r = subprocess.run(args, capture_output=True, text=True)
        if r.returncode != 0:
            warn(f"failed: {title}\n     {r.stderr.strip()}")
            self.failed += 1
            return None
        num = int(r.stdout.strip().rstrip("/").split("/")[-1])
        ok(f"#{num}  {title}")
        self.issues[title] = num
        self.created += 1
        time.sleep(CREATE_DELAY)
        return num

    def node_id(self, num):
        return sh(["gh", "api", f"repos/{self.repo}/issues/{num}",
                   "--jq", ".node_id"])

    def ensure_verify_id(self, num, tid):
        """Replace a Story-relative code in `/iai:task-verify` with the issue number.

        The verb takes an issue number; a body saying `/iai:task-verify S1.1.1`
        names something that cannot be resolved. Idempotent: a body that already
        carries the number, or that has been reconciled by hand, is left alone.
        """
        if not num:
            return False
        stale = f"/iai:task-verify {tid}"
        try:
            body = sh(["gh", "api", f"repos/{self.repo}/issues/{num}",
                       "--jq", ".body"])
        except SystemExit:
            return False
        if stale not in body:
            return False
        if self.dry:
            print(f"{C['cyan']}  would repair{C['reset']} #{num}  "
                  f"{C['dim']}{stale} -> /iai:task-verify {num}{C['reset']}",
                  file=sys.stderr)
            self.repaired += 1
            return True
        fixed = body.replace(stale, f"/iai:task-verify {num}")
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            f.write(fixed)
            path = f.name
        r = subprocess.run(["gh", "issue", "edit", str(num), "--repo", self.repo,
                            "--body-file", path], capture_output=True, text=True)
        os.unlink(path)
        if r.returncode != 0:
            warn(f"repair failed: #{num}\n     {r.stderr.strip()}")
            return False
        ok(f"repaired #{num}  task-verify {tid} -> {num}")
        self.repaired += 1
        time.sleep(0.4)
        return True

    def link_subissue(self, parent, child):
        """Attach child to parent via the GraphQL sub-issue API.

        Returns True on success. The body already carries `Parent: #N` as the
        documented fallback, so a failure here degrades rather than breaks.
        """
        if self.dry or not parent or not child:
            return False
        try:
            pid, cid = self.node_id(parent), self.node_id(child)
        except SystemExit:
            return False
        q = ("mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c})"
             "{issue{number}}}")
        r = subprocess.run(
            ["gh", "api", "graphql", "-f", f"query={q}", "-F", f"p={pid}", "-F", f"c={cid}",
             "-H", "GraphQL-Features: sub_issues"],
            capture_output=True, text=True)
        return r.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--milestone", type=int, choices=range(1, 9))
    ap.add_argument("--stories-only", action="store_true")
    a = ap.parse_args()
    dry = not a.apply

    if not sh(["gh", "auth", "status"], check=False, capture=True) and \
       subprocess.run(["gh", "auth", "status"], capture_output=True).returncode != 0:
        die("gh is not authenticated. Run: gh auth login")

    repo = a.repo or sh(["gh", "repo", "view", "--json", "nameWithOwner",
                         "-q", ".nameWithOwner"], check=False)
    if not repo:
        die("could not derive the repository. Pass --repo <owner/repo>")

    if dry:
        print(f"\n{C['yellow']}{C['bold']}"
              "+---------------------------------------------------------------+\n"
              "|                D R Y   R U N   -   the default                |\n"
              "|  Nothing will be created on GitHub. Use --apply to do it.     |\n"
              "+---------------------------------------------------------------+"
              f"{C['reset']}\n", file=sys.stderr)
    else:
        print(f"\n{C['red']}{C['bold']}*** APPLY MODE — this WILL modify {repo} ***"
              f"{C['reset']}\n", file=sys.stderr)

    gh = GH(repo, dry)
    log(f"Repository: {repo}")
    gh.refresh()
    msmap = gh.milestone_map()
    missing = [t for n, t in MILESTONE_TITLES.items() if t not in msmap]
    if missing and not dry:
        die("milestones missing; run scripts/bootstrap-github.sh --apply first:\n  "
            + "\n  ".join(missing))
    if missing:
        warn(f"{len(missing)} milestone(s) not on GitHub yet — "
             "run scripts/bootstrap-github.sh --apply first")

    stories = load_all(a.milestone)
    log(f"{len(stories)} stories, {sum(len(s['tasks']) for s in stories)} tasks "
        f"parsed from docs/milestones/")

    linked = 0
    for s in stories:
        title = f"{s['sid']} — {s['title']}"
        ms = MILESTONE_TITLES[s["milestone"]] if not missing else None
        num = gh.create_issue(title, story_body(s), s["labels"], ms)
        if a.stories_only:
            continue
        for i, t in enumerate(s["tasks"], 1):
            tid = f"{s['sid']}.{i}"
            ttitle = f"{tid} — {t['title']}"
            tnum = gh.create_issue(
                ttitle, task_body(s, t, tid, num), task_labels(s), ms)
            gh.ensure_verify_id(tnum, tid)
            if gh.link_subissue(num, tnum):
                linked += 1

    print(f"\n{C['bold']}Summary{C['reset']}", file=sys.stderr)
    print("-" * 60, file=sys.stderr)
    print(f"{C['green']}{gh.created} created{C['reset']} · "
          f"{C['dim']}{gh.skipped} skipped{C['reset']} · "
          f"{C['red']}{gh.failed} failed{C['reset']} · "
          f"{gh.repaired} repaired · "
          f"{linked} sub-issue links", file=sys.stderr)
    if dry:
        print(f"\n{C['yellow']}{C['bold']}Nothing was changed. "
              f"Re-run with --apply.{C['reset']}", file=sys.stderr)
    return 1 if gh.failed else 0


if __name__ == "__main__":
    sys.exit(main())
