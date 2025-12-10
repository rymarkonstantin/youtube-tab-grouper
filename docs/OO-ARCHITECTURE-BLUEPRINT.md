# OO Refactor Blueprint

Goals for the OO refactor and the folder/class structure we will build against. This document is source-of-truth for the refactor branches; keep `main` untouched until the refactor stabilizes.

## Principles
- Separate orchestration (controllers) from domain services and infra gateways.
- Encapsulate mutable state inside repositories or services; avoid module-level globals.
- Message transport and Chrome APIs are wrapped to enable mocking and testing.
- Feature branches stay short-lived; merge into `refactor/oo-architecture` only.

## Target Folder Layout
```
src/
  shared/                # cross-surface primitives
    messaging/           # MessageRouter, MessageClient, envelopes, validators
    domain/              # pure types, value objects, Results
    logging/             # Logger
    utils/               # timing/backoff/helpers

  background/
    infra/               # ChromeApiClient, storage adapters
    services/            # CategoryResolver, MetadataService, ColorAssigner, TabGroupingService, CleanupScheduler
    repositories/        # SettingsRepository, StatsRepository, GroupStateRepository
    controllers/         # BackgroundApp (wires routes/commands/context menus)
    index.ts             # thin entry that bootstraps BackgroundApp

  content/
    infra/               # ContentMessagingBridge (router), DOM hooks
    services/            # MetadataCollector, AutoGroupController
    controllers/         # ContentApp (lifecycle, button wiring)
    views/               # GroupButtonView
    index.ts             # entrypoint wiring ContentApp

  ui/
    popup/
      controllers/       # PopupController
      views/             # PopupView
    options/
      controllers/       # OptionsPageController
      views/             # OptionsPageView
    stats/
      controllers/       # StatsDashboard
      views/             # StatsView helpers
```

## Background Layer Responsibilities
- **BackgroundApp (controller)**: lifecycle (init/start/stop), registers message routes/commands/context menus, owns timers (cleanup scheduler), injects services.
- **MessageRouter (shared)**: validates envelopes, routes actions to handlers, stamps metadata.
- **SettingsRepository**: cached access to `chrome.storage.sync`; enforces defaults and versioning.
- **StatsRepository**: cached access to `chrome.storage.local`; handles migrations/resets.
- **GroupStateRepository**: persists color/id maps; hides raw storage shape.
- **ChromeApiClient**: safe wrappers around tabs/tabGroups APIs with normalized errors.
- **CategoryResolver**: strategies (channel map -> override -> keyword -> YouTube category -> fallback).
- **MetadataService**: pulls metadata from content via MessageClient with retry/backoff; merges fallbacks.
- **ColorAssigner**: mutexed color selection per category, neighbor color inspection.
- **TabGroupingService**: orchestrates grouping (color assignment + Chrome API + state persistence + stats increment).
- **CleanupScheduler**: tracks empty groups with grace period; listens to tabGroups events.

## Content Layer Responsibilities
- **ContentApp (controller)**: loads settings, renders button, owns auto-group lifecycle, registers message handlers.
- **ContentMessagingBridge**: router that responds to GET_VIDEO_METADATA with normalized payload.
- **MetadataCollector**: DOM/JSON-LD/ytInitialData parsing; normalization.
- **AutoGroupController**: schedules/cancels auto-group timers; guards duplicate submissions.
- **GroupButtonView**: render/update/remove the floating button; delegates to controller callbacks.
- **MessageClient (shared)**: used for outbound requests to background.

## UI Layer Responsibilities
- **PopupController**: handles button actions, validation, and messaging; delegates rendering to PopupView.
- **OptionsPageController**: loads/saves settings through SettingsRepository; manages view models for colors/keywords/mappings.
- **StatsDashboard**: reads stats via StatsRepository; prepares chart view model.
- **Views (per page)**: DOM rendering/binding only; no business logic.

## Messaging Flow (proposed)
```
ContentApp --MessageClient--> BackgroundApp router --TabGroupingService--> ChromeApiClient
BackgroundApp --MessageClient--> ContentMessagingBridge (fetch metadata)
Popup/Options/Stats --MessageClient--> BackgroundApp router
```

## Migration Notes
- Keep current procedural modules in place until each new class is landed and switched over behind the integration branch.
- Prefer replacing modules slice-by-slice (e.g., introduce MessageRouter, then switch background index to it) to avoid large-bang merges.
- Tests accompany each new service/controller to lock behavior before swapping call sites.

## Branching Policy (for this refactor)
- Integration branch: `refactor/oo-architecture`.
- Feature branches: `feature/<area-summary>` (e.g., `feature/message-router`, `feature/content-app`).
- Merge feature branches into the integration branch only after lint/typecheck/smoke pass.
