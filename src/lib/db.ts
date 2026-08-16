import { PrismaClient } from '@prisma/client'

// Versioned cache key — bump when schema changes require a fresh client
// (the dev server keeps the singleton on globalThis across hot reloads,
// so we change the key to force creation of a new client with the latest
// generated Prisma Client).
const PRISMA_CACHE_KEY = 'prisma_v2'

const globalForPrisma = globalThis as unknown as {
  [key: string]: PrismaClient | undefined
}

export const db =
  globalForPrisma[PRISMA_CACHE_KEY] ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma[PRISMA_CACHE_KEY] = db