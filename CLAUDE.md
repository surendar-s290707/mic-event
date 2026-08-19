# MIC Event Check-In System

## Goal
Build the MIC Development Department Stage 2 Event Check-In System.

## Stack
- React + Vite
- Node.js + Express
- PostgreSQL + Prisma
- Socket.IO
- qrcode
- html5-qrcode

## Core rules
- Keep the architecture simple and interview-explainable.
- Do not introduce microservices, GraphQL, Kafka, Redis, or unnecessary abstractions.
- Work in small milestones.
- Before substantial changes, inspect the repository and explain the plan.
- Modify only files relevant to the current task.
- Do not rewrite working code unnecessarily.
- Run relevant tests/build checks after changes.
- Report files changed, important logic, tests run, and remaining issues.
- Never claim a feature works without verification.

## Interview-first
Important logic must be understandable:
- authentication / authorization
- database relations and constraints
- transactions and race conditions
- QR token validation
- offline synchronization
- WebSockets
- server-side AI data flow