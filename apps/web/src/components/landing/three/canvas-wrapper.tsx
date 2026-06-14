'use client'

import { Suspense, ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Preload } from '@react-three/drei'
import { useDeviceCapability } from '@/hooks/use-device-capability'

interface CanvasWrapperProps {
    children: ReactNode
    className?: string
    fallback?: ReactNode
}

export function CanvasWrapper({ children, className, fallback }: CanvasWrapperProps) {
    const capability = useDeviceCapability()

    // Show fallback for low-power devices
    if (capability === 'low') {
        return <>{fallback}</> || null
    }

    return (
        <div className={className}>
            <Canvas
                camera={{ position: [0, 0, 5], fov: 45 }}
                dpr={capability === 'medium' ? [1, 1.5] : [1, 2]}
                gl={{
                    antialias: capability === 'high',
                    alpha: true,
                    powerPreference: 'high-performance',
                }}
                frameloop="demand"
            >
                <Suspense fallback={null}>
                    {children}
                    <Preload all />
                </Suspense>
            </Canvas>
        </div>
    )
}
