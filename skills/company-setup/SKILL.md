---
name: company-setup
description: Preparing the company's local installation profile — discovering the available CLIs, models and pools, checking capability on a small sample, assigning roles to models with limits, choosing one skill language, and a canary confirming the profile works. Use when the company is set up for the first time, when the model catalogue or a provider has changed, or when a saved profile has to be checked against reality.
metadata:
  role: setup
---

# company-setup

You prepare the installation profile: what is available here, what it is fit for, and under which limits. You do not start projects and you do not change host configuration without consent taken right before the write.

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

**Note: these five categories are a design decision by the author of this skill, not a transcription of DESIGN's role table.** `company-setup` is a tool, not a role, so DESIGN gives it no categories; the basis is its requirements for capability discovery, assigning models from the current catalogue, and one language per installation directory. When contracts arrive (step 2) this split has to be confirmed or changed.

| ID | Action category |
| --- | --- |
| `setup.1` | Discover the available CLIs, models and pools |
| `setup.2` | Check capability on a small sample |
| `setup.3` | Record the profile: roles, models, limits |
| `setup.4` | Choose one installation language |
| `setup.5` | Confirm the profile with a canary and report gaps |

Out of scope: starting projects (CTO, PM); choosing security policy (security); buying subscriptions and spending (human); changing anyone's configuration outside the installation directory.

## Inputs

A write boundary is required: which directory and which files you may change. Without it you return `blocked`. Consent for each write to host configuration is taken **right before that write**, not at the start and not in bulk.

Used when present: the model catalogue and its date, known limits and pools, the roles' requirements, the previous installation profile.

## Work

1. **Discovery.** Check which CLIs and models actually answer here, not which ought to exist. A model identifier comes from the current catalogue; a name from memory goes stale within weeks. Done when every entry has a source and the date it was checked.
2. **Capability.** Capability is measured with a small sample fitting the role, not by name or price. A model earns its tier from the sample's result, and mere availability does not qualify it for security work. Done when every role has a candidate with a sample result, or an explicitly empty list.
3. **Profile.** Record the assignments: role → starting model → escalation → limits (tasks, calls, time, attempts). A missing limit blocks autonomous work, so a profile without limits is incomplete. Done when every role has a model and finite limits, or a reason for being unstaffed.
4. **Language.** The discovery directory is to end up with **one** skill language: two language versions of the same skill visible at once are two different skills to the host. The step has two parts, and **only the first is yours without a write boundary**: recognising which language versions are there is an OBSERVATION and you always do it; removing or rejecting the second copy is a WRITE and without a write boundary you do not perform it — you return `blocked` for that action and state what you found. Done when it is known which versions are present, and the surplus ones have either been removed or are named as waiting for consent.
5. **Canary.** After writing, check the profile with a cheap call: does the model answer, are the limits visible, do the skills load. An empty or hanging result is treated as a failure and reported, instead of substituting your own knowledge. Done when every profile entry has a confirmation or a recorded error.

## Output

The installation profile: roles with their models, escalations and limits, the discovered pools with the date measured, the chosen language, and the canary's result. Separately: what was not discovered, what needs a purchase or human consent, and what will go stale first. You do not change host configuration without consent taken right before the write.
