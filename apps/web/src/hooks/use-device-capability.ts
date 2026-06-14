'use client'

import { useState, useEffect } from 'react'
import { getGPUTier } from 'detect-gpu'

export type DeviceCapability = 'low' | 'medium' | 'high'

let cachedCapability: DeviceCapability | null = null

function isMobile(): boolean {
    if (typeof navigator === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    )
}

async function detectCapability(): Promise<DeviceCapability> {
    if (cachedCapability) return cachedCapability

    try {
        const gpuTier = await getGPUTier()
        const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 2 : 8

        // Low: hardwareConcurrency < 4 OR GPU tier <= 1 OR mobile
        if (cores < 4 || gpuTier.tier <= 1 || isMobile()) {
            cachedCapability = 'low'
            return 'low'
        }

        // High: hardwareConcurrency >= 8 AND GPU tier >= 3
        if (cores >= 8 && gpuTier.tier >= 3) {
            cachedCapability = 'high'
            return 'high'
        }

        // Medium: everything else (hardwareConcurrency 4-7 OR GPU tier 2)
        cachedCapability = 'medium'
        return 'medium'
    } catch {
        // If detection fails, default to medium
        cachedCapability = 'medium'
        return 'medium'
    }
}

/**
 * Hook that detects device GPU/CPU capability and returns a tier.
 * Results are cached so detection only runs once.
 * Returns 'high' on server (SSR default), re-evaluates on client.
 */
export function useDeviceCapability(): DeviceCapability {
    const [capability, setCapability] = useState<DeviceCapability>(
        cachedCapability ?? 'high'
    )

    useEffect(() => {
        let cancelled = false
        detectCapability().then((result) => {
            if (!cancelled) {
                setCapability(result)
            }
        })

        return () => {
            cancelled = true
        }
    }, [])

    return capability
}
