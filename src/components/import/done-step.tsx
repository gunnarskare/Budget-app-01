"use client";

import { CheckCircle2, ClipboardCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { undoImport } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { CommitResult } from "@/lib/import/types";
import { plural } from "@/lib/format";

export function DoneStep({ result, onAnother, onUndone, onFinish, finishLabel }: { result: CommitResult; onAnother: () => void; onUndone: () => void; onFinish?: () => void; finishLabel?: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  function undo() {
    start(async () => {
      const res = await undoImport(result.batchId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Importen er angret (${plural(res.removed, "transaksjon", "transaksjoner")} fjernet)`);
      setConfirm(false);
      onUndone();
    });
  }

  return (
    <div className="mx-auto max-w-xl animate-fade-up py-4 text-center">
      <span aria-hidden="true" className="mx-auto grid size-20 animate-pop place-items-center rounded-full bg-pos-soft text-pos">
        <CheckCircle2 className="size-10" />
      </span>
      <h2 className="mt-5 font-display text-3xl font-bold">Ferdig importert!</h2>
      <p className="mt-2 text-ink-2">Oversikt, budsjett og rapporter er oppdatert.</p>

      <Card className="mt-8 grid grid-cols-3 divide-x divide-line p-0 text-center">
        {[
          { v: result.imported, l: "importert" },
          { v: result.duplicates, l: "duplikater hoppet over" },
          { v: result.needsReview, l: "venter godkjenning" },
        ].map((s) => (
          <div key={s.l} className="px-3 py-5">
            <p className="num-display text-3xl">{s.v.toLocaleString("nb-NO")}</p>
            <p className="mt-1 text-xs text-ink-2">{s.l}</p>
          </div>
        ))}
      </Card>

      <div className="mt-8 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        {onFinish ? (
          <Button size="lg" onClick={onFinish}>
            {finishLabel ?? "Fortsett"}
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link href="/oversikt">Se oversikten</Link>
          </Button>
        )}
        {result.needsReview > 0 && (
          <Button asChild variant="soft" size="lg">
            <Link href="/transaksjoner?visning=godkjenning">
              <ClipboardCheck /> Godkjenn {result.needsReview}
            </Link>
          </Button>
        )}
      </div>
      <div className="mt-6 flex justify-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={onAnother}>
          Importer en fil til
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
          <Undo2 /> Angre import
        </Button>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title="Angre importen?" description={`Dette fjerner de ${plural(result.imported, "transaksjonene", "transaksjonene")} som ble importert fra denne filen. Andre data berøres ikke.`}>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Behold
            </Button>
            <Button variant="destructive" onClick={undo} loading={pending}>
              Angre import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
