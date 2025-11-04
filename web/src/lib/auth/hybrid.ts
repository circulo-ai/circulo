import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { verifyInternalToken } from '@/lib/auth/internal'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('HybridAuth')

export interface AuthResult {
  success: boolean
  userId?: string
  authType?: 'session' | 'api_key' | 'internal_jwt'
  error?: string
}

/**
 * Check for authentication using any of the 3 supported methods:
 * 1. Session authentication (cookies)
 * 2. Internal JWT authentication (Authorization: Bearer header)
 *
 * For internal JWT calls, requires workflowId to determine user context
 */
export async function checkHybridAuth(
  request: NextRequest,
  options: { requireWorkflowId?: boolean } = {}
): Promise<AuthResult> {
  try {
    // 1. Check for internal JWT token first
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]
      const isInternalCall = await verifyInternalToken(token)

      if (isInternalCall) {
        // Internal call without context - still valid for some routes
        return {
          success: true,
          authType: 'internal_jwt',
        }
      }
    }

    // 2. Try session auth (for web UI)
    const session = await getSession()
    if (session?.user?.id) {
      return {
        success: true,
        userId: session.user.id,
        authType: 'session',
      }
    }

    // No authentication found
    return {
      success: false,
      error: 'Authentication required - provide session, API key, or internal JWT',
    }
  } catch (error) {
    logger.error('Error in hybrid authentication:', error)
    return {
      success: false,
      error: 'Authentication error',
    }
  }
}