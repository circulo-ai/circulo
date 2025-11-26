/**
 * Higher-order components for Next.js
 */

'use client';

import React, { ComponentType } from 'react';
import { SDKProvider, SDKProviderProps } from './context';

/**
 * HOC to wrap a component with SDK provider
 */
export function withSDK<P extends object>(
    Component: ComponentType<P>,
    config?: SDKProviderProps['config']
) {
    return function WithSDKComponent(props: P) {
        return (
            <SDKProvider config={config}>
                <Component {...props} />
            </SDKProvider>
        );
    };
}

/**
 * HOC to wrap a component with agent context
 */
export function withAgent<P extends object>(
    Component: ComponentType<P>,
    agentId: string
) {
    return function WithAgentComponent(props: P) {
        // This could be extended to inject agent data into props
        return <Component {...props} />;
    };
}

/**
 * HOC to require SDK initialization before rendering
 */
export function withSDKInitialized<P extends object>(
    Component: ComponentType<P>,
    LoadingComponent?: ComponentType
) {
    return function WithSDKInitializedComponent(props: P) {
        const [initialized, setInitialized] = React.useState(false);

        React.useEffect(() => {
            // Check if SDK is initialized
            setInitialized(true);
        }, []);

        if (!initialized && LoadingComponent) {
            return <LoadingComponent />;
        }

        if (!initialized) {
            return <div>Loading SDK...</div>;
        }

        return <Component {...props} />;
    };
}
