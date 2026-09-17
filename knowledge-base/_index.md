---
type: project
title: ZvenFit technical knowledge base
---

# ZvenFit technical knowledge base

This directory is the version-controlled technical knowledge base for ZvenFit.
It follows the knowledge-routing rules in [AGENTS.md](../AGENTS.md): technical
decisions, architecture, deployment, and runbooks stay in this repository;
curated business context, product goals, project plans, status, and canonical
Product/Project/Repository cards belong in Personal AI Workspace's `vault/`.
Use links between the two sources rather than duplicating their contents.

- Stage, commit, and push it only to the configured Git remote of this project.
- Never store secrets, credentials, personal data, real request payloads, or production customer data here.
- Do not copy this directory into Workspace or synchronize it to Wiki, DataCatalog, another knowledge-base surface, or cross-project memory.
- Treat repository review history as the audit trail for changes to project knowledge.

## Operations

- [Site information architecture and pricing ownership](site-information-architecture.md)
- [Staging deployment and E2E runbook](staging-runbook.md)
- [Production monitoring dashboard](dashboards.md)
- [Alerts, metrics and logs runbook](monitoring-runbook.md)
- [Tracked operational documentation](../docs/monitoring-operations.md)
