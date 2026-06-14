'use client'

import dynamic from 'next/dynamic'

const DynamicCanvasWrapper = dynamic(
    () => import('./canvas-wrapper').then((mod) => ({ default: mod.CanvasWrapper })),
    { ssr: false }
)

export default DynamicCanvasWrapper
