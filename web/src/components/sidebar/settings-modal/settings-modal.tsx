'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { env, isTruthy } from '@/lib/env'
import { createLogger } from '@/lib/logs/console/logger'
import { useGeneralStore } from '@/stores/settings/general/store'
import {
  SettingsNavigation
} from "@/components/sidebar/settings-modal/components/settings-navigation/settings-navigation";
import { General } from "@/components/sidebar/settings-modal/components/general/general";
import { Account } from "@/components/sidebar/settings-modal/components/account/account";
import { Privacy } from "@/components/sidebar/settings-modal/components/privacy/privacy";

const logger = createLogger('SettingsModal')

const isBillingEnabled = isTruthy(env.NEXT_PUBLIC_BILLING_ENABLED);

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsSection =
  | 'general'
  | 'account'
  | 'subscription'
  | 'team'
  | 'privacy'

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [isLoading, setIsLoading] = useState(true)
  const loadSettings = useGeneralStore((state) => state.loadSettings)
  const hasLoadedInitialData = useRef(false)
  const hasLoadedGeneral = useRef(false)
  const environmentCloseHandler = useRef<((open: boolean) => void) | null>(null)
  const credentialsCloseHandler = useRef<((open: boolean) => void) | null>(null)

  useEffect(() => {
    async function loadGeneralIfNeeded() {
      if (!open) return
      if (activeSection !== 'general') return
      if (hasLoadedGeneral.current) return
      setIsLoading(true)
      try {
        await loadSettings()
        hasLoadedGeneral.current = true
        hasLoadedInitialData.current = true
      } catch (error) {
        logger.error('Error loading general settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (open) {
      void loadGeneralIfNeeded()
    } else {
      hasLoadedInitialData.current = false
      hasLoadedGeneral.current = false
    }
  }, [open, activeSection, loadSettings])

  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent<{ tab: SettingsSection }>) => {
      setActiveSection(event.detail.tab)
      onOpenChange(true)
    }

    window.addEventListener('open-settings', handleOpenSettings as EventListener)

    return () => {
      window.removeEventListener('open-settings', handleOpenSettings as EventListener)
    }
  }, [onOpenChange])

  // Redirect away from billing tabs if billing is disabled
  useEffect(() => {
    if (!isBillingEnabled && (activeSection === 'subscription' || activeSection === 'team')) {
      setActiveSection('general')
    }
  }, [activeSection])

  const isSubscriptionEnabled = isBillingEnabled

  // Handle dialog close - delegate to environment component if it's active
  const handleDialogOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className='flex h-[70vh] flex-col gap-0 p-0 sm:max-w-[840px]'>
        <DialogHeader className='border-b px-6 py-4'>
          <DialogTitle className='font-medium text-lg'>Settings</DialogTitle>
        </DialogHeader>

        <div className='flex min-h-0 flex-1'>
          {/* Navigation Sidebar */}
          <div className='w-[180px]'>
            <SettingsNavigation
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              hasOrganization={false}
            />
          </div>

          {/* Content Area */}
          <div className='flex-1 overflow-y-auto'>
            {activeSection === 'general' && (
              <div className='h-full'>
                <General />
              </div>
            )}
            {activeSection === 'account' && (
              <div className='h-full'>
                <Account onOpenChange={onOpenChange} />
              </div>
            )}
            {activeSection === 'privacy' && (
              <div className='h-full'>
                <Privacy />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
