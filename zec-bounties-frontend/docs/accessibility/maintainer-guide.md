# Accessibility Maintainer Guide

## Run the accessibility suite

From zec-bounties-frontend:

    yarn test:a11y

Run keyboard-only regressions:

    yarn playwright test tests/accessibility/keyboard.spec.ts

Run TypeScript validation:

    yarn tsc --noEmit

## Automated WCAG ruleset

The axe checks cover wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22a, and wcag22aa. Critical and serious violations are treated as blocking failures.

## Adding coverage

Public routes should be added to tests/accessibility/wcag.spec.ts. Dialog and form changes should include keyboard regression coverage where relevant.

## Keyboard expectations

Interactive controls must have accessible names. Keyboard focus must remain visible. Dialog focus should remain contained while open and return to the opener after close. Invalid fields should expose aria-invalid and associated error text through aria-describedby. Validation errors should be announced and focus should move to a useful invalid field.

## Fixture safety

Accessibility tests must use synthetic fixtures only. Do not use real Zcash addresses, seed phrases, wallet credentials, production accounts, bounty submissions, or payment data. Fixture emails should use .invalid domains. Backend mutations must be intercepted during accessibility tests.

Reviewer and payment-related tests must stop before any real transaction or payment action.

## CI

The GitHub Actions accessibility workflow installs dependencies and Chromium, runs TypeScript validation, executes the Playwright accessibility suite, and uploads the Playwright report.

## Evidence

Accessibility audit evidence is stored in docs/accessibility/evidence/. The before directory contains issue evidence and the after directory contains passing regression evidence.
