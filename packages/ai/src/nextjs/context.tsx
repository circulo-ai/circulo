/**
 * React context and provider for SDK
 */

'use client';

import React, { createContext, ReactNode, useEffect, useState } from 'react';
import { AISDKClient } from '../client';

/**
 * SDK context type
 */
export interface SDKContextType {
    sdk: AISDKClient;
    initialized: boolean;
}

/**
 * SDK context
 */
export const SDKContext = createContext<SDKContextType | null>(null);

/**
 * SDK provider props
 */
export interface SDKProviderProps {
    children: ReactNode;
    config?: {
        storageType?: 'memory' | 'file';
        filePath?: string;
        autoInitialize?: boolean;
    };
}

/**
 * SDK provider component
 */
export function SDKProvider({ children, config = {} }: SDKProviderProps) {
    const [sdk] = useState(() => new AISDKClient(config));
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (config.autoInitialize !== false) {
            sdk.initialize().then(() => {
                setInitialized(true);
            });
        }
    }, [sdk, config.autoInitialize]);

    return (
        <SDKContext.Provider value={{ sdk, initialized }}>
            {children}
        </SDKContext.Provider>
    );
}

/**
 * Agents provider props
 */
export interface AgentsProviderProps {
    children: ReactNode;
    agentIds?: string[];
}

/**
 * Agents provider component (loads specific agents into context)
 */
export function AgentsProvider({ children, agentIds = [] }: AgentsProviderProps) {
    // This could be extended to provide agent-specific context
    return <>{children}</>;
}
