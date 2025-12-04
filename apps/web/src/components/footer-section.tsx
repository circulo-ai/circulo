import { Phone } from "lucide-react";
import Aurora from "./aurora";
import { Logo } from "./logo";
import { ContactInfoCard } from "./ui/contact-info";
import { PhoneNumber } from "./ui/phone-number";

export function FooterSection() {
  return (
    <footer className="main-section relative flex flex-col" id="contact-us">
      <Aurora
        blend={1}
        speed={0.5}
        colorStops={["#f0fdfa", "#cbfbf1", "#ecfcca", "#022f2e", "#f7fee7"]} // These are from the tailwindColorMap that is being used in the hero section
      />

      {/* needs refactoring, from here */}
      <div className="flex size-full items-center justify-center px-16 pt-4 pb-8">
        <div className="relative grid size-full w-5xl grid-cols-5 grid-rows-1 overflow-hidden rounded-4xl p-2 shadow-[0_0_0_2px_inset,0_64px_64px_0_inset] shadow-teal-50/5 backdrop-blur-2xl backdrop-saturate-200">
          <div className="blur-3xl_ pointer-events-none absolute inset-x-0 top-0 mx-auto h-full bg-radial-[at_top] from-teal-50/15 via-teal-50/5 to-transparent"></div>

          <div className="_shadow-[0_0_0_2px_inset,0_32px_32px_0_inset] _shadow-teal-50/5 relative col-span-2 flex h-full flex-col justify-between gap-4 rounded-3xl bg-teal-50/5 p-8">
            {/* <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[100%] -translate-y-1/2 rounded-full bg-teal-50/10 blur-3xl"></div> */}

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Logo className="h-6" />
                <h1 className="text-2xl text-teal-50">Circulo</h1>
              </div>
              <h2 className="text-lg font-medium">
                Many minds, one evolving dialogue
              </h2>
            </div>
            <ContactInfoCard icon={Phone} title="Call us">
              <PhoneNumber number="+1 (234) 999 888 7" />
              <PhoneNumber number="+1 (987) 111 222 3" />
            </ContactInfoCard>
            <ContactInfoCard icon={Phone} title="Call us">
              <PhoneNumber number="+1 (234) 999 888 7" />
              <PhoneNumber number="+1 (987) 111 222 3" />
            </ContactInfoCard>
            <ContactInfoCard icon={Phone} title="Find us">
              <p>4140 Parker Rd. New York 31134</p>
            </ContactInfoCard>
          </div>
        </div>
      </div>

      <div className="relative mt-auto border-t-2 border-teal-900/5 text-teal-950">
        footre
      </div>
      {/* to here */}
    </footer>
  );
}

// TODO use <article> more
