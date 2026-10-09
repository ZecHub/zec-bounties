# Bounty Frontend

This is the frontend interface for the Hackathon bounty management platform.  
It provides a user-friendly UI for authentication, browsing bounties, submitting work, and tracking rewards.

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the development server

```bash
yarn dev
```

## The app will start on:

```
http://localhost:3000
```

## Backend

In development, the frontend calls the backend at `http://localhost:9000` (see `lib/configENV.ts`). Start the backend first by following `../zec-bounties-backend/README.md`, which sets `PORT=9000` in the backend's `.env`.
