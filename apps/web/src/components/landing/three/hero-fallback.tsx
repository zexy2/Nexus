"use client";

export function HeroFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute inset-y-0 right-[-8rem] w-[62%] min-w-[28rem] opacity-80 max-md:right-[-15rem] max-md:w-[40rem] max-md:opacity-50">
        <div className="absolute left-1/2 top-1/2 h-[21rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 -rotate-[16deg] rounded-[50%] border-[4.5rem] border-white/[0.09] [mask-image:linear-gradient(90deg,transparent_2%,black_22%,black_82%,transparent_98%)]">
          <span className="absolute -left-[4.5rem] top-[43%] h-8 w-[4.5rem] bg-white shadow-[0_0_42px_rgba(157,255,122,0.45)]" />
        </div>
      </div>
    </div>
  );
}
