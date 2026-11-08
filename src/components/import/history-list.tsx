"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { undoImport } from "@/app/actions/import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { formatDate, plural } from "@/lib/format";
import type { ImportBatch } from "@/lib/types";

export function HistoryList({ batches, accountNames }: { batches: ImportBatch[]; accountNames: Record<string, string> }) {
  const router = useRouter();
  const [target, setTarget] = useState<ImportBatch | null>(null);
  const [pending, start] = useTransition();

  function undo() {
    if (!target) return;
    start(async () => {
      const res = await undoImport(target.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Importen er angret (${plural(res.removed, "transaksjon", "transaksjoner")} fjernet)`);
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="divide-y divide-line overflow-hidden">
        {batches.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1 basis-60">
              <p className="truncate font-medium">{b.filename}</p>
              <p className="text-sm text-ink-2">
                {accountNames[b.account_id] ?? "Slettet konto"}
                {b.bank_profile ? ` · ${b.bank_profile}` : ""} · importert {formatDate(b.created_at.slice(0, 10))}
              </p>
              {b.date_from && b.date_to && (
                <p className="text-xs text-ink-3">
                  Periode {formatDate(b.date_from)} – {formatDate(b.date_to)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {b.status === "undone" ? (
                <Badge tone="neutral">Angret</Badge>
              ) : (
                <>
                  <Badge tone="pos">{b.imported_count} importert</Badge>
                  {b.duplicate_count > 0 && <Badge>{b.duplicate_count} duplikater</Badge>}
                  {b.skipped_count > 0 && <Badge tone="warn">{b.skipped_count} hoppet over</Badge>}
                </>
              )}
            </div>
            {b.status === "imported" && (
              <Button variant="ghost" size="sm" onClick={() => setTarget(b)}>
                <Undo2 /> Angre
              </Button>
            )}
          </div>
        ))}
      </Card>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title="Angre importen?" description={target ? `Dette fjerner ${plural(target.imported_count, "transaksjon", "transaksjoner")} fra «${target.filename}». Andre data berøres ikke.` : undefined}>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Behold
            </Button>
            <Button variant="destructive" onClick={undo} loading={pending}>
              Angre import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
