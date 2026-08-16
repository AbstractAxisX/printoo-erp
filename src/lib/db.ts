import { PrismaClient } from '@prisma/client'

// Versioned cache key — bump when schema changes require a fresh client.
// The dev server keeps the singleton on globalThis across hot reloads,
// so we change the key to force creation of a new client.
// IMPORTANT: After schema changes, always run `bun run db:generate` 
// to regenerate the Prisma Client, then restart the dev server.
const PRISMA_CACHE_KEY = 'prisma_v3'

const globalForPrisma = globalThis as unknown as {
  [key: string]: PrismaClient | undefined
}

export const db =
  globalForPrisma[PRISMA_CACHE_KEY] ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma[PRISMA_CACHE_KEY] = db
