# MIC Event Check-In System Specification

## Objective

Build a web-based event check-in system for the MIC Development Department Stage 2 recruitment task.

## Roles

- Organizer
- Attendee

## Core flow

Organizer creates event
→ Attendee registers
→ Attendee receives unique QR
→ Organizer scans QR
→ Backend validates
→ Check-in recorded
→ Organizer dashboard updates

## Required features

- Event creation
- Attendee registration
- Unique QR per registration
- Camera-based scanning on phone/laptop
- Live check-in dashboard
- Role-based access control
- CSV export

## Hard requirements

1. Prevent duplicate check-ins.
2. Enforce event capacity correctly under concurrent requests.
3. Meaningfully prevent QR screenshot/sharing abuse.
4. Offline-first scanning with later synchronization.
5. AI-powered natural-language event insights.
6. AI must use real backend-computed data.
7. AI API key must remain server-side.
8. Loading and failure fallbacks.
9. 100+ concurrent-request proof/test.

## Out of scope for the first implementation

- Native mobile application
- Microservices
- Advanced infrastructure
- Fancy animations
- Nonessential features