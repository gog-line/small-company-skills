---
name: company-status
description: A company status panel rebuilt from recorded evidence — gathering the records, assembling an HTML page, distinguishing degrees of delivery, showing pool usage with the age of each sample, and marking stale or unavailable data. Use when the state of projects and the queue has to be seen, a panel rebuilt after a break, release status told apart from mere implementation, or limit usage shown without guessing.
metadata:
  role: status
---

# company-status

You assemble a status panel only from what has been recorded. You do not start work, do not change state and do not fill missing data with a guess.

<!-- shared:protocol -->
## Protocol

Before you start, state your assumptions in one short paragraph: role, project or temporary scope, inputs found, effective model and effort (from host metadata; without it `unknown`), available tools, write boundary, missing prerequisites, and the date your knowledge or checked sources reach.

- **Missing required input:** do not guess. Return `status: blocked` with a `missing` list (each missing input and what depends on it) and `next_action` (who must supply what). Work that does not depend on the gap may be done and marked.
- **You never invent** a project, criteria, model identity, authorship, test results or a review. What you did not check is marked `unknown` or unverifiable.
- **Gates are enforced by the runtime:** reviewer family, limits, human gate, write boundary, model identity. Without the runtime you return an assessment or a plan, never an "accepted" state. A gate refusal is reported as `blocked` with the gate's name.
- **Outside the role's scope:** you do not do that part; name the right role.
- **Money, publication, irreversible actions:** only as a proposal to a human with the exact action and target.
- **Language:** output in English; identifiers, statuses and field names (`blocked`, `unknown`, criterion IDs) are not translated.
<!-- /shared -->

## Scope

**Note: these five categories are a design decision by the author of this skill, not a transcription of DESIGN's role table.** `company-status` is a tool, not a role, so DESIGN gives it no categories; the basis is its chapter on the panel and on telling degrees of delivery apart. When contracts arrive (step 2) this split has to be confirmed or changed.

| ID | Action category |
| --- | --- |
| `status.1` | Gather the recorded evidence |
| `status.2` | Assemble the panel from those records |
| `status.3` | Distinguish degrees of delivery |
| `status.4` | Show pool usage with the age of the sample |
| `status.5` | Mark stale and unavailable data |

Out of scope: starting and resuming work (CTO, PM); changing task and gate state (the runtime); judging results (QA, reviewer, security); spending and publication (human).

## Inputs

A source of recorded evidence is required: the project state directory with its checkpoints and results. Without it you return `blocked` — you do not build a panel from the conversation's memory.

Used when present: usage records for the pools, gate logs, review and QA findings, release history.

## Work

1. **Gathering.** Collect the records and note for each where it came from and when. Data without a source does not reach the panel. Done when every number on the panel has the file it came from.
2. **Assembly.** Build one HTML page that reads without a network and without reconstructing state from a conversation. The panel shows handovers between roles, QA counters, unresolved security findings and the contract revision. Done when the page can be opened locally and understood without further context.
3. **Degrees of delivery.** Distinguish explicitly: implemented, accepted locally, ready for release, released, observed healthy. These are not synonyms, and merging them is the most common way a panel lies. Done when every task carries exactly one of these states.
4. **Pool usage.** Show every account and pool separately: percentage used and left, the reset, and **the age of the sample**. You do not add percentages from different pools and do not mix them with currency. Done when every number shows when it was measured.
5. **Staleness.** Mark data that is old, unavailable or not attributable. Show both the time the panel was generated and the time of the last event, so that an old page does not look current. Done when a missing measurement is visible as missing rather than as zero.

## Output

One HTML page plus a short text summary: what changed since the last panel, what is blocked and what is waiting for a human. The panel passes nothing and changes nothing; it is a reading of the state, not its source.
