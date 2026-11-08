import { CalendarCheck, Lock, Sparkles, UploadCloud } from "lucide-react";
import { Logo } from "@/components/logo";

const points = [
  { icon: UploadCloud, title: "Importer fra banken", text: "Dra inn CSV fra DNB, Nordea, SpareBank 1 og flere." },
  { icon: Sparkles, title: "Kategoriserer selv", text: "Lærer av valgene dine – du godkjenner bare det som er uklart." },
  { icon: CalendarCheck, title: "Se måneden i forkant", text: "Budsjett og prognose viser hva du har igjen før måneden er over." },
  { icon: Lock, title: "Ingen bankinnlogging", text: "Vi ber aldri om BankID eller passord. Dine data er dine." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#5b3fd1_0%,#3b2699_55%,#2a1a73_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-[#ff9d6c]/20 blur-3xl" />
        <Logo className="relative [&_span:last-child]:text-white" />
        <div className="relative max-w-md">
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.08] tracking-tight">Forstå økonomien din på under ett minutt.</h1>
          <p className="mt-4 text-lg text-white/75">Enkel oversikt, smarte innsikter og full kontroll – uten regneark.</p>
          <ul className="mt-10 space-y-5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/50">Et første utkast – bygget for norske husholdninger.</p>
      </aside>
      <main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[26rem]">
          <Logo className="mb-10 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
