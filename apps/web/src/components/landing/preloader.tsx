'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'

const useIsomorphicLayoutEffect =
    typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function Preloader({ onComplete }: { onComplete?: () => void }) {
    const [shouldRender, setShouldRender] = useState(true)
    const overlayRef = useRef<HTMLDivElement>(null)
    const counterRef = useRef<HTMLSpanElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const nexusRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const glowRef = useRef<HTMLDivElement>(null)
    const hasRun = useRef(false)

    useIsomorphicLayoutEffect(() => {
        if (typeof window === 'undefined') return

        const visited = sessionStorage.getItem('nexus-preloader-visited')
        if (visited) {
            setShouldRender(false)
            onComplete?.()
            return
        }

        // Lock scroll
        document.body.style.overflow = 'hidden'
    }, [])

    useEffect(() => {
        if (!shouldRender || hasRun.current) return
        if (
            !overlayRef.current ||
            !counterRef.current ||
            !progressRef.current ||
            !nexusRef.current ||
            !contentRef.current
        )
            return

        hasRun.current = true

        const counter = { value: 0 }
        const tl = gsap.timeline({
            onComplete: () => {
                document.body.style.overflow = ''
                sessionStorage.setItem('nexus-preloader-visited', '1')
                setShouldRender(false)
                onComplete?.()
            },
        })

        // Ambient glow pulse during counter phase
        if (glowRef.current) {
            gsap.to(glowRef.current, {
                opacity: 0.35,
                scale: 1.2,
                duration: 1.2,
                ease: 'sine.inOut',
                yoyo: true,
                repeat: 3,
            })
        }

        // 0.0 - 0.9s: Counter animates 0 -> 100, progress bar fills
        tl.to(
            counter,
            {
                value: 100,
                duration: 0.9,
                ease: 'power2.inOut',
                onUpdate: () => {
                    if (counterRef.current) {
                        counterRef.current.textContent = `${Math.round(counter.value)}%`
                    }
                },
            },
            0
        )

        tl.to(
            progressRef.current,
            {
                scaleX: 1,
                duration: 0.9,
                ease: 'power2.inOut',
            },
            0
        )

        // 0.9s: Counter, progress bar, and glow fade out
        tl.to(
            contentRef.current,
            {
                opacity: 0,
                duration: 0.2,
                ease: 'power2.out',
            },
            0.9
        )

        if (glowRef.current) {
            tl.to(
                glowRef.current,
                {
                    opacity: 0,
                    duration: 0.3,
                    ease: 'power2.out',
                },
                0.9
            )
        }

        // 1.05s: "NEXUS" text - each letter fades up with stagger
        const nexusLetters = nexusRef.current?.querySelectorAll('.nexus-letter')
        tl.set(nexusRef.current, { display: 'flex' }, 1.05)
        if (nexusLetters && nexusLetters.length > 0) {
            tl.fromTo(
                nexusLetters,
                {
                    opacity: 0,
                    y: 30,
                },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.4,
                    stagger: 0.05,
                    ease: 'power3.out',
                },
                1.05
            )
        }

        // 1.45s: Vertical wipe exit (slide up) + NEXUS fade out
        tl.to(
            overlayRef.current,
            {
                clipPath: 'inset(0 0 100% 0)',
                duration: 0.7,
                ease: 'power4.inOut',
            },
            1.45
        )

        tl.to(
            nexusRef.current,
            {
                opacity: 0,
                duration: 0.4,
                ease: 'power2.in',
            },
            1.45
        )

        return () => {
            tl.kill()
        }
    }, [shouldRender, onComplete])

    if (!shouldRender) return null

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50"
            style={{ clipPath: 'inset(0 0 0 0)' }}
            aria-hidden="true"
        >
            {/* Solid black background */}
            <div className="absolute inset-0 bg-black" />

            {/* Grain texture overlay */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    opacity: 0.04,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Counter + progress bar content */}
            <div
                ref={contentRef}
                className="absolute inset-0 flex flex-col items-center justify-center"
            >
                {/* Ambient glow behind counter */}
                <div
                    ref={glowRef}
                    className="absolute pointer-events-none"
                    style={{
                        width: 'clamp(300px, 40vw, 600px)',
                        height: 'clamp(300px, 40vw, 600px)',
                        borderRadius: '50%',
                        background:
                            'radial-gradient(circle, rgba(157,255,122,0.24) 0%, rgba(34,211,238,0.08) 42%, transparent 70%)',
                        opacity: 0.2,
                        filter: 'blur(40px)',
                    }}
                />

                {/* Percentage counter — MASSIVE */}
                <span
                    ref={counterRef}
                    className="block font-mono tabular-nums tracking-tight select-none"
                    style={{
                        fontSize: 'clamp(6rem, 15vw, 12rem)',
                        fontWeight: 200,
                        color: '#fafafa',
                        lineHeight: 1,
                    }}
                >
                    0%
                </span>
            </div>

            {/* Full-width bottom progress bar */}
            <div className="absolute bottom-0 left-0 w-full h-[3px] overflow-hidden">
                <div
                    ref={progressRef}
                    className="w-full h-full origin-left"
                    style={{
                        backgroundColor: '#fafafa',
                        transform: 'scaleX(0)',
                    }}
                />
            </div>

            {/* NEXUS text (hidden initially, shown after counter fades) */}
            <div
                ref={nexusRef}
                className="absolute inset-0 items-center justify-center hidden"
                style={{ opacity: 1 }}
            >
                {'NEXUS'.split('').map((letter, i) => (
                    <span
                        key={i}
                        className="nexus-letter text-white text-2xl md:text-4xl font-extralight uppercase select-none inline-block"
                        style={{
                            letterSpacing: '0.3em',
                            opacity: 0,
                        }}
                    >
                        {letter}
                    </span>
                ))}
            </div>
        </div>
    )
}
