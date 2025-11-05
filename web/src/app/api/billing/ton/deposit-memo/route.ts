import { db } from '@/db'
import { depositMemos } from '@/db/schema'
import { createLogger } from '@/lib/logs/console/logger'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { env } from "@/lib/env";

const logger = createLogger('DepositMemoAPI')

export async function GET(request: Request) {
    
    const session = await getSession()

    try {
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Fetch existing memo for the user
        let memo = await db
            .select()
            .from(depositMemos)
            .where(eq(depositMemos.userId, session.user.id))
            .limit(1)

        // If no memo exists, create one
        if (!memo || memo.length === 0) {
            const newMemo = `usr_${session.user.id.slice(0, 8)}_${Date.now()}`

            await db.insert(depositMemos).values({
                memo: newMemo,
                userId: session.user.id,
            })

            memo = [{ memo: newMemo, userId: session.user.id, createdAt: new Date() }]
        }

        return NextResponse.json(
            {
                memo: memo[0].memo,
                depositAddress: env.NEXT_PUBLIC_DEPOSIT_ADDRESS,
            },
            { status: 200 }
        )
    } catch (error) {
        logger.error('Deposit memo fetch error', error)
        return NextResponse.json(
            { error: 'Failed to fetch deposit memo' },
            { status: 500 }
        )
    }
}