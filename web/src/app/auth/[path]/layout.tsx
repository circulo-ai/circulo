"use client"

import { Logo } from '@/components/logo';
import React, { useState, useEffect } from 'react';

const agents = [
  {
    id: 1,
    image: "https://media.gettyimages.com/id/98328574/fr/photo/cupertino-ca-apple-ceo-steve-jobs-speaks-during-an-apple-special-event-april-8-2010-in.jpg?s=612x612&w=gi&k=20&c=9lYYx61PN5clx4Wk-_fg_xWTjYDIvmwE60_Chv3LaNo=",
    name: "Steve Jobs",
    role: "Innovation",
    initials: "SJ",
    color: "from-slate-500 to-slate-700",
    angle: 0,
    message: "Think different. What's the user experience?"
  },
  {
    id: 2,
    image: "https://media.gettyimages.com/id/2151909132/fr/photo/berlin-germany-philanthropist-and-former-microsoft-ceo-bill-gates-speaks-in-a-panel.jpg?s=612x612&w=gi&k=20&c=fCuKD2Qyt9pC9Q-SqQhNmEjXKH4UU1vUXkCvGPWhP44=",
    name: "Bill Gates",
    role: "Strategy",
    initials: "BG",
    color: "from-emerald-500 to-teal-600",
    angle: 45,
    message: "Let's analyze the market data first."
  },
  {
    id: 3,
    image: "https://media.gettyimages.com/id/2217854935/fr/photo/washington-dc-tesla-ceo-elon-musk-speaks-alongside-u-s-president-donald-trump-to-reporters-in.jpg?s=612x612&w=gi&k=20&c=SOVOHveMze59moe-i90WDHYwBJM_e6jnnQbvVRTXSNg=",
    name: "Elon Musk",
    role: "Disruption",
    initials: "EM",
    color: "from-orange-500 to-rose-600",
    angle: 90,
    message: "Why not make it 10x better?"
  },
  {
    id: 4,
    image: "https://media.gettyimages.com/id/2173579322/fr/photo/mark-zuckerberg-chief-executive-officer-of-meta-platforms-inc-wears-orion-augmented-reality.jpg?s=612x612&w=gi&k=20&c=q6X4yAUd0-ZoB8e07W-WJ3GC3tOBAdYFTBUdrSe3x-M=",
    name: "Mark Zuckerberg",
    role: "Growth",
    initials: "MZ",
    color: "from-blue-500 to-indigo-600",
    angle: 135,
    message: "How do we scale this globally?"
  },
  {
    id: 5,
    image: "https://media.gettyimages.com/id/893197718/fr/photo/washington-dc-warren-buffet-arrives-at-the-post-washington-dc-premiere-at-the-newseum-on.jpg?s=612x612&w=gi&k=20&c=FZBdO4CmccbqtHSTlw9ZXouydc0BOuFzNCBEBPsxoek=",
    name: "Warren Buffett",
    role: "Finance",
    initials: "WB",
    color: "from-amber-500 to-orange-600",
    angle: 180,
    message: "What's the long-term value proposition?"
  },
  {
    id: 6,
    image: "https://media.gettyimages.com/id/1166543579/fr/photo/beverly-hills-california-oprah-winfrey-at-the-david-makes-man-press-conference-at-the-four.jpg?s=612x612&w=gi&k=20&c=0u5OneFStoX0UMgiib0wG1ainZ7qyoNBJ0zt-YoVQ4w=",
    name: "Oprah Winfrey",
    role: "Brand",
    initials: "OW",
    color: "from-pink-500 to-rose-600",
    angle: 225,
    message: "How does this inspire people?"
  },
  {
    id: 7,
    image: "https://media.gettyimages.com/id/1341554748/fr/photo/new-york-new-york-amazon-founder-jeff-bezos-arrives-for-his-meeting-with-british-prime.jpg?s=612x612&w=gi&k=20&c=blkkexX6BWmvFNcZV6c5NkV-87RqcWi6d8JPfoIi3Tg=",
    name: "Jeff Bezos",
    role: "Scale",
    initials: "JB",
    color: "from-cyan-500 to-blue-600",
    angle: 270,
    message: "Can we make it more customer-obsessed?"
  },
  {
    id: 8,
    image: "https://media.gettyimages.com/id/163611671/fr/photo/palo-alto-ca-facebook-s-vice-president-for-global-online-sales-and-operations-sheryl-sandberg.jpg?s=612x612&w=gi&k=20&c=JWlZI0qka1j617-mdCtHGDq8tLXla6yIKIDHw3iHP1o=",
    name: "Sheryl Sandberg",
    role: "Leadership",
    initials: "SS",
    color: "from-violet-500 to-purple-600",
    angle: 315,
    message: "Let's empower the team to execute."
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [activeAgent, setActiveAgent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAgent((prev) => (prev + 1) % agents.length);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left Panel - Auth Form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2">
            <Logo />
            <h1 className="text-4xl">Circulo</h1>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Right Panel - Minimalist Showcase */}
      <div className="relative hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 lg:flex flex-col items-center justify-center p-12 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.1) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}/>
        </div>

        {/* Main Content */}
        <div className="relative z-10 w-full max-w-2xl space-y-12">

          {/* Headline */}
          <div className="text-center space-y-6">
            <h2 className="text-3xl font-bold text-white leading-tight">
              A new era of
              <br/>
              <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                AI collaboration
              </span>
            </h2>

            <p className="text-md text-slate-400 max-w-xl mx-auto leading-relaxed">
              Bring legendary minds to your table. Steve Jobs for innovation, Bill Gates for strategy, Elon Musk for disruption—all collaborating to help you succeed.
            </p>
          </div>

          {/* Circular Roundtable */}
          <div className="relative flex items-center justify-center">
            <div className="relative w-[400px] h-[400px]">

              {/* Center Table */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="relative">
                  {/* Glow effect */}
                  <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full scale-150"/>

                  {/* Table surface */}
                  <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/30 shadow-2xl flex items-center justify-center">
                    <Logo className="w-10 h-10 text-cyan-400/80" />
                  </div>
                </div>
              </div>

              {/* Circular ring */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-slate-700/20"/>

              {/* Agents positioned in circle */}
              {agents.map((agent, index) => {
                const angleRad = (agent.angle * Math.PI) / 180;
                const orbitRadius = 200;
                const x = Math.cos(angleRad) * orbitRadius;
                const y = Math.sin(angleRad) * orbitRadius;
                const isActive = index === activeAgent;

                return (
                  <div
                    key={agent.id}
                    className="absolute group cursor-pointer"
                    style={{
                      left: '50%',
                      top: '50%',
                      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                    }}
                  >
                    {/* Connection line to center - shows when active */}
                    <svg
                      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-500 ${
                        isActive ? 'opacity-20' : 'opacity-0 group-hover:opacity-10'
                      }`}
                      width="400"
                      height="400"
                      style={{ overflow: 'visible' }}
                    >
                      <line
                        x1="200"
                        y1="200"
                        x2={200 - x}
                        y2={200 - y}
                        stroke="currentColor"
                        strokeWidth="1"
                        className="text-cyan-400"
                      />
                    </svg>

                    {/* Message bubble - appears above active agent */}
                    {isActive && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-500"
                        style={{
                          bottom: '70px',
                          width: '180px'
                        }}
                      >
                        <div className="relative bg-white rounded-xl px-3 py-2.5 shadow-2xl">
                          <div className="text-[11px] text-slate-800 font-medium leading-snug">
                            {agent.message}
                          </div>
                          {/* Speech bubble tail */}
                          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-white rotate-45"/>
                        </div>
                      </div>
                    )}

                    {/* Agent avatar */}
                    <div className="relative">
                      <div className={`absolute inset-0 bg-gradient-to-br ${agent.color} blur-2xl transition-all duration-500 rounded-full scale-150 ${
                        isActive ? 'opacity-40' : 'opacity-0 group-hover:opacity-30'
                      }`}/>

                      <div className={`relative w-14 h-14 rounded-full border-2 shadow-xl transition-all duration-500 flex items-center justify-center overflow-hidden bg-slate-900 ${
    isActive
      ? 'scale-125 border-cyan-400/50 ring-4 ring-cyan-400/20'
      : 'border-slate-800 group-hover:scale-110 group-hover:border-cyan-400/30'
}`}>
    {/* Renders the Image */}
    <img
        src={agent.image}
        alt={agent.name}
        // Use object-cover to ensure the image fills the circle without distortion
        className="w-full h-full object-cover"
    />
</div>

                      {/* Online indicator */}
                      <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-900 transition-all ${
                        isActive ? 'animate-ping' : 'animate-pulse'
                      }`}/>
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-900"/>
                    </div>

                    {/* Tooltip on hover */}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-slate-800/95 backdrop-blur-sm border border-slate-700/50 rounded-lg px-3 py-2 whitespace-nowrap shadow-xl">
                        <div className="text-xs font-semibold text-white">{agent.name}</div>
                        <div className="text-xs text-cyan-400">{agent.role}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom tagline */}
          <div className="text-center">
            <p className="text-sm text-slate-500">
              Multiple AI agents. One table. Infinite possibilities.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
